create function credit_sources(v uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare me uuid:=community_chat_me();result jsonb;begin
 if me is null then raise exception 'FATURA: Entre na conta.';end if;
 result:=jsonb_build_object('classes',coalesce((select jsonb_agg(x) from (select b.id,'class' kind,a.id account_id,a.player_id,p.name customer_name,cp.name description,b.plan,b.competence,b.amount_cents,a.establishment_id venue_id
 from academy_bills b join class_programs cp on cp.id=b.program_id join venue_credit_accounts a on a.establishment_id=cp.establishment_id and a.player_id=b.player_id join players p on p.id=b.player_id
 where a.enabled and b.status='pending' and b.plan<>'legacy' and b.amount_cents>0 and (v is null or a.establishment_id=v) and (a.player_id=me or v is not null and venue_can(v,'cash')) order by b.created_at desc limit 50)x),'[]'::jsonb),
 'games',coalesce((select jsonb_agg(x) from (select g.id,'game' kind,a.id account_id,a.player_id,p.name customer_name,team.name description,g.scheduled_at,a.establishment_id venue_id,
 cost.n/cardinality(roster.ids)+case when array_position(roster.ids,a.player_id)<=cost.n%cardinality(roster.ids) then 1 else 0 end amount_cents
 from games g join fields f on f.id=g.field_id join peladas team on team.id=g.pelada_id join venue_credit_accounts a on a.establishment_id=f.establishment_id join players p on p.id=a.player_id left join venue_credit_game_terms t on t.game_id=g.id
 cross join lateral (select coalesce(t.roster,(select array_agg(player_id order by player_id) from attendances where game_id=g.id and status='confirmed')) ids)roster
 cross join lateral (select coalesce(t.cost_cents,round(g.field_cost*100)::int) n)cost
 where a.enabled and g.status<>'cancelled' and coalesce(cardinality(roster.ids),0)>0 and cost.n>0 and a.player_id=any(roster.ids) and (v is null or a.establishment_id=v) and (a.player_id=me or v is not null and venue_can(v,'cash'))
 and not exists(select 1 from payments pay where pay.game_id=g.id and pay.player_id=a.player_id and pay.status<>'pending')
 order by g.scheduled_at desc,a.player_id limit 50)x),'[]'::jsonb));return result;
end$$;
create function credit_filtered_ids(v uuid,q jsonb) returns setof uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();staff boolean:=v is not null and (venue_can(v,'cash') or venue_can(v,'reports'));status text:=coalesce(q->>'status','all');needle text:=trim(coalesce(q->>'search',''));firstday date;lastday date;begin
 if me is null then raise exception 'FATURA: Entre na conta.';end if;
 if v is not null and not staff and not exists(select 1 from venue_credit_accounts where establishment_id=v and player_id=me) then raise exception 'FATURA: Sem acesso ao estabelecimento.';end if;
 if jsonb_typeof(q) is distinct from 'object' or pg_column_size(q)>4096 or status not in('all','open','overdue','paid') or length(needle)>80 then raise exception 'FATURA: Filtros inválidos.';end if;
 firstday:=nullif(q->>'from','')::date;lastday:=nullif(q->>'to','')::date;if firstday>lastday then raise exception 'FATURA: Período inválido.';end if;
 return query select i.id from venue_credit_invoices i join venue_credit_accounts a on a.id=i.account_id join players p on p.id=a.player_id join establishments e on e.id=a.establishment_id
 where (v is null or a.establishment_id=v) and (a.player_id=me or staff) and (needle='' or position(lower(needle) in lower(p.name||' '||e.name))>0)
 and (firstday is null or i.due_date>=firstday) and (lastday is null or i.due_date<=lastday)
 and (status='all' or status='paid' and credit_balance(i.id)=0 or status='overdue' and credit_balance(i.id)>0 and i.due_date<(now() at time zone 'America/Sao_Paulo')::date or status='open' and credit_balance(i.id)>0 and i.due_date>=(now() at time zone 'America/Sao_Paulo')::date);
end$$;
create function credit_search(p_venue uuid default null,p_query jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;page jsonb;has_more boolean;lastcut date;lastid uuid;lim int:=coalesce((p_query->>'limit')::int,20);begin
 -- Re-use the authorization-safe metadata and replace the bounded legacy invoice list.
 result:=credit_snapshot(p_venue,null,'statement');if lim not between 1 and 50 then raise exception 'FATURA: Página deve ter até 50 faturas.';end if;
 lastcut:=nullif(p_query->>'beforeCut','')::date;lastid:=nullif(p_query->>'beforeId','')::uuid;
 if (lastcut is null)<>(lastid is null) then raise exception 'FATURA: Cursor inválido.';end if;
 select coalesce(jsonb_agg(credit_invoice_json(id) order by cut_date desc,id desc),'[]'::jsonb) into page from
 (select i.id,i.cut_date from venue_credit_invoices i where i.id in(select credit_filtered_ids(p_venue,p_query)) and (lastcut is null or (i.cut_date,i.id)<(lastcut,lastid)) order by i.cut_date desc,i.id desc limit lim+1)x;
 has_more:=jsonb_array_length(page)>lim;if has_more then page:=page-(jsonb_array_length(page)-1);end if;
 return result||jsonb_build_object('invoices',page,'sources',credit_sources(p_venue),'has_more',has_more,'next_cursor',case when has_more then jsonb_build_object('beforeCut',page->-1->>'cut_date','beforeId',page->-1->>'id') end,
 'summary',(select jsonb_build_object('count',count(*),'pending_cents',coalesce(sum(credit_balance(id)),0),'overdue_cents',coalesce(sum(credit_balance(id))filter(where due_date<(now() at time zone 'America/Sao_Paulo')::date),0)) from venue_credit_invoices where id in(select credit_filtered_ids(p_venue,p_query))));
end$$;
create function credit_export(p_venue uuid default null,p_query jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare items jsonb;begin
 select coalesce(jsonb_agg(credit_invoice_json(id) order by cut_date desc,id desc),'[]'::jsonb) into items from (select id,cut_date from venue_credit_invoices where id in(select credit_filtered_ids(p_venue,p_query)) order by cut_date desc,id desc limit 1001)x;
 return jsonb_build_object('invoices',case when jsonb_array_length(items)>1000 then items-1000 else items end,'truncated',jsonb_array_length(items)>1000,'generated_at',now());
end$$;
create or replace function credit_refresh_sources(i uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare l record;settled boolean;begin
 for l in select * from venue_credit_lines where invoice_id=i and kind in('class','game') loop
  settled:=credit_balance(i)=0 or coalesce((select sum(x.amount_cents) from venue_credit_allocations x where x.line_id=l.id and not exists(select 1 from venue_credit_reversals r where r.payment_id=x.payment_id)),0)>=l.amount_cents;
  insert into venue_credit_mutations(tx,source_id,purpose) values(txid_current(),coalesce(l.academy_bill_id,l.game_payment_id),'source_sync');
  if l.kind='class' then update academy_bills set status=case when settled then 'invoice_paid' else 'invoiced' end where id=l.academy_bill_id;
  else update payments set status=case when settled then 'invoice_paid' else 'invoiced' end where id=l.game_payment_id;end if;
  delete from venue_credit_mutations where tx=txid_current();
 end loop;
end$$;
revoke all on function credit_sources(uuid),credit_filtered_ids(uuid,jsonb),credit_search(uuid,jsonb),credit_export(uuid,jsonb) from public,anon,authenticated;
grant execute on function credit_search(uuid,jsonb),credit_export(uuid,jsonb) to authenticated;
