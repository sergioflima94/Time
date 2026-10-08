-- =========================================================================
-- Schema do app de Pelada (futebol amador)
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
