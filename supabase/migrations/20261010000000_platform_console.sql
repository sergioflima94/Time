-- Console da plataforma. Nenhum papel é concedido por cadastro/user_metadata.
create table public.platform_admin_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'support')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.platform_configuration (
  id boolean primary key default true check (id),
  revision integer not null default 1,
  settings jsonb not null default '{"discoveryEnabled":true,"referralsEnabled":true,"sponsoredEnabled":false,"bookingCommissionPercent":0,"whatsappMonthlyAllowance":100,"trialDays":14}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.platform_configuration(id) values (true);
create table public.platform_account_controls (
  player_id uuid primary key references public.players(id) on delete cascade,
  suspended boolean not null default false,
  reason text not null,
  updated_at timestamptz not null default now()
);
create table public.platform_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_id text,
  reason text not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);
alter table public.platform_admin_accounts enable row level security;
alter table public.platform_configuration enable row level security;
alter table public.platform_account_controls enable row level security;
alter table public.platform_admin_audit enable row level security;
revoke all on public.platform_admin_accounts, public.platform_account_controls, public.platform_admin_audit from anon, authenticated;
grant select on public.platform_configuration to anon, authenticated;
create policy platform_configuration_read on public.platform_configuration for select using (true);

create function public.platform_account_allowed() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and not exists (
    select 1 from public.platform_account_controls c join public.players p on p.id = c.player_id
    where p.auth_user_id = auth.uid() and c.suspended
  );
$$;
create function public.platform_admin_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.platform_admin_accounts
  where auth_user_id = auth.uid() and active and public.platform_account_allowed();
$$;
revoke all on function public.platform_account_allowed(), public.platform_admin_role() from public;
grant execute on function public.platform_account_allowed(), public.platform_admin_role() to authenticated;

-- Um token antigo de conta suspensa não continua escrevendo nas tabelas do app.
do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and c.relname not like 'platform_%'
  loop
    execute format('create policy platform_active_account on public.%I as restrictive for all to authenticated using (public.platform_account_allowed()) with check (public.platform_account_allowed())', t.relname);
  end loop;
end $$;

-- Resolução de denúncia é exclusiva de um moderador da plataforma.
drop policy if exists moderation_reporter_update on public.moderation_reports;

create function public.platform_console_snapshot(p_query text default '') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare admin_role text; result jsonb; q text := left(coalesce(p_query, ''), 80);
begin
  admin_role := public.platform_admin_role();
  if admin_role is null then raise exception 'Acesso exclusivo da administração da plataforma' using errcode = '42501'; end if;
  select jsonb_build_object(
    'role', admin_role,
    'configuration', (select jsonb_build_object('revision', revision, 'settings', settings) from public.platform_configuration where id),
    'metrics', jsonb_build_object(
      'players', (select count(*) from public.players where not is_guest),
      'teams', (select count(*) from public.peladas),
      'establishments', (select count(*) from public.establishments),
      'upcomingGames', (select count(*) from public.games where scheduled_at >= now() and status not in ('cancelled','finished')),
      'openReports', (select count(*) from public.moderation_reports where status in ('open','reviewing')),
      'activeSubscriptions', (select count(*) from public.commercial_subscriptions where status = 'active' and current_period_end > now())
    ),
    'players', coalesce((select jsonb_agg(x) from (
      select p.id, p.name, p.nickname, p.auth_user_id as "authUserId", p.created_at as "createdAt", coalesce(c.suspended,false) as suspended
      from public.players p left join public.platform_account_controls c on c.player_id = p.id
      where not p.is_guest and (q = '' or p.name ilike '%' || q || '%' or p.nickname ilike '%' || q || '%')
      order by p.created_at desc limit 100
    ) x), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(x) from (
      select id, name, sport_id as "sportId", created_at as "createdAt" from public.peladas
      where q = '' or name ilike '%' || q || '%' order by created_at desc limit 100
    ) x), '[]'::jsonb),
    'establishments', coalesce((select jsonb_agg(x) from (
      select e.id, e.name, e.owner_player_id as "ownerPlayerId", (select count(*) from public.fields f where f.establishment_id = e.id) as "fieldCount"
      from public.establishments e where q = '' or e.name ilike '%' || q || '%' order by e.created_at desc limit 100
    ) x), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'audience',audience,'monthlyPrice',monthly_price,'benefits',benefits,'highlighted',highlighted,'active',active)) from public.commercial_plans), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(x) from (
      select id, target_id as "targetId", target_type as "targetType", reason, details, status, created_at as "createdAt"
      from public.moderation_reports order by created_at desc limit 100
    ) x), '[]'::jsonb),
    'admins', case when admin_role = 'owner' then coalesce((select jsonb_agg(jsonb_build_object('authUserId',a.auth_user_id,'name',coalesce(p.name,'Conta cadastrada'),'role',a.role,'active',a.active)) from public.platform_admin_accounts a left join public.players p on p.auth_user_id = a.auth_user_id),'[]'::jsonb) else '[]'::jsonb end,
    'audit', coalesce((select jsonb_agg(x) from (
      select id, action, target_id as "targetId", reason, created_at as "createdAt" from public.platform_admin_audit order by created_at desc limit 100
    ) x), '[]'::jsonb)
  ) into result;
  return result;
