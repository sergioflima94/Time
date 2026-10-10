-- Crescimento: consentimento, horários reais e cadastro assistido sem impersonação.
create table public.assisted_venues (
  establishment_id uuid primary key references public.establishments(id) on delete cascade,
  prepared_by uuid not null references auth.users(id),
  target_player_id uuid references public.players(id),
  status text not null default 'draft' check(status in ('draft','invited','accepted','declined')),
  revision integer not null default 1,
  created_at timestamptz not null default now()
);
create table public.buddy_invites (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  host_player_id uuid not null references public.players(id),
  buddy_player_id uuid references public.players(id),
  code uuid not null unique default gen_random_uuid(),
  status text not null default 'invited' check(status in ('invited','pending','accepted','declined','cancelled')),
  expires_at timestamptz not null default now()+interval '24 hours',
  created_at timestamptz not null default now()
);
create unique index buddy_active_host on public.buddy_invites(game_id,host_player_id) where status in ('invited','pending');
create table public.opportunity_slots (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id),
  starts_at timestamptz not null,
  duration_minutes integer not null check(duration_minutes between 15 and 240),
  regular_price numeric(10,2) not null check(regular_price > 0),
  offer_price numeric(10,2) not null check(offer_price > 0 and offer_price < regular_price),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.play_windows (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null check(ends_at > starts_at),
  level text not null check(level in ('all','beginner','intermediate','advanced')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.opportunity_requests (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.opportunity_slots(id),
  pelada_id uuid not null references public.peladas(id),
  opponent_pelada_id uuid references public.peladas(id),
  opponent_accepted boolean not null default false,
  status text not null default 'pending' check(status in ('pending','confirmed','declined','cancelled')),
  booking_id uuid references public.field_bookings(id),
  match_id uuid references public.friendly_matches(id),
  price numeric(10,2) not null,
  commission_percent numeric(5,2) not null check(commission_percent between 0 and 20),
  created_at timestamptz not null default now(),
  check(opponent_pelada_id is null or opponent_pelada_id <> pelada_id)
);
create unique index opportunity_pending_team on public.opportunity_requests(slot_id,pelada_id) where status in ('pending','confirmed');
create table public.onboarding_preferences (
  player_id uuid primary key references public.players(id),
  persona text not null check(persona in ('player','team','venue')),
  completed boolean not null default false,
  suggestions_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['assisted_venues','buddy_invites','opportunity_slots','play_windows','opportunity_requests','onboarding_preferences'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
  end loop;
end $$;

-- A mesma trava de campo serializa publicações e confirmações nesta operação.
create function public.growth_slot_free(p_field uuid,p_start timestamptz,p_minutes integer) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select not exists(
    select 1 from public.field_bookings b cross join generate_series(-1,1) d where b.field_id=p_field
      and ((b.recurrence='single' and d=0)
        or (b.recurrence='weekly' and b.day_of_week=extract(dow from (p_start at time zone 'America/Sao_Paulo')::date+d)))
      and (case when b.recurrence='single' then b.date else (p_start at time zone 'America/Sao_Paulo')::date+d end)+b.time::time < (p_start at time zone 'America/Sao_Paulo') + make_interval(mins=>p_minutes)
      and (case when b.recurrence='single' then b.date else (p_start at time zone 'America/Sao_Paulo')::date+d end)+b.time::time + make_interval(mins=>b.duration_minutes) > (p_start at time zone 'America/Sao_Paulo')
  );
$$;
revoke all on function public.growth_slot_free(uuid,timestamptz,integer) from public,anon,authenticated;

create function public.growth_snapshot() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid; r text;
begin
  if not public.platform_account_allowed() then raise exception 'Entre com uma conta ativa'; end if;
  select id into me from public.players where auth_user_id=auth.uid();
  r:=public.platform_admin_role();
  return jsonb_build_object(
    'venues',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('name',e.name,'fields',
      (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'sport_id',f.sport_id,'address',f.address)),'[]'::jsonb) from fields f where f.establishment_id=e.id)))
      from assisted_venues v join establishments e on e.id=v.establishment_id
      where r in ('owner','admin') or v.target_player_id=me),'[]'::jsonb),
    'buddies',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('host_name',p.name,'buddy_name',q.name))
      from buddy_invites b join players p on p.id=b.host_player_id left join players q on q.id=b.buddy_player_id
      join games g on g.id=b.game_id where b.host_player_id=me or b.buddy_player_id=me or public.is_admin_of_pelada(g.pelada_id)),'[]'::jsonb),
    'slots',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('field_name',f.name,'address',f.address,'sport_id',f.sport_id,'establishment_id',f.establishment_id))
      from opportunity_slots s join fields f on f.id=s.field_id where s.active and s.starts_at>now()
        and public.growth_slot_free(s.field_id,s.starts_at,s.duration_minutes)),'[]'::jsonb),
    'windows',coalesce((select jsonb_agg(to_jsonb(w)||jsonb_build_object('team_name',p.name,'sport_id',p.sport_id))
      from play_windows w join peladas p on p.id=w.pelada_id where w.active and w.ends_at>now()),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('team_name',p.name,'opponent_name',o.name,'field_name',f.name,'starts_at',s.starts_at))
      from opportunity_requests q join opportunity_slots s on s.id=q.slot_id join fields f on f.id=s.field_id
      join peladas p on p.id=q.pelada_id left join peladas o on o.id=q.opponent_pelada_id
      where public.is_admin_of_pelada(q.pelada_id) or public.is_admin_of_pelada(q.opponent_pelada_id) or public.is_establishment_owner(f.establishment_id)),'[]'::jsonb),
    'onboarding',(select to_jsonb(p) from onboarding_preferences p where p.player_id=me)
  );
