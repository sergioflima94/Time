-- Reputação não depende de patrocínio/plano. Escritas exclusivamente por RPC.
create table public.venue_review_visits (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.field_bookings(id) on delete cascade,
  occurrence_date date not null, player_id uuid not null references public.players(id) on delete cascade,
  confirmed_by uuid not null references public.players(id), created_at timestamptz not null default clock_timestamp(),
  unique(booking_id,occurrence_date,player_id)
);
create table public.venue_reviews (
  id uuid primary key default gen_random_uuid(), player_id uuid not null references public.players(id) on delete cascade,
  experience_kind text not null check(experience_kind in ('game','class','visit')), experience_id uuid not null,
  target text not null check(target in ('field','establishment')),
  establishment_id uuid not null references public.establishments(id), field_id uuid not null references public.fields(id),
  score integer not null check(score between 1 and 5), criteria jsonb not null,
  comment text not null default '' check(char_length(comment)<=1500),
  recommendation_score integer check(recommendation_score between 0 and 10),
  reply text check(char_length(btrim(reply)) between 1 and 1500), replied_at timestamptz,
  hidden boolean not null default false, reply_hidden boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  unique(player_id,experience_kind,experience_id,target),
  check(target='establishment' or recommendation_score is null)
);
create index venue_review_timeline on public.venue_reviews(establishment_id,field_id,created_at desc,id desc);
create table public.venue_review_reports (
  id uuid primary key default gen_random_uuid(), review_id uuid not null references public.venue_reviews(id) on delete cascade,
  player_id uuid not null references public.players(id), subject text not null check(subject in ('review','reply')),
  reason text not null check(reason in ('harassment','fraud','unsafe_content','spam','other')),
  details text not null check(char_length(details)<=1000),
  moderation_report_id uuid not null references public.moderation_reports(id), created_at timestamptz not null default clock_timestamp(),
  unique(review_id,player_id,subject)
);
create table public.venue_review_audit (
  id bigint generated always as identity primary key, actor_id uuid references public.players(id),
  review_id uuid references public.venue_reviews(id) on delete set null, action text not null,
  reason text not null, created_at timestamptz not null default clock_timestamp()
);
alter table public.venue_review_visits enable row level security;
alter table public.venue_reviews enable row level security;
alter table public.venue_review_reports enable row level security;
alter table public.venue_review_audit enable row level security;
revoke all on public.venue_review_visits,public.venue_reviews,public.venue_review_reports,public.venue_review_audit from public,anon,authenticated;