end $$;

create function public.platform_console_action(p_action text, p_id uuid, p_payload jsonb, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare admin_role text; previous jsonb; changed jsonb; config public.platform_configuration; target_player public.players; requested_role text;
begin
  admin_role := public.platform_admin_role();
  if admin_role is null then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason,''))) < 8 then raise exception 'Informe um motivo com pelo menos 8 caracteres'; end if;
  if p_action is null or jsonb_typeof(p_payload) is distinct from 'object' or p_action not in ('report','settings','plan','account','admin') then raise exception 'Ação não permitida'; end if;
  if admin_role = 'support' and p_action <> 'report' then raise exception 'Suporte só pode tratar denúncias' using errcode = '42501'; end if;
  if p_action = 'settings' then
    select * into config from public.platform_configuration where id for update;
    if (p_payload->>'revision')::integer is distinct from config.revision then raise exception 'Configuração mudou. Atualize antes de salvar.' using errcode = '40001'; end if;
    changed := p_payload->'settings';
    if jsonb_typeof(changed) is distinct from 'object' then raise exception 'Configuração inválida'; end if;
    if (select count(*) from jsonb_object_keys(changed)) <> 6
      or not changed ?& array['discoveryEnabled','referralsEnabled','sponsoredEnabled','bookingCommissionPercent','whatsappMonthlyAllowance','trialDays']
      or jsonb_typeof(changed->'discoveryEnabled') is distinct from 'boolean' or jsonb_typeof(changed->'referralsEnabled') is distinct from 'boolean' or jsonb_typeof(changed->'sponsoredEnabled') is distinct from 'boolean'
      or jsonb_typeof(changed->'bookingCommissionPercent') is distinct from 'number' or (changed->>'bookingCommissionPercent')::numeric not between 0 and 20
      or jsonb_typeof(changed->'whatsappMonthlyAllowance') is distinct from 'number' or (changed->>'whatsappMonthlyAllowance')::numeric not between 0 and 10000
      or jsonb_typeof(changed->'trialDays') is distinct from 'number' or (changed->>'trialDays')::numeric not between 1 and 30
      or (changed->>'trialDays')::numeric <> trunc((changed->>'trialDays')::numeric)
      or (changed->>'whatsappMonthlyAllowance')::numeric <> trunc((changed->>'whatsappMonthlyAllowance')::numeric)
    then raise exception 'Configuração inválida'; end if;
    previous := config.settings;
    update public.platform_configuration set settings = changed, revision = revision + 1, updated_at = now() where id;
  elsif p_action = 'plan' then
    select to_jsonb(p) into previous from public.commercial_plans p where id = p_id for update;
    if previous is null then raise exception 'Plano não encontrado'; end if;
    if jsonb_typeof(p_payload->'monthlyPrice') is distinct from 'number' or (p_payload->>'monthlyPrice')::numeric not between 0 and 10000
      or length(trim(coalesce(p_payload->>'name',''))) not between 3 and 80 or jsonb_typeof(p_payload->'active') is distinct from 'boolean'
    then raise exception 'Nome, preço ou estado inválidos'; end if;
    update public.commercial_plans set name = trim(p_payload->>'name'), monthly_price = (p_payload->>'monthlyPrice')::numeric, active = (p_payload->>'active')::boolean where id = p_id returning to_jsonb(commercial_plans.*) into changed;
  elsif p_action = 'report' then
    if coalesce(p_payload->>'status','') not in ('reviewing','resolved','dismissed') then raise exception 'Estado de denúncia inválido'; end if;
    select to_jsonb(r) into previous from public.moderation_reports r where id = p_id for update;
    if previous is null then raise exception 'Denúncia não encontrada'; end if;
    update public.moderation_reports set status = p_payload->>'status', resolved_at = case when p_payload->>'status' in ('resolved','dismissed') then now() else null end where id = p_id returning to_jsonb(moderation_reports.*) into changed;
  elsif p_action = 'account' then
    select * into target_player from public.players where id = p_id;
    if target_player.id is null then raise exception 'Conta não encontrada'; end if;
    if exists (select 1 from public.platform_admin_accounts where auth_user_id = target_player.auth_user_id and active) then raise exception 'Revogue o papel administrativo antes de suspender a conta'; end if;
    if jsonb_typeof(p_payload->'suspended') is distinct from 'boolean' then raise exception 'Estado inválido'; end if;
    select to_jsonb(c) into previous from public.platform_account_controls c where player_id = p_id for update;
    insert into public.platform_account_controls(player_id,suspended,reason) values (p_id,(p_payload->>'suspended')::boolean,trim(p_reason))
      on conflict(player_id) do update set suspended = excluded.suspended, reason = excluded.reason, updated_at = now() returning to_jsonb(platform_account_controls.*) into changed;
  elsif p_action = 'admin' then
    if admin_role <> 'owner' then raise exception 'Só o proprietário gerencia administradores' using errcode = '42501'; end if;
    -- Serializa revogações concorrentes para não remover todos os proprietários.
    perform 1 from public.platform_admin_accounts order by auth_user_id for update;
    requested_role := p_payload->>'role';
    if requested_role not in ('owner','admin','support') or requested_role is null or jsonb_typeof(p_payload->'active') is distinct from 'boolean' then raise exception 'Papel inválido'; end if;
    if not exists (select 1 from auth.users where id = p_id) then raise exception 'A conta deve existir no Supabase Auth'; end if;
    if exists (select 1 from public.platform_account_controls c join public.players p on p.id = c.player_id where p.auth_user_id = p_id and c.suspended) then raise exception 'Reative a conta antes de conceder um papel'; end if;
    select to_jsonb(a) into previous from public.platform_admin_accounts a where auth_user_id = p_id;
    if previous->>'role' = 'owner' and (requested_role <> 'owner' or not (p_payload->>'active')::boolean)
      and (select count(*) from public.platform_admin_accounts where role = 'owner' and active) <= 1 then raise exception 'A plataforma precisa manter um proprietário ativo'; end if;
    insert into public.platform_admin_accounts(auth_user_id,role,active) values(p_id,requested_role,(p_payload->>'active')::boolean)
      on conflict(auth_user_id) do update set role = excluded.role, active = excluded.active returning to_jsonb(platform_admin_accounts.*) into changed;
  end if;
  insert into public.platform_admin_audit(actor_auth_user_id,action,target_id,reason,before_value,after_value)
    values(auth.uid(),p_action,p_id::text,trim(p_reason),previous,changed);
