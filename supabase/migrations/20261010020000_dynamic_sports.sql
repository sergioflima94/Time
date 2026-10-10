-- Catálogo dinâmico: leitura pública segura, alteração apenas pela plataforma.
create table public.sport_catalog (
  id text primary key check (id ~ '^[a-z][a-z0-9_-]{1,39}$'),
  definition jsonb not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  check (definition->>'id' = id)
);
alter table public.sport_catalog enable row level security;
revoke all on public.sport_catalog from anon, authenticated;
grant select on public.sport_catalog to anon, authenticated;
create policy sport_catalog_read on public.sport_catalog for select using (true);
insert into public.sport_catalog(id,definition) values
('futebol','{"id":"futebol","label":"Futebol","icon":"⚽","color":"#22C55E","scoreSingular":"gol","scorePlural":"gols","hasGoalkeeper":true,"suggestedTeamSize":6,"active":true,"rules":{"mode":"total","periodMinutes":10,"periods":1,"targetPoints":null,"winByTwo":false,"setsToWin":null,"scoreValues":[1]}}'::jsonb),
('volei','{"id":"volei","label":"Vôlei","icon":"🏐","color":"#EAB308","scoreSingular":"ponto","scorePlural":"pontos","hasGoalkeeper":false,"suggestedTeamSize":6,"active":true,"rules":{"mode":"sets","periodMinutes":10,"periods":3,"targetPoints":21,"winByTwo":true,"setsToWin":2,"scoreValues":[1]}}'::jsonb),
('basquete','{"id":"basquete","label":"Basquete","icon":"🏀","color":"#F97316","scoreSingular":"ponto","scorePlural":"pontos","hasGoalkeeper":false,"suggestedTeamSize":5,"active":true,"rules":{"mode":"periods","periodMinutes":10,"periods":4,"targetPoints":null,"winByTwo":false,"setsToWin":null,"scoreValues":[1,2,3]}}'::jsonb),
('handebol','{"id":"handebol","label":"Handebol","icon":"🤾","color":"#EF4444","scoreSingular":"gol","scorePlural":"gols","hasGoalkeeper":true,"suggestedTeamSize":7,"active":true,"rules":{"mode":"total","periodMinutes":10,"periods":1,"targetPoints":null,"winByTwo":false,"setsToWin":null,"scoreValues":[1]}}'::jsonb),
('futvolei','{"id":"futvolei","label":"Futevôlei","icon":"🏖️","color":"#22D3EE","scoreSingular":"ponto","scorePlural":"pontos","hasGoalkeeper":false,"suggestedTeamSize":2,"active":true,"rules":{"mode":"sets","periodMinutes":10,"periods":3,"targetPoints":21,"winByTwo":true,"setsToWin":2,"scoreValues":[1]}}'::jsonb);

-- Substitui somente checks antigos que restringem sport_id aos cinco esportes.
-- Não altera variantes society/futsal/campo nem remove outros checks.
do $$ declare c record; begin
  for c in select con.conname, rel.relname from pg_constraint con join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%sport_id%' and pg_get_constraintdef(con.oid) like '%futvolei%'
  loop execute format('alter table public.%I drop constraint %I',c.relname,c.conname); end loop;
end $$;

