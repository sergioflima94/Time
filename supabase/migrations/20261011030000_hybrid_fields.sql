-- A physical space has many sports but one field_id and one booking calendar.
alter table public.fields add column sport_ids text[];
update public.fields set sport_ids=array[sport_id];
alter table public.fields alter column sport_ids set not null;
alter table public.field_directory_entries add column sport_ids text[];
update public.field_directory_entries set sport_ids=array[sport_id];
alter table public.field_directory_entries alter column sport_ids set not null;
alter table public.field_bookings add column sport_id text references public.sport_catalog(id);
update public.field_bookings b set sport_id=coalesce((select p.sport_id from public.peladas p where p.id=b.pelada_id),(select f.sport_id from public.fields f where f.id=b.field_id));
alter table public.field_bookings alter column sport_id set not null;

-- A linked team field is still the owner's physical space. Existing team-admin
-- policies remain, while its actual owner may edit the field without joining the team.
create policy hybrid_fields_owner_update on public.fields for update to authenticated
 using (public.platform_account_allowed() and public.is_establishment_owner(establishment_id))
 with check (public.platform_account_allowed() and public.is_establishment_owner(establishment_id));

create function public.hybrid_sports_valid(ids text[], previous text[] default '{}') returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select ids is not null and cardinality(ids) between 1 and 40
   and array_position(ids,null) is null
   and (select count(distinct v)=cardinality(ids) from unnest(ids) v)
   and not exists(select 1 from unnest(ids) v left join sport_catalog s on s.id=v
     where s.id is null or (not coalesce((s.definition->>'active')::boolean,false) and not v=any(previous)));
$$;
revoke all on function public.hybrid_sports_valid(text[],text[]) from public,anon,authenticated;

create function public.guard_hybrid_sports() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare previous text[] := '{}'; removed text[];
begin
 if tg_op='UPDATE' then previous:=old.sport_ids; end if;
 -- Legacy inserts do not send an array; explicit empty arrays are rejected.
 if new.sport_ids is null then new.sport_ids:=array[new.sport_id]; end if;
 if tg_op='UPDATE' and new.sport_ids is not distinct from old.sport_ids and new.sport_id is distinct from old.sport_id then
   new.sport_ids:=array[new.sport_id] || array_remove(old.sport_ids,new.sport_id);
 end if;
 if not hybrid_sports_valid(new.sport_ids,previous) then raise exception 'Selecione de 1 a 40 esportes ativos, sem repetições'; end if;
 new.sport_id:=new.sport_ids[1];
 if tg_table_name='fields' and tg_op='UPDATE' then
   select coalesce(array_agg(v),'{}') into removed from unnest(old.sport_ids) v where not v=any(new.sport_ids);
   if exists(select 1 from field_bookings b where b.field_id=new.id and b.sport_id=any(removed)
       and (b.recurrence='weekly' or b.date >= (now() at time zone 'America/Sao_Paulo')::date))
     or exists(select 1 from class_programs p where p.field_id=new.id and p.active and p.sport_id=any(removed))
     or exists(select 1 from game_booking_requests r join games g on g.id=r.game_id join peladas p on p.id=g.pelada_id
       where r.field_id=new.id and r.status='awaiting_owner' and p.sport_id=any(removed))
     or exists(select 1 from championships c where c.field_id=new.id and c.status<>'finished' and c.sport_id=any(removed))
     then raise exception 'Há reservas, pedidos, aulas ou campeonatos usando esse esporte'; end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_hybrid_sports() from public,anon,authenticated;
create trigger hybrid_sports before insert or update of sport_ids,sport_id on public.fields for each row execute function public.guard_hybrid_sports();
create trigger hybrid_sports before insert or update of sport_ids,sport_id on public.field_directory_entries for each row execute function public.guard_hybrid_sports();

