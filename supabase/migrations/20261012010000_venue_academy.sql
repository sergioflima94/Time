-- Operação autorizada, preços independentes e agenda materializada de aulas.
create table public.venue_staff_grants (
 establishment_id uuid not null references establishments(id) on delete cascade,
 player_id uuid not null references players(id),
 capabilities text[] not null default '{}',
 primary key(establishment_id,player_id),
 check(capabilities <@ array['pdv','live','reservations','cash','classes','own_classes','class_prices','reports','kitchen']::text[])
);
alter table public.venue_staff_grants enable row level security;
create function public.venue_can(v uuid,c text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select community_chat_me() is not null and (is_establishment_owner(v) or exists(
 select 1 from establishment_staff s join venue_staff_grants g using(establishment_id,player_id)
 where s.establishment_id=v and s.player_id=community_chat_me() and s.active and c=any(g.capabilities)))
$$;
create function public.academy_can(p uuid,pricing boolean default false) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from class_programs cp join coaches c on c.id=cp.coach_id where cp.id=p and
 (is_establishment_owner(cp.establishment_id) or (venue_can(cp.establishment_id,'classes') or
 (venue_can(cp.establishment_id,'own_classes') and c.player_id=community_chat_me() and c.active))
 and (not pricing or venue_can(cp.establishment_id,'class_prices'))))
$$;
create table public.academy_settings (
 program_id uuid primary key references class_programs(id) on delete cascade,
 monthly_cents integer check(monthly_cents between 0 and 10000000),
 drop_in_cents integer check(drop_in_cents between 0 and 10000000),
 swaps_enabled boolean not null default false,
 makeups_enabled boolean not null default false,
 cutoff_hours integer not null default 12 check(cutoff_hours between 0 and 168),
 makeup_days integer not null default 30 check(makeup_days between 1 and 90),
 check(monthly_cents is not null or drop_in_cents is not null)
);
insert into academy_settings(program_id,monthly_cents,drop_in_cents)
 select id,case when billing_type='monthly' then round(price*100)::int end,
 case when billing_type='drop_in' then round(price*100)::int end from class_programs where billing_type<>'package';
create table public.academy_bills (
 id uuid primary key default gen_random_uuid(), program_id uuid not null references class_programs(id),
 player_id uuid not null references players(id), plan text not null check(plan in('monthly','drop_in','legacy')),
 competence date, amount_cents integer not null check(amount_cents>=0),
 status text not null default 'pending' check(status in('pending','cash_paid','cancelled')),
 paid_at timestamptz,received_by uuid references players(id),created_at timestamptz not null default now(),
 request_id uuid unique,check((plan='monthly')=(competence is not null))
);
create unique index academy_monthly_once on academy_bills(program_id,player_id,competence) where plan='monthly' and status<>'cancelled';
create table public.academy_seats (
 id uuid primary key default gen_random_uuid(), bill_id uuid not null references academy_bills(id),
 session_id uuid not null references class_sessions(id),player_id uuid not null references players(id),
 active boolean not null default true, revision integer not null default 0,created_at timestamptz not null default now(),
 attendance text check(attendance in('present','absent','excused')),legacy_id uuid unique references class_enrollments(id),original_session_id uuid references class_sessions(id)
);
create unique index academy_seat_once on academy_seats(session_id,player_id) where active;
-- Importa reservas antigas sem converter pendências em receita nem cobrar novamente.
insert into academy_bills(id,program_id,player_id,plan,amount_cents,status,paid_at)
 select ce.id,cs.program_id,ce.player_id,'legacy',round(ce.amount*100)::int,
 case when ce.payment_status in('paid','waived') then 'cash_paid' else 'pending' end,ce.paid_at
 from class_enrollments ce join class_sessions cs on cs.id=ce.session_id where ce.status='confirmed' and ce.amount>=0;
insert into academy_seats(id,bill_id,session_id,player_id,legacy_id)
 select id,id,session_id,player_id,id from class_enrollments where status='confirmed' and amount>=0;
