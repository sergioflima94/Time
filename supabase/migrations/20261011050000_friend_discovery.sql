-- Optional contact discovery; never persist the address book or expose identifiers.
create table public.friend_discovery_preferences (
  player_id uuid primary key references public.players(id) on delete cascade,
  by_phone boolean not null default false, by_email boolean not null default false,
  nearby boolean not null default false,
  latitude double precision, longitude double precision, located_at timestamptz,
  check(latitude between -90 and 90), check(longitude between -180 and 180)
);
create table public.friend_discovery_limits (
  player_id uuid references public.players(id) on delete cascade,
  window_at timestamptz not null, units integer not null default 0,
  primary key(player_id,window_at)
);
create table public.friend_join_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.players(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
  claimed_by uuid references public.players(id) on delete cascade, claimed_at timestamptz
);
do $$ declare t text; begin
  foreach t in array array['friend_discovery_preferences','friend_discovery_limits','friend_join_invites'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
  end loop;
end $$;

create function public.friend_phone_key(p_value text) returns text
language plpgsql immutable set search_path=public,pg_temp as $$
declare n text:=regexp_replace(coalesce(p_value,''),'[^0-9]','','g');
begin
  if left(n,2)='00' then n:=substr(n,3); end if;
  if left(btrim(coalesce(p_value,'')),1)<>'+' and length(n) in (10,11) then n:='55'||n; end if;
  if length(n) not between 8 and 15 then return null; end if;
  return n;
end $$;
create function public.friend_discovery_visible(p_me uuid,p_other uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select p_other<>p_me and exists(select 1 from players p where p.id=p_other and p.auth_user_id is not null and not p.is_guest)
    and not exists(select 1 from community_chat_blocks where (player_id=p_me and blocked_player_id=p_other) or (player_id=p_other and blocked_player_id=p_me))
    and not exists(select 1 from platform_account_controls where player_id=p_other and suspended)
$$;
create function public.friend_public_row(p_me uuid,p_other uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',p.id,'name',p.name,'nickname',p.nickname,'avatarUrl',p.avatar_url,
    'favoriteSports',p.favorite_sports,'preferredPosition',p.preferred_position,
    'friendship',(select jsonb_build_object('id',f.id,'requesterId',f.requester_id,'addresseeId',f.addressee_id,
      'status',f.status,'createdAt',f.created_at,'respondedAt',f.responded_at) from friendships f
      where ((f.requester_id=p_me and f.addressee_id=p_other) or (f.requester_id=p_other and f.addressee_id=p_me))
      order by (f.status='accepted') desc,(f.status='pending') desc,f.created_at desc limit 1))
  from players p where p.id=p_other and public.friend_discovery_visible(p_me,p_other)
$$;

-- Existing store sync remains compatible, but cannot forge an accepted request.
create function public.friendship_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me();
begin
  if auth.uid() is null then return new; end if; -- backend maintenance, not anonymous RLS access
  if me is null then raise exception 'AMIGOS:Conta indisponível'; end if;
  if tg_op='INSERT' then
    if new.requester_id<>me or new.status<>'pending' or new.responded_at is not null
      or not public.friend_discovery_visible(me,new.addressee_id) then raise exception 'AMIGOS:Pedido indisponível'; end if;
  else
    if (new.id,new.requester_id,new.addressee_id,new.created_at) is distinct from (old.id,old.requester_id,old.addressee_id,old.created_at) then raise exception 'AMIGOS:Participantes imutáveis'; end if;
    if (new.status,new.responded_at) is distinct from (old.status,old.responded_at) then
      if me<>old.addressee_id or old.status<>'pending' or new.status not in ('accepted','declined')
        or not public.friend_discovery_visible(me,old.requester_id) then raise exception 'AMIGOS:Somente quem recebeu pode responder'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger friendship_validate before insert or update on public.friendships for each row execute function public.friendship_guard();

create function public.friend_discovery(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me(); prefs public.friend_discovery_preferences;
  other_id uuid; f public.friendships; inv public.friend_join_invites;
  n text; q text; token text; result jsonb; entry jsonb; found jsonb:='[]'; idx integer:=0;
  units integer:=1; used integer; bucket timestamptz:=date_trunc('minute',clock_timestamp()); radius double precision;
begin
  if me is null then raise exception 'AMIGOS:Entre na sua conta'; end if;
  perform pg_advisory_xact_lock(hashtext('friend-discovery:'||me::text));
  if p_action='match' then
    if jsonb_typeof(p_data->'identifiers')<>'array' or jsonb_array_length(p_data->'identifiers') not between 1 and 50 then raise exception 'AMIGOS:Selecione até 50 telefones ou e-mails'; end if;
    units:=jsonb_array_length(p_data->'identifiers');
  end if;
  delete from friend_discovery_limits where player_id=me and window_at<now()-interval '1 day';
  insert into friend_discovery_limits values(me,bucket,units) on conflict(player_id,window_at) do update set units=friend_discovery_limits.units+excluded.units returning friend_discovery_limits.units into used;
  if used>200 or (select sum(l.units) from friend_discovery_limits l where l.player_id=me)>2000 then raise exception 'AMIGOS:Aguarde antes de buscar novamente'; end if;
  insert into friend_discovery_preferences(player_id) values(me) on conflict do nothing;
  select * into prefs from friend_discovery_preferences where player_id=me;
  if p_action='preferences' then
    return jsonb_build_object('byPhone',prefs.by_phone,'byEmail',prefs.by_email,'nearby',prefs.nearby,'locationFresh',coalesce(prefs.located_at>now()-interval '2 hours',false));
  elsif p_action='configure' then
    if p_data ? 'nearby' and (p_data->>'nearby')::boolean then
      if p_data->>'latitude' is null or p_data->>'longitude' is null then raise exception 'AMIGOS:Permita sua localização para aparecer por perto'; end if;
    end if;
    update friend_discovery_preferences set
      by_phone=coalesce((p_data->>'byPhone')::boolean,by_phone),by_email=coalesce((p_data->>'byEmail')::boolean,by_email),
      nearby=coalesce((p_data->>'nearby')::boolean,nearby),
      latitude=case when p_data ? 'nearby' then case when (p_data->>'nearby')::boolean then (p_data->>'latitude')::double precision else null end else latitude end,
      longitude=case when p_data ? 'nearby' then case when (p_data->>'nearby')::boolean then (p_data->>'longitude')::double precision else null end else longitude end,
      located_at=case when p_data ? 'nearby' then case when (p_data->>'nearby')::boolean then now() else null end else located_at end
      where player_id=me;
    return public.friend_discovery('preferences');
  elsif p_action in ('search','match') then
    if p_action='search' then
      q:=lower(btrim(coalesce(p_data->>'query','')));
      if length(q) not between 3 and 254 then raise exception 'AMIGOS:Informe nome, telefone completo com DDD ou e-mail completo'; end if;
      if position('@' in q)=0 and q !~ '^[+0-9() .-]+$' then
        select coalesce(jsonb_agg(public.friend_public_row(me,id)),'[]') into found from
          (select id from players where (name ilike '%'||replace(replace(q,'%','\%'),'_','\_')||'%' or nickname ilike '%'||replace(replace(q,'%','\%'),'_','\_')||'%')
           and public.friend_discovery_visible(me,id) order by name,id limit 20) s;
        return found;
      end if;
      p_data:=jsonb_build_object('identifiers',jsonb_build_array(jsonb_build_object('kind',case when position('@' in q)>0 then 'email' else 'phone' end,'value',q)));
    end if;
    for entry in select value from jsonb_array_elements(p_data->'identifiers') loop
      q:=lower(btrim(coalesce(entry->>'value',''))); other_id:=null;
      if length(q)>254 then raise exception 'AMIGOS:Identificador inválido'; end if;
      if entry->>'kind'='email' and q ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        select p.id into other_id from players p join auth.users u on u.id=p.auth_user_id
          join friend_discovery_preferences d on d.player_id=p.id and d.by_email
          where lower(u.email)=q and u.email_confirmed_at is not null and public.friend_discovery_visible(me,p.id) limit 1;
      elsif entry->>'kind'='phone' then
        n:=public.friend_phone_key(q);
        -- Phone on profile is discovery metadata, NOT proof of account ownership.
        -- Avoid ambiguous duplicate numbers instead of selecting a random account.
        select case when count(*)=1 then min(p.id::text)::uuid end into other_id from players p
          join friend_discovery_preferences d on d.player_id=p.id and d.by_phone
          where n is not null and public.friend_phone_key(p.phone)=n and public.friend_discovery_visible(me,p.id);
      end if;
      if other_id is not null then found:=found||jsonb_build_array(jsonb_build_object('index',idx,'player',public.friend_public_row(me,other_id))); end if;
      idx:=idx+1;
    end loop;
    return found;
  elsif p_action='nearby' then
    radius:=coalesce((p_data->>'radiusKm')::double precision,5);
    if radius not between 1 and 20 then raise exception 'AMIGOS:Raio entre 1 e 20 km'; end if;
    if not prefs.nearby or prefs.located_at is null or prefs.located_at<now()-interval '2 hours' then raise exception 'AMIGOS:Atualize sua localização e ative aparecer por perto'; end if;
    select coalesce(jsonb_agg(public.friend_public_row(me,s.player_id)||jsonb_build_object('distanceKm',greatest(1,ceil(s.km)))),'[]') into found from (
      select d.player_id,6371*acos(least(1::double precision,greatest(-1::double precision,
        sin(radians(prefs.latitude))*sin(radians(d.latitude))+cos(radians(prefs.latitude))*cos(radians(d.latitude))*cos(radians(d.longitude-prefs.longitude))))) as km
      from friend_discovery_preferences d where d.nearby and d.latitude is not null and d.longitude is not null
        and d.located_at>now()-interval '2 hours' and public.friend_discovery_visible(me,d.player_id)
    ) s where s.km<=radius;
    return (select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(found) order by (value->>'distanceKm')::numeric,value->>'id' limit 20) t);
  elsif p_action='invite_create' then
    if (select count(*) from friend_join_invites where inviter_id=me and created_at>now()-interval '1 day')>=30 then raise exception 'AMIGOS:Limite diário de convites atingido'; end if;
    token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
    insert into friend_join_invites(inviter_id,token_hash) values(me,md5(token));
    return jsonb_build_object('token',token,'expiresAt',now()+interval '7 days');
  elsif p_action in ('invite_preview','invite_claim') then
    token:=p_data->>'token';
    if token is null or token !~ '^[a-f0-9]{64}$' then raise exception 'AMIGOS:Convite inválido'; end if;
    select * into inv from friend_join_invites where token_hash=md5(token) for update;
    if inv.id is null or inv.expires_at<now() or (inv.claimed_by is not null and inv.claimed_by<>me)
      or not public.friend_discovery_visible(me,inv.inviter_id) then raise exception 'AMIGOS:Convite indisponível ou expirado'; end if;
    if p_action='invite_preview' then return public.friend_public_row(me,inv.inviter_id); end if;
    update friend_join_invites set claimed_by=me,claimed_at=coalesce(claimed_at,now()) where id=inv.id;
    other_id:=inv.inviter_id; -- create a REQUEST, never an accepted friendship
    perform pg_advisory_xact_lock(hashtext('friend-pair:'||least(me,other_id)::text||greatest(me,other_id)::text));
    select * into f from friendships where (requester_id=me and addressee_id=other_id) or (requester_id=other_id and addressee_id=me) order by created_at desc limit 1;
    if f.id is null then
      -- recipient explicitly asks the original sender; sender must still approve
      insert into friendships(requester_id,addressee_id) values(me,other_id);
    elsif f.status='declined' then raise exception 'AMIGOS:Um pedido anterior foi recusado'; end if;
    return public.friend_public_row(me,other_id);
  elsif p_action='request' then
    other_id:=(p_data->>'playerId')::uuid;
    if not public.friend_discovery_visible(me,other_id) then raise exception 'AMIGOS:Contato indisponível'; end if;
    perform pg_advisory_xact_lock(hashtext('friend-pair:'||least(me,other_id)::text||greatest(me,other_id)::text));
    select * into f from friendships where (requester_id=me and addressee_id=other_id) or (requester_id=other_id and addressee_id=me) order by created_at desc limit 1;
    if f.id is null then insert into friendships(requester_id,addressee_id) values(me,other_id);
    elsif f.status='declined' then raise exception 'AMIGOS:Um pedido anterior foi recusado'; end if;
    return public.friend_public_row(me,other_id);
  elsif p_action='respond' then
    select * into f from friendships where id=(p_data->>'friendshipId')::uuid and addressee_id=me and status='pending' for update;
    if f.id is null then raise exception 'AMIGOS:Pedido indisponível'; end if;
    update friendships set status=case when (p_data->>'accept')::boolean then 'accepted' else 'declined' end,responded_at=now() where id=f.id;
    return public.friend_public_row(me,f.requester_id);
  end if;
  raise exception 'AMIGOS:Ação inválida';
end $$;
revoke all on function public.friend_phone_key(text),public.friend_discovery_visible(uuid,uuid),public.friend_public_row(uuid,uuid),public.friendship_guard(),public.friend_discovery(text,jsonb) from public,anon,authenticated;
grant execute on function public.friend_discovery(text,jsonb) to authenticated;
