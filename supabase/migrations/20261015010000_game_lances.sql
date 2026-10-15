-- Lances: private uploads -> verified media -> deliberate publication.
-- No score/goal writes, no camera URL fetches, and no client camera credentials.
create table public.game_lances (
 id uuid primary key default gen_random_uuid(), game_id uuid not null references games(id) on delete cascade,
 author_id uuid not null references players(id), nonce uuid not null,
 title text not null check(length(btrim(title)) between 3 and 100),
 caption text not null default '' check(length(caption)<=1200),
 kind text not null default 'play' check(kind in ('goal','point','save','play')),
 scorer_id uuid references players(id), assist_id uuid references players(id),
 scorer_confirmed boolean not null default false, assist_confirmed boolean not null default false,
 media_key text not null unique, duration_seconds numeric not null check(duration_seconds>0 and duration_seconds<=90),
 status text not null default 'uploading' check(status in ('uploading','ready','deleted')),
 visibility text not null default 'team' check(visibility in ('team','public')),
 published_at timestamptz, rights_confirmed_at timestamptz,
 source text not null default 'upload' check(source in ('upload','camera')),
 hidden boolean not null default false, revision integer not null default 1,
 created_at timestamptz not null default now(), unique(author_id,nonce),
 check(scorer_id is null or assist_id is null or scorer_id<>assist_id),
 check(kind in ('goal','point') or (scorer_id is null and assist_id is null))
);
create index game_lances_timeline on public.game_lances(game_id,created_at desc,id);
create index game_lances_feed on public.game_lances(published_at desc,id) where published_at is not null and not hidden and status='ready';
create table public.lance_likes (
 lance_id uuid references game_lances(id) on delete cascade, player_id uuid references players(id) on delete cascade,
 primary key(lance_id,player_id)
);
create table public.lance_comments (
 id uuid primary key default gen_random_uuid(), lance_id uuid not null references game_lances(id) on delete cascade,
 player_id uuid not null references players(id), body text not null check(length(btrim(body)) between 1 and 500),
 nonce uuid not null, created_at timestamptz not null default now(), unique(player_id,nonce)
);
create table public.lance_reports (
 lance_id uuid references game_lances(id), reporter_id uuid references players(id), report_id uuid references moderation_reports(id),
 primary key(lance_id,reporter_id)
);
-- Disabled until a real partner, device binding and capture permissions are configured.
create table public.lance_camera_sources (
 id uuid primary key default gen_random_uuid(), field_id uuid not null references fields(id),
 provider text not null, name text not null, enabled boolean not null default false
);
create table public.lance_camera_events (
 source_id uuid references lance_camera_sources(id), event_id uuid not null,
 lance_id uuid not null references game_lances(id), captured_at timestamptz not null,
 primary key(source_id,event_id)
);
do $$ declare t text; begin
 foreach t in array array['game_lances','lance_likes','lance_comments','lance_reports','lance_camera_sources','lance_camera_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
end $$;

create function public.lance_member(p_game uuid,p_me uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select p_me is not null and exists(select 1 from games g join pelada_memberships m on m.pelada_id=g.pelada_id
 where g.id=p_game and m.player_id=p_me and m.active)
$$;
create function public.lance_manager(p_game uuid,p_me uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from games g join pelada_memberships m on m.pelada_id=g.pelada_id
 where g.id=p_game and m.player_id=p_me and m.active and m.role='admin')
$$;
create function public.lance_participant(p_game uuid,p_player uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.lance_member(p_game,p_player) and exists(select 1 from attendances a join players p on p.id=a.player_id
 where a.game_id=p_game and a.player_id=p_player and a.status='confirmed' and not a.no_show and not p.is_guest and p.auth_user_id is not null)
$$;
create function public.lance_read(p_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from game_lances l where l.id=p_id and l.status<>'deleted' and (not l.hidden or public.platform_admin_role() is not null)
 and (auth.uid() is null or public.community_chat_me() is not null)
 and not exists(select 1 from community_chat_blocks b where
 (b.player_id=public.community_chat_me() and b.blocked_player_id=l.author_id)
 or (b.blocked_player_id=public.community_chat_me() and b.player_id=l.author_id))
 and (public.platform_admin_role() is not null or l.author_id=public.community_chat_me()
 or public.lance_manager(l.game_id,public.community_chat_me())
 or (l.status='ready' and l.published_at is not null and
 (l.visibility='public' or public.lance_member(l.game_id,public.community_chat_me())))))
$$;
create function public.lance_json(l public.game_lances) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',l.id,'gameId',l.game_id,'teamId',g.pelada_id,'teamName',t.name,'sportId',t.sport_id,
 'authorId',l.author_id,'authorName',coalesce(nullif(p.nickname,''),p.name),'title',l.title,'caption',l.caption,'kind',l.kind,
 'scorerId',l.scorer_id,'scorerName',(select coalesce(nullif(nickname,''),name) from players where id=l.scorer_id),
 'assistId',l.assist_id,'assistName',(select coalesce(nullif(nickname,''),name) from players where id=l.assist_id),
 'scorerConfirmed',l.scorer_confirmed,'assistConfirmed',l.assist_confirmed,
 'mediaKey',case when l.status='ready' then l.media_key else null end,'durationSeconds',l.duration_seconds,
 'status',l.status,'visibility',l.visibility,'publishedAt',l.published_at,'source',l.source,'createdAt',l.created_at,'revision',l.revision,
 'hidden',l.hidden,'canModerate',public.platform_admin_role() is not null,
 'canManage',l.author_id=public.community_chat_me() or public.lance_manager(l.game_id,public.community_chat_me()),
 'likes',(select count(*) from lance_likes where lance_id=l.id),
 'liked',(select exists(select 1 from lance_likes where lance_id=l.id and player_id=public.community_chat_me())),
 'commentCount',(select count(*) from lance_comments where lance_id=l.id))
 from games g join peladas t on t.id=g.pelada_id join players p on p.id=l.author_id where g.id=l.game_id
$$;
create function public.lance_snapshot(p_game uuid default null,p_team uuid default null,p_id uuid default null,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me(); list jsonb; roster jsonb:='[]'; comments jsonb:='[]';
begin
 if auth.uid() is not null and me is null then raise exception 'LANCES:Entre em uma conta ativa'; end if;
 if p_game is not null and not public.lance_member(p_game,me) then raise exception 'LANCES:Este jogo é exclusivo dos membros do time'; end if;
 if p_team is not null and not exists(select 1 from pelada_memberships where pelada_id=p_team and player_id=me and active) then raise exception 'LANCES:Sem acesso ao time'; end if;
 if p_id is not null and not public.lance_read(p_id) then raise exception 'LANCES:Lance indisponível ou privado'; end if;
 select coalesce(jsonb_agg(public.lance_json(x) order by x.created_at desc,x.id desc),'[]') into list
 from (select l.* from game_lances l join games g on g.id=l.game_id
 where public.lance_read(l.id) and (p_game is null or l.game_id=p_game) and (p_team is null or g.pelada_id=p_team)
 and (p_id is null or l.id=p_id) and (p_before is null or (l.created_at,l.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
 and (p_game is not null or p_team is not null or p_id is not null or l.published_at is not null)
 order by l.created_at desc,l.id desc limit 21) x;
 if p_game is not null or (p_id is not null and public.lance_member((select game_id from game_lances where id=p_id),me)) then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.nickname,''),p.name)) order by p.name),'[]') into roster
  from players p where public.lance_participant(coalesce(p_game,(select game_id from game_lances where id=p_id)),p.id);
 end if;
 if p_id is not null then
  select coalesce(jsonb_agg(x.j order by x.at),'[]') into comments from (
   select jsonb_build_object('id',c.id,'playerId',c.player_id,'name',coalesce(nullif(p.nickname,''),p.name),'body',c.body,'createdAt',c.created_at) j,c.created_at at
   from lance_comments c join players p on p.id=c.player_id where c.lance_id=p_id
   and not exists(select 1 from community_chat_blocks b where (b.player_id=me and b.blocked_player_id=c.player_id) or (b.blocked_player_id=me and b.player_id=c.player_id))
   order by c.created_at desc,c.id limit 50) x;
 end if;
 return jsonb_build_object('items',list,'participants',roster,'comments',comments,'me',me);
