create function credit_invoice_held(i uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select false$$;
create function credit_post_entry(a uuid,kind text,amount int,description text,t uuid default null,person uuid default null,bill uuid default null,gamepay uuid default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare account venue_credit_accounts;invoice uuid;cut date;me uuid:=community_chat_me();begin
 select * into account from venue_credit_accounts where id=a for update;
 if account.id is null or not account.enabled or (account.player_id<>me and not venue_can(account.establishment_id,'cash')) then raise exception 'FATURA: Cliente não autorizado.';end if;
 if amount is null or amount<=0 or credit_account_balance(a)+amount>account.limit_cents or credit_due_overdue(a) then raise exception 'FATURA: Limite insuficiente ou fatura vencida. Pague na hora.';end if;
 cut:=credit_cut_date(account.cut_day,(now() at time zone 'America/Sao_Paulo')::date);
 insert into venue_credit_invoices(account_id,cut_date) values(a,cut) on conflict(account_id,cut_date) do update set cut_date=excluded.cut_date returning id into invoice;
 if credit_invoice_held(invoice) then raise exception 'FATURA: Há Pix em preparação ou reconciliação nesta fatura. Verifique primeiro.';end if;
 insert into venue_credit_lines(invoice_id,kind,tab_id,participant_id,academy_bill_id,game_payment_id,description,amount_cents,accepted_by,acceptance)
 values(invoice,kind,t,person,bill,gamepay,description,amount,me,case when me=account.player_id then 'app' else 'counter' end);
 insert into venue_notices(player_id,establishment_id,title,body) values(account.player_id,account.establishment_id,'Lançamento na fatura',description||'. Consulte valor e vencimento no seu extrato.');return invoice;
end$$;
create function credit_tab_parts(t uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'player_id',p.player_id,'name',p.name,
 'consumed_cents',coalesce((select sum(s.amount_cents) from order_item_shares s join service_order_items i on i.id=s.item_id join service_orders o on o.id=i.order_id where s.participant_id=p.id and o.tab_id=t and o.status<>'cancelled' and i.status<>'cancelled'),0),
 'remaining_cents',greatest(0,coalesce((select sum(s.amount_cents) from order_item_shares s join service_order_items i on i.id=s.item_id join service_orders o on o.id=i.order_id where s.participant_id=p.id and o.tab_id=t and o.status<>'cancelled' and i.status<>'cancelled'),0)-
 coalesce((select sum(x.amount_cents) from sale_payment_allocations x join sale_payments pay on pay.id=x.payment_id join order_item_shares s on s.id=x.item_share_id where pay.tab_id=t and s.participant_id=p.id and pay.reversed_at is null),0)-
 coalesce((select sum(l.amount_cents) from venue_credit_lines l where l.tab_id=t and l.participant_id=p.id),0)),
 'invoice_id',(select invoice_id from venue_credit_lines where tab_id=t and participant_id=p.id)
 ) order by p.name,p.id),'[]'::jsonb) from tab_participants p where tab_id=t
$$;
alter function credit_snapshot(uuid,uuid,text) rename to credit_snapshot_v1;
revoke all on function credit_snapshot_v1(uuid,uuid,text) from public,anon,authenticated;
create function credit_snapshot(p_venue uuid default null,p_tab uuid default null,p_mode text default 'statement') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();t service_tabs;gross bigint;paid bigint;transferred bigint;parttotal bigint;allocated bigint;allparts jsonb;staff boolean;result jsonb;begin
 if me is null then raise exception 'FATURA: Entre na sua conta.';end if;
 if p_mode<>'tab' then return credit_snapshot_v1(p_venue,p_tab,p_mode);end if;
 select * into t from service_tabs where id=p_tab;if not credit_tab_read(p_tab) then raise exception 'FATURA: Sem acesso à comanda.';end if;staff:=venue_can(t.establishment_id,'cash');
 select coalesce(round(sum(i.quantity*i.unit_price)*100),0) into gross from service_order_items i join service_orders o on o.id=i.order_id where o.tab_id=p_tab and i.status<>'cancelled' and o.status<>'cancelled';
 select coalesce(round(sum(amount)*100),0) into paid from sale_payments where tab_id=p_tab and reversed_at is null;
 select coalesce(sum(amount_cents),0) into transferred from venue_credit_lines where tab_id=p_tab;
 allparts:=credit_tab_parts(p_tab);
 select coalesce(sum((x->>'consumed_cents')::bigint),0) into parttotal from jsonb_array_elements(allparts)x;
 select coalesce(sum(x.amount_cents),0) into allocated from sale_payment_allocations x join sale_payments p on p.id=x.payment_id where p.tab_id=p_tab and p.reversed_at is null;
 result:=jsonb_build_object('me',me,'venue_id',t.establishment_id,'can_record',staff,'tab_id',p_tab,'gross_cents',gross,'paid_cents',paid,'balance_cents',greatest(0,gross-paid-transferred),'transferred_cents',transferred,'has_transfers',transferred>0,
 'can_bill',t.status in('open','awaiting_payment','partially_paid'),'split_ready',parttotal=gross and allocated=paid,
 'payment_started',exists(select 1 from sale_payment_intents where tab_id=p_tab),
 'parts',coalesce((select jsonb_agg(x) from jsonb_array_elements(allparts)x where staff or (x->>'player_id')::uuid=me),'[]'::jsonb),
 'billed',(select to_jsonb(l)||jsonb_build_object('cut_date',i.cut_date,'due_date',i.due_date,'customer_name',p.name,'invoice_balance_cents',credit_balance(i.id)) from venue_credit_lines l join venue_credit_invoices i on i.id=l.invoice_id join venue_credit_accounts a on a.id=i.account_id join players p on p.id=a.player_id where l.tab_id=p_tab and l.participant_id is null),
 'accounts',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('name',p.name,'balance_cents',credit_account_balance(a.id),'overdue',credit_due_overdue(a.id))) from venue_credit_accounts a join players p on p.id=a.player_id where a.establishment_id=t.establishment_id and a.enabled and (a.player_id=me or staff)),'[]'::jsonb));return result;
