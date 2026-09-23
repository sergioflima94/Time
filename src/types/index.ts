/**
 * Modelo de domínio do app de pelada (futebol amador).
 *
 * Conceitos principais:
 * - Pelada: o grupo fixo de jogadores (ex.: "Pelada da Firma - Terças"). Tem admins,
 *   campos cadastrados e uma agenda de jogos (única, semanal ou quinzenal).
 * - Game: uma partida específica gerada a partir da agenda (ou avulsa).
 * - Attendance: a chamada — cada jogador confirma presença, recusa ou fica em espera
 *   quando o limite de vagas do jogo já foi atingido.
 * - Team / TeamPlayer: o resultado do sorteio de times para um Game.
 * - Rating: nota estilo "carta de FIFA" que um jogador dá a outro após o jogo.
 * - Punishment: penalidade aplicada quando alguém confirma presença e falta (furou).
 */

export type UUID = string;

export type PlayerPosition = 'goalkeeper' | 'line';

export interface Player {
  id: UUID;
  authUserId: string | null;
  name: string;
  nickname: string | null;
  avatarUrl: string | null;
  phone: string | null;
  preferredPosition: PlayerPosition;
  /** Esportes favoritos (SportIds de src/constants/sports.ts) — jogador multi-esporte, pode marcar mais de um. */
  favoriteSports: string[];
  /**
   * Foto escolhida pelo jogador como fundo da própria carta (exclusivo Premium). A cor
   * da faixa (bronze/prata/ouro/especial, decidida pela nota geral) sempre aparece por
   * cima como uma camada — o jogador não escolhe a cor, só o plano de fundo.
   */
  cardBackgroundUrl: string | null;
  /**
   * Assinatura Premium (sem anúncios, estilos/fundo de carta exclusivos) — mensal e
   * gerenciada pela App Store / Google Play. `premiumSince` é a primeira assinatura;
   * `premiumUntil` é até quando o período pago atual vale. Use isPremiumActive()
   * (src/lib/premium.ts) para checar se o benefício está valendo agora — se
   * `premiumUntil` passou (não renovou), o jogador perde o benefício.
   */
  premiumSince: string | null;
  premiumUntil: string | null;
  /** Nem sempre disponível: refletido pelo SDK de compras nativo (RevenueCat/StoreKit), não gerenciado por nós. */
  premiumAutoRenew: boolean;
  isGuest: boolean;
  /**
   * Opt-in: aparece na busca de "jogadores livres" pra admins de peladas de que
   * ele NÃO é membro, quando falta gente pra fechar um jogo perto dele.
   * Desligado por padrão — o jogador ativa manualmente no Perfil.
   */
  freeAgentOptIn: boolean;
  /** Raio máximo (km) que topa se deslocar quando é convidado como avulso. null = sem opt-in ainda. */
  freeAgentRadiusKm: number | null;
  /** Dias/horários em que costuma estar livre pra jogar (usado pra casar com o horário do jogo). */
  freeAgentAvailability: AvailabilitySlot[];
  /** Última localização conhecida (aproximada), usada só pra calcular distância — nunca exibida exata pros outros. */
  location: GeoPoint | null;
  locationUpdatedAt: string | null;
  createdAt: string;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** Uma janela de disponibilidade recorrente pra jogar como avulso. */
export interface AvailabilitySlot {
  /** 0 (domingo) a 6 (sábado). */
  weekday: number;
  /** Horário no formato HH:mm. */
  startTime: string;
  endTime: string;
}

/** Nota geral calculada a partir das Ratings recebidas (estilo carta de FIFA, 0-99). */
export interface PlayerOverall {
  playerId: UUID;
  overall: number; // 0-99
  attack: number; // 0-99
  defense: number; // 0-99
  pace: number; // 0-99
  ratingsCount: number;
}

export type PeladaRole = 'admin' | 'member';

export interface Pelada {
  id: UUID;
  name: string;
  description: string | null;
  /** Esporte da pelada (SportId de src/constants/sports.ts) — decide terminologia (gol/ponto), cor de destaque e se o sorteio usa goleiro. */
  sportId: string;
  /** Só relevante quando sportId === 'futebol' — variante do campo. */
  footballVariant: 'society' | 'futsal' | 'campo';
  defaultMaxPlayers: number;
  defaultMatchMinutes: number;
  /** Código curto pra convidar gente nova pra pelada (link/compartilhamento). */
  inviteCode: string;
  /** O que membros comuns (não-admin) podem fazer sem precisar de um admin. Default: nada, só admin. */
  memberInvitePermissions: PeladaMemberInvitePermissions;
  createdBy: UUID;
  createdAt: string;
}

export interface PeladaMemberInvitePermissions {
  /** Membro comum pode convidar jogador livre (de fora) pro próximo jogo, não só admin. */
  canInviteFreeAgents: boolean;
  /** Membro comum pode ver/compartilhar o código de convite pra trazer gente nova, não só admin. */
  canInviteNewMembers: boolean;
}

export interface PeladaMembership {
  peladaId: UUID;
  playerId: UUID;
  role: PeladaRole;
  active: boolean;
  joinedAt: string;
}

export interface Field {
  id: UUID;
  /** null = campo próprio do estabelecimento, não pertence a nenhuma pelada específica. */
  peladaId: UUID | null;
  name: string;
  address: string | null;
  notes: string | null;
  /** Vincula esse campo a um estabelecimento cadastrado (dono de verdade, recebe o rateio). null = sem dono cadastrado, funciona como hoje. */
  establishmentId: UUID | null;
  /** Esporte jogado nesse campo (SportId de src/constants/sports.ts). Campo de pelada herda o esporte dela; campo próprio do estabelecimento escolhe o esporte na hora de cadastrar — assim um estabelecimento pode ter campos de esportes diferentes. */
  sportId: string;
  createdBy: UUID;
}

export type FieldBookingRecurrence = 'single' | 'weekly';

/**
 * Reserva de um campo do estabelecimento, cadastrada pelo próprio dono — pra um time
 * já cadastrado (uma pelada) ou avulso (só o nome, sem conta). "weekly" é o horário
 * fixo: toda semana, naquele dia + horário, aquele time já está lá.
 */
export interface FieldBooking {
  id: UUID;
  fieldId: UUID;
  establishmentId: UUID;
  /** Time cadastrado (de uma pelada existente) — null quando o time é avulso. */
  peladaId: UUID | null;
  /** Nome exibido do time. Preenchido com o nome da pelada quando peladaId está setado. */
  teamName: string;
  recurrence: FieldBookingRecurrence;
  /** 0 (domingo) a 6 (sábado) — obrigatório quando recurrence === 'weekly'. */
  dayOfWeek: number | null;
  /** Data (YYYY-MM-DD) — obrigatória quando recurrence === 'single'. */
  date: string | null;
  /** Horário no formato HH:mm. */
  time: string;
  durationMinutes: number;
  notes: string | null;
  createdBy: UUID;
  createdAt: string;
}

export type EstablishmentPayoutMethod = 'pix' | 'in_person';

/**
 * Dono de campo/quadra — um papel independente de pelada. Cadastra o estabelecimento
 * e como quer receber o rateio das partidas jogadas lá (Pix, ou combinar na hora).
 */
export interface Establishment {
  id: UUID;
  ownerPlayerId: UUID;
  name: string;
  payoutMethod: EstablishmentPayoutMethod;
  /** Chave Pix pra receber — obrigatória quando payoutMethod = 'pix'. */
  pixKey: string | null;
  /** Código curto que o admin de uma pelada usa pra vincular um campo a este estabelecimento. */
  accessCode: string;
  createdAt: string;
}

export type RecurrenceType = 'single' | 'weekly' | 'biweekly';

/** Configuração de agenda: gera Games automaticamente conforme a recorrência. */
export interface Schedule {
  id: UUID;
  peladaId: UUID;
  fieldId: UUID;
  recurrence: RecurrenceType;
  /** 0 (domingo) a 6 (sábado). Ignorado quando recurrence === 'single'. */
  dayOfWeek: number | null;
  /** Horário no formato HH:mm */
  time: string;
  /** Data-base: para 'single' é a data do jogo; para semanal/quinzenal, a primeira ocorrência. */
  startDate: string;
  endDate: string | null;
  maxPlayers: number;
  matchMinutes: number;
  drawMethod: DrawMethod;
  /** Custo padrão da quadra, usado para calcular o rateio ("vaquinha") de cada jogo gerado. null = sem rateio. */
  defaultFieldCost: number | null;
  /** Limite de gols de cada rodada: quem chegar primeiro vence, mesmo antes do tempo acabar. null = só por tempo. */
  matchGoalLimit: number | null;
  active: boolean;
  createdBy: UUID;
}

export type GameStatus =
  | 'open' // chamada aberta, aguardando confirmações
  | 'full' // vagas esgotadas
  | 'teams_drawn' // times já sorteados
  | 'in_progress' // cronômetro rodando
  | 'finished'
  | 'cancelled';

export type DrawMethod = 'arrival' | 'random' | 'rating';

/**
 * Como a fila de rodízio funciona depois do sorteio:
 * - "teams": monta todos os times de uma vez (fixos) e eles se revezam em bloco.
 * - "players": monta só o 1º confronto; o resto vira uma bolsa de jogadores
 *   avulsos, e cada novo desafiante é puxado dali por prioridade individual
 *   (ver "Troca de jogador em campo" / rodízio individual no README).
 */
export type RotationMode = 'teams' | 'players';

export interface Game {
  id: UUID;
  peladaId: UUID;
  scheduleId: UUID | null;
  fieldId: UUID;
  scheduledAt: string; // ISO datetime
  maxPlayers: number;
  playersPerTeam: number; // ex.: 5 linha + 1 goleiro = 6
  matchMinutes: number; // duração de cada "rodada" antes da troca
  drawMethod: DrawMethod;
  rotationMode: RotationMode;
  status: GameStatus;
  /** Custo total da quadra nesse jogo. null = sem rateio (cada um resolve por fora). */
  fieldCost: number | null;
  /** Limite de gols de cada rodada: quem chegar primeiro vence, mesmo antes do tempo acabar. null = só por tempo. */
  matchGoalLimit: number | null;
  createdBy: UUID;
  createdAt: string;
}

/**
 * Jogador aguardando entrar num time, no rodízio individual (rotationMode "players").
 * Fica fora do array `teamPlayers` até ser sorteado pra um novo time.
 */
export interface WaitingPlayer {
  gameId: UUID;
  playerId: UUID;
  /** Rodadas seguidas que já ficou de fora desde a última vez que jogou (ou desde o sorteio inicial). Prioridade de entrada: maior primeiro. */
  roundsWaited: number;
  /** Desempate quando roundsWaited empata — ordem do método de sorteio escolhido na primeira vez (nota, chegada, ou posição sorteada uma vez no aleatório). Menor valor = prioridade. */
  tiebreakRank: number;
  isGoalkeeper: boolean;
}

export type AttendanceStatus = 'confirmed' | 'declined' | 'waitlist' | 'pending';

export interface Attendance {
  id: UUID;
  gameId: UUID;
  playerId: UUID;
  status: AttendanceStatus;
  /** Ordem de chegada / confirmação, usada no sorteio por "ordem de chegada". */
  confirmedOrder: number | null;
  respondedAt: string | null;
  /** Marcado pelo admin após o jogo: confirmou e não apareceu. */
  noShow: boolean;
  checkedIn: boolean;
}

export interface Team {
  id: UUID;
  gameId: UUID;
  name: string;
  color: string;
  /** Posição na fila de rodízio: 0 e 1 jogam primeiro, os demais ficam "de próximo". */
  queueOrder: number;
}

export interface TeamPlayer {
  teamId: UUID;
  playerId: UUID;
  isGoalkeeper: boolean;
}

export type PlayerFatigueStatus = 'resting' | 'done_for_today';

/**
 * Jogador tirado de campo por cansaço durante o jogo (não é falta nem punição).
 * "resting" volta a poder jogar sozinho depois de `matchesRemaining` rodadas
 * encerradas; "done_for_today" fica de fora pelo resto do jogo, até o admin
 * reverter manualmente.
 */
export interface PlayerFatigue {
  id: UUID;
  gameId: UUID;
  playerId: UUID;
  status: PlayerFatigueStatus;
  /** Só usado quando status === 'resting'. */
  matchesRemaining: number | null;
  createdAt: string;
}

/** Um "turno" de jogo, ex.: Time A x Time B, enquanto Time C espera. */
export interface MatchTurn {
  id: UUID;
  gameId: UUID;
  teamAId: UUID;
  teamBId: UUID;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  /** null enquanto a rodada está rolando; também null (com endedAt preenchido) em caso de empate. */
  winnerTeamId: UUID | null;
}

/** Um gol marcado durante uma rodada (MatchTurn), usado pro placar ao vivo e pro saldo de gols na carta. */
export interface Goal {
  id: UUID;
  gameId: UUID;
  matchTurnId: UUID;
  teamId: UUID;
  /** Quem fez o gol. null = gol contra / autor não identificado. */
  scorerPlayerId: UUID | null;
  scoredAt: string;
}

export interface Rating {
  id: UUID;
  gameId: UUID;
  raterPlayerId: UUID;
  ratedPlayerId: UUID;
  attack: number; // 1-5
  defense: number; // 1-5
  pace: number; // 1-5
  overall: number; // 1-5, média das três acima
  createdAt: string;
}

export type FriendshipStatus = 'pending' | 'accepted' | 'declined';

/** Pedido/relação de amizade entre dois jogadores, independente de pelada. */
export interface Friendship {
  id: UUID;
  requesterId: UUID;
  addresseeId: UUID;
  status: FriendshipStatus;
  createdAt: string;
  respondedAt: string | null;
}

/** Curtida num item do feed de atividades (`computeActivityFeed`). activityId é a chave estável do item (ex.: "goal:playerId:gameId"). */
export interface ActivityLike {
  id: UUID;
  activityId: string;
  playerId: UUID;
  createdAt: string;
}

/** Comentário num item do feed de atividades. Mesma chave `activityId` das curtidas. */
export interface ActivityComment {
  id: UUID;
  activityId: string;
  playerId: UUID;
  text: string;
  createdAt: string;
}

export type PunishmentType = 'no_show' | 'late_cancel';

export interface Punishment {
  id: UUID;
  peladaId: UUID;
  playerId: UUID;
  gameId: UUID;
  type: PunishmentType;
  /** Nível acumulado de faltas nos últimos N jogos, usado para calcular a suspensão. */
  strikeLevel: number;
  suspendedUntilGameCount: number; // quantos próximos jogos fica suspenso
  notes: string | null;
  createdAt: string;
}

export interface PlayerPunishmentSummary {
  playerId: UUID;
  peladaId: UUID;
  activeStrikes: number;
  isSuspended: boolean;
  suspendedRemainingGames: number;
  history: Punishment[];
}

export type PaymentStatus = 'pending' | 'paid' | 'waived';
export type PaymentMethod = 'pix' | 'cash' | 'card';

/** Rateio ("vaquinha") do custo da quadra: 1 registro por jogador confirmado em um Game com fieldCost definido. */
export interface Payment {
  id: UUID;
  gameId: UUID;
  playerId: UUID;
  status: PaymentStatus;
  method: PaymentMethod | null;
  paidAt: string | null;
  /** Quem efetivamente pagou — pode ser diferente de playerId quando alguém paga a própria parte e a de outro jogador junto. null = o próprio jogador pagou. */
  paidByPlayerId: UUID | null;
}

export type FreeAgentInviteStatus = 'pending' | 'accepted' | 'declined';

/**
 * Convite pra um "jogador livre" (opt-in, de fora da pelada) participar de um jogo
 * específico. Diferente do convidado avulso (`Player.isGuest`), quem recebe já tem
 * conta e conteúdo próprio — só não é membro da pelada que está convidando.
 */
export interface FreeAgentInvite {
  id: UUID;
  gameId: UUID;
  peladaId: UUID;
  playerId: UUID;
  invitedByPlayerId: UUID;
  status: FreeAgentInviteStatus;
  createdAt: string;
  respondedAt: string | null;
}

// =========================================================================
// Campeonatos — organizados pelo dono de um estabelecimento, juntando peladas
// e times avulsos numa competição só. Ver src/lib/championship.ts.
// =========================================================================

export type ChampionshipFormat = 'round_robin' | 'knockout';
export type ChampionshipStatus = 'registration' | 'in_progress' | 'finished';

export interface Championship {
  id: UUID;
  establishmentId: UUID;
  name: string;
  /** Esporte do campeonato (SportId de src/constants/sports.ts) — decide terminologia (gol/ponto), cor e se as partidas usam goleiro. */
  sportId: string;
  format: ChampionshipFormat;
  /** Campo do estabelecimento onde as partidas acontecem (opcional — pode definir por partida depois). */
  fieldId: UUID | null;
  maxTeams: number | null;
  /** Taxa de inscrição por time, cobrada pelo estabelecimento. null = grátis. */
  entryFee: number | null;
  /** Código curto pra um time (pelada ou avulso) se inscrever. */
  registrationCode: string;
  registrationDeadline: string | null;
  matchMinutes: number;
  status: ChampionshipStatus;
  createdBy: UUID;
  createdAt: string;
}

export type ChampionshipTeamStatus = 'pending' | 'confirmed';

/** Um time inscrito no campeonato — vindo de uma pelada existente, ou avulso (só pro campeonato). */
export interface ChampionshipTeam {
  id: UUID;
  championshipId: UUID;
  name: string;
  color: string;
  /** Emblema do time — escolhido da galeria ou gerado por IA. null = usa só a cor. */
  logoUrl: string | null;
  /** null = time avulso, criado só pra esse campeonato. */
  peladaId: UUID | null;
  registeredByPlayerId: UUID;
  status: ChampionshipTeamStatus;
  createdAt: string;
}

export interface ChampionshipTeamPlayer {
  championshipTeamId: UUID;
  playerId: UUID;
  isGoalkeeper: boolean;
}

export type ChampionshipMatchStatus = 'scheduled' | 'in_progress' | 'finished';

/** Uma partida do campeonato — rodada (pontos corridos) ou fase (mata-mata). */
export interface ChampionshipMatch {
  id: UUID;
  championshipId: UUID;
  round: number;
  /** Ex.: "Rodada 1", "Quartas de final", "Semifinal", "Final". */
  roundLabel: string;
  /** null enquanto aguarda o time avançar (mata-mata: vencedor de outra partida ainda não decidido). */
  teamAId: UUID | null;
  teamBId: UUID | null;
  /** Mata-mata: de qual partida vem o time A / B, pra propagar o vencedor automaticamente. */
  feedsFromMatchAId: UUID | null;
  feedsFromMatchBId: UUID | null;
  fieldId: UUID | null;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  status: ChampionshipMatchStatus;
  /** Só preenchido se precisou de pênaltis pra desempatar (mata-mata). */
  penaltyScoreA: number | null;
  penaltyScoreB: number | null;
  /** null = empate (só possível em pontos corridos) ou partida ainda não terminou. */
  winnerTeamId: UUID | null;
}

/** Gol marcado numa partida de campeonato — separado de Goal (que é de jogo de pelada). */
export interface ChampionshipGoal {
  id: UUID;
  matchId: UUID;
  teamId: UUID;
  scorerPlayerId: UUID | null;
  scoredAt: string;
}

export type ChallengeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

/**
 * Convite de uma pelada pra outra jogarem uma partida avulsa — sem campeonato nem
 * estabelecimento organizando. Só entre peladas do mesmo esporte. Quando aceito, gera
 * um FriendlyMatch e preenche `matchId`.
 */
export interface TeamChallenge {
  id: UUID;
  challengerPeladaId: UUID;
  challengedPeladaId: UUID;
  /** Data no formato YYYY-MM-DD. */
  proposedDate: string;
  /** Horário no formato HH:mm. */
  proposedTime: string;
  /** Campo sugerido pelo desafiante (opcional) — geralmente um campo da própria pelada dele. */
  fieldId: UUID | null;
  message: string | null;
  status: ChallengeStatus;
  /** Preenchido quando aceito. */
  matchId: UUID | null;
  createdBy: UUID;
  createdAt: string;
  respondedAt: string | null;
}

export type FriendlyMatchStatus = 'scheduled' | 'in_progress' | 'finished';

/**
 * Partida avulsa entre duas peladas inteiras (não só times formados dentro de uma
 * pelada), gerada a partir de um TeamChallenge aceito. Quem marca o gol/ponto é
 * escolhido direto do elenco de cada pelada — não precisa inscrever um "time" separado.
 */
export interface FriendlyMatch {
  id: UUID;
  challengeId: UUID;
  peladaAId: UUID;
  peladaBId: UUID;
  fieldId: UUID | null;
  scheduledAt: string;
  matchMinutes: number;
  /** Esporte da partida — as duas peladas precisam ter o mesmo pra se desafiarem. */
  sportId: string;
  startedAt: string | null;
  endedAt: string | null;
  status: FriendlyMatchStatus;
  /** null = empate ou partida ainda não terminou. */
  winnerPeladaId: UUID | null;
}

/** Gol/ponto marcado numa partida avulsa entre peladas. */
export interface FriendlyMatchGoal {
  id: UUID;
  matchId: UUID;
  peladaId: UUID;
  scorerPlayerId: UUID | null;
  scoredAt: string;
}

export type PlayerDuelStatus = 'pending' | 'accepted' | 'declined';

/**
 * Desafio direto entre dois jogadores (independente de pelada/time) — registra um
 * confronto: quando o resultado é preenchido, fica no retrospecto de ambos.
 */
export interface PlayerDuel {
  id: UUID;
  challengerId: UUID;
  challengedId: UUID;
  message: string | null;
  status: PlayerDuelStatus;
  /** Preenchido depois que os dois combinaram e jogaram de verdade — quem levou a melhor. */
  winnerId: UUID | null;
  /** null enquanto não tem resultado — pode ficar "aceito" por um tempo até alguém registrar. */
  resultNote: string | null;
  createdBy: UUID;
  createdAt: string;
  respondedAt: string | null;
  resultRecordedAt: string | null;
}
