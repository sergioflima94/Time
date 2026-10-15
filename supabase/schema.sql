-- =========================================================================
-- Schema do app de Pelada (futebol amador)
-- Base histórica. Para um projeto atualizado, use supabase/migrations via db push.
-- Conversas integradas/RLS/RPCs: 20261011010000_community_conversations.sql.
-- Histórico operacional/triggers/RPC: 20261011020000_activity_history.sql.
-- Quadras híbridas/agenda física única: 20261011030000_hybrid_fields.sql.
-- Avaliações verificadas/comentários/NPS: 20261011040000_venue_reviews.sql.
-- Não reaplique esta base sobre um banco que já recebeu as migrações.
-- Rode este arquivo no SQL Editor do seu projeto Supabase (supabase.com).
-- =========================================================================

create extension if not exists "pgcrypto";
create extension if not exists "supabase_vault";

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
  -- Modo Resenha é sempre opt-in; desligar também remove os selos ativos no app.
  banter_opt_in boolean not null default false,
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
  whatsapp_phone text,
  whatsapp_opt_in boolean not null default false,
  messaging_provider text not null default 'automatic' check (messaging_provider in ('automatic', 'evolution_go', 'meta_cloud')),
  reservation_deposit_percent numeric(5, 2) not null default 0 check (reservation_deposit_percent between 0 and 100),
  cancellation_refund_hours int not null default 24 check (cancellation_refund_hours >= 0),
  cancellation_refund_percent numeric(5, 2) not null default 100 check (cancellation_refund_percent between 0 and 100),
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
  latitude double precision,
  longitude double precision,
  average_rating numeric(3, 2) check (average_rating between 0 and 5),
  cancellation_rate numeric(5, 4) not null default 0 check (cancellation_rate between 0 and 1),
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
  booking_duration_minutes int not null default 90 check (booking_duration_minutes >= 30),
  draw_method text not null default 'rating' check (draw_method in ('arrival', 'random', 'rating')),
  default_field_cost numeric(10, 2),
  match_goal_limit int,
  auto_booking_enabled boolean not null default false,
  booking_minimum_players int not null default 10 check (booking_minimum_players >= 2),
  booking_response_minutes int not null default 30 check (booking_response_minutes >= 5),
  poll_quorum_percent int not null default 50 check (poll_quorum_percent between 1 and 100),
  poll_reminder_minutes int not null default 120 check (poll_reminder_minutes >= 15),
  active boolean not null default true,
  created_by uuid not null references players (id)
);

create table schedule_field_preferences (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules (id) on delete cascade,
  field_id uuid not null references fields (id) on delete cascade,
  priority int not null,
  source text not null default 'team' check (source in ('team', 'sponsored')),
  created_at timestamptz not null default now(),
  unique (schedule_id, field_id),
  unique (schedule_id, priority)
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
  duration_minutes int not null default 90 check (duration_minutes >= 30),
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

-- Selos bem-humorados pós-jogo. A autoria fica protegida; o app consome apenas
-- a soma por selo via player_banter_summary(). Cada voto expira em 30 dias.
create table banter_votes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  pelada_id uuid not null references peladas (id) on delete cascade,
  voter_player_id uuid not null references players (id) on delete cascade,
  target_player_id uuid not null references players (id) on delete cascade,
  badge text not null check (badge in ('drama_king', 'human_var', 'hot_blooded')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  unique (game_id, voter_player_id, target_player_id, badge),
  check (voter_player_id <> target_player_id),
  check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);

create function clear_banter_votes_on_opt_out() returns trigger as $$
begin
  if old.banter_opt_in and not new.banter_opt_in then
    delete from banter_votes where target_player_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger players_clear_banter_votes_on_opt_out
after update of banter_opt_in on players
for each row execute function clear_banter_votes_on_opt_out();

-- Rateio ("vaquinha") do custo da quadra: 1 linha por jogador confirmado em jogos com field_cost definido.
create table payments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'paid', 'waived')),
  method text check (method in ('pix', 'cash', 'card', 'contactless')),
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
  -- exatamente um dos dois é preenchido: um estabelecimento cadastrado (dono de campo) organiza,
  -- ou uma pelada organiza direto, sem dono de campo por trás (o admin dela administra).
  establishment_id uuid references establishments (id) on delete cascade,
  organizer_pelada_id uuid references peladas (id) on delete cascade,
  name text not null,
  -- esporte do campeonato (SportId de src/constants/sports.ts) — decide terminologia (gol/ponto),
  -- cor de destaque e se as partidas usam goleiro.
  sport_id text not null default 'futebol' check (sport_id in ('futebol', 'volei', 'basquete', 'handebol', 'futvolei')),
  format text not null check (format in ('round_robin', 'knockout')),
  field_id uuid references fields (id) on delete set null,
  max_teams int,
  -- taxa de inscrição por time. Só faz sentido quando tem um estabelecimento (com pix_key) pra
  -- receber — campeonato organizado por pelada não tem essa infra, então fica sempre null.
  entry_fee numeric(10, 2),
  registration_code text not null unique,
  registration_deadline timestamptz,
  match_minutes int not null default 10,
  status text not null default 'registration' check (status in ('registration', 'in_progress', 'finished')),
  created_by uuid not null references players (id),
  created_at timestamptz not null default now(),
  check (
    (establishment_id is not null and organizer_pelada_id is null)
    or (establishment_id is null and organizer_pelada_id is not null)
  )
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
-- Desafios: partida amistosa entre duas peladas (sem campeonato/estabelecimento)
-- e confronto direto entre dois jogadores — ver src/store/useAppStore.ts
-- (sendTeamChallenge/respondTeamChallenge, sendPlayerDuel/respondPlayerDuel).
-- ---------------------------------------------------------------------
create table team_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_pelada_id uuid not null references peladas (id) on delete cascade,
  challenged_pelada_id uuid not null references peladas (id) on delete cascade,
  proposed_date date not null,
  proposed_time text not null,
  field_id uuid references fields (id) on delete set null,
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  -- preenchido quando aceito (a fk pra friendly_matches é adicionada abaixo, depois da tabela existir).
  match_id uuid,
  created_by uuid not null references players (id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (challenger_pelada_id <> challenged_pelada_id)
);

-- partida amistosa gerada quando um desafio é aceito — reaproveita o elenco (membros
-- ativos) inteiro de cada pelada como "o time", sem seleção avulsa como em campeonato.
create table friendly_matches (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references team_challenges (id) on delete cascade,
  pelada_a_id uuid not null references peladas (id) on delete cascade,
  pelada_b_id uuid not null references peladas (id) on delete cascade,
  field_id uuid references fields (id) on delete set null,
  scheduled_at timestamptz not null,
  match_minutes int not null default 10,
  sport_id text not null default 'futebol' check (sport_id in ('futebol', 'volei', 'basquete', 'handebol', 'futvolei')),
  started_at timestamptz,
  ended_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'finished')),
  -- null = empate ou ainda não terminou
  winner_pelada_id uuid references peladas (id)
);

alter table team_challenges add constraint team_challenges_match_id_fkey
  foreign key (match_id) references friendly_matches (id) on delete set null;

-- gol/ponto marcado numa partida amistosa — separado de goals (jogo de pelada) e
-- championship_goals (campeonato).
create table friendly_match_goals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references friendly_matches (id) on delete cascade,
  pelada_id uuid not null references peladas (id),
  scorer_player_id uuid references players (id),
  scored_at timestamptz not null default now()
);

-- confronto direto entre dois jogadores, independente de pelada — resultado (quando
-- registrado) aparece como retrospecto no perfil de cada um.
create table player_duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references players (id) on delete cascade,
  challenged_id uuid not null references players (id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  winner_id uuid references players (id),
  result_note text,
  created_by uuid not null references players (id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  result_recorded_at timestamptz,
  check (challenger_id <> challenged_id)
);

-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Operação do estabelecimento: equipe, cardápio, comandas e caixa.
-- Mantém pagamentos de consumo separados do rateio de partidas.
-- ---------------------------------------------------------------------
create table establishment_staff (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  roles text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (establishment_id, player_id)
);

create table field_availabilities (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields (id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time text not null,
  end_time text not null,
  slot_minutes int not null default 60 check (slot_minutes >= 15),
  price numeric(10, 2),
  active boolean not null default true
);

create table field_promotions (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields (id) on delete cascade,
  sport_id text not null check (sport_id in ('futebol', 'volei', 'basquete', 'handebol', 'futvolei')),
  label text not null,
  price_per_confirmed_booking numeric(10, 2) not null default 0,
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  campaign_budget numeric(10, 2) check (campaign_budget is null or campaign_budget >= 0)
);

-- Premissas privadas de precificação. Os resultados (ponto de equilíbrio, sugestão e
-- lucro) são derivados no app para continuarem auditáveis e fáceis de recalcular.
create table championship_budgets (
  id uuid primary key default gen_random_uuid(),
  championship_id uuid not null unique references championships (id) on delete cascade,
  planned_teams int not null check (planned_teams >= 2),
  field_cost_per_match numeric(10, 2) not null default 0 check (field_cost_per_match >= 0),
  referee_cost_per_match numeric(10, 2) not null default 0 check (referee_cost_per_match >= 0),
  assistant_referee_cost_per_match numeric(10, 2) not null default 0 check (assistant_referee_cost_per_match >= 0),
  table_staff_cost_per_match numeric(10, 2) not null default 0 check (table_staff_cost_per_match >= 0),
  prize_cost numeric(10, 2) not null default 0 check (prize_cost >= 0),
  trophies_cost numeric(10, 2) not null default 0 check (trophies_cost >= 0),
  medical_cost numeric(10, 2) not null default 0 check (medical_cost >= 0),
  security_cost numeric(10, 2) not null default 0 check (security_cost >= 0),
  marketing_cost numeric(10, 2) not null default 0 check (marketing_cost >= 0),
  materials_cost numeric(10, 2) not null default 0 check (materials_cost >= 0),
  cleaning_cost numeric(10, 2) not null default 0 check (cleaning_cost >= 0),
  food_water_cost numeric(10, 2) not null default 0 check (food_water_cost >= 0),
  licenses_cost numeric(10, 2) not null default 0 check (licenses_cost >= 0),
  other_cost numeric(10, 2) not null default 0 check (other_cost >= 0),
  contingency_percent numeric(5, 2) not null default 10 check (contingency_percent between 0 and 100),
  payment_fee_percent numeric(5, 2) not null default 0 check (payment_fee_percent >= 0 and payment_fee_percent < 100),
  target_profit numeric(10, 2) not null default 0 check (target_profit >= 0),
  updated_at timestamptz not null default now()
);

create table product_categories (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true
);

create table products (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments (id) on delete cascade,
  category_id uuid not null references product_categories (id),
  name text not null,
  description text,
  price numeric(10, 2) not null check (price >= 0),
  station text not null check (station in ('kitchen', 'bar', 'counter')),
  active boolean not null default true,
  stock_quantity int check (stock_quantity is null or stock_quantity >= 0)
);

create table service_tabs (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments (id) on delete cascade,
  label text not null,
  customer_player_id uuid references players (id),
  customer_name text not null,
  table_label text,
  game_id uuid references games (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'awaiting_payment', 'partially_paid', 'paid', 'closed', 'cancelled')),
  opened_by_player_id uuid not null references players (id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table tab_participants (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references service_tabs (id) on delete cascade,
  player_id uuid references players (id),
  name text not null
);

create table service_orders (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references service_tabs (id) on delete cascade,
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'preparing', 'ready', 'delivered', 'cancelled')),
  notes text,
  created_by_player_id uuid not null references players (id),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz
);

create table service_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references service_orders (id) on delete cascade,
  product_id uuid not null references products (id),
  participant_id uuid references tab_participants (id) on delete set null,
  quantity int not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  notes text,
  status text not null default 'submitted' check (status in ('submitted', 'preparing', 'ready', 'delivered', 'cancelled')),
  cancellation_reason text
);

-- Partes de um item atribuídas aos consumidores. Centavos inteiros evitam divergência
-- em divisões como R$ 10,00 / 3.
create table order_item_shares (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references service_order_items (id) on delete cascade,
  participant_id uuid not null references tab_participants (id) on delete cascade,
  amount_cents int not null check (amount_cents > 0)
);

-- Metadados públicos da conta escolhida pelo estabelecimento. A credencial real fica
-- no Supabase Vault e é acessada somente pelas Edge Functions com service_role.
create table payment_gateway_connections (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null unique references establishments (id) on delete cascade,
  provider text not null check (provider in ('manual_pix', 'sicoob', 'inter', 'mercado_pago', 'picpay')),
  status text not null default 'not_connected' check (status in ('not_connected', 'pending', 'connected', 'error')),
  account_label text,
  pix_enabled boolean not null default true,
  card_enabled boolean not null default false,
  contactless_enabled boolean not null default false,
  platform_fee_percent numeric(5,2) not null default 0 check (platform_fee_percent between 0 and 30),
  credential_secret_id uuid,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Somente Edge Functions usando service_role conseguem recuperar a credencial
-- descriptografada. O app móvel recebe apenas status e nome da conta.
create or replace function get_gateway_credentials(p_connection_id uuid)
returns jsonb
language sql
security definer
set search_path = public, vault
as $$
  select case when auth.role() = 'service_role' then jsonb_build_object(
    'provider', c.provider,
    'secret', ds.decrypted_secret
  ) else null end
  from payment_gateway_connections c
  left join vault.decrypted_secrets ds on ds.id = c.credential_secret_id
  where c.id = p_connection_id and c.status = 'connected';
$$;
revoke all on function get_gateway_credentials(uuid) from public, anon, authenticated;
grant execute on function get_gateway_credentials(uuid) to service_role;

create table sale_payment_intents (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references service_tabs (id) on delete cascade,
  payer_participant_id uuid not null references tab_participants (id),
  covered_participant_ids uuid[] not null,
  provider text not null check (provider in ('manual_pix', 'sicoob', 'inter', 'mercado_pago', 'picpay')),
  method text not null check (method in ('pix', 'cash', 'card', 'contactless')),
  amount_cents int not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled', 'failed')),
  external_id text,
  pix_copy_paste text,
  checkout_url text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table sale_payments (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references service_tabs (id),
  payer_player_id uuid references players (id),
  payer_name text not null,
  amount numeric(10, 2) not null check (amount > 0),
  method text not null check (method in ('pix', 'cash', 'card', 'contactless')),
  paid_at timestamptz not null default now(),
  reversed_at timestamptz
);

create table sale_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references sale_payments (id) on delete cascade,
  item_share_id uuid not null references order_item_shares (id),
  amount_cents int not null check (amount_cents > 0),
  unique (payment_id, item_share_id)
);

-- Liquida a cobrança e distribui o pagamento pelas partes selecionadas em uma única
-- transação de banco. Só o webhook com service_role pode chamar.
create or replace function settle_sale_payment_intent(p_intent_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent sale_payment_intents%rowtype;
  v_payment_id uuid;
  v_payer tab_participants%rowtype;
  v_share record;
  v_paid numeric(10,2);
  v_gross numeric(10,2);
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  select * into v_intent from sale_payment_intents where id = p_intent_id and status = 'pending' for update;
  if not found then return null; end if;
  select * into v_payer from tab_participants where id = v_intent.payer_participant_id;

  insert into sale_payments (tab_id, payer_player_id, payer_name, amount, method)
  values (v_intent.tab_id, v_payer.player_id, v_payer.name, v_intent.amount_cents / 100.0, v_intent.method)
  returning id into v_payment_id;

  for v_share in
    select s.id, greatest(0, s.amount_cents - coalesce(sum(a.amount_cents), 0)) as pending_cents
    from order_item_shares s
    join service_order_items i on i.id = s.item_id
    join service_orders o on o.id = i.order_id
    left join sale_payment_allocations a on a.item_share_id = s.id
    where o.tab_id = v_intent.tab_id
      and i.status <> 'cancelled'
      and s.participant_id = any(v_intent.covered_participant_ids)
    group by s.id, s.amount_cents
  loop
    if v_share.pending_cents > 0 then
      insert into sale_payment_allocations (payment_id, item_share_id, amount_cents)
      values (v_payment_id, v_share.id, v_share.pending_cents);
    end if;
  end loop;

  update sale_payment_intents set status = 'paid', paid_at = now() where id = p_intent_id;
  select coalesce(sum(amount), 0) into v_paid from sale_payments where tab_id = v_intent.tab_id and reversed_at is null;
  select coalesce(sum(i.quantity * i.unit_price), 0) into v_gross
    from service_order_items i join service_orders o on o.id = i.order_id
    where o.tab_id = v_intent.tab_id and i.status <> 'cancelled';
  update service_tabs set status = case when v_paid >= v_gross then 'paid' else 'partially_paid' end where id = v_intent.tab_id;
  return v_payment_id;
end;
$$;
revoke all on function settle_sale_payment_intent(uuid) from public, anon, authenticated;
grant execute on function settle_sale_payment_intent(uuid) to service_role;

create table cash_shifts (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments (id) on delete cascade,
  opened_by_player_id uuid not null references players (id),
  opening_amount numeric(10, 2) not null default 0,
  closing_amount numeric(10, 2),
  expected_amount numeric(10, 2),
  difference numeric(10, 2),
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

-- ---------------------------------------------------------------------
-- Aulas esportivas: programa, agenda, matrícula, pagamento e chamada.
-- ---------------------------------------------------------------------
create table coaches (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments (id) on delete cascade,
  player_id uuid not null references players (id),
  sport_ids text[] not null default '{}',
  bio text,
  active boolean not null default true,
  unique (establishment_id, player_id)
);

create table class_programs (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments (id) on delete cascade,
  name text not null,
  sport_id text not null check (sport_id in ('futebol', 'volei', 'basquete', 'handebol', 'futvolei')),
  format text not null check (format in ('group', 'private')),
  coach_id uuid not null references coaches (id),
  field_id uuid not null references fields (id),
  level text not null,
  capacity int not null check (capacity > 0),
  duration_minutes int not null check (duration_minutes >= 15),
  price numeric(10, 2) not null check (price >= 0),
  billing_type text not null check (billing_type in ('drop_in', 'package', 'monthly')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table game_booking_requests (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  schedule_id uuid not null references schedules (id) on delete cascade,
  field_id uuid not null references fields (id),
  preference_id uuid references schedule_field_preferences (id) on delete set null,
  source text not null default 'team' check (source in ('team', 'sponsored')),
  attempt int not null default 1,
  code text not null unique,
  requested_at timestamptz not null default now(),
  requested_start_at timestamptz not null,
  duration_minutes int not null,
  status text not null default 'awaiting_owner' check (status in ('awaiting_owner', 'accepted', 'declined', 'expired', 'conflict', 'cancelled')),
  sent_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz not null,
  provider_message_id text,
  response_message_id text unique,
  failure_reason text
);

create unique index one_live_booking_request_per_game
  on game_booking_requests (game_id)
  where status in ('awaiting_owner', 'accepted');

create table team_availability_polls (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  pelada_id uuid not null references peladas (id) on delete cascade,
  question text not null,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_by uuid not null references players (id),
  created_at timestamptz not null default now(),
  closes_at timestamptz not null,
  selected_option_id uuid,
  quorum_required int not null default 1 check (quorum_required >= 1),
  reminder_sent_at timestamptz
);

create table team_availability_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references team_availability_polls (id) on delete cascade,
  field_id uuid not null references fields (id),
  starts_at timestamptz not null,
  label text not null
);

alter table team_availability_polls
  add constraint team_poll_selected_option_fk foreign key (selected_option_id) references team_availability_poll_options (id) on delete set null;

create table team_availability_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references team_availability_polls (id) on delete cascade,
  option_id uuid not null references team_availability_poll_options (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, player_id)
);

create table whatsapp_deliveries (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid references game_booking_requests (id) on delete cascade,
  poll_id uuid references team_availability_polls (id) on delete cascade,
  to_player_id uuid references players (id) on delete set null,
  phone text,
  whatsapp_opt_in boolean not null default false,
  kind text not null check (kind in ('field_request', 'game_confirmed', 'booking_declined', 'poll_invite', 'poll_reminder')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'skipped', 'failed')),
  preview text not null,
  provider_message_id text unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  provider text check (provider in ('evolution_go', 'meta_cloud', 'in_app')),
  fallback_from_provider text check (fallback_from_provider in ('evolution_go', 'meta_cloud'))
);

create table booking_deposits (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null unique references game_booking_requests (id) on delete cascade,
  payer_player_id uuid not null references players (id),
  amount_cents int not null check (amount_cents > 0),
  provider text not null check (provider in ('manual_pix', 'sicoob', 'inter', 'mercado_pago', 'picpay')),
  method text not null check (method in ('pix', 'cash', 'card', 'contactless')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'retained', 'cancelled')),
  external_id text,
  pix_copy_paste text,
  checkout_url text,
  due_at timestamptz not null,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

-- Vaquinha é distinta do rateio da quadra. O gateway liquida direto para o responsável;
-- o app só mantém intenção, confirmação por webhook e prestação de contas.
create table fundraising_campaigns (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references peladas (id) on delete cascade,
  title text not null,
  description text,
  category text not null check (category in ('equipment', 'event', 'travel', 'uniform', 'prize', 'other')),
  target_amount numeric(10, 2) not null check (target_amount > 0),
  suggested_amount numeric(10, 2) check (suggested_amount is null or suggested_amount > 0),
  deadline timestamptz,
  image_url text,
  status text not null default 'active' check (status in ('draft', 'active', 'funded', 'closed', 'cancelled')),
  allow_anonymous boolean not null default true,
  payout_player_id uuid not null references players (id),
  created_by uuid not null references players (id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table fundraising_contributions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references fundraising_campaigns (id) on delete cascade,
  paid_by_player_id uuid not null references players (id),
  credited_player_id uuid not null references players (id),
  amount numeric(10, 2) not null check (amount > 0),
  method text not null check (method in ('pix', 'cash', 'card', 'contactless')),
  provider text not null check (provider in ('manual_pix', 'sicoob', 'inter', 'mercado_pago', 'picpay')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'failed')),
  anonymous boolean not null default false,
  message text,
  external_id text unique,
  pix_copy_paste text,
  checkout_url text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table fundraising_expenses (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references fundraising_campaigns (id) on delete cascade,
  title text not null,
  amount numeric(10, 2) not null check (amount > 0),
  receipt_url text,
  recorded_by uuid not null references players (id),
  created_at timestamptz not null default now()
);

create table class_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references class_programs (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('scheduled', 'open', 'full', 'in_progress', 'completed', 'cancelled')),
  cancellation_reason text,
  check (ends_at > starts_at)
);

create table class_enrollments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions (id) on delete cascade,
  player_id uuid not null references players (id),
  status text not null check (status in ('confirmed', 'waitlisted', 'cancelled')),
  payment_status text not null check (payment_status in ('pending', 'paid', 'waived', 'refunded')),
  payment_method text check (payment_method in ('pix', 'cash', 'card', 'contactless')),
  amount numeric(10, 2) not null default 0,
  is_trial boolean not null default false,
  waitlist_position int,
  enrolled_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index class_enrollments_active_unique on class_enrollments (session_id, player_id) where status <> 'cancelled';

create table class_attendances (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions (id) on delete cascade,
  player_id uuid not null references players (id),
  status text not null check (status in ('present', 'absent', 'excused')),
  coach_notes text,
  recorded_at timestamptz not null default now(),
  unique (session_id, player_id)
);

create table makeup_credits (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id),
  program_id uuid not null references class_programs (id) on delete cascade,
  source_session_id uuid not null references class_sessions (id),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- A agenda é validada também no banco: dois clientes podem tentar publicar ao mesmo
-- tempo, portanto esconder o horário apenas no app não é suficiente.
create function prevent_class_session_conflict() returns trigger as $$
declare
  v_field_id uuid;
begin
  select field_id into v_field_id from class_programs where id = new.program_id;
  perform pg_advisory_xact_lock(hashtext(v_field_id::text));

  if exists (
    select 1 from class_sessions cs
    join class_programs cp on cp.id = cs.program_id
    where cp.field_id = v_field_id and cs.id <> new.id and cs.status <> 'cancelled'
      and new.starts_at < cs.ends_at and new.ends_at > cs.starts_at
  ) or exists (
    select 1 from games g
    where g.field_id = v_field_id and g.status <> 'cancelled'
      and new.starts_at < g.scheduled_at + make_interval(mins => greatest(g.match_minutes, 60))
      and new.ends_at > g.scheduled_at
  ) or exists (
    select 1 from championship_matches cm
    join championships c on c.id = cm.championship_id
    where cm.field_id = v_field_id and cm.status <> 'finished' and cm.scheduled_at is not null
      and new.starts_at < cm.scheduled_at + make_interval(mins => greatest(c.match_minutes, 60))
      and new.ends_at > cm.scheduled_at
  ) then
    raise exception 'field_schedule_conflict';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger class_sessions_prevent_conflict
before insert or update of starts_at, ends_at, program_id, status on class_sessions
for each row when (new.status <> 'cancelled') execute function prevent_class_session_conflict();

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

-- Confirma a resposta recebida pelo webhook com lock e nova checagem de conflito.
-- A Edge Function usa service_role; o cliente móvel nunca chama esta função diretamente.
create or replace function respond_game_booking_request(
  p_request_id uuid,
  p_accepted boolean,
  p_response_message_id text
) returns text as $$
declare
  r game_booking_requests%rowtype;
  g games%rowtype;
  f fields%rowtype;
  p peladas%rowtype;
  has_conflict boolean;
begin
  select * into r from game_booking_requests where id = p_request_id for update;
  if not found then return 'not_found'; end if;
  if r.status <> 'awaiting_owner' then return r.status; end if;
  if exists (select 1 from game_booking_requests where response_message_id = p_response_message_id) then return r.status; end if;

  if not p_accepted then
    update game_booking_requests set status = 'declined', responded_at = now(), response_message_id = p_response_message_id where id = r.id;
    return 'declined';
  end if;

  select * into g from games where id = r.game_id for update;
  select * into f from fields where id = r.field_id;
  select * into p from peladas where id = g.pelada_id;

  select exists (
    select 1 from field_bookings b
    where b.field_id = r.field_id
      and (
        (b.recurrence = 'single' and b.date = (r.requested_start_at at time zone 'America/Sao_Paulo')::date)
        or (b.recurrence = 'weekly' and b.day_of_week = extract(dow from r.requested_start_at at time zone 'America/Sao_Paulo'))
      )
      and b.time::time < ((r.requested_start_at at time zone 'America/Sao_Paulo')::time + make_interval(mins => r.duration_minutes))
      and (b.time::time + make_interval(mins => b.duration_minutes)) > (r.requested_start_at at time zone 'America/Sao_Paulo')::time
  ) into has_conflict;

  if has_conflict then
    update game_booking_requests set status = 'conflict', responded_at = now(), response_message_id = p_response_message_id,
      failure_reason = 'O horário ficou ocupado antes da confirmação.' where id = r.id;
    return 'conflict';
  end if;

  insert into field_bookings (field_id, establishment_id, pelada_id, team_name, recurrence, day_of_week, date, time, duration_minutes, notes, created_by)
  values (
    r.field_id, f.establishment_id, g.pelada_id, p.name, 'single', null,
    (r.requested_start_at at time zone 'America/Sao_Paulo')::date,
    to_char(r.requested_start_at at time zone 'America/Sao_Paulo', 'HH24:MI'),
    r.duration_minutes, 'Confirmado automaticamente pelo WhatsApp (' || r.code || ')', g.created_by
  );

  update games set field_id = r.field_id where id = g.id;
  update game_booking_requests set status = 'accepted', responded_at = now(), response_message_id = p_response_message_id where id = r.id;
  return 'accepted';
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function respond_game_booking_request(uuid, boolean, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
-- Módulos da Central do Esporte. O app local usa useGrowthStore; estas tabelas
-- são o contrato de persistência para produção e mantêm cada domínio isolado.
create table multi_sport_scoreboards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games (id) on delete cascade,
  sport_id text not null,
  title text not null,
  home_name text not null,
  away_name text not null,
  score_unit text not null check (score_unit in ('goals', 'points', 'sets', 'quarters')),
  target_points int,
  win_by_two boolean not null default false,
  segments_to_win int,
  max_segments int,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished')),
  created_by uuid not null references players (id),
  created_at timestamptz not null default now()
);

create table scoreboard_segments (
  id uuid primary key default gen_random_uuid(),
  scoreboard_id uuid not null references multi_sport_scoreboards (id) on delete cascade,
  label text not null,
  sequence int not null,
  home_score int not null default 0 check (home_score >= 0),
  away_score int not null default 0 check (away_score >= 0),
  finished boolean not null default false,
  unique (scoreboard_id, sequence)
);

create table chat_channels (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (context_type in ('team', 'game', 'championship', 'captains', 'service')),
  context_id uuid not null,
  title text not null,
  admin_only_posting boolean not null default false,
  created_by uuid not null references players (id),
  created_at timestamptz not null default now()
);
create table chat_participants (
  channel_id uuid not null references chat_channels (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  last_read_at timestamptz,
  primary key (channel_id, player_id)
);
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references chat_channels (id) on delete cascade,
  sender_player_id uuid not null references players (id),
  text text not null check (char_length(text) between 1 and 4000),
  system boolean not null default false,
  created_at timestamptz not null default now()
);

create table wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id),
  establishment_id uuid references establishments (id),
  kind text not null check (kind in ('credit', 'debit', 'cashback', 'refund', 'bonus')),
  amount numeric(12,2) not null check (amount > 0),
  description text not null,
  external_reference text,
  created_at timestamptz not null default now()
);
create table loyalty_plans (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments (id) on delete cascade,
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  credits int not null check (credits > 0),
  bonus_credits int not null default 0 check (bonus_credits >= 0),
  benefits jsonb not null default '[]',
  active boolean not null default true
);
create table loyalty_subscriptions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references loyalty_plans (id),
  player_id uuid not null references players (id),
  remaining_credits int not null check (remaining_credits >= 0),
  valid_until timestamptz not null,
  created_at timestamptz not null default now()
);

create table sports_staff (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players (id),
  name text not null,
  role text not null check (role in ('referee', 'scorekeeper', 'coach', 'freelancer')),
  sports text[] not null default '{}',
  price_per_event numeric(12,2) not null check (price_per_event >= 0),
  rating numeric(3,2) not null default 0,
  available boolean not null default true
);
create table staff_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references sports_staff (id),
  establishment_id uuid not null references establishments (id),
  event_label text not null,
  starts_at timestamptz not null,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'invited' check (status in ('invited', 'accepted', 'paid'))
);

create table open_slot_offers (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments (id),
  field_id uuid not null references fields (id),
  sport_id text not null,
  starts_at timestamptz not null,
  duration_minutes int not null check (duration_minutes > 0),
  original_price numeric(12,2) not null check (original_price >= 0),
  offer_price numeric(12,2) not null check (offer_price >= 0 and offer_price <= original_price),
  sponsored boolean not null default false,
  status text not null default 'available' check (status in ('available', 'reserved', 'expired'))
);

create table digital_waivers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  version int not null default 1,
  scope text not null check (scope in ('team', 'championship', 'class')),
  scope_id uuid not null,
  required boolean not null default true,
  created_by uuid not null references players (id),
  updated_at timestamptz not null default now()
);
create table waiver_acceptances (
  waiver_id uuid not null references digital_waivers (id),
  player_id uuid not null references players (id),
  waiver_version int not null,
  accepted_at timestamptz not null default now(),
  device_info text,
  primary key (waiver_id, player_id, waiver_version)
);

create table sport_highlights (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id),
  game_id uuid references games (id),
  title text not null,
  description text not null,
  kind text not null check (kind in ('record', 'mvp', 'streak', 'moment')),
  created_at timestamptz not null default now()
);
create table commerce_listings (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments (id),
  name text not null,
  kind text not null check (kind in ('sale', 'rental')),
  price numeric(12,2) not null check (price >= 0),
  stock int not null default 0 check (stock >= 0),
  category text not null,
  active boolean not null default true
);
create table rental_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references commerce_listings (id),
  player_id uuid not null references players (id),
  quantity int not null check (quantity > 0),
  total numeric(12,2) not null check (total >= 0),
  pickup_at timestamptz not null,
  status text not null default 'reserved' check (status in ('reserved', 'picked_up', 'returned')),
  created_at timestamptz not null default now()
);
create table device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table players enable row level security;
alter table peladas enable row level security;
alter table pelada_memberships enable row level security;
alter table establishments enable row level security;
alter table fields enable row level security;
alter table field_bookings enable row level security;
alter table field_availabilities enable row level security;
alter table field_promotions enable row level security;
alter table schedules enable row level security;
alter table schedule_field_preferences enable row level security;
alter table games enable row level security;
alter table game_booking_requests enable row level security;
alter table team_availability_polls enable row level security;
alter table team_availability_poll_options enable row level security;
alter table team_availability_poll_votes enable row level security;
alter table whatsapp_deliveries enable row level security;
alter table booking_deposits enable row level security;
alter table fundraising_campaigns enable row level security;
alter table fundraising_contributions enable row level security;
alter table fundraising_expenses enable row level security;
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
alter table banter_votes enable row level security;
alter table punishments enable row level security;
alter table payments enable row level security;
alter table free_agent_invites enable row level security;
alter table championships enable row level security;
alter table championship_budgets enable row level security;
alter table championship_teams enable row level security;
alter table championship_team_players enable row level security;
alter table championship_matches enable row level security;
alter table championship_goals enable row level security;
alter table establishment_staff enable row level security;
alter table product_categories enable row level security;
alter table products enable row level security;
alter table service_tabs enable row level security;
alter table tab_participants enable row level security;
alter table service_orders enable row level security;
alter table service_order_items enable row level security;
alter table order_item_shares enable row level security;
alter table payment_gateway_connections enable row level security;
alter table sale_payment_intents enable row level security;
alter table sale_payments enable row level security;
alter table sale_payment_allocations enable row level security;
alter table cash_shifts enable row level security;
alter table coaches enable row level security;
alter table class_programs enable row level security;
alter table class_sessions enable row level security;
alter table class_enrollments enable row level security;
alter table class_attendances enable row level security;
alter table team_challenges enable row level security;
alter table friendly_matches enable row level security;
alter table friendly_match_goals enable row level security;
alter table player_duels enable row level security;
alter table multi_sport_scoreboards enable row level security;
alter table scoreboard_segments enable row level security;
alter table chat_channels enable row level security;
alter table chat_participants enable row level security;
alter table chat_messages enable row level security;
alter table wallet_ledger enable row level security;
alter table loyalty_plans enable row level security;
alter table loyalty_subscriptions enable row level security;
alter table sports_staff enable row level security;
alter table staff_assignments enable row level security;
alter table open_slot_offers enable row level security;
alter table digital_waivers enable row level security;
alter table waiver_acceptances enable row level security;
alter table sport_highlights enable row level security;
alter table commerce_listings enable row level security;
alter table rental_orders enable row level security;
alter table device_push_tokens enable row level security;

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
-- página pública do estabelecimento (app/estabelecimento/publico/[id].tsx): qualquer
-- jogador autenticado marca um jogo avulso em nome próprio, sem precisar ser o dono
-- nem pertencer a uma pelada vinculada — só não edita/cancela a reserva de outra pessoa
-- (isso continua exclusivo do dono, via field_bookings_write_owner acima).
create policy "field_bookings_insert_self" on field_bookings for insert with check (
  pelada_id is null
  and exists (select 1 from players p where p.id = created_by and p.auth_user_id = auth.uid())
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

create function is_establishment_owner(p_establishment_id uuid) returns boolean as $$
  select exists (
    select 1 from establishments e
    join players p on p.id = e.owner_player_id
    where e.id = p_establishment_id and p.auth_user_id = auth.uid()
  );
$$ language sql security definer stable;

-- Retorna apenas o placar agregado do Modo Resenha. A identidade de quem votou
-- nunca sai do banco e o resumo só é visível ao próprio jogador ou a colegas
-- que compartilham ao menos uma pelada ativa com ele.
create function player_banter_summary(p_target_player_id uuid)
returns table (badge text, vote_count bigint) as $$
declare
  current_player_id uuid;
begin
  select id into current_player_id from players where auth_user_id = auth.uid();

  if current_player_id is null
    or not exists (select 1 from players where id = p_target_player_id and banter_opt_in)
    or not (
      current_player_id = p_target_player_id
      or exists (
        select 1
        from pelada_memberships mine
        join pelada_memberships theirs on theirs.pelada_id = mine.pelada_id
        where mine.player_id = current_player_id and mine.active
          and theirs.player_id = p_target_player_id and theirs.active
      )
    ) then
    return;
  end if;

  return query
    select vote.badge, count(*)
    from banter_votes vote
    where vote.target_player_id = p_target_player_id and vote.expires_at > now()
    group by vote.badge;
end;
$$ language plpgsql security definer stable set search_path = public;

revoke all on function player_banter_summary(uuid) from public, anon;
grant execute on function player_banter_summary(uuid) to authenticated;

create function can_operate_establishment(p_establishment_id uuid) returns boolean as $$
  select is_establishment_owner(p_establishment_id) or exists (
    select 1 from establishment_staff s
    join players p on p.id = s.player_id
    where s.establishment_id = p_establishment_id and p.auth_user_id = auth.uid() and s.active
  );
$$ language sql security definer stable;

create policy "field_availabilities_select_all" on field_availabilities for select using (true);
create policy "field_availabilities_write_owner" on field_availabilities for all using (
  exists (select 1 from fields f where f.id = field_id and is_establishment_owner(f.establishment_id))
);
create policy "field_promotions_select_active" on field_promotions for select using (active);

create policy "establishment_staff_select_team" on establishment_staff for select using (can_operate_establishment(establishment_id));
create policy "establishment_staff_write_owner" on establishment_staff for all using (is_establishment_owner(establishment_id));

create policy "product_categories_select_all" on product_categories for select using (true);
create policy "product_categories_write_staff" on product_categories for all using (can_operate_establishment(establishment_id));
create policy "products_select_all" on products for select using (true);
create policy "products_write_staff" on products for all using (can_operate_establishment(establishment_id));

create policy "service_tabs_select_involved" on service_tabs for select using (
  can_operate_establishment(establishment_id)
  or exists (select 1 from players p where p.id = customer_player_id and p.auth_user_id = auth.uid())
);
create policy "service_tabs_write_staff" on service_tabs for all using (can_operate_establishment(establishment_id));
create policy "tab_participants_select_involved" on tab_participants for select using (
  exists (select 1 from service_tabs t where t.id = tab_id and (
    can_operate_establishment(t.establishment_id)
    or exists (select 1 from players p where p.id = tab_participants.player_id and p.auth_user_id = auth.uid())
  ))
);
create policy "tab_participants_write_staff" on tab_participants for all using (
  exists (select 1 from service_tabs t where t.id = tab_id and can_operate_establishment(t.establishment_id))
);
create policy "service_orders_select_involved" on service_orders for select using (
  exists (select 1 from service_tabs t where t.id = tab_id and (
    can_operate_establishment(t.establishment_id)
    or exists (select 1 from players p where p.id = t.customer_player_id and p.auth_user_id = auth.uid())
  ))
);
create policy "service_orders_write_staff" on service_orders for all using (
  exists (select 1 from service_tabs t where t.id = tab_id and can_operate_establishment(t.establishment_id))
);
create policy "service_order_items_select_involved" on service_order_items for select using (
  exists (select 1 from service_orders o join service_tabs t on t.id = o.tab_id where o.id = order_id and (
    can_operate_establishment(t.establishment_id)
    or exists (select 1 from players p where p.id = t.customer_player_id and p.auth_user_id = auth.uid())
  ))
);
create policy "service_order_items_write_staff" on service_order_items for all using (
  exists (select 1 from service_orders o join service_tabs t on t.id = o.tab_id where o.id = order_id and can_operate_establishment(t.establishment_id))
);
create policy "order_item_shares_select_involved" on order_item_shares for select using (
  exists (select 1 from service_order_items i join service_orders o on o.id = i.order_id join service_tabs t on t.id = o.tab_id where i.id = item_id and (
    can_operate_establishment(t.establishment_id)
    or exists (select 1 from tab_participants tp join players p on p.id = tp.player_id where tp.id = participant_id and p.auth_user_id = auth.uid())
  ))
);
create policy "order_item_shares_write_staff" on order_item_shares for all using (
  exists (select 1 from service_order_items i join service_orders o on o.id = i.order_id join service_tabs t on t.id = o.tab_id where i.id = item_id and can_operate_establishment(t.establishment_id))
);
create policy "gateway_connections_owner" on payment_gateway_connections for all using (
  exists (select 1 from establishments e join players p on p.id = e.owner_player_id where e.id = establishment_id and p.auth_user_id = auth.uid())
);
create policy "sale_payment_intents_select_involved" on sale_payment_intents for select using (
  exists (select 1 from service_tabs t where t.id = tab_id and (
    can_operate_establishment(t.establishment_id)
    or exists (select 1 from tab_participants tp join players p on p.id = tp.player_id where tp.id = payer_participant_id and p.auth_user_id = auth.uid())
  ))
);
create policy "sale_payments_select_involved" on sale_payments for select using (
  exists (select 1 from service_tabs t where t.id = tab_id and (
    can_operate_establishment(t.establishment_id)
    or exists (select 1 from players p where p.id = payer_player_id and p.auth_user_id = auth.uid())
  ))
);
create policy "sale_payments_write_staff" on sale_payments for all using (
  exists (select 1 from service_tabs t where t.id = tab_id and can_operate_establishment(t.establishment_id))
);
create policy "sale_payment_allocations_select_involved" on sale_payment_allocations for select using (
  exists (select 1 from sale_payments sp join service_tabs t on t.id = sp.tab_id where sp.id = payment_id and (
    can_operate_establishment(t.establishment_id)
    or exists (select 1 from players p where p.id = sp.payer_player_id and p.auth_user_id = auth.uid())
  ))
);
create policy "cash_shifts_staff" on cash_shifts for all using (can_operate_establishment(establishment_id));

create policy "coaches_select_all" on coaches for select using (true);
create policy "coaches_write_staff" on coaches for all using (can_operate_establishment(establishment_id));
create policy "class_programs_select_all" on class_programs for select using (true);
create policy "class_programs_write_staff" on class_programs for all using (can_operate_establishment(establishment_id));
create policy "class_sessions_select_all" on class_sessions for select using (true);
create policy "class_sessions_write_staff" on class_sessions for all using (
  exists (select 1 from class_programs cp where cp.id = program_id and can_operate_establishment(cp.establishment_id))
);
create policy "class_enrollments_select_self_or_staff" on class_enrollments for select using (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
  or exists (select 1 from class_sessions cs join class_programs cp on cp.id = cs.program_id where cs.id = session_id and can_operate_establishment(cp.establishment_id))
);
create policy "class_enrollments_insert_self_or_staff" on class_enrollments for insert with check (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
  or exists (select 1 from class_sessions cs join class_programs cp on cp.id = cs.program_id where cs.id = session_id and can_operate_establishment(cp.establishment_id))
);
create policy "class_enrollments_update_self_or_staff" on class_enrollments for update using (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
  or exists (select 1 from class_sessions cs join class_programs cp on cp.id = cs.program_id where cs.id = session_id and can_operate_establishment(cp.establishment_id))
);
create policy "class_attendances_select_self_or_staff" on class_attendances for select using (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
  or exists (select 1 from class_sessions cs join class_programs cp on cp.id = cs.program_id where cs.id = session_id and can_operate_establishment(cp.establishment_id))
);
create policy "class_attendances_write_staff" on class_attendances for all using (
  exists (select 1 from class_sessions cs join class_programs cp on cp.id = cs.program_id where cs.id = session_id and can_operate_establishment(cp.establishment_id))
);
create policy "makeup_credits_select_self_or_staff" on makeup_credits for select using (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
  or exists (select 1 from class_programs cp where cp.id = program_id and can_operate_establishment(cp.establishment_id))
);
create policy "makeup_credits_write_staff" on makeup_credits for all using (
  exists (select 1 from class_programs cp where cp.id = program_id and can_operate_establishment(cp.establishment_id))
);


create policy "schedules_select_members" on schedules for select using (is_member_of_pelada(pelada_id));
create policy "schedules_write_admins" on schedules for all using (is_admin_of_pelada(pelada_id));

create policy "schedule_field_preferences_select_members" on schedule_field_preferences for select using (
  exists (select 1 from schedules s where s.id = schedule_id and is_member_of_pelada(s.pelada_id))
);
create policy "schedule_field_preferences_write_admins" on schedule_field_preferences for all using (
  exists (select 1 from schedules s where s.id = schedule_id and is_admin_of_pelada(s.pelada_id))
);

create policy "games_select_members" on games for select using (is_member_of_pelada(pelada_id));
create policy "games_write_admins" on games for all using (is_admin_of_pelada(pelada_id));

create policy "game_booking_requests_select_involved" on game_booking_requests for select using (
  exists (select 1 from games g where g.id = game_id and is_member_of_pelada(g.pelada_id))
  or exists (select 1 from fields f where f.id = field_id and is_establishment_owner(f.establishment_id))
);
create policy "game_booking_requests_write_admins" on game_booking_requests for all using (
  exists (select 1 from games g where g.id = game_id and is_admin_of_pelada(g.pelada_id))
);

create policy "team_polls_select_members" on team_availability_polls for select using (is_member_of_pelada(pelada_id));
create policy "team_polls_write_admins" on team_availability_polls for all using (is_admin_of_pelada(pelada_id));
create policy "team_poll_options_select_members" on team_availability_poll_options for select using (
  exists (select 1 from team_availability_polls p where p.id = poll_id and is_member_of_pelada(p.pelada_id))
);
create policy "team_poll_options_write_admins" on team_availability_poll_options for all using (
  exists (select 1 from team_availability_polls p where p.id = poll_id and is_admin_of_pelada(p.pelada_id))
);
create policy "team_poll_votes_select_members" on team_availability_poll_votes for select using (
  exists (select 1 from team_availability_polls p where p.id = poll_id and is_member_of_pelada(p.pelada_id))
);
create policy "team_poll_votes_insert_self" on team_availability_poll_votes for insert with check (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
);
create policy "team_poll_votes_update_self" on team_availability_poll_votes for update using (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
);
create policy "whatsapp_deliveries_select_involved" on whatsapp_deliveries for select using (
  exists (select 1 from players p where p.id = to_player_id and p.auth_user_id = auth.uid())
  or exists (
    select 1 from game_booking_requests r join games g on g.id = r.game_id
    where r.id = booking_request_id and is_admin_of_pelada(g.pelada_id)
  )
);

create policy "booking_deposits_select_involved" on booking_deposits for select using (
  exists (select 1 from players p where p.id = payer_player_id and p.auth_user_id = auth.uid())
  or exists (
    select 1 from game_booking_requests r join games g on g.id = r.game_id
    where r.id = booking_request_id and is_admin_of_pelada(g.pelada_id)
  )
  or exists (
    select 1 from game_booking_requests r join fields f on f.id = r.field_id
    where r.id = booking_request_id and is_establishment_owner(f.establishment_id)
  )
);
create policy "booking_deposits_insert_payer_or_admin" on booking_deposits for insert with check (
  exists (select 1 from players p where p.id = payer_player_id and p.auth_user_id = auth.uid())
  or exists (select 1 from game_booking_requests r join games g on g.id = r.game_id where r.id = booking_request_id and is_admin_of_pelada(g.pelada_id))
);

create policy "fundraising_campaigns_select_members" on fundraising_campaigns for select using (is_member_of_pelada(pelada_id));
create policy "fundraising_campaigns_write_admins" on fundraising_campaigns for all using (is_admin_of_pelada(pelada_id));
create policy "fundraising_contributions_select_self_or_admin" on fundraising_contributions for select using (
  exists (select 1 from players p where p.id = paid_by_player_id and p.auth_user_id = auth.uid())
  or exists (select 1 from fundraising_campaigns c where c.id = campaign_id and is_admin_of_pelada(c.pelada_id))
);
create policy "fundraising_contributions_insert_self" on fundraising_contributions for insert with check (
  exists (select 1 from players p where p.id = paid_by_player_id and p.auth_user_id = auth.uid())
  and exists (select 1 from fundraising_campaigns c where c.id = campaign_id and is_member_of_pelada(c.pelada_id))
);
create policy "fundraising_expenses_select_members" on fundraising_expenses for select using (
  exists (select 1 from fundraising_campaigns c where c.id = campaign_id and is_member_of_pelada(c.pelada_id))
);
create policy "fundraising_expenses_write_admins" on fundraising_expenses for all using (
  exists (select 1 from fundraising_campaigns c where c.id = campaign_id and is_admin_of_pelada(c.pelada_id))
);

-- Feed público da vaquinha sem vazar a identidade de quem escolheu anonimato.
create or replace function fundraising_campaign_feed(p_campaign_id uuid)
returns table (id uuid, credited_player_id uuid, amount numeric, anonymous boolean, message text, paid_at timestamptz)
language sql security definer set search_path = public as $$
  select fc.id, case when fc.anonymous then null else fc.credited_player_id end,
         fc.amount, fc.anonymous, fc.message, fc.paid_at
  from fundraising_contributions fc
  join fundraising_campaigns c on c.id = fc.campaign_id
  where fc.campaign_id = p_campaign_id and fc.status = 'paid' and is_member_of_pelada(c.pelada_id);
$$;
revoke all on function fundraising_campaign_feed(uuid) from public, anon;
grant execute on function fundraising_campaign_feed(uuid) to authenticated;

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

-- A tabela bruta não revela votos de terceiros. Cada jogador só relê/remove o
-- próprio voto; os demais veem apenas a soma anônima pela função acima.
create policy "banter_votes_select_own" on banter_votes for select using (
  exists (select 1 from players p where p.id = banter_votes.voter_player_id and p.auth_user_id = auth.uid())
);
create policy "banter_votes_insert_eligible" on banter_votes for insert with check (
  exists (select 1 from players p where p.id = banter_votes.voter_player_id and p.auth_user_id = auth.uid())
  and exists (select 1 from players p where p.id = banter_votes.target_player_id and p.banter_opt_in)
  and exists (
    select 1
    from games g
    join attendances voter on voter.game_id = g.id and voter.player_id = banter_votes.voter_player_id
    join attendances target on target.game_id = g.id and target.player_id = banter_votes.target_player_id
    where g.id = banter_votes.game_id and g.pelada_id = banter_votes.pelada_id and g.status = 'finished'
      and voter.status = 'confirmed' and not voter.no_show
      and target.status = 'confirmed' and not target.no_show
  )
);
create policy "banter_votes_delete_own" on banter_votes for delete using (
  exists (select 1 from players p where p.id = banter_votes.voter_player_id and p.auth_user_id = auth.uid())
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

-- true tanto pro dono do estabelecimento quanto pro admin da pelada organizadora
-- (campeonato self-organizado por um time, sem dono de campo).
create function is_owner_of_championship(p_championship_id uuid) returns boolean as $$
  select exists (
    select 1 from championships c
    left join establishments e on e.id = c.establishment_id
    left join players p on p.id = e.owner_player_id
    where c.id = p_championship_id
    and (
      (c.establishment_id is not null and p.auth_user_id = auth.uid())
      or (c.organizer_pelada_id is not null and is_admin_of_pelada(c.organizer_pelada_id))
    )
  );
$$ language sql security definer stable;

-- championships: público pra leitura (precisa achar pelo registration_code pra inscrever
-- um time), mas só quem organiza (dono do estabelecimento, ou admin da pelada quando
-- self-organizado) edita.
create policy "championships_select_all" on championships for select using (true);
create policy "championships_write_owner" on championships for all using (
  (establishment_id is not null and exists (select 1 from establishments e where e.id = establishment_id and e.owner_player_id in (
    select id from players where auth_user_id = auth.uid()
  )))
  or (organizer_pelada_id is not null and is_admin_of_pelada(organizer_pelada_id))
);

-- O orçamento contém custos e margem do organizador, então não é público como a tabela
-- do campeonato: somente o dono do estabelecimento/admin da pelada organizadora acessa.
create policy "championship_budgets_owner" on championship_budgets for all using (
  is_owner_of_championship(championship_id)
) with check (
  is_owner_of_championship(championship_id)
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

-- team_challenges: visível pra membros de qualquer uma das duas peladas envolvidas;
-- só admin propõe (em nome da própria pelada) e só admin de uma das duas responde/cancela.
create policy "team_challenges_select_involved" on team_challenges for select using (
  is_member_of_pelada(challenger_pelada_id) or is_member_of_pelada(challenged_pelada_id)
);
create policy "team_challenges_insert_admin" on team_challenges for insert with check (
  is_admin_of_pelada(challenger_pelada_id)
  and exists (select 1 from players p where p.id = created_by and p.auth_user_id = auth.uid())
);
create policy "team_challenges_update_admin_involved" on team_challenges for update using (
  is_admin_of_pelada(challenger_pelada_id) or is_admin_of_pelada(challenged_pelada_id)
);

-- friendly_matches/friendly_match_goals: visível pra membros de qualquer uma das duas
-- peladas; só admin de uma das duas opera o cronômetro/placar (mesma regra de time_challenges).
create policy "friendly_matches_select_involved" on friendly_matches for select using (
  is_member_of_pelada(pelada_a_id) or is_member_of_pelada(pelada_b_id)
);
create policy "friendly_matches_write_admin_involved" on friendly_matches for all using (
  is_admin_of_pelada(pelada_a_id) or is_admin_of_pelada(pelada_b_id)
);

create policy "friendly_match_goals_select_involved" on friendly_match_goals for select using (
  exists (
    select 1 from friendly_matches m where m.id = match_id
    and (is_member_of_pelada(m.pelada_a_id) or is_member_of_pelada(m.pelada_b_id))
  )
);
create policy "friendly_match_goals_write_admin_involved" on friendly_match_goals for all using (
  exists (
    select 1 from friendly_matches m where m.id = match_id
    and (is_admin_of_pelada(m.pelada_a_id) or is_admin_of_pelada(m.pelada_b_id))
  )
);

-- player_duels: só os dois jogadores envolvidos veem/editam (propor, aceitar/recusar,
-- registrar resultado — qualquer um dos dois pode registrar o resultado final).
create policy "player_duels_select_involved" on player_duels for select using (
  exists (select 1 from players p where p.id = challenger_id and p.auth_user_id = auth.uid())
  or exists (select 1 from players p where p.id = challenged_id and p.auth_user_id = auth.uid())
);
create policy "player_duels_insert_challenger" on player_duels for insert with check (
  exists (select 1 from players p where p.id = challenger_id and p.auth_user_id = auth.uid())
);
create policy "player_duels_update_involved" on player_duels for update using (
  exists (select 1 from players p where p.id = challenger_id and p.auth_user_id = auth.uid())
  or exists (select 1 from players p where p.id = challenged_id and p.auth_user_id = auth.uid())
);

-- ---------------------------------------------------------------------
-- Central do Esporte: políticas dos módulos de crescimento
-- ---------------------------------------------------------------------
create function is_chat_participant(p_channel_id uuid) returns boolean as $$
  select exists (
    select 1 from chat_participants cp
    join players p on p.id = cp.player_id
    where cp.channel_id = p_channel_id and p.auth_user_id = auth.uid()
  );
$$ language sql security definer stable set search_path = public;

create policy "scoreboards_select_members" on multi_sport_scoreboards for select using (
  exists (select 1 from games g where g.id = game_id and is_member_of_pelada(g.pelada_id))
  or exists (select 1 from players p where p.id = created_by and p.auth_user_id = auth.uid())
);
create policy "scoreboards_write_admin" on multi_sport_scoreboards for all using (
  exists (select 1 from games g where g.id = game_id and is_admin_of_pelada(g.pelada_id))
  or exists (select 1 from players p where p.id = created_by and p.auth_user_id = auth.uid())
);
create policy "scoreboard_segments_select_members" on scoreboard_segments for select using (
  exists (select 1 from multi_sport_scoreboards s where s.id = scoreboard_id and (
    exists (select 1 from games g where g.id = s.game_id and is_member_of_pelada(g.pelada_id))
    or exists (select 1 from players p where p.id = s.created_by and p.auth_user_id = auth.uid())
  ))
);
create policy "scoreboard_segments_write_admin" on scoreboard_segments for all using (
  exists (select 1 from multi_sport_scoreboards s where s.id = scoreboard_id and (
    exists (select 1 from games g where g.id = s.game_id and is_admin_of_pelada(g.pelada_id))
    or exists (select 1 from players p where p.id = s.created_by and p.auth_user_id = auth.uid())
  ))
);

create policy "chat_channels_participants" on chat_channels for select using (is_chat_participant(id));
create policy "chat_channels_create_self" on chat_channels for insert with check (
  exists (select 1 from players p where p.id = created_by and p.auth_user_id = auth.uid())
);
create policy "chat_channels_update_creator" on chat_channels for update using (
  exists (select 1 from players p where p.id = created_by and p.auth_user_id = auth.uid())
);
create policy "chat_participants_same_channel" on chat_participants for select using (is_chat_participant(channel_id));
create policy "chat_participants_manage_creator" on chat_participants for all using (
  exists (select 1 from chat_channels c join players p on p.id = c.created_by where c.id = channel_id and p.auth_user_id = auth.uid())
);
create policy "chat_messages_participants" on chat_messages for select using (is_chat_participant(channel_id));
create policy "chat_messages_send_self" on chat_messages for insert with check (
  is_chat_participant(channel_id)
  and exists (select 1 from players p where p.id = sender_player_id and p.auth_user_id = auth.uid())
  and exists (select 1 from chat_channels c where c.id = channel_id and (
    not c.admin_only_posting or exists (select 1 from chat_participants cp where cp.channel_id = c.id and cp.player_id = sender_player_id and cp.role = 'admin')
  ))
);

create policy "wallet_ledger_owner_select" on wallet_ledger for select using (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
  or (establishment_id is not null and can_operate_establishment(establishment_id))
);
create policy "wallet_ledger_operator_insert" on wallet_ledger for insert with check (
  establishment_id is not null and can_operate_establishment(establishment_id)
);

create policy "loyalty_plans_public" on loyalty_plans for select using (active or can_operate_establishment(establishment_id));
create policy "loyalty_plans_operator" on loyalty_plans for all using (can_operate_establishment(establishment_id));
create policy "loyalty_subscriptions_owner" on loyalty_subscriptions for select using (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
  or exists (select 1 from loyalty_plans lp where lp.id = plan_id and can_operate_establishment(lp.establishment_id))
);

create policy "sports_staff_public" on sports_staff for select using (true);
create policy "sports_staff_self" on sports_staff for update using (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
);
create policy "staff_assignments_involved" on staff_assignments for select using (
  can_operate_establishment(establishment_id)
  or exists (select 1 from sports_staff ss join players p on p.id = ss.player_id where ss.id = staff_id and p.auth_user_id = auth.uid())
);
create policy "staff_assignments_operator" on staff_assignments for all using (can_operate_establishment(establishment_id));

create policy "open_slot_offers_public" on open_slot_offers for select using (true);
create policy "open_slot_offers_operator" on open_slot_offers for all using (can_operate_establishment(establishment_id));

create policy "digital_waivers_authenticated" on digital_waivers for select using (auth.uid() is not null);
create policy "digital_waivers_creator" on digital_waivers for all using (
  exists (select 1 from players p where p.id = created_by and p.auth_user_id = auth.uid())
);
create policy "waiver_acceptances_self" on waiver_acceptances for select using (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
);
create policy "waiver_acceptances_insert_self" on waiver_acceptances for insert with check (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
);

create policy "sport_highlights_public" on sport_highlights for select using (true);
create policy "sport_highlights_self" on sport_highlights for insert with check (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
);

create policy "commerce_listings_public" on commerce_listings for select using (active or can_operate_establishment(establishment_id));
create policy "commerce_listings_operator" on commerce_listings for all using (can_operate_establishment(establishment_id));
create policy "rental_orders_involved" on rental_orders for select using (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
  or exists (select 1 from commerce_listings cl where cl.id = listing_id and can_operate_establishment(cl.establishment_id))
);
create policy "rental_orders_insert_self" on rental_orders for insert with check (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
);

create policy "device_push_tokens_self" on device_push_tokens for all using (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
);

-- ---------------------------------------------------------------------
-- Operação Pro: check-in, confiabilidade, temporadas, crescimento e sync
-- ---------------------------------------------------------------------
create table game_checkin_passes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  token_hash text not null,
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references players (id) on delete set null,
  unique (game_id, player_id)
);

create table reliability_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('player', 'team', 'establishment')),
  entity_id uuid not null,
  game_id uuid references games (id) on delete set null,
  kind text not null check (kind in ('checked_in', 'late', 'late_cancel', 'no_show', 'fair_play')),
  points int not null check (points between -50 and 20),
  note text,
  created_at timestamptz not null default now()
);

create table sport_seasons (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references peladas (id) on delete cascade,
  name text not null,
  sport_id text not null,
  starts_at date not null,
  ends_at date,
  status text not null default 'draft' check (status in ('draft', 'active', 'finished')),
  points_win int not null default 3,
  points_draw int not null default 1,
  points_participation int not null default 1,
  created_at timestamptz not null default now()
);

create table season_standings (
  season_id uuid not null references sport_seasons (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  games int not null default 0,
  wins int not null default 0,
  draws int not null default 0,
  losses int not null default 0,
  scored int not null default 0,
  assists int not null default 0,
  fair_play int not null default 0,
  points int not null default 0,
  primary key (season_id, player_id)
);

create table commercial_plans (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('player', 'team', 'establishment')),
  name text not null,
  monthly_price numeric(10,2) not null check (monthly_price >= 0),
  benefits jsonb not null default '[]'::jsonb,
  highlighted boolean not null default false,
  active boolean not null default true
);

create table commercial_subscriptions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references commercial_plans (id),
  subscriber_player_id uuid references players (id) on delete cascade,
  pelada_id uuid references peladas (id) on delete cascade,
  establishment_id uuid references establishments (id) on delete cascade,
  provider text,
  provider_subscription_id text unique,
  status text not null check (status in ('trial', 'active', 'past_due', 'cancelled')),
  current_period_end timestamptz not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(subscriber_player_id, pelada_id, establishment_id) = 1)
);

create table referral_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_player_id uuid not null references players (id) on delete cascade,
  code text not null unique,
  reward_credits numeric(10,2) not null default 0,
  max_uses int,
  uses int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table referral_redemptions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references referral_campaigns (id) on delete cascade,
  referred_player_id uuid not null references players (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'qualified', 'rewarded')),
  created_at timestamptz not null default now(),
  unique (referred_player_id)
);

create table moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_player_id uuid not null references players (id),
  target_type text not null check (target_type in ('player', 'team', 'establishment')),
  target_id uuid not null,
  reason text not null check (reason in ('harassment', 'fraud', 'unsafe_content', 'spam', 'other')),
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_player_id uuid references players (id) on delete set null,
  entity_type text not null check (entity_type in ('player', 'team', 'establishment', 'game', 'payment')),
  entity_id uuid not null,
  action text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Caixa de entrada idempotente usada pela fila offline-first do aplicativo.
create table client_mutations (
  id text primary key,
  auth_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  aggregate text not null,
  aggregate_id text not null,
  operation text not null,
  payload jsonb not null,
  client_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create table payment_settlements (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments (id) on delete cascade,
  source_type text not null check (source_type in ('sale', 'booking', 'fundraising', 'subscription')),
  source_id text not null,
  gross_cents int not null check (gross_cents >= 0),
  provider_fee_cents int not null default 0 check (provider_fee_cents >= 0),
  platform_fee_cents int not null default 0 check (platform_fee_cents >= 0),
  net_cents int not null check (net_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'settled', 'refunded')),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);

alter table game_checkin_passes enable row level security;
alter table reliability_events enable row level security;
alter table sport_seasons enable row level security;
alter table season_standings enable row level security;
alter table commercial_plans enable row level security;
alter table commercial_subscriptions enable row level security;
alter table referral_campaigns enable row level security;
alter table referral_redemptions enable row level security;
alter table moderation_reports enable row level security;
alter table audit_events enable row level security;
alter table client_mutations enable row level security;
alter table payment_settlements enable row level security;

create policy "checkin_pass_involved" on game_checkin_passes for select using (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
  or exists (select 1 from games g where g.id = game_id and is_admin_of_pelada(g.pelada_id))
);
create policy "checkin_pass_self_insert" on game_checkin_passes for insert with check (
  exists (select 1 from players p where p.id = player_id and p.auth_user_id = auth.uid())
);

create policy "reliability_authenticated_read" on reliability_events for select using (auth.uid() is not null);
create policy "reliability_admin_write" on reliability_events for insert with check (
  game_id is not null and exists (select 1 from games g where g.id = game_id and is_admin_of_pelada(g.pelada_id))
);

create policy "seasons_members_read" on sport_seasons for select using (is_member_of_pelada(pelada_id));
create policy "seasons_admin_write" on sport_seasons for all using (is_admin_of_pelada(pelada_id));
create policy "season_standings_members_read" on season_standings for select using (
  exists (select 1 from sport_seasons s where s.id = season_id and is_member_of_pelada(s.pelada_id))
);
create policy "season_standings_admin_write" on season_standings for all using (
  exists (select 1 from sport_seasons s where s.id = season_id and is_admin_of_pelada(s.pelada_id))
);

create policy "commercial_plans_public" on commercial_plans for select using (active);
create policy "subscriptions_involved" on commercial_subscriptions for select using (
  (subscriber_player_id is not null and exists (select 1 from players p where p.id = subscriber_player_id and p.auth_user_id = auth.uid()))
  or (pelada_id is not null and is_admin_of_pelada(pelada_id))
  or (establishment_id is not null and can_operate_establishment(establishment_id))
);

create policy "referrals_owner" on referral_campaigns for select using (
  exists (select 1 from players p where p.id = owner_player_id and p.auth_user_id = auth.uid())
);
create policy "referrals_owner_write" on referral_campaigns for insert with check (
  exists (select 1 from players p where p.id = owner_player_id and p.auth_user_id = auth.uid())
);
create policy "referral_redemptions_involved" on referral_redemptions for select using (
  exists (select 1 from players p where p.id = referred_player_id and p.auth_user_id = auth.uid())
  or exists (select 1 from referral_campaigns c join players p on p.id = c.owner_player_id where c.id = campaign_id and p.auth_user_id = auth.uid())
);

create policy "moderation_reporter_insert" on moderation_reports for insert with check (
  exists (select 1 from players p where p.id = reporter_player_id and p.auth_user_id = auth.uid())
);
create policy "moderation_reporter_read" on moderation_reports for select using (
  exists (select 1 from players p where p.id = reporter_player_id and p.auth_user_id = auth.uid())
);

create policy "audit_involved_read" on audit_events for select using (
  actor_player_id is not null and exists (select 1 from players p where p.id = actor_player_id and p.auth_user_id = auth.uid())
);

create policy "client_mutations_self" on client_mutations for all using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy "payment_settlements_operator" on payment_settlements for select using (can_operate_establishment(establishment_id));

create or replace function issue_game_checkin_pass(p_game_id uuid, p_player_id uuid, p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not exists (select 1 from players p where p.id = p_player_id and p.auth_user_id = auth.uid()) then raise exception 'not_authorized'; end if;
  if not exists (select 1 from attendances a where a.game_id = p_game_id and a.player_id = p_player_id and a.status = 'confirmed') then raise exception 'not_confirmed'; end if;
  insert into game_checkin_passes (game_id, player_id, token_hash)
  values (p_game_id, p_player_id, encode(digest(p_token, 'sha256'), 'hex'))
  on conflict (game_id, player_id) do update set token_hash = excluded.token_hash, issued_at = now(), redeemed_at = null, redeemed_by = null
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function issue_game_checkin_pass(uuid, uuid, text) to authenticated;

-- A validação real do ingresso é atômica: compara somente o hash, marca presença e
-- impede reuso. A função pode ser chamada por um admin do time do jogo.
create or replace function redeem_game_checkin(p_game_id uuid, p_player_id uuid, p_token text, p_redeemed_by uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from players p where p.id = p_redeemed_by and p.auth_user_id = auth.uid()) then
    raise exception 'invalid_actor';
  end if;
  if not exists (select 1 from games g where g.id = p_game_id and is_admin_of_pelada(g.pelada_id)) then
    raise exception 'not_authorized';
  end if;
  update game_checkin_passes
    set redeemed_at = now(), redeemed_by = p_redeemed_by
    where game_id = p_game_id and player_id = p_player_id and redeemed_at is null
      and token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then return false; end if;
  update attendances set checked_in = true, no_show = false where game_id = p_game_id and player_id = p_player_id;
  insert into reliability_events (entity_type, entity_id, game_id, kind, points, note)
    values ('player', p_player_id, p_game_id, 'checked_in', 2, 'Check-in confirmado por QR Code');
  return true;
end;
$$;
grant execute on function redeem_game_checkin(uuid, uuid, text, uuid) to authenticated;

-- Cria o perfil mínimo junto com o cadastro do Supabase Auth, inclusive quando a
-- confirmação de e-mail impede o cliente de ter sessão imediatamente.
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into players (auth_user_id, name, phone, preferred_position, favorite_sports)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1), 'Novo jogador'),
    nullif(new.raw_user_meta_data->>'phone', ''),
    case when new.raw_user_meta_data->>'preferred_position' = 'goalkeeper' then 'goalkeeper' else 'line' end,
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'favorite_sports', '["futebol"]'::jsonb))), array['futebol']::text[])
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure handle_new_auth_user();

-- Sincronização completa do cliente (detalhes na migration 20261008020000).
alter table public.players add column if not exists whatsapp_opt_in boolean not null default false;

create table if not exists public.player_preferences (
  player_id uuid primary key references public.players (id) on delete cascade,
  current_pelada_id uuid references public.peladas (id) on delete set null,
  notifications_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

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
create policy "player_preferences_self" on public.player_preferences for all
using (exists (select 1 from public.players p where p.id = player_id and p.auth_user_id = auth.uid()))
with check (exists (select 1 from public.players p where p.id = player_id and p.auth_user_id = auth.uid()));

drop policy if exists "game_team_queue_select_members" on public.game_team_queue;
create policy "game_team_queue_select_members" on public.game_team_queue for select
using (exists (select 1 from public.games g where g.id = game_id and public.is_member_of_pelada(g.pelada_id)));

drop policy if exists "game_team_queue_write_admins" on public.game_team_queue;
create policy "game_team_queue_write_admins" on public.game_team_queue for all
using (exists (select 1 from public.games g where g.id = game_id and public.is_admin_of_pelada(g.pelada_id)))
with check (exists (select 1 from public.games g where g.id = game_id and public.is_admin_of_pelada(g.pelada_id)));

alter table public.device_push_tokens drop constraint if exists device_push_tokens_platform_check;
alter table public.device_push_tokens add constraint device_push_tokens_platform_check
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
do $$
declare table_row record;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    for table_row in
      select n.nspname as schema_name, c.relname as table_name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    loop
      execute format('alter table %I.%I replica identity full', table_row.schema_name, table_row.table_name);
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = table_row.schema_name
          and tablename = table_row.table_name
      ) then
        execute format('alter publication supabase_realtime add table %I.%I', table_row.schema_name, table_row.table_name);
      end if;
    end loop;
  end if;
end
$$;

-- Escritas seguras dos módulos Pro que antes existiam apenas na demonstração local.

drop policy if exists "subscriptions_start_trial" on public.commercial_subscriptions;
create policy "subscriptions_start_trial"
  on public.commercial_subscriptions for insert
  with check (
    status = 'trial'
    and (
      (subscriber_player_id is not null and exists (
        select 1 from public.players p
        where p.id = subscriber_player_id and p.auth_user_id = auth.uid()
      ))
      or (pelada_id is not null and public.is_admin_of_pelada(pelada_id))
      or (establishment_id is not null and public.can_operate_establishment(establishment_id))
    )
  );
drop policy if exists "referrals_owner_update" on public.referral_campaigns;
create policy "referrals_owner_update"
  on public.referral_campaigns for update
  using (
    exists (
      select 1 from public.players p
      where p.id = owner_player_id and p.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.players p
      where p.id = owner_player_id and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "referral_redemptions_insert_self" on public.referral_redemptions;
create policy "referral_redemptions_insert_self"
  on public.referral_redemptions for insert
  with check (
    status = 'pending'
    and exists (
      select 1 from public.players p
      where p.id = referred_player_id and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "moderation_reporter_update" on public.moderation_reports;
create policy "moderation_reporter_update"
  on public.moderation_reports for update
  using (
    exists (
      select 1 from public.players p
      where p.id = reporter_player_id and p.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.players p
      where p.id = reporter_player_id and p.auth_user_id = auth.uid()
    )
  );

drop policy if exists "audit_actor_insert" on public.audit_events;
create policy "audit_actor_insert"
  on public.audit_events for insert
  with check (
    actor_player_id is not null
    and exists (
      select 1 from public.players p
      where p.id = actor_player_id and p.auth_user_id = auth.uid()
    )
  );

-- Source: migrations/20261010000000_platform_console.sql
-- Console da plataforma. Nenhum papel é concedido por cadastro/user_metadata.
create table public.platform_admin_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'support')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.platform_configuration (
  id boolean primary key default true check (id),
  revision integer not null default 1,
  settings jsonb not null default '{"discoveryEnabled":true,"referralsEnabled":true,"sponsoredEnabled":false,"bookingCommissionPercent":0,"whatsappMonthlyAllowance":100,"trialDays":14}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.platform_configuration(id) values (true);
create table public.platform_account_controls (
  player_id uuid primary key references public.players(id) on delete cascade,
  suspended boolean not null default false,
  reason text not null,
  updated_at timestamptz not null default now()
);
create table public.platform_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_id text,
  reason text not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);
alter table public.platform_admin_accounts enable row level security;
alter table public.platform_configuration enable row level security;
alter table public.platform_account_controls enable row level security;
alter table public.platform_admin_audit enable row level security;
revoke all on public.platform_admin_accounts, public.platform_account_controls, public.platform_admin_audit from anon, authenticated;
grant select on public.platform_configuration to anon, authenticated;
create policy platform_configuration_read on public.platform_configuration for select using (true);

create function public.platform_account_allowed() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and not exists (
    select 1 from public.platform_account_controls c join public.players p on p.id = c.player_id
    where p.auth_user_id = auth.uid() and c.suspended
  );
$$;
create function public.platform_admin_role() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.platform_admin_accounts
  where auth_user_id = auth.uid() and active and public.platform_account_allowed();
$$;
revoke all on function public.platform_account_allowed(), public.platform_admin_role() from public;
grant execute on function public.platform_account_allowed(), public.platform_admin_role() to authenticated;

-- Um token antigo de conta suspensa não continua escrevendo nas tabelas do app.
do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and c.relname not like 'platform_%'
  loop
    execute format('create policy platform_active_account on public.%I as restrictive for all to authenticated using (public.platform_account_allowed()) with check (public.platform_account_allowed())', t.relname);
  end loop;
end $$;

-- Resolução de denúncia é exclusiva de um moderador da plataforma.
drop policy if exists moderation_reporter_update on public.moderation_reports;

create function public.platform_console_snapshot(p_query text default '') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare admin_role text; result jsonb; q text := left(coalesce(p_query, ''), 80);
begin
  admin_role := public.platform_admin_role();
  if admin_role is null then raise exception 'Acesso exclusivo da administração da plataforma' using errcode = '42501'; end if;
  select jsonb_build_object(
    'role', admin_role,
    'configuration', (select jsonb_build_object('revision', revision, 'settings', settings) from public.platform_configuration where id),
    'metrics', jsonb_build_object(
      'players', (select count(*) from public.players where not is_guest),
      'teams', (select count(*) from public.peladas),
      'establishments', (select count(*) from public.establishments),
      'upcomingGames', (select count(*) from public.games where scheduled_at >= now() and status not in ('cancelled','finished')),
      'openReports', (select count(*) from public.moderation_reports where status in ('open','reviewing')),
      'activeSubscriptions', (select count(*) from public.commercial_subscriptions where status = 'active' and current_period_end > now())
    ),
    'players', coalesce((select jsonb_agg(x) from (
      select p.id, p.name, p.nickname, p.auth_user_id as "authUserId", p.created_at as "createdAt", coalesce(c.suspended,false) as suspended
      from public.players p left join public.platform_account_controls c on c.player_id = p.id
      where not p.is_guest and (q = '' or p.name ilike '%' || q || '%' or p.nickname ilike '%' || q || '%')
      order by p.created_at desc limit 100
    ) x), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(x) from (
      select id, name, sport_id as "sportId", created_at as "createdAt" from public.peladas
      where q = '' or name ilike '%' || q || '%' order by created_at desc limit 100
    ) x), '[]'::jsonb),
    'establishments', coalesce((select jsonb_agg(x) from (
      select e.id, e.name, e.owner_player_id as "ownerPlayerId", (select count(*) from public.fields f where f.establishment_id = e.id) as "fieldCount"
      from public.establishments e where q = '' or e.name ilike '%' || q || '%' order by e.created_at desc limit 100
    ) x), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'audience',audience,'monthlyPrice',monthly_price,'benefits',benefits,'highlighted',highlighted,'active',active)) from public.commercial_plans), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(x) from (
      select id, target_id as "targetId", target_type as "targetType", reason, details, status, created_at as "createdAt"
      from public.moderation_reports order by created_at desc limit 100
    ) x), '[]'::jsonb),
    'admins', case when admin_role = 'owner' then coalesce((select jsonb_agg(jsonb_build_object('authUserId',a.auth_user_id,'name',coalesce(p.name,'Conta cadastrada'),'role',a.role,'active',a.active)) from public.platform_admin_accounts a left join public.players p on p.auth_user_id = a.auth_user_id),'[]'::jsonb) else '[]'::jsonb end,
    'audit', coalesce((select jsonb_agg(x) from (
      select id, action, target_id as "targetId", reason, created_at as "createdAt" from public.platform_admin_audit order by created_at desc limit 100
    ) x), '[]'::jsonb)
  ) into result;
  return result;
end $$;

create function public.platform_console_action(p_action text, p_id uuid, p_payload jsonb, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare admin_role text; previous jsonb; changed jsonb; config public.platform_configuration; target_player public.players; requested_role text;
begin
  admin_role := public.platform_admin_role();
  if admin_role is null then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason,''))) < 8 then raise exception 'Informe um motivo com pelo menos 8 caracteres'; end if;
  if p_action is null or jsonb_typeof(p_payload) is distinct from 'object' or p_action not in ('report','settings','plan','account','admin') then raise exception 'Ação não permitida'; end if;
  if admin_role = 'support' and p_action <> 'report' then raise exception 'Suporte só pode tratar denúncias' using errcode = '42501'; end if;
  if p_action = 'settings' then
    select * into config from public.platform_configuration where id for update;
    if (p_payload->>'revision')::integer is distinct from config.revision then raise exception 'Configuração mudou. Atualize antes de salvar.' using errcode = '40001'; end if;
    changed := p_payload->'settings';
    if jsonb_typeof(changed) is distinct from 'object' then raise exception 'Configuração inválida'; end if;
    if (select count(*) from jsonb_object_keys(changed)) <> 6
      or not changed ?& array['discoveryEnabled','referralsEnabled','sponsoredEnabled','bookingCommissionPercent','whatsappMonthlyAllowance','trialDays']
      or jsonb_typeof(changed->'discoveryEnabled') is distinct from 'boolean' or jsonb_typeof(changed->'referralsEnabled') is distinct from 'boolean' or jsonb_typeof(changed->'sponsoredEnabled') is distinct from 'boolean'
      or jsonb_typeof(changed->'bookingCommissionPercent') is distinct from 'number' or (changed->>'bookingCommissionPercent')::numeric not between 0 and 20
      or jsonb_typeof(changed->'whatsappMonthlyAllowance') is distinct from 'number' or (changed->>'whatsappMonthlyAllowance')::numeric not between 0 and 10000
      or jsonb_typeof(changed->'trialDays') is distinct from 'number' or (changed->>'trialDays')::numeric not between 1 and 30
      or (changed->>'trialDays')::numeric <> trunc((changed->>'trialDays')::numeric)
      or (changed->>'whatsappMonthlyAllowance')::numeric <> trunc((changed->>'whatsappMonthlyAllowance')::numeric)
    then raise exception 'Configuração inválida'; end if;
    previous := config.settings;
    update public.platform_configuration set settings = changed, revision = revision + 1, updated_at = now() where id;
  elsif p_action = 'plan' then
    select to_jsonb(p) into previous from public.commercial_plans p where id = p_id for update;
    if previous is null then raise exception 'Plano não encontrado'; end if;
    if jsonb_typeof(p_payload->'monthlyPrice') is distinct from 'number' or (p_payload->>'monthlyPrice')::numeric not between 0 and 10000
      or length(trim(coalesce(p_payload->>'name',''))) not between 3 and 80 or jsonb_typeof(p_payload->'active') is distinct from 'boolean'
    then raise exception 'Nome, preço ou estado inválidos'; end if;
    update public.commercial_plans set name = trim(p_payload->>'name'), monthly_price = (p_payload->>'monthlyPrice')::numeric, active = (p_payload->>'active')::boolean where id = p_id returning to_jsonb(commercial_plans.*) into changed;
  elsif p_action = 'report' then
    if coalesce(p_payload->>'status','') not in ('reviewing','resolved','dismissed') then raise exception 'Estado de denúncia inválido'; end if;
    select to_jsonb(r) into previous from public.moderation_reports r where id = p_id for update;
    if previous is null then raise exception 'Denúncia não encontrada'; end if;
    update public.moderation_reports set status = p_payload->>'status', resolved_at = case when p_payload->>'status' in ('resolved','dismissed') then now() else null end where id = p_id returning to_jsonb(moderation_reports.*) into changed;
  elsif p_action = 'account' then
    select * into target_player from public.players where id = p_id;
    if target_player.id is null then raise exception 'Conta não encontrada'; end if;
    if exists (select 1 from public.platform_admin_accounts where auth_user_id = target_player.auth_user_id and active) then raise exception 'Revogue o papel administrativo antes de suspender a conta'; end if;
    if jsonb_typeof(p_payload->'suspended') is distinct from 'boolean' then raise exception 'Estado inválido'; end if;
    select to_jsonb(c) into previous from public.platform_account_controls c where player_id = p_id for update;
    insert into public.platform_account_controls(player_id,suspended,reason) values (p_id,(p_payload->>'suspended')::boolean,trim(p_reason))
      on conflict(player_id) do update set suspended = excluded.suspended, reason = excluded.reason, updated_at = now() returning to_jsonb(platform_account_controls.*) into changed;
  elsif p_action = 'admin' then
    if admin_role <> 'owner' then raise exception 'Só o proprietário gerencia administradores' using errcode = '42501'; end if;
    -- Serializa revogações concorrentes para não remover todos os proprietários.
    perform 1 from public.platform_admin_accounts order by auth_user_id for update;
    requested_role := p_payload->>'role';
    if requested_role not in ('owner','admin','support') or requested_role is null or jsonb_typeof(p_payload->'active') is distinct from 'boolean' then raise exception 'Papel inválido'; end if;
    if not exists (select 1 from auth.users where id = p_id) then raise exception 'A conta deve existir no Supabase Auth'; end if;
    if exists (select 1 from public.platform_account_controls c join public.players p on p.id = c.player_id where p.auth_user_id = p_id and c.suspended) then raise exception 'Reative a conta antes de conceder um papel'; end if;
    select to_jsonb(a) into previous from public.platform_admin_accounts a where auth_user_id = p_id;
    if previous->>'role' = 'owner' and (requested_role <> 'owner' or not (p_payload->>'active')::boolean)
      and (select count(*) from public.platform_admin_accounts where role = 'owner' and active) <= 1 then raise exception 'A plataforma precisa manter um proprietário ativo'; end if;
    insert into public.platform_admin_accounts(auth_user_id,role,active) values(p_id,requested_role,(p_payload->>'active')::boolean)
      on conflict(auth_user_id) do update set role = excluded.role, active = excluded.active returning to_jsonb(platform_admin_accounts.*) into changed;
  end if;
  insert into public.platform_admin_audit(actor_auth_user_id,action,target_id,reason,before_value,after_value)
    values(auth.uid(),p_action,p_id::text,trim(p_reason),previous,changed);
end $$;
revoke all on function public.platform_console_snapshot(text), public.platform_console_action(text,uuid,jsonb,text) from public;
grant execute on function public.platform_console_snapshot(text), public.platform_console_action(text,uuid,jsonb,text) to authenticated;

create function public.can_receive_establishment_payment(p_establishment_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.platform_account_allowed() and (
    public.is_establishment_owner(p_establishment_id) or exists (
      select 1 from public.establishment_staff s join public.players p on p.id = s.player_id
      where s.establishment_id = p_establishment_id and s.active and s.roles && array['manager','cashier']::text[] and p.auth_user_id = auth.uid()
    )
  );
$$;
revoke all on function public.can_receive_establishment_payment(uuid) from public;
grant execute on function public.can_receive_establishment_payment(uuid) to authenticated;

-- Guarda de campos financeiros da aula: o aluno não dá baixa no próprio Pix.
create function public.guard_class_enrollment_payment() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare establishment_id uuid; price_now numeric;
begin
  if auth.role() = 'service_role' or auth.uid() is null then return new; end if;
  select cp.establishment_id,cp.price into establishment_id,price_now from public.class_sessions cs join public.class_programs cp on cp.id = cs.program_id where cs.id = new.session_id;
  if tg_op = 'INSERT' then
    if not public.can_receive_establishment_payment(establishment_id) and (new.amount is distinct from price_now or new.is_trial or new.paid_at is not null or new.payment_method is not null) then raise exception 'Valor/isenção da aula precisa ser autorizado pela operação'; end if;
    if new.payment_status <> 'pending' and not public.can_receive_establishment_payment(establishment_id) then raise exception 'Somente a operação confirma dispensa/pagamento'; end if;
    if new.payment_status in ('paid','refunded') then raise exception 'Pagamento online/reembolso exige confirmação do provedor'; end if;
  elsif new.payment_status is distinct from old.payment_status or new.paid_at is distinct from old.paid_at or new.amount is distinct from old.amount or new.payment_method is distinct from old.payment_method then
    if not public.can_receive_establishment_payment(establishment_id) then raise exception 'Dados financeiros são gerenciados pelo estabelecimento'; end if;
    if new.payment_status = 'paid' and new.payment_method not in ('cash') then raise exception 'Pix/cartão exige confirmação pelo provedor'; end if;
    if new.payment_status = 'refunded' then raise exception 'Reembolso exige confirmação pelo provedor'; end if;
  end if;
  return new;
end $$;
create trigger class_payment_verified before insert or update on public.class_enrollments for each row execute function public.guard_class_enrollment_payment();

-- Cliente não inventa testes ilimitados, benefícios Premium ou conexão OAuth.
drop policy if exists subscriptions_start_trial on public.commercial_subscriptions;
create function public.guard_player_premium() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or auth.role() = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    if new.premium_until is not null or new.premium_since is not null or new.premium_auto_renew then raise exception 'Premium exige confirmação da loja'; end if;
  elsif new.premium_until is distinct from old.premium_until or new.premium_since is distinct from old.premium_since or new.premium_auto_renew is distinct from old.premium_auto_renew then raise exception 'Premium exige confirmação da loja'; end if;
  return new;
end $$;
create trigger player_premium_verified before insert or update on public.players for each row execute function public.guard_player_premium();

create function public.guard_gateway_connection() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or auth.role() = 'service_role' then return new; end if;
  if new.provider <> 'manual_pix' then
    if tg_op = 'INSERT' or new is distinct from old then raise exception 'Conexão de gateway é confirmada pelo provedor no backend'; end if;
  elsif new.credential_secret_id is not null or new.card_enabled or new.contactless_enabled then raise exception 'Pix manual não possui credencial ou cartão'; end if;
  return new;
end $$;
create trigger gateway_connection_verified before insert or update on public.payment_gateway_connections for each row execute function public.guard_gateway_connection();

-- Source: migrations/20261010010000_open_game_discovery.sql
-- Divulgação opt-in: nunca transforma automaticamente uma pelada privada em pública.
create table public.public_game_listings (
  game_id uuid primary key references public.games(id) on delete cascade,
  published boolean not null default false,
  level text not null default 'all' check (level in ('all','beginner','intermediate','advanced')),
  description text not null default '' check (length(description) <= 500),
  updated_at timestamptz not null default now()
);
create table public.public_game_join_requests (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique(game_id,player_id)
);
alter table public.public_game_listings enable row level security;
alter table public.public_game_join_requests enable row level security;
revoke all on public.public_game_listings, public.public_game_join_requests from anon, authenticated;

create function public.publish_open_game(p_game_id uuid, p_published boolean, p_level text, p_description text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare g public.games;
begin
  select * into g from public.games where id = p_game_id;
  if not public.platform_account_allowed() or not public.is_admin_of_pelada(g.pelada_id) then raise exception 'Somente o administrador deste time publica o jogo' using errcode = '42501'; end if;
  if p_level not in ('all','beginner','intermediate','advanced') or p_level is null or p_published is null or length(coalesce(p_description,'')) > 500 then raise exception 'Publicação inválida'; end if;
  if p_published and (g.scheduled_at <= now() or g.status not in ('open','full')) then raise exception 'Só jogos futuros com chamada aberta podem ser publicados'; end if;
  insert into public.public_game_listings(game_id,published,level,description) values(p_game_id,p_published,p_level,coalesce(p_description,''))
    on conflict(game_id) do update set published = excluded.published, level = excluded.level, description = excluded.description, updated_at = now();
end $$;

create function public.list_open_games(p_sport text default null, p_query text default '') returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.platform_account_allowed() then raise exception 'Entre com uma conta ativa para descobrir jogos' using errcode = '42501'; end if;
  if not coalesce((select (settings->>'discoveryEnabled')::boolean from public.platform_configuration where id),false) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row) from (
    select g.id as "gameId", p.name as "teamName", p.sport_id as "sportId", f.name as "fieldName", f.address,
      g.scheduled_at as "scheduledAt", g.duration_minutes as "durationMinutes", g.max_players as "maxPlayers", g.field_cost as "fieldCost", l.level, l.description,
      (select count(*) from public.attendances a where a.game_id = g.id and a.status = 'confirmed') as "confirmedCount",
      (select r.status from public.public_game_join_requests r join public.players me on me.id = r.player_id where r.game_id = g.id and me.auth_user_id = auth.uid()) as "requestStatus"
    from public.public_game_listings l join public.games g on g.id = l.game_id join public.peladas p on p.id = g.pelada_id join public.fields f on f.id = g.field_id
    where l.published and g.status in ('open','full') and g.scheduled_at > now()
      and (p_sport is null or p.sport_id = p_sport)
      and (coalesce(p_query,'') = '' or p.name ilike '%'||left(p_query,80)||'%' or f.name ilike '%'||left(p_query,80)||'%' or f.address ilike '%'||left(p_query,80)||'%')
    order by g.scheduled_at limit 100
  ) row),'[]'::jsonb);
end $$;

create function public.request_open_game(p_game_id uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare me_player_id uuid; g public.games; request_status text;
begin
  if not public.platform_account_allowed() or not coalesce((select (settings->>'discoveryEnabled')::boolean from public.platform_configuration where id),false) then raise exception 'Solicitações indisponíveis'; end if;
  select id into me_player_id from public.players where auth_user_id = auth.uid();
  if me_player_id is null then raise exception 'Complete seu perfil antes de solicitar'; end if;
  select * into g from public.games where id = p_game_id;
  if not exists(select 1 from public.public_game_listings where game_id = p_game_id and published) or g.scheduled_at <= now() or g.status not in ('open','full') then raise exception 'Jogo indisponível'; end if;
  if exists(select 1 from public.attendances a where a.game_id = p_game_id and a.player_id = me_player_id and a.status in ('confirmed','waitlist')) then raise exception 'Você já está na chamada deste jogo'; end if;
  insert into public.public_game_join_requests(game_id,player_id) values(p_game_id,me_player_id)
    on conflict(game_id,player_id) do nothing;
  select r.status into request_status from public.public_game_join_requests r where r.game_id = p_game_id and r.player_id = me_player_id;
  return request_status;
end $$;

create function public.open_game_admin_data(p_game_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.platform_account_allowed() or not exists(select 1 from public.games g where g.id = p_game_id and public.is_admin_of_pelada(g.pelada_id)) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return jsonb_build_object(
    'listing', (select jsonb_build_object('published',published,'level',level,'description',description) from public.public_game_listings where game_id = p_game_id),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'playerId',r.player_id,'name',p.name,'status',r.status)) from public.public_game_join_requests r join public.players p on p.id = r.player_id where r.game_id = p_game_id),'[]'::jsonb)
  );
end $$;

create function public.respond_open_game_request(p_request_id uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.public_game_join_requests; g public.games; target_status text; occupied integer;
begin
  select * into r from public.public_game_join_requests where id = p_request_id;
  if r.id is null or p_accept is null then raise exception 'Solicitação inválida'; end if;
  select * into g from public.games where id = r.game_id for update;
  -- Todas as aprovações deste jogo são serializadas pelo lock da partida.
  select * into r from public.public_game_join_requests where id = p_request_id for update;
  if not public.platform_account_allowed() or not public.is_admin_of_pelada(g.pelada_id) then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if r.status <> 'pending' then return r.status; end if;
  if not p_accept then update public.public_game_join_requests set status = 'declined' where id = r.id; return 'declined'; end if;
  if g.scheduled_at <= now() or g.status not in ('open','full') then raise exception 'Chamada encerrada'; end if;
  if exists(select 1 from public.platform_account_controls where player_id = r.player_id and suspended) then raise exception 'Conta suspensa'; end if;
  select status into target_status from public.attendances where game_id = g.id and player_id = r.player_id and status in ('confirmed','waitlist');
  if target_status is null then
    select count(*) into occupied from public.attendances where game_id = g.id and status = 'confirmed';
    target_status := case when occupied < g.max_players then 'confirmed' else 'waitlist' end;
  end if;
  insert into public.pelada_memberships(pelada_id,player_id,role,active) values(g.pelada_id,r.player_id,'member',true)
    on conflict(pelada_id,player_id) do update set active = true;
  insert into public.attendances(game_id,player_id,status,confirmed_order) values(g.id,r.player_id,target_status,(select coalesce(max(confirmed_order),0)+1 from public.attendances where game_id = g.id))
    on conflict(game_id,player_id) do update set status = excluded.status, confirmed_order = excluded.confirmed_order;
  update public.public_game_join_requests set status = 'accepted' where id = r.id;
  return target_status;
end $$;
revoke all on function public.publish_open_game(uuid,boolean,text,text), public.list_open_games(text,text), public.request_open_game(uuid), public.open_game_admin_data(uuid), public.respond_open_game_request(uuid,boolean) from public;
grant execute on function public.publish_open_game(uuid,boolean,text,text), public.list_open_games(text,text), public.request_open_game(uuid), public.open_game_admin_data(uuid), public.respond_open_game_request(uuid,boolean) to authenticated;

-- Source: migrations/20261010020000_dynamic_sports.sql
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

-- Source: migrations/20261010030000_checkin_crypto_search_path.sql
alter function public.issue_game_checkin_pass(uuid,uuid,text) set search_path = public, extensions, pg_temp;
alter function public.redeem_game_checkin(uuid,uuid,text,uuid) set search_path = public, extensions, pg_temp;

-- Source: migrations/20261010040000_commercial_agreements.sql
-- Licenças gratuitas e ofertas individuais não são pagamentos nem papéis admin.
create table public.platform_commercial_agreements (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('player','team','establishment')),
  target_id uuid not null,
  plan_id uuid not null references public.commercial_plans(id),
  kind text not null check (kind in ('license','discount','price')),
  status text not null check (status in ('granted','offered','accepted','declined','revoked')),
  list_monthly_price numeric(12,2) not null check (list_monthly_price >= 0),
  agreed_monthly_price numeric(12,2) not null check (agreed_monthly_price between 0 and 10000),
  discount_percent numeric(5,2),
  duration_months integer,
  expires_at timestamptz,
  note text not null default '' check (length(note) <= 500),
  revision integer not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  responded_by uuid references auth.users(id),
  responded_at timestamptz,
  revoked_at timestamptz,
  check ((kind='license' and agreed_monthly_price=0 and discount_percent is null and duration_months is null and status in ('granted','revoked'))
    or (kind in ('discount','price') and agreed_monthly_price>0 and duration_months between 1 and 36 and expires_at is not null and status in ('offered','accepted','declined','revoked'))),
  check ((kind='discount' and discount_percent>0 and discount_percent<100) or (kind<>'discount' and discount_percent is null))
);
create index commercial_agreements_target on public.platform_commercial_agreements(audience,target_id,status);
alter table public.platform_commercial_agreements enable row level security;
revoke all on public.platform_commercial_agreements from anon,authenticated;

create function public.commercial_target_manager(p_audience text,p_target uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select public.platform_account_allowed() and case p_audience
    when 'player' then exists(select 1 from public.players where id=p_target and auth_user_id=auth.uid() and not is_guest)
    when 'team' then exists(select 1 from public.pelada_memberships m join public.players p on p.id=m.player_id where m.pelada_id=p_target and m.active and m.role='admin' and p.auth_user_id=auth.uid())
    when 'establishment' then exists(select 1 from public.establishments e join public.players p on p.id=e.owner_player_id where e.id=p_target and p.auth_user_id=auth.uid())
    else false end;
$$;
create function public.commercial_target_member(p_audience text,p_target uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select public.commercial_target_manager(p_audience,p_target) or (public.platform_account_allowed() and case p_audience
    when 'team' then exists(select 1 from public.pelada_memberships m join public.players p on p.id=m.player_id where m.pelada_id=p_target and m.active and p.auth_user_id=auth.uid())
    when 'establishment' then exists(select 1 from public.establishment_staff s join public.players p on p.id=s.player_id where s.establishment_id=p_target and s.active and p.auth_user_id=auth.uid())
    else false end);
$$;

create function public.commercial_agreement_json(a public.platform_commercial_agreements) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
  select jsonb_build_object('id',a.id,'audience',a.audience,'targetId',a.target_id,'planId',a.plan_id,'kind',a.kind,'status',a.status,
    'listMonthlyPrice',a.list_monthly_price,'agreedMonthlyPrice',a.agreed_monthly_price,'discountPercent',a.discount_percent,
    'durationMonths',a.duration_months,'expiresAt',a.expires_at,'note',a.note,'revision',a.revision,'createdAt',a.created_at,'respondedAt',a.responded_at);
$$;

create function public.save_commercial_agreement(p_payload jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.platform_commercial_agreements; plan public.commercial_plans; expiry timestamptz; value_now numeric; percentage numeric; months integer; target uuid; kind_now text;
begin
  if public.platform_admin_role() is distinct from 'owner' then raise exception 'Somente o proprietário concede condições comerciais' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,''))) not between 8 and 1000 then raise exception 'Informe um motivo entre 8 e 1000 caracteres'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Condição inválida'; end if;
  select * into plan from public.commercial_plans where id=(p_payload->>'planId')::uuid and active for share;
  if plan.id is null or plan.audience is distinct from p_payload->>'audience' then raise exception 'Plano e destinatário incompatíveis'; end if;
  target := (p_payload->>'targetId')::uuid; kind_now := p_payload->>'kind';
  if target is null or kind_now is null or kind_now not in ('license','discount','price') then raise exception 'Destinatário ou modalidade inválidos'; end if;
  if not (case plan.audience
    when 'player' then exists(select 1 from public.players p where p.id=target and not p.is_guest and p.auth_user_id is not null and not exists(select 1 from public.platform_account_controls c where c.player_id=p.id and c.suspended))
    when 'team' then exists(select 1 from public.peladas where id=target)
    when 'establishment' then exists(select 1 from public.establishments where id=target)
    else false end) then raise exception 'Destinatário não encontrado ou indisponível'; end if;
  expiry := nullif(p_payload->>'expiresAt','')::timestamptz;
  if expiry is not null and (expiry<=now() or expiry>now()+interval '10 years') then raise exception 'Prazo deve ser futuro e de até 10 anos'; end if;
  if length(coalesce(p_payload->>'note',''))>500 then raise exception 'Observação muito longa'; end if;
  if kind_now='license' then value_now:=0;
  else
    if expiry is null then raise exception 'Oferta precisa de prazo para resposta'; end if;
    if jsonb_typeof(p_payload->'durationMonths') is distinct from 'number' or (p_payload->>'durationMonths')::numeric<>trunc((p_payload->>'durationMonths')::numeric) then raise exception 'Duração inválida'; end if;
    months:=(p_payload->>'durationMonths')::integer;
    if months not between 1 and 36 then raise exception 'Duração de 1 a 36 mensalidades'; end if;
    if kind_now='discount' then
      if jsonb_typeof(p_payload->'discountPercent') is distinct from 'number' then raise exception 'Desconto inválido'; end if;
      percentage:=(p_payload->>'discountPercent')::numeric;
      if percentage<=0 or percentage>=100 or percentage<>round(percentage,2) then raise exception 'Desconto entre 0 e 100%%; para gratuidade use licença'; end if;
      value_now:=round(plan.monthly_price*(1-percentage/100),2);
    else
      if jsonb_typeof(p_payload->'agreedMonthlyPrice') is distinct from 'number' then raise exception 'Preço inválido'; end if;
      value_now:=(p_payload->>'agreedMonthlyPrice')::numeric;
    end if;
    if value_now<=0 or value_now>10000 or value_now<>round(value_now,2) then raise exception 'Preço deve ser positivo, em centavos, até R$ 10.000'; end if;
  end if;
  insert into public.platform_commercial_agreements(audience,target_id,plan_id,kind,status,list_monthly_price,agreed_monthly_price,discount_percent,duration_months,expires_at,note,created_by)
    values(plan.audience,target,plan.id,kind_now,case when kind_now='license' then 'granted' else 'offered' end,plan.monthly_price,value_now,percentage,months,expiry,coalesce(p_payload->>'note',''),auth.uid()) returning * into a;
  insert into public.platform_admin_audit(actor_auth_user_id,action,target_id,reason,after_value)
    values(auth.uid(),'commercial.grant',a.id::text,trim(p_reason),to_jsonb(a));
  return a.id;
end $$;

create function public.revoke_commercial_agreement(p_id uuid,p_revision integer,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.platform_commercial_agreements; before_now jsonb;
begin
  if public.platform_admin_role() is distinct from 'owner' then raise exception 'Somente o proprietário revoga condições comerciais' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,''))) not between 8 and 1000 then raise exception 'Informe um motivo entre 8 e 1000 caracteres'; end if;
  select * into a from public.platform_commercial_agreements where id=p_id for update;
  if a.id is null then raise exception 'Condição não encontrada'; end if;
  if a.revision is distinct from p_revision then raise exception 'Condição alterada. Atualize a página' using errcode='40001'; end if;
  if a.status='revoked' then return; end if;
  before_now:=to_jsonb(a);
  update public.platform_commercial_agreements set status='revoked',revoked_at=now(),revision=revision+1 where id=p_id returning * into a;
  insert into public.platform_admin_audit(actor_auth_user_id,action,target_id,reason,before_value,after_value)
    values(auth.uid(),'commercial.revoke',a.id::text,trim(p_reason),before_now,to_jsonb(a));
end $$;

create function public.respond_commercial_agreement(p_id uuid,p_revision integer,p_accept boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.platform_commercial_agreements; before_now jsonb;
begin
  select * into a from public.platform_commercial_agreements where id=p_id for update;
  if a.id is null or not public.commercial_target_manager(a.audience,a.target_id) then raise exception 'Você não representa este destinatário' using errcode='42501'; end if;
  if p_accept is null then raise exception 'Resposta inválida'; end if;
  if a.revision is distinct from p_revision then raise exception 'Condição alterada. Atualize a página' using errcode='40001'; end if;
  if a.status<>'offered' or a.expires_at<=now() then raise exception 'Oferta não está disponível'; end if;
  before_now:=to_jsonb(a);
  update public.platform_commercial_agreements set status=case when p_accept then 'accepted' else 'declined' end,responded_by=auth.uid(),responded_at=now(),revision=revision+1 where id=p_id returning * into a;
  insert into public.platform_admin_audit(actor_auth_user_id,action,target_id,reason,before_value,after_value)
    values(auth.uid(),'commercial.response',a.id::text,case when p_accept then 'Oferta aceita pelo destinatário; aguardando contratação e pagamento' else 'Oferta recusada pelo destinatário' end,before_now,to_jsonb(a));
  -- Não ativa plano, não credita carteira nem registra pagamento.
end $$;

create function public.commercial_admin_data() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if public.platform_admin_role() is distinct from 'owner' then raise exception 'Somente o proprietário consulta negociações globais' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(public.commercial_agreement_json(a)) from (select * from public.platform_commercial_agreements order by created_at desc limit 200) a),'[]'::jsonb);
end $$;
create function public.commercial_access_snapshot() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.platform_account_allowed() then raise exception 'Sessão indisponível' using errcode='42501'; end if;
  return jsonb_build_object('role',public.platform_admin_role(),
    'licenses',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'audience',a.audience,'targetId',a.target_id,'planId',a.plan_id,'expiresAt',a.expires_at))
      from public.platform_commercial_agreements a where a.kind='license' and a.status='granted' and (a.expires_at is null or a.expires_at>now()) and public.commercial_target_member(a.audience,a.target_id)),'[]'::jsonb),
    'agreements',coalesce((select jsonb_agg(public.commercial_agreement_json(a)) from public.platform_commercial_agreements a where public.commercial_target_manager(a.audience,a.target_id)),'[]'::jsonb));
end $$;
revoke all on function public.commercial_agreement_json(public.platform_commercial_agreements), public.commercial_target_manager(text,uuid), public.commercial_target_member(text,uuid), public.save_commercial_agreement(jsonb,text), public.revoke_commercial_agreement(uuid,integer,text), public.respond_commercial_agreement(uuid,integer,boolean), public.commercial_admin_data(), public.commercial_access_snapshot() from public;
grant execute on function public.save_commercial_agreement(jsonb,text), public.revoke_commercial_agreement(uuid,integer,text), public.respond_commercial_agreement(uuid,integer,boolean), public.commercial_admin_data(), public.commercial_access_snapshot() to authenticated;

-- Source: migrations/20261010050000_commercial_quote_guard.sql
-- Repetir uma confirmação não cria outra licença; revisão de preço não muda a oferta silenciosamente.
alter table public.platform_commercial_agreements add column request_id uuid unique;
alter table public.platform_commercial_agreements add column request_payload jsonb;
alter function public.save_commercial_agreement(jsonb,text) rename to save_commercial_agreement_internal;
revoke all on function public.save_commercial_agreement_internal(jsonb,text) from public,anon,authenticated;
create function public.save_commercial_agreement(p_payload jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare request_now uuid; existing public.platform_commercial_agreements; plan_price numeric; agreement_id uuid; request_data jsonb;
begin
  if public.platform_admin_role() is distinct from 'owner' then raise exception 'Somente o proprietário concede condições comerciais' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or length(trim(coalesce(p_reason,''))) not between 8 and 1000 then raise exception 'Condição ou motivo inválidos'; end if;
  request_now:=(p_payload->>'requestId')::uuid;
  if request_now is null then raise exception 'Confirmação precisa de identificador único'; end if;
  request_data:=jsonb_build_object('payload',p_payload,'reason',trim(p_reason));
  perform pg_advisory_xact_lock(hashtextextended(request_now::text,0));
  select * into existing from public.platform_commercial_agreements where request_id=request_now;
  if existing.id is not null then
    if existing.created_by<>auth.uid() or existing.request_payload is distinct from request_data then raise exception 'Confirmação já usada para outra condição'; end if;
    return existing.id;
  end if;
  select monthly_price into plan_price from public.commercial_plans where id=(p_payload->>'planId')::uuid and active for share;
  if jsonb_typeof(p_payload->'expectedMonthlyPrice') is distinct from 'number' or (p_payload->>'expectedMonthlyPrice')::numeric is distinct from plan_price then
    raise exception 'Preço do catálogo mudou. Atualize e revise a oferta' using errcode='40001';
  end if;
  agreement_id:=public.save_commercial_agreement_internal(p_payload,p_reason);
  update public.platform_commercial_agreements set request_id=request_now,request_payload=request_data where id=agreement_id;
  return agreement_id;
end $$;
revoke all on function public.save_commercial_agreement(jsonb,text) from public;
grant execute on function public.save_commercial_agreement(jsonb,text) to authenticated;

-- Source: 20261010060000_growth_flows.sql
-- Crescimento: consentimento, horários reais e cadastro assistido sem impersonação.
create table public.assisted_venues (
  establishment_id uuid primary key references public.establishments(id) on delete cascade,
  prepared_by uuid not null references auth.users(id),
  target_player_id uuid references public.players(id),
  status text not null default 'draft' check(status in ('draft','invited','accepted','declined')),
  revision integer not null default 1,
  created_at timestamptz not null default now()
);
create table public.buddy_invites (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  host_player_id uuid not null references public.players(id),
  buddy_player_id uuid references public.players(id),
  code uuid not null unique default gen_random_uuid(),
  status text not null default 'invited' check(status in ('invited','pending','accepted','declined','cancelled')),
  expires_at timestamptz not null default now()+interval '24 hours',
  created_at timestamptz not null default now()
);
create unique index buddy_active_host on public.buddy_invites(game_id,host_player_id) where status in ('invited','pending');
create table public.opportunity_slots (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id),
  starts_at timestamptz not null,
  duration_minutes integer not null check(duration_minutes between 15 and 240),
  regular_price numeric(10,2) not null check(regular_price > 0),
  offer_price numeric(10,2) not null check(offer_price > 0 and offer_price < regular_price),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.play_windows (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null check(ends_at > starts_at),
  level text not null check(level in ('all','beginner','intermediate','advanced')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.opportunity_requests (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.opportunity_slots(id),
  pelada_id uuid not null references public.peladas(id),
  opponent_pelada_id uuid references public.peladas(id),
  opponent_accepted boolean not null default false,
  status text not null default 'pending' check(status in ('pending','confirmed','declined','cancelled')),
  booking_id uuid references public.field_bookings(id),
  match_id uuid references public.friendly_matches(id),
  price numeric(10,2) not null,
  commission_percent numeric(5,2) not null check(commission_percent between 0 and 20),
  created_at timestamptz not null default now(),
  check(opponent_pelada_id is null or opponent_pelada_id <> pelada_id)
);
create unique index opportunity_pending_team on public.opportunity_requests(slot_id,pelada_id) where status in ('pending','confirmed');
create table public.onboarding_preferences (
  player_id uuid primary key references public.players(id),
  persona text not null check(persona in ('player','team','venue')),
  completed boolean not null default false,
  suggestions_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['assisted_venues','buddy_invites','opportunity_slots','play_windows','opportunity_requests','onboarding_preferences'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
  end loop;
end $$;

-- A mesma trava de campo serializa publicações e confirmações nesta operação.
create function public.growth_slot_free(p_field uuid,p_start timestamptz,p_minutes integer) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select not exists(
    select 1 from public.field_bookings b cross join generate_series(-1,1) d where b.field_id=p_field
      and ((b.recurrence='single' and d=0)
        or (b.recurrence='weekly' and b.day_of_week=extract(dow from (p_start at time zone 'America/Sao_Paulo')::date+d)))
      and (case when b.recurrence='single' then b.date else (p_start at time zone 'America/Sao_Paulo')::date+d end)+b.time::time < (p_start at time zone 'America/Sao_Paulo') + make_interval(mins=>p_minutes)
      and (case when b.recurrence='single' then b.date else (p_start at time zone 'America/Sao_Paulo')::date+d end)+b.time::time + make_interval(mins=>b.duration_minutes) > (p_start at time zone 'America/Sao_Paulo')
  );
$$;
revoke all on function public.growth_slot_free(uuid,timestamptz,integer) from public,anon,authenticated;

create function public.growth_snapshot() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid; r text;
begin
  if not public.platform_account_allowed() then raise exception 'Entre com uma conta ativa'; end if;
  select id into me from public.players where auth_user_id=auth.uid();
  r:=public.platform_admin_role();
  return jsonb_build_object(
    'venues',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('name',e.name,'fields',
      (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'sport_id',f.sport_id,'address',f.address)),'[]'::jsonb) from fields f where f.establishment_id=e.id)))
      from assisted_venues v join establishments e on e.id=v.establishment_id
      where r in ('owner','admin') or v.target_player_id=me),'[]'::jsonb),
    'buddies',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('host_name',p.name,'buddy_name',q.name))
      from buddy_invites b join players p on p.id=b.host_player_id left join players q on q.id=b.buddy_player_id
      join games g on g.id=b.game_id where b.host_player_id=me or b.buddy_player_id=me or public.is_admin_of_pelada(g.pelada_id)),'[]'::jsonb),
    'slots',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('field_name',f.name,'address',f.address,'sport_id',f.sport_id,'establishment_id',f.establishment_id))
      from opportunity_slots s join fields f on f.id=s.field_id where s.active and s.starts_at>now()
        and public.growth_slot_free(s.field_id,s.starts_at,s.duration_minutes)),'[]'::jsonb),
    'windows',coalesce((select jsonb_agg(to_jsonb(w)||jsonb_build_object('team_name',p.name,'sport_id',p.sport_id))
      from play_windows w join peladas p on p.id=w.pelada_id where w.active and w.ends_at>now()),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('team_name',p.name,'opponent_name',o.name,'field_name',f.name,'starts_at',s.starts_at))
      from opportunity_requests q join opportunity_slots s on s.id=q.slot_id join fields f on f.id=s.field_id
      join peladas p on p.id=q.pelada_id left join peladas o on o.id=q.opponent_pelada_id
      where public.is_admin_of_pelada(q.pelada_id) or public.is_admin_of_pelada(q.opponent_pelada_id) or public.is_establishment_owner(f.establishment_id)),'[]'::jsonb),
    'onboarding',(select to_jsonb(p) from onboarding_preferences p where p.player_id=me)
  );
end $$;

create function public.growth_action(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid; role_now text; eid uuid; new_id uuid; reason text; v public.assisted_venues;
  b public.buddy_invites; s public.opportunity_slots; q public.opportunity_requests; f public.fields;
  g public.games; p public.peladas; opponent public.peladas; occupied integer; booking uuid; challenge uuid; match uuid;
  start_at timestamptz; end_at timestamptz; minutes integer; target uuid;
begin
  if not public.platform_account_allowed() then raise exception 'Entre com uma conta ativa'; end if;
  select id into me from public.players where auth_user_id=auth.uid();
  if me is null then raise exception 'Complete seu perfil'; end if;
  role_now:=public.platform_admin_role();
  if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Dados inválidos'; end if;
  if p_action in ('venue_create','venue_field','venue_availability','venue_invite') then
    if role_now is null or role_now not in ('owner','admin') then raise exception 'Somente a administração da plataforma'; end if;
    reason:=trim(p_data->>'reason');
    if length(coalesce(reason,''))<8 then raise exception 'Informe um motivo de pelo menos 8 caracteres'; end if;
    if p_action='venue_create' then
      if length(trim(coalesce(p_data->>'name',''))) not between 3 and 80 then raise exception 'Nome inválido'; end if;
      insert into establishments(owner_player_id,name,payout_method,access_code) values(me,trim(p_data->>'name'),'in_person',gen_random_uuid()::text) returning id into eid;
      insert into assisted_venues(establishment_id,prepared_by) values(eid,auth.uid());
    else
      eid:=(p_data->>'establishmentId')::uuid;
      select * into v from assisted_venues where establishment_id=eid for update;
      if v.establishment_id is null or v.status='accepted' then raise exception 'Cadastro assistido indisponível'; end if;
      if (p_data->>'revision')::integer is distinct from v.revision then raise exception 'Cadastro mudou. Atualize.'; end if;
      if p_action='venue_field' then
        if length(trim(coalesce(p_data->>'name',''))) not between 3 and 80 or not exists(select 1 from sport_catalog where id=p_data->>'sportId' and (definition->>'active')::boolean) then raise exception 'Campo ou esporte inválido'; end if;
        insert into fields(establishment_id,name,address,sport_id,created_by) values(eid,trim(p_data->>'name'),left(p_data->>'address',200),p_data->>'sportId',me);
      elsif p_action='venue_availability' then
        select * into f from fields where id=(p_data->>'fieldId')::uuid and establishment_id=eid;
        if f.id is null or (p_data->>'dayOfWeek')::integer not between 0 and 6 or (p_data->>'startTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (p_data->>'endTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          or (p_data->>'endTime')::time<=(p_data->>'startTime')::time or (p_data->>'price')::numeric<=0 or (p_data->>'slotMinutes')::integer not between 15 and 240 then raise exception 'Disponibilidade/preço inválidos'; end if;
        insert into field_availabilities(field_id,day_of_week,start_time,end_time,slot_minutes,price) values(f.id,(p_data->>'dayOfWeek')::integer,p_data->>'startTime',p_data->>'endTime',(p_data->>'slotMinutes')::integer,(p_data->>'price')::numeric);
      else
        target:=(p_data->>'playerId')::uuid;
        if target=me or not exists(select 1 from players x join auth.users u on u.id=x.auth_user_id where x.id=target and not x.is_guest)
          or exists(select 1 from platform_account_controls where player_id=target and suspended) then raise exception 'Selecione outra conta cadastrada e ativa'; end if;
        if exists(select 1 from payment_gateway_connections where establishment_id=eid and status='connected')
          or exists(select 1 from field_bookings where establishment_id=eid) then raise exception 'Transfira apenas cadastros novos, sem reservas ou gateway conectado'; end if;
        update assisted_venues set target_player_id=target,status='invited' where establishment_id=eid;
      end if;
      update assisted_venues set revision=revision+1 where establishment_id=eid;
    end if;
    insert into platform_admin_audit(actor_auth_user_id,action,target_id,reason,after_value) values(auth.uid(),p_action,eid::text,reason,p_data);
    return jsonb_build_object('id',eid);
  elsif p_action='venue_respond' then
    eid:=(p_data->>'establishmentId')::uuid;
    select * into v from assisted_venues where establishment_id=eid for update;
    if v.target_player_id is distinct from me or v.status<>'invited' or (p_data->>'revision')::integer is distinct from v.revision then raise exception 'Convite indisponível'; end if;
    if jsonb_typeof(p_data->'accept') is distinct from 'boolean' then raise exception 'Resposta inválida'; end if;
    if (p_data->>'accept')::boolean then
      perform 1 from establishments where id=eid for update;
      if exists(select 1 from payment_gateway_connections where establishment_id=eid and status='connected') or exists(select 1 from field_bookings where establishment_id=eid) then raise exception 'Cadastro já possui operação financeira; transferência precisa de revisão'; end if;
      update establishments set owner_player_id=me,pix_key=null,payout_method='in_person',whatsapp_opt_in=false where id=eid;
    end if;
    update assisted_venues set status=case when (p_data->>'accept')::boolean then 'accepted' else 'declined' end,revision=revision+1 where establishment_id=eid;
    insert into platform_admin_audit(actor_auth_user_id,action,target_id,reason) values(auth.uid(),p_action,eid::text,'Resposta do responsável ao cadastro assistido');
    return jsonb_build_object('id',eid);
  elsif p_action='buddy_create' then
    select * into g from games where id=(p_data->>'gameId')::uuid for update;
    if g.id is null or g.scheduled_at<=now() or g.status not in ('open','full') or not exists(select 1 from public_game_listings where game_id=g.id and published)
      or not coalesce((select (settings->>'discoveryEnabled')::boolean from platform_configuration where id),false) then raise exception 'Jogo indisponível'; end if;
    if exists(select 1 from attendances where game_id=g.id and player_id=me and status in ('confirmed','waitlist')) then raise exception 'Você já está na chamada'; end if;
    if exists(select 1 from public_game_join_requests where game_id=g.id and player_id=me and status='pending') then raise exception 'Você já solicitou entrada individual'; end if;
    update buddy_invites set status='cancelled' where game_id=g.id and expires_at<=now() and status in ('invited','pending');
    if exists(select 1 from buddy_invites where game_id=g.id and buddy_player_id=me and status='pending') then raise exception 'Você já tem uma dupla pendente'; end if;
    select * into b from buddy_invites where game_id=g.id and host_player_id=me and status in ('invited','pending');
    if b.id is null then insert into buddy_invites(game_id,host_player_id,expires_at) values(g.id,me,least(g.scheduled_at,now()+interval '24 hours')) returning * into b; end if;
    return jsonb_build_object('code',b.code,'id',b.id);
  elsif p_action='buddy_join' then
    select * into b from buddy_invites where code=(p_data->>'code')::uuid for update;
    select * into g from games where id=b.game_id;
    if b.id is null or b.status<>'invited' or b.expires_at<=now() or b.host_player_id=me or g.scheduled_at<=now() or g.status not in ('open','full') or not exists(select 1 from public_game_listings where game_id=g.id and published)
      or not coalesce((select (settings->>'discoveryEnabled')::boolean from platform_configuration where id),false) then raise exception 'Convite indisponível'; end if;
    if exists(select 1 from attendances where game_id=b.game_id and player_id=me and status in ('confirmed','waitlist'))
      or exists(select 1 from buddy_invites where game_id=b.game_id and status in ('invited','pending') and (host_player_id=me or buddy_player_id=me))
      or exists(select 1 from public_game_join_requests where game_id=b.game_id and player_id=me and status='pending') then raise exception 'Você já participa ou tem solicitação pendente'; end if;
    update buddy_invites set buddy_player_id=me,status='pending' where id=b.id;
    return jsonb_build_object('id',b.id);
  elsif p_action in ('buddy_respond','buddy_cancel') then
    select * into b from buddy_invites where id=(p_data->>'id')::uuid for update;
    select * into g from games where id=b.game_id for update;
    if p_action='buddy_cancel' then
      if b.host_player_id is distinct from me or b.status not in ('invited','pending') then raise exception 'Convite indisponível'; end if;
      update buddy_invites set status='cancelled' where id=b.id;
    else
      if g.id is null or not public.is_admin_of_pelada(g.pelada_id) or b.status<>'pending' then raise exception 'Sem permissão ou solicitação encerrada'; end if;
      if jsonb_typeof(p_data->'accept') is distinct from 'boolean' then raise exception 'Resposta inválida'; end if;
      if (p_data->>'accept')::boolean then
        if g.scheduled_at<=now() or b.expires_at<=now() or g.status not in ('open','full') then raise exception 'Chamada encerrada'; end if;
        if exists(select 1 from platform_account_controls where player_id in (b.host_player_id,b.buddy_player_id) and suspended) then raise exception 'Conta suspensa'; end if;
        select count(*) into occupied from attendances where game_id=g.id and status='confirmed' and player_id not in (b.host_player_id,b.buddy_player_id);
        if occupied+2>g.max_players then raise exception 'É preciso ter duas vagas para aprovar a dupla'; end if;
        insert into pelada_memberships(pelada_id,player_id,role,active) values(g.pelada_id,b.host_player_id,'member',true),(g.pelada_id,b.buddy_player_id,'member',true) on conflict(pelada_id,player_id) do update set active=true;
        insert into attendances(game_id,player_id,status,confirmed_order) values(g.id,b.host_player_id,'confirmed',occupied+1),(g.id,b.buddy_player_id,'confirmed',occupied+2) on conflict(game_id,player_id) do update set status='confirmed',confirmed_order=excluded.confirmed_order;
      end if;
      update buddy_invites set status=case when (p_data->>'accept')::boolean then 'accepted' else 'declined' end where id=b.id;
    end if;
    return jsonb_build_object('id',b.id);
  elsif p_action='onboarding' then
    if p_data->>'persona' not in ('player','team','venue') or jsonb_typeof(p_data->'suggestionsEnabled') is distinct from 'boolean' then raise exception 'Preferências inválidas'; end if;
    insert into onboarding_preferences(player_id,persona,completed,suggestions_enabled) values(me,p_data->>'persona',true,(p_data->>'suggestionsEnabled')::boolean)
      on conflict(player_id) do update set persona=excluded.persona,completed=true,suggestions_enabled=excluded.suggestions_enabled,updated_at=now();
    return '{}'::jsonb;
  elsif p_action='window_create' then
    target:=(p_data->>'teamId')::uuid;
    if not public.is_admin_of_pelada(target) then raise exception 'Somente o administrador deste time'; end if;
    start_at:=(p_data->>'startsAt')::timestamptz; end_at:=(p_data->>'endsAt')::timestamptz;
    if start_at<=now() or end_at<=start_at or end_at>start_at+interval '8 hours' or p_data->>'level' not in ('all','beginner','intermediate','advanced') then raise exception 'Janela inválida'; end if;
    insert into play_windows(pelada_id,starts_at,ends_at,level) values(target,start_at,end_at,p_data->>'level') returning id into new_id;
    return jsonb_build_object('id',new_id);
  elsif p_action='slot_create' then
    select * into f from fields where id=(p_data->>'fieldId')::uuid for update;
    if f.id is null or not public.is_establishment_owner(f.establishment_id) then raise exception 'Somente o dono do campo'; end if;
    if exists(select 1 from assisted_venues where establishment_id=f.establishment_id and status<>'accepted') then raise exception 'Vincule o responsável antes de publicar horários'; end if;
    start_at:=(p_data->>'startsAt')::timestamptz; minutes:=(p_data->>'durationMinutes')::integer;
    if start_at<=now() or minutes not between 15 and 240 or (start_at at time zone 'America/Sao_Paulo')::date<>((start_at+make_interval(mins=>minutes)) at time zone 'America/Sao_Paulo')::date then raise exception 'Horário inválido; não atravesse meia-noite'; end if;
    if not public.growth_slot_free(f.id,start_at,minutes) then raise exception 'Horário já ocupado'; end if;
    insert into opportunity_slots(field_id,starts_at,duration_minutes,regular_price,offer_price) values(f.id,start_at,minutes,(p_data->>'regularPrice')::numeric,(p_data->>'offerPrice')::numeric) returning id into new_id;
    return jsonb_build_object('id',new_id);
  elsif p_action in ('slot_hide','window_hide') then
    new_id:=(p_data->>'id')::uuid;
    if p_action='slot_hide' then
      select * into s from opportunity_slots where id=new_id;
      if not exists(select 1 from fields where id=s.field_id and public.is_establishment_owner(establishment_id)) then raise exception 'Sem permissão'; end if;
      update opportunity_slots set active=false where id=new_id;
    else
      if not exists(select 1 from play_windows where id=new_id and public.is_admin_of_pelada(pelada_id)) then raise exception 'Sem permissão'; end if;
      update play_windows set active=false where id=new_id;
    end if;
    return '{}'::jsonb;
  elsif p_action='slot_request' then
    select * into s from opportunity_slots where id=(p_data->>'slotId')::uuid;
    select * into f from fields where id=s.field_id for update;
    select * into p from peladas where id=(p_data->>'teamId')::uuid;
    select * into opponent from peladas where id=nullif(p_data->>'opponentId','')::uuid;
    if s.id is null or not s.active or s.starts_at<=now() or not public.is_admin_of_pelada(p.id) or p.sport_id<>f.sport_id then raise exception 'Horário/time indisponível'; end if;
    if not public.growth_slot_free(f.id,s.starts_at,s.duration_minutes) then raise exception 'Horário já ocupado'; end if;
    if p_data->>'opponentId' is not null and (opponent.id is null or opponent.id=p.id or opponent.sport_id<>p.sport_id or not exists(select 1 from play_windows w where w.pelada_id=opponent.id and w.active and w.starts_at<=s.starts_at and w.ends_at>=s.starts_at+make_interval(mins=>s.duration_minutes))) then raise exception 'Adversário sem disponibilidade compatível'; end if;
    insert into opportunity_requests(slot_id,pelada_id,opponent_pelada_id,price,commission_percent) values(s.id,p.id,opponent.id,s.offer_price,coalesce((select (settings->>'bookingCommissionPercent')::numeric from platform_configuration where id),0))
      on conflict(slot_id,pelada_id) where status in ('pending','confirmed') do nothing;
    return '{}'::jsonb;
  elsif p_action in ('opponent_respond','slot_respond','request_cancel') then
    select * into q from opportunity_requests where id=(p_data->>'id')::uuid for update;
    select * into s from opportunity_slots where id=q.slot_id;
    select * into f from fields where id=s.field_id for update;
    if q.id is null or q.status<>'pending' then raise exception 'Pedido encerrado'; end if;
    if p_action='request_cancel' then
      if not public.is_admin_of_pelada(q.pelada_id) then raise exception 'Sem permissão'; end if;
      update opportunity_requests set status='cancelled' where id=q.id; return '{}'::jsonb;
    end if;
    if jsonb_typeof(p_data->'accept') is distinct from 'boolean' then raise exception 'Resposta inválida'; end if;
    if p_action='opponent_respond' then
      if not public.is_admin_of_pelada(q.opponent_pelada_id) then raise exception 'Sem permissão'; end if;
      update opportunity_requests set opponent_accepted=(p_data->>'accept')::boolean,status=case when (p_data->>'accept')::boolean then 'pending' else 'declined' end where id=q.id;
    else
      if not public.is_establishment_owner(f.establishment_id) then raise exception 'Somente o dono do campo confirma'; end if;
      if not (p_data->>'accept')::boolean then update opportunity_requests set status='declined' where id=q.id; return '{}'::jsonb; end if;
      if q.opponent_pelada_id is not null and not q.opponent_accepted then raise exception 'Aguarde o aceite do outro time'; end if;
      if not s.active or s.starts_at<=now() or not public.growth_slot_free(f.id,s.starts_at,s.duration_minutes) then raise exception 'Horário já ocupado ou encerrado'; end if;
      select * into p from peladas where id=q.pelada_id;
      insert into field_bookings(field_id,establishment_id,pelada_id,team_name,recurrence,date,time,duration_minutes,notes,created_by)
        values(f.id,f.establishment_id,p.id,p.name,'single',(s.starts_at at time zone 'America/Sao_Paulo')::date,to_char(s.starts_at at time zone 'America/Sao_Paulo','HH24:MI'),s.duration_minutes,'MarcouJogou: oferta confirmada, pagamento separado',me) returning id into booking;
      if q.opponent_pelada_id is not null then
        insert into team_challenges(challenger_pelada_id,challenged_pelada_id,proposed_date,proposed_time,field_id,status,created_by,responded_at)
          values(p.id,q.opponent_pelada_id,(s.starts_at at time zone 'America/Sao_Paulo')::date,to_char(s.starts_at at time zone 'America/Sao_Paulo','HH24:MI'),f.id,'accepted',me,now()) returning id into challenge;
        insert into friendly_matches(challenge_id,pelada_a_id,pelada_b_id,field_id,scheduled_at,match_minutes,sport_id)
          values(challenge,p.id,q.opponent_pelada_id,f.id,s.starts_at,s.duration_minutes,p.sport_id) returning id into match;
        update team_challenges set match_id=match where id=challenge;
      end if;
      update opportunity_requests set status='confirmed',booking_id=booking,match_id=match where id=q.id;
      update opportunity_slots set active=false where id=s.id;
      update opportunity_requests set status='declined' where slot_id=s.id and id<>q.id and status='pending';
    end if;
    return '{}'::jsonb;
  end if;
  raise exception 'Ação não permitida';
end $$;
revoke all on function public.growth_snapshot(),public.growth_action(text,jsonb) from public,anon;
grant execute on function public.growth_snapshot(),public.growth_action(text,jsonb) to authenticated;

-- Snapshot novo não inventa escalações históricas anteriores à implantação.
alter table public.match_turns add column roster_snapshot jsonb;
create function public.capture_turn_roster() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' and old.ended_at is not null and (new.roster_snapshot is distinct from old.roster_snapshot or new.ended_at is null or new.game_id<>old.game_id or new.team_a_id<>old.team_a_id or new.team_b_id<>old.team_b_id) then raise exception 'Escalação histórica encerrada não pode ser alterada'; end if;
  if tg_op='INSERT' and new.roster_snapshot is null then
    new.roster_snapshot := coalesce((select jsonb_agg(jsonb_build_object('teamId',tp.team_id,'playerId',tp.player_id,'joinedAt',coalesce(new.started_at,now()),'leftAt',null)) from team_players tp where tp.team_id in (new.team_a_id,new.team_b_id)),'[]'::jsonb);
  end if;
  if new.roster_snapshot is not null and (jsonb_typeof(new.roster_snapshot)<>'array' or jsonb_array_length(new.roster_snapshot)>500) then raise exception 'Escalação inválida'; end if;
  return new;
end $$;
create trigger capture_turn_roster before insert or update on public.match_turns for each row execute function public.capture_turn_roster();

create function public.guard_buddy_individual_request() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from buddy_invites where game_id=new.game_id and (host_player_id=new.player_id or buddy_player_id=new.player_id) and status in ('invited','pending') and expires_at>now()) then raise exception 'Você já tem convite de dupla; cancele antes de solicitar individualmente'; end if;
  return new;
end $$;
create trigger guard_buddy_individual_request before insert on public.public_game_join_requests for each row execute function public.guard_buddy_individual_request();

-- Evita dupla reserva inclusive quando a outra escrita veio do fluxo antigo.
create function public.guard_field_booking_overlap() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from fields where id=new.field_id for update;
  if new.duration_minutes not between 1 and 1440 or new.time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Duração ou horário inválido'; end if;
  if exists(select 1 from field_bookings b
    cross join lateral(select coalesce(new.date,b.date,date '2026-01-04'+new.day_of_week) as day) anchor
    cross join generate_series(-1,1) nd cross join generate_series(-1,1) bd
    cross join lateral(select case when new.recurrence='single' then new.date else anchor.day+nd end as ndate,case when b.recurrence='single' then b.date else anchor.day+bd end as bdate) dates
    where b.field_id=new.field_id and b.id<>new.id
    and (case when new.recurrence='single' then nd=0 else extract(dow from dates.ndate)=new.day_of_week end)
    and (case when b.recurrence='single' then bd=0 else extract(dow from dates.bdate)=b.day_of_week end)
    and dates.bdate+b.time::time<dates.ndate+new.time::time+make_interval(mins=>new.duration_minutes)
    and dates.bdate+b.time::time+make_interval(mins=>b.duration_minutes)>dates.ndate+new.time::time) then raise exception 'Horário já ocupado'; end if;
  return new;
end $$;
create trigger guard_field_booking_overlap before insert or update on public.field_bookings for each row execute function public.guard_field_booking_overlap();

-- Source: 20261010070000_game_recap.sql
create table public.game_highlight_votes (
  game_id uuid not null references public.games(id) on delete cascade,
  voter_player_id uuid not null references public.players(id),
  target_player_id uuid not null references public.players(id),
  primary key(game_id,voter_player_id)
);
alter table public.game_highlight_votes enable row level security;
revoke all on public.game_highlight_votes from anon,authenticated;
create table public.game_recap_consents (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id),
  primary key(game_id,player_id)
);
alter table public.game_recap_consents enable row level security;
revoke all on public.game_recap_consents from anon,authenticated;
create function public.set_recap_consent(p_game uuid,p_allow boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid;
begin
  select id into me from players where auth_user_id=auth.uid();
  if p_allow is null or not public.platform_account_allowed() or not exists(select 1 from games where id=p_game and public.is_member_of_pelada(pelada_id)) then raise exception 'Sem permissão'; end if;
  if p_allow then insert into game_recap_consents(game_id,player_id) values(p_game,me) on conflict do nothing;
  else delete from game_recap_consents where game_id=p_game and player_id=me; end if;
end $$;
create function public.game_recap(p_game uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare g public.games; p public.peladas; participants jsonb;
begin
  select * into g from games where id=p_game;
  if g.id is null or not public.platform_account_allowed() or not public.is_member_of_pelada(g.pelada_id) then raise exception 'Resumo exclusivo dos membros do time'; end if;
  if g.status<>'finished' then raise exception 'Finalize o jogo para ver o resumo'; end if;
  select * into p from peladas where id=g.pelada_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name)),'[]'::jsonb) into participants from players x where exists(
    select 1 from match_turns t, jsonb_array_elements(coalesce(t.roster_snapshot,'[]')) r where t.game_id=g.id and r->>'playerId'=x.id::text
  );
  return jsonb_build_object('name',p.name,'sportId',p.sport_id,'date',g.scheduled_at,'participants',participants,
    'consentedIds',coalesce((select jsonb_agg(player_id) from game_recap_consents where game_id=g.id),'[]'::jsonb),
    'nextGame',(select scheduled_at from games where pelada_id=p.id and scheduled_at>now() and status in ('open','full') order by scheduled_at limit 1),
    'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'teamA',a.name,'teamB',b.name,'scoreA',(select count(*) from goals where match_turn_id=t.id and team_id=a.id),'scoreB',(select count(*) from goals where match_turn_id=t.id and team_id=b.id))) from match_turns t join teams a on a.id=t.team_a_id join teams b on b.id=t.team_b_id where t.game_id=g.id and t.ended_at is not null),'[]'::jsonb),
    'highlights',coalesce((select jsonb_agg(row) from (select v.target_player_id as id,x.name,count(*) as votes from game_highlight_votes v join players x on x.id=v.target_player_id where v.game_id=g.id group by v.target_player_id,x.name order by count(*) desc,x.name) row),'[]'::jsonb));
end $$;
create function public.vote_game_highlight(p_game uuid,p_player uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid; g public.games;
begin
  select * into g from games where id=p_game;
  select id into me from players where auth_user_id=auth.uid();
  if not public.platform_account_allowed() or not public.is_member_of_pelada(g.pelada_id) or g.status<>'finished' then raise exception 'Sem permissão'; end if;
  if not exists(select 1 from match_turns t,jsonb_array_elements(coalesce(t.roster_snapshot,'[]')) r where t.game_id=g.id and r->>'playerId'=me::text)
    or not exists(select 1 from match_turns t,jsonb_array_elements(coalesce(t.roster_snapshot,'[]')) r where t.game_id=g.id and r->>'playerId'=p_player::text) then raise exception 'A votação requer participação registrada na escalação'; end if;
  insert into game_highlight_votes(game_id,voter_player_id,target_player_id) values(g.id,me,p_player)
    on conflict(game_id,voter_player_id) do update set target_player_id=excluded.target_player_id;
end $$;
revoke all on function public.game_recap(uuid),public.vote_game_highlight(uuid,uuid),public.set_recap_consent(uuid,boolean) from public,anon;
grant execute on function public.game_recap(uuid),public.vote_game_highlight(uuid,uuid),public.set_recap_consent(uuid,boolean) to authenticated;

-- Source: 20261010080000_commercial_checkout.sql
-- Uma mensalidade por checkout, sem débito/renovação automática.
create table public.commercial_checkout_orders (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.platform_commercial_agreements(id),
  cycle integer not null check(cycle between 1 and 36),
  amount numeric(12,2) not null check(amount>0),
  status text not null default 'pending' check(status in ('pending','paid','refunded','disputed')),
  checkout_url text,
  building boolean not null default false,
  preference_id text,
  provider_payment_id text unique,
  provider_updated_at timestamptz,
  period_end timestamptz,
  expires_at timestamptz not null default now()+interval '24 hours',
  terms_version text not null,
  terms_accepted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(agreement_id,cycle)
);
alter table public.commercial_checkout_orders enable row level security;
revoke all on public.commercial_checkout_orders from anon,authenticated;
grant select,insert,update on public.commercial_checkout_orders to service_role;
create function public.commercial_checkout_state(p_agreement uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a public.platform_commercial_agreements;
begin
  select * into a from platform_commercial_agreements where id=p_agreement;
  if a.id is null or not public.commercial_target_manager(a.audience,a.target_id) then raise exception 'Sem permissão'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'cycle',o.cycle,'amount',o.amount,'status',o.status,'periodEnd',o.period_end,'expiresAt',o.expires_at)) from commercial_checkout_orders o where o.agreement_id=a.id),'[]'::jsonb);
end $$;
create function public.prepare_commercial_checkout(p_agreement uuid,p_terms text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.platform_commercial_agreements; o public.commercial_checkout_orders; cycle_now integer;
begin
  select * into a from platform_commercial_agreements where id=p_agreement for update;
  if a.id is null or not public.commercial_target_manager(a.audience,a.target_id) then raise exception 'Você não representa o destinatário'; end if;
  if a.status<>'accepted' or a.kind='license' then raise exception 'Aceite uma oferta paga primeiro'; end if;
  if p_terms is distinct from 'monthly-manual-v1' then raise exception 'Confirme as condições do checkout mensal'; end if;
  if not exists(select 1 from commercial_plans where id=a.plan_id and active) then raise exception 'Plano indisponível'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commercial-target:'||a.audience||':'||a.target_id,0));
  if exists(select 1 from commercial_checkout_orders pending_order join platform_commercial_agreements other on other.id=pending_order.agreement_id
    where other.audience=a.audience and other.target_id=a.target_id and other.id<>a.id and pending_order.status='pending' and pending_order.expires_at>now()) then raise exception 'Conclua ou reconcilie o outro checkout pendente deste perfil'; end if;
  if exists(select 1 from commercial_checkout_orders where agreement_id=a.id and status in ('refunded','disputed')) then raise exception 'Contrato exige revisão após estorno/contestação'; end if;
  if exists(select 1 from commercial_subscriptions s where s.status='active' and s.current_period_end>now() and
    case a.audience when 'player' then s.subscriber_player_id=a.target_id when 'team' then s.pelada_id=a.target_id else s.establishment_id=a.target_id end)
    then raise exception 'Já existe um período pago ativo; renove após seu encerramento'; end if;
  select coalesce(max(cycle),0)+1 into cycle_now from commercial_checkout_orders where agreement_id=a.id and status='paid';
  if cycle_now>a.duration_months then raise exception 'Mensalidades negociadas concluídas. Solicite uma nova oferta'; end if;
  insert into commercial_checkout_orders(agreement_id,cycle,amount,terms_version,terms_accepted_by) values(a.id,cycle_now,a.agreed_monthly_price,p_terms,auth.uid())
    on conflict(agreement_id,cycle) do nothing;
  select * into o from commercial_checkout_orders where agreement_id=a.id and cycle=cycle_now for update;
  if o.status<>'pending' then raise exception 'Cobrança exige revisão'; end if;
  if o.expires_at<=now() then
    raise exception 'Checkout expirado. O suporte precisa reconciliar a cobrança antes de reabrir';
  end if;
  insert into platform_admin_audit(actor_auth_user_id,action,target_id,reason,after_value) values(auth.uid(),'commercial_checkout',o.id::text,'Aceite das condições de uma mensalidade, sem renovação automática',jsonb_build_object('terms',p_terms,'amount',o.amount,'cycle',o.cycle));
  return to_jsonb(o)||jsonb_build_object('audience',a.audience,'title',(select name from commercial_plans where id=a.plan_id));
end $$;
create function public.claim_commercial_preference(p_order uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.commercial_checkout_orders;
begin
  select * into o from commercial_checkout_orders where id=p_order for update;
  if o.id is null or o.status<>'pending' or o.checkout_url is not null or o.building or o.expires_at<=now() then return false; end if;
  update commercial_checkout_orders set building=true where id=o.id;
  return true;
end $$;
-- Somente o webhook assinado chama esta função, após consultar o pagamento no provedor.
create function public.settle_commercial_checkout(p_order uuid,p_payment text,p_amount numeric,p_currency text,p_status text,p_approved_at timestamptz,p_updated_at timestamptz) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.commercial_checkout_orders; a public.platform_commercial_agreements; finish timestamptz;
begin
  select * into o from commercial_checkout_orders where id=p_order for update;
  if o.id is null or p_currency is distinct from 'BRL' or p_amount is distinct from o.amount or length(coalesce(p_payment,''))<1 then raise exception 'Pagamento incompatível'; end if;
  if o.provider_payment_id is not null and o.provider_payment_id<>p_payment then raise exception 'Pagamento duplicado para a mesma mensalidade: revisão/estorno necessário'; end if;
  if o.provider_updated_at is not null and p_updated_at<=o.provider_updated_at then return; end if;
  select * into a from platform_commercial_agreements where id=o.agreement_id;
  if p_status='approved' then
    if o.status in ('refunded','disputed') then raise exception 'Estorno/contestação não pode ser reativado automaticamente'; end if;
    if p_approved_at is null or p_approved_at>now()+interval '5 minutes' then raise exception 'Data de pagamento inválida'; end if;
    finish:=coalesce(o.period_end,p_approved_at+interval '1 month');
    update commercial_checkout_orders set status='paid',provider_payment_id=p_payment,provider_updated_at=p_updated_at,period_end=finish where id=o.id;
    insert into commercial_subscriptions(plan_id,subscriber_player_id,pelada_id,establishment_id,provider,provider_subscription_id,status,current_period_end)
      values(a.plan_id,case when a.audience='player' then a.target_id end,case when a.audience='team' then a.target_id end,case when a.audience='establishment' then a.target_id end,'mercado_pago_monthly','commercial:'||o.id,'active',finish)
      on conflict(provider_subscription_id) do update set status='active',current_period_end=excluded.current_period_end;
  elsif p_status in ('refunded','charged_back','in_mediation') then
    update commercial_checkout_orders set status=case when p_status='refunded' then 'refunded' else 'disputed' end,provider_payment_id=p_payment,provider_updated_at=p_updated_at where id=o.id;
    update commercial_subscriptions set status='cancelled' where provider_subscription_id='commercial:'||o.id;
  else return;
  end if;
  insert into platform_admin_audit(action,target_id,reason,after_value) values('commercial_payment',o.id::text,'Pagamento consultado no Mercado Pago após webhook assinado',jsonb_build_object('status',p_status,'payment',p_payment));
end $$;
revoke all on function public.commercial_checkout_state(uuid),public.prepare_commercial_checkout(uuid,text),public.settle_commercial_checkout(uuid,text,numeric,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.commercial_checkout_state(uuid),public.prepare_commercial_checkout(uuid,text) to authenticated;
grant execute on function public.settle_commercial_checkout(uuid,text,numeric,text,text,timestamptz,timestamptz) to service_role;
revoke all on function public.claim_commercial_preference(uuid) from public,anon,authenticated;
grant execute on function public.claim_commercial_preference(uuid) to service_role;

create or replace function public.commercial_access_snapshot() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.platform_account_allowed() then raise exception 'Sessão indisponível' using errcode='42501'; end if;
  return jsonb_build_object('role',public.platform_admin_role(),
    'licenses',coalesce((select jsonb_agg(row) from (
      select jsonb_build_object('id',a.id,'audience',a.audience,'targetId',a.target_id,'planId',a.plan_id,'expiresAt',a.expires_at) as row
      from platform_commercial_agreements a where a.kind='license' and a.status='granted' and (a.expires_at is null or a.expires_at>now()) and public.commercial_target_member(a.audience,a.target_id)
      union all
      select jsonb_build_object('id',s.id,'audience',p.audience,'targetId',coalesce(s.subscriber_player_id,s.pelada_id,s.establishment_id),'planId',s.plan_id,'expiresAt',s.current_period_end,'paid',true)
      from commercial_subscriptions s join commercial_plans p on p.id=s.plan_id where s.status='active' and s.current_period_end>now()
        and s.provider='mercado_pago_monthly' and public.commercial_target_member(p.audience,coalesce(s.subscriber_player_id,s.pelada_id,s.establishment_id))
    ) x),'[]'::jsonb),
    'agreements',coalesce((select jsonb_agg(public.commercial_agreement_json(a)) from platform_commercial_agreements a where public.commercial_target_manager(a.audience,a.target_id)),'[]'::jsonb));
end $$;

-- Source: 20261010100000_field_directory.sql
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

-- Descoberta de amigos depende também das migrações canônicas de conversas.
-- Optional contact discovery; never persist the address book or expose identifiers.
create table public.friend_discovery_preferences (
  player_id uuid primary key references public.players(id) on delete cascade,
  by_phone boolean not null default false, by_email boolean not null default false,
  nearby boolean not null default false,
  latitude double precision, longitude double precision, located_at timestamptz,
  check(latitude between -90 and 90), check(longitude between -180 and 180)
);
create table public.friend_discovery_limits (
  player_id uuid references public.players(id) on delete cascade,
  window_at timestamptz not null, units integer not null default 0,
  primary key(player_id,window_at)
);
create table public.friend_join_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.players(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
  claimed_by uuid references public.players(id) on delete cascade, claimed_at timestamptz
);
do $$ declare t text; begin
  foreach t in array array['friend_discovery_preferences','friend_discovery_limits','friend_join_invites'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
  end loop;
end $$;

create function public.friend_phone_key(p_value text) returns text
language plpgsql immutable set search_path=public,pg_temp as $$
declare n text:=regexp_replace(coalesce(p_value,''),'[^0-9]','','g');
begin
  if left(n,2)='00' then n:=substr(n,3); end if;
  if left(btrim(coalesce(p_value,'')),1)<>'+' and length(n) in (10,11) then n:='55'||n; end if;
  if length(n) not between 8 and 15 then return null; end if;
  return n;
end $$;
create function public.friend_discovery_visible(p_me uuid,p_other uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select p_other<>p_me and exists(select 1 from players p where p.id=p_other and p.auth_user_id is not null and not p.is_guest)
    and not exists(select 1 from community_chat_blocks where (player_id=p_me and blocked_player_id=p_other) or (player_id=p_other and blocked_player_id=p_me))
    and not exists(select 1 from platform_account_controls where player_id=p_other and suspended)
$$;
create function public.friend_public_row(p_me uuid,p_other uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',p.id,'name',p.name,'nickname',p.nickname,'avatarUrl',p.avatar_url,
    'favoriteSports',p.favorite_sports,'preferredPosition',p.preferred_position,
    'friendship',(select jsonb_build_object('id',f.id,'requesterId',f.requester_id,'addresseeId',f.addressee_id,
      'status',f.status,'createdAt',f.created_at,'respondedAt',f.responded_at) from friendships f
      where ((f.requester_id=p_me and f.addressee_id=p_other) or (f.requester_id=p_other and f.addressee_id=p_me))
      order by (f.status='accepted') desc,(f.status='pending') desc,f.created_at desc limit 1))
  from players p where p.id=p_other and public.friend_discovery_visible(p_me,p_other)
$$;

-- Existing store sync remains compatible, but cannot forge an accepted request.
create function public.friendship_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me();
begin
  if auth.uid() is null then return new; end if; -- backend maintenance, not anonymous RLS access
  if me is null then raise exception 'AMIGOS:Conta indisponível'; end if;
  if tg_op='INSERT' then
    if new.requester_id<>me or new.status<>'pending' or new.responded_at is not null
      or not public.friend_discovery_visible(me,new.addressee_id) then raise exception 'AMIGOS:Pedido indisponível'; end if;
  else
    if (new.id,new.requester_id,new.addressee_id,new.created_at) is distinct from (old.id,old.requester_id,old.addressee_id,old.created_at) then raise exception 'AMIGOS:Participantes imutáveis'; end if;
    if (new.status,new.responded_at) is distinct from (old.status,old.responded_at) then
      if me<>old.addressee_id or old.status<>'pending' or new.status not in ('accepted','declined')
        or not public.friend_discovery_visible(me,old.requester_id) then raise exception 'AMIGOS:Somente quem recebeu pode responder'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger friendship_validate before insert or update on public.friendships for each row execute function public.friendship_guard();

create function public.friend_discovery(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me(); prefs public.friend_discovery_preferences;
  other_id uuid; f public.friendships; inv public.friend_join_invites;
  n text; q text; token text; result jsonb; entry jsonb; found jsonb:='[]'; idx integer:=0;
  units integer:=1; used integer; bucket timestamptz:=date_trunc('minute',clock_timestamp()); radius double precision;
begin
  if me is null then raise exception 'AMIGOS:Entre na sua conta'; end if;
  perform pg_advisory_xact_lock(hashtext('friend-discovery:'||me::text));
  if p_action='match' then
    if jsonb_typeof(p_data->'identifiers')<>'array' or jsonb_array_length(p_data->'identifiers') not between 1 and 50 then raise exception 'AMIGOS:Selecione até 50 telefones ou e-mails'; end if;
    units:=jsonb_array_length(p_data->'identifiers');
  end if;
  delete from friend_discovery_limits where player_id=me and window_at<now()-interval '1 day';
  insert into friend_discovery_limits values(me,bucket,units) on conflict(player_id,window_at) do update set units=friend_discovery_limits.units+excluded.units returning friend_discovery_limits.units into used;
  if used>200 or (select sum(l.units) from friend_discovery_limits l where l.player_id=me)>2000 then raise exception 'AMIGOS:Aguarde antes de buscar novamente'; end if;
  insert into friend_discovery_preferences(player_id) values(me) on conflict do nothing;
  select * into prefs from friend_discovery_preferences where player_id=me;
  if p_action='preferences' then
    return jsonb_build_object('byPhone',prefs.by_phone,'byEmail',prefs.by_email,'nearby',prefs.nearby,'locationFresh',coalesce(prefs.located_at>now()-interval '2 hours',false));
  elsif p_action='configure' then
    if p_data ? 'nearby' and (p_data->>'nearby')::boolean then
      if p_data->>'latitude' is null or p_data->>'longitude' is null then raise exception 'AMIGOS:Permita sua localização para aparecer por perto'; end if;
    end if;
    update friend_discovery_preferences set
      by_phone=coalesce((p_data->>'byPhone')::boolean,by_phone),by_email=coalesce((p_data->>'byEmail')::boolean,by_email),
      nearby=coalesce((p_data->>'nearby')::boolean,nearby),
      latitude=case when p_data ? 'nearby' then case when (p_data->>'nearby')::boolean then (p_data->>'latitude')::double precision else null end else latitude end,
      longitude=case when p_data ? 'nearby' then case when (p_data->>'nearby')::boolean then (p_data->>'longitude')::double precision else null end else longitude end,
      located_at=case when p_data ? 'nearby' then case when (p_data->>'nearby')::boolean then now() else null end else located_at end
      where player_id=me;
    return public.friend_discovery('preferences');
  elsif p_action in ('search','match') then
    if p_action='search' then
      q:=lower(btrim(coalesce(p_data->>'query','')));
      if length(q) not between 3 and 254 then raise exception 'AMIGOS:Informe nome, telefone completo com DDD ou e-mail completo'; end if;
      if position('@' in q)=0 and q !~ '^[+0-9() .-]+$' then
        select coalesce(jsonb_agg(public.friend_public_row(me,id)),'[]') into found from
          (select id from players where (name ilike '%'||replace(replace(q,'%','\%'),'_','\_')||'%' or nickname ilike '%'||replace(replace(q,'%','\%'),'_','\_')||'%')
           and public.friend_discovery_visible(me,id) order by name,id limit 20) s;
        return found;
      end if;
      p_data:=jsonb_build_object('identifiers',jsonb_build_array(jsonb_build_object('kind',case when position('@' in q)>0 then 'email' else 'phone' end,'value',q)));
    end if;
    for entry in select value from jsonb_array_elements(p_data->'identifiers') loop
      q:=lower(btrim(coalesce(entry->>'value',''))); other_id:=null;
      if length(q)>254 then raise exception 'AMIGOS:Identificador inválido'; end if;
      if entry->>'kind'='email' and q ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        select p.id into other_id from players p join auth.users u on u.id=p.auth_user_id
          join friend_discovery_preferences d on d.player_id=p.id and d.by_email
          where lower(u.email)=q and u.email_confirmed_at is not null and public.friend_discovery_visible(me,p.id) limit 1;
      elsif entry->>'kind'='phone' then
        n:=public.friend_phone_key(q);
        -- Phone on profile is discovery metadata, NOT proof of account ownership.
        -- Avoid ambiguous duplicate numbers instead of selecting a random account.
        select case when count(*)=1 then min(p.id::text)::uuid end into other_id from players p
          join friend_discovery_preferences d on d.player_id=p.id and d.by_phone
          where n is not null and public.friend_phone_key(p.phone)=n and public.friend_discovery_visible(me,p.id);
      end if;
      if other_id is not null then found:=found||jsonb_build_array(jsonb_build_object('index',idx,'player',public.friend_public_row(me,other_id))); end if;
      idx:=idx+1;
    end loop;
    return found;
  elsif p_action='nearby' then
    radius:=coalesce((p_data->>'radiusKm')::double precision,5);
    if radius not between 1 and 20 then raise exception 'AMIGOS:Raio entre 1 e 20 km'; end if;
    if not prefs.nearby or prefs.located_at is null or prefs.located_at<now()-interval '2 hours' then raise exception 'AMIGOS:Atualize sua localização e ative aparecer por perto'; end if;
    select coalesce(jsonb_agg(public.friend_public_row(me,s.player_id)||jsonb_build_object('distanceKm',greatest(1,ceil(s.km)))),'[]') into found from (
      select d.player_id,6371*acos(least(1::double precision,greatest(-1::double precision,
        sin(radians(prefs.latitude))*sin(radians(d.latitude))+cos(radians(prefs.latitude))*cos(radians(d.latitude))*cos(radians(d.longitude-prefs.longitude))))) as km
      from friend_discovery_preferences d where d.nearby and d.latitude is not null and d.longitude is not null
        and d.located_at>now()-interval '2 hours' and public.friend_discovery_visible(me,d.player_id)
    ) s where s.km<=radius;
    return (select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(found) order by (value->>'distanceKm')::numeric,value->>'id' limit 20) t);
  elsif p_action='invite_create' then
    if (select count(*) from friend_join_invites where inviter_id=me and created_at>now()-interval '1 day')>=30 then raise exception 'AMIGOS:Limite diário de convites atingido'; end if;
    token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
    insert into friend_join_invites(inviter_id,token_hash) values(me,md5(token));
    return jsonb_build_object('token',token,'expiresAt',now()+interval '7 days');
  elsif p_action in ('invite_preview','invite_claim') then
    token:=p_data->>'token';
    if token is null or token !~ '^[a-f0-9]{64}$' then raise exception 'AMIGOS:Convite inválido'; end if;
    select * into inv from friend_join_invites where token_hash=md5(token) for update;
    if inv.id is null or inv.expires_at<now() or (inv.claimed_by is not null and inv.claimed_by<>me)
      or not public.friend_discovery_visible(me,inv.inviter_id) then raise exception 'AMIGOS:Convite indisponível ou expirado'; end if;
    if p_action='invite_preview' then return public.friend_public_row(me,inv.inviter_id); end if;
    update friend_join_invites set claimed_by=me,claimed_at=coalesce(claimed_at,now()) where id=inv.id;
    other_id:=inv.inviter_id; -- create a REQUEST, never an accepted friendship
    perform pg_advisory_xact_lock(hashtext('friend-pair:'||least(me,other_id)::text||greatest(me,other_id)::text));
    select * into f from friendships where (requester_id=me and addressee_id=other_id) or (requester_id=other_id and addressee_id=me) order by created_at desc limit 1;
    if f.id is null then
      -- recipient explicitly asks the original sender; sender must still approve
      insert into friendships(requester_id,addressee_id) values(me,other_id);
    elsif f.status='declined' then raise exception 'AMIGOS:Um pedido anterior foi recusado'; end if;
    return public.friend_public_row(me,other_id);
  elsif p_action='request' then
    other_id:=(p_data->>'playerId')::uuid;
    if not public.friend_discovery_visible(me,other_id) then raise exception 'AMIGOS:Contato indisponível'; end if;
    perform pg_advisory_xact_lock(hashtext('friend-pair:'||least(me,other_id)::text||greatest(me,other_id)::text));
    select * into f from friendships where (requester_id=me and addressee_id=other_id) or (requester_id=other_id and addressee_id=me) order by created_at desc limit 1;
    if f.id is null then insert into friendships(requester_id,addressee_id) values(me,other_id);
    elsif f.status='declined' then raise exception 'AMIGOS:Um pedido anterior foi recusado'; end if;
    return public.friend_public_row(me,other_id);
  elsif p_action='respond' then
    select * into f from friendships where id=(p_data->>'friendshipId')::uuid and addressee_id=me and status='pending' for update;
    if f.id is null then raise exception 'AMIGOS:Pedido indisponível'; end if;
    update friendships set status=case when (p_data->>'accept')::boolean then 'accepted' else 'declined' end,responded_at=now() where id=f.id;
    return public.friend_public_row(me,f.requester_id);
  end if;
  raise exception 'AMIGOS:Ação inválida';
end $$;
revoke all on function public.friend_phone_key(text),public.friend_discovery_visible(uuid,uuid),public.friend_public_row(uuid,uuid),public.friendship_guard(),public.friend_discovery(text,jsonb) from public,anon,authenticated;
grant execute on function public.friend_discovery(text,jsonb) to authenticated;

-- Clear expired coordinates on the next discovery request (no background tracking).
alter function public.friend_discovery(text,jsonb) rename to friend_discovery_core;
revoke all on function public.friend_discovery_core(text,jsonb) from public,anon,authenticated;
create function public.friend_discovery(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me();
begin
  if me is null then raise exception 'AMIGOS:Entre na sua conta'; end if;
  update friend_discovery_preferences set latitude=null,longitude=null,located_at=null,nearby=false
    where located_at<clock_timestamp()-interval '2 hours';
  delete from friend_join_invites where inviter_id=me and expires_at<clock_timestamp();
  return public.friend_discovery_core(p_action,p_data);
end $$;
revoke all on function public.friend_discovery(text,jsonb) from public,anon;
grant execute on function public.friend_discovery(text,jsonb) to authenticated;

-- Shop: catalog, sellers, reservations, PSP reconciliation and buyer consent.

-- Migration 20261012000000_shop.sql
-- Loja física independente das comandas. Valores em centavos, sem carteira fictícia.
create table public.shop_sellers (
 id uuid primary key default gen_random_uuid(), owner_player_id uuid not null references players(id),
 name text not null check(length(name) between 3 and 120), kind text not null check(kind in ('official','partner')),
 status text not null default 'pending' check(status in ('pending','active','suspended','declined')),
 phone text not null default '', pickup_address text not null default '', pickup_enabled boolean not null default true,
 delivery_enabled boolean not null default false, delivery_fee_cents integer not null default 0 check(delivery_fee_cents between 0 and 100000),
 cep_prefixes text[] not null default '{}', commission_bps integer not null default 0 check(commission_bps between 0 and 3000),
 terms_version text not null, terms_at timestamptz not null default now(), revision integer not null default 1,
 created_at timestamptz not null default now(), check(pickup_enabled or delivery_enabled)
);
create unique index shop_one_official on shop_sellers(kind) where kind='official';
create table public.shop_products (
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references shop_sellers(id),
 name text not null check(length(name) between 3 and 160), description text not null default '' check(length(description)<=4000),
 category text not null check(category in ('ball','uniform','vest','boots','equipment','other')),
 photos text[] not null default '{}', active boolean not null default false,
 featured_until timestamptz, sponsorship_cents integer not null default 0, sponsorship_reference text,
 revision integer not null default 1, created_at timestamptz not null default now(), check(cardinality(photos)<=5)
);
create table public.shop_variants (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references shop_products(id),
 sku text not null check(length(sku) between 1 and 60), size text not null default '', color text not null default '',
 price_cents integer not null check(price_cents between 1 and 100000000), cost_cents integer not null default 0 check(cost_cents>=0),
 stock integer not null default 0 check(stock>=0), active boolean not null default true, revision integer not null default 1,
 unique(product_id,sku)
);
create table public.shop_gateways (
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references shop_sellers(id),
 provider text not null check(provider in ('mercado_pago','picpay')), collector_id text not null,
 secret_id uuid not null, enabled boolean not null default false, created_at timestamptz not null default now()
);
create unique index shop_active_gateway on shop_gateways(seller_id) where enabled;
create table public.shop_orders (
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references shop_sellers(id), buyer_id uuid not null references players(id),
 nonce uuid not null, gateway_id uuid not null references shop_gateways(id),
 status text not null default 'pending' check(status in ('pending','paid','ready','shipped','delivered','cancelled','refund_pending','refunded','payment_review')),
 fulfillment text not null check(fulfillment in ('pickup','delivery')), address jsonb, customer_phone text not null,
 pickup_address text not null, subtotal_cents integer not null, shipping_cents integer not null, total_cents integer not null,
 commission_cents integer not null, commission_state text not null default 'pending' check(commission_state in ('pending','owed','received','reversed')),
 commission_reference text, provider_fee_cents integer, payment_id text, payment_updated_at timestamptz,
 checkout_state text not null default 'new' check(checkout_state in ('new','building','ready','review')),
 checkout_url text, external_id text, pix_code text, stock_released boolean not null default false,
 refund_reason text, refund_requested_at timestamptz, refund_building boolean not null default false, refund_restock boolean not null default false,
 tracking text, carrier text, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 minutes',
 updated_at timestamptz not null default now(), unique(buyer_id,nonce), check(total_cents=subtotal_cents+shipping_cents), check(total_cents>0)
);
create unique index shop_order_provider_payment on shop_orders(gateway_id,payment_id) where payment_id is not null;
create table public.shop_order_lines (
 order_id uuid references shop_orders(id), variant_id uuid references shop_variants(id),
 product_name text not null, sku text not null, size text not null, color text not null,
 quantity integer not null check(quantity between 1 and 99), unit_cents integer not null, cost_cents integer not null,
 primary key(order_id,variant_id)
);
create table public.shop_events (
 id bigint generated always as identity primary key, order_id uuid references shop_orders(id), seller_id uuid references shop_sellers(id),
 actor_id uuid references players(id), action text not null, detail text not null default '', created_at timestamptz not null default now()
);
create index shop_order_seller_created on shop_orders(seller_id,created_at desc);
create index shop_order_buyer_created on shop_orders(buyer_id,created_at desc);
create index shop_products_catalog on shop_products(seller_id,active,created_at desc);
do $$declare t text;begin foreach t in array array['shop_sellers','shop_products','shop_variants','shop_gateways','shop_orders','shop_order_lines','shop_events'] loop
 execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon,authenticated',t);
end loop;end $$;

create function public.shop_admin(p_me uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from platform_admin_accounts a join players p on p.auth_user_id=a.auth_user_id where p.id=p_me and a.active and a.role in ('owner','admin'))
 and not exists(select 1 from platform_account_controls where player_id=p_me and suspended)
$$;
create function public.shop_manager(p_seller uuid,p_me uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_me is not null and (public.shop_admin(p_me) or exists(select 1 from shop_sellers where id=p_seller and owner_player_id=p_me))
 and not exists(select 1 from platform_account_controls where player_id=p_me and suspended)
$$;
create function public.shop_order_json(p_order uuid,p_me uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select (to_jsonb(o)-array['nonce','gateway_id','refund_building','refund_restock']-case when public.shop_manager(o.seller_id,p_me) then array[]::text[] else array['commission_reference','commission_state','commission_cents','provider_fee_cents'] end)||jsonb_build_object(
 'seller_name',s.name,'seller_phone',s.phone,'buyer_name',p.name,'can_manage',public.shop_manager(o.seller_id,p_me),
 'provider',g.provider,'lines',(select coalesce(jsonb_agg(to_jsonb(l)-case when public.shop_manager(o.seller_id,p_me) then array['order_id'] else array['order_id','cost_cents'] end),'[]') from shop_order_lines l where l.order_id=o.id),
 'events',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'detail',e.detail,'created_at',e.created_at) order by e.id),'[]') from shop_events e where e.order_id=o.id and (public.shop_manager(o.seller_id,p_me) or e.action not in ('commission_received','refund_approved'))))
 from shop_orders o join shop_sellers s on s.id=o.seller_id join players p on p.id=o.buyer_id join shop_gateways g on g.id=o.gateway_id
 where o.id=p_order and (o.buyer_id=p_me or public.shop_manager(o.seller_id,p_me))
$$;
create function public.shop_release(p_order uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare o shop_orders;l record;begin select * into o from shop_orders where id=p_order for update;
 if o.id is null or o.stock_released then return;end if;
 for l in select * from shop_order_lines where order_id=o.id order by variant_id loop update shop_variants set stock=stock+l.quantity,revision=revision+1 where id=l.variant_id;end loop;
 update shop_orders set stock_released=true where id=o.id;
 end $$;
create function public.shop_expire() returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare o record;begin for o in select id from shop_orders where status='pending' and expires_at<now() order by id for update skip locked limit 100 loop
 perform public.shop_release(o.id); update shop_orders set status='cancelled',updated_at=now() where id=o.id;
 insert into shop_events(order_id,action,detail) values(o.id,'cancelled','Prazo do checkout encerrado. Pagamento tardio será tratado em revisão, sem reservar estoque novamente.');
 end loop;end $$;

create function public.shop_snapshot(p_mode text default 'catalog',p_query text default '',p_seller uuid default null,p_offset integer default 0) returns jsonb
 language plpgsql security definer set search_path=public,pg_temp as $$
 declare me uuid:=public.community_chat_me(); admin boolean:=coalesce(public.shop_admin(me),false); result jsonb; catalog jsonb; sellers jsonb;
 begin
 if length(coalesce(p_query,''))>160 or p_offset not between 0 and 100000 then raise exception 'LOJA:Busca inválida';end if;
 if p_mode not in ('catalog','manage') then raise exception 'LOJA:Consulta inválida';end if;
 if p_mode='manage' and me is null then raise exception 'LOJA:Entre na sua conta';end if;
 -- Lazy expiration is idempotent and never marks a payment as approved.
 if me is not null then perform public.shop_expire();end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'kind',s.kind,'status',s.status,'phone',s.phone,
 'pickup_address',s.pickup_address,'pickup_enabled',s.pickup_enabled,'delivery_enabled',s.delivery_enabled,'delivery_fee_cents',s.delivery_fee_cents,
 'cep_prefixes',s.cep_prefixes,'revision',s.revision,'can_manage',public.shop_manager(s.id,me),
 'commission_bps',case when public.shop_manager(s.id,me) then s.commission_bps else null end,
 'gateway',(select jsonb_build_object('provider',g.provider,'enabled',g.enabled) from shop_gateways g where g.seller_id=s.id order by g.created_at desc limit 1))), '[]') into sellers
 from shop_sellers s where (p_mode='catalog' and s.status='active') or (p_mode='manage' and public.shop_manager(s.id,me));
 select coalesce(jsonb_agg(row),'[]') into catalog from (
 select jsonb_build_object('id',p.id,'seller_id',p.seller_id,'seller_name',s.name,'seller_kind',s.kind,'name',p.name,'description',p.description,'category',p.category,
 'photos',p.photos,'active',p.active,'revision',p.revision,'sponsored',coalesce(p.featured_until>now(),false),
 'variants',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'size',v.size,'color',v.color,'price_cents',v.price_cents,'stock',v.stock,'active',v.active,'revision',v.revision,
 'cost_cents',case when p_mode='manage' then v.cost_cents else null end) order by v.sku),'[]') from shop_variants v where v.product_id=p.id and (p_mode='manage' or v.active))) row
 from shop_products p join shop_sellers s on s.id=p.seller_id
 where ((p_mode='catalog' and p.active and s.status='active') or (p_mode='manage' and public.shop_manager(s.id,me)))
 and (p_seller is null or p.seller_id=p_seller) and (p_query='' or position(lower(p_query) in lower(p.name||' '||s.name||' '||p.description))>0)
 order by (coalesce(p.featured_until>now(),false)) desc,p.created_at desc,p.id limit 40 offset p_offset) q;
 result:=jsonb_build_object('admin',admin,'sellers',sellers,'products',catalog,'offset',p_offset,'orders','[]'::jsonb);
 if me is not null then result:=result||jsonb_build_object('orders',(select coalesce(jsonb_agg(public.shop_order_json(id,me)),'[]') from (select id from shop_orders o
 where (p_mode='catalog' and o.buyer_id=me) or (p_mode='manage' and public.shop_manager(o.seller_id,me)) order by created_at desc limit 100) q));end if;
 return result;end $$;

create function public.shop_action(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
 declare me uuid:=public.community_chat_me(); admin boolean:=coalesce(public.shop_admin(me),false); s shop_sellers;p shop_products;v shop_variants;o shop_orders;
 item jsonb; ids uuid[]:='{}'; key uuid; total integer:=0; fee integer:=0; n integer; request_nonce uuid; g shop_gateways; reason text:=btrim(coalesce(p_data->>'reason',''));
 begin
 if me is null then raise exception 'LOJA:Entre com uma conta ativa';end if;
 perform pg_advisory_xact_lock(hashtext('shop-user:'||me::text));
 if p_action='seller_create' then
  if p_data->>'termsVersion' is distinct from 'shop-v1' or not coalesce((p_data->>'consent')::boolean,false) then raise exception 'LOJA:Confirme os termos de vendedor e a publicação dos dados comerciais';end if;
  if p_data->>'kind'='official' and not admin then raise exception 'LOJA:Somente a plataforma cria a loja oficial';end if;
  if (select count(*) from shop_sellers where owner_player_id=me)>=5 then raise exception 'LOJA:Limite de lojas atingido';end if;
  insert into shop_sellers(owner_player_id,name,kind,status,phone,pickup_address,terms_version) values(me,btrim(p_data->>'name'),case when admin and p_data->>'kind'='official' then 'official' else 'partner' end,
   case when admin and p_data->>'kind'='official' then 'active' else 'pending' end,coalesce(p_data->>'phone',''),coalesce(p_data->>'pickupAddress',''),'shop-v1') returning * into s;
  insert into shop_events(seller_id,actor_id,action,detail) values(s.id,me,'seller_created',s.kind);return jsonb_build_object('id',s.id);
 elsif p_action in ('seller_save','seller_review') then
  select * into s from shop_sellers where id=(p_data->>'id')::uuid for update;
  if s.id is null or not public.shop_manager(s.id,me) or (p_data->>'revision')::integer is distinct from s.revision then raise exception 'LOJA:Loja indisponível ou alterada; atualize';end if;
  if p_action='seller_review' then
   if not admin or length(reason) not between 8 and 500 or p_data->>'status' not in ('active','suspended','declined') then raise exception 'LOJA:Revisão administrativa exige autorização e motivo';end if;
   if (p_data->>'commissionBps')::integer not between 0 and 3000 then raise exception 'LOJA:Comissão inválida';end if;
   update shop_sellers set status=p_data->>'status',commission_bps=case when kind='official' then 0 else (p_data->>'commissionBps')::integer end,revision=revision+1 where id=s.id;
  else
   if length(coalesce(p_data->>'phone',''))>30 or length(coalesce(p_data->>'pickupAddress',''))>500 then raise exception 'LOJA:Dados comerciais inválidos';end if;
   if exists(select 1 from jsonb_array_elements_text(coalesce(p_data->'cepPrefixes','[]')) x where x !~ '^[0-9]{3,8}$') then raise exception 'LOJA:Use prefixos de CEP com 3 a 8 dígitos';end if;
   update shop_sellers set name=btrim(p_data->>'name'),phone=coalesce(p_data->>'phone',''),pickup_address=coalesce(p_data->>'pickupAddress',''),
    pickup_enabled=coalesce((p_data->>'pickupEnabled')::boolean,true),delivery_enabled=coalesce((p_data->>'deliveryEnabled')::boolean,false),delivery_fee_cents=coalesce((p_data->>'deliveryFeeCents')::integer,0),
    cep_prefixes=array(select jsonb_array_elements_text(coalesce(p_data->'cepPrefixes','[]'))),revision=revision+1 where id=s.id;
  end if;
  insert into shop_events(seller_id,actor_id,action,detail) values(s.id,me,p_action,reason);return jsonb_build_object('id',s.id);
 elsif p_action='product_save' then
  select * into s from shop_sellers where id=(p_data->>'sellerId')::uuid for update;
  if s.id is null or not public.shop_manager(s.id,me) then raise exception 'LOJA:Sem permissão para este catálogo';end if;
  if jsonb_typeof(p_data->'variants') is distinct from 'array' or jsonb_array_length(p_data->'variants') not between 1 and 30 then raise exception 'LOJA:Informe de 1 a 30 variações';end if;
  if jsonb_array_length(coalesce(p_data->'photos','[]'))>5 or exists(select 1 from jsonb_array_elements_text(coalesce(p_data->'photos','[]')) u where u !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$') then raise exception 'LOJA:Use fotos enviadas à galeria da loja';end if;
  key:=nullif(p_data->>'id','')::uuid;
  if key is not null then select * into p from shop_products where id=key and seller_id=s.id for update;
   if p.id is null or (p_data->>'revision')::integer is distinct from p.revision then raise exception 'LOJA:Produto alterado; atualize antes de salvar';end if;
   update shop_products set name=btrim(p_data->>'name'),description=coalesce(p_data->>'description',''),category=p_data->>'category',photos=array(select jsonb_array_elements_text(coalesce(p_data->'photos','[]'))),
    active=coalesce((p_data->>'active')::boolean,false),revision=revision+1 where id=key returning * into p;
  else insert into shop_products(seller_id,name,description,category,photos,active) values(s.id,btrim(p_data->>'name'),coalesce(p_data->>'description',''),p_data->>'category',array(select jsonb_array_elements_text(coalesce(p_data->'photos','[]'))),coalesce((p_data->>'active')::boolean,false)) returning * into p;end if;
  for item in select value from jsonb_array_elements(p_data->'variants') loop
   key:=nullif(item->>'id','')::uuid;
   if key is not null then select * into v from shop_variants where id=key and product_id=p.id for update;
    if v.id is null or v.revision is distinct from (item->>'revision')::integer then raise exception 'LOJA:Estoque/variação alterados; atualize';end if;
    update shop_variants set sku=item->>'sku',size=coalesce(item->>'size',''),color=coalesce(item->>'color',''),price_cents=(item->>'priceCents')::integer,cost_cents=coalesce((item->>'costCents')::integer,0),stock=(item->>'stock')::integer,active=coalesce((item->>'active')::boolean,true),revision=revision+1 where id=key;
   else insert into shop_variants(product_id,sku,size,color,price_cents,cost_cents,stock,active) values(p.id,item->>'sku',coalesce(item->>'size',''),coalesce(item->>'color',''),(item->>'priceCents')::integer,coalesce((item->>'costCents')::integer,0),(item->>'stock')::integer,coalesce((item->>'active')::boolean,true)) returning id into key;end if;
   ids:=array_append(ids,key);
  end loop;
  update shop_variants set active=false,revision=revision+1 where product_id=p.id and not(id=any(ids));
  insert into shop_events(seller_id,actor_id,action,detail) values(s.id,me,'product_saved',p.name);return jsonb_build_object('id',p.id);
 elsif p_action='sponsor' then
  if not admin or length(reason)<8 or length(coalesce(p_data->>'reference',''))<3 then raise exception 'LOJA:Destaque exige confirmação administrativa e referência do acordo';end if;
  update shop_products set featured_until=(p_data->>'until')::timestamptz,sponsorship_cents=(p_data->>'amountCents')::integer,sponsorship_reference=p_data->>'reference',revision=revision+1 where id=(p_data->>'id')::uuid returning * into p;
  if p.id is null or (p_data->>'amountCents')::integer<0 or (p_data->>'until')::timestamptz>now()+interval '366 days' then raise exception 'LOJA:Destaque inválido';end if;
  insert into shop_events(seller_id,actor_id,action,detail) values(p.seller_id,me,'sponsor',reason);return jsonb_build_object('id',p.id);
 elsif p_action='prepare_order' then
  perform public.shop_expire();request_nonce:=(p_data->>'nonce')::uuid;
  if request_nonce is null then raise exception 'LOJA:Identificador obrigatório';end if;
  select * into o from shop_orders where buyer_id=me and shop_orders.nonce=request_nonce;
  if o.id is not null then if o.seller_id is distinct from (p_data->>'sellerId')::uuid then raise exception 'LOJA:Identificador já utilizado';end if;return public.shop_order_json(o.id,me);end if;
  if (select count(*) from shop_orders where buyer_id=me and created_at>now()-interval '1 hour')>=20 then raise exception 'LOJA:Aguarde antes de criar novos pedidos';end if;
  select * into s from shop_sellers where id=(p_data->>'sellerId')::uuid and status='active' for update;
  if s.id is null then raise exception 'LOJA:Vendedor indisponível';end if;
  select * into g from shop_gateways where seller_id=s.id and enabled;
  if g.id is null then raise exception 'LOJA:O vendedor ainda não habilitou pagamentos homologados';end if;
  if p_data->>'fulfillment'='pickup' then if not s.pickup_enabled or length(s.pickup_address)<5 then raise exception 'LOJA:Retirada não configurada';end if;
  elsif p_data->>'fulfillment'='delivery' then
   if not s.delivery_enabled or coalesce(p_data->'address'->>'cep','') !~ '^\d{8}$' or length(coalesce(p_data->'address'->>'street',''))<3 or length(coalesce(p_data->'address'->>'number',''))<1 or length(coalesce(p_data->'address'->>'city',''))<2 or coalesce(p_data->'address'->>'state','') !~ '^[A-Z]{2}$' then raise exception 'LOJA:Entrega/endereço inválidos';end if;
   if cardinality(s.cep_prefixes)>0 and not exists(select 1 from unnest(s.cep_prefixes) x where (p_data->'address'->>'cep') like x||'%') then raise exception 'LOJA:CEP fora da área de entrega';end if;
   fee:=s.delivery_fee_cents;
  else raise exception 'LOJA:Escolha entrega ou retirada';end if;
  if length(coalesce(p_data->>'phone','')) not between 8 and 30 then raise exception 'LOJA:Informe telefone para este pedido';end if;
  if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 25 then raise exception 'LOJA:Carrinho inválido';end if;
  -- Deterministic row locks and server-side price/stock resolution.
  for item in select value from jsonb_array_elements(p_data->'items') order by value->>'variantId' loop
   key:=(item->>'variantId')::uuid;n:=(item->>'quantity')::integer;
   if key is null or key=any(ids) or n is null or n not between 1 and 99 then raise exception 'LOJA:Quantidade/variação inválida';end if;
   select v0.* into v from shop_variants v0 join shop_products p0 on p0.id=v0.product_id where v0.id=key and p0.seller_id=s.id and p0.active and v0.active for update of v0;
   if v.id is null or v.stock<n then raise exception 'LOJA:Produto indisponível ou estoque insuficiente';end if;
   ids:=array_append(ids,key);total:=total+v.price_cents*n;
  end loop;
  insert into shop_orders(seller_id,buyer_id,nonce,gateway_id,fulfillment,address,customer_phone,pickup_address,subtotal_cents,shipping_cents,total_cents,commission_cents)
   values(s.id,me,request_nonce,g.id,p_data->>'fulfillment',case when p_data->>'fulfillment'='delivery' then p_data->'address' else null end,p_data->>'phone',s.pickup_address,total,fee,total+fee,round(total*s.commission_bps/10000.0)) returning * into o;
  for item in select value from jsonb_array_elements(p_data->'items') order by value->>'variantId' loop
   select * into v from shop_variants where id=(item->>'variantId')::uuid;select * into p from shop_products where id=v.product_id;n:=(item->>'quantity')::integer;
   insert into shop_order_lines values(o.id,v.id,p.name,v.sku,v.size,v.color,n,v.price_cents,v.cost_cents);
   update shop_variants set stock=stock-n,revision=revision+1 where id=v.id;
  end loop;
  insert into shop_events(order_id,seller_id,actor_id,action,detail) values(o.id,s.id,me,'pending','Estoque reservado por 30 minutos. Aguardando pagamento validado.');return public.shop_order_json(o.id,me);
 elsif p_action in ('cancel','refund_request','fulfill','commission_received','restock_return','refund_decline') then
  select * into o from shop_orders where id=(p_data->>'id')::uuid for update;
  if o.id is null or (o.buyer_id<>me and not public.shop_manager(o.seller_id,me)) then raise exception 'LOJA:Pedido indisponível';end if;
  if p_action='cancel' then
   if o.status<>'pending' then raise exception 'LOJA:Pedido pago exige solicitação de reembolso';end if;
   perform public.shop_release(o.id);update shop_orders set status='cancelled',updated_at=now() where id=o.id;
  elsif p_action='refund_request' then
   if o.status not in ('paid','ready','shipped','delivered','payment_review') or length(reason) not between 8 and 500 then raise exception 'LOJA:Informe motivo; este pedido não permite a solicitação';end if;
   update shop_orders set refund_reason=reason,refund_requested_at=now(),updated_at=now() where id=o.id;
  elsif p_action='restock_return' then
   if not public.shop_manager(o.seller_id,me) or o.status<>'refunded' or not coalesce((p_data->>'received')::boolean,false) or length(reason)<8 then raise exception 'LOJA:Confirme o recebimento físico da devolução';end if;
   perform public.shop_release(o.id);
  elsif p_action='refund_decline' then
   if not public.shop_manager(o.seller_id,me) or o.refund_requested_at is null or o.status in ('refund_pending','refunded') or length(reason)<8 then raise exception 'LOJA:Resposta de reembolso indisponível';end if;
   update shop_orders set refund_requested_at=null,refund_reason=reason,updated_at=now() where id=o.id;
  elsif p_action='commission_received' then
   if not admin or o.commission_state<>'owed' or length(coalesce(p_data->>'reference',''))<3 or length(reason)<8 then raise exception 'LOJA:Baixa exige confirmação administrativa e referência do recebimento';end if;
   update shop_orders set commission_state='received',commission_reference=p_data->>'reference',updated_at=now() where id=o.id;
  else
   if not public.shop_manager(o.seller_id,me) then raise exception 'LOJA:Somente o vendedor pode preparar a entrega';end if;
   if not((o.status='paid' and p_data->>'status'='ready') or (o.status in ('paid','ready') and o.fulfillment='delivery' and p_data->>'status'='shipped') or (o.status in ('paid','ready','shipped') and p_data->>'status'='delivered')) then raise exception 'LOJA:Transição de entrega inválida';end if;
   update shop_orders set status=p_data->>'status',tracking=left(p_data->>'tracking',160),carrier=left(p_data->>'carrier',80),updated_at=now() where id=o.id;
  end if;
  insert into shop_events(order_id,seller_id,actor_id,action,detail) values(o.id,o.seller_id,me,p_action,reason);return public.shop_order_json(o.id,me);
 end if;
 raise exception 'LOJA:Ação inválida';end $$;
revoke all on function public.shop_admin(uuid),public.shop_manager(uuid,uuid),public.shop_order_json(uuid,uuid),public.shop_release(uuid),public.shop_expire(),public.shop_snapshot(text,text,uuid,integer),public.shop_action(text,jsonb) from public,anon,authenticated;
grant execute on function public.shop_snapshot(text,text,uuid,integer) to anon,authenticated;
grant execute on function public.shop_action(text,jsonb) to authenticated;

-- Migration 20261012001000_shop_payments.sql
-- Only authenticated, server-verified PSP results can reach these service-only RPCs.
alter table shop_orders add column refund_payment_id text;
create table public.shop_receipts (
 gateway_id uuid references shop_gateways(id), payment_id text, order_id uuid not null references shop_orders(id),
 status text not null check(status in ('approved','refunded','partial_refund','charged_back')),
 amount_cents integer not null, updated_at timestamptz not null, primary key(gateway_id,payment_id)
);
alter table shop_receipts enable row level security;
revoke all on shop_receipts from anon,authenticated;
create function public.shop_order(p_order uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me();r jsonb;begin r:=public.shop_order_json(p_order,me);
if r is null then raise exception 'LOJA:Pedido indisponível';end if;
return r||jsonb_build_object('receipts',(select coalesce(jsonb_agg(jsonb_build_object('payment_id',payment_id,'status',status,'amount_cents',amount_cents)),'[]') from shop_receipts where order_id=p_order));end $$;
revoke all on function public.shop_order(uuid) from public,anon;
grant execute on function public.shop_order(uuid) to authenticated;

create function public.shop_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid;s shop_sellers;o shop_orders;g shop_gateways;secret uuid;r shop_receipts;paid_count integer;total_refunded integer;stamp timestamptz;pay_id text;
begin
 if p_data ? 'actor' then select id into me from players where auth_user_id=(p_data->>'actor')::uuid and not is_guest;
  if me is null or exists(select 1 from platform_account_controls where player_id=me and suspended) then raise exception 'LOJA:Conta indisponível';end if;
 end if;
 if p_action='gateway_save' then
  select * into s from shop_sellers where id=(p_data->>'sellerId')::uuid for update;
  if not public.shop_manager(s.id,me) or s.status<>'active' or jsonb_typeof(p_data->'credentials') is distinct from 'object' then raise exception 'LOJA:Vendedor não autorizado';end if;
  select vault.create_secret((p_data->'credentials')::text) into secret;
  update shop_gateways set enabled=false where seller_id=s.id;
  insert into shop_gateways(seller_id,provider,collector_id,secret_id,enabled) values(s.id,p_data->>'provider',p_data->>'collectorId',secret,true) returning * into g;
  insert into shop_events(seller_id,actor_id,action) values(s.id,me,'gateway_connected');return jsonb_build_object('id',g.id);
 elsif p_action='gateway_context' then
  select * into g from shop_gateways where id=(p_data->>'gatewayId')::uuid;
  if g.id is null then raise exception 'LOJA:Conexão indisponível';end if;
  return (to_jsonb(g)-'secret_id')||jsonb_build_object('credentials',(select decrypted_secret::jsonb from vault.decrypted_secrets where id=g.secret_id));
 end if;
 select * into o from shop_orders where id=(p_data->>'orderId')::uuid for update;
 if o.id is null then raise exception 'LOJA:Pedido indisponível';end if;
 select * into g from shop_gateways where id=o.gateway_id;
 if p_action in ('context','claim_checkout','claim_refund') and (me is null or (o.buyer_id<>me and not public.shop_manager(o.seller_id,me))) then raise exception 'LOJA:Sem permissão para o pedido';end if;
 if p_action='context' then return to_jsonb(o)||jsonb_build_object('gateway',to_jsonb(g)-'secret_id','credentials',(select decrypted_secret::jsonb from vault.decrypted_secrets where id=g.secret_id),'receipts',(select coalesce(jsonb_agg(to_jsonb(r0)),'[]') from shop_receipts r0 where r0.order_id=o.id));
 elsif p_action='claim_checkout' then
  if o.status<>'pending' or o.expires_at<now() or not g.enabled or o.buyer_id<>me then raise exception 'LOJA:Checkout indisponível';end if;
  if o.checkout_state<>'new' then return jsonb_build_object('claimed',false,'url',o.checkout_url);end if;
  update shop_orders set checkout_state='building',updated_at=now() where id=o.id;return jsonb_build_object('claimed',true);
 elsif p_action='checkout_save' then
  if o.checkout_state not in ('building','review') then raise exception 'LOJA:Estado de checkout inválido';end if;
  update shop_orders set external_id=p_data->>'externalId',checkout_url=p_data->>'url',pix_code=p_data->>'pixCode',checkout_state='ready',updated_at=now() where id=o.id;return '{}';
 elsif p_action='claim_refund' then
  if not public.shop_manager(o.seller_id,me) or length(coalesce(p_data->>'reason','')) not between 8 and 500 then raise exception 'LOJA:Reembolso exige vendedor e motivo';end if;
  pay_id:=coalesce(p_data->>'paymentId',o.payment_id);
  select * into r from shop_receipts where gateway_id=g.id and payment_id=pay_id and order_id=o.id and status='approved';
  if r.payment_id is null then raise exception 'LOJA:Pagamento não permite reembolso integral automático; reconcilie primeiro';end if;
  if o.refund_building then return jsonb_build_object('claimed',false);end if;
  update shop_orders set status='refund_pending',refund_payment_id=pay_id,refund_building=true,refund_restock=coalesce((p_data->>'restock')::boolean,false),refund_reason=p_data->>'reason',updated_at=now() where id=o.id;
  insert into shop_events(order_id,seller_id,actor_id,action,detail) values(o.id,o.seller_id,me,'refund_approved',p_data->>'reason');return jsonb_build_object('claimed',true,'paymentId',pay_id);
 elsif p_action='settle' then
  if g.id is distinct from (p_data->>'gatewayId')::uuid or (p_data->>'amountCents')::integer is distinct from o.total_cents or p_data->>'currency' is distinct from 'BRL' then raise exception 'LOJA:Valor, moeda ou destinatário divergentes';end if;
  pay_id:=p_data->>'paymentId';stamp:=(p_data->>'updatedAt')::timestamptz;
  if pay_id is null or length(pay_id)>100 or stamp is null or p_data->>'status' not in ('approved','refunded','partial_refund','charged_back') then raise exception 'LOJA:Resultado de pagamento inválido';end if;
  select * into r from shop_receipts where gateway_id=g.id and payment_id=pay_id for update;
  if r.order_id is not null and r.order_id<>o.id then raise exception 'LOJA:Pagamento vinculado a outro pedido';end if;
  if r.payment_id is not null and (r.updated_at>stamp or (r.status='refunded' and p_data->>'status'='approved')) then return '{}';end if;
  insert into shop_receipts values(g.id,pay_id,o.id,p_data->>'status',o.total_cents,stamp) on conflict(gateway_id,payment_id) do update set status=excluded.status,updated_at=excluded.updated_at;
  select count(*) into paid_count from shop_receipts where order_id=o.id and status='approved';
  if p_data->>'status'='approved' then
   if paid_count>1 or o.stock_released or o.status='cancelled' or (o.status='pending' and o.expires_at<now()) then
    update shop_orders set status='payment_review',payment_id=coalesce(payment_id,pay_id),payment_updated_at=stamp,updated_at=now() where id=o.id;
   elsif o.status='pending' then
    update shop_orders set status='paid',payment_id=pay_id,payment_updated_at=stamp,commission_state=case when commission_cents>0 then 'owed' else 'pending' end,provider_fee_cents=nullif(p_data->>'feeCents','')::integer,updated_at=now() where id=o.id;
    insert into shop_events(order_id,action,detail) values(o.id,'paid','Pagamento confirmado por consulta autenticada ao provedor.');
   end if;
  elsif p_data->>'status'='refunded' and paid_count=0 and not exists(select 1 from shop_receipts where order_id=o.id and status in ('partial_refund','charged_back')) then
   if o.refund_restock then perform public.shop_release(o.id);end if;
   update shop_orders set status='refunded',commission_state='reversed',refund_building=false,payment_updated_at=stamp,updated_at=now() where id=o.id;
   if o.status<>'refunded' then insert into shop_events(order_id,action,detail) values(o.id,'refunded','Reembolso integral confirmado no provedor.');end if;
  else
   update shop_orders set status='payment_review',refund_building=case when refund_payment_id=pay_id then false else refund_building end,payment_updated_at=stamp,updated_at=now() where id=o.id;
  end if;
  return jsonb_build_object('orderId',o.id);
 end if;
 raise exception 'LOJA:Ação de serviço inválida';end $$;
revoke all on function public.shop_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.shop_service(text,jsonb) to service_role;
grant execute on function public.shop_expire() to service_role;
do $$begin if to_regprocedure('cron.schedule(text,text,text)') is not null then
 perform cron.schedule('shop-stock-expiration','*/5 * * * *','select public.shop_expire();');
end if;end $$;

create function public.shop_upload_allowed() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.community_chat_me() is not null and (public.shop_admin(public.community_chat_me()) or exists(select 1 from shop_sellers where owner_player_id=public.community_chat_me()))
$$;
revoke all on function public.shop_upload_allowed() from public,anon;
grant execute on function public.shop_upload_allowed() to authenticated;
-- PGlite fixtures omit Storage; production uses the Supabase bucket and policies.
do $$begin if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('shop-media','shop-media',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
 execute $p$create policy shop_media_read on storage.objects for select to anon,authenticated using(bucket_id='shop-media')$p$;
 execute $p$create policy shop_media_insert on storage.objects for insert to authenticated with check(bucket_id='shop-media' and (storage.foldername(name))[1]=auth.uid()::text and public.shop_upload_allowed())$p$;
 end if;end $$;

-- Migration 20261012002000_shop_hardening.sql
grant select on shop_orders to service_role;
create unique index shop_external_charge on shop_orders(gateway_id,external_id) where external_id is not null;
alter function public.shop_action(text,jsonb) rename to shop_action_core;
revoke all on function public.shop_action_core(text,jsonb) from public,anon,authenticated;
create function public.shop_action(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me();s uuid;result jsonb;v jsonb;
begin
 if me is null then raise exception 'LOJA:Entre com uma conta ativa';end if;
 if p_action='gateway_disconnect' then
  s:=(p_data->>'sellerId')::uuid;if not public.shop_manager(s,me) or length(coalesce(p_data->>'reason',''))<8 then raise exception 'LOJA:Desativação exige responsável e motivo';end if;
  update shop_gateways set enabled=false where seller_id=s;
  insert into shop_events(seller_id,actor_id,action,detail) values(s,me,'gateway_disconnected',p_data->>'reason');return '{}';
 elsif p_action='product_archive' then
  select seller_id into s from shop_products where id=(p_data->>'id')::uuid;
  if not public.shop_manager(s,me) then raise exception 'LOJA:Produto indisponível';end if;
  update shop_products set active=false,revision=revision+1 where id=(p_data->>'id')::uuid;return '{}';
 elsif p_action='product_save' then
  for v in select value from jsonb_array_elements(p_data->'variants') loop
   if length(coalesce(v->>'size',''))>60 or length(coalesce(v->>'color',''))>60 or (v->>'stock')::integer>1000000 then raise exception 'LOJA:Variação fora dos limites';end if;
  end loop;
 elsif p_action='prepare_order' and p_data->>'fulfillment'='delivery' then
  if length(coalesce(p_data->'address'->>'street',''))>200 or length(coalesce(p_data->'address'->>'city',''))>80 or length(coalesce(p_data->'address'->>'number',''))>20 or length(coalesce(p_data->'address'->>'complement',''))>120 then raise exception 'LOJA:Endereço fora dos limites';end if;
  p_data:=jsonb_set(p_data,'{address}',jsonb_build_object('cep',p_data->'address'->>'cep','street',p_data->'address'->>'street','number',p_data->'address'->>'number','complement',coalesce(p_data->'address'->>'complement',''),'city',p_data->'address'->>'city','state',p_data->'address'->>'state'));
 end if;
 result:=public.shop_action_core(p_action,p_data);return result;
end $$;
revoke all on function public.shop_action(text,jsonb) from public,anon;
grant execute on function public.shop_action(text,jsonb) to authenticated;

create function public.shop_cart(p_variants uuid[]) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;begin if cardinality(p_variants)>100 then raise exception 'LOJA:Carrinho fora do limite';end if;
select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'seller_id',p.seller_id,'seller_name',s.name,'seller_kind',s.kind,'name',p.name,'description',p.description,'category',p.category,'photos',p.photos,'active',p.active,'revision',p.revision,'sponsored',coalesce(p.featured_until>now(),false),
'variants',(select jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'size',v.size,'color',v.color,'price_cents',v.price_cents,'stock',v.stock,'active',v.active,'revision',v.revision,'cost_cents',null)) from shop_variants v where v.product_id=p.id and v.id=any(p_variants) and v.active))),'[]') into result
from shop_products p join shop_sellers s on s.id=p.seller_id where p.active and s.status='active' and exists(select 1 from shop_variants v where v.product_id=p.id and v.id=any(p_variants) and v.active);
return result;end $$;
revoke all on function public.shop_cart(uuid[]) from public;
grant execute on function public.shop_cart(uuid[]) to anon,authenticated;

alter function public.shop_service(text,jsonb) rename to shop_service_core;
revoke all on function public.shop_service_core(text,jsonb) from public,anon,authenticated,service_role;
create function public.shop_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin if p_action='review' then
 update shop_orders set status='payment_review',updated_at=now() where id=(p_data->>'orderId')::uuid and status not in ('refunded');
 insert into shop_events(order_id,action,detail) values((p_data->>'orderId')::uuid,'payment_review','Resultado do provedor exige revisão financeira; entrega bloqueada.');return '{}';
end if;return public.shop_service_core(p_action,p_data);end $$;
revoke all on function public.shop_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.shop_service(text,jsonb) to service_role;

-- Migration 20261012003000_shop_consent.sql
-- Buyer acceptance and a preflight that authorizes the seller before any PSP call.
alter table shop_orders add column buyer_terms_version text;
alter table shop_orders add column buyer_terms_at timestamptz;
alter function public.shop_action(text,jsonb) rename to shop_action_validated;
revoke all on function public.shop_action_validated(text,jsonb) from public,anon,authenticated;
create function public.shop_action(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 if p_action='prepare_order' then
  if p_data->>'termsVersion' is distinct from 'shop-buy-v1' or not coalesce((p_data->>'consent')::boolean,false) then raise exception 'LOJA:Confirme os itens, vendedor e condições de entrega';end if;
 end if;
 if p_action='sponsor' and (length(coalesce(p_data->>'reason',''))>500 or length(coalesce(p_data->>'reference',''))>160) then raise exception 'LOJA:Acordo fora dos limites';end if;
 if p_action in ('seller_create','seller_save') and (length(coalesce(p_data->>'phone',''))>30 or length(coalesce(p_data->>'pickupAddress',''))>500) then raise exception 'LOJA:Dados comerciais fora dos limites';end if;
 result:=public.shop_action_validated(p_action,p_data);
 if p_action='prepare_order' then update shop_orders set buyer_terms_version='shop-buy-v1',buyer_terms_at=coalesce(buyer_terms_at,now()) where id=(result->>'id')::uuid and buyer_terms_version is null;end if;
 return result;
end $$;
revoke all on function public.shop_action(text,jsonb) from public,anon;
grant execute on function public.shop_action(text,jsonb) to authenticated;
-- Numeric arithmetic must not overflow for larger baskets before commission rounding.
do $$declare source text;begin
 source:=pg_get_functiondef('public.shop_action_core(text,jsonb)'::regprocedure);
 if position('round(total*s.commission_bps/10000.0)' in source)=0 then raise exception 'Unexpected shop_action_core definition';end if;
 execute replace(source,'round(total*s.commission_bps/10000.0)','round(total::numeric*s.commission_bps/10000.0)');
end $$;
create or replace function public.shop_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid;s shop_sellers;begin
 if p_action='seller_access' then
  select id into me from players where auth_user_id=(p_data->>'actor')::uuid and not is_guest;
  select * into s from shop_sellers where id=(p_data->>'sellerId')::uuid;
  if s.id is null or not public.shop_manager(s.id,me) or s.status<>'active' then raise exception 'LOJA:Vendedor não autorizado';end if;return '{}';
 elsif p_action='review' then
  update shop_orders set status='payment_review',updated_at=now() where id=(p_data->>'orderId')::uuid and status<>'refunded';
  if found then insert into shop_events(order_id,action,detail) values((p_data->>'orderId')::uuid,'payment_review','Resultado do provedor exige revisão financeira; entrega bloqueada.');end if;return '{}';
 end if;return public.shop_service_core(p_action,p_data);
end $$;
revoke all on function public.shop_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.shop_service(text,jsonb) to service_role;

-- Migration 20261012004000_shop_gateway_approval.sql
-- Authentication of merchant credentials is not approval to accept live payments.
do $$declare source text;begin
 source:=pg_get_functiondef('public.shop_service_core(text,jsonb)'::regprocedure);
 if position('p_data->>''collectorId'',secret,true)' in source)=0 then raise exception 'Unexpected gateway_save definition';end if;
 execute replace(source,'p_data->>''collectorId'',secret,true)','p_data->>''collectorId'',secret,false)');
 source:=pg_get_functiondef('public.shop_snapshot(text,text,uuid,integer)'::regprocedure);
 if position('jsonb_build_object(''provider'',g.provider,''enabled'',g.enabled)' in source)=0 then raise exception 'Unexpected shop_snapshot definition';end if;
 execute replace(source,'jsonb_build_object(''provider'',g.provider,''enabled'',g.enabled)','jsonb_build_object(''provider'',g.provider,''enabled'',g.enabled,''id'',case when public.shop_manager(s.id,me) then g.id else null end)');
end $$;
create or replace function public.shop_action(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;me uuid:=public.community_chat_me();g shop_gateways;begin
 if p_action='gateway_enable' then
  if me is null or not public.shop_admin(me) or not coalesce((p_data->>'verified')::boolean,false) or length(coalesce(p_data->>'reason','')) not between 8 and 500 then raise exception 'LOJA:Liberação exige administrador, homologação confirmada e motivo';end if;
  select * into g from shop_gateways where id=(p_data->>'id')::uuid for update;
  if g.id is null or not exists(select 1 from shop_sellers where id=g.seller_id and status='active') then raise exception 'LOJA:Conexão ou vendedor indisponível';end if;
  if exists(select 1 from shop_gateways where seller_id=g.seller_id and created_at>g.created_at) then raise exception 'LOJA:Use a conexão mais recente';end if;
  update shop_gateways set enabled=false where seller_id=g.seller_id and id<>g.id;
  update shop_gateways set enabled=true where id=g.id;
  insert into shop_events(seller_id,actor_id,action,detail) values(g.seller_id,me,'gateway_homologated',p_data->>'reason');return '{}';
 end if;
 if p_action='prepare_order' then
  if p_data->>'termsVersion' is distinct from 'shop-buy-v1' or not coalesce((p_data->>'consent')::boolean,false) then raise exception 'LOJA:Confirme os itens, vendedor e condições de entrega';end if;
 end if;
 if p_action='commission_received' and not exists(select 1 from shop_orders where id=(p_data->>'id')::uuid and status in ('paid','ready','shipped','delivered')) then raise exception 'LOJA:Comissão exige pedido com pagamento sem revisão';end if;
 if p_action='sponsor' and (length(coalesce(p_data->>'reason',''))>500 or length(coalesce(p_data->>'reference',''))>160) then raise exception 'LOJA:Acordo fora dos limites';end if;
 if p_action in ('seller_create','seller_save') and (length(coalesce(p_data->>'phone',''))>30 or length(coalesce(p_data->>'pickupAddress',''))>500) then raise exception 'LOJA:Dados comerciais fora dos limites';end if;
 result:=public.shop_action_validated(p_action,p_data);
 if p_action='prepare_order' then update shop_orders set buyer_terms_version='shop-buy-v1',buyer_terms_at=coalesce(buyer_terms_at,now()) where id=(result->>'id')::uuid and buyer_terms_version is null;end if;
 return result;
end $$;
revoke all on function public.shop_action(text,jsonb) from public,anon;
grant execute on function public.shop_action(text,jsonb) to authenticated;

-- Migration 20261012005000_shop_history.sql
-- Filter the managed store before the report limit; history uses a stable cursor.
do $$declare source text;begin
 source:=pg_get_functiondef('public.shop_snapshot(text,text,uuid,integer)'::regprocedure);
 execute replace(source,'where (p_mode=''catalog'' and o.buyer_id=me) or (p_mode=''manage'' and public.shop_manager(o.seller_id,me)) order by created_at desc limit 100)',
 'where ((p_mode=''catalog'' and o.buyer_id=me) or (p_mode=''manage'' and public.shop_manager(o.seller_id,me))) and (p_seller is null or o.seller_id=p_seller) order by created_at desc,id desc limit 100)');
end $$;
create function public.shop_orders_page(p_mode text default 'buyer',p_seller uuid default null,p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me();ids uuid[];result jsonb;begin
 if me is null or p_mode not in ('buyer','manage') then raise exception 'LOJA:Entre com uma conta ativa';end if;
 if (p_before is null)<>(p_before_id is null) then raise exception 'LOJA:Cursor inválido';end if;
 select array_agg(id order by created_at desc,id desc) into ids from (select id,created_at from shop_orders o
 where ((p_mode='buyer' and o.buyer_id=me) or (p_mode='manage' and public.shop_manager(o.seller_id,me))) and (p_seller is null or o.seller_id=p_seller)
 and (p_before is null or (o.created_at,o.id)<(p_before,p_before_id)) order by o.created_at desc,o.id desc limit 31) q;
 select coalesce(jsonb_agg(public.shop_order_json(id,me) order by ordinal),'[]') into result from unnest(ids[1:30]) with ordinality as q(id,ordinal);
 return jsonb_build_object('orders',result,'hasMore',coalesce(cardinality(ids)>30,false));
end $$;
revoke all on function public.shop_orders_page(text,uuid,timestamptz,uuid) from public,anon;
grant execute on function public.shop_orders_page(text,uuid,timestamptz,uuid) to authenticated;

-- Migration: 20261012010000_venue_academy.sql
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

-- Migration: 20261012011000_venue_operations.sql
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

-- Migration: 20261012012000_venue_realtime_hardening.sql
-- Ping contains no customer names, amounts or lesson roster.
create function public.venue_changed() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare rowdata jsonb;v uuid;begin
 rowdata:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_table_name in('service_tabs','field_bookings','cash_shifts','class_programs') then v:=(rowdata->>'establishment_id')::uuid;
 elsif tg_table_name in('service_orders','sale_payments') then select establishment_id into v from service_tabs where id=(rowdata->>'tab_id')::uuid;
 elsif tg_table_name='service_order_items' then select t.establishment_id into v from service_orders o join service_tabs t on t.id=o.tab_id where o.id=(rowdata->>'order_id')::uuid;
 elsif tg_table_name='class_sessions' then select establishment_id into v from class_programs where id=(rowdata->>'program_id')::uuid;
 end if;if v is not null then perform venue_ping(v);end if;return null;
end$$;
revoke all on function venue_changed() from public,anon,authenticated;
do $$declare t text;begin foreach t in array array['service_tabs','service_orders','service_order_items','sale_payments','field_bookings','class_sessions','class_programs','cash_shifts'] loop
 execute format('create trigger venue_changed after insert or update or delete on %I for each row execute function venue_changed()',t);end loop;end$$;
-- Old enrolment cache does not expose prices to PDV or kitchen-only employees.
drop policy if exists class_enrollments_select_self_or_staff on class_enrollments;
create policy class_enrollments_select_self_or_staff on class_enrollments for select to authenticated using((player_id in(select id from players where auth_user_id=auth.uid()) and platform_account_allowed()) or exists(select 1 from class_sessions s join class_programs p on p.id=s.program_id where s.id=session_id and (venue_can(p.establishment_id,'cash') or venue_can(p.establishment_id,'reports'))));
create policy venue_notices_self on venue_notices for select to authenticated using(player_id in(select id from players where auth_user_id=auth.uid()) and platform_account_allowed());
grant select on venue_notices to authenticated;
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table venue_notices;end if;end$$;

-- Migration: 20261012013000_venue_action_limits.sql
-- Harden RPC request size without changing prices or existing invoices.
do $$declare body text;previous text;signature text;begin
 foreach signature in array array['public.academy_action(text,jsonb)','public.venue_action(text,jsonb)'] loop
  previous:=pg_get_functiondef(signature::regprocedure);
  body:=replace(previous,'if me is null then raise exception ''OPERAÇÃO: Entre na sua conta.'';end if;',
   'if me is null then raise exception ''OPERAÇÃO: Entre na sua conta.'';end if;
    if p_data is null or jsonb_typeof(p_data)<>''object'' or pg_column_size(p_data)>16384 then raise exception ''OPERAÇÃO: Dados inválidos ou muito grandes.'';end if;');
  if body=previous then raise exception 'venue size guard hook missing';end if;execute body;
 end loop;
 previous:=pg_get_functiondef('public.venue_snapshot(uuid)'::regprocedure);
 body:=replace(previous,'''id'',id,''name'',name','''id'',id,''name'',name,''sport_ids'',sport_ids');
 if body=previous then raise exception 'venue field sports hook missing';end if;execute body;
end$$;

-- Migration: 20261012014000_venue_invite_status.sql
-- PDV can monitor authorized invitations without exporting phone/email.
do $$declare body text;previous text;begin
 previous:=pg_get_functiondef('public.venue_snapshot(uuid)'::regprocedure);
 body:=replace(previous,'if venue_can(v,''pdv'') then',
 'if venue_can(v,''pdv'') then
  result:=result||jsonb_build_object(''invites'',coalesce((select jsonb_agg(x) from
   (select i.id,p.name,i.created_at,case when i.status=''queued'' and i.created_at<now()-interval ''24 hours'' then ''expired'' else i.status end status
   from venue_invites i join venue_prospects p on p.id=i.prospect_id where p.establishment_id=v order by i.created_at desc limit 20)x),''[]''::jsonb));');
 if body=previous then raise exception 'venue invite status hook missing';end if;execute body;
 previous:=pg_get_functiondef('public.venue_invite_service(uuid,uuid,text,text)'::regprocedure);
 body:=replace(previous,'if p_action=''peek'' then return jsonb_build_object(''channel'',p.channel,''status'',i.status);end if;',
 'if p_action=''peek'' then return jsonb_build_object(''channel'',p.channel,''status'',case when i.status=''queued'' and i.created_at<now()-interval ''24 hours'' then ''expired'' else i.status end);end if;');
 if body=previous then raise exception 'venue invite expiry hook missing';end if;execute body;
end$$;

-- Migration: 20261012015000_venue_history_permissions.sql
-- Role labels must not bypass the owner's explicit financial grants.
create or replace function public.activity_history_finance(p_venue uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select venue_can(p_venue,'reports') or venue_can(p_venue,'cash')
$$;

-- Customer credit accounts and financial integration (20261012020000 / 20261012021000).
-- Conta por cliente/estabelecimento. Faturar NÃO é receber dinheiro.
create table public.venue_credit_accounts (
 id uuid primary key default gen_random_uuid(),establishment_id uuid not null references establishments(id),player_id uuid not null references players(id),
 enabled boolean not null default true,cut_day integer not null check(cut_day between 1 and 31),limit_cents integer not null check(limit_cents between 1 and 10000000),
 created_by uuid not null references players(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(establishment_id,player_id)
);
create table public.venue_credit_invoices (
 id uuid primary key default gen_random_uuid(),account_id uuid not null references venue_credit_accounts(id),cut_date date not null,created_at timestamptz not null default now(),unique(account_id,cut_date)
);
create table public.venue_credit_rentals (
 id uuid primary key default gen_random_uuid(),account_id uuid not null references venue_credit_accounts(id),booking_id uuid references field_bookings(id) on delete set null,service_date date not null,
 description text not null,amount_cents integer not null check(amount_cents between 1 and 10000000),
 status text not null default 'pending' check(status in('pending','billed','paid','cancelled')),
 created_by uuid not null references players(id),created_at timestamptz not null default now()
);
create unique index venue_credit_rental_occurrence on venue_credit_rentals(booking_id,service_date) where status<>'cancelled';
create table public.venue_credit_lines (
 id uuid primary key default gen_random_uuid(),invoice_id uuid not null references venue_credit_invoices(id),kind text not null check(kind in('food','rental')),
 tab_id uuid unique references service_tabs(id),rental_id uuid unique references venue_credit_rentals(id),
 description text not null,amount_cents integer not null check(amount_cents between 1 and 10000000),
 accepted_by uuid not null references players(id),acceptance text not null check(acceptance in('app','counter')),posted_at timestamptz not null default now(),
 check((kind='food' and tab_id is not null and rental_id is null) or (kind='rental' and rental_id is not null and tab_id is null))
);
create table public.venue_credit_payments (
 id uuid primary key default gen_random_uuid(),invoice_id uuid references venue_credit_invoices(id),rental_id uuid unique references venue_credit_rentals(id),
 amount_cents integer not null check(amount_cents between 1 and 10000000),method text not null check(method in('cash','manual_pix')),
 reference text,received_by uuid not null references players(id),paid_at timestamptz not null default now(),
 check((invoice_id is null)<>(rental_id is null)),check(method='cash' or (reference is not null and length(trim(reference)) between 4 and 120))
);
create table public.venue_credit_allocations (
 payment_id uuid not null references venue_credit_payments(id),line_id uuid not null references venue_credit_lines(id),amount_cents integer not null check(amount_cents>0),primary key(payment_id,line_id)
);
create table public.venue_credit_requests (
 id uuid primary key,actor uuid not null references players(id),action text not null,request_data jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
create index venue_credit_lines_invoice on venue_credit_lines(invoice_id,posted_at);
create index venue_credit_payments_invoice on venue_credit_payments(invoice_id,paid_at);
do $$declare t text;begin foreach t in array array['venue_credit_accounts','venue_credit_invoices','venue_credit_rentals','venue_credit_lines','venue_credit_payments','venue_credit_allocations','venue_credit_requests'] loop
 execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon,authenticated',t);end loop;end$$;
create function public.credit_cut_date(day_of_month integer,on_date date) returns date language plpgsql immutable set search_path=public,pg_temp as $$
declare first_day date:=date_trunc('month',on_date)::date;last_day date;result date;begin
 if day_of_month not between 1 and 31 then raise exception 'FATURA: Dia de corte inválido.';end if;
 last_day:=(first_day+interval '1 month'-interval '1 day')::date;result:=first_day+least(day_of_month,extract(day from last_day)::integer)-1;
 if on_date>result then first_day:=(first_day+interval '1 month')::date;last_day:=(first_day+interval '1 month'-interval '1 day')::date;result:=first_day+least(day_of_month,extract(day from last_day)::integer)-1;end if;return result;
end$$;
create function public.credit_balance(i uuid) returns bigint language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select sum(amount_cents) from venue_credit_lines where invoice_id=i),0)-coalesce((select sum(amount_cents) from venue_credit_payments where invoice_id=i),0)
$$;
create function public.credit_account_balance(a uuid) returns bigint language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(sum(credit_balance(id)),0) from venue_credit_invoices where account_id=a
$$;
create function public.credit_tab_read(t uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select community_chat_me() is not null and exists(select 1 from service_tabs st where st.id=t and
 (venue_can(st.establishment_id,'pdv') or venue_can(st.establishment_id,'cash') or st.customer_player_id=community_chat_me()
 or exists(select 1 from tab_participants p where p.tab_id=t and p.player_id=community_chat_me())
 or exists(select 1 from venue_credit_lines l join venue_credit_invoices i on i.id=l.invoice_id join venue_credit_accounts a on a.id=i.account_id where l.tab_id=t and a.player_id=community_chat_me())))
$$;
drop policy if exists service_tabs_select_involved on service_tabs;
create policy service_tabs_select_involved on service_tabs for select to authenticated using(credit_tab_read(id));
-- Freeze only the financial source of a transferred tab. Kitchen fulfillment remains allowed.
create function public.credit_source_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare rowdata jsonb;afterdata jsonb;tab uuid;begin
 rowdata:=case when tg_op='INSERT' then to_jsonb(new) else to_jsonb(old) end;
 afterdata:=case when tg_op<>'DELETE' then to_jsonb(new) end;
 if tg_op='UPDATE' and ((rowdata->'tab_id') is distinct from (afterdata->'tab_id') or
  (rowdata->'order_id') is distinct from (afterdata->'order_id') or
  (rowdata->'item_id') is distinct from (afterdata->'item_id') or
  (rowdata->'payment_id') is distinct from (afterdata->'payment_id')) then
  raise exception 'FATURA: Não é permitido transferir registros financeiros entre comandas.';
 end if;
 if tg_table_name in('sale_payments','sale_payment_intents','service_orders','tab_participants') then tab:=(rowdata->>'tab_id')::uuid;
 elsif tg_table_name='service_order_items' then select tab_id into tab from service_orders where id=(rowdata->>'order_id')::uuid;
 elsif tg_table_name='order_item_shares' then select o.tab_id into tab from service_order_items i join service_orders o on o.id=i.order_id where i.id=(rowdata->>'item_id')::uuid;
 elsif tg_table_name='sale_payment_allocations' then select tab_id into tab from sale_payments where id=(rowdata->>'payment_id')::uuid;
 elsif tg_table_name='service_tabs' then tab:=(rowdata->>'id')::uuid;
 end if;
 perform 1 from service_tabs where id=tab for update;
 if exists(select 1 from venue_credit_lines where tab_id=tab) then
  if tg_table_name='service_order_items' and tg_op='UPDATE' and afterdata->>'status' in('preparing','ready','delivered') and
   (to_jsonb(new)-'status')=(to_jsonb(old)-'status') then return new;end if;
  if tg_table_name='service_orders' and tg_op='UPDATE' and afterdata->>'status' in('preparing','ready','delivered') and
   (to_jsonb(new)-'status'-'completed_at')=(to_jsonb(old)-'status'-'completed_at') then return new;end if;
  if tg_table_name='service_tabs' and tg_op='UPDATE' and afterdata->>'status'='closed' and
   (to_jsonb(new)-'status'-'closed_at')=(to_jsonb(old)-'status'-'closed_at') then return new;end if;
  -- Preserve a genuine provider reversal, but flag it for owner review instead of inventing a new debt.
  if tg_table_name='sale_payments' and tg_op='UPDATE' and auth.role()='service_role' and afterdata->'reversed_at' is distinct from rowdata->'reversed_at' and
   (to_jsonb(new)-'reversed_at')=(to_jsonb(old)-'reversed_at') then
   insert into venue_notices(player_id,establishment_id,title,body) select e.owner_player_id,e.id,'Conferir estorno em comanda faturada','Houve estorno de um pagamento anterior. Confira a fatura; nenhum novo débito foi gerado automaticamente.' from service_tabs s join establishments e on e.id=s.establishment_id where s.id=tab;
   return new;
  end if;
  raise exception 'FATURA: Comanda faturada: o valor não pode ser cobrado ou alterado novamente.';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
do $$declare t text;begin foreach t in array array['sale_payments','sale_payment_intents','sale_payment_allocations','service_orders','service_order_items','order_item_shares','tab_participants','service_tabs'] loop
 execute format('create trigger credit_source_guard before insert or update or delete on %I for each row execute function credit_source_guard()',t);end loop;end$$;
create function public.credit_invoice_json(p_invoice uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select to_jsonb(i)||jsonb_build_object('venue_id',a.establishment_id,'venue_name',e.name,'customer_name',p.name,'player_id',a.player_id,
 'total_cents',coalesce((select sum(amount_cents) from venue_credit_lines where invoice_id=i.id),0),'balance_cents',credit_balance(i.id),
 'status',case when credit_balance(i.id)=0 then case when i.cut_date>=(now() at time zone 'America/Sao_Paulo')::date then 'zero_open' else 'paid' end when i.cut_date<(now() at time zone 'America/Sao_Paulo')::date then 'overdue' else 'open' end,
 'lines',coalesce((select jsonb_agg(l order by posted_at,id) from venue_credit_lines l where invoice_id=i.id),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'amount_cents',r.amount_cents,'method',r.method,'reference',r.reference,'paid_at',r.paid_at,'confirmation','counter')) from venue_credit_payments r where invoice_id=i.id),'[]'::jsonb))
 from venue_credit_invoices i join venue_credit_accounts a on a.id=i.account_id join establishments e on e.id=a.establishment_id join players p on p.id=a.player_id where i.id=p_invoice
$$;
create function public.credit_snapshot(p_venue uuid default null,p_tab uuid default null,p_mode text default 'statement') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();v uuid:=p_venue;tab service_tabs;result jsonb;staff boolean;begin
 if me is null then raise exception 'FATURA: Entre na sua conta.';end if;
 if p_mode not in('statement','directory','tab') then raise exception 'FATURA: Consulta inválida.';end if;
 if p_mode='directory' then
  if not venue_can(v,'pdv') then raise exception 'FATURA: Sem acesso ao PDV.';end if;
  return jsonb_build_object('customers',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'player_id',p.id,'name',p.name)) from venue_credit_accounts a join players p on p.id=a.player_id where a.establishment_id=v and a.enabled),'[]'::jsonb));
 end if;
 if p_mode='tab' then
  select * into tab from service_tabs where id=p_tab;v:=tab.establishment_id;
  if not credit_tab_read(p_tab) then raise exception 'FATURA: Sem acesso à comanda.';end if;
  return jsonb_build_object('venue_id',v,'me',me,'can_record',venue_can(v,'cash'),'tab_id',p_tab,
   'balance_cents',greatest(0,(select coalesce(round(sum(i.quantity*i.unit_price)*100),0) from service_order_items i join service_orders o on o.id=i.order_id where o.tab_id=p_tab and i.status<>'cancelled')-(select coalesce(round(sum(amount)*100),0) from sale_payments where tab_id=p_tab and reversed_at is null)),
   'billed',(select to_jsonb(l)||jsonb_build_object('cut_date',i.cut_date,'customer_name',p.name,'invoice_balance_cents',credit_balance(i.id)) from venue_credit_lines l join venue_credit_invoices i on i.id=l.invoice_id join venue_credit_accounts a on a.id=i.account_id join players p on p.id=a.player_id where l.tab_id=p_tab),
   'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',p.name,'player_id',p.id,'cut_day',a.cut_day,'limit_cents',a.limit_cents,'balance_cents',credit_account_balance(a.id),'overdue',exists(select 1 from venue_credit_invoices i where i.account_id=a.id and i.cut_date<(now() at time zone 'America/Sao_Paulo')::date and credit_balance(i.id)>0))) from venue_credit_accounts a join players p on p.id=a.player_id where a.establishment_id=v and a.enabled and (a.player_id=me or venue_can(v,'cash'))),'[]'::jsonb));
 end if;
 staff:=v is not null and (venue_can(v,'cash') or venue_can(v,'reports'));
 if v is not null and not staff and not exists(select 1 from venue_credit_accounts where establishment_id=v and player_id=me) then raise exception 'FATURA: Sem acesso às faturas deste estabelecimento.';end if;
 result:=jsonb_build_object('me',me,'owner',v is not null and is_establishment_owner(v),'can_record',v is not null and venue_can(v,'cash'),'can_offer',v is not null and (is_establishment_owner(v) or venue_can(v,'cash') and venue_can(v,'reservations')),
  'accounts',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('name',p.name,'venue_name',e.name,'balance_cents',credit_account_balance(a.id),'overdue',exists(select 1 from venue_credit_invoices i where i.account_id=a.id and i.cut_date<(now() at time zone 'America/Sao_Paulo')::date and credit_balance(i.id)>0))) from venue_credit_accounts a join players p on p.id=a.player_id join establishments e on e.id=a.establishment_id where (v is null or a.establishment_id=v) and (a.player_id=me or staff)),'[]'::jsonb),
  'invoices',coalesce((select jsonb_agg(credit_invoice_json(i.id) order by i.cut_date desc,i.id) from (select i.* from venue_credit_invoices i join venue_credit_accounts a on a.id=i.account_id where (v is null or a.establishment_id=v) and (a.player_id=me or staff) order by i.cut_date desc,i.id limit 100)i),'[]'::jsonb),
  'rentals',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('customer_name',p.name,'venue_name',e.name,'venue_id',a.establishment_id,'payment',(select jsonb_build_object('amount_cents',r.amount_cents,'method',r.method,'paid_at',r.paid_at) from venue_credit_payments r where r.rental_id=q.id))) from venue_credit_rentals q join venue_credit_accounts a on a.id=q.account_id join players p on p.id=a.player_id join establishments e on e.id=a.establishment_id where (v is null or a.establishment_id=v) and (a.player_id=me or staff)),'[]'::jsonb));
 if staff then result:=result||jsonb_build_object('bookings',coalesce((select jsonb_agg(b) from (select id,team_name,date,day_of_week,recurrence,time,duration_minutes from field_bookings where establishment_id=v order by created_at desc limit 100)b),'[]'::jsonb));end if;return result;
end$$;
create function public.credit_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();v uuid;target uuid;account venue_credit_accounts;tab service_tabs;quote venue_credit_rentals;booking field_bookings;
 invoice venue_credit_invoices;prior venue_credit_requests;nonce uuid;result jsonb;amount bigint;balance bigint;pay uuid;line_id uuid;cut date;remaining integer;part integer;rowline record;
begin
 if me is null then raise exception 'FATURA: Entre na sua conta.';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>16384 then raise exception 'FATURA: Dados inválidos.';end if;
 nonce:=(p_data->>'requestId')::uuid;if nonce is null then raise exception 'FATURA: Identificador da operação obrigatório.';end if;
 perform pg_advisory_xact_lock(hashtext(nonce::text));select * into prior from venue_credit_requests where id=nonce;
 if prior.id is not null then if prior.actor<>me or prior.action<>p_action or prior.request_data<>p_data then raise exception 'FATURA: Identificador já utilizado em outra operação.';end if;return prior.result;end if;
 if p_action='account_save' then
  v:=(p_data->>'venueId')::uuid;if not is_establishment_owner(v) then raise exception 'FATURA: Somente o dono autoriza crédito.';end if;
  select p.id into target from players p join auth.users u on u.id=p.auth_user_id where lower(u.email)=lower(trim(p_data->>'email')) and u.email_confirmed_at is not null and not p.is_guest;
  if target is null then raise exception 'FATURA: Informe e-mail de uma conta confirmada.';end if;
  perform pg_advisory_xact_lock(hashtext(v::text||target::text));
  select * into account from venue_credit_accounts where establishment_id=v and player_id=target for update;
  if account.id is not null and account.cut_day<>(p_data->>'cutDay')::int and credit_account_balance(account.id)>0 then raise exception 'FATURA: Quite o saldo antes de mudar o corte. Faturas existentes não mudam de data.';end if;
  if coalesce((p_data->>'limitCents')::int,0)<credit_account_balance(account.id) then raise exception 'FATURA: Limite menor que o saldo já lançado.';end if;
  insert into venue_credit_accounts(establishment_id,player_id,enabled,cut_day,limit_cents,created_by) values(v,target,true,(p_data->>'cutDay')::int,(p_data->>'limitCents')::int,me)
   on conflict(establishment_id,player_id) do update set enabled=true,cut_day=excluded.cut_day,limit_cents=excluded.limit_cents,updated_at=now() returning * into account;
 elsif p_action='account_disable' then
  select * into account from venue_credit_accounts where id=(p_data->>'accountId')::uuid for update;v:=account.establishment_id;
  if not is_establishment_owner(v) then raise exception 'FATURA: Somente o dono suspende crédito.';end if;
  update venue_credit_accounts set enabled=false,updated_at=now() where id=account.id;
 elsif p_action='open_tab' then
  select * into account from venue_credit_accounts where id=(p_data->>'accountId')::uuid for update;v:=account.establishment_id;
  if not venue_can(v,'pdv') or not account.enabled then raise exception 'FATURA: Cliente sem crédito ativo ou PDV não autorizado.';end if;
  insert into service_tabs(establishment_id,label,customer_player_id,customer_name,table_label,opened_by_player_id)
   select v,'C-'||upper(substr(nonce::text,1,8)),p.id,p.name,nullif(trim(p_data->>'table'),''),me from players p where p.id=account.player_id returning * into tab;
  insert into tab_participants(tab_id,player_id,name) values(tab.id,account.player_id,tab.customer_name);
  result:=jsonb_build_object('id',tab.id,'tab',to_jsonb(tab),'participant',(select to_jsonb(t) from tab_participants t where tab_id=tab.id limit 1));
 elsif p_action='rental_offer' then
  select * into account from venue_credit_accounts where id=(p_data->>'accountId')::uuid for update;v:=account.establishment_id;
  if not (is_establishment_owner(v) or venue_can(v,'cash') and venue_can(v,'reservations')) or not account.enabled then raise exception 'FATURA: Sem permissão ou cliente sem crédito ativo.';end if;
  select * into booking from field_bookings where id=(p_data->>'bookingId')::uuid and establishment_id=v for update;
  cut:=(p_data->>'date')::date;amount:=(p_data->>'amountCents')::int;
  if booking.id is null or cut is null or cut<(now() at time zone 'America/Sao_Paulo')::date-30 or cut>(now() at time zone 'America/Sao_Paulo')::date+365 or
   (booking.recurrence='single' and cut<>booking.date) or (booking.recurrence='weekly' and extract(dow from cut)::int<>booking.day_of_week) then raise exception 'FATURA: Reserva ou ocorrência inválida.';end if;
  if exists(select 1 from games g where g.field_id=booking.field_id and g.pelada_id=booking.pelada_id and g.status<>'cancelled' and (g.scheduled_at at time zone 'America/Sao_Paulo')::date=cut) then raise exception 'FATURA: Reserva vinculada a jogo: use o rateio, sem duplicar a locação inteira.';end if;
  insert into venue_credit_rentals(account_id,booking_id,service_date,description,amount_cents,created_by)
   values(account.id,booking.id,cut,'Locação · '||booking.team_name||' · '||cut::text||' '||booking.time,amount,me) returning * into quote;
  insert into venue_notices(player_id,establishment_id,title,body) values(account.player_id,v,'Valor de locação para confirmar',quote.description||'. Escolha em Faturas se vai pagar na hora ou deixar no corte.');
 elsif p_action in('post_tab','post_rental') then
  select * into account from venue_credit_accounts where id=(p_data->>'accountId')::uuid for update;v:=account.establishment_id;
  if account.id is null or not account.enabled or (account.player_id<>me and not venue_can(v,'cash')) then raise exception 'FATURA: Cliente não autorizado a deixar na fatura.';end if;
  if (p_data->>'consent')::boolean is distinct from true then raise exception 'FATURA: Confirme autorização para assumir este valor.';end if;
  if p_action='post_tab' then
   select * into tab from service_tabs where id=(p_data->>'tabId')::uuid and establishment_id=v for update;
   if tab.id is null or not credit_tab_read(tab.id) or tab.status not in('open','awaiting_payment','partially_paid') or exists(select 1 from venue_credit_lines where tab_id=tab.id) then raise exception 'FATURA: Comanda não disponível para faturar.';end if;
   if exists(select 1 from sale_payment_intents where tab_id=tab.id) then raise exception 'FATURA: Esta comanda já entrou no fluxo de pagamento. Não pode migrar para fatura; resolva o pagamento iniciado.';end if;
   select greatest(0,coalesce((select round(sum(i.quantity*i.unit_price)*100) from service_order_items i join service_orders o on o.id=i.order_id where o.tab_id=tab.id and i.status<>'cancelled'),0)-coalesce((select round(sum(sp.amount)*100) from sale_payments sp where sp.tab_id=tab.id and sp.reversed_at is null),0)) into amount;
  else
   select * into quote from venue_credit_rentals where id=(p_data->>'rentalId')::uuid and account_id=account.id for update;
   if quote.id is null or quote.status<>'pending' then raise exception 'FATURA: Locação já tratada ou não pertence a esta conta.';end if;amount:=quote.amount_cents;
  end if;
  if amount<=0 or amount is distinct from (p_data->>'expectedCents')::int then raise exception 'FATURA: O saldo mudou. Atualize antes de confirmar.';end if;
  if exists(select 1 from venue_credit_invoices where account_id=account.id and cut_date<(now() at time zone 'America/Sao_Paulo')::date and credit_balance(id)>0) then raise exception 'FATURA: Há fatura vencida. Pague na hora ou quite o atraso.';end if;
  if credit_account_balance(account.id)+amount>account.limit_cents then raise exception 'FATURA: Limite insuficiente. Pague na hora ou peça revisão ao dono.';end if;
  cut:=credit_cut_date(account.cut_day,(now() at time zone 'America/Sao_Paulo')::date);
  insert into venue_credit_invoices(account_id,cut_date) values(account.id,cut) on conflict(account_id,cut_date) do update set cut_date=excluded.cut_date returning * into invoice;
  insert into venue_credit_lines(invoice_id,kind,tab_id,rental_id,description,amount_cents,accepted_by,acceptance)
   values(invoice.id,case when p_action='post_tab' then 'food' else 'rental' end,case when p_action='post_tab' then tab.id end,case when p_action='post_rental' then quote.id end,
   case when p_action='post_tab' then 'Consumo · '||tab.label||' · '||tab.customer_name else quote.description end,amount,me,case when me=account.player_id then 'app' else 'counter' end) returning id into line_id;
  if p_action='post_tab' then update service_tabs set status='closed',closed_at=now() where id=tab.id;else update venue_credit_rentals set status='billed' where id=quote.id;end if;
  insert into venue_notices(player_id,establishment_id,title,body) values(account.player_id,v,'Lançamento na fatura','R$ '||(amount/100.0)::text||' incluído na sua fatura. Corte: '||cut::text||'. Consulte Faturas.');
  result:=jsonb_build_object('id',invoice.id,'cutDate',cut,'amountCents',amount);
 elsif p_action in('receive_invoice','receive_rental') then
  if p_action='receive_invoice' then select * into invoice from venue_credit_invoices where id=(p_data->>'invoiceId')::uuid;select * into account from venue_credit_accounts where id=invoice.account_id for update;balance:=credit_balance(invoice.id);
  else select * into quote from venue_credit_rentals where id=(p_data->>'rentalId')::uuid;select * into account from venue_credit_accounts where id=quote.account_id for update;
   select * into quote from venue_credit_rentals where id=quote.id for update;if quote.status<>'pending' then raise exception 'FATURA: Locação já tratada.';end if;balance:=quote.amount_cents;end if;
  v:=account.establishment_id;
  if not venue_can(v,'cash') then raise exception 'FATURA: Só o caixa autorizado registra recebimento.';end if;
  perform pg_advisory_xact_lock(hashtext('cash:'||v::text));
  if (p_data->>'confirmed')::boolean is distinct from true then raise exception 'FATURA: Confira o recebimento antes de registrar.';end if;
  amount:=(p_data->>'amountCents')::int;
  if amount is null or amount<=0 or amount>balance or (p_action='receive_rental' and amount<>balance) then raise exception 'FATURA: Valor inválido ou superior ao saldo.';end if;
  insert into venue_credit_payments(invoice_id,rental_id,amount_cents,method,reference,received_by,paid_at)
   values(case when p_action='receive_invoice' then invoice.id end,case when p_action='receive_rental' then quote.id end,amount,p_data->>'method',nullif(trim(p_data->>'reference'),''),me,clock_timestamp()) returning id into pay;
  if p_action='receive_invoice' then
   remaining:=amount;
   for rowline in select l.id,l.amount_cents-coalesce((select sum(a.amount_cents) from venue_credit_allocations a where a.line_id=l.id),0) pending from venue_credit_lines l where invoice_id=invoice.id order by posted_at,id loop
    part:=least(remaining,rowline.pending);if part>0 then insert into venue_credit_allocations values(pay,rowline.id,part);remaining:=remaining-part;end if;exit when remaining=0;
   end loop;if remaining<>0 then raise exception 'FATURA: Divergência de saldo: procure o dono.';end if;
  else update venue_credit_rentals set status='paid' where id=quote.id;end if;
  insert into venue_notices(player_id,establishment_id,title,body) values(account.player_id,v,'Recebimento registrado pelo caixa','R$ '||(amount/100.0)::text||' conferido presencialmente. Isso não é confirmação automática de gateway.');
  result:=jsonb_build_object('id',pay);
 elsif p_action='cancel_rental' then
  select * into quote from venue_credit_rentals where id=(p_data->>'rentalId')::uuid for update;select * into account from venue_credit_accounts where id=quote.account_id;v:=account.establishment_id;
  if (not is_establishment_owner(v) and account.player_id<>me) or quote.status<>'pending' then raise exception 'FATURA: Só o cliente ou dono cancela solicitação pendente.';end if;
  update venue_credit_rentals set status='cancelled' where id=quote.id;
 else raise exception 'FATURA: Ação inválida.';end if;
 if v is null then raise exception 'FATURA: Registro não encontrado.';end if;
 result:=coalesce(result,jsonb_build_object('id',coalesce(quote.id,account.id)));
 insert into venue_credit_requests values(nonce,me,p_action,p_data,result,now());
 insert into venue_audit(establishment_id,actor,action,target_id,details) values(v,me,'credit_'||p_action,(result->>'id')::uuid,jsonb_build_object('amountCents',amount));perform venue_ping(v);return result;
end$$;
revoke all on function credit_cut_date(integer,date),credit_balance(uuid),credit_account_balance(uuid),credit_tab_read(uuid),credit_source_guard(),credit_invoice_json(uuid),credit_snapshot(uuid,uuid,text),credit_action(text,jsonb) from public,anon,authenticated;
grant execute on function credit_tab_read(uuid),credit_snapshot(uuid,uuid,text),credit_action(text,jsonb) to authenticated;

create function public.credit_booking_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if exists(select 1 from venue_credit_rentals where booking_id=old.id and status<>'cancelled') and
 (tg_op='DELETE' or (to_jsonb(new)-'notes') is distinct from (to_jsonb(old)-'notes')) then raise exception 'FATURA: Reserva tem valor combinado/faturado; trate a solicitação e o financeiro antes de alterar.';end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
create trigger credit_booking_guard before update or delete on field_bookings for each row execute function credit_booking_guard();
revoke all on function credit_booking_guard() from public,anon,authenticated;
-- Existing financial views include actual collections, not invoice issuance.
do $$declare body text;previous text;begin
 previous:=pg_get_functiondef('public.venue_snapshot(uuid)'::regprocedure);
 body:=replace(previous,'if venue_can(v,''reports'') or venue_can(v,''cash'') then',
 'if venue_can(v,''reports'') or venue_can(v,''cash'') then
  result:=result||jsonb_build_object(''invoice_pending_cents'',coalesce((select sum(credit_account_balance(id)) from venue_credit_accounts where establishment_id=v),0),
   ''credit_received_cents'',coalesce((select sum(p.amount_cents) from venue_credit_payments p left join venue_credit_invoices i on i.id=p.invoice_id left join venue_credit_rentals q on q.id=p.rental_id join venue_credit_accounts a on a.id=coalesce(i.account_id,q.account_id) where a.establishment_id=v and (p.paid_at at time zone ''America/Sao_Paulo'')::date=(now() at time zone ''America/Sao_Paulo'')::date),0));');
 if body=previous then raise exception 'credit venue snapshot hook missing';end if;execute body;
 previous:=pg_get_functiondef('public.venue_action(text,jsonb)'::regprocedure);
 body:=replace(previous,'into expected;',
 '+coalesce((select sum(p.amount_cents)/100.0 from venue_credit_payments p left join venue_credit_invoices i on i.id=p.invoice_id left join venue_credit_rentals q on q.id=p.rental_id join venue_credit_accounts a on a.id=coalesce(i.account_id,q.account_id) where a.establishment_id=v and p.method=''cash'' and p.paid_at>=shift.opened_at),0) into expected;');
 if body=previous then raise exception 'credit cash shift hook missing';end if;execute body;
end$$;

-- Clients may see fewer legacy payment rows under RLS. Display authoritative
-- totals for the whole tab they are explicitly about to assume, not a cache sum.
do $$declare body text;previous text;begin
 previous:=pg_get_functiondef('public.credit_snapshot(uuid,uuid,text)'::regprocedure);
 body:=replace(previous,'''tab_id'',p_tab,',
 '''tab_id'',p_tab,
   ''gross_cents'',(select coalesce(round(sum(i.quantity*i.unit_price)*100),0) from service_order_items i join service_orders o on o.id=i.order_id where o.tab_id=p_tab and i.status<>''cancelled'' and o.status<>''cancelled''),
   ''paid_cents'',(select coalesce(round(sum(amount)*100),0) from sale_payments where tab_id=p_tab and reversed_at is null),
   ''payment_started'',exists(select 1 from sale_payment_intents where tab_id=p_tab),
   ''can_bill'',tab.status in(''open'',''awaiting_payment'',''partially_paid''),');
 if body=previous then raise exception 'credit tab totals hook missing';end if;
 body:=replace(body,'where o.tab_id=p_tab and i.status<>''cancelled'')','where o.tab_id=p_tab and i.status<>''cancelled'' and o.status<>''cancelled'')');
 execute body;
 previous:=pg_get_functiondef('public.credit_action(text,jsonb)'::regprocedure);
 body:=replace(previous,'where o.tab_id=tab.id and i.status<>''cancelled'')','where o.tab_id=tab.id and i.status<>''cancelled'' and o.status<>''cancelled'')');
 if body=previous then raise exception 'credit cancelled order hook missing';end if;execute body;
end$$;

-- A payment on another tab must not mutate shares belonging to a billed tab.
do $$declare previous text;body text;begin
 previous:=pg_get_functiondef('public.credit_source_guard()'::regprocedure);
 body:=replace(previous,'perform 1 from service_tabs where id=tab for update;',
 'perform 1 from service_tabs where id=tab for update;
 if tg_table_name=''sale_payment_allocations'' and tg_op<>''DELETE'' and not exists(
  select 1 from order_item_shares s join service_order_items i on i.id=s.item_id join service_orders o on o.id=i.order_id
  where s.id=(afterdata->>''item_share_id'')::uuid and o.tab_id=tab
 ) then raise exception ''FATURA: Pagamento e parte consumida devem pertencer à mesma comanda.'';end if;');
 if body=previous then raise exception 'credit allocation hook missing';end if;execute body;
end$$;

-- Invoice ledger v2: migrations 20261012030000 through 20261012036000.
-- Immutable corrections, separate due dates, individually attributable sources.
alter table venue_credit_accounts add column due_days int not null default 0 check(due_days between 0 and 45);
alter table venue_credit_invoices add column due_date date;
update venue_credit_invoices set due_date=cut_date;
alter table venue_credit_invoices alter column due_date set not null;
create function credit_invoice_due() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 new.due_date:=new.cut_date+(select due_days from venue_credit_accounts where id=new.account_id);return new;end$$;
create trigger credit_invoice_due before insert on venue_credit_invoices for each row execute function credit_invoice_due();
alter table venue_credit_lines drop constraint venue_credit_lines_kind_check;
alter table venue_credit_lines drop constraint venue_credit_lines_check;
alter table venue_credit_lines drop constraint venue_credit_lines_tab_id_key;
alter table venue_credit_lines add column participant_id uuid references tab_participants(id);
alter table venue_credit_lines add column academy_bill_id uuid unique references academy_bills(id);
alter table venue_credit_lines add column game_payment_id uuid unique references payments(id);
alter table venue_credit_lines add constraint credit_line_source check(
 (kind='food' and tab_id is not null and rental_id is null and academy_bill_id is null and game_payment_id is null) or
 (kind='rental' and rental_id is not null and tab_id is null and academy_bill_id is null and game_payment_id is null and participant_id is null) or
 (kind='class' and academy_bill_id is not null and tab_id is null and rental_id is null and game_payment_id is null and participant_id is null) or
 (kind='game' and game_payment_id is not null and tab_id is null and rental_id is null and academy_bill_id is null and participant_id is null));
create unique index credit_whole_tab_once on venue_credit_lines(tab_id) where tab_id is not null and participant_id is null;
create unique index credit_tab_person_once on venue_credit_lines(tab_id,participant_id) where participant_id is not null;
create table venue_credit_reversals(id uuid primary key default gen_random_uuid(),payment_id uuid not null unique references venue_credit_payments(id),reason text not null check(length(trim(reason)) between 8 and 500),actor uuid not null references players(id),created_at timestamptz not null default clock_timestamp(),provider_confirmed boolean not null default false);
create table venue_credit_notes(id uuid primary key default gen_random_uuid(),invoice_id uuid not null references venue_credit_invoices(id),amount_cents int not null check(amount_cents>0),reason text not null check(length(trim(reason)) between 8 and 500),actor uuid not null references players(id),created_at timestamptz not null default clock_timestamp());
create table venue_credit_game_terms(game_id uuid primary key references games(id),establishment_id uuid not null references establishments(id),cost_cents int not null check(cost_cents>0),roster uuid[] not null check(cardinality(roster)>0),created_at timestamptz not null default now());
-- Private transaction capability; never expose a GUC which clients could forge.
create table venue_credit_mutations(tx bigint primary key,tab_id uuid,source_id uuid,purpose text not null);
alter table venue_credit_payments drop constraint venue_credit_payments_method_check;
alter table venue_credit_payments drop constraint venue_credit_payments_rental_id_key;
alter table venue_credit_payments add constraint venue_credit_payments_method_check check(method in('cash','manual_pix','online_pix'));
alter table academy_bills drop constraint academy_bills_status_check;
alter table academy_bills add constraint academy_bills_status_check check(status in('pending','cash_paid','cancelled','invoiced','invoice_paid'));
alter table payments drop constraint payments_status_check;
alter table payments add constraint payments_status_check check(status in('pending','paid','waived','invoiced','invoice_paid'));
do $$declare t text;begin foreach t in array array['venue_credit_reversals','venue_credit_notes','venue_credit_game_terms','venue_credit_mutations'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon,authenticated',t);end loop;end$$;
create or replace function credit_balance(i uuid) returns bigint language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select sum(amount_cents) from venue_credit_lines where invoice_id=i),0)
 -coalesce((select sum(amount_cents) from venue_credit_notes where invoice_id=i),0)
 -coalesce((select sum(p.amount_cents) from venue_credit_payments p where invoice_id=i and not exists(select 1 from venue_credit_reversals r where r.payment_id=p.id)),0)
$$;
create function credit_due_overdue(a uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from venue_credit_invoices where account_id=a and due_date<(now() at time zone 'America/Sao_Paulo')::date and credit_balance(id)>0)
$$;
create function credit_refresh_sources(i uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare l record;settled boolean:=credit_balance(i)=0;begin
 for l in select * from venue_credit_lines where invoice_id=i and kind in('class','game') loop
  insert into venue_credit_mutations(tx,source_id,purpose) values(txid_current(),coalesce(l.academy_bill_id,l.game_payment_id),'source_sync');
  if l.kind='class' then update academy_bills set status=case when settled then 'invoice_paid' else 'invoiced' end where id=l.academy_bill_id;
  else update payments set status=case when settled then 'invoice_paid' else 'invoiced' end where id=l.game_payment_id;end if;
  delete from venue_credit_mutations where tx=txid_current();
 end loop;
end$$;
create function credit_unified_source_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$declare d jsonb:=case when tg_op='INSERT' then to_jsonb(new) else to_jsonb(old) end;k uuid:=(d->>'id')::uuid;begin
 if exists(select 1 from venue_credit_mutations where tx=txid_current() and source_id=k and purpose='source_sync') then return new;end if;
 if exists(select 1 from venue_credit_lines where academy_bill_id=k or game_payment_id=k) or (tg_op<>'DELETE' and to_jsonb(new)->>'status' in('invoiced','invoice_paid')) then raise exception 'FATURA: Cobrança transferida: receba ou corrija somente na fatura.';end if;
 if tg_op='DELETE' then return old;end if;return new;end$$;
create trigger credit_unified_guard before insert or update or delete on academy_bills for each row execute function credit_unified_source_guard();
create trigger credit_unified_guard before insert or update or delete on payments for each row execute function credit_unified_source_guard();
create function credit_game_terms_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if exists(select 1 from venue_credit_game_terms where game_id=old.id) and (tg_op='DELETE' or new.field_id is distinct from old.field_id or new.field_cost is distinct from old.field_cost or new.pelada_id is distinct from old.pelada_id) then raise exception 'FATURA: Rateio já aceito em fatura. Preço e recebedor estão congelados.';end if;
 if tg_op='DELETE' then return old;end if;return new;end$$;
create trigger credit_game_terms_guard before update or delete on games for each row execute function credit_game_terms_guard();
alter function credit_invoice_json(uuid) rename to credit_invoice_json_v1;
revoke all on function credit_invoice_json_v1(uuid) from public,anon,authenticated;
create function credit_invoice_json(p_invoice uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select credit_invoice_json_v1(i.id)||jsonb_build_object('due_date',i.due_date,
 'status',case when credit_balance(i.id)=0 then case when i.cut_date>=(now() at time zone 'America/Sao_Paulo')::date then 'zero_open' else 'paid' end when i.due_date<(now() at time zone 'America/Sao_Paulo')::date then 'overdue' else 'open' end,
 'credits_cents',coalesce((select sum(amount_cents) from venue_credit_notes where invoice_id=i.id),0),
 'notes',coalesce((select jsonb_agg(n order by created_at) from venue_credit_notes n where invoice_id=i.id),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('reversal',(select to_jsonb(r) from venue_credit_reversals r where r.payment_id=p.id),'confirmation',case when p.method='online_pix' then 'gateway' else 'counter' end) order by paid_at) from venue_credit_payments p where p.invoice_id=i.id),'[]'::jsonb))
 from venue_credit_invoices i where i.id=p_invoice
$$;
-- Keep the proven v1 actions; forward additions via a wrapper with identical API.
alter function credit_action(text,jsonb) rename to credit_action_v1;
revoke all on function credit_action_v1(text,jsonb) from public,anon,authenticated;
do $$declare b text;begin
 b:=pg_get_functiondef('credit_action_v1(text,jsonb)'::regprocedure);
 b:=replace(b,'cut_date<(now() at time zone ''America/Sao_Paulo'')::date','due_date<(now() at time zone ''America/Sao_Paulo'')::date');
 b:=replace(b,'from venue_credit_allocations a where a.line_id=l.id','from venue_credit_allocations a where a.line_id=l.id and not exists(select 1 from venue_credit_reversals r where r.payment_id=a.payment_id)');execute b;
 b:=pg_get_functiondef('credit_snapshot(uuid,uuid,text)'::regprocedure);
 b:=replace(b,'cut_date<(now() at time zone ''America/Sao_Paulo'')::date','due_date<(now() at time zone ''America/Sao_Paulo'')::date');execute b;
 b:=replace(b,'where r.rental_id=q.id','where r.rental_id=q.id and not exists(select 1 from venue_credit_reversals x where x.payment_id=r.id)');execute b;
 b:=pg_get_functiondef('venue_snapshot(uuid)'::regprocedure);
 b:=replace(b,'where a.establishment_id=v and (p.paid_at','where a.establishment_id=v and not exists(select 1 from venue_credit_reversals x where x.payment_id=p.id) and (p.paid_at');execute b;
 b:=pg_get_functiondef('venue_action(text,jsonb)'::regprocedure);
 b:=replace(b,'and p.method=''cash'' and p.paid_at>=shift.opened_at','and p.method=''cash'' and p.paid_at>=shift.opened_at and not exists(select 1 from venue_credit_reversals x where x.payment_id=p.id)');execute b;
 b:=pg_get_functiondef('academy_action(text,jsonb)'::regprocedure);
 b:=replace(b,'and status=''cash_paid''','and status in(''cash_paid'',''invoice_paid'')');execute b;
end$$;
create function credit_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();a venue_credit_accounts;p venue_credit_payments;i venue_credit_invoices;r venue_credit_requests;nonce uuid;v uuid;result jsonb;n bigint;d integer;
begin
 if me is null then raise exception 'FATURA: Entre na sua conta.';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>16384 then raise exception 'FATURA: Dados inválidos.';end if;
 nonce:=(p_data->>'requestId')::uuid;if nonce is null then raise exception 'FATURA: Identificador obrigatório.';end if;
 perform pg_advisory_xact_lock(hashtext(nonce::text));select * into r from venue_credit_requests where id=nonce;
 if r.id is not null then if r.actor<>me or r.action<>p_action or r.request_data<>p_data then raise exception 'FATURA: Identificador já utilizado.';end if;return r.result;end if;
 if p_action='account_save' then
  d:=coalesce((p_data->>'dueDays')::int,0);if d not between 0 and 45 then raise exception 'FATURA: Vencimento deve ser de 0 a 45 dias após o corte.';end if;
  result:=credit_action_v1(p_action,p_data);update venue_credit_accounts set due_days=d where id=(result->>'id')::uuid;return result;
 elsif p_action in('reverse_payment','credit_note') then
  if p_action='reverse_payment' then select * into p from venue_credit_payments where id=(p_data->>'paymentId')::uuid;select * into i from venue_credit_invoices where id=p.invoice_id;select * into a from venue_credit_accounts where id=coalesce(i.account_id,(select account_id from venue_credit_rentals where id=p.rental_id)) for update;
  else select * into i from venue_credit_invoices where id=(p_data->>'invoiceId')::uuid;select * into a from venue_credit_accounts where id=i.account_id for update;end if;
  v:=a.establishment_id;if not is_establishment_owner(v) then raise exception 'FATURA: Somente o dono corrige recebimentos e concede abatimentos.';end if;
  if (p_data->>'confirmed')::boolean is distinct from true or length(trim(p_data->>'reason')) not between 8 and 500 or p_data->>'reason' is null then raise exception 'FATURA: Confirme e informe motivo de 8 a 500 caracteres.';end if;
  if p_action='reverse_payment' then
   if p.method='online_pix' then raise exception 'FATURA: Pagamento online precisa de devolução confirmada pelo provedor.';end if;
   insert into venue_credit_reversals(payment_id,reason,actor) values(p.id,trim(p_data->>'reason'),me);
   -- A direct rental corrected after collection becomes a pending offer again.
   if p.rental_id is not null then update venue_credit_rentals set status='pending' where id=p.rental_id;end if;
   result:=jsonb_build_object('id',p.id);n:=p.amount_cents;
  else n:=(p_data->>'amountCents')::int;
   if n is null or n<=0 or n>credit_balance(i.id) then raise exception 'FATURA: Abatimento limitado ao saldo em aberto. Devolva primeiro o pagamento, se necessário.';end if;
   insert into venue_credit_notes(invoice_id,amount_cents,reason,actor) values(i.id,n,trim(p_data->>'reason'),me);
   result:=jsonb_build_object('id',i.id);
  end if;
  if i.id is not null then perform credit_refresh_sources(i.id);end if;
  insert into venue_notices(player_id,establishment_id,title,body) values(a.player_id,v,'Correção financeira registrada','Consulte o extrato da sua fatura. O histórico anterior foi preservado.');
 else
  result:=credit_action_v1(p_action,p_data);
  if p_action='receive_invoice' then perform credit_refresh_sources((p_data->>'invoiceId')::uuid);end if;
  return result;
 end if;
 insert into venue_credit_requests values(nonce,me,p_action,p_data,result,now());
 insert into venue_audit(establishment_id,actor,action,target_id,details) values(v,me,'credit_'||p_action,(result->>'id')::uuid,jsonb_build_object('amountCents',n,'reason',trim(p_data->>'reason')));perform venue_ping(v);return result;
end$$;
revoke all on function credit_invoice_due(),credit_due_overdue(uuid),credit_refresh_sources(uuid),credit_unified_source_guard(),credit_game_terms_guard(),credit_invoice_json(uuid),credit_action(text,jsonb) from public,anon,authenticated;
grant execute on function credit_action(text,jsonb) to authenticated;

create function credit_invoice_held(i uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select false$$;
create function credit_post_entry(a uuid,kind text,amount int,description text,t uuid default null,person uuid default null,bill uuid default null,gamepay uuid default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare account venue_credit_accounts;invoice uuid;cut date;me uuid:=community_chat_me();begin
 select * into account from venue_credit_accounts where id=a for update;
 if account.id is null or not account.enabled or (account.player_id<>me and not venue_can(account.establishment_id,'cash')) then raise exception 'FATURA: Cliente não autorizado.';end if;
 if amount is null or amount<=0 or credit_account_balance(a)+amount>account.limit_cents or credit_due_overdue(a) then raise exception 'FATURA: Limite insuficiente ou fatura vencida. Pague na hora.';end if;
 cut:=credit_cut_date(account.cut_day,(now() at time zone 'America/Sao_Paulo')::date);
 insert into venue_credit_invoices(account_id,cut_date) values(a,cut) on conflict(account_id,cut_date) do update set cut_date=excluded.cut_date returning id into invoice;
 if credit_invoice_held(invoice) then raise exception 'FATURA: Há Pix em preparação ou reconciliação nesta fatura. Verifique primeiro.';end if;
 insert into venue_credit_lines(invoice_id,kind,tab_id,participant_id,academy_bill_id,game_payment_id,description,amount_cents,accepted_by,acceptance)
 values(invoice,kind,t,person,bill,gamepay,description,amount,me,case when me=account.player_id then 'app' else 'counter' end);
 insert into venue_notices(player_id,establishment_id,title,body) values(account.player_id,account.establishment_id,'Lançamento na fatura',description||'. Consulte valor e vencimento no seu extrato.');return invoice;
end$$;
create function credit_tab_parts(t uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'player_id',p.player_id,'name',p.name,
 'consumed_cents',coalesce((select sum(s.amount_cents) from order_item_shares s join service_order_items i on i.id=s.item_id join service_orders o on o.id=i.order_id where s.participant_id=p.id and o.tab_id=t and o.status<>'cancelled' and i.status<>'cancelled'),0),
 'remaining_cents',greatest(0,coalesce((select sum(s.amount_cents) from order_item_shares s join service_order_items i on i.id=s.item_id join service_orders o on o.id=i.order_id where s.participant_id=p.id and o.tab_id=t and o.status<>'cancelled' and i.status<>'cancelled'),0)-
 coalesce((select sum(x.amount_cents) from sale_payment_allocations x join sale_payments pay on pay.id=x.payment_id join order_item_shares s on s.id=x.item_share_id where pay.tab_id=t and s.participant_id=p.id and pay.reversed_at is null),0)-
 coalesce((select sum(l.amount_cents) from venue_credit_lines l where l.tab_id=t and l.participant_id=p.id),0)),
 'invoice_id',(select invoice_id from venue_credit_lines where tab_id=t and participant_id=p.id)
 ) order by p.name,p.id),'[]'::jsonb) from tab_participants p where tab_id=t
$$;
alter function credit_snapshot(uuid,uuid,text) rename to credit_snapshot_v1;
revoke all on function credit_snapshot_v1(uuid,uuid,text) from public,anon,authenticated;
create function credit_snapshot(p_venue uuid default null,p_tab uuid default null,p_mode text default 'statement') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();t service_tabs;gross bigint;paid bigint;transferred bigint;parttotal bigint;allocated bigint;allparts jsonb;staff boolean;result jsonb;begin
 if me is null then raise exception 'FATURA: Entre na sua conta.';end if;
 if p_mode<>'tab' then return credit_snapshot_v1(p_venue,p_tab,p_mode);end if;
 select * into t from service_tabs where id=p_tab;if not credit_tab_read(p_tab) then raise exception 'FATURA: Sem acesso à comanda.';end if;staff:=venue_can(t.establishment_id,'cash');
 select coalesce(round(sum(i.quantity*i.unit_price)*100),0) into gross from service_order_items i join service_orders o on o.id=i.order_id where o.tab_id=p_tab and i.status<>'cancelled' and o.status<>'cancelled';
 select coalesce(round(sum(amount)*100),0) into paid from sale_payments where tab_id=p_tab and reversed_at is null;
 select coalesce(sum(amount_cents),0) into transferred from venue_credit_lines where tab_id=p_tab;
 allparts:=credit_tab_parts(p_tab);
 select coalesce(sum((x->>'consumed_cents')::bigint),0) into parttotal from jsonb_array_elements(allparts)x;
 select coalesce(sum(x.amount_cents),0) into allocated from sale_payment_allocations x join sale_payments p on p.id=x.payment_id where p.tab_id=p_tab and p.reversed_at is null;
 result:=jsonb_build_object('me',me,'venue_id',t.establishment_id,'can_record',staff,'tab_id',p_tab,'gross_cents',gross,'paid_cents',paid,'balance_cents',greatest(0,gross-paid-transferred),'transferred_cents',transferred,'has_transfers',transferred>0,
 'can_bill',t.status in('open','awaiting_payment','partially_paid'),'split_ready',parttotal=gross and allocated=paid,
 'payment_started',exists(select 1 from sale_payment_intents where tab_id=p_tab),
 'parts',coalesce((select jsonb_agg(x) from jsonb_array_elements(allparts)x where staff or (x->>'player_id')::uuid=me),'[]'::jsonb),
 'billed',(select to_jsonb(l)||jsonb_build_object('cut_date',i.cut_date,'due_date',i.due_date,'customer_name',p.name,'invoice_balance_cents',credit_balance(i.id)) from venue_credit_lines l join venue_credit_invoices i on i.id=l.invoice_id join venue_credit_accounts a on a.id=i.account_id join players p on p.id=a.player_id where l.tab_id=p_tab and l.participant_id is null),
 'accounts',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('name',p.name,'balance_cents',credit_account_balance(a.id),'overdue',credit_due_overdue(a.id))) from venue_credit_accounts a join players p on p.id=a.player_id where a.establishment_id=t.establishment_id and a.enabled and (a.player_id=me or staff)),'[]'::jsonb));return result;
end$$;
alter function credit_action(text,jsonb) rename to credit_action_v2;
revoke all on function credit_action_v2(text,jsonb) from public,anon,authenticated;
create function credit_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();nonce uuid;r venue_credit_requests;a venue_credit_accounts;t service_tabs;pt tab_participants;b academy_bills;g games;gp payments;terms venue_credit_game_terms;
 result jsonb;v uuid;invoice uuid;amount bigint;ctx jsonb;part jsonb;payment uuid;allocation record;cut date;roster uuid[];cost int;idx int;begin
 if me is null or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>16384 then raise exception 'FATURA: Entre na conta e informe dados válidos.';end if;
 nonce:=(p_data->>'requestId')::uuid;if nonce is null then raise exception 'FATURA: Identificador obrigatório.';end if;
 perform pg_advisory_xact_lock(hashtext(nonce::text));select * into r from venue_credit_requests where id=nonce;
 if r.id is not null then if r.actor<>me or r.action<>p_action or r.request_data<>p_data then raise exception 'FATURA: Identificador já utilizado.';end if;return r.result;end if;
 if p_action in('post_part','pay_part','post_class','post_game') then
  if (p_data->>'consent')::boolean is distinct from true then raise exception 'FATURA: Confirme o valor e sua autorização.';end if;
  if p_action<>'pay_part' then select * into a from venue_credit_accounts where id=(p_data->>'accountId')::uuid for update;v:=a.establishment_id;
   if a.id is null or (a.player_id<>me and not venue_can(v,'cash')) then raise exception 'FATURA: Cliente não autorizado.';end if;
  end if;
  if p_action in('post_part','pay_part') then
   select * into t from service_tabs where id=(p_data->>'tabId')::uuid for update;
   if t.id is null or not credit_tab_read(t.id) or t.status not in('open','awaiting_payment','partially_paid') or exists(select 1 from venue_credit_lines where tab_id=t.id and participant_id is null) then raise exception 'FATURA: Comanda indisponível.';end if;
   if exists(select 1 from sale_payment_intents where tab_id=t.id) then raise exception 'FATURA: Resolva o pagamento online iniciado antes de separar a comanda.';end if;
   select * into pt from tab_participants where id=(p_data->>'participantId')::uuid and tab_id=t.id;
   ctx:=credit_snapshot(null,t.id,'tab');if not (ctx->>'split_ready')::boolean then raise exception 'FATURA: Distribua todos os itens e os pagamentos entre as pessoas antes de faturar por pessoa.';end if;
   if p_action='post_part' and (t.establishment_id<>v or pt.player_id is distinct from a.player_id) then raise exception 'FATURA: A parte precisa pertencer ao cliente autorizado.';end if;
   v:=t.establishment_id;part:=(select x from jsonb_array_elements(credit_tab_parts(t.id))x where (x->>'id')::uuid=pt.id);amount:=(part->>'remaining_cents')::bigint;
   if amount is null or amount<=0 or amount is distinct from (p_data->>'expectedCents')::int then raise exception 'FATURA: O saldo da pessoa mudou. Atualize.';end if;
   if p_action='post_part' then invoice:=credit_post_entry(a.id,'food',amount::int,'Consumo · '||t.label||' · '||pt.name,t.id,pt.id);result:=jsonb_build_object('id',invoice);
   else
    if not venue_can(v,'cash') or (p_data->>'confirmed')::boolean is distinct from true or p_data->>'method' not in('cash','manual_pix') then raise exception 'FATURA: Só o caixa confirma dinheiro ou Pix recebido.';end if;
    if p_data->>'method'='manual_pix' and (coalesce(length(trim(p_data->>'reference')),0)<4) then raise exception 'FATURA: Informe a referência do Pix conferido.';end if;
    perform pg_advisory_xact_lock(hashtext('cash:'||v::text));insert into venue_credit_mutations(tx,tab_id,purpose) values(txid_current(),t.id,'pay_part');
    insert into sale_payments(tab_id,payer_player_id,payer_name,amount,method,paid_at) values(t.id,pt.player_id,pt.name,amount/100.0,case when p_data->>'method'='cash' then 'cash' else 'pix' end,clock_timestamp()) returning id into payment;
    for allocation in select s.id,greatest(0,s.amount_cents-coalesce((select sum(x.amount_cents) from sale_payment_allocations x join sale_payments p on p.id=x.payment_id where x.item_share_id=s.id and p.reversed_at is null),0)) remaining from order_item_shares s join service_order_items i on i.id=s.item_id join service_orders o on o.id=i.order_id where s.participant_id=pt.id and o.tab_id=t.id and i.status<>'cancelled' and o.status<>'cancelled' loop
     if allocation.remaining>0 then insert into sale_payment_allocations(payment_id,item_share_id,amount_cents) values(payment,allocation.id,allocation.remaining);end if;
    end loop;delete from venue_credit_mutations where tx=txid_current();result:=jsonb_build_object('id',payment);
   end if;
   ctx:=credit_snapshot(null,t.id,'tab');if (ctx->>'balance_cents')::bigint=0 then update service_tabs set status='closed',closed_at=now() where id=t.id;end if;
  elsif p_action='post_class' then
   select * into b from academy_bills where id=(p_data->>'billId')::uuid for update;
   if b.id is null or b.player_id<>a.player_id or b.status<>'pending' or b.plan='legacy' or not exists(select 1 from class_programs where id=b.program_id and establishment_id=v) then raise exception 'FATURA: Aula não disponível para este cliente/estabelecimento.';end if;
   amount:=b.amount_cents;if amount is distinct from (p_data->>'expectedCents')::int then raise exception 'FATURA: O valor da aula mudou. Atualize.';end if;
   invoice:=credit_post_entry(a.id,'class',amount::int,'Aula · '||(select name from class_programs where id=b.program_id)||' · '||coalesce(b.competence::text,'avulsa'),null,null,b.id);
   perform credit_refresh_sources(invoice);result:=jsonb_build_object('id',invoice);
  else
   select * into g from games where id=(p_data->>'gameId')::uuid for update;
   if g.id is null or g.status='cancelled' or not exists(select 1 from fields where id=g.field_id and establishment_id=v) then raise exception 'FATURA: Jogo não pertence a este estabelecimento.';end if;
   select * into terms from venue_credit_game_terms where game_id=g.id;
   if terms.game_id is null then
    select array_agg(player_id order by player_id) into roster from attendances where game_id=g.id and status='confirmed';cost:=round(g.field_cost*100)::int;
    if coalesce(cardinality(roster),0)=0 or cost is null or cost<=0 then raise exception 'FATURA: Jogo sem custo ou participantes confirmados.';end if;
   else roster:=terms.roster;cost:=terms.cost_cents;end if;
   idx:=array_position(roster,a.player_id);if idx is null then raise exception 'FATURA: Cliente não está no rateio confirmado.';end if;
   amount:=cost/cardinality(roster)+case when idx<=cost%cardinality(roster) then 1 else 0 end;
   if amount is distinct from (p_data->>'expectedCents')::int then raise exception 'FATURA: O rateio mudou. Atualize o valor antes de aceitar.';end if;
   insert into payments(game_id,player_id) values(g.id,a.player_id) on conflict(game_id,player_id) do nothing;
   select * into gp from payments where game_id=g.id and player_id=a.player_id for update;
   if gp.status<>'pending' then raise exception 'FATURA: Cota já paga, dispensada ou transferida.';end if;
   insert into venue_credit_game_terms(game_id,establishment_id,cost_cents,roster) values(g.id,v,cost,roster) on conflict do nothing;
   invoice:=credit_post_entry(a.id,'game',amount::int,'Cota · '||(select name from peladas where id=g.pelada_id)||' · '||to_char(g.scheduled_at at time zone 'America/Sao_Paulo','DD/MM/YYYY'),null,null,null,gp.id);
   perform credit_refresh_sources(invoice);result:=jsonb_build_object('id',invoice);
  end if;
  insert into venue_credit_requests values(nonce,me,p_action,p_data,result,now());
  insert into venue_audit(establishment_id,actor,action,target_id,details) values(v,me,'credit_'||p_action,(result->>'id')::uuid,jsonb_build_object('amountCents',amount));perform venue_ping(v);return result;
 end if;
 return credit_action_v2(p_action,p_data);
end$$;
do $$declare b text;begin
 b:=pg_get_functiondef('credit_source_guard()'::regprocedure);
 b:=replace(b,'if exists(select 1 from venue_credit_lines where tab_id=tab) then','if exists(select 1 from venue_credit_lines where tab_id=tab) then
  if tg_op=''INSERT'' and tg_table_name in(''sale_payments'',''sale_payment_allocations'') and exists(select 1 from venue_credit_mutations where tx=txid_current() and tab_id=tab and purpose=''pay_part'') then return new;end if;');execute b;
end$$;
revoke all on function credit_post_entry(uuid,text,int,text,uuid,uuid,uuid,uuid),credit_invoice_held(uuid),credit_tab_parts(uuid),credit_snapshot(uuid,uuid,text),credit_action(text,jsonb) from public,anon,authenticated;
grant execute on function credit_snapshot(uuid,uuid,text),credit_action(text,jsonb) to authenticated;

create table venue_credit_intents (
 id uuid primary key default gen_random_uuid(),invoice_id uuid not null references venue_credit_invoices(id),gateway_id uuid not null references payment_gateway_connections(id),secret_id uuid not null,
 provider text not null check(provider in('mercado_pago','picpay')),amount_cents int not null check(amount_cents>0),created_by uuid not null references players(id),
 state text not null default 'building' check(state in('building','pending','uncertain','paid','cancelled','refunded','review')),
 external_id text,provider_payment_id text,pix_code text,checkout_url text,collector_id text,payment_id uuid unique references venue_credit_payments(id),
 expires_at timestamptz not null default (now()+interval '30 minutes'),created_at timestamptz not null default now(),refund_requested_at timestamptz,
 unique(gateway_id,external_id)
);
create unique index credit_one_live_checkout on venue_credit_intents(invoice_id) where state in('building','pending','uncertain','review');
create unique index credit_picpay_order_number on venue_credit_intents(gateway_id,substr(id::text,1,15));
create table venue_credit_gateway_events(id uuid primary key default gen_random_uuid(),intent_id uuid not null references venue_credit_intents(id),provider_payment_id text not null,event_status text not null,provider_updated_at timestamptz,amount_cents int not null,created_at timestamptz not null default now(),unique(intent_id,provider_payment_id,event_status,provider_updated_at));
create table venue_credit_gateway_reviews(id uuid primary key default gen_random_uuid(),intent_id uuid not null references venue_credit_intents(id),code text not null,created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid references players(id),resolution text);
do $$declare t text;begin foreach t in array array['venue_credit_intents','venue_credit_gateway_events','venue_credit_gateway_reviews'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon,authenticated',t);end loop;end$$;
create or replace function credit_invoice_held(i uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from venue_credit_intents where invoice_id=i and state in('building','pending','uncertain','review'))$$;
create function credit_line_hold_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin if credit_invoice_held(new.invoice_id) then raise exception 'FATURA: Há pagamento em preparação ou reconciliação. Resolva antes de alterar o saldo.';end if;return new;end$$;
create trigger credit_line_hold_guard before insert on venue_credit_lines for each row execute function credit_line_hold_guard();
alter function credit_action(text,jsonb) rename to credit_action_v3;
revoke all on function credit_action_v3(text,jsonb) from public,anon,authenticated;
create function credit_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare i uuid;a uuid;result jsonb;begin
 if community_chat_me() is null then raise exception 'FATURA: Entre na conta.';end if;
 if p_action in('receive_invoice','credit_note','reverse_payment') then
  i:=case when p_action='reverse_payment' then (select invoice_id from venue_credit_payments where id=(p_data->>'paymentId')::uuid) else (p_data->>'invoiceId')::uuid end;
  select account_id into a from venue_credit_invoices where id=i;perform 1 from venue_credit_accounts where id=a for update;
  -- An exact successful retry returns the original receipt even if a later checkout exists.
  if not exists(select 1 from venue_credit_requests where id=(p_data->>'requestId')::uuid and actor=community_chat_me() and action=p_action and request_data=p_data) and credit_invoice_held(i) then raise exception 'FATURA: Consulte ou cancele o Pix no provedor antes de baixar ou corrigir manualmente.';end if;
 end if;
 return credit_action_v3(p_action,p_data);
end$$;
create function credit_actor_allowed(p uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from players where id=p and not is_guest and not exists(select 1 from platform_account_controls where player_id=p and suspended))$$;
create function credit_actor_can(v uuid,p uuid,c text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select credit_actor_allowed(p) and (exists(select 1 from establishments where id=v and owner_player_id=p) or exists(select 1 from establishment_staff s join venue_staff_grants g using(establishment_id,player_id) where s.establishment_id=v and s.player_id=p and s.active and c=any(g.capabilities)))$$;
-- Service-only context: the raw credential envelope is never returned by a client RPC.
create function credit_payment_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare who uuid;a venue_credit_accounts;i venue_credit_invoices;c payment_gateway_connections;t venue_credit_intents;nonce uuid;prior venue_credit_requests;result jsonb;secret jsonb;
 n bigint;pay uuid;remaining int;part int;entry_row record;ref text;stamp timestamptz;provider_state text;claimed boolean:=false;begin
 if auth.role()<>'service_role' or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>32768 then raise exception 'FATURA: Serviço não autorizado.';end if;
 if p_action in('prepare','context','refund_claim','recover_access') then
  select id into who from players where auth_user_id=(p_data->>'actor')::uuid and not is_guest;if not credit_actor_allowed(who) then raise exception 'FATURA: Conta não autorizada.';end if;
 end if;
 if p_action='prepare' then
  select * into i from venue_credit_invoices where id=(p_data->>'invoiceId')::uuid;
  select * into a from venue_credit_accounts where id=i.account_id for update;
  if a.id is null or (a.player_id<>who and not credit_actor_can(a.establishment_id,who,'cash')) then raise exception 'FATURA: Sem acesso à fatura.';end if;
  nonce:=(p_data->>'requestId')::uuid;if nonce is null then raise exception 'FATURA: Identificador obrigatório.';end if;
  perform pg_advisory_xact_lock(hashtext(nonce::text));select * into prior from venue_credit_requests where id=nonce;
  if prior.id is not null then if prior.actor<>who or prior.action<>'checkout_prepare' or prior.request_data<>p_data then raise exception 'FATURA: Identificador já utilizado.';end if;return prior.result||jsonb_build_object('claimed',false);end if;
  select * into t from venue_credit_intents where invoice_id=i.id and state in('building','pending','uncertain','review');
  if t.id is null then
   n:=credit_balance(i.id);if n<=0 then raise exception 'FATURA: Fatura sem saldo.';end if;
   select * into c from payment_gateway_connections where establishment_id=a.establishment_id and status='connected' and pix_enabled and provider in('mercado_pago','picpay') and credential_secret_id is not null;
   if c.id is null then raise exception 'FATURA: O estabelecimento precisa configurar um gateway Pix.';end if;
   if c.provider='picpay' and (p_data->>'allowPicpay')::boolean is distinct from true then raise exception 'FATURA: PicPay de faturas aguarda homologação específica.';end if;
   select decrypted_secret::jsonb into secret from vault.decrypted_secrets where id=c.credential_secret_id;
   if secret is null or coalesce(length(secret->>'webhookSecret'),0)<16 or (c.provider='mercado_pago' and coalesce(secret->>'accessToken','')='') or (c.provider='picpay' and (coalesce(secret->>'clientId','')='' or coalesce(secret->>'clientSecret','')='')) then raise exception 'FATURA: Configure credenciais e segredo de webhook no Vault.';end if;
   insert into venue_credit_intents(invoice_id,gateway_id,secret_id,provider,amount_cents,created_by) values(i.id,c.id,c.credential_secret_id,c.provider,n,who) returning * into t;claimed:=true;
  end if;
  result:=jsonb_build_object('id',t.id,'claimed',claimed);insert into venue_credit_requests values(nonce,who,'checkout_prepare',p_data,result,now());return result;
 end if;
 select * into t from venue_credit_intents where id=(p_data->>'intentId')::uuid;
 select * into i from venue_credit_invoices where id=t.invoice_id;select * into a from venue_credit_accounts where id=i.account_id for update;
 select * into t from venue_credit_intents where id=t.id for update;
 if t.id is null then raise exception 'FATURA: Cobrança não encontrada.';end if;
 if p_action in('context','refund_claim','recover_access') and (a.player_id<>who and not credit_actor_can(a.establishment_id,who,'cash')) then raise exception 'FATURA: Sem acesso à cobrança.';end if;
 if p_action in('refund_claim','recover_access') and not exists(select 1 from establishments where id=a.establishment_id and owner_player_id=who) then raise exception 'FATURA: Só o dono trata devoluções e recuperação.';end if;
 if p_action='refund_claim' then
  if exists(select 1 from venue_credit_intents where invoice_id=i.id and id<>t.id and state in('building','pending','uncertain','review')) then raise exception 'FATURA: Resolva a outra cobrança ativa antes de devolver um recebimento anterior.';end if;
  if t.state<>'paid' or t.payment_id is null then raise exception 'FATURA: Só um pagamento confirmado pode ser devolvido.';end if;
  if t.refund_requested_at is not null then return jsonb_build_object('claimed',false);end if;
  update venue_credit_intents set refund_requested_at=now() where id=t.id;return jsonb_build_object('claimed',true);
 elsif p_action='recover_access' then return jsonb_build_object('allowed',true);
 elsif p_action in('context','webhook_context') then
  select decrypted_secret::jsonb into secret from vault.decrypted_secrets where id=t.secret_id;
  if secret is null then raise exception 'FATURA: Credencial histórica indisponível. Procure o dono.';end if;
  return to_jsonb(t)||jsonb_build_object('gateway',jsonb_build_object('id',t.gateway_id,'provider',t.provider,'collector_id',t.collector_id),'credentials',secret,'total_cents',t.amount_cents,'reference','invoice:'||t.id::text,'required_method','pix',
   'customer',(select jsonb_build_object('name',p.name,'email',u.email) from players p join auth.users u on u.id=p.auth_user_id where p.id=a.player_id),
   'venue_id',a.establishment_id,'can_refund',exists(select 1 from establishments where id=a.establishment_id and owner_player_id=who));
 elsif p_action='checkout_save' then
  if t.state not in('building','uncertain','pending') then return jsonb_build_object('id',t.id);end if;
  if coalesce(p_data->>'externalId','')='' or (t.external_id is not null and t.external_id<>p_data->>'externalId') then raise exception 'FATURA: Cobrança externa divergente.';end if;
  update venue_credit_intents set external_id=p_data->>'externalId',collector_id=coalesce(collector_id,p_data->>'collectorId'),pix_code=p_data->>'pixCode',checkout_url=p_data->>'url',state='pending' where id=t.id;
 elsif p_action='uncertain' then update venue_credit_intents set state='uncertain' where id=t.id and state='building';
 elsif p_action='review' then
  insert into venue_credit_gateway_reviews(intent_id,code) select t.id,left(coalesce(p_data->>'code','provider_mismatch'),80) where not exists(select 1 from venue_credit_gateway_reviews where intent_id=t.id and resolved_at is null);
  update venue_credit_intents set state='review' where id=t.id and state not in('refunded');
  insert into venue_notices(player_id,establishment_id,title,body) select owner_player_id,id,'Pagamento de fatura precisa de conferência','O provedor retornou divergência ou resultado inconclusivo. Não faça outra baixa antes de conferir.' from establishments where id=a.establishment_id;
 elsif p_action='settle' then
  n:=(p_data->>'amountCents')::int;ref:=p_data->>'paymentId';stamp:=(p_data->>'updatedAt')::timestamptz;provider_state:=p_data->>'status';
  if n is distinct from t.amount_cents or p_data->>'currency' is distinct from 'BRL' or (p_data->>'gatewayId')::uuid is distinct from t.gateway_id or ref is null or length(ref)>120 or stamp is null then raise exception 'FATURA: Confirmação divergente.';end if;
  if t.provider_payment_id is not null and t.provider_payment_id<>ref then raise exception 'FATURA: Há mais de um pagamento no provedor. Revisão necessária.';end if;
  if exists(select 1 from venue_credit_gateway_events where intent_id=t.id and provider_payment_id=ref and provider_updated_at>stamp) then return jsonb_build_object('id',t.id,'stale',true);end if;
  if provider_state='approved' then
   if t.state='refunded' then return jsonb_build_object('id',t.id,'stale',true);end if;
   if t.payment_id is null then
    if credit_balance(i.id)<t.amount_cents then raise exception 'FATURA: Saldo mudou; pagamento exige revisão para não cobrar duas vezes.';end if;
    insert into venue_credit_payments(invoice_id,amount_cents,method,reference,received_by,paid_at) values(i.id,n,'online_pix',ref,t.created_by,clock_timestamp()) returning id into pay;
    remaining:=n;for entry_row in select l.id,l.amount_cents-coalesce((select sum(x.amount_cents) from venue_credit_allocations x where x.line_id=l.id and not exists(select 1 from venue_credit_reversals r where r.payment_id=x.payment_id)),0) pending from venue_credit_lines l where invoice_id=i.id order by posted_at,id loop part:=least(remaining,entry_row.pending);if part>0 then insert into venue_credit_allocations values(pay,entry_row.id,part);remaining:=remaining-part;end if;exit when remaining=0;end loop;
    if remaining<>0 then raise exception 'FATURA: Alocação financeira divergente.';end if;
    update venue_credit_intents set state='paid',payment_id=pay,provider_payment_id=ref where id=t.id;
   end if;
  elsif provider_state='refunded' then
   if t.payment_id is null then raise exception 'FATURA: Devolução sem recebimento registrado: reconcilie primeiro.';end if;
   insert into venue_credit_reversals(payment_id,reason,actor,provider_confirmed) values(t.payment_id,'Devolução integral confirmada no provedor',t.created_by,true) on conflict(payment_id) do nothing;
   update venue_credit_intents set state='refunded' where id=t.id;
  else raise exception 'FATURA: Estado do provedor exige revisão.';end if;
  insert into venue_credit_gateway_events(intent_id,provider_payment_id,event_status,provider_updated_at,amount_cents) values(t.id,ref,provider_state,stamp,n) on conflict do nothing;
  insert into venue_credit_gateway_reviews(intent_id,code) select x.id,'another_receipt_changed_balance' from venue_credit_intents x where x.invoice_id=i.id and x.id<>t.id and x.state in('building','pending','uncertain') and x.amount_cents>credit_balance(i.id);
  update venue_credit_intents set state='review' where invoice_id=i.id and id<>t.id and state in('building','pending','uncertain') and amount_cents>credit_balance(i.id);
  perform credit_refresh_sources(i.id);
  insert into venue_notices(player_id,establishment_id,title,body) select a.player_id,a.establishment_id,'Atualização de pagamento Pix','Consulte sua fatura; a confirmação foi verificada no provedor.' where not exists(select 1 from venue_notices where player_id=a.player_id and title='Atualização de pagamento Pix' and created_at>now()-interval '1 minute');
 elsif p_action='terminal' then
  if t.payment_id is not null then raise exception 'FATURA: Não cancele um recebimento sem devolver no provedor.';end if;
  update venue_credit_intents set state='cancelled' where id=t.id and state in('building','pending','uncertain');
 else raise exception 'FATURA: Serviço inválido.';end if;
 perform venue_ping(a.establishment_id);return jsonb_build_object('id',t.id);
end$$;
create function credit_online_public(i uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('available',exists(select 1 from venue_credit_invoices x join venue_credit_accounts a on a.id=x.account_id join payment_gateway_connections c on c.establishment_id=a.establishment_id where x.id=i and c.status='connected' and c.pix_enabled and c.provider in('mercado_pago','picpay') and c.credential_secret_id is not null),
 'held',credit_invoice_held(i),'intents',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'state',state,'provider',provider,'amount_cents',amount_cents,'pix_code',pix_code,'checkout_url',checkout_url,'created_at',created_at,'expires_at',expires_at,'refund_requested_at',refund_requested_at) order by created_at desc) from (select * from venue_credit_intents where invoice_id=i order by created_at desc limit 10)t),'[]'::jsonb))
$$;
alter function credit_invoice_json(uuid) rename to credit_invoice_json_v2;
revoke all on function credit_invoice_json_v2(uuid) from public,anon,authenticated;
create function credit_invoice_json(p_invoice uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select credit_invoice_json_v2(p_invoice)||jsonb_build_object('online',credit_online_public(p_invoice),'received_cents',coalesce((select sum(p.amount_cents) from venue_credit_payments p where invoice_id=p_invoice and not exists(select 1 from venue_credit_reversals r where r.payment_id=p.id)),0))$$;
revoke all on function credit_line_hold_guard(),credit_actor_allowed(uuid),credit_actor_can(uuid,uuid,text),credit_payment_service(text,jsonb),credit_online_public(uuid),credit_invoice_json(uuid),credit_action(text,jsonb) from public,anon,authenticated;
grant execute on function credit_payment_service(text,jsonb) to service_role;
grant execute on function credit_action(text,jsonb) to authenticated;

create function credit_sources(v uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare me uuid:=community_chat_me();result jsonb;begin
 if me is null then raise exception 'FATURA: Entre na conta.';end if;
 result:=jsonb_build_object('classes',coalesce((select jsonb_agg(x) from (select b.id,'class' kind,a.id account_id,a.player_id,p.name customer_name,cp.name description,b.plan,b.competence,b.amount_cents,a.establishment_id venue_id
 from academy_bills b join class_programs cp on cp.id=b.program_id join venue_credit_accounts a on a.establishment_id=cp.establishment_id and a.player_id=b.player_id join players p on p.id=b.player_id
 where a.enabled and b.status='pending' and b.plan<>'legacy' and b.amount_cents>0 and (v is null or a.establishment_id=v) and (a.player_id=me or v is not null and venue_can(v,'cash')) order by b.created_at desc limit 50)x),'[]'::jsonb),
 'games',coalesce((select jsonb_agg(x) from (select g.id,'game' kind,a.id account_id,a.player_id,p.name customer_name,team.name description,g.scheduled_at,a.establishment_id venue_id,
 cost.n/cardinality(roster.ids)+case when array_position(roster.ids,a.player_id)<=cost.n%cardinality(roster.ids) then 1 else 0 end amount_cents
 from games g join fields f on f.id=g.field_id join peladas team on team.id=g.pelada_id join venue_credit_accounts a on a.establishment_id=f.establishment_id join players p on p.id=a.player_id left join venue_credit_game_terms t on t.game_id=g.id
 cross join lateral (select coalesce(t.roster,(select array_agg(player_id order by player_id) from attendances where game_id=g.id and status='confirmed')) ids)roster
 cross join lateral (select coalesce(t.cost_cents,round(g.field_cost*100)::int) n)cost
 where a.enabled and g.status<>'cancelled' and coalesce(cardinality(roster.ids),0)>0 and cost.n>0 and a.player_id=any(roster.ids) and (v is null or a.establishment_id=v) and (a.player_id=me or v is not null and venue_can(v,'cash'))
 and not exists(select 1 from payments pay where pay.game_id=g.id and pay.player_id=a.player_id and pay.status<>'pending')
 order by g.scheduled_at desc,a.player_id limit 50)x),'[]'::jsonb));return result;
end$$;
create function credit_filtered_ids(v uuid,q jsonb) returns setof uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=community_chat_me();staff boolean:=v is not null and (venue_can(v,'cash') or venue_can(v,'reports'));status text:=coalesce(q->>'status','all');needle text:=trim(coalesce(q->>'search',''));firstday date;lastday date;begin
 if me is null then raise exception 'FATURA: Entre na conta.';end if;
 if v is not null and not staff and not exists(select 1 from venue_credit_accounts where establishment_id=v and player_id=me) then raise exception 'FATURA: Sem acesso ao estabelecimento.';end if;
 if jsonb_typeof(q) is distinct from 'object' or pg_column_size(q)>4096 or status not in('all','open','overdue','paid') or length(needle)>80 then raise exception 'FATURA: Filtros inválidos.';end if;
 firstday:=nullif(q->>'from','')::date;lastday:=nullif(q->>'to','')::date;if firstday>lastday then raise exception 'FATURA: Período inválido.';end if;
 return query select i.id from venue_credit_invoices i join venue_credit_accounts a on a.id=i.account_id join players p on p.id=a.player_id join establishments e on e.id=a.establishment_id
 where (v is null or a.establishment_id=v) and (a.player_id=me or staff) and (needle='' or position(lower(needle) in lower(p.name||' '||e.name))>0)
 and (firstday is null or i.due_date>=firstday) and (lastday is null or i.due_date<=lastday)
 and (status='all' or status='paid' and credit_balance(i.id)=0 or status='overdue' and credit_balance(i.id)>0 and i.due_date<(now() at time zone 'America/Sao_Paulo')::date or status='open' and credit_balance(i.id)>0 and i.due_date>=(now() at time zone 'America/Sao_Paulo')::date);
end$$;
create function credit_search(p_venue uuid default null,p_query jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;page jsonb;has_more boolean;lastcut date;lastid uuid;lim int:=coalesce((p_query->>'limit')::int,20);begin
 -- Re-use the authorization-safe metadata and replace the bounded legacy invoice list.
 result:=credit_snapshot(p_venue,null,'statement');if lim not between 1 and 50 then raise exception 'FATURA: Página deve ter até 50 faturas.';end if;
 lastcut:=nullif(p_query->>'beforeCut','')::date;lastid:=nullif(p_query->>'beforeId','')::uuid;
 if (lastcut is null)<>(lastid is null) then raise exception 'FATURA: Cursor inválido.';end if;
 select coalesce(jsonb_agg(credit_invoice_json(id) order by cut_date desc,id desc),'[]'::jsonb) into page from
 (select i.id,i.cut_date from venue_credit_invoices i where i.id in(select credit_filtered_ids(p_venue,p_query)) and (lastcut is null or (i.cut_date,i.id)<(lastcut,lastid)) order by i.cut_date desc,i.id desc limit lim+1)x;
 has_more:=jsonb_array_length(page)>lim;if has_more then page:=page-(jsonb_array_length(page)-1);end if;
 return result||jsonb_build_object('invoices',page,'sources',credit_sources(p_venue),'has_more',has_more,'next_cursor',case when has_more then jsonb_build_object('beforeCut',page->-1->>'cut_date','beforeId',page->-1->>'id') end,
 'summary',(select jsonb_build_object('count',count(*),'pending_cents',coalesce(sum(credit_balance(id)),0),'overdue_cents',coalesce(sum(credit_balance(id))filter(where due_date<(now() at time zone 'America/Sao_Paulo')::date),0)) from venue_credit_invoices where id in(select credit_filtered_ids(p_venue,p_query))));
end$$;
create function credit_export(p_venue uuid default null,p_query jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare items jsonb;begin
 select coalesce(jsonb_agg(credit_invoice_json(id) order by cut_date desc,id desc),'[]'::jsonb) into items from (select id,cut_date from venue_credit_invoices where id in(select credit_filtered_ids(p_venue,p_query)) order by cut_date desc,id desc limit 1001)x;
 return jsonb_build_object('invoices',case when jsonb_array_length(items)>1000 then items-1000 else items end,'truncated',jsonb_array_length(items)>1000,'generated_at',now());
end$$;
create or replace function credit_refresh_sources(i uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare l record;settled boolean;begin
 for l in select * from venue_credit_lines where invoice_id=i and kind in('class','game') loop
  settled:=credit_balance(i)=0 or coalesce((select sum(x.amount_cents) from venue_credit_allocations x where x.line_id=l.id and not exists(select 1 from venue_credit_reversals r where r.payment_id=x.payment_id)),0)>=l.amount_cents;
  insert into venue_credit_mutations(tx,source_id,purpose) values(txid_current(),coalesce(l.academy_bill_id,l.game_payment_id),'source_sync');
  if l.kind='class' then update academy_bills set status=case when settled then 'invoice_paid' else 'invoiced' end where id=l.academy_bill_id;
  else update payments set status=case when settled then 'invoice_paid' else 'invoiced' end where id=l.game_payment_id;end if;
  delete from venue_credit_mutations where tx=txid_current();
 end loop;
end$$;
revoke all on function credit_sources(uuid),credit_filtered_ids(uuid,jsonb),credit_search(uuid,jsonb),credit_export(uuid,jsonb) from public,anon,authenticated;
grant execute on function credit_search(uuid,jsonb),credit_export(uuid,jsonb) to authenticated;

create table venue_credit_preferences(account_id uuid primary key references venue_credit_accounts(id),in_app boolean not null default true,email boolean not null default false,whatsapp boolean not null default false,updated_at timestamptz not null default now());
create table venue_credit_reminders(id uuid primary key default gen_random_uuid(),invoice_id uuid not null references venue_credit_invoices(id),account_id uuid not null references venue_credit_accounts(id),stage text not null check(stage in('before_due','due','overdue')),channel text not null check(channel in('app','email','whatsapp')),status text not null default 'queued' check(status in('queued','sending','available','accepted','failed','uncertain','cancelled')),provider_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(invoice_id,stage,channel));
create table venue_credit_job_config(id boolean primary key default true check(id),secret_id uuid not null,url text not null);
do $$declare t text;begin foreach t in array array['venue_credit_preferences','venue_credit_reminders','venue_credit_job_config'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon,authenticated',t);end loop;end$$;
create function credit_reminder_stage(i uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$select case when credit_balance(id)<=0 then null when due_date<(now() at time zone 'America/Sao_Paulo')::date then 'overdue' when due_date=(now() at time zone 'America/Sao_Paulo')::date then 'due' when due_date<=(now() at time zone 'America/Sao_Paulo')::date+3 then 'before_due' end from venue_credit_invoices where id=i$$;
create function credit_reminders_generate() returns int language plpgsql security definer set search_path=public,pg_temp as $$declare item record;channel text;pref venue_credit_preferences;counted int:=0;r uuid;begin
 update venue_credit_reminders set status='cancelled',updated_at=now() where status='queued' and stage is distinct from credit_reminder_stage(invoice_id);
 -- One relevant invoice per account, rather than a burst for every old unpaid month.
 for item in select distinct on(i.account_id) i.*,a.player_id,a.establishment_id,credit_reminder_stage(i.id) stage from venue_credit_invoices i join venue_credit_accounts a on a.id=i.account_id where credit_reminder_stage(i.id) is not null and credit_actor_allowed(a.player_id) order by i.account_id,i.due_date,i.id loop
  select * into pref from venue_credit_preferences where account_id=item.account_id;
  foreach channel in array array['app','email','whatsapp'] loop
   if channel='app' and coalesce(pref.in_app,true) or channel='email' and coalesce(pref.email,false) or channel='whatsapp' and coalesce(pref.whatsapp,false) then
    insert into venue_credit_reminders(invoice_id,account_id,stage,channel) values(item.id,item.account_id,item.stage,channel) on conflict do nothing returning id into r;
    if r is not null then counted:=counted+1;
     if channel='app' then
      insert into venue_notices(player_id,establishment_id,title,body) values(item.player_id,item.establishment_id,case item.stage when 'overdue' then 'Fatura em atraso' when 'due' then 'Fatura vence hoje' else 'Sua fatura vence em breve' end,'Consulte Minhas faturas para ver saldo, vencimento e formas de pagamento.');
      update venue_credit_reminders set status='available',updated_at=now() where id=r;
     end if;
    end if;
   end if;
  end loop;
 end loop;return counted;
end$$;
alter function credit_action(text,jsonb) rename to credit_action_v4;
revoke all on function credit_action_v4(text,jsonb) from public,anon,authenticated;
create function credit_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare me uuid:=community_chat_me();a venue_credit_accounts;t venue_credit_intents;i venue_credit_invoices;request venue_credit_requests;nonce uuid;begin
 if p_action not in('reminder_preferences','resolve_review','release_checkout') then return credit_action_v4(p_action,p_data);end if;
 if me is null or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>8192 then raise exception 'FATURA: Entre na conta e informe dados válidos.';end if;
 nonce:=(p_data->>'requestId')::uuid;if nonce is null then raise exception 'FATURA: Identificador obrigatório.';end if;
 perform pg_advisory_xact_lock(hashtext(nonce::text));select * into request from venue_credit_requests where id=nonce;
 if request.id is not null then if request.actor<>me or request.action<>p_action or request.request_data<>p_data then raise exception 'FATURA: Identificador já utilizado.';end if;return request.result;end if;
 if p_action='reminder_preferences' then
  select * into a from venue_credit_accounts where id=(p_data->>'accountId')::uuid for update;
  if a.player_id is distinct from me then raise exception 'FATURA: Só o cliente escolhe seus lembretes.';end if;
  if jsonb_typeof(p_data->'inApp') is distinct from 'boolean' or jsonb_typeof(p_data->'email') is distinct from 'boolean' or jsonb_typeof(p_data->'whatsapp') is distinct from 'boolean' then raise exception 'FATURA: Preferência inválida.';end if;
  if (p_data->>'email')::boolean and not exists(select 1 from auth.users u join players p on p.auth_user_id=u.id where p.id=me and to_jsonb(u)->>'email_confirmed_at' is not null) then raise exception 'FATURA: Confirme seu e-mail antes de ativar.';end if;
  if (p_data->>'whatsapp')::boolean and not exists(select 1 from auth.users u join players p on p.auth_user_id=u.id where p.id=me and to_jsonb(u)->>'phone_confirmed_at' is not null and to_jsonb(u)->>'phone' ~ '^55[0-9]{10,11}$') then raise exception 'FATURA: WhatsApp exige telefone brasileiro verificado na conta, não apenas no perfil.';end if;
  insert into venue_credit_preferences values(a.id,(p_data->>'inApp')::boolean,(p_data->>'email')::boolean,(p_data->>'whatsapp')::boolean,now()) on conflict(account_id) do update set in_app=excluded.in_app,email=excluded.email,whatsapp=excluded.whatsapp,updated_at=now();
  update venue_credit_reminders set status='cancelled',updated_at=now() where account_id=a.id and status='queued' and ((channel='app' and not (p_data->>'inApp')::boolean) or (channel='email' and not (p_data->>'email')::boolean) or (channel='whatsapp' and not (p_data->>'whatsapp')::boolean));
 else
  select * into t from venue_credit_intents where id=(p_data->>'intentId')::uuid;select * into i from venue_credit_invoices where id=t.invoice_id;select * into a from venue_credit_accounts where id=i.account_id for update;
  select * into t from venue_credit_intents where id=t.id for update;
  if not is_establishment_owner(a.establishment_id) then raise exception 'FATURA: Só o dono trata divergências.';end if;
  if (p_data->>'confirmed')::boolean is distinct from true or coalesce(length(trim(p_data->>'reason')),0) not between 8 and 500 then raise exception 'FATURA: Confirme a conferência e informe o motivo.';end if;
  if p_action='release_checkout' then
   if t.payment_id is not null or now()<t.expires_at+interval '5 minutes' or t.state not in('building','pending','uncertain','review') then raise exception 'FATURA: Cobrança ainda ativa ou já paga. Consulte o provedor.';end if;
   -- Human exception, never described as an automatic provider confirmation.
   update venue_credit_intents set state='cancelled' where id=t.id;
  else
   update venue_credit_gateway_reviews set resolved_at=now(),resolved_by=me,resolution=trim(p_data->>'reason') where intent_id=t.id and resolved_at is null;
   update venue_credit_intents set state=case when payment_id is not null then case when exists(select 1 from venue_credit_reversals where payment_id=t.payment_id) then 'refunded' else 'paid' end when external_id is null then 'uncertain' else 'pending' end where id=t.id;
  end if;
  insert into venue_audit(establishment_id,actor,action,target_id,details) values(a.establishment_id,me,'credit_'||p_action,t.id,jsonb_build_object('reason',trim(p_data->>'reason'),'human_confirmation',true));
  insert into venue_notices(player_id,establishment_id,title,body) values(a.player_id,a.establishment_id,'Conferência financeira do estabelecimento','O dono registrou uma conferência manual. Consulte o extrato; isso não comprova novo pagamento.');perform venue_ping(a.establishment_id);
 end if;
 insert into venue_credit_requests values(nonce,me,p_action,p_data,jsonb_build_object('id',coalesce(t.id,a.id)),now());return jsonb_build_object('id',coalesce(t.id,a.id));
end$$;
create function credit_reminder_service(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r venue_credit_reminders;pref venue_credit_preferences;result jsonb;begin
 if auth.role()<>'service_role' then raise exception 'FATURA: Serviço não autorizado.';end if;
 if p_action='generate' then return jsonb_build_object('generated',credit_reminders_generate());end if;
 if p_action='claim' then
  select x.* into r from venue_credit_reminders x join venue_credit_preferences f on f.account_id=x.account_id where x.status='queued' and x.channel in('email','whatsapp') and x.stage=credit_reminder_stage(x.invoice_id) and
   ((x.channel='email' and f.email) or (x.channel='whatsapp' and f.whatsapp)) and x.channel=any(array(select jsonb_array_elements_text(coalesce(p_data->'channels','["email","whatsapp"]'::jsonb)))) and not exists(select 1 from venue_credit_reminders z where z.account_id=x.account_id and z.channel=x.channel and z.status in('sending','accepted','uncertain') and (z.updated_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date)
   order by x.created_at,x.id for update of x skip locked limit 1;
  if r.id is null then return '{}';end if;
  select jsonb_build_object('id',r.id,'channel',r.channel,'email',u.email,'phone',case when to_jsonb(u)->>'phone_confirmed_at' is not null then to_jsonb(u)->>'phone' end) into result from venue_credit_accounts a join players p on p.id=a.player_id join auth.users u on u.id=p.auth_user_id where a.id=r.account_id and credit_actor_allowed(p.id) and
   ((r.channel='email' and to_jsonb(u)->>'email_confirmed_at' is not null) or (r.channel='whatsapp' and to_jsonb(u)->>'phone_confirmed_at' is not null and to_jsonb(u)->>'phone' ~ '^55[0-9]{10,11}$'));
  if result is null then update venue_credit_reminders set status='cancelled',updated_at=now() where id=r.id;return jsonb_build_object('skipped',true);end if;
  update venue_credit_reminders set status='sending',updated_at=now() where id=r.id;return result;
 end if;
 if p_action not in('accepted','failed','uncertain') then raise exception 'FATURA: Ação inválida.';end if;
 update venue_credit_reminders set status=p_action,provider_id=nullif(left(p_data->>'providerId',150),''),updated_at=now() where id=(p_data->>'id')::uuid and status='sending';return '{}';
end$$;
-- Enrich private metadata; public account/statement endpoints still enforce scope.
alter function credit_snapshot(uuid,uuid,text) rename to credit_snapshot_v2;
revoke all on function credit_snapshot_v2(uuid,uuid,text) from public,anon,authenticated;
create function credit_snapshot(p_venue uuid default null,p_tab uuid default null,p_mode text default 'statement') returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare result jsonb;me uuid:=community_chat_me();begin
 result:=credit_snapshot_v2(p_venue,p_tab,p_mode);if p_mode<>'statement' then return result;end if;
 return result||jsonb_build_object('preferences',coalesce((select jsonb_agg(jsonb_build_object('account_id',a.id,'in_app',coalesce(f.in_app,true),'email',coalesce(f.email,false),'whatsapp',coalesce(f.whatsapp,false),'email_verified',to_jsonb(u)->>'email_confirmed_at' is not null,'phone_verified',to_jsonb(u)->>'phone_confirmed_at' is not null and to_jsonb(u)->>'phone' ~ '^55[0-9]{10,11}$')) from venue_credit_accounts a left join venue_credit_preferences f on f.account_id=a.id join players p on p.id=a.player_id join auth.users u on u.id=p.auth_user_id where a.player_id=me and (p_venue is null or a.establishment_id=p_venue)),'[]'::jsonb),
 'reminders',coalesce((select jsonb_agg(x) from (select r.id,r.invoice_id,r.channel,r.stage,r.status,r.updated_at from venue_credit_reminders r join venue_credit_accounts a on a.id=r.account_id where (p_venue is null or a.establishment_id=p_venue) and (a.player_id=me or p_venue is not null and (venue_can(p_venue,'cash') or venue_can(p_venue,'reports'))) order by r.created_at desc limit 30)x),'[]'::jsonb),
 'reminders_scheduled',exists(select 1 from venue_credit_job_config));
end$$;
create function credit_reminder_setup(p_secret text,p_url text) returns void language plpgsql security definer set search_path=public,vault,pg_temp as $$declare k uuid;begin
 if auth.role()<>'service_role' or coalesce(length(p_secret),0)<32 or p_url !~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/invoice-reminders$' then raise exception 'FATURA: Configuração de serviço inválida.';end if;
 k:=vault.create_secret(p_secret);insert into venue_credit_job_config values(true,k,p_url) on conflict(id) do update set secret_id=excluded.secret_id,url=excluded.url;
end$$;
create function credit_reminders_tick() returns void language plpgsql security definer set search_path=public,vault,pg_temp as $$declare c venue_credit_job_config;token text;begin
 perform credit_reminders_generate();select * into c from venue_credit_job_config;
 if c.id is not null and to_regnamespace('net') is not null then
  select decrypted_secret into token from vault.decrypted_secrets where id=c.secret_id;
  if token is not null then execute 'select net.http_post(url := $1,body := $2,headers := $3,timeout_milliseconds := 10000)' using c.url,'{}'::jsonb,jsonb_build_object('Content-Type','application/json','x-invoice-job',token);end if;
 end if;
end$$;
revoke all on function credit_reminder_stage(uuid),credit_reminders_generate(),credit_reminder_service(text,jsonb),credit_reminder_setup(text,text),credit_reminders_tick(),credit_snapshot(uuid,uuid,text),credit_action(text,jsonb) from public,anon,authenticated;
grant execute on function credit_reminder_service(text,jsonb),credit_reminder_setup(text,text),credit_reminders_generate() to service_role;
grant execute on function credit_snapshot(uuid,uuid,text),credit_action(text,jsonb) to authenticated;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$begin if to_regnamespace('cron') is not null then perform cron.schedule('invoice-customer-reminders','0 12 * * *','select public.credit_reminders_tick();');end if;end$$;

create function credit_operating_tabs(v uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'transferred_cents',coalesce((select sum(amount_cents) from venue_credit_lines where tab_id=t.id),0),'balance_cents',greatest(0,
 coalesce((select round(sum(i.quantity*i.unit_price)*100) from service_order_items i join service_orders o on o.id=i.order_id where o.tab_id=t.id and i.status<>'cancelled' and o.status<>'cancelled'),0)-coalesce((select round(sum(amount)*100) from sale_payments where tab_id=t.id and reversed_at is null),0)-coalesce((select sum(amount_cents) from venue_credit_lines where tab_id=t.id),0)))),'[]'::jsonb) from service_tabs t where establishment_id=v and status not in('closed','cancelled')$$;
do $$declare b text;begin
 b:=pg_get_functiondef('venue_snapshot(uuid)'::regprocedure);
 b:=replace(b,'if venue_can(v,''pdv'') then','if venue_can(v,''pdv'') then
 result:=result||jsonb_build_object(''tab_credit_balances'',credit_operating_tabs(v));');execute b;
end$$;
create table venue_credit_gateway_limits(actor uuid not null references players(id),minute timestamptz not null,hits int not null,primary key(actor,minute));
alter table venue_credit_gateway_limits enable row level security;revoke all on venue_credit_gateway_limits from anon,authenticated;
alter function credit_payment_service(text,jsonb) rename to credit_payment_service_core;
revoke all on function credit_payment_service_core(text,jsonb) from public,anon,authenticated;
create function credit_payment_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare me uuid;n int;begin
 if auth.role()<>'service_role' then raise exception 'FATURA: Serviço não autorizado.';end if;
 if p_action='access' then
  select id into me from players where auth_user_id=(p_data->>'actor')::uuid and not is_guest;if not credit_actor_allowed(me) then raise exception 'FATURA: Conta não autorizada.';end if;
  delete from venue_credit_gateway_limits where minute<now()-interval '1 day';
  insert into venue_credit_gateway_limits values(me,date_trunc('minute',now()),1) on conflict(actor,minute) do update set hits=venue_credit_gateway_limits.hits+1 returning hits into n;
  if n>30 then raise exception 'FATURA: Muitas consultas ao provedor. Aguarde um minuto.';end if;return '{}';
 end if;
 return credit_payment_service_core(p_action,p_data);
end$$;
revoke all on function credit_operating_tabs(uuid),credit_payment_service(text,jsonb) from public,anon,authenticated;
grant execute on function credit_payment_service(text,jsonb) to service_role;

alter table payment_gateway_connections add column verified_collector_id text;
create function credit_gateway_connection(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,vault,pg_temp as $$declare me uuid;v uuid:=(p_data->>'venueId')::uuid;c payment_gateway_connections;k uuid;creds jsonb;oldcreds jsonb;preserve boolean:=false;begin
 if auth.role()<>'service_role' or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>16384 then raise exception 'FATURA: Serviço não autorizado.';end if;
 select id into me from players where auth_user_id=(p_data->>'actor')::uuid and not is_guest;
 if not credit_actor_allowed(me) or not exists(select 1 from establishments where id=v and owner_player_id=me) then raise exception 'FATURA: Só o dono conecta o recebimento.';end if;
 if p_action='access' then return '{}';end if;
 if p_action<>'save' or p_data->>'provider' not in('mercado_pago','picpay') or (p_data->>'confirmed')::boolean is distinct from true then raise exception 'FATURA: Confirme a configuração e escolha um gateway suportado.';end if;
 perform pg_advisory_xact_lock(hashtext('credit-gateway:'||v::text));select * into c from payment_gateway_connections where establishment_id=v for update;
 if exists(select 1 from sale_payment_intents x join service_tabs t on t.id=x.tab_id where t.establishment_id=v and x.status='pending') then raise exception 'FATURA: Resolva as cobranças pendentes de comanda antes de mudar o recebimento.';end if;
 creds:=p_data->'credentials';if jsonb_typeof(creds) is distinct from 'object' or coalesce(length(creds->>'webhookSecret'),0)<16 or coalesce(p_data->>'collectorId','')='' then raise exception 'FATURA: Credenciais verificadas e segredo de webhook obrigatórios.';end if;
 select decrypted_secret::jsonb into oldcreds from vault.decrypted_secrets where id=c.credential_secret_id;
 preserve:=c.status='connected' and c.provider=p_data->>'provider' and (c.verified_collector_id=p_data->>'collectorId' or c.provider='mercado_pago' and oldcreds->>'accessToken'=creds->>'accessToken' or c.provider='picpay' and oldcreds->>'clientId'=creds->>'clientId' and oldcreds->>'clientSecret'=creds->>'clientSecret');
 k:=vault.create_secret(creds::text);
 insert into payment_gateway_connections(establishment_id,provider,status,account_label,pix_enabled,card_enabled,contactless_enabled,credential_secret_id,connected_at,verified_collector_id)
 values(v,p_data->>'provider','connected',left(p_data->>'accountLabel',100),true,false,false,k,now(),p_data->>'collectorId')
 on conflict(establishment_id) do update set provider=excluded.provider,status='connected',account_label=excluded.account_label,pix_enabled=true,card_enabled=coalesce(preserve,false) and c.card_enabled,contactless_enabled=coalesce(preserve,false) and c.contactless_enabled,credential_secret_id=k,connected_at=now(),updated_at=now(),verified_collector_id=excluded.verified_collector_id returning * into c;
 insert into venue_audit(establishment_id,actor,action,target_id,details) values(v,me,'credit_gateway_connected',c.id,jsonb_build_object('provider',c.provider,'credential_verified',true));perform venue_ping(v);
 return jsonb_build_object('id',c.id,'provider',c.provider,'label',c.account_label);
end$$;
revoke all on function credit_gateway_connection(text,jsonb) from public,anon,authenticated;
grant execute on function credit_gateway_connection(text,jsonb) to service_role;
-- Remote plpgsql_check caught alias o colliding with the venue_occupancy variable.
-- Keep authorization and transition rules unchanged; no customer data is mutated.
do $$declare previous text;body text;begin
 previous:=pg_get_functiondef('public.venue_action(text,jsonb)'::regprocedure);
 body:=replace(previous,
 'from service_orders o,service_tabs t where i.id=k and i.order_id=o.id and o.tab_id=t.id',
 'from service_orders kitchen_order,service_tabs t where i.id=k and i.order_id=kitchen_order.id and kitchen_order.tab_id=t.id');
 if body=previous then raise exception 'kitchen transition alias hook missing';end if;
 body:=replace(body,'update service_orders o set status=case','update service_orders kitchen_order set status=case');
 body:=replace(body,'where i.order_id=o.id','where i.order_id=kitchen_order.id');
 body:=replace(body,'where o.id=(select order_id from service_order_items where id=k);','where kitchen_order.id=(select order_id from service_order_items where id=k);');
 execute body;
end$$;

-- Faturas v3, Evolution API and verified phone ownership: 20261012040000–20261012046000.
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

create table venue_credit_refunds(id uuid primary key default gen_random_uuid(),intent_id uuid not null references venue_credit_intents(id),payment_id uuid not null references venue_credit_payments(id),amount_cents int not null check(amount_cents>0),cumulative_cents int not null check(cumulative_cents>0),provider_updated_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),unique(intent_id,cumulative_cents));
create table venue_credit_refund_allocations(refund_id uuid not null references venue_credit_refunds(id),payment_id uuid not null,line_id uuid not null,amount_cents int not null check(amount_cents>0),primary key(refund_id,line_id),foreign key(payment_id,line_id) references venue_credit_allocations(payment_id,line_id));
create table venue_credit_refund_requests(id uuid primary key,actor uuid not null references players(id),intent_id uuid not null references venue_credit_intents(id),amount_cents int not null check(amount_cents>0),baseline_cents int not null,status text not null default 'claimed' check(status in('claimed','confirmed')),created_at timestamptz not null default now());
create unique index credit_one_refund_request on venue_credit_refund_requests(intent_id) where status='claimed';
create table venue_credit_provider_financials(intent_id uuid primary key references venue_credit_intents(id),fee_cents int check(fee_cents>=0),net_cents int check(net_cents>=0),provider_updated_at timestamptz not null);
do $$declare t text;begin foreach t in array array['venue_credit_refunds','venue_credit_refund_allocations','venue_credit_refund_requests','venue_credit_provider_financials'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from anon,authenticated',t);end loop;end$$;
create function credit_payment_net(p uuid) returns bigint language sql stable security definer set search_path=public,pg_temp as $$select case when exists(select 1 from venue_credit_reversals where payment_id=p) then 0 else amount_cents-coalesce((select sum(amount_cents) from venue_credit_refunds where payment_id=p),0) end from venue_credit_payments where id=p$$;
create function credit_allocation_net(p uuid,l uuid,n int) returns bigint language sql stable security definer set search_path=public,pg_temp as $$select case when exists(select 1 from venue_credit_reversals where payment_id=p) then 0 else n-coalesce((select sum(amount_cents) from venue_credit_refund_allocations where payment_id=p and line_id=l),0) end$$;
create or replace function credit_balance(i uuid) returns bigint language sql stable security definer set search_path=public,pg_temp as $$select coalesce((select sum(amount_cents) from venue_credit_lines where invoice_id=i),0)-coalesce((select sum(amount_cents) from venue_credit_notes where invoice_id=i),0)-coalesce((select sum(credit_payment_net(id)) from venue_credit_payments where invoice_id=i),0)$$;
do $$declare b text;f text;begin
 foreach f in array array['credit_payment_service_core(text,jsonb)','credit_action_v1(text,jsonb)','credit_refresh_sources(uuid)'] loop
  b:=pg_get_functiondef(f::regprocedure);b:=replace(b,'sum(x.amount_cents)','sum(credit_allocation_net(x.payment_id,x.line_id,x.amount_cents))');b:=replace(b,'sum(a.amount_cents) from venue_credit_allocations a','sum(credit_allocation_net(a.payment_id,a.line_id,a.amount_cents)) from venue_credit_allocations a');
  if f='credit_payment_service_core(text,jsonb)' then b:=replace(b,'n:=credit_balance(i.id);if n<=0','n:=coalesce((p_data->>''amountCents'')::int,credit_balance(i.id));if n is null or n>credit_balance(i.id) then raise exception ''FATURA: Pix deve ser positivo e até o saldo.'';end if;if n<=0');end if;execute b;
 end loop;
 b:=pg_get_functiondef('venue_snapshot(uuid)'::regprocedure);b:=replace(b,'sum(p.amount_cents)','sum(credit_payment_net(p.id))');execute b;
end$$;
alter function credit_payment_service(text,jsonb) rename to credit_payment_service_v4;
revoke all on function credit_payment_service_v4(text,jsonb) from public,anon,authenticated;
create function credit_payment_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare t venue_credit_intents;a venue_credit_accounts;r venue_credit_refund_requests;c jsonb;result jsonb;who uuid;n int;prior int;delta int;refund uuid;remaining int;item record;part int;stamp timestamptz;fee int;net int;begin
 if auth.role()<>'service_role' or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>32768 then raise exception 'FATURA: Serviço não autorizado.';end if;
 if p_action='refund_claim' then
  c:=credit_payment_service_v4('context',p_data);if (c->>'can_refund')::boolean is distinct from true then raise exception 'FATURA: Só o dono devolve pagamentos.';end if;
  select * into a from venue_credit_accounts where id=(select account_id from venue_credit_invoices where id=(c->>'invoice_id')::uuid) for update;
  select * into t from venue_credit_intents where id=(c->>'id')::uuid for update;
  who:=(select id from players where auth_user_id=(p_data->>'actor')::uuid);
  select * into r from venue_credit_refund_requests where id=nullif(p_data->>'requestId','')::uuid;
  if r.id is not null then if r.actor<>who or r.intent_id<>t.id or ((p_data->>'amountCents') is not null and (p_data->>'amountCents')::int<>r.amount_cents) then raise exception 'FATURA: Identificador de devolução já usado.';end if;return jsonb_build_object('claimed',false);end if;
  n:=coalesce((p_data->>'amountCents')::int,credit_payment_net(t.payment_id));who:=(select id from players where auth_user_id=(p_data->>'actor')::uuid);
  if t.state<>'paid' or n is null or n<=0 or n>credit_payment_net(t.payment_id) or (t.provider='picpay' and n<>t.amount_cents) then raise exception 'FATURA: Valor de devolução inválido. PicPay permite apenas integral nesta integração.';end if;
  if exists(select 1 from venue_credit_intents where invoice_id=t.invoice_id and id<>t.id and state in('building','pending','uncertain','review')) then raise exception 'FATURA: Resolva o outro checkout antes de devolver.';end if;
  if nullif(p_data->>'requestId','') is null then return credit_payment_service_v4(p_action,p_data);end if;
  select * into r from venue_credit_refund_requests where id=(p_data->>'requestId')::uuid;
  if r.id is not null then if r.actor<>who or r.intent_id<>t.id or r.amount_cents<>n then raise exception 'FATURA: Identificador de devolução já usado.';end if;return jsonb_build_object('claimed',false);end if;
  if exists(select 1 from venue_credit_refund_requests where intent_id=t.id and status='claimed') then return jsonb_build_object('claimed',false);end if;
  prior:=t.amount_cents-credit_payment_net(t.payment_id);insert into venue_credit_refund_requests(id,actor,intent_id,amount_cents,baseline_cents) values((p_data->>'requestId')::uuid,who,t.id,n,prior);
  update venue_credit_intents set refund_requested_at=now() where id=t.id;return jsonb_build_object('claimed',true);
 end if;
 if p_action='settle' and p_data->>'status'='partial_refund' then
  select * into t from venue_credit_intents where id=(p_data->>'intentId')::uuid;
  select * into a from venue_credit_accounts where id=(select account_id from venue_credit_invoices where id=t.invoice_id) for update;
  select * into t from venue_credit_intents where id=t.id for update;
  if t.payment_id is null then perform credit_payment_service_v4('settle',p_data||jsonb_build_object('status','approved'));select * into t from venue_credit_intents where id=t.id;end if;
  stamp:=(p_data->>'updatedAt')::timestamptz;n:=(p_data->>'refundedCents')::int;
  if t.provider<>'mercado_pago' or t.payment_id is null or t.provider_payment_id is distinct from p_data->>'paymentId' or (p_data->>'gatewayId')::uuid is distinct from t.gateway_id or p_data->>'currency' is distinct from 'BRL' or (p_data->>'amountCents')::int is distinct from t.amount_cents or stamp is null or n is null or n<=0 or n>=t.amount_cents then raise exception 'FATURA: Prova de devolução parcial divergente.';end if;
  if t.state='refunded' then return jsonb_build_object('id',t.id,'stale',true);end if;
  prior:=coalesce((select max(cumulative_cents) from venue_credit_refunds where intent_id=t.id),0);
  if n<=prior or exists(select 1 from venue_credit_gateway_events where intent_id=t.id and provider_updated_at>stamp) then return jsonb_build_object('id',t.id,'stale',true);end if;
  delta:=n-prior;insert into venue_credit_refunds(intent_id,payment_id,amount_cents,cumulative_cents,provider_updated_at) values(t.id,t.payment_id,delta,n,stamp) returning id into refund;
  remaining:=delta;for item in select x.*,l.posted_at,credit_allocation_net(x.payment_id,x.line_id,x.amount_cents) available from venue_credit_allocations x join venue_credit_lines l on l.id=x.line_id where payment_id=t.payment_id order by l.posted_at desc,l.id desc loop part:=least(remaining,item.available);if part>0 then insert into venue_credit_refund_allocations values(refund,t.payment_id,item.line_id,part);remaining:=remaining-part;end if;exit when remaining=0;end loop;
  if remaining<>0 then raise exception 'FATURA: Alocação da devolução divergente.';end if;
  insert into venue_credit_gateway_events(intent_id,provider_payment_id,event_status,provider_updated_at,amount_cents) values(t.id,t.provider_payment_id,'partial_refund',stamp,t.amount_cents) on conflict do nothing;
  update venue_credit_refund_requests set status='confirmed' where intent_id=t.id and baseline_cents+amount_cents<=n;
  perform credit_refresh_sources(t.invoice_id);perform venue_ping(a.establishment_id);result:=jsonb_build_object('id',t.id);
 else result:=credit_payment_service_v4(p_action,p_data);end if;
 if p_action in('context','webhook_context') then
  select * into r from venue_credit_refund_requests where intent_id=(p_data->>'intentId')::uuid and status='claimed';
  result:=result||jsonb_build_object('refund_request_id',r.id,'refund_amount_cents',r.amount_cents);return result;
 end if;
 if p_action='settle' then
  select * into t from venue_credit_intents where id=(p_data->>'intentId')::uuid;
  if p_data->>'status'='refunded' then update venue_credit_refund_requests set status='confirmed' where intent_id=t.id;end if;
  fee:=(p_data->>'feeCents')::int;net:=(p_data->>'netCents')::int;stamp:=(p_data->>'updatedAt')::timestamptz;
  if fee<0 or fee>t.amount_cents or net<0 or net>t.amount_cents then raise exception 'FATURA: Valores líquidos divergentes.';end if;
  if fee is not null or net is not null then insert into venue_credit_provider_financials values(t.id,fee,net,stamp) on conflict(intent_id) do update set fee_cents=excluded.fee_cents,net_cents=excluded.net_cents,provider_updated_at=excluded.provider_updated_at where venue_credit_provider_financials.provider_updated_at<=excluded.provider_updated_at;end if;
 end if;return result;
end$$;
alter function credit_invoice_json(uuid) rename to credit_invoice_json_v5;
revoke all on function credit_invoice_json_v5(uuid) from public,anon,authenticated;
create function credit_intent_json(t venue_credit_intents) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select jsonb_build_object('id',t.id,'state',t.state,'provider',t.provider,'amount_cents',t.amount_cents,'pix_code',t.pix_code,'checkout_url',t.checkout_url,'created_at',t.created_at,'expires_at',t.expires_at,'refund_requested_at',t.refund_requested_at,'refund_pending',exists(select 1 from venue_credit_refund_requests where intent_id=t.id and status='claimed'),'refunded_cents',case when t.state='refunded' then t.amount_cents else coalesce((select max(cumulative_cents) from venue_credit_refunds where intent_id=t.id),0) end,'fee_cents',(select fee_cents from venue_credit_provider_financials where intent_id=t.id),'net_cents',(select net_cents from venue_credit_provider_financials where intent_id=t.id))$$;
create function credit_invoice_json(p_invoice uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select credit_invoice_json_v5(p_invoice)||jsonb_build_object('received_cents',coalesce((select sum(credit_payment_net(id)) from venue_credit_payments where invoice_id=p_invoice),0),'payments',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('net_paid_cents',credit_payment_net(p.id),'refunds',coalesce((select jsonb_agg(r order by created_at) from venue_credit_refunds r where payment_id=p.id),'[]'::jsonb),'reversal',(select to_jsonb(r) from venue_credit_reversals r where payment_id=p.id),'confirmation',case when method='online_pix' then 'gateway' else 'counter' end) order by paid_at) from venue_credit_payments p where invoice_id=p_invoice),'[]'::jsonb),'online',(credit_online_public(p_invoice)||jsonb_build_object('intents',coalesce((select jsonb_agg(credit_intent_json(t) order by t.created_at desc) from (select * from venue_credit_intents where invoice_id=p_invoice order by created_at desc limit 10)t),'[]'::jsonb))))$$;
create function credit_checkout_history(p_invoice uuid,p_before timestamptz default null,p_intent uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare a venue_credit_accounts;me uuid:=community_chat_me();begin
 select * into a from venue_credit_accounts where id=(select account_id from venue_credit_invoices where id=p_invoice);
 if me is null or a.id is null or not(a.player_id=me or venue_can(a.establishment_id,'cash') or venue_can(a.establishment_id,'reports')) then raise exception 'FATURA: Sem acesso ao histórico.';end if;
 return coalesce((select jsonb_agg(credit_intent_json(t) order by created_at desc) from(select * from venue_credit_intents where invoice_id=p_invoice and (p_intent is null or id=p_intent) and(p_before is null or created_at<p_before) order by created_at desc limit 20)t),'[]'::jsonb);
end$$;
revoke all on function credit_payment_net(uuid),credit_allocation_net(uuid,uuid,int),credit_intent_json(venue_credit_intents),credit_invoice_json(uuid),credit_payment_service(text,jsonb),credit_checkout_history(uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function credit_payment_service(text,jsonb) to service_role;
grant execute on function credit_checkout_history(uuid,timestamptz,uuid) to authenticated;

create table venue_credit_agreements(id uuid primary key default gen_random_uuid(),invoice_id uuid not null references venue_credit_invoices(id),proposed_by uuid not null references players(id),accepted_by uuid references players(id),amount_cents int not null check(amount_cents>0),installments int not null check(installments between 2 and 12),first_due date not null,gap_days int not null check(gap_days between 7 and 45),reason text not null check(length(trim(reason)) between 8 and 500),status text not null default 'proposed' check(status in('proposed','accepted','rejected','cancelled')),created_at timestamptz not null default now(),accepted_at timestamptz);
create unique index credit_one_agreement on venue_credit_agreements(invoice_id) where status in('proposed','accepted');
alter table venue_credit_agreements enable row level security;revoke all on venue_credit_agreements from anon,authenticated;
create function credit_agreement_schedule(p uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('number',s.n,'amount_cents',s.amount,'due_date',s.due,'remaining_cents',greatest(0,s.amount-least(s.amount,greatest(0,a.amount_cents-credit_balance(a.invoice_id)-s.before)))) order by s.n),'[]'::jsonb)
 from venue_credit_agreements a cross join lateral(select n,a.first_due+(n-1)*a.gap_days due,a.amount_cents/a.installments+case when n<=a.amount_cents%a.installments then 1 else 0 end amount,(n-1)*(a.amount_cents/a.installments)+least(n-1,a.amount_cents%a.installments) before from generate_series(1,a.installments)n)s where a.id=p
$$;
create function credit_effective_due(i uuid) returns date language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select min((part->>'due_date')::date) from venue_credit_agreements a cross join lateral jsonb_array_elements(credit_agreement_schedule(a.id))part where a.invoice_id=i and a.status='accepted' and credit_balance(i)<=a.amount_cents and (part->>'remaining_cents')::int>0),(select due_date from venue_credit_invoices where id=i))
$$;
create or replace function credit_due_overdue(a uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from venue_credit_invoices where account_id=a and credit_effective_due(id)<(now() at time zone 'America/Sao_Paulo')::date and credit_balance(id)>0)$$;
create function credit_agreement_line_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin if exists(select 1 from venue_credit_agreements where invoice_id=new.invoice_id and status in('proposed','accepted')) then raise exception 'FATURA: Ciclo com acordo não recebe novos consumos. Pague na hora ou aguarde outro ciclo.';end if;return new;end$$;
create trigger credit_agreement_line_guard before insert on venue_credit_lines for each row execute function credit_agreement_line_guard();
alter function credit_action(text,jsonb) rename to credit_action_v6;revoke all on function credit_action_v6(text,jsonb) from public,anon,authenticated;
create function credit_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare me uuid:=community_chat_me();i venue_credit_invoices;a venue_credit_accounts;plan venue_credit_agreements;nonce uuid;old venue_credit_requests;result jsonb;n int;firstday date;gap int;begin
 if p_action not in('agreement_propose','agreement_accept','agreement_reject','agreement_cancel') then return credit_action_v6(p_action,p_data);end if;
 if me is null or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>8192 then raise exception 'FATURA: Conta e dados válidos necessários.';end if;
 nonce:=(p_data->>'requestId')::uuid;if nonce is null then raise exception 'FATURA: Identificador obrigatório.';end if;perform pg_advisory_xact_lock(hashtext(nonce::text));select * into old from venue_credit_requests where id=nonce;
 if old.id is not null then if old.actor<>me or old.action<>p_action or old.request_data<>p_data then raise exception 'FATURA: Identificador já utilizado.';end if;return old.result;end if;
 select * into i from venue_credit_invoices where id=case when p_action='agreement_propose' then (p_data->>'invoiceId')::uuid else(select invoice_id from venue_credit_agreements where id=(p_data->>'agreementId')::uuid) end;
 select * into a from venue_credit_accounts where id=i.account_id for update;
 if a.id is null then raise exception 'FATURA: Fatura não encontrada.';end if;
 if credit_invoice_held(i.id) then raise exception 'FATURA: Resolva a cobrança online antes de negociar.';end if;
 if p_action='agreement_propose' then
  if not is_establishment_owner(a.establishment_id) then raise exception 'FATURA: Só o dono propõe acordo.';end if;
  n:=(p_data->>'installments')::int;firstday:=(p_data->>'firstDue')::date;gap:=(p_data->>'gapDays')::int;
  if n is null or n not between 2 and 12 or gap is null or gap not between 7 and 45 or firstday is null or firstday<(now() at time zone 'America/Sao_Paulo')::date or firstday>(now() at time zone 'America/Sao_Paulo')::date+90 or length(trim(p_data->>'reason')) not between 8 and 500 or p_data->>'reason' is null or credit_balance(i.id)<=0 or (p_data->>'expectedCents')::bigint is distinct from credit_balance(i.id) then raise exception 'FATURA: Confira saldo, motivo, 2–12 parcelas e vencimento em até 90 dias.';end if;
  if exists(select 1 from venue_credit_agreements where invoice_id=i.id and status='accepted') then raise exception 'FATURA: Já há um acordo aceito. Quite ou trate a divergência antes de nova negociação.';end if;
  update venue_credit_agreements set status='cancelled' where invoice_id=i.id and status='proposed';
  insert into venue_credit_agreements(invoice_id,proposed_by,amount_cents,installments,first_due,gap_days,reason) values(i.id,me,credit_balance(i.id),n,firstday,gap,trim(p_data->>'reason')) returning * into plan;
 else
  select * into plan from venue_credit_agreements where id=(p_data->>'agreementId')::uuid for update;
  if plan.status<>'proposed' then raise exception 'FATURA: Proposta já respondida.';end if;
  if p_action='agreement_cancel' then if not is_establishment_owner(a.establishment_id) then raise exception 'FATURA: Só o dono cancela sua proposta.';end if;update venue_credit_agreements set status='cancelled' where id=plan.id;
  else
   if a.player_id<>me then raise exception 'FATURA: Somente o cliente aceita ou recusa.';end if;
   if p_action='agreement_accept' then
    if (p_data->>'consent')::boolean is distinct from true or credit_balance(i.id)<>plan.amount_cents or plan.first_due<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'FATURA: Confira o saldo atualizado e aceite os vencimentos.';end if;
    update venue_credit_agreements set status='accepted',accepted_by=me,accepted_at=now() where id=plan.id;
   else update venue_credit_agreements set status='rejected' where id=plan.id;end if;
  end if;
 end if;
 result:=jsonb_build_object('id',plan.id);insert into venue_credit_requests values(nonce,me,p_action,p_data,result,now());
 insert into venue_audit(establishment_id,actor,action,target_id,details) values(a.establishment_id,me,'credit_'||p_action,plan.id,jsonb_build_object('amountCents',plan.amount_cents));
 insert into venue_notices(player_id,establishment_id,title,body) values(a.player_id,a.establishment_id,'Acordo de fatura atualizado','Consulte a proposta e os vencimentos em Minhas faturas. Não há juros ou débito automático.');perform venue_ping(a.establishment_id);return result;
end$$;
alter function credit_invoice_json(uuid) rename to credit_invoice_json_v7;revoke all on function credit_invoice_json_v7(uuid) from public,anon,authenticated;
create function credit_invoice_json(p_invoice uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select credit_invoice_json_v7(p_invoice)||jsonb_build_object('effective_due_date',credit_effective_due(p_invoice),'status',case when credit_balance(p_invoice)=0 then 'paid' when credit_effective_due(p_invoice)<(now() at time zone 'America/Sao_Paulo')::date then 'overdue' else 'open' end,'agreements',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('schedule',credit_agreement_schedule(a.id),'needs_review',a.status='accepted' and credit_balance(p_invoice)>a.amount_cents) order by created_at desc) from venue_credit_agreements a where invoice_id=p_invoice),'[]'::jsonb))$$;
do $$declare b text;begin
 b:=pg_get_functiondef('credit_filtered_ids(uuid,jsonb)'::regprocedure);b:=replace(b,'i.due_date','credit_effective_due(i.id)');execute b;
 b:=pg_get_functiondef('credit_search(uuid,jsonb)'::regprocedure);b:=replace(b,'where due_date<','where credit_effective_due(id)<');execute b;
 b:=pg_get_functiondef('credit_reminders_generate()'::regprocedure);b:=replace(b,'order by i.account_id,i.due_date,i.id','order by i.account_id,credit_effective_due(i.id),i.id');execute b;
 b:=pg_get_functiondef('credit_action_v1(text,jsonb)'::regprocedure);b:=replace(b,'and due_date<','and credit_effective_due(id)<');execute b;
 b:=pg_get_functiondef('credit_snapshot_v1(uuid,uuid,text)'::regprocedure);b:=replace(b,'i.due_date<','credit_effective_due(i.id)<');execute b;
end$$;
create or replace function credit_reminder_stage(i uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$select case when credit_balance(i)<=0 then null when credit_effective_due(i)<(now() at time zone 'America/Sao_Paulo')::date then 'overdue' when credit_effective_due(i)=(now() at time zone 'America/Sao_Paulo')::date then 'due' when credit_effective_due(i)<=(now() at time zone 'America/Sao_Paulo')::date+3 then 'before_due' else null end$$;
revoke all on function credit_agreement_schedule(uuid),credit_effective_due(uuid),credit_agreement_line_guard(),credit_invoice_json(uuid),credit_action(text,jsonb) from public,anon,authenticated;
grant execute on function credit_action(text,jsonb) to authenticated;

create table customer_phone_challenges(id uuid primary key default gen_random_uuid(),player_id uuid not null references players(id),phone text not null check(phone ~ '^55[0-9]{10,11}$'),salt uuid not null default gen_random_uuid(),code_hash text not null,attempts int not null default 0,status text not null default 'issued' check(status in('issued','verified','completed','expired')),created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '5 minutes'));
alter table customer_phone_challenges enable row level security;revoke all on customer_phone_challenges from anon,authenticated;
create function phone_ownership_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare me uuid;c customer_phone_challenges;wanted_phone text;begin
 if auth.role()<>'service_role' or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>2048 then raise exception 'TELEFONE: Serviço não autorizado.';end if;
 select id into me from players where auth_user_id=(p_data->>'actor')::uuid and not is_guest;
 if not credit_actor_allowed(me) then raise exception 'TELEFONE: Entre numa conta ativa.';end if;
 perform pg_advisory_xact_lock(hashtext('phone-actor:'||me::text));
 if p_action='create' then
  wanted_phone:=p_data->>'phone';if wanted_phone is null or wanted_phone !~ '^55[0-9]{10,11}$' or coalesce(p_data->>'hash','') !~ '^[a-f0-9]{64}$' or nullif(p_data->>'id','') is null or nullif(p_data->>'salt','') is null then raise exception 'TELEFONE: Dados inválidos.';end if;
  perform pg_advisory_xact_lock(hashtext('phone-number:'||wanted_phone));
  if exists(select 1 from customer_phone_challenges where player_id=me and created_at>now()-interval '1 minute') or (select count(*) from customer_phone_challenges where player_id=me and created_at>now()-interval '1 day')>=5 then raise exception 'TELEFONE: Aguarde; limite de códigos atingido.';end if;
  if exists(select 1 from customer_phone_challenges where customer_phone_challenges.phone=wanted_phone and player_id<>me and status in('issued','verified') and expires_at>now()) or exists(select 1 from auth.users u where u.id<>(p_data->>'actor')::uuid and to_jsonb(u)->>'phone'=wanted_phone and to_jsonb(u)->>'phone_confirmed_at' is not null) then raise exception 'TELEFONE: Número indisponível para esta conta.';end if;
  update customer_phone_challenges set status='expired' where player_id=me and status in('issued','verified');
  insert into customer_phone_challenges(id,player_id,phone,salt,code_hash) values((p_data->>'id')::uuid,me,wanted_phone,(p_data->>'salt')::uuid,p_data->>'hash') returning * into c;
 else
  select * into c from customer_phone_challenges where id=(p_data->>'id')::uuid and player_id=me for update;
  if c.id is null or c.expires_at<=now() or c.status='expired' or c.attempts>=5 then return jsonb_build_object('valid',false,'expired',true);end if;
  if p_action='context' then return jsonb_build_object('salt',c.salt,'phone',c.phone);
  elsif p_action='verify' then
   if c.status='completed' then return jsonb_build_object('valid',exists(select 1 from auth.users u where u.id=(p_data->>'actor')::uuid and to_jsonb(u)->>'phone'=c.phone and to_jsonb(u)->>'phone_confirmed_at' is not null),'completed',true,'phone',c.phone);end if;
   if c.code_hash is distinct from p_data->>'hash' then update customer_phone_challenges set attempts=attempts+1 where id=c.id;return jsonb_build_object('valid',false);end if;
   update customer_phone_challenges set status='verified' where id=c.id;return jsonb_build_object('valid',true,'phone',c.phone);
  elsif p_action='complete' then
   if c.status<>'verified' or not exists(select 1 from auth.users u where u.id=(p_data->>'actor')::uuid and to_jsonb(u)->>'phone'=c.phone and to_jsonb(u)->>'phone_confirmed_at' is not null) then raise exception 'TELEFONE: Autenticação ainda não confirmou.';end if;
   update customer_phone_challenges set status='completed',code_hash=repeat('0',64) where id=c.id;return jsonb_build_object('valid',true);
  else raise exception 'TELEFONE: Ação inválida.';end if;
 end if;return jsonb_build_object('id',c.id);
end$$;
revoke all on function phone_ownership_service(text,jsonb) from public,anon,authenticated;grant execute on function phone_ownership_service(text,jsonb) to service_role;

create function credit_financial_summary(ids uuid[]) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select jsonb_build_object('gross_cents',coalesce(sum(t.amount_cents),0),'refunded_cents',coalesce(sum(t.amount_cents-credit_payment_net(t.payment_id)),0),'fee_cents',coalesce(sum(f.fee_cents),0),'net_reported_cents',coalesce(sum(f.net_cents),0),'unknown_fee_count',count(*)filter(where f.fee_cents is null),'unknown_net_count',count(*)filter(where f.net_cents is null)) from venue_credit_intents t left join venue_credit_provider_financials f on f.intent_id=t.id where t.invoice_id=any(ids) and t.payment_id is not null$$;
do $$declare b text;begin
 b:=pg_get_functiondef('credit_search(uuid,jsonb)'::regprocedure);
 b:=replace(b,'return result||jsonb_build_object(''invoices'',page','result:=result||jsonb_build_object(''financial_summary'',credit_financial_summary(array(select credit_filtered_ids(p_venue,p_query))));return result||jsonb_build_object(''invoices'',page');execute b;
end$$;
revoke all on function credit_financial_summary(uuid[]) from public,anon,authenticated;

alter table venue_whatsapp_instances add column bound_owner_id uuid references players(id);
update venue_whatsapp_instances w set bound_owner_id=e.owner_player_id from establishments e where e.id=w.establishment_id;
do $$declare b text;begin
 b:=pg_get_functiondef('whatsapp_instance_service(text,jsonb)'::regprocedure);
 b:=replace(b,'from venue_whatsapp_instances where establishment_id=v;return','from venue_whatsapp_instances where establishment_id=v and bound_owner_id=(select owner_player_id from establishments where id=v);return');
 b:=replace(b,'insert into venue_whatsapp_instances(establishment_id) values(v) on conflict do nothing;',
 'insert into venue_whatsapp_instances(establishment_id,bound_owner_id) values(v,me) on conflict(establishment_id) do update set bound_owner_id=me,instance_name=''mj-''||replace(gen_random_uuid()::text,''-'',''''),state=''unknown'',updated_at=now() where venue_whatsapp_instances.bound_owner_id is distinct from me;');execute b;
end$$;
-- No raw code retained. Old challenges are kept briefly for rate-limit/abuse accounting.
do $$begin if to_regnamespace('cron') is not null then perform cron.schedule('customer-phone-challenge-cleanup','15 12 * * *','delete from public.customer_phone_challenges where created_at<now()-interval ''7 days'';');end if;end$$;
create or replace function credit_invoice_held(i uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from venue_credit_intents where invoice_id=i and state in('building','pending','uncertain','review')) or exists(select 1 from venue_credit_refund_requests r join venue_credit_intents t on t.id=r.intent_id where t.invoice_id=i and r.status='claimed')$$;
do $$declare b text;begin
 b:=pg_get_functiondef('credit_payment_service_core(text,jsonb)'::regprocedure);
 b:=replace(b,'nonce:=(p_data->>''requestId'')::uuid;if nonce is null',
 'if exists(select 1 from venue_credit_refund_requests r join venue_credit_intents x on x.id=r.intent_id where x.invoice_id=i.id and r.status=''claimed'') then raise exception ''FATURA: Consulte a devolução pendente antes de outro Pix.'';end if;
 nonce:=(p_data->>''requestId'')::uuid;if nonce is null');
 b:=replace(b,'if t.id is null then',
 'if t.id is not null and p_data->>''amountCents'' is not null and (p_data->>''amountCents'')::int<>t.amount_cents then raise exception ''FATURA: Há outro Pix pendente com valor diferente. Consulte antes de gerar.'';end if;
 if t.id is null then');execute b;
end$$;
alter function credit_checkout_history(uuid,timestamptz,uuid) rename to credit_checkout_history_v1;
revoke all on function credit_checkout_history_v1(uuid,timestamptz,uuid) from public,anon,authenticated;
create function credit_checkout_history(p_invoice uuid,p_before timestamptz default null,p_intent uuid default null,p_before_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare a venue_credit_accounts;me uuid:=community_chat_me();begin
 select * into a from venue_credit_accounts where id=(select account_id from venue_credit_invoices where id=p_invoice);
 if me is null or a.id is null or not(a.player_id=me or venue_can(a.establishment_id,'cash') or venue_can(a.establishment_id,'reports')) then raise exception 'FATURA: Sem acesso ao histórico.';end if;
 if (p_before is null)<>(p_before_id is null) then raise exception 'FATURA: Cursor incompleto.';end if;
 return coalesce((select jsonb_agg(credit_intent_json(t) order by created_at desc,id desc) from(select * from venue_credit_intents where invoice_id=p_invoice and (p_intent is null or id=p_intent) and(p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit 20)t),'[]'::jsonb);
end$$;
revoke all on function credit_checkout_history(uuid,timestamptz,uuid,uuid) from public,anon,authenticated;grant execute on function credit_checkout_history(uuid,timestamptz,uuid,uuid) to authenticated;

-- Keep the pending-amount check only in prepare, not in provider proof validation.
do $$declare b text;previous text;begin
 previous:=pg_get_functiondef('credit_payment_service_core(text,jsonb)'::regprocedure);
 b:=replace(previous,'if t.id is not null and p_data->>''amountCents'' is not null and (p_data->>''amountCents'')::int<>t.amount_cents then raise exception ''FATURA: Há outro Pix pendente com valor diferente. Consulte antes de gerar.'';end if;
 if t.id is null then raise exception ''FATURA: Cobrança não encontrada.'';end if;',
 'if t.id is null then raise exception ''FATURA: Cobrança não encontrada.'';end if;');
 if b=previous then raise exception 'invoice context amount guard hook missing';end if;execute b;
end$$;

-- Licenças digitais nativas; pagamentos do estabelecimento permanecem separados.
-- Digital app licenses only. No venue balance, invoice or service payment writes.
create table public.native_app_subscriptions (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  player_id uuid not null unique references public.players(id) on delete cascade,
  plan_id uuid not null references public.commercial_plans(id),
  source text check (source in ('app_store','play_store')),
  product_id text,
  active boolean not null default false,
  expires_at timestamptz,
  since_at timestamptz,
  auto_renew boolean not null default false,
  checked_at timestamptz not null
);
alter table public.native_app_subscriptions enable row level security;
revoke all on public.native_app_subscriptions from public,anon,authenticated;
grant select,insert,update on public.native_app_subscriptions to service_role;

create table public.native_billing_requests (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(), attempts integer not null default 1
);
alter table public.native_billing_requests enable row level security;
revoke all on public.native_billing_requests from public,anon,authenticated;
grant select,insert,update on public.native_billing_requests to service_role;
create function public.claim_native_sync(p_user uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare counter integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Somente servidor'; end if;
  insert into native_billing_requests(auth_user_id) values(p_user)
  on conflict(auth_user_id) do update set
    attempts=case when native_billing_requests.window_start<now()-interval '1 minute' then 1 else native_billing_requests.attempts+1 end,
    window_start=case when native_billing_requests.window_start<now()-interval '1 minute' then now() else native_billing_requests.window_start end
  returning attempts into counter;
  return counter<=12;
end $$;
revoke all on function public.claim_native_sync(uuid) from public,anon,authenticated;
grant execute on function public.claim_native_sync(uuid) to service_role;

create function public.native_subscription_status() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.players; n public.native_app_subscriptions; blocked boolean;
begin
  if not public.platform_account_allowed() then raise exception 'Sessão indisponível' using errcode='42501'; end if;
  select * into p from players where auth_user_id=auth.uid();
  if p.id is null then raise exception 'Perfil indisponível'; end if;
  select * into n from native_app_subscriptions where auth_user_id=auth.uid();
  blocked := public.platform_admin_role()='owner'
    or coalesce(p.premium_until>now(),false)
    or exists(select 1 from platform_commercial_agreements a where a.audience='player' and a.target_id=p.id and a.kind='license' and a.status='granted' and (a.expires_at is null or a.expires_at>now()))
    or exists(select 1 from commercial_subscriptions s where s.subscriber_player_id=p.id and s.status='active' and s.current_period_end>now())
    or exists(select 1 from commercial_checkout_orders o join platform_commercial_agreements a on a.id=o.agreement_id where a.audience='player' and a.target_id=p.id and o.status='pending' and o.expires_at>now());
  return jsonb_build_object('active',coalesce(n.active and n.expires_at>now(),false),'canPurchase',not coalesce(blocked,false),
    'source',n.source,'expiresAt',p.premium_until,'since',p.premium_since,'autoRenew',coalesce(n.auto_renew and n.active and n.expires_at>now(),false),'playerId',p.id);
end $$;

create function public.apply_native_subscription(p_user uuid,p_plan uuid,p_checked_at timestamptz,p_source text,p_product text,p_expires timestamptz,p_since timestamptz,p_auto_renew boolean,p_active boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.players; n public.native_app_subscriptions;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Somente confirmação do servidor' using errcode='42501'; end if;
  if p_checked_at is null or p_checked_at>now()+interval '5 minutes' or p_checked_at<now()-interval '10 minutes' then raise exception 'Consulta do provedor inválida'; end if;
  if not exists(select 1 from commercial_plans where id=p_plan and audience='player') then raise exception 'Plano Premium incompatível'; end if;
  if p_active is null or p_auto_renew is null or (p_active and (p_source is null or p_source not in ('app_store','play_store') or nullif(p_product,'') is null or p_expires is null or p_expires<=now() or p_since is null or p_since>now()+interval '5 minutes')) then raise exception 'Assinatura incompatível'; end if;
  select * into p from players where auth_user_id=p_user for update;
  if p.id is null then raise exception 'Conta sem perfil'; end if;
  perform pg_advisory_xact_lock(hashtextextended('commercial-target:player:'||p.id,0));
  select * into n from native_app_subscriptions where auth_user_id=p_user for update;
  if n.checked_at is not null and p_checked_at<=n.checked_at then return; end if;
  -- A missing entitlement must not revoke unrelated historical/manual access.
  if not p_active and n.auth_user_id is null then return; end if;
  insert into native_app_subscriptions(auth_user_id,player_id,plan_id,source,product_id,active,expires_at,since_at,auto_renew,checked_at)
    values(p_user,p.id,p_plan,coalesce(p_source,n.source),coalesce(p_product,n.product_id),p_active,p_expires,coalesce(p_since,n.since_at),p_active and p_auto_renew,p_checked_at)
    on conflict(auth_user_id) do update set plan_id=excluded.plan_id,source=excluded.source,product_id=excluded.product_id,active=excluded.active,
      expires_at=excluded.expires_at,since_at=excluded.since_at,auto_renew=excluded.auto_renew,checked_at=excluded.checked_at;
  update players set premium_since=coalesce(p.premium_since,p_since,n.since_at),
    premium_until=case when p_active then p_expires else least(coalesce(p_expires,now()),now()) end,
    premium_auto_renew=p_active and p_auto_renew where id=p.id;
  if n.active is distinct from p_active or n.expires_at is distinct from p_expires or n.auto_renew is distinct from (p_active and p_auto_renew) then
    insert into platform_admin_audit(action,target_id,reason,after_value) values('native_subscription',p.id::text,'Estado consultado no provedor de compras digitais; não é recebimento do campo',
      jsonb_build_object('source',coalesce(p_source,n.source),'active',p_active,'expiresAt',p_expires,'checkedAt',p_checked_at));
  end if;
end $$;
revoke all on function public.native_subscription_status(),public.apply_native_subscription(uuid,uuid,timestamptz,text,text,timestamptz,timestamptz,boolean,boolean) from public,anon,authenticated;
grant execute on function public.native_subscription_status() to authenticated;
grant execute on function public.apply_native_subscription(uuid,uuid,timestamptz,text,text,timestamptz,timestamptz,boolean,boolean) to service_role;

create function public.guard_web_native_overlap() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.platform_commercial_agreements;
begin
  if new.status<>'pending' then return new; end if;
  select * into a from platform_commercial_agreements where id=new.agreement_id;
  if a.audience='player' then
    perform pg_advisory_xact_lock(hashtextextended('commercial-target:player:'||a.target_id,0));
    if exists(select 1 from native_app_subscriptions where player_id=a.target_id and active and expires_at>now()) then
      raise exception 'Já existe assinatura ativa na loja. Gerencie a assinatura de origem antes de contratar outro plano';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_web_native_overlap() from public,anon,authenticated;
create trigger commercial_no_native_overlap before insert or update on public.commercial_checkout_orders for each row execute function public.guard_web_native_overlap();

create or replace function public.commercial_access_snapshot() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.platform_account_allowed() then raise exception 'Sessão indisponível' using errcode='42501'; end if;
  return jsonb_build_object('role',public.platform_admin_role(),
    'licenses',coalesce((select jsonb_agg(row) from (
      select jsonb_build_object('id',a.id,'audience',a.audience,'targetId',a.target_id,'planId',a.plan_id,'expiresAt',a.expires_at) as row
      from platform_commercial_agreements a where a.kind='license' and a.status='granted' and (a.expires_at is null or a.expires_at>now()) and public.commercial_target_member(a.audience,a.target_id)
      union all
      select jsonb_build_object('id',s.id,'audience',p.audience,'targetId',coalesce(s.subscriber_player_id,s.pelada_id,s.establishment_id),'planId',s.plan_id,'expiresAt',s.current_period_end,'paid',true,'paymentSource','web')
      from commercial_subscriptions s join commercial_plans p on p.id=s.plan_id where s.status='active' and s.current_period_end>now()
        and s.provider='mercado_pago_monthly' and public.commercial_target_member(p.audience,coalesce(s.subscriber_player_id,s.pelada_id,s.establishment_id))
      union all
      select jsonb_build_object('id',n.player_id,'audience','player','targetId',n.player_id,'planId',n.plan_id,'expiresAt',n.expires_at,'paid',true,'paymentSource',n.source,'autoRenew',n.auto_renew)
      from native_app_subscriptions n where n.auth_user_id=auth.uid() and n.active and n.expires_at>now()
    ) x),'[]'::jsonb),
    'agreements',coalesce((select jsonb_agg(public.commercial_agreement_json(a)) from platform_commercial_agreements a where public.commercial_target_manager(a.audience,a.target_id)),'[]'::jsonb));
end $$;

-- Write-only credentials in Vault; no tokens in public configuration or audit.
create table public.platform_whatsapp_integrations (
  provider text primary key check(provider in('evolution_api','evolution_go')),
  url text not null,
  secret_id uuid not null,
  instance_name text not null,
  enabled boolean not null default false,
  revision integer not null default 1,
  probe_ok boolean not null default false,
  tested_at timestamptz,
  state text not null default 'unknown' check(state in('unknown','connecting','open','close')),
  provision_state text not null default 'none' check(provision_state in('none','creating','created','uncertain')),
  updated_at timestamptz not null default now()
);
alter table public.platform_whatsapp_integrations enable row level security;
revoke all on public.platform_whatsapp_integrations from public,anon,authenticated;
grant select,insert,update on public.platform_whatsapp_integrations to service_role;

create function public.platform_whatsapp_service(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare a uuid; r public.platform_whatsapp_integrations; old public.platform_whatsapp_integrations; k uuid; creds jsonb; previous jsonb; changed_host boolean; secret_changed boolean; why text;
begin
  if auth.role() is distinct from 'service_role' or jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>32768 then raise exception 'WHATSAPP: Serviço não autorizado'; end if;
  if p_action='runtime' then
    return coalesce((select jsonb_object_agg(c.provider,jsonb_build_object('enabled',c.enabled,'url',c.url,'instance',c.instance_name,'revision',c.revision,'key',v.decrypted_secret::jsonb->>'key','globalKey',v.decrypted_secret::jsonb->>'globalKey','webhookSecret',v.decrypted_secret::jsonb->>'webhookSecret')) from platform_whatsapp_integrations c join vault.decrypted_secrets v on v.id=c.secret_id),'{}'::jsonb);
  end if;
  a:=(p_data->>'actor')::uuid;
  if not exists(select 1 from platform_admin_accounts where auth_user_id=a and active and role in('owner','admin'))
    or exists(select 1 from platform_account_controls c join players p on p.id=c.player_id where p.auth_user_id=a and c.suspended)
    then raise exception 'WHATSAPP: Acesso exclusivo de administradores da plataforma'; end if;
  if p_action='metadata' then
    return coalesce((select jsonb_agg(jsonb_build_object('provider',c.provider,'url',c.url,'instance',c.instance_name,'enabled',c.enabled,'revision',c.revision,'hasToken',true,'hasGlobalKey',coalesce(length(v.decrypted_secret::jsonb->>'globalKey'),0)>0,'probeOk',c.probe_ok,'testedAt',c.tested_at,'state',c.state,'provisionState',c.provision_state)) from platform_whatsapp_integrations c join vault.decrypted_secrets v on v.id=c.secret_id),'[]'::jsonb);
  end if;
  if p_data->>'provider' is null or p_data->>'provider' not in('evolution_api','evolution_go') then raise exception 'WHATSAPP: Provedor inválido'; end if;
  perform pg_advisory_xact_lock(hashtextextended('platform-wa:'||(p_data->>'provider'),0));
  select * into old from platform_whatsapp_integrations where provider=p_data->>'provider' for update;
  if p_action='context' then
    if old.provider is null then raise exception 'WHATSAPP: Salve a configuração primeiro'; end if;
    select decrypted_secret::jsonb into creds from vault.decrypted_secrets where id=old.secret_id;
    return jsonb_build_object('provider',old.provider,'url',old.url,'instance',old.instance_name,'revision',old.revision,'enabled',old.enabled,'provisionState',old.provision_state,'key',creds->>'key','globalKey',creds->>'globalKey','webhookSecret',creds->>'webhookSecret');
  end if;
  if coalesce((p_data->>'revision')::integer,0)<>coalesce(old.revision,0) then raise exception 'WHATSAPP: Configuração mudou. Atualize antes de repetir'; end if;
  why:=btrim(coalesce(p_data->>'reason',''));
  if old.secret_id is not null then
    select decrypted_secret::jsonb into previous from vault.decrypted_secrets where id=old.secret_id;
    if position(previous->>'key' in why)>0 or (length(coalesce(previous->>'globalKey',''))>0 and position(previous->>'globalKey' in why)>0) then raise exception 'WHATSAPP: Não coloque credenciais no motivo'; end if;
  end if;
  if p_action in('save','enable','claim_create') and length(why) not between 8 and 500 then raise exception 'WHATSAPP: Informe motivo de 8 a 500 caracteres'; end if;
  if p_action='save' then
    if coalesce(p_data->>'url','') !~ '^https://[^[:space:]?#@]+$' or length(p_data->>'url')>500 then raise exception 'WHATSAPP: Host HTTPS obrigatório'; end if;
    if old.secret_id is not null then select decrypted_secret::jsonb into previous from vault.decrypted_secrets where id=old.secret_id; end if;
    changed_host:=old.url is distinct from p_data->>'url';
    if changed_host and old.provider is not null and nullif(p_data->>'key','') is null then raise exception 'WHATSAPP: Novo host exige informar o token novamente'; end if;
    creds:=jsonb_build_object('key',coalesce(nullif(p_data->>'key',''),previous->>'key'),
      'globalKey',coalesce(nullif(p_data->>'globalKey',''),case when not changed_host then previous->>'globalKey' end),
      'webhookSecret',coalesce(nullif(p_data->>'webhookSecret',''),case when not changed_host then previous->>'webhookSecret' end,replace(gen_random_uuid()::text,'-','')));
    if coalesce(length(creds->>'key'),0) not between 8 and 8192 or coalesce(length(creds->>'webhookSecret'),0) not between 16 and 512 or coalesce(length(creds->>'globalKey'),0)>8192 then raise exception 'WHATSAPP: Credenciais inválidas'; end if;
    if creds->>'key' ~ '[\r\n]' or creds->>'globalKey' ~ '[\r\n]' or position(creds->>'key' in why)>0 or (length(coalesce(creds->>'globalKey',''))>0 and position(creds->>'globalKey' in why)>0) then raise exception 'WHATSAPP: Não coloque credenciais no motivo'; end if;
    secret_changed:=changed_host or creds is distinct from previous;
    k:=vault.create_secret(creds::text);
    insert into platform_whatsapp_integrations(provider,url,secret_id,instance_name,enabled,revision)
      values(p_data->>'provider',p_data->>'url',k,'mj-platform-'||replace(gen_random_uuid()::text,'-',''),false,1)
      on conflict(provider) do update set url=excluded.url,secret_id=k,
        instance_name=case when changed_host then excluded.instance_name else old.instance_name end,
        enabled=case when secret_changed then false else old.enabled end,
        revision=old.revision+1,probe_ok=case when secret_changed then false else old.probe_ok end,
        state=case when changed_host then 'unknown' else old.state end,
        provision_state=case when changed_host then 'none' else old.provision_state end,updated_at=now();
    if changed_host and p_data->>'provider'='evolution_api' then
      update venue_whatsapp_instances set instance_name='mj-'||replace(gen_random_uuid()::text,'-',''),state='unknown',updated_at=now();
    end if;
  elsif p_action='enable' then
    if old.provider is null or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'WHATSAPP: Configuração inválida'; end if;
    if (p_data->>'enabled')::boolean and not old.probe_ok then raise exception 'WHATSAPP: Teste o acesso antes de ativar'; end if;
    if (p_data->>'enabled')::boolean and old.provider='evolution_go' and old.state<>'open' then raise exception 'WHATSAPP: Conecte o número Go antes de ativar'; end if;
    update platform_whatsapp_integrations set enabled=(p_data->>'enabled')::boolean,revision=revision+1,updated_at=now() where provider=old.provider;
  elsif p_action='probe' then
    if old.provider is null or p_data->>'state' not in('unknown','connecting','open','close') or jsonb_typeof(p_data->'ok') is distinct from 'boolean' then raise exception 'WHATSAPP: Resultado inválido'; end if;
    update platform_whatsapp_integrations set probe_ok=(p_data->>'ok')::boolean,state=p_data->>'state',tested_at=now(),
      provision_state=case when (p_data->>'provisioned')::boolean is true then 'created' else provision_state end where provider=old.provider;
  elsif p_action='claim_create' then
    if old.provider is null or old.provision_state<>'none' then raise exception 'WHATSAPP: Criação já iniciada. Consulte a instância antes de repetir'; end if;
    update platform_whatsapp_integrations set provision_state='creating' where provider=old.provider;
  elsif p_action='finish_create' then
    if p_data->>'status' not in('created','uncertain') then raise exception 'WHATSAPP: Estado de criação inválido'; end if;
    update platform_whatsapp_integrations set provision_state=p_data->>'status' where provider=old.provider and provision_state='creating';
  else raise exception 'WHATSAPP: Ação inválida'; end if;
  insert into platform_admin_audit(actor_auth_user_id,action,target_id,reason,after_value)
    select a,'whatsapp_'||p_action,provider,coalesce(nullif(why,''),'Consulta técnica da integração WhatsApp'),jsonb_build_object('provider',provider,'url',url,'enabled',enabled,'revision',revision,'state',state,'probeOk',probe_ok) from platform_whatsapp_integrations where provider=p_data->>'provider';
  return '{}';
end $$;
revoke all on function public.platform_whatsapp_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.platform_whatsapp_service(text,jsonb) to service_role;

-- 20261015010000_game_lances.sql
-- Lances: private uploads -> verified media -> deliberate publication.
-- No score/goal writes, no camera URL fetches, and no client camera credentials.
create table public.game_lances (
 id uuid primary key default gen_random_uuid(), game_id uuid not null references games(id) on delete cascade,
 author_id uuid not null references players(id), nonce uuid not null,
 title text not null check(length(btrim(title)) between 3 and 100),
 caption text not null default '' check(length(caption)<=1200),
 kind text not null default 'play' check(kind in ('goal','point','save','play')),
 scorer_id uuid references players(id), assist_id uuid references players(id),
 scorer_confirmed boolean not null default false, assist_confirmed boolean not null default false,
 media_key text not null unique, duration_seconds numeric not null check(duration_seconds>0 and duration_seconds<=90),
 status text not null default 'uploading' check(status in ('uploading','ready','deleted')),
 visibility text not null default 'team' check(visibility in ('team','public')),
 published_at timestamptz, rights_confirmed_at timestamptz,
 source text not null default 'upload' check(source in ('upload','camera')),
 hidden boolean not null default false, revision integer not null default 1,
 created_at timestamptz not null default now(), unique(author_id,nonce),
 check(scorer_id is null or assist_id is null or scorer_id<>assist_id),
 check(kind in ('goal','point') or (scorer_id is null and assist_id is null))
);
create index game_lances_timeline on public.game_lances(game_id,created_at desc,id);
create index game_lances_feed on public.game_lances(published_at desc,id) where published_at is not null and not hidden and status='ready';
create table public.lance_likes (
 lance_id uuid references game_lances(id) on delete cascade, player_id uuid references players(id) on delete cascade,
 primary key(lance_id,player_id)
);
create table public.lance_comments (
 id uuid primary key default gen_random_uuid(), lance_id uuid not null references game_lances(id) on delete cascade,
 player_id uuid not null references players(id), body text not null check(length(btrim(body)) between 1 and 500),
 nonce uuid not null, created_at timestamptz not null default now(), unique(player_id,nonce)
);
create table public.lance_reports (
 lance_id uuid references game_lances(id), reporter_id uuid references players(id), report_id uuid references moderation_reports(id),
 primary key(lance_id,reporter_id)
);
-- Disabled until a real partner, device binding and capture permissions are configured.
create table public.lance_camera_sources (
 id uuid primary key default gen_random_uuid(), field_id uuid not null references fields(id),
 provider text not null, name text not null, enabled boolean not null default false
);
create table public.lance_camera_events (
 source_id uuid references lance_camera_sources(id), event_id uuid not null,
 lance_id uuid not null references game_lances(id), captured_at timestamptz not null,
 primary key(source_id,event_id)
);
do $$ declare t text; begin
 foreach t in array array['game_lances','lance_likes','lance_comments','lance_reports','lance_camera_sources','lance_camera_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
end $$;

create function public.lance_member(p_game uuid,p_me uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select p_me is not null and exists(select 1 from games g join pelada_memberships m on m.pelada_id=g.pelada_id
 where g.id=p_game and m.player_id=p_me and m.active)
$$;
create function public.lance_manager(p_game uuid,p_me uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from games g join pelada_memberships m on m.pelada_id=g.pelada_id
 where g.id=p_game and m.player_id=p_me and m.active and m.role='admin')
$$;
create function public.lance_participant(p_game uuid,p_player uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.lance_member(p_game,p_player) and exists(select 1 from attendances a join players p on p.id=a.player_id
 where a.game_id=p_game and a.player_id=p_player and a.status='confirmed' and not a.no_show and not p.is_guest and p.auth_user_id is not null)
$$;
create function public.lance_read(p_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from game_lances l where l.id=p_id and l.status<>'deleted' and (not l.hidden or public.platform_admin_role() is not null)
 and (auth.uid() is null or public.community_chat_me() is not null)
 and not exists(select 1 from community_chat_blocks b where
 (b.player_id=public.community_chat_me() and b.blocked_player_id=l.author_id)
 or (b.blocked_player_id=public.community_chat_me() and b.player_id=l.author_id))
 and (public.platform_admin_role() is not null or l.author_id=public.community_chat_me()
 or public.lance_manager(l.game_id,public.community_chat_me())
 or (l.status='ready' and l.published_at is not null and
 (l.visibility='public' or public.lance_member(l.game_id,public.community_chat_me())))))
$$;
create function public.lance_json(l public.game_lances) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',l.id,'gameId',l.game_id,'teamId',g.pelada_id,'teamName',t.name,'sportId',t.sport_id,
 'authorId',l.author_id,'authorName',coalesce(nullif(p.nickname,''),p.name),'title',l.title,'caption',l.caption,'kind',l.kind,
 'scorerId',l.scorer_id,'scorerName',(select coalesce(nullif(nickname,''),name) from players where id=l.scorer_id),
 'assistId',l.assist_id,'assistName',(select coalesce(nullif(nickname,''),name) from players where id=l.assist_id),
 'scorerConfirmed',l.scorer_confirmed,'assistConfirmed',l.assist_confirmed,
 'mediaKey',case when l.status='ready' then l.media_key else null end,'durationSeconds',l.duration_seconds,
 'status',l.status,'visibility',l.visibility,'publishedAt',l.published_at,'source',l.source,'createdAt',l.created_at,'revision',l.revision,
 'hidden',l.hidden,'canModerate',public.platform_admin_role() is not null,
 'canManage',l.author_id=public.community_chat_me() or public.lance_manager(l.game_id,public.community_chat_me()),
 'likes',(select count(*) from lance_likes where lance_id=l.id),
 'liked',(select exists(select 1 from lance_likes where lance_id=l.id and player_id=public.community_chat_me())),
 'commentCount',(select count(*) from lance_comments where lance_id=l.id))
 from games g join peladas t on t.id=g.pelada_id join players p on p.id=l.author_id where g.id=l.game_id
$$;
create function public.lance_snapshot(p_game uuid default null,p_team uuid default null,p_id uuid default null,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me(); list jsonb; roster jsonb:='[]'; comments jsonb:='[]';
begin
 if auth.uid() is not null and me is null then raise exception 'LANCES:Entre em uma conta ativa'; end if;
 if p_game is not null and not public.lance_member(p_game,me) then raise exception 'LANCES:Este jogo é exclusivo dos membros do time'; end if;
 if p_team is not null and not exists(select 1 from pelada_memberships where pelada_id=p_team and player_id=me and active) then raise exception 'LANCES:Sem acesso ao time'; end if;
 if p_id is not null and not public.lance_read(p_id) then raise exception 'LANCES:Lance indisponível ou privado'; end if;
 select coalesce(jsonb_agg(public.lance_json(x) order by x.created_at desc,x.id desc),'[]') into list
 from (select l.* from game_lances l join games g on g.id=l.game_id
 where public.lance_read(l.id) and (p_game is null or l.game_id=p_game) and (p_team is null or g.pelada_id=p_team)
 and (p_id is null or l.id=p_id) and (p_before is null or (l.created_at,l.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
 and (p_game is not null or p_team is not null or p_id is not null or l.published_at is not null)
 order by l.created_at desc,l.id desc limit 21) x;
 if p_game is not null or (p_id is not null and public.lance_member((select game_id from game_lances where id=p_id),me)) then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.nickname,''),p.name)) order by p.name),'[]') into roster
  from players p where public.lance_participant(coalesce(p_game,(select game_id from game_lances where id=p_id)),p.id);
 end if;
 if p_id is not null then
  select coalesce(jsonb_agg(x.j order by x.at),'[]') into comments from (
   select jsonb_build_object('id',c.id,'playerId',c.player_id,'name',coalesce(nullif(p.nickname,''),p.name),'body',c.body,'createdAt',c.created_at) j,c.created_at at
   from lance_comments c join players p on p.id=c.player_id where c.lance_id=p_id
   and not exists(select 1 from community_chat_blocks b where (b.player_id=me and b.blocked_player_id=c.player_id) or (b.blocked_player_id=me and b.player_id=c.player_id))
   order by c.created_at desc,c.id limit 50) x;
 end if;
 return jsonb_build_object('items',list,'participants',roster,'comments',comments,'me',me);
end $$;

create function public.lance_action(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=public.community_chat_me(); l public.game_lances; key text; target uuid; report uuid;
begin
 if me is null then raise exception 'LANCES:Entre em uma conta ativa'; end if;
 perform pg_advisory_xact_lock(hashtextextended('lance:'||me::text,0));
 if p_action='create' then
  if not public.lance_member((p_data->>'gameId')::uuid,me) then raise exception 'LANCES:Sem acesso ao jogo'; end if;
  select * into l from game_lances where author_id=me and nonce=(p_data->>'nonce')::uuid;
  if l.id is not null then
   if l.game_id<>(p_data->>'gameId')::uuid or l.status='deleted' then raise exception 'LANCES:Identificador já utilizado'; end if;
   return jsonb_build_object('id',l.id,'mediaKey',l.media_key);
  end if;
  if (select count(*) from game_lances where author_id=me and created_at>now()-interval '1 day')>=20 then raise exception 'LANCES:Limite de 20 envios por dia'; end if;
  l.id:=gen_random_uuid(); key:=me::text||'/'||l.id::text||'.mp4';
  insert into game_lances(id,game_id,author_id,nonce,title,duration_seconds,media_key)
   values(l.id,(p_data->>'gameId')::uuid,me,(p_data->>'nonce')::uuid,btrim(p_data->>'title'),(p_data->>'durationSeconds')::numeric,key) returning * into l;
  return jsonb_build_object('id',l.id,'mediaKey',key);
 end if;
 select * into l from game_lances where id=(p_data->>'id')::uuid for update;
 if l.id is null or l.status='deleted' then raise exception 'LANCES:Lance indisponível'; end if;
 if p_action='moderate' then
  if public.platform_admin_role() is null then raise exception 'LANCES:Moderação restrita'; end if;
  if length(btrim(coalesce(p_data->>'reason','')))<5 or jsonb_typeof(p_data->'hidden') is distinct from 'boolean' then raise exception 'LANCES:Informe o motivo'; end if;
  update game_lances set hidden=(p_data->>'hidden')::boolean,revision=revision+1 where id=l.id;
  insert into platform_admin_audit(actor_auth_user_id,action,target_id,reason,after_value)
   values(auth.uid(),'lance_moderate',l.id::text,p_data->>'reason',jsonb_build_object('hidden',(p_data->>'hidden')::boolean));
  return '{}';
 end if;
 if not public.lance_read(l.id) then raise exception 'LANCES:Lance indisponível ou privado'; end if;
 if p_action in ('finish_upload','edit','publish','unpublish','delete') then
  if not (l.author_id=me or public.lance_manager(l.game_id,me)) then raise exception 'LANCES:Apenas autor ou administrador do time'; end if;
  if p_action not in ('delete','unpublish') and not public.lance_member(l.game_id,me) then raise exception 'LANCES:Sem acesso ao time; você ainda pode retirar ou excluir seu próprio lance'; end if;
  if (p_data->>'revision')::int is distinct from l.revision then raise exception 'LANCES:O lance mudou. Atualize antes de continuar'; end if;
  if p_action='finish_upload' then
   if l.status<>'uploading' then return '{}'; end if;
   if not exists(select 1 from storage.objects where bucket_id='lances' and name=l.media_key
     and (metadata->>'size')::bigint between 1 and 62914560 and metadata->>'mimetype'='video/mp4') then raise exception 'LANCES:Envio incompleto. Envie um MP4 de até 60 MB'; end if;
   update game_lances set status='ready',revision=revision+1 where id=l.id;
  elsif p_action='edit' then
   if l.published_at is not null then raise exception 'LANCES:Retire a publicação antes de editar'; end if;
   if p_data->>'kind' not in ('goal','point','save','play') then raise exception 'LANCES:Tipo inválido'; end if;
   for target in select v::uuid from jsonb_array_elements_text(jsonb_build_array(nullif(p_data->>'scorerId',''),nullif(p_data->>'assistId',''))) v where v is not null loop
    if not public.lance_participant(l.game_id,target) then raise exception 'LANCES:Marque apenas participantes confirmados'; end if;
   end loop;
   update game_lances set title=btrim(p_data->>'title'),caption=coalesce(p_data->>'caption',''),kind=p_data->>'kind',
    scorer_id=nullif(p_data->>'scorerId','')::uuid,assist_id=nullif(p_data->>'assistId','')::uuid,
    scorer_confirmed=coalesce(case when scorer_id=nullif(p_data->>'scorerId','')::uuid then scorer_confirmed else false end or nullif(p_data->>'scorerId','')::uuid=me,false),
    assist_confirmed=coalesce(case when assist_id=nullif(p_data->>'assistId','')::uuid then assist_confirmed else false end or nullif(p_data->>'assistId','')::uuid=me,false),
    revision=revision+1 where id=l.id;
  elsif p_action='publish' then
   if l.status<>'ready' or (p_data->>'rightsConfirmed')::boolean is not true or p_data->>'visibility' not in ('team','public') then raise exception 'LANCES:Confirme o vídeo, a visibilidade e a autorização de publicação'; end if;
   if p_data->>'visibility'='public' and ((l.scorer_id is not null and not l.scorer_confirmed) or (l.assist_id is not null and not l.assist_confirmed)) then raise exception 'LANCES:Para publicar para todos, aguarde a confirmação das marcações ou remova-as'; end if;
   update game_lances set published_at=now(),visibility=p_data->>'visibility',rights_confirmed_at=now(),revision=revision+1 where id=l.id;
  elsif p_action='unpublish' then
   update game_lances set published_at=null,visibility='team',revision=revision+1 where id=l.id;
  else update game_lances set status='deleted',published_at=null,revision=revision+1 where id=l.id;
  end if;
 elsif p_action='tag' then
  if jsonb_typeof(p_data->'accept') is distinct from 'boolean' then raise exception 'LANCES:Resposta inválida'; end if;
  if p_data->>'role'='scorer' and l.scorer_id=me then
   update game_lances set scorer_id=case when (p_data->>'accept')::boolean then me end,scorer_confirmed=(p_data->>'accept')::boolean,
    visibility=case when (p_data->>'accept')::boolean then visibility else 'team' end,revision=revision+1 where id=l.id;
  elsif p_data->>'role'='assist' and l.assist_id=me then
   update game_lances set assist_id=case when (p_data->>'accept')::boolean then me end,assist_confirmed=(p_data->>'accept')::boolean,
    visibility=case when (p_data->>'accept')::boolean then visibility else 'team' end,revision=revision+1 where id=l.id;
  else raise exception 'LANCES:Você só pode responder à própria marcação'; end if;
 elsif p_action in ('like','comment','report') then
  if l.published_at is null or l.status<>'ready' then raise exception 'LANCES:Publique o lance antes de interagir'; end if;
  if p_action='like' then
   if jsonb_typeof(p_data->'liked') is distinct from 'boolean' then raise exception 'LANCES:Reação inválida'; end if;
   if (p_data->>'liked')::boolean then insert into lance_likes values(l.id,me) on conflict do nothing;
   else delete from lance_likes where lance_id=l.id and player_id=me; end if;
  elsif p_action='comment' then
   if (select count(*) from lance_comments where player_id=me and created_at>now()-interval '1 minute')>=20 then raise exception 'LANCES:Aguarde antes de comentar novamente'; end if;
   insert into lance_comments(lance_id,player_id,body,nonce) values(l.id,me,btrim(p_data->>'body'),(p_data->>'nonce')::uuid) on conflict(player_id,nonce) do nothing;
  else
   if p_data->>'reason' not in ('harassment','fraud','unsafe_content','spam','other') then raise exception 'LANCES:Motivo inválido'; end if;
   select report_id into report from lance_reports where lance_id=l.id and reporter_id=me;
   if report is null then
    insert into moderation_reports(reporter_player_id,target_type,target_id,reason,details)
     values(me,'player',l.author_id,p_data->>'reason','Lance '||l.id::text||': '||left(coalesce(p_data->>'details',''),1000)) returning id into report;
    insert into lance_reports values(l.id,me,report);
   end if;
  end if;
 else raise exception 'LANCES:Ação inválida'; end if;
 return jsonb_build_object('id',l.id);
end $$;

-- Only a trusted worker may ingest an already uploaded camera clip.
create function public.lance_camera_ingest(p_source uuid,p_event uuid,p_game uuid,p_captured_at timestamptz,p_duration numeric)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s lance_camera_sources; g games; k text; result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('camera:'||p_source::text||':'||p_event::text,0));
 select * into s from lance_camera_sources where id=p_source and enabled;
 if s.id is null then raise exception 'LANCES:Câmera não habilitada'; end if;
 select lance_id into result from lance_camera_events where source_id=p_source and event_id=p_event;
 if result is not null then return result; end if;
 select * into g from games where id=p_game and field_id=s.field_id and status in ('in_progress','finished');
 if g.id is null or p_captured_at is null or p_captured_at<g.scheduled_at or p_captured_at>g.scheduled_at+make_interval(mins=>g.duration_minutes)
  or p_captured_at>now()+interval '2 minutes' then raise exception 'LANCES:Captura fora da partida'; end if;
 k:='camera/'||s.id::text||'/'||p_event::text||'.mp4';
 if not exists(select 1 from storage.objects where bucket_id='lances' and name=k and metadata->>'mimetype'='video/mp4'
  and (metadata->>'size')::bigint between 1 and 62914560) then raise exception 'LANCES:Vídeo não recebido'; end if;
 insert into game_lances(game_id,author_id,nonce,title,duration_seconds,media_key,source,status)
 values(g.id,g.created_by,p_event,'Lance da câmera',p_duration,k,'camera','ready') returning id into result;
 insert into lance_camera_events values(s.id,p_event,result,p_captured_at);
 return result;
end $$;

revoke all on function public.lance_member(uuid,uuid),public.lance_manager(uuid,uuid),public.lance_participant(uuid,uuid),
 public.lance_read(uuid),public.lance_json(public.game_lances),public.lance_snapshot(uuid,uuid,uuid,timestamptz,uuid),
 public.lance_action(text,jsonb),public.lance_camera_ingest(uuid,uuid,uuid,timestamptz,numeric) from public,anon,authenticated;
grant execute on function public.lance_snapshot(uuid,uuid,uuid,timestamptz,uuid) to anon,authenticated;
grant execute on function public.lance_action(text,jsonb) to authenticated;
grant execute on function public.lance_camera_ingest(uuid,uuid,uuid,timestamptz,numeric) to service_role;
-- Storage policies invoke the helper; it returns only whether this session may read.
grant execute on function public.lance_read(uuid) to anon,authenticated;

create function public.lance_upload_allowed(p_key text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from game_lances l where l.media_key=p_key and l.author_id=public.community_chat_me()
 and l.status='uploading' and public.lance_member(l.game_id,public.community_chat_me()) and split_part(p_key,'/',1)=public.community_chat_me()::text)
$$;
create function public.lance_media_allowed(p_key text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from game_lances l where l.media_key=p_key and l.status='ready' and public.lance_read(l.id))
$$;
revoke all on function public.lance_upload_allowed(text),public.lance_media_allowed(text) from public,anon,authenticated;
grant execute on function public.lance_upload_allowed(text) to authenticated;
grant execute on function public.lance_media_allowed(text) to anon,authenticated;

do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('lances','lances',false,62914560,array['video/mp4']) on conflict(id) do nothing;
 end if;
 if to_regclass('storage.objects') is not null then
  execute $p$create policy lances_upload on storage.objects for insert to authenticated with check(
   bucket_id='lances' and public.lance_upload_allowed(name))$p$;
  execute $p$create policy lances_read on storage.objects for select to anon,authenticated using(
   bucket_id='lances' and public.lance_media_allowed(name))$p$;
 end if;
end $$;

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