create function public.guard_hybrid_booking() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare f fields%rowtype; team_sport text;
begin
 select * into f from fields where id=new.field_id for update;
 if f.id is null or new.establishment_id is distinct from f.establishment_id then raise exception 'Campo/estabelecimento incompatível'; end if;
 if new.pelada_id is not null then select sport_id into team_sport from peladas where id=new.pelada_id; end if;
 new.sport_id:=coalesce(new.sport_id,team_sport,f.sport_id);
 if exists(select 1 from class_sessions cs join class_programs cp on cp.id=cs.program_id
   cross join generate_series(-1,1) d
   cross join lateral(select case when new.recurrence='single' then new.date else (cs.starts_at at time zone 'America/Sao_Paulo')::date+d end as day) dt
   where cp.field_id=new.field_id and cs.status<>'cancelled'
     and (new.recurrence='single' or extract(dow from dt.day)=new.day_of_week)
     and dt.day+new.time::time < (cs.ends_at at time zone 'America/Sao_Paulo')
     and dt.day+new.time::time+make_interval(mins=>new.duration_minutes) > (cs.starts_at at time zone 'America/Sao_Paulo')) then raise exception 'Horário ocupado por aula'; end if;
 -- Historical updates may keep a legacy incompatible sport; new bookings cannot.
 if tg_op='UPDATE' and new.field_id=old.field_id and new.sport_id=old.sport_id and new.pelada_id is not distinct from old.pelada_id then return new; end if;
 if not new.sport_id=any(f.sport_ids) or (team_sport is not null and new.sport_id<>team_sport) then raise exception 'Esporte incompatível com a quadra ou o time'; end if;
 return new;
end $$;
revoke all on function public.guard_hybrid_booking() from public,anon,authenticated;
create trigger hybrid_booking before insert or update on public.field_bookings for each row execute function public.guard_hybrid_booking();