update academy_seats set original_session_id=session_id;
alter table academy_seats alter column original_session_id set not null;
create function public.academy_original_seat() returns trigger language plpgsql set search_path=public,pg_temp as $$begin new.original_session_id:=new.session_id;return new;end$$;
create trigger academy_original_seat before insert on academy_seats for each row execute function academy_original_seat();
revoke all on function academy_original_seat() from public,anon,authenticated;
create table public.academy_swaps (
 id uuid primary key default gen_random_uuid(),source_seat_id uuid not null references academy_seats(id),
 target_session_id uuid not null references class_sessions(id),source_revision integer not null,
 status text not null default 'open' check(status in('open','accepted','cancelled')),accepted_by uuid references players(id),
 created_at timestamptz not null default now()
);
create unique index academy_one_open_swap on academy_swaps(source_seat_id) where status='open';
create table public.academy_credits (
 id uuid primary key default gen_random_uuid(),source_seat_id uuid not null unique references academy_seats(id),
 player_id uuid not null references players(id),program_id uuid not null references class_programs(id),
 expires_at timestamptz not null,used_at timestamptz,created_at timestamptz not null default now()
);
create table public.venue_notices (
 id uuid primary key default gen_random_uuid(),player_id uuid not null references players(id),
 establishment_id uuid not null references establishments(id),title text not null,body text not null,
 created_at timestamptz not null default now(),read_at timestamptz
);
create table public.venue_audit (
 id bigint generated always as identity primary key,establishment_id uuid not null references establishments(id),
 actor uuid not null references players(id),action text not null,target_id uuid,details jsonb not null default '{}',created_at timestamptz not null default now()
);
create table public.venue_live_pings (
 establishment_id uuid primary key references establishments(id) on delete cascade,updated_at timestamptz not null default now(),revision bigint not null default 1
);
create policy venue_ping_read on venue_live_pings for select to authenticated using(venue_can(establishment_id,'live') or venue_can(establishment_id,'pdv') or venue_can(establishment_id,'classes') or venue_can(establishment_id,'own_classes'));
alter table venue_live_pings enable row level security;
grant select on venue_live_pings to authenticated;
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table venue_live_pings;end if;end$$;
create function public.venue_ping(v uuid) returns void language sql security definer set search_path=public,pg_temp as $$
 insert into venue_live_pings(establishment_id) values(v) on conflict(establishment_id) do update set updated_at=now(),revision=venue_live_pings.revision+1
