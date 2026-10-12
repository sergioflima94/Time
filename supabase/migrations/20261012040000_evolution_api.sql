alter table establishments drop constraint establishments_messaging_provider_check;
alter table establishments add constraint establishments_messaging_provider_check check(messaging_provider in('automatic','evolution_go','evolution_api','meta_cloud'));
alter table whatsapp_deliveries drop constraint whatsapp_deliveries_provider_check;
alter table whatsapp_deliveries drop constraint whatsapp_deliveries_fallback_from_provider_check;
alter table whatsapp_deliveries add constraint whatsapp_deliveries_provider_check check(provider in('evolution_go','evolution_api','meta_cloud','in_app'));
alter table whatsapp_deliveries add constraint whatsapp_deliveries_fallback_from_provider_check check(fallback_from_provider in('evolution_go','evolution_api','meta_cloud'));
create table venue_whatsapp_instances(establishment_id uuid primary key references establishments(id),instance_name text not null unique default ('mj-'||replace(gen_random_uuid()::text,'-','')),state text not null default 'unknown' check(state in('unknown','connecting','open','close')),updated_at timestamptz not null default now());
alter table venue_whatsapp_instances enable row level security;
revoke all on venue_whatsapp_instances from anon,authenticated;
create function whatsapp_instance_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare me uuid;v uuid:=(p_data->>'venueId')::uuid;r venue_whatsapp_instances;begin
 if auth.role()<>'service_role' or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>4096 then raise exception 'WHATSAPP: Serviço não autorizado.';end if;
 if p_action='sending_context' then
  select * into r from venue_whatsapp_instances where establishment_id=v;return jsonb_build_object('instance',r.instance_name,'state',r.state,'preference',(select messaging_provider from establishments where id=v));
 end if;
 select id into me from players where auth_user_id=(p_data->>'actor')::uuid and not is_guest;
 if not credit_actor_allowed(me) or not exists(select 1 from establishments where id=v and owner_player_id=me) then raise exception 'WHATSAPP: Somente o dono conecta seu número.';end if;
 if p_action='context' then insert into venue_whatsapp_instances(establishment_id) values(v) on conflict do nothing;
 elsif p_action='save' then
  if p_data->>'state' not in('unknown','connecting','open','close') then raise exception 'WHATSAPP: Estado inválido.';end if;
  update venue_whatsapp_instances set state=p_data->>'state',updated_at=now() where establishment_id=v;
  insert into venue_audit(establishment_id,actor,action,target_id,details) values(v,me,'whatsapp_connection_checked',v,jsonb_build_object('provider','evolution_api','state',p_data->>'state'));
 else raise exception 'WHATSAPP: Ação inválida.';end if;
 select * into r from venue_whatsapp_instances where establishment_id=v;return jsonb_build_object('instance',r.instance_name,'state',r.state,'updated_at',r.updated_at);
end$$;
create table venue_whatsapp_dispatches(id text primary key check(length(id) between 1 and 160),establishment_id uuid not null references establishments(id),request_hash text not null,status text not null default 'processing' check(status in('processing','accepted','failed','uncertain')),provider text,provider_id text,created_at timestamptz not null default now());
alter table venue_whatsapp_dispatches enable row level security;revoke all on venue_whatsapp_dispatches from anon,authenticated;
create function whatsapp_dispatch_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r venue_whatsapp_dispatches;begin
 if auth.role()<>'service_role' or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>2048 or p_data->>'hash' !~ '^[a-f0-9]{64}$' or length(p_data->>'id') not between 1 and 160 then raise exception 'WHATSAPP: Serviço e dados válidos necessários.';end if;
 perform pg_advisory_xact_lock(hashtext('wa-dispatch:'||(p_data->>'id')));select * into r from venue_whatsapp_dispatches where id=p_data->>'id';
 if p_action='claim' then
  if r.id is not null then if r.establishment_id is distinct from (p_data->>'venueId')::uuid or r.request_hash is distinct from p_data->>'hash' then raise exception 'WHATSAPP: Mensagem mudou; não foi reenviada.';end if;return to_jsonb(r)||jsonb_build_object('claimed',false);end if;
  insert into venue_whatsapp_dispatches(id,establishment_id,request_hash) values(p_data->>'id',(p_data->>'venueId')::uuid,p_data->>'hash');return jsonb_build_object('claimed',true);
 end if;
 if p_action<>'finish' or r.request_hash is distinct from p_data->>'hash' or p_data->>'status' not in('accepted','failed','uncertain') then raise exception 'WHATSAPP: Ação inválida.';end if;
 update venue_whatsapp_dispatches set status=p_data->>'status',provider=p_data->>'provider',provider_id=left(p_data->>'providerId',150) where id=r.id and status='processing';return '{}';
end$$;
revoke all on function whatsapp_dispatch_service(text,jsonb) from public,anon,authenticated;grant execute on function whatsapp_dispatch_service(text,jsonb) to service_role;
revoke all on function whatsapp_instance_service(text,jsonb) from public,anon,authenticated;
grant execute on function whatsapp_instance_service(text,jsonb) to service_role;
do $$declare b text;begin
 b:=pg_get_functiondef('venue_invite_service(uuid,uuid,text,text)'::regprocedure);
 b:=replace(b,'''channel'',p.channel,''status''','''venue_id'',p.establishment_id,''channel'',p.channel,''status''');
 b:=replace(b,'''status'',''sending'',''channel''','''venue_id'',p.establishment_id,''status'',''sending'',''channel''');execute b;
 b:=pg_get_functiondef('credit_reminder_service(text,jsonb)'::regprocedure);
 b:=replace(b,'''id'',r.id,''channel'',r.channel','''venue_id'',a.establishment_id,''id'',r.id,''channel'',r.channel');execute b;
end$$;
