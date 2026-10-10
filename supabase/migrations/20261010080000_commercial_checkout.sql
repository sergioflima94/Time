-- Uma mensalidade por checkout, sem débito/renovação automática.
create table public.commercial_checkout_orders (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.platform_commercial_agreements(id),
  cycle integer not null check(cycle between 1 and 36),
  amount numeric(12,2) not null check(amount>0),
  status text not null default 'pending' check(status in ('pending','paid','refunded','disputed')),
  checkout_url text,
  building boolean not null default false,
  preference_id text,
  provider_payment_id text unique,
  provider_updated_at timestamptz,
  period_end timestamptz,
  expires_at timestamptz not null default now()+interval '24 hours',
  terms_version text not null,
  terms_accepted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(agreement_id,cycle)
);
alter table public.commercial_checkout_orders enable row level security;
revoke all on public.commercial_checkout_orders from anon,authenticated;
grant select,insert,update on public.commercial_checkout_orders to service_role;
create function public.commercial_checkout_state(p_agreement uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a public.platform_commercial_agreements;
begin
  select * into a from platform_commercial_agreements where id=p_agreement;
  if a.id is null or not public.commercial_target_manager(a.audience,a.target_id) then raise exception 'Sem permissão'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'cycle',o.cycle,'amount',o.amount,'status',o.status,'periodEnd',o.period_end,'expiresAt',o.expires_at)) from commercial_checkout_orders o where o.agreement_id=a.id),'[]'::jsonb);