end $$;

create function public.lance_action(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me(); l public.game_lances; key text; target uuid; report uuid;
begin
 if me is null then raise exception 'LANCES:Entre em uma conta ativa'; end if;
 perform pg_advisory_xact_lock(hashtextextended('lance:'||me::text,0));
 if p_action='create' then
  if not public.lance_member((p_data->>'gameId')::uuid,me) then raise exception 'LANCES:Sem acesso ao jogo'; end if;
  select * into l from game_lances where author_id=me and nonce=(p_data->>'nonce')::uuid;
  if l.id is not null then
   if l.game_id<>(p_data->>'gameId')::uuid or l.status='deleted' then raise exception 'LANCES:Identificador já utilizado'; end if;
   return jsonb_build_object('id',l.id,'mediaKey',l.media_key);
  end if;
  if (select count(*) from game_lances where author_id=me and created_at>now()-interval '1 day')>=20 then raise exception 'LANCES:Limite de 20 envios por dia'; end if;
  l.id:=gen_random_uuid(); key:=me::text||'/'||l.id::text||'.mp4';
  insert into game_lances(id,game_id,author_id,nonce,title,duration_seconds,media_key)
   values(l.id,(p_data->>'gameId')::uuid,me,(p_data->>'nonce')::uuid,btrim(p_data->>'title'),(p_data->>'durationSeconds')::numeric,key) returning * into l;
  return jsonb_build_object('id',l.id,'mediaKey',key);
 end if;
 select * into l from game_lances where id=(p_data->>'id')::uuid for update;
 if l.id is null or l.status='deleted' then raise exception 'LANCES:Lance indisponível'; end if;
 if p_action='moderate' then
  if public.platform_admin_role() is null then raise exception 'LANCES:Moderação restrita'; end if;
  if length(btrim(coalesce(p_data->>'reason','')))<5 or jsonb_typeof(p_data->'hidden') is distinct from 'boolean' then raise exception 'LANCES:Informe o motivo'; end if;
  update game_lances set hidden=(p_data->>'hidden')::boolean,revision=revision+1 where id=l.id;
  insert into platform_admin_audit(actor_auth_user_id,action,target_id,reason,after_value)
   values(auth.uid(),'lance_moderate',l.id::text,p_data->>'reason',jsonb_build_object('hidden',(p_data->>'hidden')::boolean));
  return '{}';
 end if;
 if not public.lance_read(l.id) then raise exception 'LANCES:Lance indisponível ou privado'; end if;
 if p_action in ('finish_upload','edit','publish','unpublish','delete') then
  if not (l.author_id=me or public.lance_manager(l.game_id,me)) then raise exception 'LANCES:Apenas autor ou administrador do time'; end if;
  if p_action not in ('delete','unpublish') and not public.lance_member(l.game_id,me) then raise exception 'LANCES:Sem acesso ao time; você ainda pode retirar ou excluir seu próprio lance'; end if;
  if (p_data->>'revision')::int is distinct from l.revision then raise exception 'LANCES:O lance mudou. Atualize antes de continuar'; end if;
  if p_action='finish_upload' then
   if l.status<>'uploading' then return '{}'; end if;
   if not exists(select 1 from storage.objects where bucket_id='lances' and name=l.media_key
     and (metadata->>'size')::bigint between 1 and 62914560 and metadata->>'mimetype'='video/mp4') then raise exception 'LANCES:Envio incompleto. Envie um MP4 de até 60 MB'; end if;
   update game_lances set status='ready',revision=revision+1 where id=l.id;
  elsif p_action='edit' then
   if l.published_at is not null then raise exception 'LANCES:Retire a publicação antes de editar'; end if;
   if p_data->>'kind' not in ('goal','point','save','play') then raise exception 'LANCES:Tipo inválido'; end if;
   for target in select v::uuid from jsonb_array_elements_text(jsonb_build_array(nullif(p_data->>'scorerId',''),nullif(p_data->>'assistId',''))) v where v is not null loop
    if not public.lance_participant(l.game_id,target) then raise exception 'LANCES:Marque apenas participantes confirmados'; end if;
   end loop;
   update game_lances set title=btrim(p_data->>'title'),caption=coalesce(p_data->>'caption',''),kind=p_data->>'kind',
    scorer_id=nullif(p_data->>'scorerId','')::uuid,assist_id=nullif(p_data->>'assistId','')::uuid,
    scorer_confirmed=coalesce(case when scorer_id=nullif(p_data->>'scorerId','')::uuid then scorer_confirmed else false end or nullif(p_data->>'scorerId','')::uuid=me,false),
    assist_confirmed=coalesce(case when assist_id=nullif(p_data->>'assistId','')::uuid then assist_confirmed else false end or nullif(p_data->>'assistId','')::uuid=me,false),
    revision=revision+1 where id=l.id;
  elsif p_action='publish' then
   if l.status<>'ready' or (p_data->>'rightsConfirmed')::boolean is not true or p_data->>'visibility' not in ('team','public') then raise exception 'LANCES:Confirme o vídeo, a visibilidade e a autorização de publicação'; end if;
   if p_data->>'visibility'='public' and ((l.scorer_id is not null and not l.scorer_confirmed) or (l.assist_id is not null and not l.assist_confirmed)) then raise exception 'LANCES:Para publicar para todos, aguarde a confirmação das marcações ou remova-as'; end if;
   update game_lances set published_at=now(),visibility=p_data->>'visibility',rights_confirmed_at=now(),revision=revision+1 where id=l.id;
  elsif p_action='unpublish' then
   update game_lances set published_at=null,visibility='team',revision=revision+1 where id=l.id;
  else update game_lances set status='deleted',published_at=null,revision=revision+1 where id=l.id;
  end if;
 elsif p_action='tag' then
  if jsonb_typeof(p_data->'accept') is distinct from 'boolean' then raise exception 'LANCES:Resposta inválida'; end if;
  if p_data->>'role'='scorer' and l.scorer_id=me then
   update game_lances set scorer_id=case when (p_data->>'accept')::boolean then me end,scorer_confirmed=(p_data->>'accept')::boolean,
    visibility=case when (p_data->>'accept')::boolean then visibility else 'team' end,revision=revision+1 where id=l.id;
  elsif p_data->>'role'='assist' and l.assist_id=me then
   update game_lances set assist_id=case when (p_data->>'accept')::boolean then me end,assist_confirmed=(p_data->>'accept')::boolean,
    visibility=case when (p_data->>'accept')::boolean then visibility else 'team' end,revision=revision+1 where id=l.id;
  else raise exception 'LANCES:Você só pode responder à própria marcação'; end if;
 elsif p_action in ('like','comment','report') then
  if l.published_at is null or l.status<>'ready' then raise exception 'LANCES:Publique o lance antes de interagir'; end if;
  if p_action='like' then
   if jsonb_typeof(p_data->'liked') is distinct from 'boolean' then raise exception 'LANCES:Reação inválida'; end if;
   if (p_data->>'liked')::boolean then insert into lance_likes values(l.id,me) on conflict do nothing;
   else delete from lance_likes where lance_id=l.id and player_id=me; end if;
  elsif p_action='comment' then
   if (select count(*) from lance_comments where player_id=me and created_at>now()-interval '1 minute')>=20 then raise exception 'LANCES:Aguarde antes de comentar novamente'; end if;
   insert into lance_comments(lance_id,player_id,body,nonce) values(l.id,me,btrim(p_data->>'body'),(p_data->>'nonce')::uuid) on conflict(player_id,nonce) do nothing;
  else
   if p_data->>'reason' not in ('harassment','fraud','unsafe_content','spam','other') then raise exception 'LANCES:Motivo inválido'; end if;
   select report_id into report from lance_reports where lance_id=l.id and reporter_id=me;
   if report is null then
    insert into moderation_reports(reporter_player_id,target_type,target_id,reason,details)
     values(me,'player',l.author_id,p_data->>'reason','Lance '||l.id::text||': '||left(coalesce(p_data->>'details',''),1000)) returning id into report;
    insert into lance_reports values(l.id,me,report);
   end if;
  end if;
 else raise exception 'LANCES:Ação inválida'; end if;
 return jsonb_build_object('id',l.id);
end $$;

-- Only a trusted worker may ingest an already uploaded camera clip.
create function public.lance_camera_ingest(p_source uuid,p_event uuid,p_game uuid,p_captured_at timestamptz,p_duration numeric)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s lance_camera_sources; g games; k text; result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('camera:'||p_source::text||':'||p_event::text,0));
 select * into s from lance_camera_sources where id=p_source and enabled;
 if s.id is null then raise exception 'LANCES:Câmera não habilitada'; end if;
 select lance_id into result from lance_camera_events where source_id=p_source and event_id=p_event;
 if result is not null then return result; end if;
 select * into g from games where id=p_game and field_id=s.field_id and status in ('in_progress','finished');
 if g.id is null or p_captured_at is null or p_captured_at<g.scheduled_at or p_captured_at>g.scheduled_at+make_interval(mins=>g.duration_minutes)
  or p_captured_at>now()+interval '2 minutes' then raise exception 'LANCES:Captura fora da partida'; end if;
 k:='camera/'||s.id::text||'/'||p_event::text||'.mp4';
 if not exists(select 1 from storage.objects where bucket_id='lances' and name=k and metadata->>'mimetype'='video/mp4'
  and (metadata->>'size')::bigint between 1 and 62914560) then raise exception 'LANCES:Vídeo não recebido'; end if;
 insert into game_lances(game_id,author_id,nonce,title,duration_seconds,media_key,source,status)
 values(g.id,g.created_by,p_event,'Lance da câmera',p_duration,k,'camera','ready') returning id into result;
 insert into lance_camera_events values(s.id,p_event,result,p_captured_at);
 return result;
