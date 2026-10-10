-- Licenças gratuitas e ofertas individuais não são pagamentos nem papéis admin.
create table public.platform_commercial_agreements (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('player','team','establishment')),
  target_id uuid not null,
  plan_id uuid not null references public.commercial_plans(id),
  kind text not null check (kind in ('license','discount','price')),
  status text not null check (status in ('granted','offered','accepted','declined','revoked')),
  list_monthly_price numeric(12,2) not null check (list_monthly_price >= 0),
  agreed_monthly_price numeric(12,2) not null check (agreed_monthly_price between 0 and 10000),
  discount_percent numeric(5,2),
  duration_months integer,
  expires_at timestamptz,
  note text not null default '' check (length(note) <= 500),
  revision integer not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  responded_by uuid references auth.users(id),
  responded_at timestamptz,
  revoked_at timestamptz,
  check ((kind='license' and agreed_monthly_price=0 and discount_percent is null and duration_months is null and status in ('granted','revoked'))
    or (kind in ('discount','price') and agreed_monthly_price>0 and duration_months between 1 and 36 and expires_at is not null and status in ('offered','accepted','declined','revoked'))),
  check ((kind='discount' and discount_percent>0 and discount_percent<100) or (kind<>'discount' and discount_percent is null))
);
create index commercial_agreements_target on public.platform_commercial_agreements(audience,target_id,status);
alter table public.platform_commercial_agreements enable row level security;
revoke all on public.platform_commercial_agreements from anon,authenticated;

create function public.commercial_target_manager(p_audience text,p_target uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select public.platform_account_allowed() and case p_audience
    when 'player' then exists(select 1 from public.players where id=p_target and auth_user_id=auth.uid() and not is_guest)
    when 'team' then exists(select 1 from public.pelada_memberships m join public.players p on p.id=m.player_id where m.pelada_id=p_target and m.active and m.role='admin' and p.auth_user_id=auth.uid())
    when 'establishment' then exists(select 1 from public.establishments e join public.players p on p.id=e.owner_player_id where e.id=p_target and p.auth_user_id=auth.uid())
    else false end;
$$;
create function public.commercial_target_member(p_audience text,p_target uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select public.commercial_target_manager(p_audience,p_target) or (public.platform_account_allowed() and case p_audience
    when 'team' then exists(select 1 from public.pelada_memberships m join public.players p on p.id=m.player_id where m.pelada_id=p_target and m.active and p.auth_user_id=auth.uid())
    when 'establishment' then exists(select 1 from public.establishment_staff s join public.players p on p.id=s.player_id where s.establishment_id=p_target and s.active and p.auth_user_id=auth.uid())
    else false end);
$$;

create function public.commercial_agreement_json(a public.platform_commercial_agreements) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
  select jsonb_build_object('id',a.id,'audience',a.audience,'targetId',a.target_id,'planId',a.plan_id,'kind',a.kind,'status',a.status,
    'listMonthlyPrice',a.list_monthly_price,'agreedMonthlyPrice',a.agreed_monthly_price,'discountPercent',a.discount_percent,
    'durationMonths',a.duration_months,'expiresAt',a.expires_at,'note',a.note,'revision',a.revision,'createdAt',a.created_at,'respondedAt',a.responded_at);
$$;

create function public.save_commercial_agreement(p_payload jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.platform_commercial_agreements; plan public.commercial_plans; expiry timestamptz; value_now numeric; percentage numeric; months integer; target uuid; kind_now text;
begin
  if public.platform_admin_role() is distinct from 'owner' then raise exception 'Somente o proprietário concede condições comerciais' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,''))) not between 8 and 1000 then raise exception 'Informe um motivo entre 8 e 1000 caracteres'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Condição inválida'; end if;
  select * into plan from public.commercial_plans where id=(p_payload->>'planId')::uuid and active for share;
  if plan.id is null or plan.audience is distinct from p_payload->>'audience' then raise exception 'Plano e destinatário incompatíveis'; end if;
  target := (p_payload->>'targetId')::uuid; kind_now := p_payload->>'kind';
  if target is null or kind_now is null or kind_now not in ('license','discount','price') then raise exception 'Destinatário ou modalidade inválidos'; end if;
  if not (case plan.audience
    when 'player' then exists(select 1 from public.players p where p.id=target and not p.is_guest and p.auth_user_id is not null and not exists(select 1 from public.platform_account_controls c where c.player_id=p.id and c.suspended))
    when 'team' then exists(select 1 from public.peladas where id=target)
    when 'establishment' then exists(select 1 from public.establishments where id=target)
    else false end) then raise exception 'Destinatário não encontrado ou indisponível'; end if;
  expiry := nullif(p_payload->>'expiresAt','')::timestamptz;
  if expiry is not null and (expiry<=now() or expiry>now()+interval '10 years') then raise exception 'Prazo deve ser futuro e de até 10 anos'; end if;
  if length(coalesce(p_payload->>'note',''))>500 then raise exception 'Observação muito longa'; end if;
  if kind_now='license' then value_now:=0;
  else
    if expiry is null then raise exception 'Oferta precisa de prazo para resposta'; end if;
    if jsonb_typeof(p_payload->'durationMonths') is distinct from 'number' or (p_payload->>'durationMonths')::numeric<>trunc((p_payload->>'durationMonths')::numeric) then raise exception 'Duração inválida'; end if;
    months:=(p_payload->>'durationMonths')::integer;
    if months not between 1 and 36 then raise exception 'Duração de 1 a 36 mensalidades'; end if;
    if kind_now='discount' then
      if jsonb_typeof(p_payload->'discountPercent') is distinct from 'number' then raise exception 'Desconto inválido'; end if;
      percentage:=(p_payload->>'discountPercent')::numeric;
      if percentage<=0 or percentage>=100 or percentage<>round(percentage,2) then raise exception 'Desconto entre 0 e 100%%; para gratuidade use licença'; end if;
      value_now:=round(plan.monthly_price*(1-percentage/100),2);
    else
      if jsonb_typeof(p_payload->'agreedMonthlyPrice') is distinct from 'number' then raise exception 'Preço inválido'; end if;
      value_now:=(p_payload->>'agreedMonthlyPrice')::numeric;
    end if;
    if value_now<=0 or value_now>10000 or value_now<>round(value_now,2) then raise exception 'Preço deve ser positivo, em centavos, até R$ 10.000'; end if;
  end if;
  insert into public.platform_commercial_agreements(audience,target_id,plan_id,kind,status,list_monthly_price,agreed_monthly_price,discount_percent,duration_months,expires_at,note,created_by)
    values(plan.audience,target,plan.id,kind_now,case when kind_now='license' then 'granted' else 'offered' end,plan.monthly_price,value_now,percentage,months,expiry,coalesce(p_payload->>'note',''),auth.uid()) returning * into a;
  insert into public.platform_admin_audit(actor_auth_user_id,action,target_id,reason,after_value)
    values(auth.uid(),'commercial.grant',a.id::text,trim(p_reason),to_jsonb(a));
  return a.id;