$$;
do $$declare t text;begin foreach t in array array['academy_settings','academy_bills','academy_seats','academy_swaps','academy_credits','venue_notices','venue_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;end$$;
create function public.academy_check_seat(s uuid,p uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare cs class_sessions;cp class_programs;begin
 select * into cs from class_sessions where id=s for update;select * into cp from class_programs where id=cs.program_id;
 if cs.id is null or not cp.active or cs.status not in('scheduled','open','full') or cs.starts_at<=now() then raise exception 'OPERAÇÃO: Horário não disponível.';end if;
 if (select count(*) from academy_seats where session_id=s and active)>=cp.capacity then raise exception 'OPERAÇÃO: Turma sem vagas.';end if;
 if exists(select 1 from academy_seats a join class_sessions b on b.id=a.session_id where a.player_id=p and a.active and cs.starts_at<b.ends_at and cs.ends_at>b.starts_at) then raise exception 'OPERAÇÃO: Você já tem aula nesse horário.';end if;
end$$;
create function public.academy_compatible(source uuid,target uuid,makeup boolean default false) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from class_programs a join academy_settings sa on sa.program_id=a.id,class_programs b join academy_settings sb on sb.program_id=b.id
 where a.id=source and b.id=target and a.establishment_id=b.establishment_id and a.sport_id=b.sport_id and lower(trim(a.level))=lower(trim(b.level)) and a.format=b.format and a.duration_minutes=b.duration_minutes and a.coach_id=b.coach_id and a.active and b.active
 and sa.monthly_cents is not distinct from sb.monthly_cents and sa.drop_in_cents is not distinct from sb.drop_in_cents
 and case when makeup then sa.makeups_enabled and sb.makeups_enabled else sa.swaps_enabled and sb.swaps_enabled end)
$$;
create function public.academy_snapshot(p_venue uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();r jsonb;begin
 if me is null then raise exception 'OPERAÇÃO: Entre na sua conta.';end if;
 select jsonb_build_object('programs',coalesce((select jsonb_agg(to_jsonb(cp)||to_jsonb(st)||jsonb_build_object(
 'can_manage',academy_can(cp.id),'can_price',academy_can(cp.id,true),'venue_name',e.name,'coach_name',p.name,
 'sessions',coalesce((select jsonb_agg(to_jsonb(cs)||jsonb_build_object('occupied',(select count(*) from academy_seats a where a.session_id=cs.id and a.active))) from class_sessions cs where cs.program_id=cp.id and cs.starts_at>=now()-interval '7 days' and cs.starts_at<now()+interval '100 days'),'[]'::jsonb)))
 from class_programs cp join academy_settings st on st.program_id=cp.id join establishments e on e.id=cp.establishment_id join coaches c on c.id=cp.coach_id join players p on p.id=c.player_id
 where (p_venue is null or cp.establishment_id=p_venue) and (cp.active or academy_can(cp.id))),'[]'::jsonb),
 'seats',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('name',p.name,'program_id',cs.program_id,'starts_at',cs.starts_at,'ends_at',cs.ends_at)) from academy_seats a join players p on p.id=a.player_id join class_sessions cs on cs.id=a.session_id join class_programs cp on cp.id=cs.program_id
 where (p_venue is null or cp.establishment_id=p_venue) and (a.player_id=me or academy_can(cp.id)) and cs.starts_at>=now()-interval '35 days'),'[]'::jsonb),
 'bills',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('name',p.name)) from academy_bills b join class_programs cp on cp.id=b.program_id join players p on p.id=b.player_id
 where (p_venue is null or cp.establishment_id=p_venue) and (b.player_id=me or venue_can(cp.establishment_id,'cash') or venue_can(cp.establishment_id,'reports'))),'[]'::jsonb),
 'credits',coalesce((select jsonb_agg(to_jsonb(c)) from academy_credits c join class_programs cp on cp.id=c.program_id where c.player_id=me and c.used_at is null and c.expires_at>now() and (p_venue is null or cp.establishment_id=p_venue)),'[]'::jsonb),
 'swaps',coalesce((select jsonb_agg(to_jsonb(w)||jsonb_build_object('source_session_id',a.session_id,'program_id',cs.program_id)) from academy_swaps w join academy_seats a on a.id=w.source_seat_id join class_sessions cs on cs.id=a.session_id
 where w.status='open' and a.active and a.revision=w.source_revision and cs.starts_at>now() and (a.player_id=me or exists(select 1 from academy_seats x where x.session_id=w.target_session_id and x.player_id=me and x.active))),'[]'::jsonb),
 'notices',coalesce((select jsonb_agg(n) from (select * from venue_notices where player_id=me and (p_venue is null or establishment_id=p_venue) order by created_at desc limit 30)n),'[]'::jsonb)) into r;return r;
end$$;
create function public.academy_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();cp class_programs;cs class_sessions;st academy_settings;
 seat academy_seats;other_seat academy_seats;bill academy_bills;w academy_swaps;credit academy_credits;
 v uuid;k uuid;coach uuid;monthly integer;dropin integer;amount integer;plan text;d date;last_d date;slot jsonb;t timestamptz;count_i integer:=0;x record;