-- Helpers privados: cliente não pode pedir experiências de outra pessoa.
create function public.venue_review_experiences(p_player uuid)
returns table(kind text,id uuid,field_id uuid,establishment_id uuid,label text,at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select 'game',g.id,f.id,f.establishment_id,'Jogo · '||p.name,g.scheduled_at
  from games g join fields f on f.id=g.field_id join peladas p on p.id=g.pelada_id
  join attendances a on a.game_id=g.id and a.player_id=p_player
  where f.establishment_id is not null and g.status='finished' and g.scheduled_at+make_interval(mins=>g.duration_minutes)<=now()
    and a.status='confirmed' and a.checked_in and not a.no_show
  union all
  select 'class',s.id,f.id,f.establishment_id,'Aula · '||p.name,s.starts_at
  from class_sessions s join class_programs p on p.id=s.program_id join fields f on f.id=p.field_id
  join class_attendances a on a.session_id=s.id and a.player_id=p_player
  where f.establishment_id is not null and s.status='completed' and s.ends_at<=now() and a.status='present'
  union all
  select 'visit',v.id,f.id,f.establishment_id,'Reserva · '||b.team_name,
    (v.occurrence_date+b.time::time) at time zone 'America/Sao_Paulo'
  from venue_review_visits v join field_bookings b on b.id=v.booking_id join fields f on f.id=b.field_id
  where v.player_id=p_player and f.establishment_id is not null
$$;
create function public.venue_review_candidates(p_venue uuid)
returns table(booking_id uuid,occurrence_date date,player_id uuid,player_name text,label text)
language sql stable security definer set search_path=public,pg_temp as $$
  with anchors as (
    select b.*,case when b.recurrence='single' then b.date else
      (now() at time zone 'America/Sao_Paulo')::date - ((extract(dow from now() at time zone 'America/Sao_Paulo')::int-b.day_of_week+7)%7) end anchor_date
    from field_bookings b where b.establishment_id=p_venue
  ), occurrences as (
    select b.*,case when b.recurrence='weekly' and ((b.anchor_date+b.time::time) at time zone 'America/Sao_Paulo')+make_interval(mins=>b.duration_minutes)>now()
      then b.anchor_date-7 else b.anchor_date end occurrence from anchors b
  )
  select b.id,b.occurrence,p.id,coalesce(nullif(p.nickname,''),p.name),b.team_name||' · '||f.name
  from occurrences b join fields f on f.id=b.field_id join establishments e on e.id=b.establishment_id
  join players p on p.id=b.created_by or exists(select 1 from pelada_memberships m where m.player_id=p.id and m.pelada_id=b.pelada_id and m.active
    and m.joined_at<=((b.occurrence+b.time::time) at time zone 'America/Sao_Paulo'))
  where e.owner_player_id=public.community_chat_me() and p.id<>e.owner_player_id and p.auth_user_id is not null and not p.is_guest
    and b.occurrence >= (now() at time zone 'America/Sao_Paulo')::date-90
    and ((b.occurrence+b.time::time) at time zone 'America/Sao_Paulo')+make_interval(mins=>b.duration_minutes)<=now()
    and ((b.occurrence+b.time::time) at time zone 'America/Sao_Paulo')>=b.created_at
    and not exists(select 1 from platform_account_controls c where c.player_id=p.id and c.suspended)
    and not exists(select 1 from venue_review_visits v where v.booking_id=b.id and v.occurrence_date=b.occurrence and v.player_id=p.id)
    -- Não gerar uma segunda experiência para a mesma sessão já registrada como jogo.
    and not exists(select 1 from games g where g.field_id=b.field_id and g.pelada_id=b.pelada_id
      and g.scheduled_at>=((b.occurrence+b.time::time) at time zone 'America/Sao_Paulo')
      and g.scheduled_at<((b.occurrence+b.time::time) at time zone 'America/Sao_Paulo')+make_interval(mins=>b.duration_minutes))
  order by b.occurrence desc,b.id,p.id limit 100
$$;

create function public.venue_review_snapshot(p_venue uuid default null,p_field uuid default null,p_before uuid default null,p_moderation boolean default false)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me(); venue uuid:=p_venue; display_title text; owner_id uuid; manage boolean:=false;
  moderator boolean:=public.platform_admin_role() is not null; result jsonb; summary jsonb; nps jsonb; n int; promoters int; detractors int;
  cursor_at timestamptz; items jsonb; more boolean; target_kind text:=case when p_field is null then 'establishment' else 'field' end;
begin
  if p_moderation and not moderator then raise exception 'REVIEW:Acesso exclusivo da administração'; end if;
  if not p_moderation then
    if p_field is not null then select f.establishment_id,f.name into venue,display_title from fields f where f.id=p_field; end if;
    select e.owner_player_id,coalesce(display_title,e.name) into owner_id,display_title from establishments e where e.id=venue;
    if owner_id is null then raise exception 'REVIEW:Local cadastrado não encontrado'; end if;
    manage:=coalesce(owner_id=me,false);
  else display_title:='Moderação de avaliações'; end if;
  if p_before is not null then
    select r.created_at into cursor_at from venue_reviews r where r.id=p_before
      and (p_moderation or r.establishment_id=venue and r.target=target_kind and (p_field is null or r.field_id=p_field));
    if cursor_at is null then raise exception 'REVIEW:Página inválida'; end if;
  end if;
  select jsonb_build_object('count',count(*),'average',round(avg(score),1),'criteria',coalesce((
    select jsonb_object_agg(key,val) from (select c.key,round(avg(c.value::numeric),1) val from venue_reviews v
      cross join lateral jsonb_each_text(v.criteria) c where not v.hidden and v.establishment_id=venue and v.target=target_kind
      and (p_field is null or v.field_id=p_field) group by c.key) a
  ),'{}'::jsonb)) into summary from venue_reviews r where not r.hidden and r.establishment_id=venue and r.target=target_kind
    and (p_field is null or r.field_id=p_field);
  if manage then
    select count(*),count(*) filter(where recommendation_score>=9),count(*) filter(where recommendation_score<=6)
      into n,promoters,detractors from venue_reviews where establishment_id=venue and target='establishment' and not hidden and recommendation_score is not null;
    nps:=jsonb_build_object('responses',n,'value',case when n>=5 then round(100.0*(promoters-detractors)/n) else null end,
      'promoters',case when n>=5 then promoters else null end,'passives',case when n>=5 then n-promoters-detractors else null end,
      'detractors',case when n>=5 then detractors else null end);
  end if;
  with selected as (
    select r.* from venue_reviews r where (case when p_moderation then r.hidden or r.reply_hidden or exists(
      select 1 from venue_review_reports rp join moderation_reports mr on mr.id=rp.moderation_report_id where rp.review_id=r.id and mr.status in ('open','reviewing'))
      else not r.hidden and r.establishment_id=venue and r.target=target_kind and (p_field is null or r.field_id=p_field) end)
      and (cursor_at is null or (r.created_at,r.id)<(cursor_at,p_before)) order by r.created_at desc,r.id desc limit 51
  ) select coalesce(jsonb_agg(x.data order by x.created_at desc,x.id desc) filter(where x.rn<=50),'[]'::jsonb),count(*)>50 into items,more from (
    select r.id,r.created_at,row_number() over(order by r.created_at desc,r.id desc) rn,jsonb_build_object(
      'id',r.id,'target',r.target,'fieldId',r.field_id,'fieldName',f.name,'establishmentId',r.establishment_id,'establishmentName',e.name,
      'authorName',coalesce(nullif(p.nickname,''),p.name),'mine',coalesce(r.player_id=me,false),'score',r.score,'criteria',r.criteria,'comment',r.comment,
      'createdAt',r.created_at,'reply',case when not r.reply_hidden or p_moderation then r.reply else null end,'repliedAt',r.replied_at,
      'hidden',r.hidden,'replyHidden',r.reply_hidden,
      'reported',exists(select 1 from venue_review_reports where review_id=r.id and player_id=me and subject='review'),
      'replyReported',exists(select 1 from venue_review_reports where review_id=r.id and player_id=me and subject='reply'),
      'reports',case when p_moderation then coalesce((select jsonb_agg(jsonb_build_object('subject',rp.subject,'reason',rp.reason,'details',rp.details))
        from venue_review_reports rp where rp.review_id=r.id),'[]'::jsonb) else '[]'::jsonb end
    ) data from selected r join fields f on f.id=r.field_id join establishments e on e.id=r.establishment_id join players p on p.id=r.player_id
  ) x;
  return jsonb_build_object('title',display_title,'target',target_kind,'establishmentId',venue,'fieldId',p_field,
    'canReply',manage,'canModerate',moderator,'summary',summary,'nps',nps,'reviews',items,'hasMore',more,
    'fields',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name) order by f.name) from fields f where f.establishment_id=venue),'[]'::jsonb),
    'experiences',case when me is not null and me is distinct from owner_id and not p_moderation then coalesce((select jsonb_agg(jsonb_build_object(
      'kind',x.kind,'id',x.id,'fieldId',x.field_id,'establishmentId',x.establishment_id,'label',x.label,'at',x.at) order by x.at desc)
      from venue_review_experiences(me) x where x.establishment_id=venue and (p_field is null or x.field_id=p_field)
      and not exists(select 1 from venue_reviews r where r.player_id=me and r.experience_kind=x.kind and r.experience_id=x.id and r.target=target_kind)), '[]'::jsonb) else '[]'::jsonb end,
    'visitCandidates',case when manage then coalesce((select jsonb_agg(jsonb_build_object('bookingId',c.booking_id,'date',c.occurrence_date,
      'playerId',c.player_id,'playerName',c.player_name,'label',c.label)) from venue_review_candidates(venue) c),'[]'::jsonb) else '[]'::jsonb end);