end $$;

create function public.revoke_commercial_agreement(p_id uuid,p_revision integer,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.platform_commercial_agreements; before_now jsonb;
begin
  if public.platform_admin_role() is distinct from 'owner' then raise exception 'Somente o proprietário revoga condições comerciais' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,''))) not between 8 and 1000 then raise exception 'Informe um motivo entre 8 e 1000 caracteres'; end if;
  select * into a from public.platform_commercial_agreements where id=p_id for update;
  if a.id is null then raise exception 'Condição não encontrada'; end if;
  if a.revision is distinct from p_revision then raise exception 'Condição alterada. Atualize a página' using errcode='40001'; end if;
  if a.status='revoked' then return; end if;
  before_now:=to_jsonb(a);
  update public.platform_commercial_agreements set status='revoked',revoked_at=now(),revision=revision+1 where id=p_id returning * into a;
  insert into public.platform_admin_audit(actor_auth_user_id,action,target_id,reason,before_value,after_value)
    values(auth.uid(),'commercial.revoke',a.id::text,trim(p_reason),before_now,to_jsonb(a));
end $$;

create function public.respond_commercial_agreement(p_id uuid,p_revision integer,p_accept boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.platform_commercial_agreements; before_now jsonb;
begin
  select * into a from public.platform_commercial_agreements where id=p_id for update;
  if a.id is null or not public.commercial_target_manager(a.audience,a.target_id) then raise exception 'Você não representa este destinatário' using errcode='42501'; end if;
  if p_accept is null then raise exception 'Resposta inválida'; end if;
  if a.revision is distinct from p_revision then raise exception 'Condição alterada. Atualize a página' using errcode='40001'; end if;
  if a.status<>'offered' or a.expires_at<=now() then raise exception 'Oferta não está disponível'; end if;
  before_now:=to_jsonb(a);
  update public.platform_commercial_agreements set status=case when p_accept then 'accepted' else 'declined' end,responded_by=auth.uid(),responded_at=now(),revision=revision+1 where id=p_id returning * into a;
  insert into public.platform_admin_audit(actor_auth_user_id,action,target_id,reason,before_value,after_value)
    values(auth.uid(),'commercial.response',a.id::text,case when p_accept then 'Oferta aceita pelo destinatário; aguardando contratação e pagamento' else 'Oferta recusada pelo destinatário' end,before_now,to_jsonb(a));
  -- Não ativa plano, não credita carteira nem registra pagamento.
end $$;

create function public.commercial_admin_data() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if public.platform_admin_role() is distinct from 'owner' then raise exception 'Somente o proprietário consulta negociações globais' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(public.commercial_agreement_json(a)) from (select * from public.platform_commercial_agreements order by created_at desc limit 200) a),'[]'::jsonb);
end $$;
create function public.commercial_access_snapshot() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.platform_account_allowed() then raise exception 'Sessão indisponível' using errcode='42501'; end if;
  return jsonb_build_object('role',public.platform_admin_role(),
    'licenses',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'audience',a.audience,'targetId',a.target_id,'planId',a.plan_id,'expiresAt',a.expires_at))
      from public.platform_commercial_agreements a where a.kind='license' and a.status='granted' and (a.expires_at is null or a.expires_at>now()) and public.commercial_target_member(a.audience,a.target_id)),'[]'::jsonb),
    'agreements',coalesce((select jsonb_agg(public.commercial_agreement_json(a)) from public.platform_commercial_agreements a where public.commercial_target_manager(a.audience,a.target_id)),'[]'::jsonb));
end $$;
revoke all on function public.commercial_agreement_json(public.platform_commercial_agreements), public.commercial_target_manager(text,uuid), public.commercial_target_member(text,uuid), public.save_commercial_agreement(jsonb,text), public.revoke_commercial_agreement(uuid,integer,text), public.respond_commercial_agreement(uuid,integer,boolean), public.commercial_admin_data(), public.commercial_access_snapshot() from public;
grant execute on function public.save_commercial_agreement(jsonb,text), public.revoke_commercial_agreement(uuid,integer,text), public.respond_commercial_agreement(uuid,integer,boolean), public.commercial_admin_data(), public.commercial_access_snapshot() to authenticated;
