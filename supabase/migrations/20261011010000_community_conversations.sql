-- Conversas integradas: RPCs canônicas, sem listas de participantes controladas pelo cliente.
-- Os canais legados são preservados; nenhum histórico é apagado.
create table public.community_team_chat (
  team_id uuid primary key references public.peladas(id) on delete cascade,
  mode text not null default 'internal' check(mode in ('internal','whatsapp','both')),
  whatsapp_url text,
  admin_only boolean not null default false,
  check(whatsapp_url is null or whatsapp_url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{16,64}/?$'),
  check(mode='internal' or whatsapp_url is not null)
);
create table public.community_chat_preferences (
  player_id uuid primary key references public.players(id) on delete cascade,
  friends_only boolean not null default false
);
create table public.community_chat_blocks (
  player_id uuid not null references public.players(id) on delete cascade,
  blocked_player_id uuid not null references public.players(id) on delete cascade,
  primary key(player_id,blocked_player_id), check(player_id<>blocked_player_id)
);
create table public.community_rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('team','direct','booking')),
  context_id uuid not null,
  booking_kind text check(booking_kind in ('opportunity','automatic','field')),
  a uuid references public.players(id), b uuid references public.players(id),
  requester_id uuid references public.players(id),
  status text not null default 'accepted' check(status in ('pending','accepted','declined')),
  title text not null,
  room_key text not null unique,
  created_at timestamptz not null default clock_timestamp(),
  check((kind='direct' and a is not null and b is not null and a<b and requester_id in (a,b) and booking_kind is null)
    or (kind='team' and a is null and b is null and requester_id is null and booking_kind is null and status='accepted')
    or (kind='booking' and a is null and b is null and requester_id is null and booking_kind is not null and status='accepted'))
);
create table public.community_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.community_rooms(id) on delete cascade,
  sender_id uuid not null references public.players(id),
  text text not null check(char_length(btrim(text)) between 1 and 2000),
  nonce uuid not null, created_at timestamptz not null default clock_timestamp(),
  unique(sender_id,nonce)
);
create index community_message_timeline on public.community_messages(room_id,created_at desc);
create index community_message_rate on public.community_messages(sender_id,created_at desc);
create index community_room_request_rate on public.community_rooms(requester_id,created_at desc);
create table public.community_chat_reads (
  room_id uuid not null references public.community_rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  read_at timestamptz not null default clock_timestamp(), primary key(room_id,player_id)
);
create table public.community_report_evidence (
  reporter_id uuid not null references public.players(id),
  message_id uuid not null references public.community_messages(id),
  report_id uuid not null references public.moderation_reports(id),
  primary key(reporter_id,message_id)
);
do $$ declare t text; begin
  foreach t in array array['community_team_chat','community_chat_preferences','community_chat_blocks','community_rooms','community_messages','community_chat_reads','community_report_evidence'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
  end loop;
end $$;

create function public.community_chat_me() returns uuid
language sql stable security definer set search_path=public,pg_temp as $$
  select id from players where auth_user_id=auth.uid() and public.platform_account_allowed() and not is_guest
$$;
create function public.community_booking_people(p_kind text,p_id uuid) returns uuid[]
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare team uuid; opponent uuid; owner_player uuid; creator uuid; result uuid[];
begin
  if p_kind='opportunity' then
    select r.pelada_id,r.opponent_pelada_id,e.owner_player_id into team,opponent,owner_player
    from opportunity_requests r join opportunity_slots s on s.id=r.slot_id join fields f on f.id=s.field_id
    join establishments e on e.id=f.establishment_id where r.id=p_id;
  elsif p_kind='automatic' then
    select g.pelada_id,e.owner_player_id into team,owner_player from game_booking_requests r
    join games g on g.id=r.game_id join fields f on f.id=r.field_id join establishments e on e.id=f.establishment_id where r.id=p_id;
  elsif p_kind='field' then
    select b.pelada_id,e.owner_player_id,b.created_by into team,owner_player,creator
    from field_bookings b join establishments e on e.id=b.establishment_id where b.id=p_id;
  end if;
  if owner_player is null then return array[]::uuid[]; end if;
  select coalesce(array_agg(distinct player_id),array[]::uuid[]) into result from pelada_memberships
    where pelada_id in (team,opponent) and active and role='admin';
  return array_remove(result || array[owner_player,creator],null);
end $$;
create function public.community_chat_access(p_room uuid,p_messages boolean default false) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me(); r public.community_rooms;
begin
  if me is null then return false; end if;
  select * into r from community_rooms where id=p_room;
  if r.id is null then return false; end if;
  if r.kind='team' then return exists(select 1 from pelada_memberships where pelada_id=r.context_id and player_id=me and active); end if;
  if r.kind='booking' then return me=any(public.community_booking_people(r.booking_kind,r.context_id)); end if;
  if me not in (r.a,r.b) then return false; end if;
  if not p_messages then return true; end if;
  return r.status='accepted' and not exists(select 1 from community_chat_blocks where
    (player_id=r.a and blocked_player_id=r.b) or (player_id=r.b and blocked_player_id=r.a));
end $$;
create function public.community_room_json(r public.community_rooms) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me(); other_player uuid; blocked boolean:=false; last_msg public.community_messages; unread integer:=0; name text;
begin
  if r.kind='direct' then
    other_player:=case when r.a=me then r.b else r.a end;
    select p.name into name from players p where p.id=other_player;
    blocked:=exists(select 1 from community_chat_blocks where (player_id=me and blocked_player_id=other_player) or (player_id=other_player and blocked_player_id=me));
  else name:=r.title; end if;
  if public.community_chat_access(r.id,true) then
    select * into last_msg from community_messages where room_id=r.id order by created_at desc,id desc limit 1;
    select count(*) into unread from community_messages where room_id=r.id and sender_id<>me and created_at>
      coalesce((select read_at from community_chat_reads where room_id=r.id and player_id=me),'-infinity'::timestamptz);
  end if;
  return jsonb_build_object('id',r.id,'kind',r.kind,'contextId',r.context_id,'bookingKind',r.booking_kind,'title',name,
    'status',r.status,'requesterId',r.requester_id,'otherId',other_player,'blocked',blocked,'unread',unread,
    'lastText',last_msg.text,'lastAt',coalesce(last_msg.created_at,r.created_at));
end $$;
create function public.community_chat_snapshot(p_room uuid default null,p_before timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me(); r public.community_rooms; config jsonb; manage boolean:=false; post boolean:=false; messages jsonb:='[]'::jsonb; older boolean:=false;
begin
  if me is null then raise exception 'CHAT:Entre para abrir suas conversas'; end if;
  if p_room is not null then
    if not public.community_chat_access(p_room,false) then raise exception 'CHAT:Conversa indisponível para sua conta'; end if;
    select * into r from community_rooms where id=p_room;
    post:=public.community_chat_access(p_room,true);
    if r.kind='team' then
      manage:=public.is_admin_of_pelada(r.context_id);
      select jsonb_build_object('mode',mode,'whatsappUrl',whatsapp_url,'adminOnly',admin_only) into config from community_team_chat where team_id=r.context_id;
      config:=coalesce(config,'{"mode":"internal","whatsappUrl":null,"adminOnly":false}'::jsonb);
      post:=post and config->>'mode'<>'whatsapp' and (not (config->>'adminOnly')::boolean or manage);
    end if;
    if public.community_chat_access(p_room,true) then
      select coalesce(jsonb_agg(x order by x."createdAt",x.id),'[]'::jsonb) into messages from (
        select m.id,m.sender_id as "senderId",p.name as "senderName",m.text,m.created_at as "createdAt"
        from community_messages m join players p on p.id=m.sender_id where m.room_id=p_room and (p_before is null or m.created_at<p_before)
        order by m.created_at desc,m.id desc limit 50
      ) x;
      older:=(select count(*)>50 from (select 1 from community_messages where room_id=p_room and (p_before is null or created_at<p_before) limit 51) x);
    end if;
  end if;
  return jsonb_build_object(
    'rooms',coalesce((select jsonb_agg(x.v order by x.v->>'lastAt' desc) from (
      select public.community_room_json(c) v from community_rooms c where public.community_chat_access(c.id,false)
      order by c.created_at desc limit 200) x),'[]'::jsonb),
    'room',case when r.id is not null then public.community_room_json(r) else null end,
    'messages',messages,'hasOlder',older,'canPost',post,'canManage',manage,'teamConfig',config,
    'settings',jsonb_build_object('friendsOnly',coalesce((select friends_only from community_chat_preferences where player_id=me),false)),
    'blocks',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name)) from community_chat_blocks b join players p on p.id=b.blocked_player_id where b.player_id=me),'[]'::jsonb)
  );
