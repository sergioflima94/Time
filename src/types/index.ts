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
  /** Estilo de cor/fundo escolhido pelo jogador para a própria carta. null = usa a cor da faixa (bronze/prata/ouro/especial). */
  cardStyleId: string | null;
  /** Foto escolhida pelo jogador como fundo da carta. Quando definida, tem prioridade sobre cardStyleId. */
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
  sport: 'society' | 'futsal' | 'campo';
  defaultMaxPlayers: number;
  defaultMatchMinutes: number;
  /** Código curto pra convidar gente nova pra pelada (link/compartilhamento). */
  inviteCode: string;
  createdBy: UUID;
  createdAt: string;
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
  peladaId: UUID;
  name: string;
  address: string | null;
  notes: string | null;
  createdBy: UUID;
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
  status: GameStatus;
  /** Custo total da quadra nesse jogo. null = sem rateio (cada um resolve por fora). */
  fieldCost: number | null;
  /** Limite de gols de cada rodada: quem chegar primeiro vence, mesmo antes do tempo acabar. null = só por tempo. */
  matchGoalLimit: number | null;
  createdBy: UUID;
  createdAt: string;
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
