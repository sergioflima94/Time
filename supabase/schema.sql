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
  -- foto de fundo da carta (Premium). A cor da faixa (bronze/prata/ouro/especial) é
  -- sempre calculada pela nota geral e desenhada por cima — não é escolhida pelo jogador.
  card_background_url text,
  -- assinatura Premium mensal, gerenciada pela App Store/Google Play (RevenueCat) — ver src/lib/premium.ts
  premium_since timestamptz,
  premium_until timestamptz,
  premium_auto_renew boolean not null default false,
  is_guest boolean not null default false,
  phone text,
  preferred_position text not null default 'line' check (preferred_position in ('goalkeeper', 'line')),
  -- esportes favoritos (multi-esporte) — SportIds de src/constants/sports.ts. Usado como sugestão
  -- de terminologia (gol/ponto) na carta e pra filtrar o pool de jogadores livres por esporte.
  favorite_sports text[] not null default array['futebol'],
  -- bolsa de jogadores livres (opt-in) — ver src/lib/geo.ts
  free_agent_opt_in boolean not null default false,
  free_agent_radius_km numeric,
  free_agent_availability jsonb not null default '[]', -- AvailabilitySlot[]: [{weekday, startTime, endTime}]
  location_lat double precision,
  location_lng double precision,
  location_updated_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- peladas: o grupo fixo de jogadores
-- ---------------------------------------------------------------------
create table peladas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  -- esporte da pelada (SportId de src/constants/sports.ts) — decide terminologia (gol/ponto),
  -- cor de destaque e se o sorteio de times usa goleiro.
  sport_id text not null default 'futebol' check (sport_id in ('futebol', 'volei', 'basquete', 'handebol', 'futvolei')),
  -- só relevante quando sport_id = 'futebol' — variante do campo.
  football_variant text not null default 'society' check (football_variant in ('society', 'futsal', 'campo')),
  default_max_players int not null default 16,
  default_match_minutes int not null default 10,
  invite_code text not null unique,
  -- por padrão só admin convida gente; o admin libera cada permissão pra qualquer membro.
  member_can_invite_free_agents boolean not null default false,
  member_can_invite_new_members boolean not null default false,
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

-- ---------------------------------------------------------------------
-- establishments: dono de campo/quadra — papel independente de pelada.
-- Cadastra como quer receber o rateio das partidas jogadas no campo dele.
-- ---------------------------------------------------------------------
create table establishments (
  id uuid primary key default gen_random_uuid(),
  owner_player_id uuid not null references players (id) on delete cascade,
  name text not null,
  payout_method text not null default 'in_person' check (payout_method in ('pix', 'in_person')),
  pix_key text,
  -- código curto que um admin de pelada usa pra vincular um campo a este estabelecimento
  access_code text not null unique,
  created_at timestamptz not null default now()
);

create table fields (
  id uuid primary key default gen_random_uuid(),
  -- null = campo próprio do estabelecimento, cadastrado direto pelo dono, sem pertencer a nenhuma pelada.
  pelada_id uuid references peladas (id) on delete cascade,
  name text not null,
  address text,
  notes text,
  -- vincula esse campo a um estabelecimento cadastrado (dono real, recebe o rateio). null = sem dono cadastrado.
  establishment_id uuid references establishments (id) on delete set null,
  -- esporte jogado nesse campo — campo de pelada herda o esporte dela; campo próprio do
  -- estabelecimento escolhe o esporte no cadastro (permite vários esportes no mesmo estabelecimento).
  sport_id text not null default 'futebol' check (sport_id in ('futebol', 'volei', 'basquete', 'handebol', 'futvolei')),
  created_by uuid not null references players (id),
  check (pelada_id is not null or establishment_id is not null)
);

