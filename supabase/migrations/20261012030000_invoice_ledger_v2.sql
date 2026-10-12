-- Immutable corrections, separate due dates, individually attributable sources.
alter table venue_credit_accounts add column due_days int not null default 0 check(due_days between 0 and 45);
alter table venue_credit_invoices add column due_date date;
update venue_credit_invoices set due_date=cut_date;
alter table venue_credit_invoices alter column due_date set not null;
create function credit_invoice_due() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 new.due_date:=new.cut_date+(select due_days from venue_credit_accounts where id=new.account_id);return new;end$$;
create trigger credit_invoice_due before insert on venue_credit_invoices for each row execute function credit_invoice_due();
alter table venue_credit_lines drop constraint venue_credit_lines_kind_check;
alter table venue_credit_lines drop constraint venue_credit_lines_check;
alter table venue_credit_lines drop constraint venue_credit_lines_tab_id_key;
alter table venue_credit_lines add column participant_id uuid references tab_participants(id);
alter table venue_credit_lines add column academy_bill_id uuid unique references academy_bills(id);
alter table venue_credit_lines add column game_payment_id uuid unique references payments(id);
alter table venue_credit_lines add constraint credit_line_source check(
 (kind='food' and tab_id is not null and rental_id is null and academy_bill_id is null and game_payment_id is null) or
 (kind='rental' and rental_id is not null and tab_id is null and academy_bill_id is null and game_payment_id is null and participant_id is null) or
 (kind='class' and academy_bill_id is not null and tab_id is null and rental_id is null and game_payment_id is null and participant_id is null) or
 (kind='game' and game_payment_id is not null and tab_id is null and rental_id is null and academy_bill_id is null and participant_id is null));
create unique index credit_whole_tab_once on venue_credit_lines(tab_id) where tab_id is not null and participant_id is null;
create unique index credit_tab_person_once on venue_credit_lines(tab_id,participant_id) where participant_id is not null;
create table venue_credit_reversals(id uuid primary key default gen_random_uuid(),payment_id uuid not null unique references venue_credit_payments(id),reason text not null check(length(trim(reason)) between 8 and 500),actor uuid not null references players(id),created_at timestamptz not null default clock_timestamp(),provider_confirmed boolean not null default false);
create table venue_credit_notes(id uuid primary key default gen_random_uuid(),invoice_id uuid not null references venue_credit_invoices(id),amount_cents int not null check(amount_cents>0),reason text not null check(length(trim(reason)) between 8 and 500),actor uuid not null references players(id),created_at timestamptz not null default clock_timestamp());
create table venue_credit_game_terms(game_id uuid primary key references games(id),establishment_id uuid not null references establishments(id),cost_cents int not null check(cost_cents>0),roster uuid[] not null check(cardinality(roster)>0),created_at timestamptz not null default now());
-- Private transaction capability; never expose a GUC which clients could forge.
create table venue_credit_mutations(tx bigint primary key,tab_id uuid,source_id uuid,purpose text not null);
alter table venue_credit_payments drop constraint venue_credit_payments_method_check;
alter table venue_credit_payments drop constraint venue_credit_payments_rental_id_key;
alter table venue_credit_payments add constraint venue_credit_payments_method_check check(method in('cash','manual_pix','online_pix'));
alter table academy_bills drop constraint academy_bills_status_check;
alter table academy_bills add constraint academy_bills_status_check check(status in('pending','cash_paid','cancelled','invoiced','invoice_paid'));
alter table payments drop constraint payments_status_check;
alter table payments add constraint payments_status_check check(status in('pending','paid','waived','invoiced','invoice_paid'));
do $$declare t text;begin foreach t in array array['venue_credit_reversals','venue_credit_notes','venue_credit_game_terms','venue_credit_mutations'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon,authenticated',t);end loop;end$$;
create or replace function credit_balance(i uuid) returns bigint language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select sum(amount_cents) from venue_credit_lines where invoice_id=i),0)
 -coalesce((select sum(amount_cents) from venue_credit_notes where invoice_id=i),0)
 -coalesce((select sum(p.amount_cents) from venue_credit_payments p where invoice_id=i and not exists(select 1 from venue_credit_reversals r where r.payment_id=p.id)),0)
