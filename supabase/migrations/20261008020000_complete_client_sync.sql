alter table public.players
  add column if not exists whatsapp_opt_in boolean not null default false;

-- Preferências que pertencem ao usuário, mas não ao perfil público.
create table if not exists public.player_preferences (
  player_id uuid primary key references public.players (id) on delete cascade,
  current_pelada_id uuid references public.peladas (id) on delete set null,
  notifications_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

-- A fila dos times é estado operacional do jogo e precisa sobreviver à troca de
-- aparelho. A posição 0/1 representa os times em quadra.
create table if not exists public.game_team_queue (
  game_id uuid not null references public.games (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  position int not null check (position >= 0),
  primary key (game_id, team_id),
  unique (game_id, position)
);

alter table public.player_preferences enable row level security;
alter table public.game_team_queue enable row level security;

drop policy if exists "player_preferences_self" on public.player_preferences;
create policy "player_preferences_self"
  on public.player_preferences for all
  using (
    exists (
      select 1 from public.players p
      where p.id = player_id and p.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.players p
      where p.id = player_id and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "game_team_queue_select_members" on public.game_team_queue;
create policy "game_team_queue_select_members"
  on public.game_team_queue for select
  using (
    exists (
      select 1 from public.games g
      where g.id = game_id and public.is_member_of_pelada(g.pelada_id)
    )
  );

drop policy if exists "game_team_queue_write_admins" on public.game_team_queue;
create policy "game_team_queue_write_admins"
  on public.game_team_queue for all
  using (
    exists (
      select 1 from public.games g
      where g.id = game_id and public.is_admin_of_pelada(g.pelada_id)
    )
  )
  with check (
    exists (
      select 1 from public.games g
      where g.id = game_id and public.is_admin_of_pelada(g.pelada_id)
    )
  );

-- Expo Web também pode registrar notificações; os runtimes móveis continuam
-- usando android/ios.
alter table public.device_push_tokens
  drop constraint if exists device_push_tokens_platform_check;
alter table public.device_push_tokens
  add constraint device_push_tokens_platform_check
  check (platform in ('android', 'ios', 'web'));


insert into public.commercial_plans (id, audience, name, monthly_price, benefits, highlighted, active)
values
  ('11111111-1111-4111-8111-111111111111', 'player', 'Jogador Premium', 14.90,
    '["Sem anúncios", "Carta e retrospectivas Premium", "Histórico avançado"]'::jsonb, false, true),
  ('22222222-2222-4222-8222-222222222222', 'team', 'Time Pro', 39.90,
    '["WhatsApp e enquetes automáticas", "Temporadas e rankings", "Relatórios do time"]'::jsonb, true, true),
  ('33333333-3333-4333-8333-333333333333', 'establishment', 'Estabelecimento Pro', 99.90,
    '["Agenda e caixa integrados", "Inteligência de ocupação", "CRM, estoque e equipe"]'::jsonb, true, true)
on conflict (id) do update set
  audience = excluded.audience,
  name = excluded.name,
  monthly_price = excluded.monthly_price,
  benefits = excluded.benefits,
  highlighted = excluded.highlighted,
  active = excluded.active;
-- Todas as tabelas protegidas por RLS participam do canal de alterações. O
-- cliente não recebe linhas fora das próprias políticas.
do $$
declare
  table_row record;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    for table_row in
      select n.nspname as schema_name, c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relrowsecurity
    loop
      execute format(
        'alter table %I.%I replica identity full',
        table_row.schema_name,
        table_row.table_name
      );
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = table_row.schema_name
          and tablename = table_row.table_name
      ) then
        execute format(
          'alter publication supabase_realtime add table %I.%I',
          table_row.schema_name,
          table_row.table_name
        );
      end if;
    end loop;
  end if;
end
$$;