end $$;

create function public.venue_review_action(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me(); r venue_reviews; x record; v uuid; rid uuid; owner_id uuid;
  target_kind text:=p_data->>'target'; subject_kind text:=p_data->>'subject'; body text; reason text; criteria_value jsonb; k text; val jsonb;
begin
  if me is null then raise exception 'REVIEW:Entre com uma conta ativa'; end if;
  if p_action='create' then
    select * into x from venue_review_experiences(me) where kind=p_data->>'kind' and id=(p_data->>'experienceId')::uuid;
    if x.id is null then raise exception 'REVIEW:É necessário encerrar a experiência e registrar sua presença'; end if;
    select owner_player_id into owner_id from establishments where id=x.establishment_id;
    if owner_id=me then raise exception 'REVIEW:O proprietário não avalia o próprio local'; end if;
    if target_kind not in ('field','establishment') or target_kind is null then raise exception 'REVIEW:Local inválido'; end if;
    if jsonb_typeof(p_data->'score') is distinct from 'number' or (p_data->>'score') !~ '^[1-5]$' then raise exception 'REVIEW:Nota de 1 a 5 estrelas'; end if;
    body:=btrim(coalesce(p_data->>'comment',''));
    if char_length(body)>1500 then raise exception 'REVIEW:Comentário de até 1.500 caracteres'; end if;
    criteria_value:=p_data->'criteria';
    if jsonb_typeof(criteria_value) is distinct from 'object' then raise exception 'REVIEW:Preencha os critérios'; end if;
    for k,val in select * from jsonb_each(criteria_value) loop
      if jsonb_typeof(val)<>'number' or val::text !~ '^[1-5]$' or not (k=any(case when target_kind='field'
        then array['structure','lighting','cleanliness','maintenance'] else array['service','organization','snack'] end)) then raise exception 'REVIEW:Critérios inválidos'; end if;
    end loop;
    if not (criteria_value ?& case when target_kind='field' then array['structure','lighting','cleanliness','maintenance'] else array['service','organization'] end) then raise exception 'REVIEW:Preencha os critérios obrigatórios'; end if;
    if p_data->'nps' is not null and p_data->'nps'<>'null'::jsonb and (target_kind<>'establishment' or jsonb_typeof(p_data->'nps')<>'number' or (p_data->>'nps') !~ '^(10|[0-9])$') then raise exception 'REVIEW:Recomendação de 0 a 10 somente para estabelecimento'; end if;
    -- Limite de criação, inclusive contra scripts que tenham várias experiências.
    if (select count(*) from venue_reviews where player_id=me and created_at>now()-interval '1 hour')>=10 then raise exception 'REVIEW:Muitas avaliações. Tente mais tarde'; end if;
    insert into venue_reviews(player_id,experience_kind,experience_id,target,establishment_id,field_id,score,criteria,comment,recommendation_score)
      values(me,x.kind,x.id,target_kind,x.establishment_id,x.field_id,(p_data->>'score')::int,criteria_value,body,(p_data->>'nps')::int)
      on conflict(player_id,experience_kind,experience_id,target) do nothing returning id into rid;
    if rid is null then raise exception 'REVIEW:Você já avaliou este local nesta experiência'; end if;
    insert into venue_review_audit(actor_id,review_id,action,reason) values(me,rid,'create','Experiência e presença verificadas no servidor');
    return jsonb_build_object('id',rid);
  elsif p_action='visit' then
    select * into x from venue_review_candidates((p_data->>'establishmentId')::uuid) where booking_id=(p_data->>'bookingId')::uuid
      and occurrence_date=(p_data->>'date')::date and player_id=(p_data->>'playerId')::uuid;
    if x.booking_id is null then raise exception 'REVIEW:Confirme apenas uma presença de reserva encerrada sob sua gestão'; end if;
    insert into venue_review_visits(booking_id,occurrence_date,player_id,confirmed_by) values(x.booking_id,x.occurrence_date,x.player_id,me)
      on conflict(booking_id,occurrence_date,player_id) do nothing returning id into rid;
    insert into venue_review_audit(actor_id,action,reason) values(me,'visit','Presença confirmada na reserva '||x.booking_id||' em '||x.occurrence_date||' para '||x.player_id);
    return jsonb_build_object('id',rid);
  end if;
  select * into r from venue_reviews where id=(p_data->>'reviewId')::uuid for update;
  if r.id is null then raise exception 'REVIEW:Avaliação indisponível'; end if;
  select owner_player_id into owner_id from establishments where id=r.establishment_id;
  if p_action='reply' then
    if me<>owner_id or r.hidden or r.reply_hidden then raise exception 'REVIEW:Resposta exclusiva do proprietário; conteúdo moderado não pode ser alterado'; end if;
    body:=btrim(coalesce(p_data->>'text',''));
    if char_length(body) not between 1 and 1500 then raise exception 'REVIEW:Resposta de 1 a 1.500 caracteres'; end if;
    if exists(select 1 from venue_review_reports rp join moderation_reports mr on mr.id=rp.moderation_report_id
      where rp.review_id=r.id and rp.subject='reply' and mr.status in ('open','reviewing')) then raise exception 'REVIEW:Resposta em análise não pode ser alterada'; end if;
    update venue_reviews set reply=body,replied_at=clock_timestamp() where id=r.id;
    insert into venue_review_audit(actor_id,review_id,action,reason) values(me,r.id,'reply',body);
  elsif p_action='report' then
    if subject_kind not in ('review','reply') or subject_kind is null or r.hidden or (subject_kind='reply' and (r.reply is null or r.reply_hidden)) then raise exception 'REVIEW:Conteúdo indisponível'; end if;
    reason:=p_data->>'reason';body:=btrim(coalesce(p_data->>'details',''));
    if reason not in ('harassment','fraud','unsafe_content','spam','other') or reason is null or char_length(body)>1000 then raise exception 'REVIEW:Denúncia inválida'; end if;
    select id into rid from venue_review_reports where review_id=r.id and player_id=me and subject=subject_kind;
    if rid is not null then return jsonb_build_object('id',rid); end if;
    if (select count(*) from venue_review_reports where player_id=me and created_at>now()-interval '1 hour')>=10 then raise exception 'REVIEW:Muitas denúncias. Tente mais tarde'; end if;
    insert into moderation_reports(reporter_player_id,target_type,target_id,reason,details) values(me,'establishment',r.establishment_id,reason,
      'Avaliação '||r.id||' · '||subject_kind||': '||body||E'\nConteúdo: '||case when subject_kind='reply' then r.reply else r.comment end) returning id into v;
    insert into venue_review_reports(review_id,player_id,subject,reason,details,moderation_report_id) values(r.id,me,subject_kind,reason,body,v) returning id into rid;
    return jsonb_build_object('id',rid);
  elsif p_action='moderate' then
    if public.platform_admin_role() is null then raise exception 'REVIEW:Acesso exclusivo da administração'; end if;
    reason:=btrim(coalesce(p_data->>'reason',''));
    if subject_kind not in ('review','reply') or subject_kind is null or char_length(reason) not between 10 and 1000
      or jsonb_typeof(p_data->'hidden') is distinct from 'boolean' or (subject_kind='reply' and r.reply is null) then raise exception 'REVIEW:Informe conteúdo, decisão e motivo de 10 a 1.000 caracteres'; end if;
    update venue_reviews set hidden=case when subject_kind='review' then (p_data->>'hidden')::boolean else hidden end,
      reply_hidden=case when subject_kind='reply' then (p_data->>'hidden')::boolean else reply_hidden end where id=r.id;
    update moderation_reports set status=case when (p_data->>'hidden')::boolean then 'resolved' else 'dismissed' end,resolved_at=clock_timestamp()
      where id in(select moderation_report_id from venue_review_reports where review_id=r.id and subject=subject_kind);
    insert into venue_review_audit(actor_id,review_id,action,reason) values(me,r.id,'moderate_'||subject_kind||'_'||(p_data->>'hidden'),reason);
    insert into platform_admin_audit(actor_auth_user_id,action,target_id,reason,before_value,after_value)
      values(auth.uid(),'venue_review_moderate',r.id::text,reason,jsonb_build_object('subject',subject_kind,'hidden',case when subject_kind='review' then r.hidden else r.reply_hidden end),
        jsonb_build_object('subject',subject_kind,'hidden',(p_data->>'hidden')::boolean));
  else raise exception 'REVIEW:Ação inválida'; end if;
  return jsonb_build_object('id',r.id);
end $$;
revoke all on function public.venue_review_experiences(uuid),public.venue_review_candidates(uuid),public.venue_review_snapshot(uuid,uuid,uuid,boolean),public.venue_review_action(text,jsonb) from public,anon,authenticated;
grant execute on function public.venue_review_snapshot(uuid,uuid,uuid,boolean) to anon,authenticated;
grant execute on function public.venue_review_action(text,jsonb) to authenticated;

-- A busca mantém proximidade/cadastro como ordenação. Só acrescenta reputação,
-- sem incluir NPS, reordenar por plano ou mudar a assinatura/permissões da RPC.
do $$ declare definition text; needle text:='''updatedAt'',d.updated_at,'; begin
  select pg_get_functiondef('public.search_field_directory(double precision,double precision,double precision,text,text,integer)'::regprocedure) into definition;
  if position(needle in definition)=0 then raise exception 'Review directory hook missing'; end if;
  definition:=replace(definition,needle,needle||E'\n    ''reviewAverage'',(select round(avg(r.score),1) from venue_reviews r where r.field_id=d.field_id and r.target=''field'' and not r.hidden),\n    ''reviewCount'',(select count(*) from venue_reviews r where r.field_id=d.field_id and r.target=''field'' and not r.hidden),');
  execute definition;
end $$;
