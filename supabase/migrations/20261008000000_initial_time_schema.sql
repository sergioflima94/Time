-- =========================================================================
-- Schema do app de Pelada (futebol amador)
-- Rode este arquivo no SQL Editor do seu projeto Supabase (supabase.com).
-- =========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- players: 1 linha por usuário autenticado (auth.users) + convidados
-- ---------------------------------------------------------------------
create table players (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  name text not null,
  nickname text,
  avatar_url text,
  card_style_id text,
  card_background_url text,
  -- assinatura Premium mensal, gerenciada pela App Store/Google Play (RevenueCat) — ver src/lib/premium.ts
  premium_since timestamptz,
  premium_until timestamptz,
  premium_auto_renew boolean not null default false,
  is_guest boolean not null default false,
  phone text,
  preferred_position text not null default 'line' check (preferred_position in ('goalkeeper', 'line')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- peladas: o grupo fixo de jogadores
-- ---------------------------------------------------------------------
create table peladas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sport text not null default 'society' check (sport in ('society', 'futsal', 'campo')),
  default_max_players int not null default 16,
  default_match_minutes int not null default 10,
  invite_code text not null unique,
  created_by uuid not null references players (id),
  created_at timestamptz not null default now()
);

create table pelada_memberships (
  pelada_id uuid not null references peladas (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (pelada_id, player_id)
);

create table fields (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references peladas (id) on delete cascade,
  name text not null,
  address text,
  notes text,
  created_by uuid not null references players (id)
);

create table schedules (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references peladas (id) on delete cascade,
  field_id uuid not null references fields (id),
  recurrence text not null check (recurrence in ('single', 'weekly', 'biweekly')),
  day_of_week int check (day_of_week between 0 and 6),
  time text not null,
  start_date date not null,
  end_date date,
  max_players int not null default 16,
  match_minutes int not null default 10,
  draw_method text not null default 'rating' check (draw_method in ('arrival', 'random', 'rating')),
  default_field_cost numeric(10, 2),
  match_goal_limit int,
  active boolean not null default true,
  created_by uuid not null references players (id)
);

create table games (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references peladas (id) on delete cascade,
  schedule_id uuid references schedules (id) on delete set null,
  field_id uuid not null references fields (id),
  scheduled_at timestamptz not null,
  max_players int not null default 16,
  players_per_team int not null default 6,
  match_minutes int not null default 10,
  draw_method text not null default 'rating' check (draw_method in ('arrival', 'random', 'rating')),
  status text not null default 'open' check (status in ('open', 'full', 'teams_drawn', 'in_progress', 'finished', 'cancelled')),
  field_cost numeric(10, 2),
  match_goal_limit int,
  created_by uuid not null references players (id),
  created_at timestamptz not null default now()
);

create table attendances (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  status text not null default 'pending' check (status in ('confirmed', 'declined', 'waitlist', 'pending')),
  confirmed_order int,
  responded_at timestamptz,
  no_show boolean not null default false,
  checked_in boolean not null default false,
  unique (game_id, player_id)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  name text not null,
  color text not null default '#22C55E',
  queue_order int not null default 0
);

create table team_players (
  team_id uuid not null references teams (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  is_goalkeeper boolean not null default false,
  primary key (team_id, player_id)
);

create table match_turns (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  team_a_id uuid not null references teams (id),
  team_b_id uuid not null references teams (id),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int not null default 0,
  winner_team_id uuid references teams (id)
);

-- gol marcado durante uma rodada (match_turn): usado pro placar ao vivo e pro saldo de gols na carta
create table goals (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  match_turn_id uuid not null references match_turns (id) on delete cascade,
  team_id uuid not null references teams (id),
  scorer_player_id uuid references players (id),
  scored_at timestamptz not null default now()
);

create table ratings (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  rater_player_id uuid not null references players (id) on delete cascade,
  rated_player_id uuid not null references players (id) on delete cascade,
  attack int not null check (attack between 1 and 5),
  defense int not null check (defense between 1 and 5),
  pace int not null check (pace between 1 and 5),
  overall numeric(3, 2) generated always as (round(((attack + defense + pace)::numeric / 3), 2)) stored,
  created_at timestamptz not null default now(),
  unique (game_id, rater_player_id, rated_player_id),
  check (rater_player_id <> rated_player_id)
);

-- Rateio ("vaquinha") do custo da quadra: 1 linha por jogador confirmado em jogos com field_cost definido.
create table payments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'paid', 'waived')),
  method text check (method in ('pix', 'cash', 'card')),
  paid_at timestamptz,
  unique (game_id, player_id)
);

