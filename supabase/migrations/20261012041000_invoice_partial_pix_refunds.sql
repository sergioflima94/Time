create table venue_credit_refunds(id uuid primary key default gen_random_uuid(),intent_id uuid not null references venue_credit_intents(id),payment_id uuid not null references venue_credit_payments(id),amount_cents int not null check(amount_cents>0),cumulative_cents int not null check(cumulative_cents>0),provider_updated_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),unique(intent_id,cumulative_cents));
create table venue_credit_refund_allocations(refund_id uuid not null references venue_credit_refunds(id),payment_id uuid not null,line_id uuid not null,amount_cents int not null check(amount_cents>0),primary key(refund_id,line_id),foreign key(payment_id,line_id) references venue_credit_allocations(payment_id,line_id));
create table venue_credit_refund_requests(id uuid primary key,actor uuid not null references players(id),intent_id uuid not null references venue_credit_intents(id),amount_cents int not null check(amount_cents>0),baseline_cents int not null,status text not null default 'claimed' check(status in('claimed','confirmed')),created_at timestamptz not null default now());
create unique index credit_one_refund_request on venue_credit_refund_requests(intent_id) where status='claimed';
create table venue_credit_provider_financials(intent_id uuid primary key references venue_credit_intents(id),fee_cents int check(fee_cents>=0),net_cents int check(net_cents>=0),provider_updated_at timestamptz not null);
do $$declare t text;begin foreach t in array array['venue_credit_refunds','venue_credit_refund_allocations','venue_credit_refund_requests','venue_credit_provider_financials'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon,authenticated',t);end loop;end$$;
create function credit_payment_net(p uuid) returns bigint language sql stable security definer set search_path=public,pg_temp as $$select case when exists(select 1 from venue_credit_reversals where payment_id=p) then 0 else amount_cents-coalesce((select sum(amount_cents) from venue_credit_refunds where payment_id=p),0) end from venue_credit_payments where id=p$$;
create function credit_allocation_net(p uuid,l uuid,n int) returns bigint language sql stable security definer set search_path=public,pg_temp as $$select case when exists(select 1 from venue_credit_reversals where payment_id=p) then 0 else n-coalesce((select sum(amount_cents) from venue_credit_refund_allocations where payment_id=p and line_id=l),0) end$$;
create or replace function credit_balance(i uuid) returns bigint language sql stable security definer set search_path=public,pg_temp as $$select coalesce((select sum(amount_cents) from venue_credit_lines where invoice_id=i),0)-coalesce((select sum(amount_cents) from venue_credit_notes where invoice_id=i),0)-coalesce((select sum(credit_payment_net(id)) from venue_credit_payments where invoice_id=i),0)$$;
do $$declare b text;f text;begin
 foreach f in array array['credit_payment_service_core(text,jsonb)','credit_action_v1(text,jsonb)','credit_refresh_sources(uuid)'] loop
  b:=pg_get_functiondef(f::regprocedure);b:=replace(b,'sum(x.amount_cents)','sum(credit_allocation_net(x.payment_id,x.line_id,x.amount_cents))');b:=replace(b,'sum(a.amount_cents) from venue_credit_allocations a','sum(credit_allocation_net(a.payment_id,a.line_id,a.amount_cents)) from venue_credit_allocations a');
  if f='credit_payment_service_core(text,jsonb)' then b:=replace(b,'n:=credit_balance(i.id);if n<=0','n:=coalesce((p_data->>''amountCents'')::int,credit_balance(i.id));if n is null or n>credit_balance(i.id) then raise exception ''FATURA: Pix deve ser positivo e até o saldo.'';end if;if n<=0');end if;execute b;
 end loop;
 b:=pg_get_functiondef('venue_snapshot(uuid)'::regprocedure);b:=replace(b,'sum(p.amount_cents)','sum(credit_payment_net(p.id))');execute b;
end$$;
alter function credit_payment_service(text,jsonb) rename to credit_payment_service_v4;
revoke all on function credit_payment_service_v4(text,jsonb) from public,anon,authenticated;
create function credit_payment_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare t venue_credit_intents;a venue_credit_accounts;r venue_credit_refund_requests;c jsonb;result jsonb;who uuid;n int;prior int;delta int;refund uuid;remaining int;item record;part int;stamp timestamptz;fee int;net int;begin
 if auth.role()<>'service_role' or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>32768 then raise exception 'FATURA: Serviço não autorizado.';end if;
 if p_action='refund_claim' then
  c:=credit_payment_service_v4('context',p_data);if (c->>'can_refund')::boolean is distinct from true then raise exception 'FATURA: Só o dono devolve pagamentos.';end if;
  select * into a from venue_credit_accounts where id=(select account_id from venue_credit_invoices where id=(c->>'invoice_id')::uuid) for update;
  select * into t from venue_credit_intents where id=(c->>'id')::uuid for update;
  who:=(select id from players where auth_user_id=(p_data->>'actor')::uuid);
  select * into r from venue_credit_refund_requests where id=nullif(p_data->>'requestId','')::uuid;
  if r.id is not null then if r.actor<>who or r.intent_id<>t.id or ((p_data->>'amountCents') is not null and (p_data->>'amountCents')::int<>r.amount_cents) then raise exception 'FATURA: Identificador de devolução já usado.';end if;return jsonb_build_object('claimed',false);end if;
  n:=coalesce((p_data->>'amountCents')::int,credit_payment_net(t.payment_id));who:=(select id from players where auth_user_id=(p_data->>'actor')::uuid);
  if t.state<>'paid' or n is null or n<=0 or n>credit_payment_net(t.payment_id) or (t.provider='picpay' and n<>t.amount_cents) then raise exception 'FATURA: Valor de devolução inválido. PicPay permite apenas integral nesta integração.';end if;
  if exists(select 1 from venue_credit_intents where invoice_id=t.invoice_id and id<>t.id and state in('building','pending','uncertain','review')) then raise exception 'FATURA: Resolva o outro checkout antes de devolver.';end if;
  if nullif(p_data->>'requestId','') is null then return credit_payment_service_v4(p_action,p_data);end if;
  select * into r from venue_credit_refund_requests where id=(p_data->>'requestId')::uuid;
  if r.id is not null then if r.actor<>who or r.intent_id<>t.id or r.amount_cents<>n then raise exception 'FATURA: Identificador de devolução já usado.';end if;return jsonb_build_object('claimed',false);end if;
  if exists(select 1 from venue_credit_refund_requests where intent_id=t.id and status='claimed') then return jsonb_build_object('claimed',false);end if;
  prior:=t.amount_cents-credit_payment_net(t.payment_id);insert into venue_credit_refund_requests(id,actor,intent_id,amount_cents,baseline_cents) values((p_data->>'requestId')::uuid,who,t.id,n,prior);
  update venue_credit_intents set refund_requested_at=now() where id=t.id;return jsonb_build_object('claimed',true);
 end if;
 if p_action='settle' and p_data->>'status'='partial_refund' then
  select * into t from venue_credit_intents where id=(p_data->>'intentId')::uuid;
  select * into a from venue_credit_accounts where id=(select account_id from venue_credit_invoices where id=t.invoice_id) for update;
  select * into t from venue_credit_intents where id=t.id for update;
  if t.payment_id is null then perform credit_payment_service_v4('settle',p_data||jsonb_build_object('status','approved'));select * into t from venue_credit_intents where id=t.id;end if;
  stamp:=(p_data->>'updatedAt')::timestamptz;n:=(p_data->>'refundedCents')::int;
  if t.provider<>'mercado_pago' or t.payment_id is null or t.provider_payment_id is distinct from p_data->>'paymentId' or (p_data->>'gatewayId')::uuid is distinct from t.gateway_id or p_data->>'currency' is distinct from 'BRL' or (p_data->>'amountCents')::int is distinct from t.amount_cents or stamp is null or n is null or n<=0 or n>=t.amount_cents then raise exception 'FATURA: Prova de devolução parcial divergente.';end if;
  if t.state='refunded' then return jsonb_build_object('id',t.id,'stale',true);end if;
  prior:=coalesce((select max(cumulative_cents) from venue_credit_refunds where intent_id=t.id),0);
  if n<=prior or exists(select 1 from venue_credit_gateway_events where intent_id=t.id and provider_updated_at>stamp) then return jsonb_build_object('id',t.id,'stale',true);end if;
  delta:=n-prior;insert into venue_credit_refunds(intent_id,payment_id,amount_cents,cumulative_cents,provider_updated_at) values(t.id,t.payment_id,delta,n,stamp) returning id into refund;
  remaining:=delta;for item in select x.*,l.posted_at,credit_allocation_net(x.payment_id,x.line_id,x.amount_cents) available from venue_credit_allocations x join venue_credit_lines l on l.id=x.line_id where payment_id=t.payment_id order by l.posted_at desc,l.id desc loop part:=least(remaining,item.available);if part>0 then insert into venue_credit_refund_allocations values(refund,t.payment_id,item.line_id,part);remaining:=remaining-part;end if;exit when remaining=0;end loop;
  if remaining<>0 then raise exception 'FATURA: Alocação da devolução divergente.';end if;
  insert into venue_credit_gateway_events(intent_id,provider_payment_id,event_status,provider_updated_at,amount_cents) values(t.id,t.provider_payment_id,'partial_refund',stamp,t.amount_cents) on conflict do nothing;
  update venue_credit_refund_requests set status='confirmed' where intent_id=t.id and baseline_cents+amount_cents<=n;
  perform credit_refresh_sources(t.invoice_id);perform venue_ping(a.establishment_id);result:=jsonb_build_object('id',t.id);
 else result:=credit_payment_service_v4(p_action,p_data);end if;
 if p_action in('context','webhook_context') then
  select * into r from venue_credit_refund_requests where intent_id=(p_data->>'intentId')::uuid and status='claimed';
  result:=result||jsonb_build_object('refund_request_id',r.id,'refund_amount_cents',r.amount_cents);return result;
 end if;
 if p_action='settle' then
  select * into t from venue_credit_intents where id=(p_data->>'intentId')::uuid;
  if p_data->>'status'='refunded' then update venue_credit_refund_requests set status='confirmed' where intent_id=t.id;end if;
  fee:=(p_data->>'feeCents')::int;net:=(p_data->>'netCents')::int;stamp:=(p_data->>'updatedAt')::timestamptz;
  if fee<0 or fee>t.amount_cents or net<0 or net>t.amount_cents then raise exception 'FATURA: Valores líquidos divergentes.';end if;
  if fee is not null or net is not null then insert into venue_credit_provider_financials values(t.id,fee,net,stamp) on conflict(intent_id) do update set fee_cents=excluded.fee_cents,net_cents=excluded.net_cents,provider_updated_at=excluded.provider_updated_at where venue_credit_provider_financials.provider_updated_at<=excluded.provider_updated_at;end if;
 end if;return result;
end$$;
alter function credit_invoice_json(uuid) rename to credit_invoice_json_v5;
revoke all on function credit_invoice_json_v5(uuid) from public,anon,authenticated;
create function credit_intent_json(t venue_credit_intents) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select jsonb_build_object('id',t.id,'state',t.state,'provider',t.provider,'amount_cents',t.amount_cents,'pix_code',t.pix_code,'checkout_url',t.checkout_url,'created_at',t.created_at,'expires_at',t.expires_at,'refund_requested_at',t.refund_requested_at,'refund_pending',exists(select 1 from venue_credit_refund_requests where intent_id=t.id and status='claimed'),'refunded_cents',case when t.state='refunded' then t.amount_cents else coalesce((select max(cumulative_cents) from venue_credit_refunds where intent_id=t.id),0) end,'fee_cents',(select fee_cents from venue_credit_provider_financials where intent_id=t.id),'net_cents',(select net_cents from venue_credit_provider_financials where intent_id=t.id))$$;
create function credit_invoice_json(p_invoice uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select credit_invoice_json_v5(p_invoice)||jsonb_build_object('received_cents',coalesce((select sum(credit_payment_net(id)) from venue_credit_payments where invoice_id=p_invoice),0),'payments',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('net_paid_cents',credit_payment_net(p.id),'refunds',coalesce((select jsonb_agg(r order by created_at) from venue_credit_refunds r where payment_id=p.id),'[]'::jsonb),'reversal',(select to_jsonb(r) from venue_credit_reversals r where payment_id=p.id),'confirmation',case when method='online_pix' then 'gateway' else 'counter' end) order by paid_at) from venue_credit_payments p where invoice_id=p_invoice),'[]'::jsonb),'online',(credit_online_public(p_invoice)||jsonb_build_object('intents',coalesce((select jsonb_agg(credit_intent_json(t) order by t.created_at desc) from (select * from venue_credit_intents where invoice_id=p_invoice order by created_at desc limit 10)t),'[]'::jsonb))))$$;
create function credit_checkout_history(p_invoice uuid,p_before timestamptz default null,p_intent uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare a venue_credit_accounts;me uuid:=community_chat_me();begin
 select * into a from venue_credit_accounts where id=(select account_id from venue_credit_invoices where id=p_invoice);
 if me is null or a.id is null or not(a.player_id=me or venue_can(a.establishment_id,'cash') or venue_can(a.establishment_id,'reports')) then raise exception 'FATURA: Sem acesso ao histórico.';end if;
 return coalesce((select jsonb_agg(credit_intent_json(t) order by created_at desc) from(select * from venue_credit_intents where invoice_id=p_invoice and (p_intent is null or id=p_intent) and(p_before is null or created_at<p_before) order by created_at desc limit 20)t),'[]'::jsonb);
end$$;
revoke all on function credit_payment_net(uuid),credit_allocation_net(uuid,uuid,int),credit_intent_json(venue_credit_intents),credit_invoice_json(uuid),credit_payment_service(text,jsonb),credit_checkout_history(uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function credit_payment_service(text,jsonb) to service_role;
grant execute on function credit_checkout_history(uuid,timestamptz,uuid) to authenticated;