end $$;
create function public.community_chat_action(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me(); target uuid; room_id uuid; context uuid; a_id uuid; b_id uuid; kind text; booking_kind text; tag text; name text;
  state text:='accepted'; r public.community_rooms; cfg public.community_team_chat; message public.community_messages; report_id uuid; config jsonb; cleaned text; nonce_id uuid;
begin
  if me is null then raise exception 'CHAT:Entre para usar as conversas'; end if;
  -- Serializa limite por remetente, bloqueios, aceite e idempotência; sem identidade enviada pelo cliente.
  perform pg_advisory_xact_lock(hashtextextended('community:actor:'||me::text,0));
  if p_action='settings' then
    if jsonb_typeof(p_data->'friendsOnly') is distinct from 'boolean' then raise exception 'CHAT:Preferência inválida'; end if;
    insert into community_chat_preferences(player_id,friends_only) values(me,(p_data->>'friendsOnly')::boolean)
      on conflict(player_id) do update set friends_only=excluded.friends_only; return '{}'::jsonb;
  elsif p_action in ('block','unblock') then
    target:=(p_data->>'playerId')::uuid;
    if target=me or not exists(select 1 from players where id=target) then raise exception 'CHAT:Jogador inválido'; end if;
    perform pg_advisory_xact_lock(hashtextextended('community:pair:'||least(me,target)::text||greatest(me,target)::text,0));
    if p_action='block' then insert into community_chat_blocks values(me,target) on conflict do nothing;
    else delete from community_chat_blocks where player_id=me and blocked_player_id=target; end if;
    return '{}'::jsonb;
  elsif p_action='team_config' then
    context:=(p_data->>'teamId')::uuid; config:=p_data->'config';
    if not public.is_admin_of_pelada(context) then raise exception 'CHAT:Somente o administrador deste time'; end if;
    if config->>'mode' is null or config->>'mode' not in ('internal','whatsapp','both') or jsonb_typeof(config->'adminOnly') is distinct from 'boolean' then raise exception 'CHAT:Configuração inválida'; end if;
    cleaned:=nullif(btrim(config->>'whatsappUrl'),'');
    if (cleaned is not null and cleaned !~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{16,64}/?$') or (config->>'mode'<>'internal' and cleaned is null) then raise exception 'CHAT:Use o convite HTTPS válido do grupo em chat.whatsapp.com'; end if;
    perform pg_advisory_xact_lock(hashtextextended('community:team:'||context::text,0));
    insert into community_team_chat values(context,config->>'mode',cleaned,(config->>'adminOnly')::boolean)
      on conflict(team_id) do update set mode=excluded.mode,whatsapp_url=excluded.whatsapp_url,admin_only=excluded.admin_only;
    return '{}'::jsonb;
  elsif p_action='open' then
    kind:=p_data->>'kind'; context:=(p_data->>'contextId')::uuid; booking_kind:=p_data->>'bookingKind';
    if kind='direct' then
      target:=context;
      if target=me or not exists(select 1 from players where id=target and not is_guest and auth_user_id is not null)
        or exists(select 1 from platform_account_controls where player_id=target and suspended) then raise exception 'CHAT:Contato indisponível'; end if;
      a_id:=least(me,target); b_id:=greatest(me,target);
      tag:='direct:'||a_id::text||':'||b_id::text;
      perform pg_advisory_xact_lock(hashtextextended('community:pair:'||a_id::text||b_id::text,0));
      if exists(select 1 from community_chat_blocks where (player_id=me and blocked_player_id=target) or (player_id=target and blocked_player_id=me)) then raise exception 'CHAT:Contato indisponível'; end if;
      if not exists(select 1 from friendships where status='accepted' and ((requester_id=me and addressee_id=target) or (requester_id=target and addressee_id=me))) then
        if coalesce((select friends_only from community_chat_preferences where player_id=target),false)
          and not exists(select 1 from community_rooms where room_key=tag) then raise exception 'CHAT:Este jogador recebe novas conversas apenas de amigos'; end if;
        state:='pending';
      end if;
      name:='Conversa privada';
    elsif kind='team' then
      if not public.is_member_of_pelada(context) then raise exception 'CHAT:Conversa exclusiva dos membros do time'; end if;
      select p.name into name from peladas p where id=context; tag:='team:'||context::text;
    elsif kind='booking' then
      if booking_kind is null or booking_kind not in ('opportunity','automatic','field') or not(me=any(public.community_booking_people(booking_kind,context))) then raise exception 'CHAT:Sem permissão para esta reserva'; end if;
      tag:='booking:'||booking_kind||':'||context::text; name:='Atendimento da reserva';
    else raise exception 'CHAT:Tipo de conversa inválido'; end if;
    perform pg_advisory_xact_lock(hashtextextended('community:room:'||tag,0));
    select id into room_id from community_rooms where room_key=tag;
    if room_id is null then
      if state='pending' and (select count(*) from community_rooms where requester_id=me and created_at>now()-interval '24 hours')>=20 then raise exception 'CHAT:Limite diário de solicitações atingido'; end if;
      insert into community_rooms(kind,context_id,booking_kind,a,b,requester_id,status,title,room_key)
      values(kind,context,case when kind='booking' then booking_kind else null end,a_id,b_id,case when kind='direct' then me else null end,state,name,tag) returning id into room_id;
    end if;
    return jsonb_build_object('id',room_id);
  end if;
  room_id:=(p_data->>'roomId')::uuid;
  if not public.community_chat_access(room_id,false) then raise exception 'CHAT:Conversa indisponível'; end if;
  select * into r from community_rooms where id=room_id for update;
  if r.kind='direct' then perform pg_advisory_xact_lock(hashtextextended('community:pair:'||r.a::text||r.b::text,0)); end if;
  if p_action='respond' then
    if r.kind<>'direct' or r.status<>'pending' or r.requester_id=me or jsonb_typeof(p_data->'accept') is distinct from 'boolean'
      or exists(select 1 from community_chat_blocks where (player_id=r.a and blocked_player_id=r.b) or (player_id=r.b and blocked_player_id=r.a)) then raise exception 'CHAT:Solicitação indisponível'; end if;
    update community_rooms set status=case when (p_data->>'accept')::boolean then 'accepted' else 'declined' end where id=r.id;
    return '{}'::jsonb;
  elsif p_action='read' then
    insert into community_chat_reads values(r.id,me,clock_timestamp()) on conflict on constraint community_chat_reads_pkey do update set read_at=excluded.read_at;
    return '{}'::jsonb;
  end if;
  if not public.community_chat_access(r.id,true) then raise exception 'CHAT:Aguarde o aceite ou verifique o bloqueio'; end if;
  if p_action='report' then
    select m.* into message from community_messages m where m.id=(p_data->>'messageId')::uuid and m.room_id=r.id and m.sender_id<>me;
    if message.id is null or p_data->>'reason' is null or p_data->>'reason' not in ('harassment','fraud','unsafe_content','spam','other') then raise exception 'CHAT:Selecione uma mensagem recebida e um motivo'; end if;
    select e.report_id into report_id from community_report_evidence e where reporter_id=me and message_id=message.id;
    if report_id is null then
      insert into moderation_reports(reporter_player_id,target_type,target_id,reason,details)
        values(me,'player',message.sender_id,p_data->>'reason','Conversa '||r.id::text||'; mensagem '||message.id::text||': '||message.text) returning id into report_id;
      insert into community_report_evidence values(me,message.id,report_id);
    end if;
    return jsonb_build_object('id',report_id);
  elsif p_action='send' then
    if r.kind='team' then
      perform pg_advisory_xact_lock(hashtextextended('community:team:'||r.context_id::text,0));
      select * into cfg from community_team_chat where team_id=r.context_id;
      if cfg.mode='whatsapp' or (cfg.admin_only and not public.is_admin_of_pelada(r.context_id)) then raise exception 'CHAT:Envio interno não permitido neste time'; end if;
    end if;
    cleaned:=btrim(p_data->>'text'); nonce_id:=(p_data->>'nonce')::uuid;
    if cleaned is null or char_length(cleaned) not between 1 and 2000 or nonce_id is null then raise exception 'CHAT:Escreva uma mensagem de 1 a 2.000 caracteres'; end if;
    select * into message from community_messages where sender_id=me and nonce=nonce_id;
    if message.id is not null then
      if message.room_id<>r.id or message.text<>cleaned then raise exception 'CHAT:Identificador de envio já utilizado'; end if;
      return jsonb_build_object('id',message.id);
    end if;
    if (select count(*) from community_messages where sender_id=me and created_at>now()-interval '1 minute')>=20 then raise exception 'CHAT:Muitas mensagens. Aguarde um minuto'; end if;
    insert into community_messages(room_id,sender_id,text,nonce) values(r.id,me,cleaned,nonce_id) returning id into target;
    return jsonb_build_object('id',target);
  end if;
  raise exception 'CHAT:Ação inválida';
end $$;
revoke all on function public.community_chat_me(),public.community_booking_people(text,uuid),public.community_chat_access(uuid,boolean),public.community_room_json(public.community_rooms),public.community_chat_snapshot(uuid,timestamptz),public.community_chat_action(text,jsonb) from public,anon,authenticated;
grant execute on function public.community_chat_snapshot(uuid,timestamptz),public.community_chat_action(text,jsonb),public.community_chat_access(uuid,boolean) to authenticated;
-- SELECT apenas para Realtime; mutações sempre passam pelas RPCs acima.
grant select on public.community_messages to authenticated;
create policy community_message_read on public.community_messages for select to authenticated using(public.community_chat_access(room_id,true));
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.community_messages;
  end if;
end $$;