begin
 if me is null then raise exception 'OPERAÇÃO: Entre na sua conta.';end if;
 if p_action='program_save' then
  v:=(p_data->>'venueId')::uuid;k:=nullif(p_data->>'id','')::uuid;
  if k is not null then select * into cp from class_programs where id=k for update;v:=cp.establishment_id;
   if not academy_can(k,true) then raise exception 'OPERAÇÃO: Sem permissão para precificar essa turma.';end if;
  elsif not (is_establishment_owner(v) or venue_can(v,'classes') and venue_can(v,'class_prices') or venue_can(v,'own_classes') and venue_can(v,'class_prices')) then raise exception 'OPERAÇÃO: Sem permissão para criar e precificar aulas.';end if;
  monthly:=nullif(p_data->>'monthlyCents','')::int;dropin:=nullif(p_data->>'dropInCents','')::int;
  if monthly is null and dropin is null then raise exception 'OPERAÇÃO: Informe mensalidade ou preço avulso.';end if;
  if k is null then
   if coalesce(length(trim(p_data->>'name')),0) not between 2 and 100 or coalesce(length(trim(p_data->>'level')),0) not between 2 and 60 or (p_data->>'capacity')::int not between 1 and 100 or (p_data->>'durationMinutes')::int not between 15 and 360 or not exists(select 1 from fields where id=(p_data->>'fieldId')::uuid and establishment_id=v) then raise exception 'OPERAÇÃO: Nome, capacidade, duração ou campo inválido.';end if;
   coach:=(p_data->>'coachId')::uuid;
   if coach is null then
    insert into coaches(establishment_id,player_id,sport_ids) values(v,me,array[p_data->>'sportId']) on conflict(establishment_id,player_id) do update set active=true returning id into coach;
   end if;
   if not exists(select 1 from coaches where id=coach and establishment_id=v and active and (is_establishment_owner(v) or venue_can(v,'classes') or player_id=me)) then raise exception 'OPERAÇÃO: Professor inválido.';end if;
   insert into class_programs(establishment_id,name,sport_id,format,coach_id,field_id,level,capacity,duration_minutes,price,billing_type)
    values(v,trim(p_data->>'name'),p_data->>'sportId',p_data->>'format',coach,(p_data->>'fieldId')::uuid,trim(p_data->>'level'),
    case when p_data->>'format'='private' then 1 else (p_data->>'capacity')::int end,(p_data->>'durationMinutes')::int,coalesce(monthly,dropin)/100.0,case when monthly is not null then 'monthly' else 'drop_in' end) returning id into k;
  end if;
  insert into academy_settings(program_id,monthly_cents,drop_in_cents) values(k,monthly,dropin) on conflict(program_id) do update set monthly_cents=excluded.monthly_cents,drop_in_cents=excluded.drop_in_cents;
  update class_programs set price=coalesce(monthly,dropin)/100.0,billing_type=case when monthly is not null then 'monthly' else 'drop_in' end where id=k;
 elsif p_action='policy' then
  k:=(p_data->>'programId')::uuid;select * into cp from class_programs where id=k;v:=cp.establishment_id;
  if not is_establishment_owner(v) then raise exception 'OPERAÇÃO: Somente o dono define trocas e reposições.';end if;
  update academy_settings set swaps_enabled=(p_data->>'swaps')::boolean,makeups_enabled=(p_data->>'makeups')::boolean,cutoff_hours=(p_data->>'cutoffHours')::int,makeup_days=(p_data->>'makeupDays')::int where program_id=k;
 elsif p_action='publish' then
  k:=(p_data->>'programId')::uuid;select * into cp from class_programs where id=k;v:=cp.establishment_id;
  if not academy_can(k) then raise exception 'OPERAÇÃO: Sem permissão para publicar aulas.';end if;
  d:=(p_data->>'from')::date;last_d:=(p_data->>'until')::date;
  if d is null or last_d is null or d<(now() at time zone 'America/Sao_Paulo')::date or last_d<d or last_d>d+84 or coalesce(jsonb_array_length(p_data->'slots'),0) not between 1 and 7 then raise exception 'OPERAÇÃO: Publique até 12 semanas, com 1 a 7 horários.';end if;
  while d<=last_d loop
   for slot in select * from jsonb_array_elements(p_data->'slots') loop
    if (slot->>'weekday')::int not between 0 and 6 or coalesce(slot->>'time','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'OPERAÇÃO: Dia/horário inválido.';end if;
    if extract(dow from d)::int=(slot->>'weekday')::int then
     t:=(d+(slot->>'time')::time) at time zone 'America/Sao_Paulo';
     if t>now() and not exists(select 1 from class_sessions where program_id=k and starts_at=t and status<>'cancelled') then
      insert into class_sessions(program_id,starts_at,ends_at) values(k,t,t+make_interval(mins=>cp.duration_minutes));count_i:=count_i+1;
     end if;
    end if;
   end loop;d:=d+1;
  end loop;
 elsif p_action='enroll' then
  select * into cs from class_sessions where id=(p_data->>'sessionId')::uuid;select * into cp from class_programs where id=cs.program_id for update;k:=cp.id;v:=cp.establishment_id;
  select * into st from academy_settings where program_id=k;plan:=p_data->>'plan';
  if cs.id is null or cs.starts_at<=now() or cs.status not in('open','scheduled','full') or not cp.active then raise exception 'OPERAÇÃO: Horário não disponível.';end if;
  if plan not in('monthly','drop_in') or st.program_id is null then raise exception 'OPERAÇÃO: Plano inválido.';end if;
  -- Lock per student prevents simultaneous overlapping bookings across programmes.
  perform pg_advisory_xact_lock(hashtext(me::text));
  if plan='monthly' then
   d:=date_trunc('month',cs.starts_at at time zone 'America/Sao_Paulo')::date;amount:=st.monthly_cents;
   select * into bill from academy_bills where program_id=k and player_id=me and competence=d and status<>'cancelled' for update;
   if bill.id is null and exists(select 1 from academy_seats a join academy_bills b on b.id=a.bill_id join class_sessions s on s.id=a.session_id where a.player_id=me and a.active and b.program_id=k and b.plan<>'monthly' and date_trunc('month',s.starts_at at time zone 'America/Sao_Paulo')::date=d) then raise exception 'OPERAÇÃO: Você já tem avulsa neste mês. Combine a mudança de plano com o estabelecimento antes de gerar outra cobrança.';end if;
  else amount:=st.drop_in_cents;select * into bill from academy_bills where request_id=(p_data->>'requestId')::uuid and player_id=me;end if;
  if amount is null then raise exception 'OPERAÇÃO: Plano não oferecido.';end if;
  if bill.id is null then insert into academy_bills(program_id,player_id,plan,competence,amount_cents,request_id) values(k,me,plan,d,amount,(p_data->>'requestId')::uuid) returning * into bill;end if;
  if bill.program_id<>k or bill.plan<>plan then raise exception 'OPERAÇÃO: Solicitação incompatível.';end if;
  for x in select * from class_sessions where program_id=k and starts_at>now() and status in('open','scheduled','full') and
    ((plan='drop_in' and id=cs.id) or (plan='monthly' and date_trunc('month',starts_at at time zone 'America/Sao_Paulo')::date=d)) order by id loop
   if not exists(select 1 from academy_seats where (session_id=x.id and player_id=me and active) or (bill_id=bill.id and original_session_id=x.id)) then
    perform academy_check_seat(x.id,me);insert into academy_seats(bill_id,session_id,player_id) values(bill.id,x.id,me);count_i:=count_i+1;
   end if;
  end loop;
  if count_i=0 and not exists(select 1 from academy_seats where bill_id=bill.id and active) then raise exception 'OPERAÇÃO: Nenhuma aula disponível.';end if;
  k:=bill.id;
 elsif p_action='session_change' then
  select * into cs from class_sessions where id=(p_data->>'sessionId')::uuid for update;select * into cp from class_programs where id=cs.program_id for update;k:=cs.id;v:=cp.establishment_id;
  if not academy_can(cp.id) or cs.id is null or cs.starts_at<=now() then raise exception 'OPERAÇÃO: Sem permissão ou aula já iniciada.';end if;
  if p_data->>'status'='cancelled' then
   update class_sessions set status='cancelled',cancellation_reason=left(p_data->>'reason',500) where id=k;
  else
   t:=(p_data->>'startsLocal')::timestamp at time zone 'America/Sao_Paulo';if t is null or t<=now() then raise exception 'OPERAÇÃO: Nova data inválida.';end if;
   if exists(select 1 from academy_seats a join academy_seats b on b.player_id=a.player_id and b.active and b.session_id<>cs.id join class_sessions s on s.id=b.session_id where a.session_id=cs.id and a.active and t<s.ends_at and t+make_interval(mins=>cp.duration_minutes)>s.starts_at) then raise exception 'OPERAÇÃO: Novo horário conflita com outra aula de um aluno.';end if;
   update class_sessions set starts_at=t,ends_at=t+make_interval(mins=>cp.duration_minutes) where id=k;
  end if;
  update academy_swaps set status='cancelled' where status='open' and (target_session_id=k or source_seat_id in(select id from academy_seats where session_id=k));
  insert into venue_notices(player_id,establishment_id,title,body) select player_id,v,'Horário alterado pelo professor',cp.name||': confira a agenda. Trocas abertas foram canceladas. Reembolso, quando devido, precisa ser tratado pelo estabelecimento.' from academy_seats where session_id=k and active;
 elsif p_action='cash_received' then
  select * into bill from academy_bills where id=(p_data->>'billId')::uuid for update;select * into cp from class_programs where id=bill.program_id;v:=cp.establishment_id;k:=bill.id;
  if not venue_can(v,'cash') or bill.id is null or bill.plan='legacy' or bill.status='cancelled' then raise exception 'OPERAÇÃO: Sem permissão para receber esta cobrança.';end if;
  update academy_bills set status='cash_paid',paid_at=coalesce(paid_at,now()),received_by=coalesce(received_by,me) where id=k;
 elsif p_action in('offer_swap','makeup_request','attendance') then
  select * into seat from academy_seats where id=(p_data->>'seatId')::uuid for update;
  select * into cs from class_sessions where id=seat.session_id;select * into cp from class_programs where id=cs.program_id for update;k:=cp.id;v:=cp.establishment_id;
  select * into st from academy_settings where program_id=k;
  if p_action='attendance' then
   if not academy_can(k) or cs.starts_at>now() or not seat.active then raise exception 'OPERAÇÃO: Chamada disponível ao professor após início da aula.';end if;
   update academy_seats set attendance=p_data->>'status' where id=seat.id;
  else
   if seat.player_id is distinct from me or not seat.active or cs.status not in('open','scheduled','full') or cs.starts_at<=now()+make_interval(hours=>st.cutoff_hours) then raise exception 'OPERAÇÃO: Reserva inválida ou prazo encerrado.';end if;
   if p_action='offer_swap' then
    if not st.swaps_enabled or not exists(select 1 from class_sessions target join academy_settings ts on ts.program_id=target.program_id where target.id=(p_data->>'targetSessionId')::uuid and academy_compatible(k,target.program_id) and target.id<>cs.id and target.status in('open','scheduled','full') and target.starts_at>now()+make_interval(hours=>greatest(st.cutoff_hours,ts.cutoff_hours))) then raise exception 'OPERAÇÃO: Troca exige turma compatível, mesmo nível, professor e preço, dentro do prazo.';end if;
    insert into academy_swaps(source_seat_id,target_session_id,source_revision) values(seat.id,(p_data->>'targetSessionId')::uuid,seat.revision) returning id into k;
    insert into venue_notices(player_id,establishment_id,title,body) select a.player_id,v,'Pedido de troca de aula',cp.name||': um aluno quer trocar para seu horário. Veja em Minhas aulas.' from academy_seats a where a.session_id=(p_data->>'targetSessionId')::uuid and a.active and a.player_id<>me;
   else
    if not st.makeups_enabled or not exists(select 1 from academy_bills where id=seat.bill_id and status='cash_paid') then raise exception 'OPERAÇÃO: Reposição precisa estar habilitada e a cobrança quitada.';end if;
    if (select count(*) from academy_credits cr where cr.player_id=me and cr.program_id=cp.id and cr.created_at>=date_trunc('month',now()))>=2 then raise exception 'OPERAÇÃO: Limite de duas reposições no mês.';end if;
    insert into academy_credits(source_seat_id,player_id,program_id,expires_at) values(seat.id,me,cp.id,now()+make_interval(days=>st.makeup_days)) returning id into k;
    update academy_seats set active=false,attendance='excused',revision=revision+1 where id=seat.id;update academy_swaps set status='cancelled' where source_seat_id=seat.id and status='open';
   end if;
  end if;
 elsif p_action='accept_swap' then
  select * into w from academy_swaps where id=(p_data->>'swapId')::uuid for update;
  select * into seat from academy_seats where id=w.source_seat_id for update;select * into cs from class_sessions where id=seat.session_id;
  select * into cp from class_programs where id=cs.program_id for update;k:=cp.id;v:=cp.establishment_id;select * into st from academy_settings where program_id=k;
  select * into other_seat from academy_seats where session_id=w.target_session_id and player_id=me and active for update;
  if w.id is null or w.status<>'open' or not seat.active or seat.revision<>w.source_revision or other_seat.id is null or seat.player_id=me or not st.swaps_enabled
   or cs.starts_at<=now()+make_interval(hours=>st.cutoff_hours) or not exists(select 1 from class_sessions target join academy_settings ts on ts.program_id=target.program_id where target.id=w.target_session_id and academy_compatible(k,target.program_id) and target.status in('open','scheduled','full') and target.starts_at>now()+make_interval(hours=>greatest(st.cutoff_hours,ts.cutoff_hours)) and cs.starts_at>now()+make_interval(hours=>ts.cutoff_hours)) then raise exception 'OPERAÇÃO: Troca indisponível.';end if;
  perform pg_advisory_xact_lock(hashtext(least(me,seat.player_id)::text));perform pg_advisory_xact_lock(hashtext(greatest(me,seat.player_id)::text));
  update academy_seats set active=false where id in(seat.id,other_seat.id);
  perform academy_check_seat(w.target_session_id,seat.player_id);perform academy_check_seat(cs.id,me);
  update academy_seats set session_id=w.target_session_id,active=true,revision=revision+1 where id=seat.id;
  update academy_seats set session_id=cs.id,active=true,revision=revision+1 where id=other_seat.id;
  update academy_swaps set status='cancelled' where source_seat_id in(seat.id,other_seat.id) and status='open';
  update academy_swaps set status='accepted',accepted_by=me where id=w.id;
  insert into venue_notices(player_id,establishment_id,title,body) values(me,v,'Troca confirmada',cp.name||': confira sua nova data.'),(seat.player_id,v,'Troca confirmada',cp.name||': confira sua nova data.');k:=w.id;
 elsif p_action='makeup_book' then
  select * into credit from academy_credits where id=(p_data->>'creditId')::uuid for update;select * into cp from class_programs where id=credit.program_id for update;v:=cp.establishment_id;
  if credit.id is null or credit.player_id is distinct from me or credit.used_at is not null or credit.expires_at<=now() or not exists(select 1 from class_sessions where id=(p_data->>'sessionId')::uuid and academy_compatible(cp.id,program_id,true) and starts_at<=credit.expires_at) then raise exception 'OPERAÇÃO: Crédito/horário inválido ou aula após validade da reposição.';end if;
  perform pg_advisory_xact_lock(hashtext(me::text));perform academy_check_seat((p_data->>'sessionId')::uuid,me);
  select * into seat from academy_seats where id=credit.source_seat_id;
  insert into academy_seats(bill_id,session_id,player_id) values(seat.bill_id,(p_data->>'sessionId')::uuid,me) returning id into k;
  update academy_credits set used_at=now() where id=credit.id;
 else raise exception 'OPERAÇÃO: Ação inválida.';end if;
 if v is null then raise exception 'OPERAÇÃO: Registro não encontrado.';end if;
 insert into venue_audit(establishment_id,actor,action,target_id) values(v,me,p_action,k);perform venue_ping(v);
 return jsonb_build_object('id',k,'count',count_i);
end$$;
-- No direct client writes to canonical programme configuration or attendance/fees.
drop policy if exists class_programs_write_staff on class_programs;
drop policy if exists class_sessions_write_staff on class_sessions;
drop policy if exists class_enrollments_insert_self_or_staff on class_enrollments;
drop policy if exists class_enrollments_update_self_or_staff on class_enrollments;
drop policy if exists makeup_credits_write_staff on makeup_credits;
drop policy if exists class_attendances_write_staff on class_attendances;
revoke all on function venue_can(uuid,text),academy_can(uuid,boolean),academy_check_seat(uuid,uuid),academy_compatible(uuid,uuid,boolean),venue_ping(uuid),academy_snapshot(uuid),academy_action(text,jsonb) from public,anon,authenticated;
grant execute on function venue_can(uuid,text),academy_can(uuid,boolean),academy_snapshot(uuid),academy_action(text,jsonb) to authenticated;