end $$;

revoke all on function public.lance_member(uuid,uuid),public.lance_manager(uuid,uuid),public.lance_participant(uuid,uuid),
 public.lance_read(uuid),public.lance_json(public.game_lances),public.lance_snapshot(uuid,uuid,uuid,timestamptz,uuid),
 public.lance_action(text,jsonb),public.lance_camera_ingest(uuid,uuid,uuid,timestamptz,numeric) from public,anon,authenticated;
grant execute on function public.lance_snapshot(uuid,uuid,uuid,timestamptz,uuid) to anon,authenticated;
grant execute on function public.lance_action(text,jsonb) to authenticated;
grant execute on function public.lance_camera_ingest(uuid,uuid,uuid,timestamptz,numeric) to service_role;
-- Storage policies invoke the helper; it returns only whether this session may read.
grant execute on function public.lance_read(uuid) to anon,authenticated;

create function public.lance_upload_allowed(p_key text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from game_lances l where l.media_key=p_key and l.author_id=public.community_chat_me()
 and l.status='uploading' and public.lance_member(l.game_id,public.community_chat_me()) and split_part(p_key,'/',1)=public.community_chat_me()::text)
$$;
create function public.lance_media_allowed(p_key text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from game_lances l where l.media_key=p_key and l.status='ready' and public.lance_read(l.id))
$$;
revoke all on function public.lance_upload_allowed(text),public.lance_media_allowed(text) from public,anon,authenticated;
grant execute on function public.lance_upload_allowed(text) to authenticated;
grant execute on function public.lance_media_allowed(text) to anon,authenticated;

do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('lances','lances',false,62914560,array['video/mp4']) on conflict(id) do nothing;
 end if;
 if to_regclass('storage.objects') is not null then
  execute $p$create policy lances_upload on storage.objects for insert to authenticated with check(
   bucket_id='lances' and public.lance_upload_allowed(name))$p$;
  execute $p$create policy lances_read on storage.objects for select to anon,authenticated using(
   bucket_id='lances' and public.lance_media_allowed(name))$p$;
 end if;
end $$;