end $$;
revoke all on function public.platform_console_snapshot(text), public.platform_console_action(text,uuid,jsonb,text) from public;
grant execute on function public.platform_console_snapshot(text), public.platform_console_action(text,uuid,jsonb,text) to authenticated;

create function public.can_receive_establishment_payment(p_establishment_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.platform_account_allowed() and (
    public.is_establishment_owner(p_establishment_id) or exists (
      select 1 from public.establishment_staff s join public.players p on p.id = s.player_id
      where s.establishment_id = p_establishment_id and s.active and s.roles && array['manager','cashier']::text[] and p.auth_user_id = auth.uid()
    )
  );
$$;
revoke all on function public.can_receive_establishment_payment(uuid) from public;
grant execute on function public.can_receive_establishment_payment(uuid) to authenticated;

-- Guarda de campos financeiros da aula: o aluno não dá baixa no próprio Pix.
create function public.guard_class_enrollment_payment() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare establishment_id uuid; price_now numeric;
begin
  if auth.role() = 'service_role' or auth.uid() is null then return new; end if;
  select cp.establishment_id,cp.price into establishment_id,price_now from public.class_sessions cs join public.class_programs cp on cp.id = cs.program_id where cs.id = new.session_id;
  if tg_op = 'INSERT' then
    if not public.can_receive_establishment_payment(establishment_id) and (new.amount is distinct from price_now or new.is_trial or new.paid_at is not null or new.payment_method is not null) then raise exception 'Valor/isenção da aula precisa ser autorizado pela operação'; end if;
    if new.payment_status <> 'pending' and not public.can_receive_establishment_payment(establishment_id) then raise exception 'Somente a operação confirma dispensa/pagamento'; end if;
    if new.payment_status in ('paid','refunded') then raise exception 'Pagamento online/reembolso exige confirmação do provedor'; end if;
  elsif new.payment_status is distinct from old.payment_status or new.paid_at is distinct from old.paid_at or new.amount is distinct from old.amount or new.payment_method is distinct from old.payment_method then
    if not public.can_receive_establishment_payment(establishment_id) then raise exception 'Dados financeiros são gerenciados pelo estabelecimento'; end if;
    if new.payment_status = 'paid' and new.payment_method not in ('cash') then raise exception 'Pix/cartão exige confirmação pelo provedor'; end if;
    if new.payment_status = 'refunded' then raise exception 'Reembolso exige confirmação pelo provedor'; end if;
  end if;
  return new;
end $$;
create trigger class_payment_verified before insert or update on public.class_enrollments for each row execute function public.guard_class_enrollment_payment();

-- Cliente não inventa testes ilimitados, benefícios Premium ou conexão OAuth.
drop policy if exists subscriptions_start_trial on public.commercial_subscriptions;
create function public.guard_player_premium() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or auth.role() = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    if new.premium_until is not null or new.premium_since is not null or new.premium_auto_renew then raise exception 'Premium exige confirmação da loja'; end if;
  elsif new.premium_until is distinct from old.premium_until or new.premium_since is distinct from old.premium_since or new.premium_auto_renew is distinct from old.premium_auto_renew then raise exception 'Premium exige confirmação da loja'; end if;
  return new;
end $$;
create trigger player_premium_verified before insert or update on public.players for each row execute function public.guard_player_premium();

create function public.guard_gateway_connection() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or auth.role() = 'service_role' then return new; end if;
  if new.provider <> 'manual_pix' then
    if tg_op = 'INSERT' or new is distinct from old then raise exception 'Conexão de gateway é confirmada pelo provedor no backend'; end if;
  elsif new.credential_secret_id is not null or new.card_enabled or new.contactless_enabled then raise exception 'Pix manual não possui credencial ou cartão'; end if;
  return new;
end $$;
create trigger gateway_connection_verified before insert or update on public.payment_gateway_connections for each row execute function public.guard_gateway_connection();
