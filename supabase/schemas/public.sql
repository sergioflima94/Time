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
