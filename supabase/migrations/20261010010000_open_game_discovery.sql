-- Divulgação opt-in: nunca transforma automaticamente uma pelada privada em pública.
create table public.public_game_listings (
  game_id uuid primary key references public.games(id) on delete cascade,
  published boolean not null default false,
  level text not null default 'all' check (level in ('all','beginner','intermediate','advanced')),
  description text not null default '' check (length(description) <= 500),
  updated_at timestamptz not null default now()
);
create table public.public_game_join_requests (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique(game_id,player_id)
);
alter table public.public_game_listings enable row level security;
alter table public.public_game_join_requests enable row level security;
revoke all on public.public_game_listings, public.public_game_join_requests from anon, authenticated;

create function public.publish_open_game(p_game_id uuid, p_published boolean, p_level text, p_description text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare g public.games;
begin
  select * into g from public.games where id = p_game_id;
  if not public.platform_account_allowed() or not public.is_admin_of_pelada(g.pelada_id) then raise exception 'Somente o administrador deste time publica o jogo' using errcode = '42501'; end if;
  if p_level not in ('all','beginner','intermediate','advanced') or p_level is null or p_published is null or length(coalesce(p_description,'')) > 500 then raise exception 'Publicação inválida'; end if;
  if p_published and (g.scheduled_at <= now() or g.status not in ('open','full')) then raise exception 'Só jogos futuros com chamada aberta podem ser publicados'; end if;
  insert into public.public_game_listings(game_id,published,level,description) values(p_game_id,p_published,p_level,coalesce(p_description,''))
    on conflict(game_id) do update set published = excluded.published, level = excluded.level, description = excluded.description, updated_at = now();
end $$;

create function public.list_open_games(p_sport text default null, p_query text default '') returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.platform_account_allowed() then raise exception 'Entre com uma conta ativa para descobrir jogos' using errcode = '42501'; end if;
  if not coalesce((select (settings->>'discoveryEnabled')::boolean from public.platform_configuration where id),false) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row) from (
    select g.id as "gameId", p.name as "teamName", p.sport_id as "sportId", f.name as "fieldName", f.address,
      g.scheduled_at as "scheduledAt", g.duration_minutes as "durationMinutes", g.max_players as "maxPlayers", g.field_cost as "fieldCost", l.level, l.description,
      (select count(*) from public.attendances a where a.game_id = g.id and a.status = 'confirmed') as "confirmedCount",
      (select r.status from public.public_game_join_requests r join public.players me on me.id = r.player_id where r.game_id = g.id and me.auth_user_id = auth.uid()) as "requestStatus"
    from public.public_game_listings l join public.games g on g.id = l.game_id join public.peladas p on p.id = g.pelada_id join public.fields f on f.id = g.field_id
    where l.published and g.status in ('open','full') and g.scheduled_at > now()
      and (p_sport is null or p.sport_id = p_sport)
      and (coalesce(p_query,'') = '' or p.name ilike '%'||left(p_query,80)||'%' or f.name ilike '%'||left(p_query,80)||'%' or f.address ilike '%'||left(p_query,80)||'%')
    order by g.scheduled_at limit 100
  ) row),'[]'::jsonb);
end $$;

create function public.request_open_game(p_game_id uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare me_player_id uuid; g public.games; request_status text;
begin
  if not public.platform_account_allowed() or not coalesce((select (settings->>'discoveryEnabled')::boolean from public.platform_configuration where id),false) then raise exception 'Solicitações indisponíveis'; end if;
  select id into me_player_id from public.players where auth_user_id = auth.uid();
  if me_player_id is null then raise exception 'Complete seu perfil antes de solicitar'; end if;
  select * into g from public.games where id = p_game_id;
  if not exists(select 1 from public.public_game_listings where game_id = p_game_id and published) or g.scheduled_at <= now() or g.status not in ('open','full') then raise exception 'Jogo indisponível'; end if;
  if exists(select 1 from public.attendances a where a.game_id = p_game_id and a.player_id = me_player_id and a.status in ('confirmed','waitlist')) then raise exception 'Você já está na chamada deste jogo'; end if;
  insert into public.public_game_join_requests(game_id,player_id) values(p_game_id,me_player_id)
    on conflict(game_id,player_id) do nothing;
  select r.status into request_status from public.public_game_join_requests r where r.game_id = p_game_id and r.player_id = me_player_id;
  return request_status;
end $$;

create function public.open_game_admin_data(p_game_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.platform_account_allowed() or not exists(select 1 from public.games g where g.id = p_game_id and public.is_admin_of_pelada(g.pelada_id)) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return jsonb_build_object(
    'listing', (select jsonb_build_object('published',published,'level',level,'description',description) from public.public_game_listings where game_id = p_game_id),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'playerId',r.player_id,'name',p.name,'status',r.status)) from public.public_game_join_requests r join public.players p on p.id = r.player_id where r.game_id = p_game_id),'[]'::jsonb)
  );
end $$;

create function public.respond_open_game_request(p_request_id uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.public_game_join_requests; g public.games; target_status text; occupied integer;
begin
  select * into r from public.public_game_join_requests where id = p_request_id;
  if r.id is null or p_accept is null then raise exception 'Solicitação inválida'; end if;
  select * into g from public.games where id = r.game_id for update;
  -- Todas as aprovações deste jogo são serializadas pelo lock da partida.
  select * into r from public.public_game_join_requests where id = p_request_id for update;
  if not public.platform_account_allowed() or not public.is_admin_of_pelada(g.pelada_id) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if r.status <> 'pending' then return r.status; end if;
  if not p_accept then update public.public_game_join_requests set status = 'declined' where id = r.id; return 'declined'; end if;
  if g.scheduled_at <= now() or g.status not in ('open','full') then raise exception 'Chamada encerrada'; end if;
  if exists(select 1 from public.platform_account_controls where player_id = r.player_id and suspended) then raise exception 'Conta suspensa'; end if;
  select status into target_status from public.attendances where game_id = g.id and player_id = r.player_id and status in ('confirmed','waitlist');
  if target_status is null then
    select count(*) into occupied from public.attendances where game_id = g.id and status = 'confirmed';
    target_status := case when occupied < g.max_players then 'confirmed' else 'waitlist' end;
  end if;
  insert into public.pelada_memberships(pelada_id,player_id,role,active) values(g.pelada_id,r.player_id,'member',true)
    on conflict(pelada_id,player_id) do update set active = true;
  insert into public.attendances(game_id,player_id,status,confirmed_order) values(g.id,r.player_id,target_status,(select coalesce(max(confirmed_order),0)+1 from public.attendances where game_id = g.id))
    on conflict(game_id,player_id) do update set status = excluded.status, confirmed_order = excluded.confirmed_order;
  update public.public_game_join_requests set status = 'accepted' where id = r.id;
  return target_status;
end $$;
revoke all on function public.publish_open_game(uuid,boolean,text,text), public.list_open_games(text,text), public.request_open_game(uuid), public.open_game_admin_data(uuid), public.respond_open_game_request(uuid,boolean) from public;
grant execute on function public.publish_open_game(uuid,boolean,text,text), public.list_open_games(text,text), public.request_open_game(uuid), public.open_game_admin_data(uuid), public.respond_open_game_request(uuid,boolean) to authenticated;
