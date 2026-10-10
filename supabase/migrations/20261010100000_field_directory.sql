-- Catálogo público opt-in: contato não cria estabelecimento, reserva ou dono fictício.
create table public.field_directory_entries (
  id uuid primary key default gen_random_uuid(),
  field_id uuid unique references public.fields(id) on delete set null,
  name text not null check(char_length(btrim(name)) between 3 and 120),
  address text not null check(char_length(btrim(address)) between 5 and 240),
  sport_id text not null references public.sport_catalog(id),
  phone text not null check(phone ~ '^[0-9]{10,15}$'),
  whatsapp boolean not null default false,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  online_requested boolean not null default false,
  active boolean not null default true,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);
create unique index directory_active_identity on public.field_directory_entries(lower(btrim(name)),lower(btrim(address)),sport_id) where active;
alter table public.field_directory_entries enable row level security;
revoke all on public.field_directory_entries from public,anon,authenticated;

-- Só vínculos com conta ativa e responsável já aceito recebem o selo de cadastro.
create function public.directory_registered(p_field uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from fields f join establishments e on e.id=f.establishment_id
    join players p on p.id=e.owner_player_id
    where f.id=p_field and p.auth_user_id is not null
      and not exists(select 1 from platform_account_controls ar where ar.player_id=p.id and ar.suspended)
      and not exists(select 1 from assisted_venues av where av.establishment_id=e.id and av.status<>'accepted'));
$$;
revoke all on function public.directory_registered(uuid) from public,anon,authenticated;

create function public.search_field_directory(p_lat double precision default null,p_lng double precision default null,
  p_radius double precision default 20,p_query text default '',p_sport text default null,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if not platform_account_allowed() then raise exception 'Entre com uma conta ativa'; end if;
  if (p_lat is null)<>(p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180
    or p_lat in ('NaN'::float8,'Infinity'::float8,'-Infinity'::float8) or p_lng in ('NaN'::float8,'Infinity'::float8,'-Infinity'::float8)
    or p_radius is null or p_radius not between 1 and 100 or p_radius='NaN'::float8
    or p_offset is null or p_offset<0 or p_offset>10000 or char_length(coalesce(p_query,''))>120 then raise exception 'Busca inválida'; end if;
  with candidates as (
    select d.*,directory_registered(d.field_id) as registered,
      case when p_lat is not null then 6371*2*asin(sqrt(least(1.0,greatest(0.0,
        power(sin(radians(d.latitude-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(d.latitude))*power(sin(radians(d.longitude-p_lng)/2),2))))) end as km
    from field_directory_entries d
    where d.active and (p_sport is null or d.sport_id=p_sport)
      and (coalesce(btrim(p_query),'')='' or position(lower(btrim(p_query)) in lower(d.name||' '||d.address))>0)
  ), nearby as (select * from candidates where p_lat is null or km<=p_radius), page as (
    select * from nearby order by registered desc,km asc nulls last,lower(name),id limit 60 offset p_offset
  ) select jsonb_build_object('total',(select count(*) from nearby),'entries',coalesce((select jsonb_agg(jsonb_build_object(
    'id',d.id,'fieldId',d.field_id,'name',d.name,'address',d.address,'sportId',d.sport_id,'phone',d.phone,'whatsapp',d.whatsapp,
    'latitude',d.latitude,'longitude',d.longitude,'registered',d.registered,'distanceKm',d.km,'updatedAt',d.updated_at,
    'online',d.registered and d.online_requested and exists(select 1 from opportunity_slots s where s.field_id=d.field_id and s.active and s.starts_at>now() and growth_slot_free(s.field_id,s.starts_at,s.duration_minutes))
  ) order by d.registered desc,d.km asc nulls last,lower(d.name),d.id) from page d),'[]'::jsonb)) into result;
  return result;
end $$;

create function public.manage_field_directory() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid; admin boolean;
begin
  if not platform_account_allowed() then raise exception 'Entre com uma conta ativa'; end if;
  select id into me from players where auth_user_id=auth.uid();admin:=coalesce(platform_admin_role() in ('owner','admin'),false);
  return jsonb_build_object(
    'entries',coalesce((select jsonb_agg(to_jsonb(d)-'created_by') from field_directory_entries d
      where admin or exists(select 1 from fields f join establishments e on e.id=f.establishment_id where f.id=d.field_id and e.owner_player_id=me)),'[]'::jsonb),
    'fields',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'address',f.address,'sportId',f.sport_id,'latitude',f.latitude,'longitude',f.longitude,'establishmentName',e.name))
      from fields f join establishments e on e.id=f.establishment_id where directory_registered(f.id) and (admin or e.owner_player_id=me)),'[]'::jsonb));