end$$;
alter function credit_action(text,jsonb) rename to credit_action_v2;
revoke all on function credit_action_v2(text,jsonb) from public,anon,authenticated;
create function credit_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();nonce uuid;r venue_credit_requests;a venue_credit_accounts;t service_tabs;pt tab_participants;b academy_bills;g games;gp payments;terms venue_credit_game_terms;
 result jsonb;v uuid;invoice uuid;amount bigint;ctx jsonb;part jsonb;payment uuid;allocation record;cut date;roster uuid[];cost int;idx int;begin
 if me is null or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>16384 then raise exception 'FATURA: Entre na conta e informe dados válidos.';end if;
 nonce:=(p_data->>'requestId')::uuid;if nonce is null then raise exception 'FATURA: Identificador obrigatório.';end if;
 perform pg_advisory_xact_lock(hashtext(nonce::text));select * into r from venue_credit_requests where id=nonce;
 if r.id is not null then if r.actor<>me or r.action<>p_action or r.request_data<>p_data then raise exception 'FATURA: Identificador já utilizado.';end if;return r.result;end if;
 if p_action in('post_part','pay_part','post_class','post_game') then
  if (p_data->>'consent')::boolean is distinct from true then raise exception 'FATURA: Confirme o valor e sua autorização.';end if;
  if p_action<>'pay_part' then select * into a from venue_credit_accounts where id=(p_data->>'accountId')::uuid for update;v:=a.establishment_id;
   if a.id is null or (a.player_id<>me and not venue_can(v,'cash')) then raise exception 'FATURA: Cliente não autorizado.';end if;
  end if;
  if p_action in('post_part','pay_part') then
   select * into t from service_tabs where id=(p_data->>'tabId')::uuid for update;
   if t.id is null or not credit_tab_read(t.id) or t.status not in('open','awaiting_payment','partially_paid') or exists(select 1 from venue_credit_lines where tab_id=t.id and participant_id is null) then raise exception 'FATURA: Comanda indisponível.';end if;
   if exists(select 1 from sale_payment_intents where tab_id=t.id) then raise exception 'FATURA: Resolva o pagamento online iniciado antes de separar a comanda.';end if;
   select * into pt from tab_participants where id=(p_data->>'participantId')::uuid and tab_id=t.id;
   ctx:=credit_snapshot(null,t.id,'tab');if not (ctx->>'split_ready')::boolean then raise exception 'FATURA: Distribua todos os itens e os pagamentos entre as pessoas antes de faturar por pessoa.';end if;
   if p_action='post_part' and (t.establishment_id<>v or pt.player_id is distinct from a.player_id) then raise exception 'FATURA: A parte precisa pertencer ao cliente autorizado.';end if;
   v:=t.establishment_id;part:=(select x from jsonb_array_elements(credit_tab_parts(t.id))x where (x->>'id')::uuid=pt.id);amount:=(part->>'remaining_cents')::bigint;
   if amount is null or amount<=0 or amount is distinct from (p_data->>'expectedCents')::int then raise exception 'FATURA: O saldo da pessoa mudou. Atualize.';end if;
   if p_action='post_part' then invoice:=credit_post_entry(a.id,'food',amount::int,'Consumo · '||t.label||' · '||pt.name,t.id,pt.id);result:=jsonb_build_object('id',invoice);
   else
    if not venue_can(v,'cash') or (p_data->>'confirmed')::boolean is distinct from true or p_data->>'method' not in('cash','manual_pix') then raise exception 'FATURA: Só o caixa confirma dinheiro ou Pix recebido.';end if;
    if p_data->>'method'='manual_pix' and (coalesce(length(trim(p_data->>'reference')),0)<4) then raise exception 'FATURA: Informe a referência do Pix conferido.';end if;
    perform pg_advisory_xact_lock(hashtext('cash:'||v::text));insert into venue_credit_mutations(tx,tab_id,purpose) values(txid_current(),t.id,'pay_part');
    insert into sale_payments(tab_id,payer_player_id,payer_name,amount,method,paid_at) values(t.id,pt.player_id,pt.name,amount/100.0,case when p_data->>'method'='cash' then 'cash' else 'pix' end,clock_timestamp()) returning id into payment;
    for allocation in select s.id,greatest(0,s.amount_cents-coalesce((select sum(x.amount_cents) from sale_payment_allocations x join sale_payments p on p.id=x.payment_id where x.item_share_id=s.id and p.reversed_at is null),0)) remaining from order_item_shares s join service_order_items i on i.id=s.item_id join service_orders o on o.id=i.order_id where s.participant_id=pt.id and o.tab_id=t.id and i.status<>'cancelled' and o.status<>'cancelled' loop
     if allocation.remaining>0 then insert into sale_payment_allocations(payment_id,item_share_id,amount_cents) values(payment,allocation.id,allocation.remaining);end if;
    end loop;delete from venue_credit_mutations where tx=txid_current();result:=jsonb_build_object('id',payment);
   end if;
   ctx:=credit_snapshot(null,t.id,'tab');if (ctx->>'balance_cents')::bigint=0 then update service_tabs set status='closed',closed_at=now() where id=t.id;end if;
  elsif p_action='post_class' then
   select * into b from academy_bills where id=(p_data->>'billId')::uuid for update;
   if b.id is null or b.player_id<>a.player_id or b.status<>'pending' or b.plan='legacy' or not exists(select 1 from class_programs where id=b.program_id and establishment_id=v) then raise exception 'FATURA: Aula não disponível para este cliente/estabelecimento.';end if;
   amount:=b.amount_cents;if amount is distinct from (p_data->>'expectedCents')::int then raise exception 'FATURA: O valor da aula mudou. Atualize.';end if;
   invoice:=credit_post_entry(a.id,'class',amount::int,'Aula · '||(select name from class_programs where id=b.program_id)||' · '||coalesce(b.competence::text,'avulsa'),null,null,b.id);
   perform credit_refresh_sources(invoice);result:=jsonb_build_object('id',invoice);
  else
   select * into g from games where id=(p_data->>'gameId')::uuid for update;
   if g.id is null or g.status='cancelled' or not exists(select 1 from fields where id=g.field_id and establishment_id=v) then raise exception 'FATURA: Jogo não pertence a este estabelecimento.';end if;
   select * into terms from venue_credit_game_terms where game_id=g.id;
   if terms.game_id is null then
    select array_agg(player_id order by player_id) into roster from attendances where game_id=g.id and status='confirmed';cost:=round(g.field_cost*100)::int;
    if coalesce(cardinality(roster),0)=0 or cost is null or cost<=0 then raise exception 'FATURA: Jogo sem custo ou participantes confirmados.';end if;
   else roster:=terms.roster;cost:=terms.cost_cents;end if;
   idx:=array_position(roster,a.player_id);if idx is null then raise exception 'FATURA: Cliente não está no rateio confirmado.';end if;
   amount:=cost/cardinality(roster)+case when idx<=cost%cardinality(roster) then 1 else 0 end;
   if amount is distinct from (p_data->>'expectedCents')::int then raise exception 'FATURA: O rateio mudou. Atualize o valor antes de aceitar.';end if;
   insert into payments(game_id,player_id) values(g.id,a.player_id) on conflict(game_id,player_id) do nothing;
   select * into gp from payments where game_id=g.id and player_id=a.player_id for update;
   if gp.status<>'pending' then raise exception 'FATURA: Cota já paga, dispensada ou transferida.';end if;
   insert into venue_credit_game_terms(game_id,establishment_id,cost_cents,roster) values(g.id,v,cost,roster) on conflict do nothing;
   invoice:=credit_post_entry(a.id,'game',amount::int,'Cota · '||(select name from peladas where id=g.pelada_id)||' · '||to_char(g.scheduled_at at time zone 'America/Sao_Paulo','DD/MM/YYYY'),null,null,null,gp.id);
   perform credit_refresh_sources(invoice);result:=jsonb_build_object('id',invoice);
  end if;
  insert into venue_credit_requests values(nonce,me,p_action,p_data,result,now());
  insert into venue_audit(establishment_id,actor,action,target_id,details) values(v,me,'credit_'||p_action,(result->>'id')::uuid,jsonb_build_object('amountCents',amount));perform venue_ping(v);return result;
 end if;
 return credit_action_v2(p_action,p_data);
end$$;
do $$declare b text;begin
 b:=pg_get_functiondef('credit_source_guard()'::regprocedure);
 b:=replace(b,'if exists(select 1 from venue_credit_lines where tab_id=tab) then','if exists(select 1 from venue_credit_lines where tab_id=tab) then
  if tg_op=''INSERT'' and tg_table_name in(''sale_payments'',''sale_payment_allocations'') and exists(select 1 from venue_credit_mutations where tx=txid_current() and tab_id=tab and purpose=''pay_part'') then return new;end if;');execute b;
end$$;
revoke all on function credit_post_entry(uuid,text,int,text,uuid,uuid,uuid,uuid),credit_invoice_held(uuid),credit_tab_parts(uuid),credit_snapshot(uuid,uuid,text),credit_action(text,jsonb) from public,anon,authenticated;
grant execute on function credit_snapshot(uuid,uuid,text),credit_action(text,jsonb) to authenticated;