create function public.save_platform_sport(p_definition jsonb, p_revision integer, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare previous jsonb; revision_now integer; r jsonb; sid text; role_now text; n integer;
begin
  role_now := public.platform_admin_role();
  if role_now is null or role_now not in ('owner','admin') then raise exception 'Somente a plataforma configura esportes' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason,''))) < 8 then raise exception 'Informe um motivo com pelo menos 8 caracteres'; end if;
  if jsonb_typeof(p_definition) is distinct from 'object' or not p_definition ?& array['id','label','icon','color','scoreSingular','scorePlural','hasGoalkeeper','suggestedTeamSize','active','rules'] then raise exception 'Esporte incompleto'; end if;
  if (select count(*) from jsonb_object_keys(p_definition)) <> 10 then raise exception 'Campos de esporte não permitidos'; end if;
  sid := p_definition->>'id'; r := p_definition->'rules';
  if sid is null or sid !~ '^[a-z][a-z0-9_-]{1,39}$'
    or jsonb_typeof(p_definition->'label') is distinct from 'string' or length(trim(p_definition->>'label')) not between 2 and 60
    or jsonb_typeof(p_definition->'icon') is distinct from 'string' or length(trim(p_definition->>'icon')) not between 1 and 16
    or coalesce(p_definition->>'color','') !~ '^#[0-9a-fA-F]{6}$'
    or jsonb_typeof(p_definition->'scoreSingular') is distinct from 'string' or length(trim(p_definition->>'scoreSingular')) not between 1 and 30
    or jsonb_typeof(p_definition->'scorePlural') is distinct from 'string' or length(trim(p_definition->>'scorePlural')) not between 1 and 30
    or jsonb_typeof(p_definition->'hasGoalkeeper') is distinct from 'boolean'
    or jsonb_typeof(p_definition->'active') is distinct from 'boolean'
    or jsonb_typeof(p_definition->'suggestedTeamSize') is distinct from 'number'
  then raise exception 'Identificação do esporte inválida'; end if;
  if (p_definition->>'suggestedTeamSize')::numeric not between 1 and 50
    or (p_definition->>'suggestedTeamSize')::numeric <> trunc((p_definition->>'suggestedTeamSize')::numeric)
  then raise exception 'Tamanho do time inválido'; end if;
  if jsonb_typeof(r) is distinct from 'object' or not r ?& array['mode','periodMinutes','periods','targetPoints','winByTwo','setsToWin','scoreValues'] then raise exception 'Regras incompletas'; end if;
  if (select count(*) from jsonb_object_keys(r)) <> 7 or coalesce(r->>'mode','') not in ('total','sets','periods')
    or jsonb_typeof(r->'periodMinutes') is distinct from 'number' or jsonb_typeof(r->'periods') is distinct from 'number'
    or jsonb_typeof(r->'winByTwo') is distinct from 'boolean' or jsonb_typeof(r->'scoreValues') is distinct from 'array'
  then raise exception 'Formato de regras inválido'; end if;
  if (r->>'periodMinutes')::numeric not between 1 and 240 or (r->>'periodMinutes')::numeric <> trunc((r->>'periodMinutes')::numeric)
    or (r->>'periods')::numeric not between 1 and 15 or (r->>'periods')::numeric <> trunc((r->>'periods')::numeric)
  then raise exception 'Duração/períodos inválidos'; end if;
  if jsonb_array_length(r->'scoreValues') not between 1 and 5 or not (r->'scoreValues') @> '[1]'::jsonb then raise exception 'Inclua 1 nos valores de pontuação'; end if;
  for previous in select value from jsonb_array_elements(r->'scoreValues') loop
    if jsonb_typeof(previous) <> 'number' then raise exception 'Pontuação inválida'; end if;
    if previous::numeric not between 1 and 10 or previous::numeric <> trunc(previous::numeric) then raise exception 'Pontuação inválida'; end if;
  end loop;
  if (select count(distinct value) from jsonb_array_elements(r->'scoreValues')) <> jsonb_array_length(r->'scoreValues') then raise exception 'Valores repetidos'; end if;
  if r->>'mode' = 'sets' then
    if jsonb_typeof(r->'targetPoints') is distinct from 'number' or jsonb_typeof(r->'setsToWin') is distinct from 'number' then raise exception 'Alvo de sets inválido'; end if;
    if (r->>'targetPoints')::numeric not between 1 and 200 or (r->>'targetPoints')::numeric <> trunc((r->>'targetPoints')::numeric)
      or (r->>'setsToWin')::numeric not between 1 and 8 or (r->>'setsToWin')::numeric <> trunc((r->>'setsToWin')::numeric)
      or (r->>'periods')::numeric <> 2*(r->>'setsToWin')::numeric-1 then raise exception 'Melhor de sets inválida'; end if;
  elsif jsonb_typeof(r->'targetPoints') is distinct from 'null' or jsonb_typeof(r->'setsToWin') is distinct from 'null'
    or (r->>'winByTwo')::boolean or (r->>'mode' = 'total' and (r->>'periods')::integer <> 1)
  then raise exception 'Placar total/períodos não usa alvo de sets'; end if;
  -- Lock global evita dois admins desativarem simultaneamente os últimos esportes.
  perform 1 from public.platform_configuration where id for update;
  select definition,revision into previous,revision_now from public.sport_catalog where id = sid for update;
  if p_revision is distinct from coalesce(revision_now,0) then raise exception 'Esporte alterado. Atualize o catálogo.' using errcode = '40001'; end if;
  if not (p_definition->>'active')::boolean and not exists(select 1 from public.sport_catalog where id <> sid and (definition->>'active')::boolean) then raise exception 'Mantenha pelo menos um esporte ativo'; end if;
  insert into public.sport_catalog(id,definition,revision) values(sid,p_definition,coalesce(revision_now,0)+1)
    on conflict(id) do update set definition = excluded.definition, revision = excluded.revision, updated_at = now();
  insert into public.platform_admin_audit(actor_auth_user_id,action,target_id,reason,before_value,after_value)
    values(auth.uid(),'sport',sid,trim(p_reason),previous,p_definition);
end $$;
revoke all on function public.save_platform_sport(jsonb,integer,text) from public;
grant execute on function public.save_platform_sport(jsonb,integer,text) to authenticated;

-- Regras copiadas na criação do placar, nunca recalculadas no meio do evento.
alter table public.multi_sport_scoreboards add column score_values jsonb not null default '[1]'::jsonb;
alter table public.multi_sport_scoreboards add column period_minutes integer not null default 10 check (period_minutes between 1 and 240);

create function public.guard_registered_sport() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.sport_id is not distinct from old.sport_id then return new; end if;
  if not exists(select 1 from public.sport_catalog where id = new.sport_id and (definition->>'active')::boolean) then raise exception 'Selecione um esporte ativo do catálogo'; end if;
  return new;
end $$;
do $$ declare t record; begin
  for t in select table_name from information_schema.columns where table_schema = 'public' and column_name = 'sport_id'
  loop execute format('create trigger registered_sport before insert or update of sport_id on public.%I for each row execute function public.guard_registered_sport()',t.table_name); end loop;
end $$;

