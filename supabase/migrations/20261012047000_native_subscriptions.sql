-- Digital app licenses only. No venue balance, invoice or service payment writes.
create table public.native_app_subscriptions (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  player_id uuid not null unique references public.players(id) on delete cascade,
  plan_id uuid not null references public.commercial_plans(id),
  source text check (source in ('app_store','play_store')),
  product_id text,
  active boolean not null default false,
  expires_at timestamptz,
  since_at timestamptz,
  auto_renew boolean not null default false,
  checked_at timestamptz not null
);
alter table public.native_app_subscriptions enable row level security;
revoke all on public.native_app_subscriptions from public,anon,authenticated;
grant select,insert,update on public.native_app_subscriptions to service_role;

create table public.native_billing_requests (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(), attempts integer not null default 1
);
alter table public.native_billing_requests enable row level security;
revoke all on public.native_billing_requests from public,anon,authenticated;
grant select,insert,update on public.native_billing_requests to service_role;
create function public.claim_native_sync(p_user uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare counter integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Somente servidor'; end if;
  insert into native_billing_requests(auth_user_id) values(p_user)
  on conflict(auth_user_id) do update set
    attempts=case when native_billing_requests.window_start<now()-interval '1 minute' then 1 else native_billing_requests.attempts+1 end,
    window_start=case when native_billing_requests.window_start<now()-interval '1 minute' then now() else native_billing_requests.window_start end
  returning attempts into counter;
  return counter<=12;
end $$;
revoke all on function public.claim_native_sync(uuid) from public,anon,authenticated;
grant execute on function public.claim_native_sync(uuid) to service_role;

create function public.native_subscription_status() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.players; n public.native_app_subscriptions; blocked boolean;
begin
  if not public.platform_account_allowed() then raise exception 'Sessão indisponível' using errcode='42501'; end if;
  select * into p from players where auth_user_id=auth.uid();
  if p.id is null then raise exception 'Perfil indisponível'; end if;
  select * into n from native_app_subscriptions where auth_user_id=auth.uid();
  blocked := public.platform_admin_role()='owner'
    or coalesce(p.premium_until>now(),false)
    or exists(select 1 from platform_commercial_agreements a where a.audience='player' and a.target_id=p.id and a.kind='license' and a.status='granted' and (a.expires_at is null or a.expires_at>now()))
    or exists(select 1 from commercial_subscriptions s where s.subscriber_player_id=p.id and s.status='active' and s.current_period_end>now())
    or exists(select 1 from commercial_checkout_orders o join platform_commercial_agreements a on a.id=o.agreement_id where a.audience='player' and a.target_id=p.id and o.status='pending' and o.expires_at>now());
  return jsonb_build_object('active',coalesce(n.active and n.expires_at>now(),false),'canPurchase',not coalesce(blocked,false),
    'source',n.source,'expiresAt',p.premium_until,'since',p.premium_since,'autoRenew',coalesce(n.auto_renew and n.active and n.expires_at>now(),false),'playerId',p.id);
end $$;

create function public.apply_native_subscription(p_user uuid,p_plan uuid,p_checked_at timestamptz,p_source text,p_product text,p_expires timestamptz,p_since timestamptz,p_auto_renew boolean,p_active boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.players; n public.native_app_subscriptions;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Somente confirmação do servidor' using errcode='42501'; end if;
  if p_checked_at is null or p_checked_at>now()+interval '5 minutes' or p_checked_at<now()-interval '10 minutes' then raise exception 'Consulta do provedor inválida'; end if;
  if not exists(select 1 from commercial_plans where id=p_plan and audience='player') then raise exception 'Plano Premium incompatível'; end if;
  if p_active is null or p_auto_renew is null or (p_active and (p_source is null or p_source not in ('app_store','play_store') or nullif(p_product,'') is null or p_expires is null or p_expires<=now() or p_since is null or p_since>now()+interval '5 minutes')) then raise exception 'Assinatura incompatível'; end if;
  select * into p from players where auth_user_id=p_user for update;
  if p.id is null then raise exception 'Conta sem perfil'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commercial-target:player:'||p.id,0));
  select * into n from native_app_subscriptions where auth_user_id=p_user for update;
  if n.checked_at is not null and p_checked_at<=n.checked_at then return; end if;
  -- A missing entitlement must not revoke unrelated historical/manual access.
  if not p_active and n.auth_user_id is null then return; end if;
  insert into native_app_subscriptions(auth_user_id,player_id,plan_id,source,product_id,active,expires_at,since_at,auto_renew,checked_at)
    values(p_user,p.id,p_plan,coalesce(p_source,n.source),coalesce(p_product,n.product_id),p_active,p_expires,coalesce(p_since,n.since_at),p_active and p_auto_renew,p_checked_at)
    on conflict(auth_user_id) do update set plan_id=excluded.plan_id,source=excluded.source,product_id=excluded.product_id,active=excluded.active,
      expires_at=excluded.expires_at,since_at=excluded.since_at,auto_renew=excluded.auto_renew,checked_at=excluded.checked_at;
  update players set premium_since=coalesce(p.premium_since,p_since,n.since_at),
    premium_until=case when p_active then p_expires else least(coalesce(p_expires,now()),now()) end,
    premium_auto_renew=p_active and p_auto_renew where id=p.id;
  if n.active is distinct from p_active or n.expires_at is distinct from p_expires or n.auto_renew is distinct from (p_active and p_auto_renew) then
    insert into platform_admin_audit(action,target_id,reason,after_value) values('native_subscription',p.id::text,'Estado consultado no provedor de compras digitais; não é recebimento do campo',
      jsonb_build_object('source',coalesce(p_source,n.source),'active',p_active,'expiresAt',p_expires,'checkedAt',p_checked_at));
  end if;
end $$;
revoke all on function public.native_subscription_status(),public.apply_native_subscription(uuid,uuid,timestamptz,text,text,timestamptz,timestamptz,boolean,boolean) from public,anon,authenticated;
grant execute on function public.native_subscription_status() to authenticated;
grant execute on function public.apply_native_subscription(uuid,uuid,timestamptz,text,text,timestamptz,timestamptz,boolean,boolean) to service_role;

create function public.guard_web_native_overlap() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.platform_commercial_agreements;
begin
  if new.status<>'pending' then return new; end if;
  select * into a from platform_commercial_agreements where id=new.agreement_id;
  if a.audience='player' then
    perform pg_advisory_xact_lock(hashtextextended('commercial-target:player:'||a.target_id,0));
    if exists(select 1 from native_app_subscriptions where player_id=a.target_id and active and expires_at>now()) then
      raise exception 'Já existe assinatura ativa na loja. Gerencie a assinatura de origem antes de contratar outro plano';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_web_native_overlap() from public,anon,authenticated;
create trigger commercial_no_native_overlap before insert or update on public.commercial_checkout_orders for each row execute function public.guard_web_native_overlap();

create or replace function public.commercial_access_snapshot() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.platform_account_allowed() then raise exception 'Sessão indisponível' using errcode='42501'; end if;
  return jsonb_build_object('role',public.platform_admin_role(),
    'licenses',coalesce((select jsonb_agg(row) from (
      select jsonb_build_object('id',a.id,'audience',a.audience,'targetId',a.target_id,'planId',a.plan_id,'expiresAt',a.expires_at) as row
      from platform_commercial_agreements a where a.kind='license' and a.status='granted' and (a.expires_at is null or a.expires_at>now()) and public.commercial_target_member(a.audience,a.target_id)
      union all
      select jsonb_build_object('id',s.id,'audience',p.audience,'targetId',coalesce(s.subscriber_player_id,s.pelada_id,s.establishment_id),'planId',s.plan_id,'expiresAt',s.current_period_end,'paid',true,'paymentSource','web')
      from commercial_subscriptions s join commercial_plans p on p.id=s.plan_id where s.status='active' and s.current_period_end>now()
        and s.provider='mercado_pago_monthly' and public.commercial_target_member(p.audience,coalesce(s.subscriber_player_id,s.pelada_id,s.establishment_id))
      union all
      select jsonb_build_object('id',n.player_id,'audience','player','targetId',n.player_id,'planId',n.plan_id,'expiresAt',n.expires_at,'paid',true,'paymentSource',n.source,'autoRenew',n.auto_renew)
      from native_app_subscriptions n where n.auth_user_id=auth.uid() and n.active and n.expires_at>now()
    ) x),'[]'::jsonb),
    'agreements',coalesce((select jsonb_agg(public.commercial_agreement_json(a)) from platform_commercial_agreements a where public.commercial_target_manager(a.audience,a.target_id)),'[]'::jsonb));
end $$;