end $$;

create function public.save_field_directory(p_id uuid,p_revision integer,p_data jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid; admin boolean; old field_directory_entries%rowtype; fid uuid; n text; a text; sport text; tel text; lat float8; lng float8; result uuid; onl boolean;
begin
  if not platform_account_allowed() then raise exception 'Entre com uma conta ativa'; end if;
  select id into me from players where auth_user_id=auth.uid();admin:=coalesce(platform_admin_role() in ('owner','admin'),false);
  if char_length(btrim(coalesce(p_reason,''))) not between 8 and 500 then raise exception 'Informe motivo de 8 a 500 caracteres'; end if;
  if p_id is not null then
    select * into old from field_directory_entries where id=p_id for update;
    if not found then raise exception 'Cadastro não encontrado'; end if;
    if p_revision is distinct from old.revision then raise exception 'Cadastro alterado. Atualize antes de salvar'; end if;
    if not admin and not exists(select 1 from fields f join establishments e on e.id=f.establishment_id where f.id=old.field_id and e.owner_player_id=me and directory_registered(f.id)) then raise exception 'Sem permissão'; end if;
  elsif p_revision is distinct from 0 then raise exception 'Revisão inválida'; end if;
  fid:=nullif(p_data->>'fieldId','')::uuid;
  if not admin and (fid is null or not exists(select 1 from fields f join establishments e on e.id=f.establishment_id where f.id=fid and e.owner_player_id=me and directory_registered(f.id))) then raise exception 'Somente administrador cria contato; donos publicam seus próprios campos'; end if;
  if not admin and old.id is not null and fid is distinct from old.field_id then raise exception 'Somente administrador altera vínculo'; end if;
  if fid is not null and not directory_registered(fid) then raise exception 'Vincule somente campo com responsável cadastrado e ativo'; end if;
  n:=btrim(p_data->>'name');a:=btrim(p_data->>'address');sport:=p_data->>'sportId';
  tel:=regexp_replace(coalesce(p_data->>'phone',''),'[^0-9]','','g');lat:=(p_data->>'latitude')::float8;lng:=(p_data->>'longitude')::float8;
  onl:=coalesce((p_data->>'online')::boolean,false);
  if n is null or char_length(n) not between 3 and 120 or a is null or char_length(a) not between 5 and 240
    or tel!~'^[0-9]{10,15}$' or lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180
    or lat='NaN'::float8 or lng='NaN'::float8 or not exists(select 1 from sport_catalog where id=sport)
    or (fid is not null and not exists(select 1 from fields where id=fid and sport_id=sport)) then raise exception 'Nome, endereço, telefone, esporte e coordenadas válidos são obrigatórios'; end if;
  if onl and fid is null then raise exception 'Contato direto não permite agendamento online'; end if;
  if p_id is null then
    insert into field_directory_entries(field_id,name,address,sport_id,phone,whatsapp,latitude,longitude,online_requested,active,created_by)
    values(fid,n,a,sport,tel,coalesce((p_data->>'whatsapp')::boolean,false),lat,lng,onl,coalesce((p_data->>'active')::boolean,true),auth.uid()) returning id into result;
  else
    update field_directory_entries set field_id=fid,name=n,address=a,sport_id=sport,phone=tel,whatsapp=coalesce((p_data->>'whatsapp')::boolean,false),
      latitude=lat,longitude=lng,online_requested=onl,active=coalesce((p_data->>'active')::boolean,true),revision=revision+1,updated_at=now() where id=p_id returning id into result;
  end if;
  insert into platform_admin_audit(actor_auth_user_id,action,target_id,reason,before_value,after_value)
    values(auth.uid(),'field_directory',result::text,btrim(p_reason),case when old.id is not null then to_jsonb(old)-'created_by' end,p_data);
  return result;
end $$;
revoke all on function public.search_field_directory(float8,float8,float8,text,text,integer),public.manage_field_directory(),public.save_field_directory(uuid,integer,jsonb,text) from public,anon;
grant execute on function public.search_field_directory(float8,float8,float8,text,text,integer),public.manage_field_directory(),public.save_field_directory(uuid,integer,jsonb,text) to authenticated;
