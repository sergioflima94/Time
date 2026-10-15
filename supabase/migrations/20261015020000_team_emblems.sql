-- Team emblems are public branding, never arbitrary remote URLs or local URIs.
alter table public.peladas add column if not exists logo_key text;
alter table public.peladas add constraint peladas_emblem_key_format check (
 logo_key is null or (logo_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
 and split_part(logo_key,'/',1)=id::text)
);
create function public.team_emblem_upload_allowed(p_name text) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$' then return false; end if;
 return split_part(p_name,'/',2)=auth.uid()::text and public.is_admin_of_pelada(split_part(p_name,'/',1)::uuid);
end $$;
revoke all on function public.team_emblem_upload_allowed(text) from public;
grant execute on function public.team_emblem_upload_allowed(text) to authenticated;
create function public.verify_team_emblem() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
begin
 if new.logo_key is not null and (tg_op='INSERT' or new.logo_key is distinct from old.logo_key) then
  if split_part(new.logo_key,'/',1)<>new.id::text or not exists (
   select 1 from storage.objects o where o.bucket_id='team-logos' and o.name=new.logo_key
   and o.metadata->>'mimetype' in ('image/png','image/jpeg','image/webp')
   and (o.metadata->>'size')::bigint between 1 and 5242880
  ) then raise exception 'Emblema enviado indisponível ou inválido'; end if;
 end if;
 return new;
end $$;
create trigger verify_team_emblem before insert or update of logo_key on public.peladas
 for each row execute function public.verify_team_emblem();
create function public.set_team_emblem(p_team uuid,p_key text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.is_admin_of_pelada(p_team) then raise exception 'Somente administradores alteram o emblema'; end if;
 if p_key is not null and (split_part(p_key,'/',1)<>p_team::text or not public.team_emblem_upload_allowed(p_key)) then raise exception 'Emblema inválido para este time e conta'; end if;
 update public.peladas set logo_key=p_key where id=p_team;
 return jsonb_build_object('id',p_team,'logoKey',p_key);
end $$;
revoke all on function public.set_team_emblem(uuid,text) from public;
grant execute on function public.set_team_emblem(uuid,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('team-logos','team-logos',true,5242880,array['image/png','image/jpeg','image/webp'])
 on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
create policy team_logos_read on storage.objects for select to anon,authenticated using(bucket_id='team-logos');
create policy team_logos_upload on storage.objects for insert to authenticated
 with check(bucket_id='team-logos' and public.team_emblem_upload_allowed(name));
-- No client overwrite/delete policy. Removing a badge unlinks it; residual files
-- follow the retention/deletion process rather than destroying other readers' cache.