create table punishments (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references peladas (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  game_id uuid not null references games (id) on delete cascade,
  type text not null check (type in ('no_show', 'late_cancel')),
  strike_level int not null default 1,
  suspended_until_game_count int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- View: nota geral do jogador estilo "carta de FIFA" (0-99)
-- ---------------------------------------------------------------------
create view player_overalls as
select
  rated_player_id as player_id,
  round(avg(attack) * 19.8)::int as attack,
  round(avg(defense) * 19.8)::int as defense,
  round(avg(pace) * 19.8)::int as pace,
  round(avg(overall) * 19.8)::int as overall,
  count(*) as ratings_count
from ratings
group by rated_player_id;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table players enable row level security;
alter table peladas enable row level security;
alter table pelada_memberships enable row level security;
alter table fields enable row level security;
alter table schedules enable row level security;
alter table games enable row level security;
alter table attendances enable row level security;
alter table teams enable row level security;
alter table team_players enable row level security;
alter table match_turns enable row level security;
alter table goals enable row level security;
alter table ratings enable row level security;
alter table punishments enable row level security;
alter table payments enable row level security;

create function is_member_of_pelada(p_pelada_id uuid) returns boolean as $$
  select exists (
    select 1 from pelada_memberships m
    join players p on p.id = m.player_id
    where m.pelada_id = p_pelada_id and p.auth_user_id = auth.uid() and m.active
  );
$$ language sql security definer stable;

create function is_admin_of_pelada(p_pelada_id uuid) returns boolean as $$
  select exists (
    select 1 from pelada_memberships m
    join players p on p.id = m.player_id
    where m.pelada_id = p_pelada_id and p.auth_user_id = auth.uid() and m.active and m.role = 'admin'
  );
$$ language sql security definer stable;

-- players: qualquer usuário autenticado pode ler perfis (para ver notas/cartas dos colegas);
-- só o próprio dono edita seu perfil.
create policy "players_select_all" on players for select using (true);
create policy "players_insert_self" on players for insert with check (auth_user_id = auth.uid());
create policy "players_update_self" on players for update using (auth_user_id = auth.uid());

-- select liberado (nome/descrição não são sensíveis) pra permitir localizar a pelada pelo
-- código de convite antes de virar membro; dados sensíveis (jogos, chamada, pagamentos)
-- continuam só pra quem já é membro.
create policy "peladas_select_all" on peladas for select using (true);
create policy "peladas_insert_authenticated" on peladas for insert with check (auth.uid() is not null);
create policy "peladas_update_admins" on peladas for update using (is_admin_of_pelada(id));

create policy "memberships_select_members" on pelada_memberships for select using (is_member_of_pelada(pelada_id));
create policy "memberships_write_admins" on pelada_memberships for all using (is_admin_of_pelada(pelada_id));
-- entrar numa pelada por código de convite: o próprio jogador pode se auto-adicionar como membro comum
create policy "memberships_insert_self" on pelada_memberships for insert with check (
  role = 'member' and exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
);

create policy "fields_select_members" on fields for select using (is_member_of_pelada(pelada_id));
create policy "fields_write_admins" on fields for all using (is_admin_of_pelada(pelada_id));

create policy "schedules_select_members" on schedules for select using (is_member_of_pelada(pelada_id));
create policy "schedules_write_admins" on schedules for all using (is_admin_of_pelada(pelada_id));

create policy "games_select_members" on games for select using (is_member_of_pelada(pelada_id));
create policy "games_write_admins" on games for all using (is_admin_of_pelada(pelada_id));

create policy "attendances_select_members" on attendances for select using (
  exists (select 1 from games g where g.id = game_id and is_member_of_pelada(g.pelada_id))
);
create policy "attendances_upsert_self_or_admin" on attendances for insert with check (
  exists (
    select 1 from games g join players p on p.id = attendances.player_id
    where g.id = game_id and (p.auth_user_id = auth.uid() or is_admin_of_pelada(g.pelada_id))
  )
);
create policy "attendances_update_self_or_admin" on attendances for update using (
  exists (
    select 1 from games g join players p on p.id = attendances.player_id
    where g.id = game_id and (p.auth_user_id = auth.uid() or is_admin_of_pelada(g.pelada_id))
  )
);

create policy "teams_select_members" on teams for select using (
  exists (select 1 from games g where g.id = game_id and is_member_of_pelada(g.pelada_id))
);
create policy "teams_write_admins" on teams for all using (
  exists (select 1 from games g where g.id = game_id and is_admin_of_pelada(g.pelada_id))
);

create policy "team_players_select_members" on team_players for select using (
  exists (select 1 from teams t join games g on g.id = t.game_id where t.id = team_id and is_member_of_pelada(g.pelada_id))
);
create policy "team_players_write_admins" on team_players for all using (
  exists (select 1 from teams t join games g on g.id = t.game_id where t.id = team_id and is_admin_of_pelada(g.pelada_id))
);

create policy "match_turns_select_members" on match_turns for select using (
  exists (select 1 from games g where g.id = game_id and is_member_of_pelada(g.pelada_id))
);
create policy "match_turns_write_admins" on match_turns for all using (
  exists (select 1 from games g where g.id = game_id and is_admin_of_pelada(g.pelada_id))
);

create policy "goals_select_members" on goals for select using (
  exists (select 1 from games g where g.id = game_id and is_member_of_pelada(g.pelada_id))
);
create policy "goals_write_admins" on goals for all using (
  exists (select 1 from games g where g.id = game_id and is_admin_of_pelada(g.pelada_id))
);

-- ratings: qualquer membro pode ler (cartas são públicas dentro da pelada);
-- só o próprio jogador insere avaliações que ele deu.
create policy "ratings_select_members" on ratings for select using (
  exists (select 1 from games g where g.id = game_id and is_member_of_pelada(g.pelada_id))
);
create policy "ratings_insert_self" on ratings for insert with check (
  exists (select 1 from players p where p.id = rater_player_id and p.auth_user_id = auth.uid())
);

create policy "punishments_select_members" on punishments for select using (is_member_of_pelada(pelada_id));
create policy "punishments_write_admins" on punishments for all using (is_admin_of_pelada(pelada_id));

-- payments: membros da pelada veem o rateio; o próprio jogador (ou um admin) marca/atualiza o pagamento.
create policy "payments_select_members" on payments for select using (
  exists (select 1 from games g where g.id = game_id and is_member_of_pelada(g.pelada_id))
);
create policy "payments_write_self_or_admin" on payments for all using (
  exists (
    select 1 from games g join players p on p.id = payments.player_id
    where g.id = game_id and (p.auth_user_id = auth.uid() or is_admin_of_pelada(g.pelada_id))
  )
);