-- reserva de um campo do estabelecimento, cadastrada pelo próprio dono — time cadastrado
-- (peladaId setado) ou avulso (só o nome). "weekly" é o horário fixo: toda semana, naquele
-- dia + horário, aquele time já está lá. O bloqueio de conflito de horário (mesmo campo +
-- dia + faixa de horário sobreposta) é feito na store (src/lib/fieldBooking.ts), não aqui.
create table field_bookings (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields (id) on delete cascade,
  establishment_id uuid not null references establishments (id) on delete cascade,
  -- time cadastrado (de uma pelada existente) — null quando o time é avulso.
  pelada_id uuid references peladas (id) on delete set null,
  team_name text not null,
  recurrence text not null check (recurrence in ('single', 'weekly')),
  -- 0 (domingo) a 6 (sábado) — obrigatório quando recurrence = 'weekly'.
  day_of_week int check (day_of_week between 0 and 6),
  -- obrigatório quando recurrence = 'single'.
  date date,
  time text not null,
  duration_minutes int not null default 60,
  notes text,
  created_by uuid not null references players (id),
  created_at timestamptz not null default now(),
  check (
    (recurrence = 'weekly' and day_of_week is not null and date is null)
    or (recurrence = 'single' and date is not null and day_of_week is null)
  )
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
  -- "teams": sorteia todos os times de uma vez e eles se revezam em bloco (fila de rodízio
  -- normal). "players": sorteia só o 1º confronto; o resto vira bolsa de jogadores avulsos
  -- (ver waiting_players) e cada desafiante novo é remontado por prioridade individual.
  rotation_mode text not null default 'teams' check (rotation_mode in ('teams', 'players')),
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

-- jogador tirado de campo por cansaço (não é falta/punição) — ver "Troca de jogador em
-- campo" no README. "resting" volta sozinho depois de matches_remaining rodadas
-- encerradas; "done_for_today" fica de fora até o admin reverter manualmente.
create table player_fatigue (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  status text not null check (status in ('resting', 'done_for_today')),
  matches_remaining int,
  created_at timestamptz not null default now(),
  unique (game_id, player_id)
);

-- jogador aguardando entrar num time no rodízio individual (games.rotation_mode =
-- 'players') — fica fora de team_players até ser sorteado pra um novo time. Ver
-- "Rodízio individual" no README.
create table waiting_players (
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  -- rodadas seguidas que já ficou de fora desde a última vez que jogou (ou desde o
  -- sorteio inicial) — prioridade de entrada: maior primeiro.
  rounds_waited int not null default 0,
  -- desempate quando rounds_waited empata: ordem do método de sorteio escolhido na
  -- primeira vez (nota, chegada, ou posição sorteada uma vez no aleatório).
  tiebreak_rank int not null default 0,
  is_goalkeeper boolean not null default false,
  primary key (game_id, player_id)
);

-- amizade entre dois jogadores, independente de pelada (aba Amigos / rede social).
create table friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references players (id) on delete cascade,
  addressee_id uuid not null references players (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

-- curtida num item do feed de atividades. activity_id é a chave estável calculada no
-- app (ex.: "goal:<player_id>:<game_id>"), não uma FK — o feed em si é derivado de
-- gols/memberships, não uma tabela de posts.
create table activity_likes (
  id uuid primary key default gen_random_uuid(),
  activity_id text not null,
  player_id uuid not null references players (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (activity_id, player_id)
);

-- comentário num item do feed. Mesma chave activity_id (não é FK) do activity_likes.
-- Notificações (pedido de amizade, aceite, curtida, comentário) são computadas em
-- src/lib/notifications.ts a partir destas tabelas + friendships — não existe uma
-- tabela "notifications" separada.
create table activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id text not null,
  player_id uuid not null references players (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
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
  -- quem efetivamente pagou, quando alguém paga a própria parte e a de outro jogador junto. null = o próprio jogador.
  paid_by_player_id uuid references players (id),
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
-- free_agent_invites: convite pra um "jogador livre" (fora da pelada) jogar
-- um jogo específico — ver src/lib/geo.ts e src/components/NearbyFreeAgentsSection.tsx
-- ---------------------------------------------------------------------
create table free_agent_invites (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  pelada_id uuid not null references peladas (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  invited_by_player_id uuid not null references players (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (game_id, player_id)
);

-- ---------------------------------------------------------------------
-- championships: torneios organizados por um estabelecimento (dono de campo).
-- Aceita times vindos de uma pelada existente ou times avulsos (criados só pro campeonato).
-- Formato pontos corridos ou mata-mata — ver src/lib/championship.ts
-- ---------------------------------------------------------------------
create table championships (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments (id) on delete cascade,
  name text not null,
  -- esporte do campeonato (SportId de src/constants/sports.ts) — decide terminologia (gol/ponto),
  -- cor de destaque e se as partidas usam goleiro.
  sport_id text not null default 'futebol' check (sport_id in ('futebol', 'volei', 'basquete', 'handebol', 'futvolei')),
  format text not null check (format in ('round_robin', 'knockout')),
  field_id uuid references fields (id) on delete set null,
  max_teams int,
  entry_fee numeric(10, 2),
  registration_code text not null unique,
  registration_deadline timestamptz,
  match_minutes int not null default 10,
  status text not null default 'registration' check (status in ('registration', 'in_progress', 'finished')),
  created_by uuid not null references players (id),
  created_at timestamptz not null default now()
);

create table championship_teams (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references championships (id) on delete cascade,
  name text not null,
  color text not null default '#22C55E',
  -- emblema do time — escolhido da galeria ou gerado por IA (ver src/lib/teamLogo.ts). null = usa só a cor.
  logo_url text,
  -- null = time avulso, criado só pra esse campeonato.
  pelada_id uuid references peladas (id) on delete set null,
  registered_by_player_id uuid not null references players (id),
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  created_at timestamptz not null default now()
);

create table championship_team_players (
  championship_team_id uuid not null references championship_teams (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  is_goalkeeper boolean not null default false,
  primary key (championship_team_id, player_id)
);

create table championship_matches (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null references championships (id) on delete cascade,
  round int not null,
  round_label text not null,
  -- null enquanto aguarda o time avançar (mata-mata: vencedor de outra partida ainda não decidido)
  team_a_id uuid references championship_teams (id),
  team_b_id uuid references championship_teams (id),
  -- mata-mata: de qual partida vem o time A / B, pra propagar o vencedor automaticamente
  feeds_from_match_a_id uuid references championship_matches (id),
  feeds_from_match_b_id uuid references championship_matches (id),
  field_id uuid references fields (id),
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'finished')),
  -- só preenchido se precisou de pênaltis pra desempatar (mata-mata)
  penalty_score_a int,
  penalty_score_b int,
  -- null = empate (só possível em pontos corridos) ou partida ainda não terminou
  winner_team_id uuid references championship_teams (id)
);

-- gol/ponto marcado numa partida de campeonato — separado de goals (que é de jogo de pelada)
create table championship_goals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references championship_matches (id) on delete cascade,
  team_id uuid not null references championship_teams (id),
  scorer_player_id uuid references players (id),
  scored_at timestamptz not null default now()
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
alter table establishments enable row level security;
alter table fields enable row level security;
alter table field_bookings enable row level security;
alter table schedules enable row level security;
alter table games enable row level security;
alter table attendances enable row level security;
alter table teams enable row level security;
alter table team_players enable row level security;
alter table match_turns enable row level security;
alter table goals enable row level security;
alter table player_fatigue enable row level security;
alter table waiting_players enable row level security;
alter table friendships enable row level security;
alter table activity_likes enable row level security;
alter table activity_comments enable row level security;
alter table ratings enable row level security;
alter table punishments enable row level security;
alter table payments enable row level security;
alter table free_agent_invites enable row level security;
alter table championships enable row level security;
alter table championship_teams enable row level security;
alter table championship_team_players enable row level security;
alter table championship_matches enable row level security;
alter table championship_goals enable row level security;

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

-- campo de pelada: só membros veem/editam (como antes). Campo próprio do estabelecimento
-- (pelada_id null): leitura pública (precisa aparecer pra quem for montar um campeonato ali),
-- só o dono do estabelecimento cadastra/edita/remove.
create policy "fields_select_members_or_public" on fields for select using (
  (pelada_id is not null and is_member_of_pelada(pelada_id)) or pelada_id is null
);
create policy "fields_write_admins_or_owner" on fields for all using (
  (pelada_id is not null and is_admin_of_pelada(pelada_id))
  or (pelada_id is null and exists (
    select 1 from establishments e where e.id = establishment_id and e.owner_player_id in (
      select id from players where auth_user_id = auth.uid()
    )
  ))
);

-- field_bookings: leitura pública (admin de pelada precisa ver se um horário já está
-- ocupado antes de agendar um jogo ali); só o dono do estabelecimento cadastra/edita/remove.
create policy "field_bookings_select_all" on field_bookings for select using (true);
create policy "field_bookings_write_owner" on field_bookings for all using (
  exists (
    select 1 from establishments e where e.id = establishment_id and e.owner_player_id in (
      select id from players where auth_user_id = auth.uid()
    )
  )
);

-- establishments: qualquer autenticado pode ler (precisa achar pelo access_code pra
-- vincular um campo), mas só o dono edita o próprio estabelecimento.
create policy "establishments_select_all" on establishments for select using (true);
create policy "establishments_insert_self" on establishments for insert with check (
  exists (select 1 from players p where p.id = owner_player_id and p.auth_user_id = auth.uid())
);
create policy "establishments_update_owner" on establishments for update using (
  exists (select 1 from players p where p.id = owner_player_id and p.auth_user_id = auth.uid())
);

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

create policy "player_fatigue_select_members" on player_fatigue for select using (
  exists (select 1 from games g where g.id = game_id and is_member_of_pelada(g.pelada_id))
);
create policy "player_fatigue_write_admins" on player_fatigue for all using (
  exists (select 1 from games g where g.id = game_id and is_admin_of_pelada(g.pelada_id))
);

create policy "waiting_players_select_members" on waiting_players for select using (
  exists (select 1 from games g where g.id = game_id and is_member_of_pelada(g.pelada_id))
);
create policy "waiting_players_write_admins" on waiting_players for all using (
  exists (select 1 from games g where g.id = game_id and is_admin_of_pelada(g.pelada_id))
);

-- amizade só é visível/editável pelos dois jogadores envolvidos (pedido, aceite ou recusa).
create policy "friendships_select_involved" on friendships for select using (
  exists (select 1 from players p where p.id = requester_id and p.auth_user_id = auth.uid())
  or exists (select 1 from players p where p.id = addressee_id and p.auth_user_id = auth.uid())
);
create policy "friendships_insert_requester" on friendships for insert with check (
  exists (select 1 from players p where p.id = requester_id and p.auth_user_id = auth.uid())
);
create policy "friendships_update_involved" on friendships for update using (
  exists (select 1 from players p where p.id = requester_id and p.auth_user_id = auth.uid())
  or exists (select 1 from players p where p.id = addressee_id and p.auth_user_id = auth.uid())
);
create policy "friendships_delete_involved" on friendships for delete using (
  exists (select 1 from players p where p.id = requester_id and p.auth_user_id = auth.uid())
  or exists (select 1 from players p where p.id = addressee_id and p.auth_user_id = auth.uid())
);

-- curtidas do feed: qualquer jogador autenticado pode ler, mas só curte/descurte em nome próprio.
create policy "activity_likes_select_all" on activity_likes for select using (auth.uid() is not null);
create policy "activity_likes_write_self" on activity_likes for all using (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
);

create policy "activity_comments_select_all" on activity_comments for select using (auth.uid() is not null);
create policy "activity_comments_insert_self" on activity_comments for insert with check (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
);
create policy "activity_comments_delete_self" on activity_comments for delete using (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
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

-- free_agent_invites: o admin que convidou e o próprio jogador convidado (mesmo sem
-- ser membro da pelada) veem e respondem o convite; só admin cria/cancela.
create policy "free_agent_invites_select_involved" on free_agent_invites for select using (
  is_admin_of_pelada(pelada_id)
  or exists (select 1 from players p where p.id = free_agent_invites.player_id and p.auth_user_id = auth.uid())
);
create policy "free_agent_invites_write_admin_or_permitted_member" on free_agent_invites for insert with check (
  is_admin_of_pelada(pelada_id)
  or (
    is_member_of_pelada(pelada_id)
    and exists (select 1 from peladas p where p.id = pelada_id and p.member_can_invite_free_agents)
  )
);
create policy "free_agent_invites_update_admin_or_invitee" on free_agent_invites for update using (
  is_admin_of_pelada(pelada_id)
  or exists (select 1 from players p where p.id = free_agent_invites.player_id and p.auth_user_id = auth.uid())
);

create function is_owner_of_championship(p_championship_id uuid) returns boolean as $$
  select exists (
    select 1 from championships c
    join establishments e on e.id = c.establishment_id
    join players p on p.id = e.owner_player_id
    where c.id = p_championship_id and p.auth_user_id = auth.uid()
  );
$$ language sql security definer stable;

-- championships: público pra leitura (precisa achar pelo registration_code pra inscrever
-- um time), mas só o dono do estabelecimento organiza/edita.
create policy "championships_select_all" on championships for select using (true);
create policy "championships_write_owner" on championships for all using (
  exists (select 1 from establishments e where e.id = establishment_id and e.owner_player_id in (
    select id from players where auth_user_id = auth.uid()
  ))
);

-- championship_teams: leitura pública; o dono do campeonato ou quem inscreveu o time edita.
create policy "championship_teams_select_all" on championship_teams for select using (true);
create policy "championship_teams_insert_authenticated" on championship_teams for insert with check (auth.uid() is not null);
create policy "championship_teams_update_owner_or_registrant" on championship_teams for update using (
  is_owner_of_championship(championship_id)
  or exists (select 1 from players p where p.id = registered_by_player_id and p.auth_user_id = auth.uid())
);
create policy "championship_teams_delete_owner_or_registrant" on championship_teams for delete using (
  is_owner_of_championship(championship_id)
  or exists (select 1 from players p where p.id = registered_by_player_id and p.auth_user_id = auth.uid())
);

create policy "championship_team_players_select_all" on championship_team_players for select using (true);
create policy "championship_team_players_write_owner_or_registrant" on championship_team_players for all using (
  exists (
    select 1 from championship_teams t
    where t.id = championship_team_id
    and (is_owner_of_championship(t.championship_id) or exists (
      select 1 from players p where p.id = t.registered_by_player_id and p.auth_user_id = auth.uid()
    ))
  )
);

create policy "championship_matches_select_all" on championship_matches for select using (true);
create policy "championship_matches_write_owner" on championship_matches for all using (is_owner_of_championship(championship_id));

create policy "championship_goals_select_all" on championship_goals for select using (true);
create policy "championship_goals_write_owner" on championship_goals for all using (
  exists (select 1 from championship_matches m where m.id = match_id and is_owner_of_championship(m.championship_id))
);