end $$;

create function public.growth_action(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid; role_now text; eid uuid; new_id uuid; reason text; v public.assisted_venues;
  b public.buddy_invites; s public.opportunity_slots; q public.opportunity_requests; f public.fields;
  g public.games; p public.peladas; opponent public.peladas; occupied integer; booking uuid; challenge uuid; match uuid;
  start_at timestamptz; end_at timestamptz; minutes integer; target uuid;
begin
  if not public.platform_account_allowed() then raise exception 'Entre com uma conta ativa'; end if;
  select id into me from public.players where auth_user_id=auth.uid();
  if me is null then raise exception 'Complete seu perfil'; end if;
  role_now:=public.platform_admin_role();
  if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Dados inválidos'; end if;
  if p_action in ('venue_create','venue_field','venue_availability','venue_invite') then
    if role_now is null or role_now not in ('owner','admin') then raise exception 'Somente a administração da plataforma'; end if;
    reason:=trim(p_data->>'reason');
    if length(coalesce(reason,''))<8 then raise exception 'Informe um motivo de pelo menos 8 caracteres'; end if;
    if p_action='venue_create' then
      if length(trim(coalesce(p_data->>'name',''))) not between 3 and 80 then raise exception 'Nome inválido'; end if;
      insert into establishments(owner_player_id,name,payout_method,access_code) values(me,trim(p_data->>'name'),'in_person',gen_random_uuid()::text) returning id into eid;
      insert into assisted_venues(establishment_id,prepared_by) values(eid,auth.uid());
    else
      eid:=(p_data->>'establishmentId')::uuid;
      select * into v from assisted_venues where establishment_id=eid for update;
      if v.establishment_id is null or v.status='accepted' then raise exception 'Cadastro assistido indisponível'; end if;
      if (p_data->>'revision')::integer is distinct from v.revision then raise exception 'Cadastro mudou. Atualize.'; end if;
      if p_action='venue_field' then
        if length(trim(coalesce(p_data->>'name',''))) not between 3 and 80 or not exists(select 1 from sport_catalog where id=p_data->>'sportId' and (definition->>'active')::boolean) then raise exception 'Campo ou esporte inválido'; end if;
        insert into fields(establishment_id,name,address,sport_id,created_by) values(eid,trim(p_data->>'name'),left(p_data->>'address',200),p_data->>'sportId',me);
      elsif p_action='venue_availability' then
        select * into f from fields where id=(p_data->>'fieldId')::uuid and establishment_id=eid;
        if f.id is null or (p_data->>'dayOfWeek')::integer not between 0 and 6 or (p_data->>'startTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (p_data->>'endTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          or (p_data->>'endTime')::time<=(p_data->>'startTime')::time or (p_data->>'price')::numeric<=0 or (p_data->>'slotMinutes')::integer not between 15 and 240 then raise exception 'Disponibilidade/preço inválidos'; end if;
        insert into field_availabilities(field_id,day_of_week,start_time,end_time,slot_minutes,price) values(f.id,(p_data->>'dayOfWeek')::integer,p_data->>'startTime',p_data->>'endTime',(p_data->>'slotMinutes')::integer,(p_data->>'price')::numeric);
      else
        target:=(p_data->>'playerId')::uuid;
        if target=me or not exists(select 1 from players x join auth.users u on u.id=x.auth_user_id where x.id=target and not x.is_guest)
          or exists(select 1 from platform_account_controls where player_id=target and suspended) then raise exception 'Selecione outra conta cadastrada e ativa'; end if;
        if exists(select 1 from payment_gateway_connections where establishment_id=eid and status='connected')
          or exists(select 1 from field_bookings where establishment_id=eid) then raise exception 'Transfira apenas cadastros novos, sem reservas ou gateway conectado'; end if;
        update assisted_venues set target_player_id=target,status='invited' where establishment_id=eid;
      end if;
      update assisted_venues set revision=revision+1 where establishment_id=eid;
    end if;
    insert into platform_admin_audit(actor_auth_user_id,action,target_id,reason,after_value) values(auth.uid(),p_action,eid::text,reason,p_data);
    return jsonb_build_object('id',eid);
  elsif p_action='venue_respond' then
    eid:=(p_data->>'establishmentId')::uuid;
    select * into v from assisted_venues where establishment_id=eid for update;
    if v.target_player_id is distinct from me or v.status<>'invited' or (p_data->>'revision')::integer is distinct from v.revision then raise exception 'Convite indisponível'; end if;
    if jsonb_typeof(p_data->'accept') is distinct from 'boolean' then raise exception 'Resposta inválida'; end if;
    if (p_data->>'accept')::boolean then
      perform 1 from establishments where id=eid for update;
      if exists(select 1 from payment_gateway_connections where establishment_id=eid and status='connected') or exists(select 1 from field_bookings where establishment_id=eid) then raise exception 'Cadastro já possui operação financeira; transferência precisa de revisão'; end if;
      update establishments set owner_player_id=me,pix_key=null,payout_method='in_person',whatsapp_opt_in=false where id=eid;
    end if;
    update assisted_venues set status=case when (p_data->>'accept')::boolean then 'accepted' else 'declined' end,revision=revision+1 where establishment_id=eid;
    insert into platform_admin_audit(actor_auth_user_id,action,target_id,reason) values(auth.uid(),p_action,eid::text,'Resposta do responsável ao cadastro assistido');
    return jsonb_build_object('id',eid);
  elsif p_action='buddy_create' then
    select * into g from games where id=(p_data->>'gameId')::uuid for update;
    if g.id is null or g.scheduled_at<=now() or g.status not in ('open','full') or not exists(select 1 from public_game_listings where game_id=g.id and published)
      or not coalesce((select (settings->>'discoveryEnabled')::boolean from platform_configuration where id),false) then raise exception 'Jogo indisponível'; end if;
    if exists(select 1 from attendances where game_id=g.id and player_id=me and status in ('confirmed','waitlist')) then raise exception 'Você já está na chamada'; end if;
    if exists(select 1 from public_game_join_requests where game_id=g.id and player_id=me and status='pending') then raise exception 'Você já solicitou entrada individual'; end if;
    update buddy_invites set status='cancelled' where game_id=g.id and expires_at<=now() and status in ('invited','pending');
    if exists(select 1 from buddy_invites where game_id=g.id and buddy_player_id=me and status='pending') then raise exception 'Você já tem uma dupla pendente'; end if;
    select * into b from buddy_invites where game_id=g.id and host_player_id=me and status in ('invited','pending');
    if b.id is null then insert into buddy_invites(game_id,host_player_id,expires_at) values(g.id,me,least(g.scheduled_at,now()+interval '24 hours')) returning * into b; end if;
    return jsonb_build_object('code',b.code,'id',b.id);
  elsif p_action='buddy_join' then
    select * into b from buddy_invites where code=(p_data->>'code')::uuid for update;
    select * into g from games where id=b.game_id;
    if b.id is null or b.status<>'invited' or b.expires_at<=now() or b.host_player_id=me or g.scheduled_at<=now() or g.status not in ('open','full') or not exists(select 1 from public_game_listings where game_id=g.id and published)
      or not coalesce((select (settings->>'discoveryEnabled')::boolean from platform_configuration where id),false) then raise exception 'Convite indisponível'; end if;
    if exists(select 1 from attendances where game_id=b.game_id and player_id=me and status in ('confirmed','waitlist'))
      or exists(select 1 from buddy_invites where game_id=b.game_id and status in ('invited','pending') and (host_player_id=me or buddy_player_id=me))
      or exists(select 1 from public_game_join_requests where game_id=b.game_id and player_id=me and status='pending') then raise exception 'Você já participa ou tem solicitação pendente'; end if;
    update buddy_invites set buddy_player_id=me,status='pending' where id=b.id;
    return jsonb_build_object('id',b.id);
  elsif p_action in ('buddy_respond','buddy_cancel') then
    select * into b from buddy_invites where id=(p_data->>'id')::uuid for update;
    select * into g from games where id=b.game_id for update;
    if p_action='buddy_cancel' then
      if b.host_player_id is distinct from me or b.status not in ('invited','pending') then raise exception 'Convite indisponível'; end if;
      update buddy_invites set status='cancelled' where id=b.id;
    else
      if g.id is null or not public.is_admin_of_pelada(g.pelada_id) or b.status<>'pending' then raise exception 'Sem permissão ou solicitação encerrada'; end if;
      if jsonb_typeof(p_data->'accept') is distinct from 'boolean' then raise exception 'Resposta inválida'; end if;
      if (p_data->>'accept')::boolean then
        if g.scheduled_at<=now() or b.expires_at<=now() or g.status not in ('open','full') then raise exception 'Chamada encerrada'; end if;
        if exists(select 1 from platform_account_controls where player_id in (b.host_player_id,b.buddy_player_id) and suspended) then raise exception 'Conta suspensa'; end if;
        select count(*) into occupied from attendances where game_id=g.id and status='confirmed' and player_id not in (b.host_player_id,b.buddy_player_id);
        if occupied+2>g.max_players then raise exception 'É preciso ter duas vagas para aprovar a dupla'; end if;
        insert into pelada_memberships(pelada_id,player_id,role,active) values(g.pelada_id,b.host_player_id,'member',true),(g.pelada_id,b.buddy_player_id,'member',true) on conflict(pelada_id,player_id) do update set active=true;
        insert into attendances(game_id,player_id,status,confirmed_order) values(g.id,b.host_player_id,'confirmed',occupied+1),(g.id,b.buddy_player_id,'confirmed',occupied+2) on conflict(game_id,player_id) do update set status='confirmed',confirmed_order=excluded.confirmed_order;
      end if;
      update buddy_invites set status=case when (p_data->>'accept')::boolean then 'accepted' else 'declined' end where id=b.id;
    end if;
    return jsonb_build_object('id',b.id);
  elsif p_action='onboarding' then
    if p_data->>'persona' not in ('player','team','venue') or jsonb_typeof(p_data->'suggestionsEnabled') is distinct from 'boolean' then raise exception 'Preferências inválidas'; end if;
    insert into onboarding_preferences(player_id,persona,completed,suggestions_enabled) values(me,p_data->>'persona',true,(p_data->>'suggestionsEnabled')::boolean)
      on conflict(player_id) do update set persona=excluded.persona,completed=true,suggestions_enabled=excluded.suggestions_enabled,updated_at=now();
    return '{}'::jsonb;
  elsif p_action='window_create' then
    target:=(p_data->>'teamId')::uuid;
    if not public.is_admin_of_pelada(target) then raise exception 'Somente o administrador deste time'; end if;
    start_at:=(p_data->>'startsAt')::timestamptz; end_at:=(p_data->>'endsAt')::timestamptz;
    if start_at<=now() or end_at<=start_at or end_at>start_at+interval '8 hours' or p_data->>'level' not in ('all','beginner','intermediate','advanced') then raise exception 'Janela inválida'; end if;
    insert into play_windows(pelada_id,starts_at,ends_at,level) values(target,start_at,end_at,p_data->>'level') returning id into new_id;
    return jsonb_build_object('id',new_id);
  elsif p_action='slot_create' then
    select * into f from fields where id=(p_data->>'fieldId')::uuid for update;
    if f.id is null or not public.is_establishment_owner(f.establishment_id) then raise exception 'Somente o dono do campo'; end if;
    if exists(select 1 from assisted_venues where establishment_id=f.establishment_id and status<>'accepted') then raise exception 'Vincule o responsável antes de publicar horários'; end if;
    start_at:=(p_data->>'startsAt')::timestamptz; minutes:=(p_data->>'durationMinutes')::integer;
    if start_at<=now() or minutes not between 15 and 240 or (start_at at time zone 'America/Sao_Paulo')::date<>((start_at+make_interval(mins=>minutes)) at time zone 'America/Sao_Paulo')::date then raise exception 'Horário inválido; não atravesse meia-noite'; end if;
    if not public.growth_slot_free(f.id,start_at,minutes) then raise exception 'Horário já ocupado'; end if;
    insert into opportunity_slots(field_id,starts_at,duration_minutes,regular_price,offer_price) values(f.id,start_at,minutes,(p_data->>'regularPrice')::numeric,(p_data->>'offerPrice')::numeric) returning id into new_id;
    return jsonb_build_object('id',new_id);
  elsif p_action in ('slot_hide','window_hide') then
    new_id:=(p_data->>'id')::uuid;
    if p_action='slot_hide' then
      select * into s from opportunity_slots where id=new_id;
      if not exists(select 1 from fields where id=s.field_id and public.is_establishment_owner(establishment_id)) then raise exception 'Sem permissão'; end if;
      update opportunity_slots set active=false where id=new_id;
    else
      if not exists(select 1 from play_windows where id=new_id and public.is_admin_of_pelada(pelada_id)) then raise exception 'Sem permissão'; end if;
      update play_windows set active=false where id=new_id;
    end if;
    return '{}'::jsonb;
  elsif p_action='slot_request' then
    select * into s from opportunity_slots where id=(p_data->>'slotId')::uuid;
    select * into f from fields where id=s.field_id for update;
    select * into p from peladas where id=(p_data->>'teamId')::uuid;
    select * into opponent from peladas where id=nullif(p_data->>'opponentId','')::uuid;
    if s.id is null or not s.active or s.starts_at<=now() or not public.is_admin_of_pelada(p.id) or p.sport_id<>f.sport_id then raise exception 'Horário/time indisponível'; end if;
    if not public.growth_slot_free(f.id,s.starts_at,s.duration_minutes) then raise exception 'Horário já ocupado'; end if;
    if p_data->>'opponentId' is not null and (opponent.id is null or opponent.id=p.id or opponent.sport_id<>p.sport_id or not exists(select 1 from play_windows w where w.pelada_id=opponent.id and w.active and w.starts_at<=s.starts_at and w.ends_at>=s.starts_at+make_interval(mins=>s.duration_minutes))) then raise exception 'Adversário sem disponibilidade compatível'; end if;
    insert into opportunity_requests(slot_id,pelada_id,opponent_pelada_id,price,commission_percent) values(s.id,p.id,opponent.id,s.offer_price,coalesce((select (settings->>'bookingCommissionPercent')::numeric from platform_configuration where id),0))
      on conflict(slot_id,pelada_id) where status in ('pending','confirmed') do nothing;
    return '{}'::jsonb;
  elsif p_action in ('opponent_respond','slot_respond','request_cancel') then
    select * into q from opportunity_requests where id=(p_data->>'id')::uuid for update;
    select * into s from opportunity_slots where id=q.slot_id;
    select * into f from fields where id=s.field_id for update;
    if q.id is null or q.status<>'pending' then raise exception 'Pedido encerrado'; end if;
    if p_action='request_cancel' then
      if not public.is_admin_of_pelada(q.pelada_id) then raise exception 'Sem permissão'; end if;
      update opportunity_requests set status='cancelled' where id=q.id; return '{}'::jsonb;
    end if;
    if jsonb_typeof(p_data->'accept') is distinct from 'boolean' then raise exception 'Resposta inválida'; end if;
    if p_action='opponent_respond' then
      if not public.is_admin_of_pelada(q.opponent_pelada_id) then raise exception 'Sem permissão'; end if;
      update opportunity_requests set opponent_accepted=(p_data->>'accept')::boolean,status=case when (p_data->>'accept')::boolean then 'pending' else 'declined' end where id=q.id;
    else
      if not public.is_establishment_owner(f.establishment_id) then raise exception 'Somente o dono do campo confirma'; end if;
      if not (p_data->>'accept')::boolean then update opportunity_requests set status='declined' where id=q.id; return '{}'::jsonb; end if;
      if q.opponent_pelada_id is not null and not q.opponent_accepted then raise exception 'Aguarde o aceite do outro time'; end if;
      if not s.active or s.starts_at<=now() or not public.growth_slot_free(f.id,s.starts_at,s.duration_minutes) then raise exception 'Horário já ocupado ou encerrado'; end if;
      select * into p from peladas where id=q.pelada_id;
      insert into field_bookings(field_id,establishment_id,pelada_id,team_name,recurrence,date,time,duration_minutes,notes,created_by)
        values(f.id,f.establishment_id,p.id,p.name,'single',(s.starts_at at time zone 'America/Sao_Paulo')::date,to_char(s.starts_at at time zone 'America/Sao_Paulo','HH24:MI'),s.duration_minutes,'BoraJogo: oferta confirmada, pagamento separado',me) returning id into booking;
      if q.opponent_pelada_id is not null then
        insert into team_challenges(challenger_pelada_id,challenged_pelada_id,proposed_date,proposed_time,field_id,status,created_by,responded_at)
          values(p.id,q.opponent_pelada_id,(s.starts_at at time zone 'America/Sao_Paulo')::date,to_char(s.starts_at at time zone 'America/Sao_Paulo','HH24:MI'),f.id,'accepted',me,now()) returning id into challenge;
        insert into friendly_matches(challenge_id,pelada_a_id,pelada_b_id,field_id,scheduled_at,match_minutes,sport_id)
          values(challenge,p.id,q.opponent_pelada_id,f.id,s.starts_at,s.duration_minutes,p.sport_id) returning id into match;
        update team_challenges set match_id=match where id=challenge;
      end if;
      update opportunity_requests set status='confirmed',booking_id=booking,match_id=match where id=q.id;
      update opportunity_slots set active=false where id=s.id;
      update opportunity_requests set status='declined' where slot_id=s.id and id<>q.id and status='pending';
    end if;
    return '{}'::jsonb;
  end if;
  raise exception 'Ação não permitida';
end $$;
revoke all on function public.growth_snapshot(),public.growth_action(text,jsonb) from public,anon;
grant execute on function public.growth_snapshot(),public.growth_action(text,jsonb) to authenticated;

-- Snapshot novo não inventa escalações históricas anteriores à implantação.
alter table public.match_turns add column roster_snapshot jsonb;
create function public.capture_turn_roster() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' and old.ended_at is not null and (new.roster_snapshot is distinct from old.roster_snapshot or new.ended_at is null or new.game_id<>old.game_id or new.team_a_id<>old.team_a_id or new.team_b_id<>old.team_b_id) then raise exception 'Escalação histórica encerrada não pode ser alterada'; end if;
  if tg_op='INSERT' and new.roster_snapshot is null then
    new.roster_snapshot := coalesce((select jsonb_agg(jsonb_build_object('teamId',tp.team_id,'playerId',tp.player_id,'joinedAt',coalesce(new.started_at,now()),'leftAt',null)) from team_players tp where tp.team_id in (new.team_a_id,new.team_b_id)),'[]'::jsonb);
  end if;
  if new.roster_snapshot is not null and (jsonb_typeof(new.roster_snapshot)<>'array' or jsonb_array_length(new.roster_snapshot)>500) then raise exception 'Escalação inválida'; end if;
  return new;
end $$;
create trigger capture_turn_roster before insert or update on public.match_turns for each row execute function public.capture_turn_roster();

create function public.guard_buddy_individual_request() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from buddy_invites where game_id=new.game_id and (host_player_id=new.player_id or buddy_player_id=new.player_id) and status in ('invited','pending') and expires_at>now()) then raise exception 'Você já tem convite de dupla; cancele antes de solicitar individualmente'; end if;
  return new;
end $$;
create trigger guard_buddy_individual_request before insert on public.public_game_join_requests for each row execute function public.guard_buddy_individual_request();

-- Evita dupla reserva inclusive quando a outra escrita veio do fluxo antigo.
create function public.guard_field_booking_overlap() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from fields where id=new.field_id for update;
  if new.duration_minutes not between 1 and 1440 or new.time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Duração ou horário inválido'; end if;
  if exists(select 1 from field_bookings b
    cross join lateral(select coalesce(new.date,b.date,date '2026-01-04'+new.day_of_week) as day) anchor
    cross join generate_series(-1,1) nd cross join generate_series(-1,1) bd
    cross join lateral(select case when new.recurrence='single' then new.date else anchor.day+nd end as ndate,case when b.recurrence='single' then b.date else anchor.day+bd end as bdate) dates
    where b.field_id=new.field_id and b.id<>new.id
    and (case when new.recurrence='single' then nd=0 else extract(dow from dates.ndate)=new.day_of_week end)
    and (case when b.recurrence='single' then bd=0 else extract(dow from dates.bdate)=b.day_of_week end)
    and dates.bdate+b.time::time<dates.ndate+new.time::time+make_interval(mins=>new.duration_minutes)
    and dates.bdate+b.time::time+make_interval(mins=>b.duration_minutes)>dates.ndate+new.time::time) then raise exception 'Horário já ocupado'; end if;
  return new;
end $$;
create trigger guard_field_booking_overlap before insert or update on public.field_bookings for each row execute function public.guard_field_booking_overlap();
