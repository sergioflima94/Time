create table venue_credit_agreements(id uuid primary key default gen_random_uuid(),invoice_id uuid not null references venue_credit_invoices(id),proposed_by uuid not null references players(id),accepted_by uuid references players(id),amount_cents int not null check(amount_cents>0),installments int not null check(installments between 2 and 12),first_due date not null,gap_days int not null check(gap_days between 7 and 45),reason text not null check(length(trim(reason)) between 8 and 500),status text not null default 'proposed' check(status in('proposed','accepted','rejected','cancelled')),created_at timestamptz not null default now(),accepted_at timestamptz);
create unique index credit_one_agreement on venue_credit_agreements(invoice_id) where status in('proposed','accepted');
alter table venue_credit_agreements enable row level security;revoke all on venue_credit_agreements from anon,authenticated;
create function credit_agreement_schedule(p uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('number',s.n,'amount_cents',s.amount,'due_date',s.due,'remaining_cents',greatest(0,s.amount-least(s.amount,greatest(0,a.amount_cents-credit_balance(a.invoice_id)-s.before)))) order by s.n),'[]'::jsonb)
 from venue_credit_agreements a cross join lateral(select n,a.first_due+(n-1)*a.gap_days due,a.amount_cents/a.installments+case when n<=a.amount_cents%a.installments then 1 else 0 end amount,(n-1)*(a.amount_cents/a.installments)+least(n-1,a.amount_cents%a.installments) before from generate_series(1,a.installments)n)s where a.id=p
$$;
create function credit_effective_due(i uuid) returns date language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select min((part->>'due_date')::date) from venue_credit_agreements a cross join lateral jsonb_array_elements(credit_agreement_schedule(a.id))part where a.invoice_id=i and a.status='accepted' and credit_balance(i)<=a.amount_cents and (part->>'remaining_cents')::int>0),(select due_date from venue_credit_invoices where id=i))
$$;
create or replace function credit_due_overdue(a uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from venue_credit_invoices where account_id=a and credit_effective_due(id)<(now() at time zone 'America/Sao_Paulo')::date and credit_balance(id)>0)$$;
create function credit_agreement_line_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin if exists(select 1 from venue_credit_agreements where invoice_id=new.invoice_id and status in('proposed','accepted')) then raise exception 'FATURA: Ciclo com acordo não recebe novos consumos. Pague na hora ou aguarde outro ciclo.';end if;return new;end$$;
create trigger credit_agreement_line_guard before insert on venue_credit_lines for each row execute function credit_agreement_line_guard();
alter function credit_action(text,jsonb) rename to credit_action_v6;revoke all on function credit_action_v6(text,jsonb) from public,anon,authenticated;
create function credit_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare me uuid:=community_chat_me();i venue_credit_invoices;a venue_credit_accounts;plan venue_credit_agreements;nonce uuid;old venue_credit_requests;result jsonb;n int;firstday date;gap int;begin
 if p_action not in('agreement_propose','agreement_accept','agreement_reject','agreement_cancel') then return credit_action_v6(p_action,p_data);end if;
 if me is null or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>8192 then raise exception 'FATURA: Conta e dados válidos necessários.';end if;
 nonce:=(p_data->>'requestId')::uuid;if nonce is null then raise exception 'FATURA: Identificador obrigatório.';end if;perform pg_advisory_xact_lock(hashtext(nonce::text));select * into old from venue_credit_requests where id=nonce;
 if old.id is not null then if old.actor<>me or old.action<>p_action or old.request_data<>p_data then raise exception 'FATURA: Identificador já utilizado.';end if;return old.result;end if;
 select * into i from venue_credit_invoices where id=case when p_action='agreement_propose' then (p_data->>'invoiceId')::uuid else(select invoice_id from venue_credit_agreements where id=(p_data->>'agreementId')::uuid) end;
 select * into a from venue_credit_accounts where id=i.account_id for update;
 if a.id is null then raise exception 'FATURA: Fatura não encontrada.';end if;
 if credit_invoice_held(i.id) then raise exception 'FATURA: Resolva a cobrança online antes de negociar.';end if;
 if p_action='agreement_propose' then
  if not is_establishment_owner(a.establishment_id) then raise exception 'FATURA: Só o dono propõe acordo.';end if;
  n:=(p_data->>'installments')::int;firstday:=(p_data->>'firstDue')::date;gap:=(p_data->>'gapDays')::int;
  if n is null or n not between 2 and 12 or gap is null or gap not between 7 and 45 or firstday is null or firstday<(now() at time zone 'America/Sao_Paulo')::date or firstday>(now() at time zone 'America/Sao_Paulo')::date+90 or length(trim(p_data->>'reason')) not between 8 and 500 or p_data->>'reason' is null or credit_balance(i.id)<=0 or (p_data->>'expectedCents')::bigint is distinct from credit_balance(i.id) then raise exception 'FATURA: Confira saldo, motivo, 2–12 parcelas e vencimento em até 90 dias.';end if;
  if exists(select 1 from venue_credit_agreements where invoice_id=i.id and status='accepted') then raise exception 'FATURA: Já há um acordo aceito. Quite ou trate a divergência antes de nova negociação.';end if;
  update venue_credit_agreements set status='cancelled' where invoice_id=i.id and status='proposed';
  insert into venue_credit_agreements(invoice_id,proposed_by,amount_cents,installments,first_due,gap_days,reason) values(i.id,me,credit_balance(i.id),n,firstday,gap,trim(p_data->>'reason')) returning * into plan;
 else
  select * into plan from venue_credit_agreements where id=(p_data->>'agreementId')::uuid for update;
  if plan.status<>'proposed' then raise exception 'FATURA: Proposta já respondida.';end if;
  if p_action='agreement_cancel' then if not is_establishment_owner(a.establishment_id) then raise exception 'FATURA: Só o dono cancela sua proposta.';end if;update venue_credit_agreements set status='cancelled' where id=plan.id;
  else
   if a.player_id<>me then raise exception 'FATURA: Somente o cliente aceita ou recusa.';end if;
   if p_action='agreement_accept' then
    if (p_data->>'consent')::boolean is distinct from true or credit_balance(i.id)<>plan.amount_cents or plan.first_due<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'FATURA: Confira o saldo atualizado e aceite os vencimentos.';end if;
    update venue_credit_agreements set status='accepted',accepted_by=me,accepted_at=now() where id=plan.id;
   else update venue_credit_agreements set status='rejected' where id=plan.id;end if;
  end if;
 end if;
 result:=jsonb_build_object('id',plan.id);insert into venue_credit_requests values(nonce,me,p_action,p_data,result,now());
 insert into venue_audit(establishment_id,actor,action,target_id,details) values(a.establishment_id,me,'credit_'||p_action,plan.id,jsonb_build_object('amountCents',plan.amount_cents));
 insert into venue_notices(player_id,establishment_id,title,body) values(a.player_id,a.establishment_id,'Acordo de fatura atualizado','Consulte a proposta e os vencimentos em Minhas faturas. Não há juros ou débito automático.');perform venue_ping(a.establishment_id);return result;