end $$;
create function public.prepare_commercial_checkout(p_agreement uuid,p_terms text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.platform_commercial_agreements; o public.commercial_checkout_orders; cycle_now integer;
begin
  select * into a from platform_commercial_agreements where id=p_agreement for update;
  if a.id is null or not public.commercial_target_manager(a.audience,a.target_id) then raise exception 'Você não representa o destinatário'; end if;
  if a.status<>'accepted' or a.kind='license' then raise exception 'Aceite uma oferta paga primeiro'; end if;
  if p_terms is distinct from 'monthly-manual-v1' then raise exception 'Confirme as condições do checkout mensal'; end if;
  if not exists(select 1 from commercial_plans where id=a.plan_id and active) then raise exception 'Plano indisponível'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commercial-target:'||a.audience||':'||a.target_id,0));
  if exists(select 1 from commercial_checkout_orders pending_order join platform_commercial_agreements other on other.id=pending_order.agreement_id
    where other.audience=a.audience and other.target_id=a.target_id and other.id<>a.id and pending_order.status='pending' and pending_order.expires_at>now()) then raise exception 'Conclua ou reconcilie o outro checkout pendente deste perfil'; end if;
  if exists(select 1 from commercial_checkout_orders where agreement_id=a.id and status in ('refunded','disputed')) then raise exception 'Contrato exige revisão após estorno/contestação'; end if;
  if exists(select 1 from commercial_subscriptions s where s.status='active' and s.current_period_end>now() and
    case a.audience when 'player' then s.subscriber_player_id=a.target_id when 'team' then s.pelada_id=a.target_id else s.establishment_id=a.target_id end)
    then raise exception 'Já existe um período pago ativo; renove após seu encerramento'; end if;
  select coalesce(max(cycle),0)+1 into cycle_now from commercial_checkout_orders where agreement_id=a.id and status='paid';
  if cycle_now>a.duration_months then raise exception 'Mensalidades negociadas concluídas. Solicite uma nova oferta'; end if;
  insert into commercial_checkout_orders(agreement_id,cycle,amount,terms_version,terms_accepted_by) values(a.id,cycle_now,a.agreed_monthly_price,p_terms,auth.uid())
    on conflict(agreement_id,cycle) do nothing;
  select * into o from commercial_checkout_orders where agreement_id=a.id and cycle=cycle_now for update;
  if o.status<>'pending' then raise exception 'Cobrança exige revisão'; end if;
  if o.expires_at<=now() then
    raise exception 'Checkout expirado. O suporte precisa reconciliar a cobrança antes de reabrir';
  end if;
  insert into platform_admin_audit(actor_auth_user_id,action,target_id,reason,after_value) values(auth.uid(),'commercial_checkout',o.id::text,'Aceite das condições de uma mensalidade, sem renovação automática',jsonb_build_object('terms',p_terms,'amount',o.amount,'cycle',o.cycle));
  return to_jsonb(o)||jsonb_build_object('audience',a.audience,'title',(select name from commercial_plans where id=a.plan_id));
end $$;
create function public.claim_commercial_preference(p_order uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.commercial_checkout_orders;
begin
  select * into o from commercial_checkout_orders where id=p_order for update;
  if o.id is null or o.status<>'pending' or o.checkout_url is not null or o.building or o.expires_at<=now() then return false; end if;
  update commercial_checkout_orders set building=true where id=o.id;
  return true;
end $$;
-- Somente o webhook assinado chama esta função, após consultar o pagamento no provedor.
create function public.settle_commercial_checkout(p_order uuid,p_payment text,p_amount numeric,p_currency text,p_status text,p_approved_at timestamptz,p_updated_at timestamptz) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.commercial_checkout_orders; a public.platform_commercial_agreements; finish timestamptz;
begin
  select * into o from commercial_checkout_orders where id=p_order for update;
  if o.id is null or p_currency is distinct from 'BRL' or p_amount is distinct from o.amount or length(coalesce(p_payment,''))<1 then raise exception 'Pagamento incompatível'; end if;
  if o.provider_payment_id is not null and o.provider_payment_id<>p_payment then raise exception 'Pagamento duplicado para a mesma mensalidade: revisão/estorno necessário'; end if;
  if o.provider_updated_at is not null and p_updated_at<=o.provider_updated_at then return; end if;
  select * into a from platform_commercial_agreements where id=o.agreement_id;
  if p_status='approved' then
    if o.status in ('refunded','disputed') then raise exception 'Estorno/contestação não pode ser reativado automaticamente'; end if;
    if p_approved_at is null or p_approved_at>now()+interval '5 minutes' then raise exception 'Data de pagamento inválida'; end if;
    finish:=coalesce(o.period_end,p_approved_at+interval '1 month');
    update commercial_checkout_orders set status='paid',provider_payment_id=p_payment,provider_updated_at=p_updated_at,period_end=finish where id=o.id;
    insert into commercial_subscriptions(plan_id,subscriber_player_id,pelada_id,establishment_id,provider,provider_subscription_id,status,current_period_end)
      values(a.plan_id,case when a.audience='player' then a.target_id end,case when a.audience='team' then a.target_id end,case when a.audience='establishment' then a.target_id end,'mercado_pago_monthly','commercial:'||o.id,'active',finish)
      on conflict(provider_subscription_id) do update set status='active',current_period_end=excluded.current_period_end;
  elsif p_status in ('refunded','charged_back','in_mediation') then
    update commercial_checkout_orders set status=case when p_status='refunded' then 'refunded' else 'disputed' end,provider_payment_id=p_payment,provider_updated_at=p_updated_at where id=o.id;
    update commercial_subscriptions set status='cancelled' where provider_subscription_id='commercial:'||o.id;
  else return;
  end if;
  insert into platform_admin_audit(action,target_id,reason,after_value) values('commercial_payment',o.id::text,'Pagamento consultado no Mercado Pago após webhook assinado',jsonb_build_object('status',p_status,'payment',p_payment));
end $$;
revoke all on function public.commercial_checkout_state(uuid),public.prepare_commercial_checkout(uuid,text),public.settle_commercial_checkout(uuid,text,numeric,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.commercial_checkout_state(uuid),public.prepare_commercial_checkout(uuid,text) to authenticated;
grant execute on function public.settle_commercial_checkout(uuid,text,numeric,text,text,timestamptz,timestamptz) to service_role;
revoke all on function public.claim_commercial_preference(uuid) from public,anon,authenticated;
grant execute on function public.claim_commercial_preference(uuid) to service_role;

create or replace function public.commercial_access_snapshot() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.platform_account_allowed() then raise exception 'Sessão indisponível' using errcode='42501'; end if;
  return jsonb_build_object('role',public.platform_admin_role(),
    'licenses',coalesce((select jsonb_agg(row) from (
      select jsonb_build_object('id',a.id,'audience',a.audience,'targetId',a.target_id,'planId',a.plan_id,'expiresAt',a.expires_at) as row
      from platform_commercial_agreements a where a.kind='license' and a.status='granted' and (a.expires_at is null or a.expires_at>now()) and public.commercial_target_member(a.audience,a.target_id)
      union all
      select jsonb_build_object('id',s.id,'audience',p.audience,'targetId',coalesce(s.subscriber_player_id,s.pelada_id,s.establishment_id),'planId',s.plan_id,'expiresAt',s.current_period_end,'paid',true)
      from commercial_subscriptions s join commercial_plans p on p.id=s.plan_id where s.status='active' and s.current_period_end>now()
        and s.provider='mercado_pago_monthly' and public.commercial_target_member(p.audience,coalesce(s.subscriber_player_id,s.pelada_id,s.establishment_id))
    ) x),'[]'::jsonb),
    'agreements',coalesce((select jsonb_agg(public.commercial_agreement_json(a)) from platform_commercial_agreements a where public.commercial_target_manager(a.audience,a.target_id)),'[]'::jsonb));
end $$;