$$;
create function credit_due_overdue(a uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from venue_credit_invoices where account_id=a and due_date<(now() at time zone 'America/Sao_Paulo')::date and credit_balance(id)>0)
$$;
create function credit_refresh_sources(i uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare l record;settled boolean:=credit_balance(i)=0;begin
 for l in select * from venue_credit_lines where invoice_id=i and kind in('class','game') loop
  insert into venue_credit_mutations(tx,source_id,purpose) values(txid_current(),coalesce(l.academy_bill_id,l.game_payment_id),'source_sync');
  if l.kind='class' then update academy_bills set status=case when settled then 'invoice_paid' else 'invoiced' end where id=l.academy_bill_id;
  else update payments set status=case when settled then 'invoice_paid' else 'invoiced' end where id=l.game_payment_id;end if;
  delete from venue_credit_mutations where tx=txid_current();
 end loop;
end$$;
create function credit_unified_source_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare d jsonb:=case when tg_op='INSERT' then to_jsonb(new) else to_jsonb(old) end;k uuid:=(d->>'id')::uuid;begin
 if exists(select 1 from venue_credit_mutations where tx=txid_current() and source_id=k and purpose='source_sync') then return new;end if;
 if exists(select 1 from venue_credit_lines where academy_bill_id=k or game_payment_id=k) or (tg_op<>'DELETE' and to_jsonb(new)->>'status' in('invoiced','invoice_paid')) then raise exception 'FATURA: Cobrança transferida: receba ou corrija somente na fatura.';end if;
 if tg_op='DELETE' then return old;end if;return new;end$$;
create trigger credit_unified_guard before insert or update or delete on academy_bills for each row execute function credit_unified_source_guard();
create trigger credit_unified_guard before insert or update or delete on payments for each row execute function credit_unified_source_guard();
create function credit_game_terms_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if exists(select 1 from venue_credit_game_terms where game_id=old.id) and (tg_op='DELETE' or new.field_id is distinct from old.field_id or new.field_cost is distinct from old.field_cost or new.pelada_id is distinct from old.pelada_id) then raise exception 'FATURA: Rateio já aceito em fatura. Preço e recebedor estão congelados.';end if;
 if tg_op='DELETE' then return old;end if;return new;end$$;
create trigger credit_game_terms_guard before update or delete on games for each row execute function credit_game_terms_guard();
alter function credit_invoice_json(uuid) rename to credit_invoice_json_v1;
revoke all on function credit_invoice_json_v1(uuid) from public,anon,authenticated;
create function credit_invoice_json(p_invoice uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select credit_invoice_json_v1(i.id)||jsonb_build_object('due_date',i.due_date,
 'status',case when credit_balance(i.id)=0 then case when i.cut_date>=(now() at time zone 'America/Sao_Paulo')::date then 'zero_open' else 'paid' end when i.due_date<(now() at time zone 'America/Sao_Paulo')::date then 'overdue' else 'open' end,
 'credits_cents',coalesce((select sum(amount_cents) from venue_credit_notes where invoice_id=i.id),0),
 'notes',coalesce((select jsonb_agg(n order by created_at) from venue_credit_notes n where invoice_id=i.id),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('reversal',(select to_jsonb(r) from venue_credit_reversals r where r.payment_id=p.id),'confirmation',case when p.method='online_pix' then 'gateway' else 'counter' end) order by paid_at) from venue_credit_payments p where p.invoice_id=i.id),'[]'::jsonb))
 from venue_credit_invoices i where i.id=p_invoice
$$;
-- Keep the proven v1 actions; forward additions via a wrapper with identical API.
alter function credit_action(text,jsonb) rename to credit_action_v1;
revoke all on function credit_action_v1(text,jsonb) from public,anon,authenticated;
do $$declare b text;begin
 b:=pg_get_functiondef('credit_action_v1(text,jsonb)'::regprocedure);
 b:=replace(b,'cut_date<(now() at time zone ''America/Sao_Paulo'')::date','due_date<(now() at time zone ''America/Sao_Paulo'')::date');
 b:=replace(b,'from venue_credit_allocations a where a.line_id=l.id','from venue_credit_allocations a where a.line_id=l.id and not exists(select 1 from venue_credit_reversals r where r.payment_id=a.payment_id)');execute b;
 b:=pg_get_functiondef('credit_snapshot(uuid,uuid,text)'::regprocedure);
 b:=replace(b,'cut_date<(now() at time zone ''America/Sao_Paulo'')::date','due_date<(now() at time zone ''America/Sao_Paulo'')::date');execute b;
 b:=replace(b,'where r.rental_id=q.id','where r.rental_id=q.id and not exists(select 1 from venue_credit_reversals x where x.payment_id=r.id)');execute b;
 b:=pg_get_functiondef('venue_snapshot(uuid)'::regprocedure);
 b:=replace(b,'where a.establishment_id=v and (p.paid_at','where a.establishment_id=v and not exists(select 1 from venue_credit_reversals x where x.payment_id=p.id) and (p.paid_at');execute b;
 b:=pg_get_functiondef('venue_action(text,jsonb)'::regprocedure);
 b:=replace(b,'and p.method=''cash'' and p.paid_at>=shift.opened_at','and p.method=''cash'' and p.paid_at>=shift.opened_at and not exists(select 1 from venue_credit_reversals x where x.payment_id=p.id)');execute b;
 b:=pg_get_functiondef('academy_action(text,jsonb)'::regprocedure);
 b:=replace(b,'and status=''cash_paid''','and status in(''cash_paid'',''invoice_paid'')');execute b;
