-- In-app initiation of a manual privacy workflow. Never deletes business data
-- or authentication records just because a request was received.
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  status text not null default 'requested' check (status in ('requested','processing','cancelled','completed')),
  requested_at timestamptz not null default now(),
  expected_by timestamptz not null default now() + interval '7 days',
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index account_deletion_one_open on public.account_deletion_requests(auth_user_id)
  where status in ('requested','processing');
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public,anon,authenticated;

create function public.account_deletion_self(p_action text default 'status') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); r public.account_deletion_requests; p uuid;
begin
  if actor is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  -- Requests remain available to suspended users. The actor always comes from Auth.
  perform pg_advisory_xact_lock(hashtextextended(actor::text,490));
  if p_action not in ('status','request','cancel') then raise exception 'Ação inválida.'; end if;
  select * into r from public.account_deletion_requests where auth_user_id=actor
    order by requested_at desc limit 1 for update;
  if p_action='request' and (r.id is null or r.status in ('cancelled','completed')) then
    select id into p from public.players where auth_user_id=actor;
    insert into public.account_deletion_requests(auth_user_id,player_id) values(actor,p) returning * into r;
  elsif p_action='cancel' and r.status='requested' then
    update public.account_deletion_requests set status='cancelled',updated_at=now() where id=r.id returning * into r;
  elsif p_action='cancel' and r.status='processing' then
    raise exception 'O processamento já começou. Fale com o atendimento para verificar se ainda é possível interromper.';
  end if;
  if r.id is null then return null; end if;
  return jsonb_build_object('id',r.id,'status',r.status,'requestedAt',r.requested_at,
    'expectedBy',r.expected_by,'completedAt',r.completed_at);
end $$;

create function public.account_deletion_admin(p_request uuid default null,p_action text default 'list') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.account_deletion_requests; result jsonb;
begin
  if public.platform_admin_role() is null then raise exception 'Acesso restrito à plataforma.' using errcode='42501'; end if;
  if p_action not in ('list','process') then raise exception 'Ação inválida.'; end if;
  if p_action='process' then
    select * into r from public.account_deletion_requests where id=p_request for update;
    if r.id is null or r.status not in ('requested','processing') then raise exception 'Pedido não está aberto.'; end if;
    update public.account_deletion_requests set status='processing',updated_at=now() where id=r.id;
    insert into public.platform_admin_audit(actor_auth_user_id,action,target_id,reason)
      values(auth.uid(),'account_deletion_processing',r.id::text,'Iniciado atendimento do pedido de exclusão. Ainda não confirma apagamento.');
  end if;
  select coalesce(jsonb_agg(x),'[]'::jsonb) into result from (
    select d.id,d.status,d.auth_user_id as "authUserId",d.player_id as "playerId",
      coalesce(p.name,'Conta sem perfil') as name,u.email,
      d.requested_at as "requestedAt",d.expected_by as "expectedBy"
    from public.account_deletion_requests d left join public.players p on p.id=d.player_id
      left join auth.users u on u.id=d.auth_user_id
    where d.status in ('requested','processing') order by d.requested_at limit 100
  ) x;
  return result;
end $$;
revoke all on function public.account_deletion_self(text),public.account_deletion_admin(uuid,text) from public,anon;
grant execute on function public.account_deletion_self(text),public.account_deletion_admin(uuid,text) to authenticated;
-- Completion is service-only, after an operator verified erasure and sent confirmation.
-- There is intentionally no client-side "mark deleted" button.
grant select,update on public.account_deletion_requests to service_role;