end$$;
alter function credit_invoice_json(uuid) rename to credit_invoice_json_v7;revoke all on function credit_invoice_json_v7(uuid) from public,anon,authenticated;
create function credit_invoice_json(p_invoice uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select credit_invoice_json_v7(p_invoice)||jsonb_build_object('effective_due_date',credit_effective_due(p_invoice),'status',case when credit_balance(p_invoice)=0 then 'paid' when credit_effective_due(p_invoice)<(now() at time zone 'America/Sao_Paulo')::date then 'overdue' else 'open' end,'agreements',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('schedule',credit_agreement_schedule(a.id),'needs_review',a.status='accepted' and credit_balance(p_invoice)>a.amount_cents) order by created_at desc) from venue_credit_agreements a where invoice_id=p_invoice),'[]'::jsonb))$$;
do $$declare b text;begin
 b:=pg_get_functiondef('credit_filtered_ids(uuid,jsonb)'::regprocedure);b:=replace(b,'i.due_date','credit_effective_due(i.id)');execute b;
 b:=pg_get_functiondef('credit_search(uuid,jsonb)'::regprocedure);b:=replace(b,'where due_date<','where credit_effective_due(id)<');execute b;
 b:=pg_get_functiondef('credit_reminders_generate()'::regprocedure);b:=replace(b,'order by i.account_id,i.due_date,i.id','order by i.account_id,credit_effective_due(i.id),i.id');execute b;
 b:=pg_get_functiondef('credit_action_v1(text,jsonb)'::regprocedure);b:=replace(b,'and due_date<','and credit_effective_due(id)<');execute b;
 b:=pg_get_functiondef('credit_snapshot_v1(uuid,uuid,text)'::regprocedure);b:=replace(b,'i.due_date<','credit_effective_due(i.id)<');execute b;
end$$;
create or replace function credit_reminder_stage(i uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$select case when credit_balance(i)<=0 then null when credit_effective_due(i)<(now() at time zone 'America/Sao_Paulo')::date then 'overdue' when credit_effective_due(i)=(now() at time zone 'America/Sao_Paulo')::date then 'due' when credit_effective_due(i)<=(now() at time zone 'America/Sao_Paulo')::date+3 then 'before_due' else null end$$;
revoke all on function credit_agreement_schedule(uuid),credit_effective_due(uuid),credit_agreement_line_guard(),credit_invoice_json(uuid),credit_action(text,jsonb) from public,anon,authenticated;
grant execute on function credit_action(text,jsonb) to authenticated;
