create table venue_credit_intents (
 id uuid primary key default gen_random_uuid(),invoice_id uuid not null references venue_credit_invoices(id),gateway_id uuid not null references payment_gateway_connections(id),secret_id uuid not null,
 provider text not null check(provider in('mercado_pago','picpay')),amount_cents int not null check(amount_cents>0),created_by uuid not null references players(id),
 state text not null default 'building' check(state in('building','pending','uncertain','paid','cancelled','refunded','review')),
 external_id text,provider_payment_id text,pix_code text,checkout_url text,collector_id text,payment_id uuid unique references venue_credit_payments(id),
 expires_at timestamptz not null default (now()+interval '30 minutes'),created_at timestamptz not null default now(),refund_requested_at timestamptz,
 unique(gateway_id,external_id)
);
create unique index credit_one_live_checkout on venue_credit_intents(invoice_id) where state in('building','pending','uncertain','review');
create unique index credit_picpay_order_number on venue_credit_intents(gateway_id,substr(id::text,1,15));
create table venue_credit_gateway_events(id uuid primary key default gen_random_uuid(),intent_id uuid not null references venue_credit_intents(id),provider_payment_id text not null,event_status text not null,provider_updated_at timestamptz,amount_cents int not null,created_at timestamptz not null default now(),unique(intent_id,provider_payment_id,event_status,provider_updated_at));
create table venue_credit_gateway_reviews(id uuid primary key default gen_random_uuid(),intent_id uuid not null references venue_credit_intents(id),code text not null,created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid references players(id),resolution text);
do $$declare t text;begin foreach t in array array['venue_credit_intents','venue_credit_gateway_events','venue_credit_gateway_reviews'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon,authenticated',t);end loop;end$$;
create or replace function credit_invoice_held(i uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from venue_credit_intents where invoice_id=i and state in('building','pending','uncertain','review'))$$;
create function credit_line_hold_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin if credit_invoice_held(new.invoice_id) then raise exception 'FATURA: Há pagamento em preparação ou reconciliação. Resolva antes de alterar o saldo.';end if;return new;end$$;
create trigger credit_line_hold_guard before insert on venue_credit_lines for each row execute function credit_line_hold_guard();
alter function credit_action(text,jsonb) rename to credit_action_v3;
revoke all on function credit_action_v3(text,jsonb) from public,anon,authenticated;
create function credit_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare i uuid;a uuid;result jsonb;begin
 if community_chat_me() is null then raise exception 'FATURA: Entre na conta.';end if;
 if p_action in('receive_invoice','credit_note','reverse_payment') then
  i:=case when p_action='reverse_payment' then (select invoice_id from venue_credit_payments where id=(p_data->>'paymentId')::uuid) else (p_data->>'invoiceId')::uuid end;
  select account_id into a from venue_credit_invoices where id=i;perform 1 from venue_credit_accounts where id=a for update;
  -- An exact successful retry returns the original receipt even if a later checkout exists.
  if not exists(select 1 from venue_credit_requests where id=(p_data->>'requestId')::uuid and actor=community_chat_me() and action=p_action and request_data=p_data) and credit_invoice_held(i) then raise exception 'FATURA: Consulte ou cancele o Pix no provedor antes de baixar ou corrigir manualmente.';end if;
 end if;
 return credit_action_v3(p_action,p_data);
end$$;
create function credit_actor_allowed(p uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from players where id=p and not is_guest and not exists(select 1 from platform_account_controls where player_id=p and suspended))$$;
create function credit_actor_can(v uuid,p uuid,c text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select credit_actor_allowed(p) and (exists(select 1 from establishments where id=v and owner_player_id=p) or exists(select 1 from establishment_staff s join venue_staff_grants g using(establishment_id,player_id) where s.establishment_id=v and s.player_id=p and s.active and c=any(g.capabilities)))$$;
-- Service-only context: the raw credential envelope is never returned by a client RPC.
create function credit_payment_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare who uuid;a venue_credit_accounts;i venue_credit_invoices;c payment_gateway_connections;t venue_credit_intents;nonce uuid;prior venue_credit_requests;result jsonb;secret jsonb;
 n bigint;pay uuid;remaining int;part int;entry_row record;ref text;stamp timestamptz;provider_state text;claimed boolean:=false;begin
 if auth.role()<>'service_role' or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>32768 then raise exception 'FATURA: Serviço não autorizado.';end if;
 if p_action in('prepare','context','refund_claim','recover_access') then
  select id into who from players where auth_user_id=(p_data->>'actor')::uuid and not is_guest;if not credit_actor_allowed(who) then raise exception 'FATURA: Conta não autorizada.';end if;
 end if;
 if p_action='prepare' then
  select * into i from venue_credit_invoices where id=(p_data->>'invoiceId')::uuid;
  select * into a from venue_credit_accounts where id=i.account_id for update;
  if a.id is null or (a.player_id<>who and not credit_actor_can(a.establishment_id,who,'cash')) then raise exception 'FATURA: Sem acesso à fatura.';end if;
  nonce:=(p_data->>'requestId')::uuid;if nonce is null then raise exception 'FATURA: Identificador obrigatório.';end if;
  perform pg_advisory_xact_lock(hashtext(nonce::text));select * into prior from venue_credit_requests where id=nonce;
  if prior.id is not null then if prior.actor<>who or prior.action<>'checkout_prepare' or prior.request_data<>p_data then raise exception 'FATURA: Identificador já utilizado.';end if;return prior.result||jsonb_build_object('claimed',false);end if;
  select * into t from venue_credit_intents where invoice_id=i.id and state in('building','pending','uncertain','review');
  if t.id is null then
   n:=credit_balance(i.id);if n<=0 then raise exception 'FATURA: Fatura sem saldo.';end if;
   select * into c from payment_gateway_connections where establishment_id=a.establishment_id and status='connected' and pix_enabled and provider in('mercado_pago','picpay') and credential_secret_id is not null;
   if c.id is null then raise exception 'FATURA: O estabelecimento precisa configurar um gateway Pix.';end if;
   if c.provider='picpay' and (p_data->>'allowPicpay')::boolean is distinct from true then raise exception 'FATURA: PicPay de faturas aguarda homologação específica.';end if;
   select decrypted_secret::jsonb into secret from vault.decrypted_secrets where id=c.credential_secret_id;
   if secret is null or coalesce(length(secret->>'webhookSecret'),0)<16 or (c.provider='mercado_pago' and coalesce(secret->>'accessToken','')='') or (c.provider='picpay' and (coalesce(secret->>'clientId','')='' or coalesce(secret->>'clientSecret','')='')) then raise exception 'FATURA: Configure credenciais e segredo de webhook no Vault.';end if;
   insert into venue_credit_intents(invoice_id,gateway_id,secret_id,provider,amount_cents,created_by) values(i.id,c.id,c.credential_secret_id,c.provider,n,who) returning * into t;claimed:=true;
  end if;
  result:=jsonb_build_object('id',t.id,'claimed',claimed);insert into venue_credit_requests values(nonce,who,'checkout_prepare',p_data,result,now());return result;
 end if;
 select * into t from venue_credit_intents where id=(p_data->>'intentId')::uuid;
 select * into i from venue_credit_invoices where id=t.invoice_id;select * into a from venue_credit_accounts where id=i.account_id for update;
 select * into t from venue_credit_intents where id=t.id for update;
 if t.id is null then raise exception 'FATURA: Cobrança não encontrada.';end if;
 if p_action in('context','refund_claim','recover_access') and (a.player_id<>who and not credit_actor_can(a.establishment_id,who,'cash')) then raise exception 'FATURA: Sem acesso à cobrança.';end if;
 if p_action in('refund_claim','recover_access') and not exists(select 1 from establishments where id=a.establishment_id and owner_player_id=who) then raise exception 'FATURA: Só o dono trata devoluções e recuperação.';end if;
 if p_action='refund_claim' then
  if exists(select 1 from venue_credit_intents where invoice_id=i.id and id<>t.id and state in('building','pending','uncertain','review')) then raise exception 'FATURA: Resolva a outra cobrança ativa antes de devolver um recebimento anterior.';end if;
  if t.state<>'paid' or t.payment_id is null then raise exception 'FATURA: Só um pagamento confirmado pode ser devolvido.';end if;
  if t.refund_requested_at is not null then return jsonb_build_object('claimed',false);end if;
  update venue_credit_intents set refund_requested_at=now() where id=t.id;return jsonb_build_object('claimed',true);
 elsif p_action='recover_access' then return jsonb_build_object('allowed',true);
 elsif p_action in('context','webhook_context') then
  select decrypted_secret::jsonb into secret from vault.decrypted_secrets where id=t.secret_id;
  if secret is null then raise exception 'FATURA: Credencial histórica indisponível. Procure o dono.';end if;
  return to_jsonb(t)||jsonb_build_object('gateway',jsonb_build_object('id',t.gateway_id,'provider',t.provider,'collector_id',t.collector_id),'credentials',secret,'total_cents',t.amount_cents,'reference','invoice:'||t.id::text,'required_method','pix',
   'customer',(select jsonb_build_object('name',p.name,'email',u.email) from players p join auth.users u on u.id=p.auth_user_id where p.id=a.player_id),
   'venue_id',a.establishment_id,'can_refund',exists(select 1 from establishments where id=a.establishment_id and owner_player_id=who));
 elsif p_action='checkout_save' then
  if t.state not in('building','uncertain','pending') then return jsonb_build_object('id',t.id);end if;
  if coalesce(p_data->>'externalId','')='' or (t.external_id is not null and t.external_id<>p_data->>'externalId') then raise exception 'FATURA: Cobrança externa divergente.';end if;
  update venue_credit_intents set external_id=p_data->>'externalId',collector_id=coalesce(collector_id,p_data->>'collectorId'),pix_code=p_data->>'pixCode',checkout_url=p_data->>'url',state='pending' where id=t.id;
 elsif p_action='uncertain' then update venue_credit_intents set state='uncertain' where id=t.id and state='building';
 elsif p_action='review' then
  insert into venue_credit_gateway_reviews(intent_id,code) select t.id,left(coalesce(p_data->>'code','provider_mismatch'),80) where not exists(select 1 from venue_credit_gateway_reviews where intent_id=t.id and resolved_at is null);
  update venue_credit_intents set state='review' where id=t.id and state not in('refunded');
  insert into venue_notices(player_id,establishment_id,title,body) select owner_player_id,id,'Pagamento de fatura precisa de conferência','O provedor retornou divergência ou resultado inconclusivo. Não faça outra baixa antes de conferir.' from establishments where id=a.establishment_id;
 elsif p_action='settle' then
  n:=(p_data->>'amountCents')::int;ref:=p_data->>'paymentId';stamp:=(p_data->>'updatedAt')::timestamptz;provider_state:=p_data->>'status';
  if n is distinct from t.amount_cents or p_data->>'currency' is distinct from 'BRL' or (p_data->>'gatewayId')::uuid is distinct from t.gateway_id or ref is null or length(ref)>120 or stamp is null then raise exception 'FATURA: Confirmação divergente.';end if;
  if t.provider_payment_id is not null and t.provider_payment_id<>ref then raise exception 'FATURA: Há mais de um pagamento no provedor. Revisão necessária.';end if;
  if exists(select 1 from venue_credit_gateway_events where intent_id=t.id and provider_payment_id=ref and provider_updated_at>stamp) then return jsonb_build_object('id',t.id,'stale',true);end if;
  if provider_state='approved' then
   if t.state='refunded' then return jsonb_build_object('id',t.id,'stale',true);end if;
   if t.payment_id is null then
    if credit_balance(i.id)<t.amount_cents then raise exception 'FATURA: Saldo mudou; pagamento exige revisão para não cobrar duas vezes.';end if;
    insert into venue_credit_payments(invoice_id,amount_cents,method,reference,received_by,paid_at) values(i.id,n,'online_pix',ref,t.created_by,clock_timestamp()) returning id into pay;
    remaining:=n;for entry_row in select l.id,l.amount_cents-coalesce((select sum(x.amount_cents) from venue_credit_allocations x where x.line_id=l.id and not exists(select 1 from venue_credit_reversals r where r.payment_id=x.payment_id)),0) pending from venue_credit_lines l where invoice_id=i.id order by posted_at,id loop part:=least(remaining,entry_row.pending);if part>0 then insert into venue_credit_allocations values(pay,entry_row.id,part);remaining:=remaining-part;end if;exit when remaining=0;end loop;
    if remaining<>0 then raise exception 'FATURA: Alocação financeira divergente.';end if;
    update venue_credit_intents set state='paid',payment_id=pay,provider_payment_id=ref where id=t.id;
   end if;
  elsif provider_state='refunded' then
   if t.payment_id is null then raise exception 'FATURA: Devolução sem recebimento registrado: reconcilie primeiro.';end if;
   insert into venue_credit_reversals(payment_id,reason,actor,provider_confirmed) values(t.payment_id,'Devolução integral confirmada no provedor',t.created_by,true) on conflict(payment_id) do nothing;
   update venue_credit_intents set state='refunded' where id=t.id;
  else raise exception 'FATURA: Estado do provedor exige revisão.';end if;
  insert into venue_credit_gateway_events(intent_id,provider_payment_id,event_status,provider_updated_at,amount_cents) values(t.id,ref,provider_state,stamp,n) on conflict do nothing;
  insert into venue_credit_gateway_reviews(intent_id,code) select x.id,'another_receipt_changed_balance' from venue_credit_intents x where x.invoice_id=i.id and x.id<>t.id and x.state in('building','pending','uncertain') and x.amount_cents>credit_balance(i.id);
  update venue_credit_intents set state='review' where invoice_id=i.id and id<>t.id and state in('building','pending','uncertain') and amount_cents>credit_balance(i.id);
  perform credit_refresh_sources(i.id);
  insert into venue_notices(player_id,establishment_id,title,body) select a.player_id,a.establishment_id,'Atualização de pagamento Pix','Consulte sua fatura; a confirmação foi verificada no provedor.' where not exists(select 1 from venue_notices where player_id=a.player_id and title='Atualização de pagamento Pix' and created_at>now()-interval '1 minute');
 elsif p_action='terminal' then
  if t.payment_id is not null then raise exception 'FATURA: Não cancele um recebimento sem devolver no provedor.';end if;
  update venue_credit_intents set state='cancelled' where id=t.id and state in('building','pending','uncertain');
 else raise exception 'FATURA: Serviço inválido.';end if;
 perform venue_ping(a.establishment_id);return jsonb_build_object('id',t.id);
end$$;
create function credit_online_public(i uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('available',exists(select 1 from venue_credit_invoices x join venue_credit_accounts a on a.id=x.account_id join payment_gateway_connections c on c.establishment_id=a.establishment_id where x.id=i and c.status='connected' and c.pix_enabled and c.provider in('mercado_pago','picpay') and c.credential_secret_id is not null),
 'held',credit_invoice_held(i),'intents',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'state',state,'provider',provider,'amount_cents',amount_cents,'pix_code',pix_code,'checkout_url',checkout_url,'created_at',created_at,'expires_at',expires_at,'refund_requested_at',refund_requested_at) order by created_at desc) from (select * from venue_credit_intents where invoice_id=i order by created_at desc limit 10)t),'[]'::jsonb))
$$;
alter function credit_invoice_json(uuid) rename to credit_invoice_json_v2;
revoke all on function credit_invoice_json_v2(uuid) from public,anon,authenticated;
create function credit_invoice_json(p_invoice uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select credit_invoice_json_v2(p_invoice)||jsonb_build_object('online',credit_online_public(p_invoice),'received_cents',coalesce((select sum(p.amount_cents) from venue_credit_payments p where invoice_id=p_invoice and not exists(select 1 from venue_credit_reversals r where r.payment_id=p.id)),0))$$;
revoke all on function credit_line_hold_guard(),credit_actor_allowed(uuid),credit_actor_can(uuid,uuid,text),credit_payment_service(text,jsonb),credit_online_public(uuid),credit_invoice_json(uuid),credit_action(text,jsonb) from public,anon,authenticated;
grant execute on function credit_payment_service(text,jsonb) to service_role;
grant execute on function credit_action(text,jsonb) to authenticated;
