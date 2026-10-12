create table public.venue_prospects (
 id uuid primary key default gen_random_uuid(),establishment_id uuid not null references establishments(id),
 name text not null,email text,phone text,channel text check(channel in('email','whatsapp')),
 consent_at timestamptz,created_by uuid not null references players(id),created_at timestamptz not null default now(),
 check(email is not null or phone is not null)
);
create table public.venue_invites (
 id uuid primary key default gen_random_uuid(),prospect_id uuid not null references venue_prospects(id),
 status text not null default 'queued' check(status in('queued','sending','accepted','uncertain','failed')),
 provider_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.venue_tab_requests(id uuid primary key,tab_id uuid not null references service_tabs(id),actor uuid not null references players(id),invite_id uuid references venue_invites(id));
create table public.venue_occupancy (
 id uuid primary key default gen_random_uuid(),establishment_id uuid not null references establishments(id),field_id uuid not null references fields(id),
 label text not null,starts_at timestamptz not null default now(),ends_at timestamptz not null,
 ended_at timestamptz,created_by uuid not null references players(id),check(ends_at>starts_at)
);
create unique index venue_one_active_field on venue_occupancy(field_id) where ended_at is null;
create table public.venue_incidents (
 id uuid primary key default gen_random_uuid(),establishment_id uuid not null references establishments(id),
 title text not null,severity text not null check(severity in('info','warning','urgent')),created_by uuid not null references players(id),
 created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid references players(id)
);
do $$declare t text;begin foreach t in array array['venue_prospects','venue_invites','venue_tab_requests','venue_occupancy','venue_incidents'] loop
 execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon,authenticated',t);end loop;end$$;
-- Existing staff start without additional grants: the owner explicitly authorizes each module.
create or replace function public.can_operate_establishment(p_establishment_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select venue_can(p_establishment_id,'pdv')
$$;
create or replace function public.can_receive_establishment_payment(p_establishment_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select venue_can(p_establishment_id,'cash')
$$;
drop policy if exists sale_payments_write_staff on sale_payments;
create policy sale_payments_write_staff on sale_payments for all to authenticated using(exists(select 1 from service_tabs t where t.id=tab_id and venue_can(t.establishment_id,'cash'))) with check(exists(select 1 from service_tabs t where t.id=tab_id and venue_can(t.establishment_id,'cash')));
drop policy if exists cash_shifts_staff on cash_shifts;
create policy cash_shifts_staff on cash_shifts for all to authenticated using(venue_can(establishment_id,'cash')) with check(venue_can(establishment_id,'cash'));
revoke insert,update,delete on cash_shifts from authenticated;
drop policy if exists coaches_write_staff on coaches;
drop policy if exists products_write_staff on products;
create policy products_write_staff on products for all to authenticated using(venue_can(establishment_id,'menu')) with check(venue_can(establishment_id,'menu'));
drop policy if exists product_categories_write_staff on product_categories;
create policy product_categories_write_staff on product_categories for all to authenticated using(venue_can(establishment_id,'menu')) with check(venue_can(establishment_id,'menu'));
drop policy if exists establishment_staff_write_owner on establishment_staff;
-- No direct mutation of grants/staff: only the audited owner RPC.
revoke insert,update,delete on establishment_staff from authenticated;
create function public.venue_snapshot(p_venue uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();v uuid:=p_venue;result jsonb;begin
 if me is null then raise exception 'OPERAÇÃO: Entre na sua conta.';end if;
 if v is null then return jsonb_build_object('venues',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'owner',e.owner_player_id=me)) from establishments e where e.owner_player_id=me or exists(select 1 from establishment_staff s join venue_staff_grants g using(establishment_id,player_id) where s.establishment_id=e.id and s.player_id=me and s.active and cardinality(g.capabilities)>0)),'[]'::jsonb));end if;
 if not (is_establishment_owner(v) or exists(select 1 from establishment_staff s join venue_staff_grants g using(establishment_id,player_id) where s.establishment_id=v and s.player_id=me and s.active and cardinality(g.capabilities)>0)) then raise exception 'OPERAÇÃO: Sem acesso a este estabelecimento.';end if;
 result:=jsonb_build_object('id',v,'me',me,'name',(select name from establishments where id=v),'owner',is_establishment_owner(v),'server_time',now(),
 'capabilities',coalesce((select jsonb_agg(c) from unnest(array['pdv','live','reservations','cash','classes','own_classes','class_prices','reports','kitchen']) c where venue_can(v,c)),'[]'::jsonb),
 'fields',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from fields where establishment_id=v),'[]'::jsonb),
 'coaches',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',p.name,'player_id',p.id)) from coaches c join players p on p.id=c.player_id where c.establishment_id=v and c.active),'[]'::jsonb));
 if is_establishment_owner(v) then result:=result||jsonb_build_object('staff',coalesce((select jsonb_agg(jsonb_build_object('player_id',s.player_id,'name',p.name,'active',s.active,'roles',s.roles,'capabilities',coalesce(g.capabilities,'{}'))) from establishment_staff s join players p on p.id=s.player_id left join venue_staff_grants g using(establishment_id,player_id) where s.establishment_id=v),'[]'::jsonb));end if;
 if venue_can(v,'pdv') then
  result:=result||jsonb_build_object('teams',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'players',coalesce((select jsonb_agg(jsonb_build_object('id',pl.id,'name',pl.name,'avatar_url',pl.avatar_url)) from pelada_memberships pm join players pl on pl.id=pm.player_id where pm.pelada_id=p.id and pm.active),'[]'::jsonb))) from peladas p where
   exists(select 1 from field_bookings b where b.establishment_id=v and b.pelada_id=p.id and ((b.recurrence='single' and b.date=(now() at time zone 'America/Sao_Paulo')::date) or (b.recurrence='weekly' and b.day_of_week=extract(dow from now() at time zone 'America/Sao_Paulo')))) or
   exists(select 1 from games g join fields f on f.id=g.field_id where f.establishment_id=v and g.pelada_id=p.id and g.status<>'cancelled' and (g.scheduled_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date)),'[]'::jsonb));
 end if;
 if venue_can(v,'live') or venue_can(v,'reservations') then
  result:=result||jsonb_build_object('occupancy',coalesce((select jsonb_agg(o) from venue_occupancy o where establishment_id=v and ended_at is null),'[]'::jsonb),
  'bookings',coalesce((select jsonb_agg(b) from field_bookings b where b.establishment_id=v and ((b.recurrence='single' and b.date=(now() at time zone 'America/Sao_Paulo')::date) or (b.recurrence='weekly' and b.day_of_week=extract(dow from now() at time zone 'America/Sao_Paulo')))),'[]'::jsonb),
  'incidents',coalesce((select jsonb_agg(i) from (select * from venue_incidents where establishment_id=v order by created_at desc limit 50)i),'[]'::jsonb),
  'open_tabs',(select count(*) from service_tabs where establishment_id=v and status not in('closed','cancelled')),
  'kitchen_orders',(select count(*) from service_orders o join service_tabs t on t.id=o.tab_id where t.establishment_id=v and o.status in('submitted','preparing','ready')));
 end if;
 if venue_can(v,'kitchen') then
  result:=result||jsonb_build_object('kitchen',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'status',i.status,'name',p.name,'quantity',i.quantity,'notes',i.notes,'station',p.station,'tab_label',t.label,'table_label',t.table_label)) from service_order_items i join products p on p.id=i.product_id join service_orders o on o.id=i.order_id join service_tabs t on t.id=o.tab_id where t.establishment_id=v and i.status in('submitted','preparing','ready')),'[]'::jsonb));
 end if;
 if venue_can(v,'reports') or venue_can(v,'cash') then
  result:=result||jsonb_build_object('shifts',coalesce((select jsonb_agg(s) from (select * from cash_shifts where establishment_id=v order by opened_at desc limit 20)s),'[]'::jsonb),
   'audit',coalesce((select jsonb_agg(a) from (select action,created_at,target_id from venue_audit where establishment_id=v order by id desc limit 30)a),'[]'::jsonb));
  result:=result||jsonb_build_object('food_received_cents',(select coalesce(round(sum(amount)*100),0) from sale_payments sp join service_tabs t on t.id=sp.tab_id where t.establishment_id=v and sp.reversed_at is null and (sp.paid_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date),
   'classes_cash_cents',(select coalesce(sum(amount_cents),0) from academy_bills b join class_programs cp on cp.id=b.program_id where cp.establishment_id=v and b.status='cash_paid' and b.plan<>'legacy' and (b.paid_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date));
 end if;return result;
end$$;
create function public.venue_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();v uuid:=(p_data->>'venueId')::uuid;k uuid;target uuid;request uuid;
 tab service_tabs;participant tab_participants;prospect uuid;invite uuid;contact text;caps text[];o venue_occupancy;shift cash_shifts;expected numeric;
begin
 if me is null then raise exception 'OPERAÇÃO: Entre na sua conta.';end if;
 if p_action='staff_save' then
  if not is_establishment_owner(v) then raise exception 'OPERAÇÃO: Somente o dono libera acessos.';end if;
  if coalesce(p_data->>'role','') not in('coach','cashier','manager','partner','kitchen') then raise exception 'OPERAÇÃO: Função inválida.';end if;
  select p.id into target from players p join auth.users u on u.id=p.auth_user_id where lower(u.email)=lower(trim(p_data->>'email')) and u.email_confirmed_at is not null and not p.is_guest;
  if target is null or target=me then raise exception 'OPERAÇÃO: Informe e-mail de outra conta já confirmada.';end if;
  select array_agg(value) into caps from jsonb_array_elements_text(p_data->'capabilities');caps:=coalesce(caps,'{}');
  insert into venue_staff_grants(establishment_id,player_id,capabilities) values(v,target,caps) on conflict(establishment_id,player_id) do update set capabilities=excluded.capabilities;
  insert into establishment_staff(establishment_id,player_id,roles,active) values(v,target,array[p_data->>'role'],true) on conflict(establishment_id,player_id) do update set roles=excluded.roles,active=true;
  if p_data->>'role'='coach' then insert into coaches(establishment_id,player_id) values(v,target) on conflict(establishment_id,player_id) do update set active=true;end if;k:=target;
 elsif p_action='staff_revoke' then
  if not is_establishment_owner(v) then raise exception 'OPERAÇÃO: Somente o dono revoga acessos.';end if;k:=(p_data->>'playerId')::uuid;
  update establishment_staff set active=false where establishment_id=v and player_id=k;update coaches set active=false where establishment_id=v and player_id=k;
 elsif p_action='cash_shift' then
  if not venue_can(v,'cash') then raise exception 'OPERAÇÃO: Sem acesso ao caixa.';end if;
  if (p_data->>'amountCents')::integer not between 0 and 100000000 then raise exception 'OPERAÇÃO: Valor de caixa inválido.';end if;
  perform pg_advisory_xact_lock(hashtext('cash:'||v::text));select * into shift from cash_shifts where establishment_id=v and status='open' order by opened_at desc limit 1 for update;
  if p_data->>'operation'='open' then
   if shift.id is not null then raise exception 'OPERAÇÃO: Já existe turno aberto. Atualize antes de tentar de novo.';end if;
   insert into cash_shifts(establishment_id,opened_by_player_id,opening_amount) values(v,me,(p_data->>'amountCents')::int/100.0) returning id into k;
  elsif p_data->>'operation'='close' and shift.id=(p_data->>'shiftId')::uuid then
   select shift.opening_amount+coalesce((select sum(sp.amount) from sale_payments sp join service_tabs t on t.id=sp.tab_id where t.establishment_id=v and sp.method='cash' and sp.reversed_at is null and sp.paid_at>=shift.opened_at),0)+
    coalesce((select sum(b.amount_cents)/100.0 from academy_bills b join class_programs cp on cp.id=b.program_id where cp.establishment_id=v and b.plan<>'legacy' and b.status='cash_paid' and b.paid_at>=shift.opened_at),0)+
    coalesce((select sum(ce.amount) from class_enrollments ce join class_sessions cs on cs.id=ce.session_id join class_programs cp on cp.id=cs.program_id where cp.establishment_id=v and ce.payment_status='paid' and ce.payment_method='cash' and ce.paid_at>=shift.opened_at),0) into expected;
   update cash_shifts set closing_amount=(p_data->>'amountCents')::int/100.0,expected_amount=expected,difference=(p_data->>'amountCents')::int/100.0-expected,status='closed',closed_at=now() where id=shift.id;k:=shift.id;
  else raise exception 'OPERAÇÃO: Turno mudou. Atualize o caixa.';end if;
 elsif p_action='kitchen_status' then
  if not venue_can(v,'kitchen') then raise exception 'OPERAÇÃO: Sem acesso à cozinha.';end if;
  k:=(p_data->>'itemId')::uuid;
  update service_order_items i set status=p_data->>'status' from service_orders o,service_tabs t where i.id=k and i.order_id=o.id and o.tab_id=t.id and t.establishment_id=v and
   ((i.status='submitted' and p_data->>'status'='preparing') or (i.status='preparing' and p_data->>'status'='ready') or (i.status='ready' and p_data->>'status'='delivered'));
  if not found then raise exception 'OPERAÇÃO: Item mudou. Atualize a fila.';end if;
  update service_orders o set status=case
   when not exists(select 1 from service_order_items i where i.order_id=o.id and i.status not in('delivered','cancelled')) then 'delivered'
   when not exists(select 1 from service_order_items i where i.order_id=o.id and i.status not in('ready','delivered','cancelled')) then 'ready'
   when exists(select 1 from service_order_items i where i.order_id=o.id and i.status='preparing') then 'preparing' else 'submitted' end,
   completed_at=case when not exists(select 1 from service_order_items i where i.order_id=o.id and i.status not in('delivered','cancelled')) then now() else null end
  where o.id=(select order_id from service_order_items where id=k);
 elsif p_action='tab_open' then
  if not venue_can(v,'pdv') then raise exception 'OPERAÇÃO: Sem acesso ao PDV.';end if;
  request:=(p_data->>'requestId')::uuid;
  if request is null then raise exception 'OPERAÇÃO: Identificador de atendimento obrigatório.';end if;
  perform pg_advisory_xact_lock(hashtext(request::text));
  select t.* into tab from venue_tab_requests r join service_tabs t on t.id=r.tab_id where r.id=request and r.actor=me and t.establishment_id=v;
  if tab.id is not null then select * into participant from tab_participants where tab_id=tab.id limit 1;select invite_id into invite from venue_tab_requests where id=request;return jsonb_build_object('tab',tab,'participant',participant,'inviteId',invite);end if;
  target:=nullif(p_data->>'playerId','')::uuid;
  if target is not null then
   if not exists(select 1 from jsonb_array_elements(venue_snapshot(v)->'teams') team cross join lateral jsonb_array_elements(team->'players') p where p->>'id'=target::text) then raise exception 'OPERAÇÃO: Jogador não pertence a time em atendimento hoje.';end if;
   select name into contact from players where id=target;
  else
   contact:=trim(p_data->>'name');
   if length(contact) not between 2 and 100 then raise exception 'OPERAÇÃO: Informe o nome.';end if;
   if (nullif(trim(p_data->>'email'),'') is null and nullif(trim(p_data->>'phone'),'') is null) or
    (nullif(trim(p_data->>'email'),'') is not null and (p_data->>'email')!~'^[^\s@]+@[^\s@]+\.[^\s@]+$') or
    (nullif(trim(p_data->>'phone'),'') is not null and regexp_replace(p_data->>'phone','\D','','g')!~'^[0-9]{10,13}$') then raise exception 'OPERAÇÃO: Informe celular ou e-mail válido.';end if;
   if (select count(*) from venue_prospects where created_by=me and created_at>now()-interval '1 hour')>=30 then raise exception 'OPERAÇÃO: Limite de pré-cadastros por hora.';end if;
   insert into venue_prospects(establishment_id,name,email,phone,channel,consent_at,created_by)
   values(v,contact,nullif(lower(trim(p_data->>'email')),''),nullif(regexp_replace(p_data->>'phone','\D','','g'),''),case when (p_data->>'consent')::boolean then p_data->>'channel' end,case when (p_data->>'consent')::boolean then now() end,me) returning id into prospect;
   if (p_data->>'consent')::boolean then
    if (p_data->>'channel'='email' and nullif(trim(p_data->>'email'),'') is null) or (p_data->>'channel'='whatsapp' and nullif(trim(p_data->>'phone'),'') is null) or coalesce(p_data->>'channel','') not in('email','whatsapp') then raise exception 'OPERAÇÃO: Canal de convite inválido.';end if;
    insert into venue_invites(prospect_id) values(prospect) returning id into invite;
   end if;
  end if;
  insert into service_tabs(establishment_id,label,customer_player_id,customer_name,table_label,opened_by_player_id)
   values(v,'C-'||upper(substr(request::text,1,8)),target,contact,nullif(trim(p_data->>'table'),''),me) returning * into tab;
  insert into tab_participants(tab_id,player_id,name) values(tab.id,target,contact) returning * into participant;
  insert into venue_tab_requests values(request,tab.id,me,invite);k:=tab.id;
 elsif p_action='start_use' then
  if not venue_can(v,'reservations') then raise exception 'OPERAÇÃO: Sem permissão para iniciar locação.';end if;
  if not exists(select 1 from fields where id=(p_data->>'fieldId')::uuid and establishment_id=v) or (p_data->>'minutes')::int not between 15 and 360 or length(trim(p_data->>'label')) not between 2 and 100 then raise exception 'OPERAÇÃO: Quadra, duração ou responsável inválido.';end if;
  insert into venue_occupancy(establishment_id,field_id,label,ends_at,created_by) values(v,(p_data->>'fieldId')::uuid,trim(p_data->>'label'),now()+make_interval(mins=>(p_data->>'minutes')::int),me) returning id into k;
 elsif p_action in('end_use','extend_use') then
  select * into o from venue_occupancy where id=(p_data->>'id')::uuid and establishment_id=v for update;
  if not venue_can(v,'reservations') or o.id is null or o.ended_at is not null then raise exception 'OPERAÇÃO: Locação indisponível.';end if;k:=o.id;
  if p_action='end_use' then update venue_occupancy set ended_at=now() where id=k;
  else if (p_data->>'minutes')::int not between 1 and 120 then raise exception 'OPERAÇÃO: Prorrogação inválida.';end if;update venue_occupancy set ends_at=greatest(now(),ends_at)+make_interval(mins=>(p_data->>'minutes')::int) where id=k;end if;
 elsif p_action='incident' then
  if not venue_can(v,'live') then raise exception 'OPERAÇÃO: Sem acesso às ocorrências.';end if;
  if length(trim(p_data->>'title')) not between 3 and 500 then raise exception 'OPERAÇÃO: Descreva a ocorrência.';end if;
  insert into venue_incidents(establishment_id,title,severity,created_by) values(v,trim(p_data->>'title'),p_data->>'severity',me) returning id into k;
 elsif p_action='resolve_incident' then
  if not venue_can(v,'live') then raise exception 'OPERAÇÃO: Sem acesso às ocorrências.';end if;k:=(p_data->>'id')::uuid;
  update venue_incidents set resolved_at=now(),resolved_by=me where id=k and establishment_id=v and resolved_at is null;
 else raise exception 'OPERAÇÃO: Ação inválida.';end if;
 insert into venue_audit(establishment_id,actor,action,target_id) values(v,me,p_action,k);perform venue_ping(v);
 if p_action='tab_open' then return jsonb_build_object('tab',tab,'participant',participant,'inviteId',invite);end if;return jsonb_build_object('id',k);
end$$;
revoke all on function venue_snapshot(uuid),venue_action(text,jsonb) from public,anon,authenticated;
grant execute on function venue_snapshot(uuid),venue_action(text,jsonb) to authenticated;
-- The sender authenticates the original operator before using service_role.
create function public.venue_invite_service(p_id uuid,p_actor uuid,p_action text,p_provider_id text default null) returns jsonb
 language plpgsql security definer set search_path=public,pg_temp as $$
declare i venue_invites;p venue_prospects;operator uuid;begin
 if auth.role()<>'service_role' then raise exception 'forbidden';end if;
 select id into operator from players where auth_user_id=p_actor and not is_guest and not exists(select 1 from platform_account_controls where player_id=players.id and suspended);
 select * into i from venue_invites where id=p_id for update;select * into p from venue_prospects where id=i.prospect_id;
 if operator is null or p.consent_at is null or not (exists(select 1 from establishments where id=p.establishment_id and owner_player_id=operator) or exists(select 1 from establishment_staff s join venue_staff_grants g using(establishment_id,player_id) where s.establishment_id=p.establishment_id and s.player_id=operator and s.active and 'pdv'=any(g.capabilities))) then raise exception 'forbidden';end if;
 if p_action='peek' then return jsonb_build_object('channel',p.channel,'status',i.status);end if;
 if p_action='claim' then
  if i.status<>'queued' or i.created_at<now()-interval '24 hours' then return jsonb_build_object('status',i.status);end if;
  update venue_invites set status='sending',updated_at=now() where id=p_id;
  return jsonb_build_object('status','sending','channel',p.channel,'email',p.email,'phone',p.phone,'name',p.name,'venue_name',(select name from establishments where id=p.establishment_id));
 elsif p_action in('accepted','uncertain','failed') and i.status='sending' then
  update venue_invites set status=p_action,provider_id=left(p_provider_id,200),updated_at=now() where id=p_id;
  return jsonb_build_object('status',p_action);
 end if;raise exception 'invalid transition';
end$$;
revoke all on function venue_invite_service(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function venue_invite_service(uuid,uuid,text,text) to service_role;
