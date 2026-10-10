create table public.game_highlight_votes (
  game_id uuid not null references public.games(id) on delete cascade,
  voter_player_id uuid not null references public.players(id),
  target_player_id uuid not null references public.players(id),
  primary key(game_id,voter_player_id)
);
alter table public.game_highlight_votes enable row level security;
revoke all on public.game_highlight_votes from anon,authenticated;
create table public.game_recap_consents (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id),
  primary key(game_id,player_id)
);
alter table public.game_recap_consents enable row level security;
revoke all on public.game_recap_consents from anon,authenticated;
create function public.set_recap_consent(p_game uuid,p_allow boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid;
begin
  select id into me from players where auth_user_id=auth.uid();
  if p_allow is null or not public.platform_account_allowed() or not exists(select 1 from games where id=p_game and public.is_member_of_pelada(pelada_id)) then raise exception 'Sem permissão'; end if;
  if p_allow then insert into game_recap_consents(game_id,player_id) values(p_game,me) on conflict do nothing;
  else delete from game_recap_consents where game_id=p_game and player_id=me; end if;
end $$;
create function public.game_recap(p_game uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare g public.games; p public.peladas; participants jsonb;
begin
  select * into g from games where id=p_game;
  if g.id is null or not public.platform_account_allowed() or not public.is_member_of_pelada(g.pelada_id) then raise exception 'Resumo exclusivo dos membros do time'; end if;
  if g.status<>'finished' then raise exception 'Finalize o jogo para ver o resumo'; end if;
  select * into p from peladas where id=g.pelada_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name)),'[]'::jsonb) into participants from players x where exists(
    select 1 from match_turns t, jsonb_array_elements(coalesce(t.roster_snapshot,'[]')) r where t.game_id=g.id and r->>'playerId'=x.id::text
  );
  return jsonb_build_object('name',p.name,'sportId',p.sport_id,'date',g.scheduled_at,'participants',participants,
    'consentedIds',coalesce((select jsonb_agg(player_id) from game_recap_consents where game_id=g.id),'[]'::jsonb),
    'nextGame',(select scheduled_at from games where pelada_id=p.id and scheduled_at>now() and status in ('open','full') order by scheduled_at limit 1),
    'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'teamA',a.name,'teamB',b.name,'scoreA',(select count(*) from goals where match_turn_id=t.id and team_id=a.id),'scoreB',(select count(*) from goals where match_turn_id=t.id and team_id=b.id))) from match_turns t join teams a on a.id=t.team_a_id join teams b on b.id=t.team_b_id where t.game_id=g.id and t.ended_at is not null),'[]'::jsonb),
    'highlights',coalesce((select jsonb_agg(row) from (select v.target_player_id as id,x.name,count(*) as votes from game_highlight_votes v join players x on x.id=v.target_player_id where v.game_id=g.id group by v.target_player_id,x.name order by count(*) desc,x.name) row),'[]'::jsonb));
end $$;
create function public.vote_game_highlight(p_game uuid,p_player uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid; g public.games;
begin
  select * into g from games where id=p_game;
  select id into me from players where auth_user_id=auth.uid();
  if not public.platform_account_allowed() or not public.is_member_of_pelada(g.pelada_id) or g.status<>'finished' then raise exception 'Sem permissão'; end if;
  if not exists(select 1 from match_turns t,jsonb_array_elements(coalesce(t.roster_snapshot,'[]')) r where t.game_id=g.id and r->>'playerId'=me::text)
    or not exists(select 1 from match_turns t,jsonb_array_elements(coalesce(t.roster_snapshot,'[]')) r where t.game_id=g.id and r->>'playerId'=p_player::text) then raise exception 'A votação requer participação registrada na escalação'; end if;
  insert into game_highlight_votes(game_id,voter_player_id,target_player_id) values(g.id,me,p_player)
    on conflict(game_id,voter_player_id) do update set target_player_id=excluded.target_player_id;
end $$;
revoke all on function public.game_recap(uuid),public.vote_game_highlight(uuid,uuid),public.set_recap_consent(uuid,boolean) from public,anon;
grant execute on function public.game_recap(uuid),public.vote_game_highlight(uuid,uuid),public.set_recap_consent(uuid,boolean) to authenticated;