-- Extend established RPCs without changing their signature, permission checks,
-- optimistic revision locks, pagination or public/private boundaries.
do $$ declare body text; before text; begin
 body:=pg_get_functiondef('public.growth_snapshot()'::regprocedure);before:=body;
 body:=replace(body,'''sport_id'',f.sport_id','''sport_id'',f.sport_id,''sport_ids'',f.sport_ids');
 if body=before then raise exception 'growth_snapshot sports hook not found'; end if; execute body;

 body:=pg_get_functiondef('public.growth_action(text,jsonb)'::regprocedure);before:=body;
 body:=replace(body,'p.sport_id<>f.sport_id','not p.sport_id=any(f.sport_ids)');
 body:=replace(body,'fields(establishment_id,name,address,sport_id,created_by)','fields(establishment_id,name,address,sport_id,sport_ids,created_by)');
 body:=replace(body,'p_data->>''sportId'',me);','p_data->>''sportId'',case when p_data ? ''sportIds'' then array(select jsonb_array_elements_text(p_data->''sportIds'')) else null end,me);');
 if body=before or position('not p.sport_id=any(f.sport_ids)' in body)=0 then raise exception 'growth_action sports hook not found'; end if; execute body;

 body:=pg_get_functiondef('public.search_field_directory(double precision,double precision,double precision,text,text,integer)'::regprocedure);before:=body;
 body:=replace(body,'select d.*,directory_registered','select d.*,coalesce(f.sport_ids,d.sport_ids) as supported_sports,coalesce(f.sport_id,d.sport_id) as primary_sport,directory_registered');
 body:=replace(body,'from field_directory_entries d','from field_directory_entries d left join fields f on f.id=d.field_id');
 body:=replace(body,'d.sport_id=p_sport','p_sport=any(coalesce(f.sport_ids,d.sport_ids))');
 body:=replace(body,'''sportId'',d.sport_id','''sportId'',d.primary_sport,''sportIds'',d.supported_sports');
 if body=before or position('supported_sports' in body)=0 then raise exception 'directory search hook not found'; end if; execute body;

 body:=pg_get_functiondef('public.manage_field_directory()'::regprocedure);before:=body;
 body:=replace(body,'''sportId'',f.sport_id','''sportId'',f.sport_id,''sportIds'',f.sport_ids');
 body:=replace(body,'to_jsonb(d)-''created_by''','(to_jsonb(d)-''created_by'') || jsonb_build_object(''sport_ids'',coalesce((select f.sport_ids from fields f where f.id=d.field_id),d.sport_ids))');
 if body=before then raise exception 'directory management hook not found'; end if; execute body;

 body:=pg_get_functiondef('public.save_field_directory(uuid,integer,jsonb,text)'::regprocedure);before:=body;
 body:=replace(body,'n:=btrim(p_data->>''name'');',
   'if fid is not null then p_data:=p_data || (select jsonb_build_object(''sportId'',f.sport_id,''sportIds'',f.sport_ids) from fields f where f.id=fid); end if;
    if p_data ? ''sportIds'' and not hybrid_sports_valid(array(select jsonb_array_elements_text(p_data->''sportIds'')),coalesce(old.sport_ids,''{}'')) then raise exception ''Esportes inválidos''; end if;
    n:=btrim(p_data->>''name'');');
 body:=replace(body,'sport_id,phone,whatsapp','sport_id,sport_ids,phone,whatsapp');
 body:=replace(body,'values(fid,n,a,sport,tel,','values(fid,n,a,sport,case when p_data ? ''sportIds'' then array(select jsonb_array_elements_text(p_data->''sportIds'')) else array[sport] end,tel,');
 body:=replace(body,'sport_id=sport,phone=tel','sport_id=sport,sport_ids=case when p_data ? ''sportIds'' then array(select jsonb_array_elements_text(p_data->''sportIds'')) else array[sport] end,phone=tel');
 if body=before or position('hybrid_sports_valid' in body)=0 then raise exception 'directory save hook not found'; end if; execute body;
end $$;

-- Classes and ordinary bookings use the SAME field-row lock, even across sports.
do $$ declare body text; begin
 body:=pg_get_functiondef('public.growth_slot_free(uuid,timestamptz,integer)'::regprocedure);
 body:=replace(body,'select not exists(','select not exists(select 1 from class_sessions cs join class_programs cp on cp.id=cs.program_id where cp.field_id=p_field and cs.status<>''cancelled'' and cs.starts_at<p_start+make_interval(mins=>p_minutes) and cs.ends_at>p_start) and not exists(');
 execute body;
 body:=pg_get_functiondef('public.prevent_class_session_conflict()'::regprocedure);
 body:=replace(body,'perform pg_advisory_xact_lock(hashtext(v_field_id::text));','perform 1 from public.fields where id=v_field_id for update;
  perform pg_advisory_xact_lock(hashtext(v_field_id::text));
  if not public.growth_slot_free(v_field_id,new.starts_at,ceil(extract(epoch from (new.ends_at-new.starts_at))/60)::integer) then
    -- growth_slot_free includes the row itself on UPDATE; check bookings separately below.
    if exists(select 1 from public.field_bookings b cross join generate_series(-1,1) d
      where b.field_id=v_field_id and (b.recurrence=''single'' or b.day_of_week=extract(dow from (new.starts_at at time zone ''America/Sao_Paulo'')::date+d))
      and (case when b.recurrence=''single'' then b.date else (new.starts_at at time zone ''America/Sao_Paulo'')::date+d end)+b.time::time < (new.ends_at at time zone ''America/Sao_Paulo'')
      and (case when b.recurrence=''single'' then b.date else (new.starts_at at time zone ''America/Sao_Paulo'')::date+d end)+b.time::time+make_interval(mins=>b.duration_minutes) > (new.starts_at at time zone ''America/Sao_Paulo'')) then raise exception ''field_schedule_conflict''; end if;
  end if;');
 body:=replace(body,'LANGUAGE plpgsql','LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp');
 execute body;
end $$;
revoke all on function public.prevent_class_session_conflict() from public,anon,authenticated;
grant execute on function public.growth_slot_free(uuid,timestamptz,integer) to service_role;

-- Only newly created or changed assignments require compatibility. Do not
-- rewrite or invalidate historical games, teams, championships or classes.
create function public.guard_hybrid_assignment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.field_id is null then return new; end if;
 if tg_op='UPDATE' and new.field_id is not distinct from old.field_id and new.sport_id is not distinct from old.sport_id then return new; end if;
 if not exists(select 1 from fields f where f.id=new.field_id and new.sport_id=any(f.sport_ids)) then raise exception 'Quadra incompatível com o esporte'; end if;
 return new;
end $$;
revoke all on function public.guard_hybrid_assignment() from public,anon,authenticated;
create trigger hybrid_assignment before insert or update of field_id,sport_id on public.class_programs for each row execute function public.guard_hybrid_assignment();
create trigger hybrid_assignment before insert or update of field_id,sport_id on public.championships for each row execute function public.guard_hybrid_assignment();

-- Explicitly retain guard_field_booking_overlap: its field-row lock and
-- cross-midnight/weekly overlap checks do NOT have any sport predicate.