end$$;
create function credit_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();a venue_credit_accounts;p venue_credit_payments;i venue_credit_invoices;r venue_credit_requests;nonce uuid;v uuid;result jsonb;n bigint;d integer;
begin
 if me is null then raise exception 'FATURA: Entre na sua conta.';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>16384 then raise exception 'FATURA: Dados inválidos.';end if;
 nonce:=(p_data->>'requestId')::uuid;if nonce is null then raise exception 'FATURA: Identificador obrigatório.';end if;
 perform pg_advisory_xact_lock(hashtext(nonce::text));select * into r from venue_credit_requests where id=nonce;
 if r.id is not null then if r.actor<>me or r.action<>p_action or r.request_data<>p_data then raise exception 'FATURA: Identificador já utilizado.';end if;return r.result;end if;
 if p_action='account_save' then
  d:=coalesce((p_data->>'dueDays')::int,0);if d not between 0 and 45 then raise exception 'FATURA: Vencimento deve ser de 0 a 45 dias após o corte.';end if;
  result:=credit_action_v1(p_action,p_data);update venue_credit_accounts set due_days=d where id=(result->>'id')::uuid;return result;
 elsif p_action in('reverse_payment','credit_note') then
  if p_action='reverse_payment' then select * into p from venue_credit_payments where id=(p_data->>'paymentId')::uuid;select * into i from venue_credit_invoices where id=p.invoice_id;select * into a from venue_credit_accounts where id=coalesce(i.account_id,(select account_id from venue_credit_rentals where id=p.rental_id)) for update;
  else select * into i from venue_credit_invoices where id=(p_data->>'invoiceId')::uuid;select * into a from venue_credit_accounts where id=i.account_id for update;end if;
  v:=a.establishment_id;if not is_establishment_owner(v) then raise exception 'FATURA: Somente o dono corrige recebimentos e concede abatimentos.';end if;
  if (p_data->>'confirmed')::boolean is distinct from true or length(trim(p_data->>'reason')) not between 8 and 500 or p_data->>'reason' is null then raise exception 'FATURA: Confirme e informe motivo de 8 a 500 caracteres.';end if;
  if p_action='reverse_payment' then
   if p.method='online_pix' then raise exception 'FATURA: Pagamento online precisa de devolução confirmada pelo provedor.';end if;
   insert into venue_credit_reversals(payment_id,reason,actor) values(p.id,trim(p_data->>'reason'),me);
   -- A direct rental corrected after collection becomes a pending offer again.
   if p.rental_id is not null then update venue_credit_rentals set status='pending' where id=p.rental_id;end if;
   result:=jsonb_build_object('id',p.id);n:=p.amount_cents;
  else n:=(p_data->>'amountCents')::int;
   if n is null or n<=0 or n>credit_balance(i.id) then raise exception 'FATURA: Abatimento limitado ao saldo em aberto. Devolva primeiro o pagamento, se necessário.';end if;
   insert into venue_credit_notes(invoice_id,amount_cents,reason,actor) values(i.id,n,trim(p_data->>'reason'),me);
   result:=jsonb_build_object('id',i.id);
  end if;
  if i.id is not null then perform credit_refresh_sources(i.id);end if;
  insert into venue_notices(player_id,establishment_id,title,body) values(a.player_id,v,'Correção financeira registrada','Consulte o extrato da sua fatura. O histórico anterior foi preservado.');
 else
  result:=credit_action_v1(p_action,p_data);
  if p_action='receive_invoice' then perform credit_refresh_sources((p_data->>'invoiceId')::uuid);end if;
  return result;
 end if;
 insert into venue_credit_requests values(nonce,me,p_action,p_data,result,now());
 insert into venue_audit(establishment_id,actor,action,target_id,details) values(v,me,'credit_'||p_action,(result->>'id')::uuid,jsonb_build_object('amountCents',n,'reason',trim(p_data->>'reason')));perform venue_ping(v);return result;
end$$;
revoke all on function credit_invoice_due(),credit_due_overdue(uuid),credit_refresh_sources(uuid),credit_unified_source_guard(),credit_game_terms_guard(),credit_invoice_json(uuid),credit_action(text,jsonb) from public,anon,authenticated;
grant execute on function credit_action(text,jsonb) to authenticated;
