import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  CURRENT_PLAYER_ID,
  MOCK_ATTENDANCES,
  MOCK_CHAMPIONSHIP_GOALS,
  MOCK_CHAMPIONSHIP_BUDGETS,
  MOCK_CHAMPIONSHIP_MATCHES,
  MOCK_CHAMPIONSHIP_TEAM_PLAYERS,
  MOCK_CHAMPIONSHIP_TEAMS,
  MOCK_CHAMPIONSHIPS,
  MOCK_CASH_SHIFTS,
  MOCK_CLASS_ATTENDANCES,
  MOCK_CLASS_ENROLLMENTS,
  MOCK_CLASS_PROGRAMS,
  MOCK_CLASS_SESSIONS,
  MOCK_COACHES,
  MOCK_ESTABLISHMENTS,
  MOCK_ESTABLISHMENT_STAFF,
  MOCK_FIELD_BOOKINGS,
  MOCK_FIELD_AVAILABILITIES,
  MOCK_FIELD_PROMOTIONS,
  MOCK_BOOKING_DEPOSITS,
  MOCK_GAME_BOOKING_REQUESTS,
  MOCK_FIELDS,
  MOCK_FRIENDSHIPS,
  MOCK_FUNDRAISING_CAMPAIGNS,
  MOCK_FUNDRAISING_CONTRIBUTIONS,
  MOCK_FUNDRAISING_EXPENSES,
  MOCK_GAMES,
  MOCK_GOALS,
  MOCK_MATCH_TURNS,
  MOCK_MEMBERSHIPS,
  MOCK_PAYMENTS,
  MOCK_PELADA,
  MOCK_PELADAS,
  MOCK_PLAYERS,
  MOCK_PLAYER_DUELS,
  MOCK_PRODUCT_CATEGORIES,
  MOCK_PRODUCTS,
  MOCK_PAYMENT_GATEWAY_CONNECTIONS,
  MOCK_ORDER_ITEM_SHARES,
  MOCK_PUNISHMENTS,
  MOCK_RATINGS,
  MOCK_SCHEDULES,
  MOCK_SCHEDULE_FIELD_PREFERENCES,
  MOCK_SALE_PAYMENTS,
  MOCK_SALE_PAYMENT_ALLOCATIONS,
  MOCK_SALE_PAYMENT_INTENTS,
  MOCK_SERVICE_ORDER_ITEMS,
  MOCK_SERVICE_ORDERS,
  MOCK_SERVICE_TABS,
  MOCK_TAB_PARTICIPANTS,
  MOCK_TEAMS,
  MOCK_TEAM_PLAYERS,
  MOCK_TEAM_AVAILABILITY_POLLS,
  MOCK_TEAM_AVAILABILITY_POLL_OPTIONS,
  MOCK_TEAM_AVAILABILITY_POLL_VOTES,
  MOCK_WHATSAPP_DELIVERIES,
} from '@/lib/mockData';
import { advanceWinner, generateKnockoutFixtures, generateRoundRobinFixtures, normalizeChampionshipBudget } from '@/lib/championship';
import { createBookingCode, findAlternativeSlots, nextBookingCandidate, normalizeWhatsAppPhone } from '@/lib/bookingAutomation';
import { findBookingConflicts } from '@/lib/fieldBooking';
import { addPremiumPeriod } from '@/lib/premium';
import { demoPixCode, outstandingByParticipant, splitAmountCents } from '@/lib/paymentGateways';
import { buildPunishment } from '@/lib/punishment';
import { pickNextChallenger, teamColor, teamName, type MatchResult, type WaitingEntry } from '@/lib/teamDraft';
import type {
  ActivityComment,
  ActivityLike,
  Attendance,
  AttendanceStatus,
  AvailabilitySlot,
  BookingDeposit,
  CashShift,
  ClassAttendance,
  ClassAttendanceStatus,
  ClassEnrollment,
  ClassFormat,
  ClassProgram,
  ClassSession,
  Coach,
  Championship,
  ChampionshipBudget,
  ChampionshipBudgetInput,
  ChampionshipFormat,
  ChampionshipGoal,
  ChampionshipMatch,
  ChampionshipTeam,
  ChampionshipTeamPlayer,
  DrawMethod,
  Establishment,
  EstablishmentPayoutMethod,
  EstablishmentStaff,
  Field,
  FieldAvailability,
  FieldBooking,
  FieldBookingRecurrence,
  FieldPromotion,
  Friendship,
  FundraisingCampaign,
  FundraisingCategory,
  FundraisingContribution,
  FundraisingExpense,
  FreeAgentInvite,
  FriendlyMatch,
  FriendlyMatchGoal,
  Game,
  GameBookingRequest,
  GameStatus,
  GeoPoint,
  Goal,
  MatchTurn,
  MakeupCredit,
  Payment,
  PaymentGatewayConnection,
  PaymentGatewayProvider,
  PaymentMethod,
  PaymentStatus,
  Pelada,
  PeladaMemberInvitePermissions,
  PeladaMembership,
  Player,
  PlayerDuel,
  PlayerFatigue,
  Product,
  ProductCategory,
  Punishment,
  PunishmentType,
  Rating,
  RecurrenceType,
  Schedule,
  ScheduleFieldPreference,
  SalePayment,
  SalePaymentAllocation,
  SalePaymentIntent,
  ServiceOrder,
  ServiceOrderItem,
  OrderItemShare,
  ServiceTab,
  ServiceTabStatus,
  TabParticipant,
  Team,
  TeamAvailabilityPoll,
  TeamAvailabilityPollOption,
  TeamAvailabilityPollVote,
  TeamChallenge,
  TeamPlayer,
  WaitingPlayer,
  WhatsAppDelivery,
} from '@/types';

const uid = () => Math.random().toString(36).slice(2, 10);

function makeGuestPlayer(name: string): Player {
  return {
    id: uid(),
    authUserId: null,
    name: name.trim() || 'Convidado',
    nickname: null,
    avatarUrl: null,
    phone: null,
    preferredPosition: 'line',
    favoriteSports: ['futebol'],
    cardBackgroundUrl: null,
    premiumSince: null,
    premiumUntil: null,
    premiumAutoRenew: false,
    isGuest: true,
    freeAgentOptIn: false,
    freeAgentRadiusKm: null,
    freeAgentAvailability: [],
    location: null,
    locationUpdatedAt: null,
    createdAt: new Date().toISOString(),
  };
}
const nowIso = () => new Date().toISOString();

interface AppState {
  currentPlayerId: string;
  /** Pelada (grupo) que está sendo exibida agora — o jogador pode fazer parte de mais de uma. */
  currentPeladaId: string;
  players: Player[];
  peladas: Pelada[];
  memberships: PeladaMembership[];
  fields: Field[];
  schedules: Schedule[];
  games: Game[];
  attendances: Attendance[];
  teams: Team[];
  teamPlayers: TeamPlayer[];
  ratings: Rating[];
  punishments: Punishment[];
  payments: Payment[];
  matchTurns: MatchTurn[];
  goals: Goal[];
  matchQueue: Record<string, string[]>; // gameId -> ordered team ids
  waitingPlayers: WaitingPlayer[];
  playerFatigue: PlayerFatigue[];
  friendships: Friendship[];
  activityLikes: ActivityLike[];
  activityComments: ActivityComment[];
  /** Timestamp da última vez que o jogador abriu a central de notificações — define o que é "não lido". */
  notificationsSeenAt: string | null;
  freeAgentInvites: FreeAgentInvite[];
  establishments: Establishment[];
  championships: Championship[];
  championshipBudgets: ChampionshipBudget[];
  championshipTeams: ChampionshipTeam[];
  championshipTeamPlayers: ChampionshipTeamPlayer[];
  championshipMatches: ChampionshipMatch[];
  championshipGoals: ChampionshipGoal[];
  fieldBookings: FieldBooking[];
  fieldAvailabilities: FieldAvailability[];
  fieldPromotions: FieldPromotion[];
  bookingDeposits: BookingDeposit[];
  scheduleFieldPreferences: ScheduleFieldPreference[];
  gameBookingRequests: GameBookingRequest[];
  teamAvailabilityPolls: TeamAvailabilityPoll[];
  teamAvailabilityPollOptions: TeamAvailabilityPollOption[];
  teamAvailabilityPollVotes: TeamAvailabilityPollVote[];
  whatsAppDeliveries: WhatsAppDelivery[];
  fundraisingCampaigns: FundraisingCampaign[];
  fundraisingContributions: FundraisingContribution[];
  fundraisingExpenses: FundraisingExpense[];
  teamChallenges: TeamChallenge[];
  friendlyMatches: FriendlyMatch[];
  friendlyMatchGoals: FriendlyMatchGoal[];
  playerDuels: PlayerDuel[];
  establishmentStaff: EstablishmentStaff[];
  productCategories: ProductCategory[];
  products: Product[];
  serviceTabs: ServiceTab[];
  tabParticipants: TabParticipant[];
  serviceOrders: ServiceOrder[];
  serviceOrderItems: ServiceOrderItem[];
  orderItemShares: OrderItemShare[];
  salePayments: SalePayment[];
  salePaymentAllocations: SalePaymentAllocation[];
  salePaymentIntents: SalePaymentIntent[];
  paymentGatewayConnections: PaymentGatewayConnection[];
  cashShifts: CashShift[];
  coaches: Coach[];
  classPrograms: ClassProgram[];
  classSessions: ClassSession[];
  classEnrollments: ClassEnrollment[];
  classAttendances: ClassAttendance[];
  makeupCredits: MakeupCredit[];

  // chamada / presença
  setAttendance: (gameId: string, playerId: string, status: AttendanceStatus) => void;
  /** Admin adiciona um convidado sem conta direto na chamada de um jogo específico; entra confirmado (ou na espera, se lotado). */
  addGuest: (gameId: string, name: string) => Player;

  // bolsa de jogadores livres (opt-in, busca por proximidade)
  setFreeAgentOptIn: (playerId: string, optIn: boolean) => void;
  setFreeAgentSettings: (playerId: string, input: { radiusKm: number; availability: AvailabilitySlot[] }) => void;
  updateMyLocation: (playerId: string, location: GeoPoint) => void;
  /** Admin convida um jogador livre (de fora da pelada) pra um jogo específico. */
  sendFreeAgentInvite: (gameId: string, peladaId: string, playerId: string, invitedByPlayerId: string) => FreeAgentInvite;
  respondFreeAgentInvite: (inviteId: string, accept: boolean) => void;

  // sorteio de times
  setGameTeams: (gameId: string, teams: Team[], teamPlayers: TeamPlayer[]) => void;
  setGameStatus: (gameId: string, status: Game['status']) => void;
  setMatchQueue: (gameId: string, queue: string[]) => void;
  /** Admin renomeia e/ou muda a cor de um time já sorteado. */
  updateTeam: (teamId: string, input: { name?: string; color?: string }) => void;
  /** Move um time "de próximo" pra cima/baixo na fila (não mexe em quem já está jogando agora). */
  moveTeamInQueue: (gameId: string, teamId: string, direction: 'up' | 'down') => void;
  /**
   * Sorteio "rodízio individual": monta só o 1º confronto (teamA x teamB) e joga
   * todo mundo que sobrou numa bolsa de espera (`waitingPlayers`) — sem times fixos
   * pros próximos jogos. Cada novo desafiante é puxado da bolsa depois, por
   * prioridade (ver `resolveIndividualRound`).
   */
  setGameTeamsIndividual: (
    gameId: string,
    teamA: Team,
    teamB: Team,
    teamAPlayers: TeamPlayer[],
    teamBPlayers: TeamPlayer[],
    waiting: WaitingPlayer[],
  ) => void;
  /**
   * Encerra a rodada no modo "rodízio individual": quem perdeu (ou os dois, em
   * empate) volta pra bolsa de espera zerando o contador de rodadas fora; quem
   * ficou esperando soma +1 rodada; e o(s) próximo(s) desafiante(s) são puxados
   * da bolsa por prioridade (mais rodadas de fora primeiro, desempate pelo
   * método de sorteio original). Cria o(s) time(s) novo(s) e atualiza a fila.
   */
  resolveIndividualRound: (gameId: string, result: MatchResult, teamSize: number) => void;

  // placar ao vivo / gols
  startMatchTurn: (gameId: string, teamAId: string, teamBId: string) => MatchTurn;
  endMatchTurn: (matchTurnId: string, winnerTeamId: string | null) => void;
  registerGoal: (gameId: string, matchTurnId: string, teamId: string, scorerPlayerId: string | null) => void;
  undoLastGoal: (matchTurnId: string) => void;
  setGameGoalLimit: (gameId: string, matchGoalLimit: number | null) => void;

  // troca de jogador em campo (cansaço/lesão) — ver PlayerFatigue
  substitutePlayer: (
    gameId: string,
    teamId: string,
    outPlayerId: string,
    inPlayerId: string,
    reason: 'normal' | 'resting' | 'done_for_today',
  ) => void;
  /** Reverte manualmente o status de cansaço (o jogador volta a poder ser escalado). */
  clearPlayerFatigue: (gameId: string, playerId: string) => void;

  // avaliações
  submitRating: (rating: Omit<Rating, 'id' | 'createdAt' | 'overall'>) => void;

  // punições
  registerPunishment: (peladaId: string, playerId: string, gameId: string, type: PunishmentType) => void;

  // admin: campos, agenda, vagas
  addField: (peladaId: string, name: string, address: string, notes: string) => Field;
  /** Vincula um campo a um estabelecimento cadastrado (via código de acesso). false = código não encontrado. */
  linkFieldToEstablishment: (fieldId: string, accessCode: string) => boolean;
  unlinkFieldEstablishment: (fieldId: string) => void;
  /** Campo próprio do estabelecimento (sem pelada) — o dono cadastra direto, escolhendo o esporte. */
  addEstablishmentField: (establishmentId: string, ownerPlayerId: string, input: { name: string; address: string; sportId: string }) => Field;
  removeEstablishmentField: (fieldId: string) => void;
  addSchedule: (input: {
    peladaId: string;
    fieldId: string;
    recurrence: RecurrenceType;
    dayOfWeek: number | null;
    time: string;
    startDate: string;
    maxPlayers: number;
    matchMinutes: number;
    bookingDurationMinutes: number;
    drawMethod: DrawMethod;
    defaultFieldCost: number | null;
    matchGoalLimit: number | null;
    autoBookingEnabled?: boolean;
    bookingMinimumPlayers?: number;
    bookingResponseMinutes?: number;
  }) => Schedule;
  addGameFromSchedule: (scheduleId: string, scheduledAt: string) => Game;
  updateGameMaxPlayers: (gameId: string, maxPlayers: number) => void;
  setDrawMethod: (gameId: string, method: DrawMethod) => void;
  promoteFromWaitlist: (gameId: string) => void;

  // agendamento automático + WhatsApp + enquete de disponibilidade
  updateScheduleBookingAutomation: (
    scheduleId: string,
    input: { enabled: boolean; minimumPlayers: number; responseMinutes: number; pollQuorumPercent?: number; pollReminderMinutes?: number },
  ) => void;
  addScheduleFieldPreference: (scheduleId: string, fieldId: string, source?: ScheduleFieldPreference['source']) => void;
  moveScheduleFieldPreference: (preferenceId: string, direction: 'up' | 'down') => void;
  removeScheduleFieldPreference: (preferenceId: string) => void;
  addFieldAvailability: (fieldId: string, input: { dayOfWeek: number; startTime: string; endTime: string; slotMinutes: number; price: number | null }) => FieldAvailability;
  removeFieldAvailability: (availabilityId: string) => void;
  triggerGameBookingAutomation: (gameId: string) => GameBookingRequest | null;
  respondGameBookingRequest: (requestId: string, accepted: boolean) => void;
  tryNextPreferredField: (gameId: string) => GameBookingRequest | null;
  createGameAvailabilityPoll: (gameId: string) => TeamAvailabilityPoll | null;
  voteGameAvailabilityPoll: (pollId: string, optionId: string, playerId: string) => void;
  finalizeGameAvailabilityPoll: (pollId: string, optionId: string) => GameBookingRequest | null;
  sendGameAvailabilityPollReminder: (pollId: string) => number;
  createBookingDeposit: (requestId: string, payerPlayerId: string, method: PaymentMethod) => BookingDeposit | null;
  confirmBookingDeposit: (depositId: string) => void;
  cancelConfirmedBooking: (requestId: string) => { refunded: boolean; retained: boolean };
  updateEstablishmentWhatsApp: (establishmentId: string, phone: string | null, optIn: boolean) => void;
  updateEstablishmentBookingPolicy: (establishmentId: string, input: { depositPercent: number; refundHours: number; refundPercent: number; messagingProvider: NonNullable<Establishment['messagingProvider']> }) => void;
  createFieldPromotion: (fieldId: string, input: { label: string; pricePerConfirmedBooking: number; campaignBudget: number | null }) => FieldPromotion | null;
  setFieldPromotionActive: (promotionId: string, active: boolean) => void;

  // vaquinhas do time (separadas do rateio da quadra)
  createFundraisingCampaign: (peladaId: string, input: { title: string; description: string | null; category: FundraisingCategory; targetAmount: number; suggestedAmount: number | null; deadline: string | null; payoutPlayerId: string; allowAnonymous: boolean }) => FundraisingCampaign;
  createFundraisingContribution: (campaignId: string, input: { paidByPlayerId: string; creditedPlayerId: string; amount: number; method: PaymentMethod; anonymous: boolean; message: string | null }) => FundraisingContribution | null;
  confirmFundraisingContribution: (contributionId: string) => void;
  addFundraisingExpense: (campaignId: string, title: string, amount: number, recordedBy: string, receiptUrl?: string | null) => FundraisingExpense | null;
  closeFundraisingCampaign: (campaignId: string) => void;

  addAdmin: (peladaId: string, playerId: string) => void;
  removeAdmin: (peladaId: string, playerId: string) => void;

  isAdmin: (playerId: string, peladaId: string) => boolean;

  // amigos (rede social)
  /** Envia um pedido de amizade. Não faz nada se já existir pedido/amizade entre os dois (em qualquer direção). */
  sendFriendRequest: (requesterId: string, addresseeId: string) => void;
  respondFriendRequest: (friendshipId: string, accept: boolean) => void;
  /** Cancela um pedido enviado (ainda pendente) ou desfaz uma amizade já aceita. */
  removeFriendship: (friendshipId: string) => void;
  /** Curte/descurte um item do feed de atividades. */
  toggleActivityLike: (activityId: string, playerId: string) => void;
  addActivityComment: (activityId: string, playerId: string, text: string) => void;
  removeActivityComment: (commentId: string) => void;
  /** Marca a central de notificações como vista agora (zera o contador de não lidas). */
  markNotificationsSeen: () => void;

  updateCurrentPlayerProfile: (input: { name: string; nickname: string | null; preferredPosition: Player['preferredPosition']; phone: string | null; favoriteSports: string[] }) => void;
  setPlayerWhatsAppOptIn: (playerId: string, optIn: boolean) => void;
  setPlayerPhoto: (playerId: string, photoUrl: string) => void;
  setPlayerCardBackground: (playerId: string, cardBackgroundUrl: string | null) => void;
  updatePeladaInfo: (peladaId: string, input: { name: string; description: string | null; sportId: string }) => void;
  updatePeladaInvitePermissions: (peladaId: string, input: PeladaMemberInvitePermissions) => void;
  setCurrentPelada: (peladaId: string) => void;
  /** Entra numa pelada usando o código de convite. Retorna a pelada encontrada, ou null se o código não existir. */
  joinPeladaByCode: (code: string, playerId: string) => Pelada | null;
  /** Cria uma pelada nova e o jogador vira admin dela automaticamente — um jogador pode ser dono/admin de quantas peladas quiser. */
  createPelada: (
    ownerPlayerId: string,
    input: { name: string; description: string | null; sportId: string; footballVariant: 'society' | 'futsal' | 'campo' },
  ) => Pelada;

  // premium: assinatura mensal simulada (em produção, gerenciada pela App Store/Google Play)
  renewPremium: (playerId: string) => void;
  cancelPremiumAutoRenew: (playerId: string) => void;

  // rateio ("vaquinha") do custo da quadra
  setGameFieldCost: (gameId: string, fieldCost: number | null) => void;
  setPaymentStatus: (gameId: string, playerId: string, status: PaymentStatus, method?: PaymentMethod) => void;
  /** Um jogador paga a própria parte e/ou a de outros confirmados de uma vez (ex.: pai e filho). */
  payForPlayers: (gameId: string, payerPlayerId: string, playerIds: string[], method: PaymentMethod) => void;

  // duração/limite de gols da partida
  setGameMatchMinutes: (gameId: string, matchMinutes: number) => void;

  // dono de campo/quadra — estabelecimento e conta pra receber o rateio
  createEstablishment: (ownerPlayerId: string, input: { name: string; payoutMethod: EstablishmentPayoutMethod; pixKey: string | null }) => Establishment;
  updateEstablishment: (establishmentId: string, input: { name: string; payoutMethod: EstablishmentPayoutMethod; pixKey: string | null }) => void;

  addProductCategory: (establishmentId: string, name: string) => ProductCategory;
  addProduct: (establishmentId: string, input: { categoryId: string; name: string; description: string | null; price: number; station: Product['station']; stockQuantity: number | null }) => Product;
  updateProduct: (productId: string, input: Partial<Pick<Product, 'name' | 'description' | 'price' | 'station' | 'active' | 'stockQuantity'>>) => void;
  openServiceTab: (establishmentId: string, input: { customerPlayerId: string | null; customerName: string; tableLabel: string | null; gameId: string | null }) => ServiceTab;
  addTabParticipant: (tabId: string, input: { playerId: string | null; name: string }) => TabParticipant;
  createServiceOrder: (tabId: string, items: Array<{ productId: string; participantId: string | null; quantity: number; notes: string | null }>, notes?: string) => ServiceOrder | null;
  splitOrderItem: (itemId: string, participantIds: string[]) => void;
  setEstablishmentGateway: (establishmentId: string, provider: PaymentGatewayProvider) => PaymentGatewayConnection;
  createSalePaymentIntent: (tabId: string, payerParticipantId: string, coveredParticipantIds: string[], method: PaymentMethod) => SalePaymentIntent | null;
  confirmSalePaymentIntent: (intentId: string) => void;
  setOrderItemStatus: (itemId: string, status: ServiceOrderItem['status'], cancellationReason?: string) => void;
  setServiceTabStatus: (tabId: string, status: ServiceTabStatus) => void;
  payServiceTab: (tabId: string, input: { payerPlayerId: string | null; payerName: string; amount: number; method: PaymentMethod; coveredParticipantIds?: string[] }) => void;
  reverseSalePayment: (paymentId: string) => void;
  openCashShift: (establishmentId: string, openingAmount: number) => CashShift;
  closeCashShift: (shiftId: string, closingAmount: number) => void;
  addCoach: (establishmentId: string, playerId: string, sportIds: string[], bio: string | null) => Coach;
  createClassProgram: (establishmentId: string, input: { name: string; sportId: string; format: ClassFormat; coachId: string; fieldId: string; level: string; capacity: number; durationMinutes: number; price: number; billingType: ClassProgram['billingType'] }) => ClassProgram;
  createClassSession: (programId: string, startsAt: string) => ClassSession | null;
  cancelClassSession: (sessionId: string, reason: string) => void;
  completeClassSession: (sessionId: string) => void;
  enrollInClass: (sessionId: string, playerId: string, isTrial?: boolean) => ClassEnrollment;
  setClassEnrollmentPayment: (enrollmentId: string, method: PaymentMethod) => void;
  cancelClassEnrollment: (enrollmentId: string) => void;
  recordClassAttendance: (sessionId: string, playerId: string, status: ClassAttendanceStatus, coachNotes?: string) => void;

  // agendamento de campo do estabelecimento — time cadastrado (pelada) ou avulso, avulso (single) ou fixo (weekly)
  addFieldBooking: (
    establishmentId: string,
    createdBy: string,
    input: {
      fieldId: string;
      peladaId: string | null;
      teamName: string;
      recurrence: FieldBookingRecurrence;
      dayOfWeek: number | null;
      date: string | null;
      time: string;
      durationMinutes: number;
      notes: string | null;
    },
  ) => { booking: FieldBooking | null; conflicts: FieldBooking[] };
  removeFieldBooking: (bookingId: string) => void;

  // campeonatos — organizados pelo dono do estabelecimento OU direto por uma pelada (sem dono de campo)
  createChampionship: (
    organizer: { establishmentId: string; organizerPeladaId: null } | { establishmentId: null; organizerPeladaId: string },
    createdBy: string,
    input: { name: string; sportId: string; format: ChampionshipFormat; fieldId: string | null; maxTeams: number | null; entryFee: number | null; matchMinutes: number },
  ) => Championship;
  saveChampionshipBudget: (championshipId: string, input: ChampionshipBudgetInput, entryFee: number) => ChampionshipBudget | null;
  /** Inscreve um time (de uma pelada existente, ou avulso) via código do campeonato. playerNames = jogadores sem conta (viram convidados). */
  registerChampionshipTeam: (
    code: string,
    input: { name: string; color: string; logoUrl: string | null; peladaId: string | null; registeredByPlayerId: string; playerIds: string[]; guestNames: string[] },
  ) => ChampionshipTeam | null;
  removeChampionshipTeam: (teamId: string) => void;
  setChampionshipTeamLogo: (teamId: string, logoUrl: string | null) => void;
  generateChampionshipFixtures: (championshipId: string) => void;
  startChampionshipMatch: (matchId: string) => void;
  registerChampionshipGoal: (matchId: string, teamId: string, scorerPlayerId: string | null) => void;
  undoLastChampionshipGoal: (matchId: string) => void;
  /** Encerra a partida. Em mata-mata empatado, penaltyScoreA/B definem o vencedor. */
  endChampionshipMatch: (matchId: string, penaltyScoreA?: number, penaltyScoreB?: number) => void;

  // desafio time x time — partida avulsa entre duas peladas, sem campeonato/estabelecimento
  sendTeamChallenge: (
    challengerPeladaId: string,
    challengedPeladaId: string,
    createdBy: string,
    input: { proposedDate: string; proposedTime: string; fieldId: string | null; message: string | null },
  ) => TeamChallenge;
  /** Aceitar gera a FriendlyMatch e preenche challenge.matchId. */
  respondTeamChallenge: (challengeId: string, accept: boolean) => void;
  cancelTeamChallenge: (challengeId: string) => void;
  startFriendlyMatch: (matchId: string) => void;
  registerFriendlyGoal: (matchId: string, peladaId: string, scorerPlayerId: string | null) => void;
  undoLastFriendlyGoal: (matchId: string) => void;
  endFriendlyMatch: (matchId: string, winnerPeladaId: string | null) => void;

  // desafio jogador x jogador — confronto direto, independente de pelada
  sendPlayerDuel: (challengerId: string, challengedId: string, message: string | null) => PlayerDuel;
  respondPlayerDuel: (duelId: string, accept: boolean) => void;
  /** winnerId null = empate. Qualquer um dos dois envolvidos pode registrar o resultado. */
  recordPlayerDuelResult: (duelId: string, winnerId: string | null, resultNote: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentPlayerId: CURRENT_PLAYER_ID,
      currentPeladaId: MOCK_PELADA.id,
      players: MOCK_PLAYERS,
      peladas: MOCK_PELADAS,
      memberships: MOCK_MEMBERSHIPS,
      fields: MOCK_FIELDS,
      schedules: MOCK_SCHEDULES,
      games: MOCK_GAMES,
      attendances: MOCK_ATTENDANCES,
      teams: MOCK_TEAMS,
      teamPlayers: MOCK_TEAM_PLAYERS,
      ratings: MOCK_RATINGS,
      punishments: MOCK_PUNISHMENTS,
      payments: MOCK_PAYMENTS,
      matchTurns: MOCK_MATCH_TURNS,
      goals: MOCK_GOALS,
      matchQueue: {},
      waitingPlayers: [],
      playerFatigue: [],
      friendships: MOCK_FRIENDSHIPS,
      activityLikes: [],
      activityComments: [],
      notificationsSeenAt: null,
      freeAgentInvites: [],
      establishments: MOCK_ESTABLISHMENTS,
      championships: MOCK_CHAMPIONSHIPS,
      championshipBudgets: MOCK_CHAMPIONSHIP_BUDGETS,
      championshipTeams: MOCK_CHAMPIONSHIP_TEAMS,
      championshipTeamPlayers: MOCK_CHAMPIONSHIP_TEAM_PLAYERS,
      championshipMatches: MOCK_CHAMPIONSHIP_MATCHES,
      championshipGoals: MOCK_CHAMPIONSHIP_GOALS,
      fieldBookings: MOCK_FIELD_BOOKINGS,
      fieldAvailabilities: MOCK_FIELD_AVAILABILITIES,
      fieldPromotions: MOCK_FIELD_PROMOTIONS,
      bookingDeposits: MOCK_BOOKING_DEPOSITS,
      scheduleFieldPreferences: MOCK_SCHEDULE_FIELD_PREFERENCES,
      gameBookingRequests: MOCK_GAME_BOOKING_REQUESTS,
      teamAvailabilityPolls: MOCK_TEAM_AVAILABILITY_POLLS,
      teamAvailabilityPollOptions: MOCK_TEAM_AVAILABILITY_POLL_OPTIONS,
      teamAvailabilityPollVotes: MOCK_TEAM_AVAILABILITY_POLL_VOTES,
      whatsAppDeliveries: MOCK_WHATSAPP_DELIVERIES,
      fundraisingCampaigns: MOCK_FUNDRAISING_CAMPAIGNS,
      fundraisingContributions: MOCK_FUNDRAISING_CONTRIBUTIONS,
      fundraisingExpenses: MOCK_FUNDRAISING_EXPENSES,
      teamChallenges: [],
      friendlyMatches: [],
      friendlyMatchGoals: [],
      playerDuels: MOCK_PLAYER_DUELS,
      establishmentStaff: MOCK_ESTABLISHMENT_STAFF,
      productCategories: MOCK_PRODUCT_CATEGORIES,
      products: MOCK_PRODUCTS,
      serviceTabs: MOCK_SERVICE_TABS,
      tabParticipants: MOCK_TAB_PARTICIPANTS,
      serviceOrders: MOCK_SERVICE_ORDERS,
      serviceOrderItems: MOCK_SERVICE_ORDER_ITEMS,
      orderItemShares: MOCK_ORDER_ITEM_SHARES,
      salePayments: MOCK_SALE_PAYMENTS,
      salePaymentAllocations: MOCK_SALE_PAYMENT_ALLOCATIONS,
      salePaymentIntents: MOCK_SALE_PAYMENT_INTENTS,
      paymentGatewayConnections: MOCK_PAYMENT_GATEWAY_CONNECTIONS,
      cashShifts: MOCK_CASH_SHIFTS,
      coaches: MOCK_COACHES,
      classPrograms: MOCK_CLASS_PROGRAMS,
      classSessions: MOCK_CLASS_SESSIONS,
      classEnrollments: MOCK_CLASS_ENROLLMENTS,
      classAttendances: MOCK_CLASS_ATTENDANCES,
      makeupCredits: [],

      setAttendance: (gameId, playerId, status) => {
        const game = get().games.find((g) => g.id === gameId);
        if (!game) return;
        set((state) => {
          const existing = state.attendances.find((a) => a.gameId === gameId && a.playerId === playerId);
          const confirmedCount = state.attendances.filter((a) => a.gameId === gameId && a.status === 'confirmed').length;
          let finalStatus = status;
          if (status === 'confirmed' && confirmedCount >= game.maxPlayers && existing?.status !== 'confirmed') {
            finalStatus = 'waitlist';
          }
          const nextOrder =
            finalStatus === 'confirmed'
              ? Math.max(0, ...state.attendances.filter((a) => a.gameId === gameId && a.confirmedOrder).map((a) => a.confirmedOrder ?? 0)) + 1
              : null;

          const attendances = existing
            ? state.attendances.map((a) =>
                a.gameId === gameId && a.playerId === playerId
                  ? { ...a, status: finalStatus, respondedAt: nowIso(), confirmedOrder: finalStatus === 'confirmed' ? a.confirmedOrder ?? nextOrder : null }
                  : a,
              )
            : [
                ...state.attendances,
                {
                  id: uid(),
                  gameId,
                  playerId,
                  status: finalStatus,
                  confirmedOrder: finalStatus === 'confirmed' ? nextOrder : null,
                  respondedAt: nowIso(),
                  noShow: false,
                  checkedIn: false,
                } satisfies Attendance,
              ];

          const confirmedNow = attendances.filter((a) => a.gameId === gameId && a.status === 'confirmed').length;
          const games = state.games.map((g): Game => {
            if (g.id !== gameId) return g;
            const nextStatus: GameStatus = confirmedNow >= g.maxPlayers ? 'full' : g.status === 'full' ? 'open' : g.status;
            return { ...g, status: nextStatus };
          });

          return { attendances, games };
        });
        get().triggerGameBookingAutomation(gameId);
      },

      addGuest: (gameId, name) => {
        const guest = makeGuestPlayer(name);
        set((state) => ({ players: [...state.players, guest] }));
        get().setAttendance(gameId, guest.id, 'confirmed');
        return guest;
      },

      setFreeAgentOptIn: (playerId, optIn) => {
        set((state) => ({
          players: state.players.map((p) => (p.id === playerId ? { ...p, freeAgentOptIn: optIn } : p)),
        }));
      },

      setFreeAgentSettings: (playerId, input) => {
        set((state) => ({
          players: state.players.map((p) =>
            p.id === playerId ? { ...p, freeAgentRadiusKm: input.radiusKm, freeAgentAvailability: input.availability } : p,
          ),
        }));
      },

      updateMyLocation: (playerId, location) => {
        set((state) => ({
          players: state.players.map((p) => (p.id === playerId ? { ...p, location, locationUpdatedAt: nowIso() } : p)),
        }));
      },

      sendFreeAgentInvite: (gameId, peladaId, playerId, invitedByPlayerId) => {
        const invite: FreeAgentInvite = {
          id: uid(),
          gameId,
          peladaId,
          playerId,
          invitedByPlayerId,
          status: 'pending',
          createdAt: nowIso(),
          respondedAt: null,
        };
        set((state) => ({ freeAgentInvites: [...state.freeAgentInvites, invite] }));
        return invite;
      },

      respondFreeAgentInvite: (inviteId, accept) => {
        const invite = get().freeAgentInvites.find((i) => i.id === inviteId);
        if (!invite) return;
        set((state) => ({
          freeAgentInvites: state.freeAgentInvites.map((i) =>
            i.id === inviteId ? { ...i, status: accept ? 'accepted' : 'declined', respondedAt: nowIso() } : i,
          ),
        }));
        if (accept) {
          get().setAttendance(invite.gameId, invite.playerId, 'confirmed');
        }
      },

      setGameTeams: (gameId, teams, teamPlayers) => {
        set((state) => ({
          teams: [...state.teams.filter((t) => t.gameId !== gameId), ...teams],
          teamPlayers: [
            ...state.teamPlayers.filter((tp) => !state.teams.some((t) => t.gameId === gameId && t.id === tp.teamId)),
            ...teamPlayers,
          ],
          games: state.games.map((g) => (g.id === gameId ? { ...g, status: 'teams_drawn', rotationMode: 'teams' } : g)),
          matchQueue: { ...state.matchQueue, [gameId]: teams.map((t) => t.id) },
          waitingPlayers: state.waitingPlayers.filter((w) => w.gameId !== gameId),
        }));
      },

      setGameStatus: (gameId, status) => {
        set((state) => ({ games: state.games.map((g) => (g.id === gameId ? { ...g, status } : g)) }));
      },

      setMatchQueue: (gameId, queue) => {
        set((state) => ({ matchQueue: { ...state.matchQueue, [gameId]: queue } }));
      },

      updateTeam: (teamId, input) => {
        set((state) => ({
          teams: state.teams.map((t) => (t.id === teamId ? { ...t, ...input } : t)),
        }));
      },

      moveTeamInQueue: (gameId, teamId, direction) => {
        set((state) => {
          const queue = state.matchQueue[gameId] ?? [];
          // os índices 0 e 1 já estão jogando — só reordena a partir do índice 2 (fila de espera).
          const idx = queue.indexOf(teamId);
          if (idx < 2) return {};
          const swapWith = direction === 'up' ? idx - 1 : idx + 1;
          if (swapWith < 2 || swapWith >= queue.length) return {};
          const nextQueue = [...queue];
          [nextQueue[idx], nextQueue[swapWith]] = [nextQueue[swapWith], nextQueue[idx]];
          return { matchQueue: { ...state.matchQueue, [gameId]: nextQueue } };
        });
      },

      setGameTeamsIndividual: (gameId, teamA, teamB, teamAPlayers, teamBPlayers, waiting) => {
        set((state) => ({
          teams: [...state.teams.filter((t) => t.gameId !== gameId), teamA, teamB],
          teamPlayers: [
            ...state.teamPlayers.filter((tp) => !state.teams.some((t) => t.gameId === gameId && t.id === tp.teamId)),
            ...teamAPlayers,
            ...teamBPlayers,
          ],
          games: state.games.map((g) => (g.id === gameId ? { ...g, status: 'teams_drawn', rotationMode: 'players' } : g)),
          matchQueue: { ...state.matchQueue, [gameId]: [teamA.id, teamB.id] },
          waitingPlayers: [...state.waitingPlayers.filter((w) => w.gameId !== gameId), ...waiting],
        }));
      },

      resolveIndividualRound: (gameId, result, teamSize) => {
        set((state) => {
          const queue = state.matchQueue[gameId] ?? [];
          const [currentAId, currentBId] = queue;
          if (!currentAId || !currentBId) return {};

          const survivorId = result === 'draw' ? null : result === 'teamA' ? currentAId : currentBId;
          const disbandedIds = result === 'draw' ? [currentAId, currentBId] : [result === 'teamA' ? currentBId : currentAId];

          const disbandedPlayers = state.teamPlayers.filter((tp) => disbandedIds.includes(tp.teamId));
          const returning: WaitingEntry[] = disbandedPlayers.map((tp) => {
            const previous = state.waitingPlayers.find((w) => w.gameId === gameId && w.playerId === tp.playerId);
            return {
              playerId: tp.playerId,
              roundsWaited: 0,
              tiebreakRank: previous?.tiebreakRank ?? 999,
              isGoalkeeper: tp.isGoalkeeper,
            };
          });

          const stillWaiting: WaitingEntry[] = state.waitingPlayers
            .filter((w) => w.gameId === gameId)
            .map((w) => ({ ...w, roundsWaited: w.roundsWaited + 1 }));

          const fullPool = [...stillWaiting, ...returning];
          // quem tá cansado/encerrou por hoje (ver PlayerFatigue) segue de fora do sorteio
          // do próximo desafiante, mesmo esperando — mas continua contando rodadas de fora,
          // pra ter prioridade assim que o admin liberar ele de volta.
          const fatiguedIds = new Set(
            state.playerFatigue
              .filter(
                (f) =>
                  f.gameId === gameId &&
                  (f.status === 'done_for_today' || (f.status === 'resting' && (f.matchesRemaining ?? 0) > 0)),
              )
              .map((f) => f.playerId),
          );
          let pickablePool = fullPool.filter((p) => !fatiguedIds.has(p.playerId));
          const sidelinedPool = fullPool.filter((p) => fatiguedIds.has(p.playerId));

          const newTeams: Team[] = [];
          const newTeamPlayers: TeamPlayer[] = [];
          const existingTeamCount = state.teams.filter((t) => t.gameId === gameId).length;

          const slotsToFill = survivorId ? 1 : 2;
          for (let i = 0; i < slotsToFill; i++) {
            const { chosen, remaining } = pickNextChallenger(pickablePool, teamSize);
            pickablePool = remaining;
            const idx = existingTeamCount + newTeams.length;
            const team: Team = { id: uid(), gameId, name: teamName(idx), color: teamColor(idx), queueOrder: idx };
            newTeams.push(team);
            newTeamPlayers.push(
              ...chosen.map((c) => ({ teamId: team.id, playerId: c.playerId, isGoalkeeper: c.isGoalkeeper })),
            );
          }

          const pool = [...pickablePool, ...sidelinedPool];
          const nextQueue = survivorId ? [survivorId, newTeams[0].id] : [newTeams[0].id, newTeams[1].id];

          return {
            teams: [...state.teams, ...newTeams],
            teamPlayers: [
              ...state.teamPlayers.filter((tp) => !disbandedIds.includes(tp.teamId)),
              ...newTeamPlayers,
            ],
            matchQueue: { ...state.matchQueue, [gameId]: nextQueue },
            waitingPlayers: [
              ...state.waitingPlayers.filter((w) => w.gameId !== gameId),
              ...pool.map((p) => ({ gameId, playerId: p.playerId, roundsWaited: p.roundsWaited, tiebreakRank: p.tiebreakRank, isGoalkeeper: p.isGoalkeeper })),
            ],
          };
        });
      },

      startMatchTurn: (gameId, teamAId, teamBId) => {
        const turn: MatchTurn = {
          id: uid(),
          gameId,
          teamAId,
          teamBId,
          startedAt: nowIso(),
          endedAt: null,
          durationSeconds: 0,
          winnerTeamId: null,
        };
        set((state) => ({ matchTurns: [...state.matchTurns, turn] }));
        return turn;
      },

      endMatchTurn: (matchTurnId, winnerTeamId) => {
        set((state) => {
          const turn = state.matchTurns.find((t) => t.id === matchTurnId);
          const matchTurns = state.matchTurns.map((t) => {
            if (t.id !== matchTurnId) return t;
            const durationSeconds = t.startedAt ? Math.round((Date.now() - new Date(t.startedAt).getTime()) / 1000) : 0;
            return { ...t, endedAt: nowIso(), durationSeconds, winnerTeamId };
          });
          // cada rodada encerrada conta pro descanso de quem saiu "cansado — 2 partidas fora"
          const playerFatigue = turn
            ? state.playerFatigue
                .map((f) =>
                  f.gameId === turn.gameId && f.status === 'resting' && f.matchesRemaining !== null
                    ? { ...f, matchesRemaining: f.matchesRemaining - 1 }
                    : f,
                )
                .filter((f) => f.status !== 'resting' || (f.matchesRemaining ?? 0) > 0)
            : state.playerFatigue;
          return { matchTurns, playerFatigue };
        });
      },

      registerGoal: (gameId, matchTurnId, teamId, scorerPlayerId) => {
        set((state) => ({
          goals: [...state.goals, { id: uid(), gameId, matchTurnId, teamId, scorerPlayerId, scoredAt: nowIso() } satisfies Goal],
        }));
      },

      undoLastGoal: (matchTurnId) => {
        set((state) => {
          const turnGoals = state.goals.filter((g) => g.matchTurnId === matchTurnId);
          if (turnGoals.length === 0) return {};
          const last = turnGoals[turnGoals.length - 1];
          return { goals: state.goals.filter((g) => g.id !== last.id) };
        });
      },

      setGameGoalLimit: (gameId, matchGoalLimit) => {
        set((state) => ({ games: state.games.map((g) => (g.id === gameId ? { ...g, matchGoalLimit } : g)) }));
      },

      substitutePlayer: (gameId, teamId, outPlayerId, inPlayerId, reason) => {
        set((state) => {
          const game = state.games.find((g) => g.id === gameId);
          const outEntry = state.teamPlayers.find((tp) => tp.teamId === teamId && tp.playerId === outPlayerId);
          const teamPlayers = [
            ...state.teamPlayers.filter((tp) => !(tp.teamId === teamId && tp.playerId === outPlayerId)),
            { teamId, playerId: inPlayerId, isGoalkeeper: outEntry?.isGoalkeeper ?? false },
          ];

          // quem entra estava descansando/tinha encerrado por hoje? volta a jogar, então some com o status antigo.
          let playerFatigue = state.playerFatigue.filter(
            (f) => !(f.gameId === gameId && (f.playerId === outPlayerId || f.playerId === inPlayerId)),
          );
          if (reason === 'resting') {
            playerFatigue = [
              ...playerFatigue,
              { id: uid(), gameId, playerId: outPlayerId, status: 'resting', matchesRemaining: 2, createdAt: nowIso() },
            ];
          } else if (reason === 'done_for_today') {
            playerFatigue = [
              ...playerFatigue,
              { id: uid(), gameId, playerId: outPlayerId, status: 'done_for_today', matchesRemaining: null, createdAt: nowIso() },
            ];
          }

          // rodízio individual: quem entra sai da bolsa de espera; quem sai volta pra ela
          // (zerando o contador — vale a mesma prioridade de quem acabou de jogar).
          let waitingPlayers = state.waitingPlayers;
          if (game?.rotationMode === 'players') {
            const previous = state.waitingPlayers.find((w) => w.gameId === gameId && w.playerId === outPlayerId);
            waitingPlayers = [
              ...state.waitingPlayers.filter((w) => !(w.gameId === gameId && (w.playerId === outPlayerId || w.playerId === inPlayerId))),
              { gameId, playerId: outPlayerId, roundsWaited: 0, tiebreakRank: previous?.tiebreakRank ?? 999, isGoalkeeper: outEntry?.isGoalkeeper ?? false },
            ];
          }

          return { teamPlayers, playerFatigue, waitingPlayers };
        });
      },

      clearPlayerFatigue: (gameId, playerId) => {
        set((state) => ({
          playerFatigue: state.playerFatigue.filter((f) => !(f.gameId === gameId && f.playerId === playerId)),
        }));
      },

      submitRating: (rating) => {
        const overall = Math.round(((rating.attack + rating.defense + rating.pace) / 3) * 100) / 100;
        set((state) => ({
          ratings: [
            ...state.ratings.filter(
              (r) => !(r.gameId === rating.gameId && r.raterPlayerId === rating.raterPlayerId && r.ratedPlayerId === rating.ratedPlayerId),
            ),
            { ...rating, id: uid(), overall, createdAt: nowIso() },
          ],
        }));
      },

      registerPunishment: (peladaId, playerId, gameId, type) => {
        set((state) => {
          const punishment = buildPunishment({ peladaId, playerId, gameId, type, history: state.punishments });
          return {
            punishments: [...state.punishments, { ...punishment, id: uid(), createdAt: nowIso() }],
            attendances: state.attendances.map((a) =>
              a.gameId === gameId && a.playerId === playerId ? { ...a, noShow: type === 'no_show' } : a,
            ),
          };
        });
      },

      addField: (peladaId, name, address, notes) => {
        const pelada = get().peladas.find((p) => p.id === peladaId);
        const field: Field = {
          id: uid(),
          peladaId,
          name,
          address: address || null,
          notes: notes || null,
          establishmentId: null,
          sportId: pelada?.sportId ?? 'futebol',
          createdBy: get().currentPlayerId,
        };
        set((state) => ({ fields: [...state.fields, field] }));
        return field;
      },

      addEstablishmentField: (establishmentId, ownerPlayerId, input) => {
        const field: Field = {
          id: uid(),
          peladaId: null,
          name: input.name,
          address: input.address || null,
          notes: null,
          establishmentId,
          sportId: input.sportId,
          createdBy: ownerPlayerId,
        };
        set((state) => ({ fields: [...state.fields, field] }));
        return field;
      },

      removeEstablishmentField: (fieldId) => {
        set((state) => ({ fields: state.fields.filter((f) => f.id !== fieldId) }));
      },

      addFieldBooking: (establishmentId, createdBy, input) => {
        const conflicts = findBookingConflicts(get().fieldBookings, {
          fieldId: input.fieldId,
          recurrence: input.recurrence,
          dayOfWeek: input.dayOfWeek,
          date: input.date,
          time: input.time,
          durationMinutes: input.durationMinutes,
        });
        if (conflicts.length > 0) return { booking: null, conflicts };

        const booking: FieldBooking = {
          id: uid(),
          establishmentId,
          fieldId: input.fieldId,
          peladaId: input.peladaId,
          teamName: input.teamName,
          recurrence: input.recurrence,
          dayOfWeek: input.dayOfWeek,
          date: input.date,
          time: input.time,
          durationMinutes: input.durationMinutes,
          notes: input.notes,
          createdBy,
          createdAt: nowIso(),
        };
        set((state) => ({ fieldBookings: [...state.fieldBookings, booking] }));
        return { booking, conflicts: [] };
      },

      removeFieldBooking: (bookingId) => {
        set((state) => ({ fieldBookings: state.fieldBookings.filter((b) => b.id !== bookingId) }));
      },

      linkFieldToEstablishment: (fieldId, accessCode) => {
        const normalized = accessCode.trim().toUpperCase();
        const establishment = get().establishments.find((e) => e.accessCode.toUpperCase() === normalized);
        if (!establishment) return false;
        set((state) => ({
          fields: state.fields.map((f) => (f.id === fieldId ? { ...f, establishmentId: establishment.id } : f)),
        }));
        return true;
      },

      unlinkFieldEstablishment: (fieldId) => {
        set((state) => ({
          fields: state.fields.map((f) => (f.id === fieldId ? { ...f, establishmentId: null } : f)),
        }));
      },

      createEstablishment: (ownerPlayerId, input) => {
        const establishment: Establishment = {
          id: uid(),
          ownerPlayerId,
          name: input.name,
          payoutMethod: input.payoutMethod,
          pixKey: input.payoutMethod === 'pix' ? input.pixKey : null,
          whatsappPhone: null,
          whatsappOptIn: false,
          messagingProvider: 'automatic',
          reservationDepositPercent: 0,
          cancellationRefundHours: 24,
          cancellationRefundPercent: 100,
          accessCode: uid().toUpperCase(),
          createdAt: nowIso(),
        };
        set((state) => ({ establishments: [...state.establishments, establishment] }));
        return establishment;
      },

      updateEstablishment: (establishmentId, input) => {
        set((state) => ({
          establishments: state.establishments.map((e) =>
            e.id === establishmentId
              ? { ...e, name: input.name, payoutMethod: input.payoutMethod, pixKey: input.payoutMethod === 'pix' ? input.pixKey : null }
              : e,
          ),
        }));
      },

      addProductCategory: (establishmentId, name) => {
        const category: ProductCategory = {
          id: uid(),
          establishmentId,
          name: name.trim(),
          sortOrder: get().productCategories.filter((c) => c.establishmentId === establishmentId).length + 1,
          active: true,
        };
        set((state) => ({ productCategories: [...state.productCategories, category] }));
        return category;
      },

      addProduct: (establishmentId, input) => {
        const product: Product = {
          id: uid(),
          establishmentId,
          categoryId: input.categoryId,
          name: input.name.trim(),
          description: input.description,
          price: Math.max(0, input.price),
          station: input.station,
          active: true,
          stockQuantity: input.stockQuantity,
        };
        set((state) => ({ products: [...state.products, product] }));
        return product;
      },

      updateProduct: (productId, input) => {
        set((state) => ({
          products: state.products.map((product) => (product.id === productId ? { ...product, ...input } : product)),
        }));
      },

      openServiceTab: (establishmentId, input) => {
        const count = get().serviceTabs.filter((tab) => tab.establishmentId === establishmentId).length + 1;
        const tab: ServiceTab = {
          id: uid(),
          establishmentId,
          label: `Comanda ${String(count).padStart(2, '0')}`,
          customerPlayerId: input.customerPlayerId,
          customerName: input.customerName.trim() || 'Cliente',
          tableLabel: input.tableLabel,
          gameId: input.gameId,
          status: 'open',
          openedByPlayerId: get().currentPlayerId,
          openedAt: nowIso(),
          closedAt: null,
        };
        const participant: TabParticipant = {
          id: uid(),
          tabId: tab.id,
          playerId: input.customerPlayerId,
          name: tab.customerName,
        };
        set((state) => ({
          serviceTabs: [...state.serviceTabs, tab],
          tabParticipants: [...state.tabParticipants, participant],
        }));
        return tab;
      },

      addTabParticipant: (tabId, input) => {
        const existing = get().tabParticipants.find(
          (participant) => participant.tabId === tabId && input.playerId && participant.playerId === input.playerId,
        );
        if (existing) return existing;
        const participant: TabParticipant = { id: uid(), tabId, playerId: input.playerId, name: input.name.trim() || 'Cliente' };
        set((state) => ({ tabParticipants: [...state.tabParticipants, participant] }));
        return participant;
      },

      createServiceOrder: (tabId, items, notes) => {
        const tab = get().serviceTabs.find((row) => row.id === tabId);
        if (!tab || tab.status !== 'open' || items.length === 0) return null;
        const order: ServiceOrder = {
          id: uid(),
          tabId,
          status: 'submitted',
          notes: notes?.trim() || null,
          createdByPlayerId: get().currentPlayerId,
          createdAt: nowIso(),
          submittedAt: nowIso(),
          completedAt: null,
        };
        const orderItems: ServiceOrderItem[] = items.flatMap((item) => {
          const product = get().products.find((row) => row.id === item.productId && row.active);
          if (!product || item.quantity <= 0 || (product.stockQuantity !== null && product.stockQuantity < item.quantity)) return [];
          return [{
            id: uid(),
            orderId: order.id,
            productId: product.id,
            participantId: item.participantId,
            quantity: item.quantity,
            unitPrice: product.price,
            notes: item.notes,
            status: 'submitted' as const,
            cancellationReason: null,
          }];
        });
        if (orderItems.length === 0) return null;
        const purchased = new Map(orderItems.map((item) => [item.productId, item.quantity]));
        const defaultShares: OrderItemShare[] = orderItems.flatMap((item) => item.participantId ? [{
          id: uid(),
          itemId: item.id,
          participantId: item.participantId,
          amountCents: Math.round(item.quantity * item.unitPrice * 100),
        }] : []);
        set((state) => ({
          serviceOrders: [...state.serviceOrders, order],
          serviceOrderItems: [...state.serviceOrderItems, ...orderItems],
          orderItemShares: [...state.orderItemShares, ...defaultShares],
          products: state.products.map((product) => {
            const quantity = purchased.get(product.id);
            return quantity && product.stockQuantity !== null
              ? { ...product, stockQuantity: Math.max(0, product.stockQuantity - quantity) }
              : product;
          }),
        }));
        return order;
      },

      splitOrderItem: (itemId, participantIds) => {
        const uniqueIds = [...new Set(participantIds)];
        if (uniqueIds.length === 0) return;
        set((state) => {
          const item = state.serviceOrderItems.find((row) => row.id === itemId && row.status !== 'cancelled');
          if (!item) return {};
          const order = state.serviceOrders.find((row) => row.id === item.orderId);
          if (!order) return {};
          const validIds = uniqueIds.filter((participantId) => state.tabParticipants.some((row) => row.id === participantId && row.tabId === order.tabId));
          if (validIds.length === 0) return {};
          const oldShareIds = new Set(state.orderItemShares.filter((share) => share.itemId === itemId).map((share) => share.id));
          const hasPaidAllocation = state.salePaymentAllocations.some((allocation) => oldShareIds.has(allocation.itemShareId));
          if (hasPaidAllocation) return {};
          const shares = splitAmountCents(Math.round(item.quantity * item.unitPrice * 100), validIds).map((share) => ({
            id: uid(),
            itemId,
            participantId: share.participantId,
            amountCents: share.amountCents,
          }));
          return {
            orderItemShares: [...state.orderItemShares.filter((share) => share.itemId !== itemId), ...shares],
            serviceOrderItems: state.serviceOrderItems.map((row) => row.id === itemId ? { ...row, participantId: validIds.length === 1 ? validIds[0] : null } : row),
          };
        });
      },

      setEstablishmentGateway: (establishmentId, provider) => {
        const existing = get().paymentGatewayConnections.find((row) => row.establishmentId === establishmentId);
        const now = nowIso();
        const connection: PaymentGatewayConnection = {
          id: existing?.id ?? uid(),
          establishmentId,
          provider,
          status: 'connected',
          accountLabel: provider === 'manual_pix' ? 'Chave Pix do estabelecimento' : `${provider.replace('_', ' ')} · modo demonstração`,
          pixEnabled: true,
          cardEnabled: provider === 'mercado_pago' || provider === 'picpay',
          contactlessEnabled: provider === 'mercado_pago' || provider === 'picpay',
          connectedAt: existing?.connectedAt ?? now,
          updatedAt: now,
        };
        set((state) => ({
          paymentGatewayConnections: [...state.paymentGatewayConnections.filter((row) => row.establishmentId !== establishmentId), connection],
        }));
        return connection;
      },

      createSalePaymentIntent: (tabId, payerParticipantId, coveredParticipantIds, method) => {
        const state = get();
        const tab = state.serviceTabs.find((row) => row.id === tabId);
        const payer = state.tabParticipants.find((row) => row.id === payerParticipantId && row.tabId === tabId);
        if (!tab || !payer) return null;
        const connection = state.paymentGatewayConnections.find((row) => row.establishmentId === tab.establishmentId && row.status === 'connected');
        const provider = connection?.provider ?? 'manual_pix';
        if (method === 'card' && !connection?.cardEnabled) return null;
        if (method === 'contactless' && !connection?.contactlessEnabled) return null;
        const balances = outstandingByParticipant(tabId, state.serviceOrders, state.serviceOrderItems, state.orderItemShares, state.salePaymentAllocations);
        const validCovered = [...new Set(coveredParticipantIds)].filter((participantId) => (balances[participantId] ?? 0) > 0);
        const amountCents = validCovered.reduce((sum, participantId) => sum + (balances[participantId] ?? 0), 0);
        if (amountCents <= 0) return null;
        const id = uid();
        const intent: SalePaymentIntent = {
          id,
          tabId,
          payerParticipantId,
          coveredParticipantIds: validCovered,
          provider,
          method,
          amountCents,
          status: 'pending',
          externalId: `demo-${provider}-${id}`,
          pixCopyPaste: method === 'pix' ? demoPixCode(provider, id, amountCents) : null,
          checkoutUrl: method === 'card' ? `https://checkout.demo/${provider}/${id}` : null,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          createdAt: nowIso(),
          paidAt: null,
        };
        set((current) => ({
          salePaymentIntents: [
            ...current.salePaymentIntents.map((row) => row.tabId === tabId && row.payerParticipantId === payerParticipantId && row.status === 'pending' ? { ...row, status: 'cancelled' as const } : row),
            intent,
          ],
        }));
        return intent;
      },

      confirmSalePaymentIntent: (intentId) => {
        set((state) => {
          const intent = state.salePaymentIntents.find((row) => row.id === intentId && row.status === 'pending');
          if (!intent) return {};
          const payer = state.tabParticipants.find((row) => row.id === intent.payerParticipantId);
          if (!payer) return {};
          const itemIds = new Set(state.serviceOrderItems.filter((item) => {
            const order = state.serviceOrders.find((row) => row.id === item.orderId);
            return order?.tabId === intent.tabId && item.status !== 'cancelled';
          }).map((item) => item.id));
          const allocatedByShare = new Map<string, number>();
          for (const allocation of state.salePaymentAllocations) allocatedByShare.set(allocation.itemShareId, (allocatedByShare.get(allocation.itemShareId) ?? 0) + allocation.amountCents);
          const targetShares = state.orderItemShares.filter((share) => itemIds.has(share.itemId) && intent.coveredParticipantIds.includes(share.participantId));
          const paymentId = uid();
          const allocations: SalePaymentAllocation[] = targetShares.flatMap((share) => {
            const pending = Math.max(0, share.amountCents - (allocatedByShare.get(share.id) ?? 0));
            return pending > 0 ? [{ id: uid(), paymentId, itemShareId: share.id, amountCents: pending }] : [];
          });
          const amountCents = allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
          if (amountCents <= 0) return { salePaymentIntents: state.salePaymentIntents.map((row) => row.id === intentId ? { ...row, status: 'cancelled' as const } : row) };
          const payment: SalePayment = {
            id: paymentId,
            tabId: intent.tabId,
            payerPlayerId: payer.playerId,
            payerName: payer.name,
            amount: amountCents / 100,
            method: intent.method,
            paidAt: nowIso(),
            reversedAt: null,
          };
          const nextPayments = [...state.salePayments, payment];
          const orderIds = new Set(state.serviceOrders.filter((order) => order.tabId === intent.tabId).map((order) => order.id));
          const gross = state.serviceOrderItems.filter((item) => orderIds.has(item.orderId) && item.status !== 'cancelled').reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
          const paid = nextPayments.filter((row) => row.tabId === intent.tabId && !row.reversedAt).reduce((sum, row) => sum + row.amount, 0);
          return {
            salePayments: nextPayments,
            salePaymentAllocations: [...state.salePaymentAllocations, ...allocations],
            salePaymentIntents: state.salePaymentIntents.map((row) => row.id === intentId ? { ...row, status: 'paid' as const, paidAt: nowIso() } : row),
            serviceTabs: state.serviceTabs.map((tab) => tab.id === intent.tabId ? { ...tab, status: paid + 0.001 >= gross ? 'paid' as const : 'partially_paid' as const } : tab),
          };
        });
      },

      setOrderItemStatus: (itemId, status, cancellationReason) => {
        set((state) => {
          const target = state.serviceOrderItems.find((item) => item.id === itemId);
          if (!target) return {};
          if (status === 'cancelled') {
            const targetShareIds = new Set(state.orderItemShares.filter((share) => share.itemId === itemId).map((share) => share.id));
            if (state.salePaymentAllocations.some((allocation) => targetShareIds.has(allocation.itemShareId))) return {};
          }
          const items = state.serviceOrderItems.map((item) =>
            item.id === itemId
              ? { ...item, status, cancellationReason: status === 'cancelled' ? cancellationReason?.trim() || 'Cancelado pelo gerente' : null }
              : item,
          );
          const orderItems = items.filter((item) => item.orderId === target.orderId);
          const active = orderItems.filter((item) => item.status !== 'cancelled');
          let orderStatus: ServiceOrder['status'] = 'submitted';
          if (active.length === 0) orderStatus = 'cancelled';
          else if (active.every((item) => item.status === 'delivered')) orderStatus = 'delivered';
          else if (active.every((item) => item.status === 'ready' || item.status === 'delivered')) orderStatus = 'ready';
          else if (active.some((item) => item.status === 'preparing')) orderStatus = 'preparing';
          const completed = orderStatus === 'delivered' || orderStatus === 'cancelled';
          return {
            serviceOrderItems: items,
            serviceOrders: state.serviceOrders.map((order) =>
              order.id === target.orderId ? { ...order, status: orderStatus, completedAt: completed ? nowIso() : null } : order,
            ),
            products: status === 'cancelled' && target.status !== 'cancelled'
              ? state.products.map((product) => product.id === target.productId && product.stockQuantity !== null
                ? { ...product, stockQuantity: product.stockQuantity + target.quantity }
                : product)
              : state.products,
          };
        });
      },

      setServiceTabStatus: (tabId, status) => {
        set((state) => {
          const orderIds = new Set(state.serviceOrders.filter((order) => order.tabId === tabId).map((order) => order.id));
          const gross = state.serviceOrderItems
            .filter((item) => orderIds.has(item.orderId) && item.status !== 'cancelled')
            .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
          const paid = state.salePayments
            .filter((payment) => payment.tabId === tabId && !payment.reversedAt)
            .reduce((sum, payment) => sum + payment.amount, 0);
          if ((status === 'paid' || status === 'closed') && paid + 0.001 < gross) return {};
          return {
            serviceTabs: state.serviceTabs.map((tab) =>
              tab.id === tabId ? { ...tab, status, closedAt: status === 'closed' ? nowIso() : tab.closedAt } : tab,
            ),
          };
        });
      },

      payServiceTab: (tabId, input) => {
        if (input.amount <= 0) return;
        set((state) => {
          const orderIds = new Set(state.serviceOrders.filter((order) => order.tabId === tabId).map((order) => order.id));
          const gross = state.serviceOrderItems
            .filter((item) => orderIds.has(item.orderId) && item.status !== 'cancelled')
            .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
          const alreadyPaid = state.salePayments
            .filter((payment) => payment.tabId === tabId && !payment.reversedAt)
            .reduce((sum, payment) => sum + payment.amount, 0);
          const amount = Math.min(input.amount, Math.max(0, gross - alreadyPaid));
          if (amount <= 0) return {};
          const payment: SalePayment = { id: uid(), tabId, payerPlayerId: input.payerPlayerId, payerName: input.payerName.trim() || 'Cliente', amount, method: input.method, paidAt: nowIso(), reversedAt: null };
          const allocatedByShare = new Map<string, number>();
          for (const allocation of state.salePaymentAllocations) allocatedByShare.set(allocation.itemShareId, (allocatedByShare.get(allocation.itemShareId) ?? 0) + allocation.amountCents);
          const itemIds = new Set(state.serviceOrderItems.filter((item) => orderIds.has(item.orderId) && item.status !== 'cancelled').map((item) => item.id));
          const allowedParticipants = input.coveredParticipantIds?.length ? new Set(input.coveredParticipantIds) : null;
          let remainingCents = Math.round(amount * 100);
          const allocations: SalePaymentAllocation[] = [];
          for (const share of state.orderItemShares.filter((row) => itemIds.has(row.itemId) && (!allowedParticipants || allowedParticipants.has(row.participantId)))) {
            if (remainingCents <= 0) break;
            const pending = Math.max(0, share.amountCents - (allocatedByShare.get(share.id) ?? 0));
            const allocated = Math.min(pending, remainingCents);
            if (allocated > 0) {
              allocations.push({ id: uid(), paymentId: payment.id, itemShareId: share.id, amountCents: allocated });
              remainingCents -= allocated;
            }
          }
          const nextPaid = alreadyPaid + amount;
          const status: ServiceTabStatus = nextPaid + 0.001 >= gross ? 'paid' : 'partially_paid';
          return {
            salePayments: [...state.salePayments, payment],
            salePaymentAllocations: [...state.salePaymentAllocations, ...allocations],
            serviceTabs: state.serviceTabs.map((tab) => (tab.id === tabId ? { ...tab, status } : tab)),
          };
        });
      },

      reverseSalePayment: (paymentId) => {
        set((state) => {
          const payment = state.salePayments.find((row) => row.id === paymentId && !row.reversedAt);
          if (!payment) return {};
          const payments = state.salePayments.map((row) => (row.id === paymentId ? { ...row, reversedAt: nowIso() } : row));
          const orderIds = new Set(state.serviceOrders.filter((order) => order.tabId === payment.tabId).map((order) => order.id));
          const gross = state.serviceOrderItems.filter((item) => orderIds.has(item.orderId) && item.status !== 'cancelled').reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
          const paid = payments.filter((row) => row.tabId === payment.tabId && !row.reversedAt).reduce((sum, row) => sum + row.amount, 0);
          const status: ServiceTabStatus = paid <= 0 ? 'awaiting_payment' : paid + 0.001 >= gross ? 'paid' : 'partially_paid';
          return {
            salePayments: payments,
            salePaymentAllocations: state.salePaymentAllocations.filter((allocation) => allocation.paymentId !== paymentId),
            serviceTabs: state.serviceTabs.map((tab) => (tab.id === payment.tabId ? { ...tab, status, closedAt: null } : tab)),
          };
        });
      },

      openCashShift: (establishmentId, openingAmount) => {
        const current = get().cashShifts.find((shift) => shift.establishmentId === establishmentId && shift.status === 'open');
        if (current) return current;
        const shift: CashShift = { id: uid(), establishmentId, openedByPlayerId: get().currentPlayerId, openingAmount: Math.max(0, openingAmount), closingAmount: null, expectedAmount: null, difference: null, status: 'open', openedAt: nowIso(), closedAt: null };
        set((state) => ({ cashShifts: [...state.cashShifts, shift] }));
        return shift;
      },

      closeCashShift: (shiftId, closingAmount) => {
        set((state) => ({
          cashShifts: state.cashShifts.map((shift) => {
            if (shift.id !== shiftId || shift.status !== 'open') return shift;
            const tabIds = new Set(state.serviceTabs.filter((tab) => tab.establishmentId === shift.establishmentId).map((tab) => tab.id));
            const cashSales = state.salePayments.filter((payment) => tabIds.has(payment.tabId) && payment.method === 'cash' && !payment.reversedAt && payment.paidAt >= shift.openedAt).reduce((sum, payment) => sum + payment.amount, 0);
            const expectedAmount = shift.openingAmount + cashSales;
            return { ...shift, closingAmount, expectedAmount, difference: closingAmount - expectedAmount, status: 'closed', closedAt: nowIso() };
          }),
        }));
      },

      addCoach: (establishmentId, playerId, sportIds, bio) => {
        const existing = get().coaches.find((coach) => coach.establishmentId === establishmentId && coach.playerId === playerId);
        if (existing) return existing;
        const coach: Coach = { id: uid(), establishmentId, playerId, sportIds, bio, active: true };
        set((state) => ({ coaches: [...state.coaches, coach] }));
        return coach;
      },

      createClassProgram: (establishmentId, input) => {
        const program: ClassProgram = { id: uid(), establishmentId, name: input.name.trim(), sportId: input.sportId, format: input.format, coachId: input.coachId, fieldId: input.fieldId, level: input.level.trim() || 'Todos os níveis', capacity: input.format === 'private' ? 1 : Math.max(2, input.capacity), durationMinutes: Math.max(15, input.durationMinutes), price: Math.max(0, input.price), billingType: input.billingType, active: true, createdAt: nowIso() };
        set((state) => ({ classPrograms: [...state.classPrograms, program] }));
        return program;
      },

      createClassSession: (programId, startsAt) => {
        const state = get();
        const program = state.classPrograms.find((row) => row.id === programId && row.active);
        if (!program) return null;
        const start = new Date(startsAt);
        if (Number.isNaN(start.getTime())) return null;
        const end = new Date(start.getTime() + program.durationMinutes * 60_000);
        const overlaps = (aStart: Date, aEnd: Date) => start < aEnd && end > aStart;
        const classConflict = state.classSessions.some((session) => {
          const otherProgram = state.classPrograms.find((row) => row.id === session.programId);
          return otherProgram?.fieldId === program.fieldId && session.status !== 'cancelled' && overlaps(new Date(session.startsAt), new Date(session.endsAt));
        });
        const gameConflict = state.games.some((game) => game.fieldId === program.fieldId && game.status !== 'cancelled' && overlaps(new Date(game.scheduledAt), new Date(new Date(game.scheduledAt).getTime() + (game.durationMinutes ?? 90) * 60_000)));
        const championshipConflict = state.championshipMatches.some((match) => match.fieldId === program.fieldId && match.scheduledAt && match.status !== 'finished' && overlaps(new Date(match.scheduledAt), new Date(new Date(match.scheduledAt).getTime() + program.durationMinutes * 60_000)));
        if (classConflict || gameConflict || championshipConflict) return null;
        const session: ClassSession = { id: uid(), programId, startsAt: start.toISOString(), endsAt: end.toISOString(), status: 'open', cancellationReason: null };
        set((current) => ({ classSessions: [...current.classSessions, session] }));
        return session;
      },

      cancelClassSession: (sessionId, reason) => {
        set((state) => ({
          classSessions: state.classSessions.map((session) => (session.id === sessionId ? { ...session, status: 'cancelled', cancellationReason: reason.trim() || 'Cancelada pelo estabelecimento' } : session)),
          classEnrollments: state.classEnrollments.map((enrollment) => enrollment.sessionId === sessionId && enrollment.status !== 'cancelled' ? { ...enrollment, status: 'cancelled', paymentStatus: enrollment.paymentStatus === 'paid' ? 'refunded' : enrollment.paymentStatus } : enrollment),
        }));
      },

      completeClassSession: (sessionId) => {
        set((state) => ({ classSessions: state.classSessions.map((session) => session.id === sessionId ? { ...session, status: 'completed' } : session) }));
      },

      enrollInClass: (sessionId, playerId, isTrial = false) => {
        const existing = get().classEnrollments.find((enrollment) => enrollment.sessionId === sessionId && enrollment.playerId === playerId && enrollment.status !== 'cancelled');
        if (existing) return existing;
        const session = get().classSessions.find((row) => row.id === sessionId);
        const program = get().classPrograms.find((row) => row.id === session?.programId);
        if (!session || !program || session.status === 'cancelled' || session.status === 'completed') {
          throw new Error('Aula indisponível');
        }
        const confirmedCount = get().classEnrollments.filter((row) => row.sessionId === sessionId && row.status === 'confirmed').length;
        const waitlistedCount = get().classEnrollments.filter((row) => row.sessionId === sessionId && row.status === 'waitlisted').length;
        const confirmed = confirmedCount < program.capacity;
        const credit = confirmed ? get().makeupCredits.find((row) => row.playerId === playerId && row.programId === program.id && !row.usedAt && new Date(row.expiresAt).getTime() > Date.now()) : undefined;
        const waived = isTrial || Boolean(credit);
        const enrollment: ClassEnrollment = { id: uid(), sessionId, playerId, status: confirmed ? 'confirmed' : 'waitlisted', paymentStatus: waived ? 'waived' : 'pending', paymentMethod: null, amount: waived ? 0 : program.price, isTrial, waitlistPosition: confirmed ? null : waitlistedCount + 1, enrolledAt: nowIso(), paidAt: null };
        set((state) => ({
          classEnrollments: [...state.classEnrollments, enrollment],
          classSessions: state.classSessions.map((row) => row.id === sessionId && confirmedCount + 1 >= program.capacity ? { ...row, status: 'full' } : row),
          makeupCredits: credit ? state.makeupCredits.map((row) => row.id === credit.id ? { ...row, usedAt: nowIso() } : row) : state.makeupCredits,
        }));
        return enrollment;
      },

      setClassEnrollmentPayment: (enrollmentId, method) => {
        set((state) => ({ classEnrollments: state.classEnrollments.map((row) => row.id === enrollmentId ? { ...row, paymentStatus: 'paid', paymentMethod: method, paidAt: nowIso() } : row) }));
      },

      cancelClassEnrollment: (enrollmentId) => {
        set((state) => {
          const target = state.classEnrollments.find((row) => row.id === enrollmentId);
          if (!target) return {};
          const wasConfirmed = target.status === 'confirmed';
          const waiting = state.classEnrollments.filter((row) => row.sessionId === target.sessionId && row.status === 'waitlisted').sort((a, b) => (a.waitlistPosition ?? 999) - (b.waitlistPosition ?? 999));
          const promotedId = wasConfirmed ? waiting[0]?.id : undefined;
          const promoted = waiting[0];
          const session = state.classSessions.find((row) => row.id === target.sessionId);
          const program = state.classPrograms.find((row) => row.id === session?.programId);
          const promotedCredit = promoted && program ? state.makeupCredits.find((row) => row.playerId === promoted.playerId && row.programId === program.id && !row.usedAt && new Date(row.expiresAt).getTime() > Date.now()) : undefined;
          const enrollments = state.classEnrollments.map((row) => {
            if (row.id === enrollmentId) return { ...row, status: 'cancelled' as const, waitlistPosition: null, paymentStatus: row.paymentStatus === 'paid' ? 'refunded' as const : row.paymentStatus };
            if (row.id === promotedId) return { ...row, status: 'confirmed' as const, waitlistPosition: null, paymentStatus: promotedCredit ? 'waived' as const : row.paymentStatus, amount: promotedCredit ? 0 : row.amount };
            if (row.sessionId === target.sessionId && row.status === 'waitlisted' && promotedId) return { ...row, waitlistPosition: Math.max(1, (row.waitlistPosition ?? 1) - 1) };
            return row;
          });
          return { classEnrollments: enrollments, classSessions: state.classSessions.map((session) => session.id === target.sessionId ? { ...session, status: 'open' } : session), makeupCredits: promotedCredit ? state.makeupCredits.map((row) => row.id === promotedCredit.id ? { ...row, usedAt: nowIso() } : row) : state.makeupCredits };
        });
      },

      recordClassAttendance: (sessionId, playerId, status, coachNotes) => {
        set((state) => {
          const existing = state.classAttendances.find((row) => row.sessionId === sessionId && row.playerId === playerId);
          const attendance: ClassAttendance = { id: existing?.id ?? uid(), sessionId, playerId, status, coachNotes: coachNotes?.trim() || null, recordedAt: nowIso() };
          const session = state.classSessions.find((row) => row.id === sessionId);
          const program = state.classPrograms.find((row) => row.id === session?.programId);
          const hasCredit = state.makeupCredits.some((credit) => credit.sourceSessionId === sessionId && credit.playerId === playerId);
          const credit: MakeupCredit | null = status === 'excused' && program && !hasCredit
            ? { id: uid(), playerId, programId: program.id, sourceSessionId: sessionId, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), usedAt: null }
            : null;
          return {
            classAttendances: existing ? state.classAttendances.map((row) => row.id === existing.id ? attendance : row) : [...state.classAttendances, attendance],
            makeupCredits: credit ? [...state.makeupCredits, credit] : state.makeupCredits,
          };
        });
      },


      createChampionship: (organizer, createdBy, input) => {
        const championship: Championship = {
          id: uid(),
          establishmentId: organizer.establishmentId,
          organizerPeladaId: organizer.organizerPeladaId,
          name: input.name,
          sportId: input.sportId,
          format: input.format,
          fieldId: input.fieldId,
          maxTeams: input.maxTeams,
          entryFee: input.entryFee,
          registrationCode: uid().toUpperCase(),
          registrationDeadline: null,
          matchMinutes: input.matchMinutes,
          status: 'registration',
          createdBy,
          createdAt: nowIso(),
        };
        set((state) => ({ championships: [...state.championships, championship] }));
        return championship;
      },

      saveChampionshipBudget: (championshipId, input, entryFee) => {
        if (!get().championships.some((row) => row.id === championshipId)) return null;
        const existing = get().championshipBudgets.find((row) => row.championshipId === championshipId);
        const budget: ChampionshipBudget = {
          ...normalizeChampionshipBudget(input),
          id: existing?.id ?? uid(),
          championshipId,
          updatedAt: nowIso(),
        };
        set((state) => ({
          championshipBudgets: [...state.championshipBudgets.filter((row) => row.championshipId !== championshipId), budget],
          championships: state.championships.map((row) => row.id === championshipId ? { ...row, entryFee: Math.max(0, entryFee) } : row),
        }));
        return budget;
      },

      registerChampionshipTeam: (code, input) => {
        const normalized = code.trim().toUpperCase();
        const championship = get().championships.find((c) => c.registrationCode.toUpperCase() === normalized);
        if (!championship) return null;

        const guests = input.guestNames.map((name) => makeGuestPlayer(name));
        const rosterIds = [...input.playerIds, ...guests.map((g) => g.id)];

        const team: ChampionshipTeam = {
          id: uid(),
          championshipId: championship.id,
          name: input.name,
          color: input.color,
          logoUrl: input.logoUrl,
          peladaId: input.peladaId,
          registeredByPlayerId: input.registeredByPlayerId,
          status: 'confirmed',
          createdAt: nowIso(),
        };
        const rosterRows: ChampionshipTeamPlayer[] = rosterIds.map((playerId) => ({
          championshipTeamId: team.id,
          playerId,
          isGoalkeeper: false,
        }));

        set((state) => ({
          players: [...state.players, ...guests],
          championshipTeams: [...state.championshipTeams, team],
          championshipTeamPlayers: [...state.championshipTeamPlayers, ...rosterRows],
        }));
        return team;
      },

      removeChampionshipTeam: (teamId) => {
        set((state) => ({
          championshipTeams: state.championshipTeams.filter((t) => t.id !== teamId),
          championshipTeamPlayers: state.championshipTeamPlayers.filter((tp) => tp.championshipTeamId !== teamId),
        }));
      },

      setChampionshipTeamLogo: (teamId, logoUrl) => {
        set((state) => ({
          championshipTeams: state.championshipTeams.map((t) => (t.id === teamId ? { ...t, logoUrl } : t)),
        }));
      },

      generateChampionshipFixtures: (championshipId) => {
        const championship = get().championships.find((c) => c.id === championshipId);
        if (!championship) return;
        const teams = get().championshipTeams.filter((t) => t.championshipId === championshipId && t.status === 'confirmed');
        if (teams.length < 2) return;

        const generated = championship.format === 'knockout' ? generateKnockoutFixtures(teams) : generateRoundRobinFixtures(teams);
        const matches: ChampionshipMatch[] = generated.map((m) => ({ ...m, championshipId }));

        set((state) => ({
          championshipMatches: [...state.championshipMatches, ...matches],
          championships: state.championships.map((c) => (c.id === championshipId ? { ...c, status: 'in_progress' } : c)),
        }));
      },

      startChampionshipMatch: (matchId) => {
        set((state) => ({
          championshipMatches: state.championshipMatches.map((m) =>
            m.id === matchId ? { ...m, startedAt: nowIso(), status: 'in_progress' } : m,
          ),
        }));
      },

      registerChampionshipGoal: (matchId, teamId, scorerPlayerId) => {
        set((state) => ({
          championshipGoals: [
            ...state.championshipGoals,
            { id: uid(), matchId, teamId, scorerPlayerId, scoredAt: nowIso() } satisfies ChampionshipGoal,
          ],
        }));
      },

      undoLastChampionshipGoal: (matchId) => {
        set((state) => {
          const matchGoals = state.championshipGoals.filter((g) => g.matchId === matchId);
          if (matchGoals.length === 0) return {};
          const last = matchGoals[matchGoals.length - 1];
          return { championshipGoals: state.championshipGoals.filter((g) => g.id !== last.id) };
        });
      },

      endChampionshipMatch: (matchId, penaltyScoreA, penaltyScoreB) => {
        const match = get().championshipMatches.find((m) => m.id === matchId);
        if (!match || !match.teamAId || !match.teamBId) return;
        const championship = get().championships.find((c) => c.id === match.championshipId);
        const goals = get().championshipGoals.filter((g) => g.matchId === matchId);
        const goalsA = goals.filter((g) => g.teamId === match.teamAId).length;
        const goalsB = goals.filter((g) => g.teamId === match.teamBId).length;

        let winnerTeamId: string | null = null;
        if (goalsA > goalsB) winnerTeamId = match.teamAId;
        else if (goalsB > goalsA) winnerTeamId = match.teamBId;
        else if (championship?.format === 'knockout' && penaltyScoreA !== undefined && penaltyScoreB !== undefined) {
          winnerTeamId = penaltyScoreA > penaltyScoreB ? match.teamAId : match.teamBId;
        }

        set((state) => {
          const updatedMatches = state.championshipMatches.map((m) =>
            m.id === matchId
              ? {
                  ...m,
                  status: 'finished' as const,
                  endedAt: nowIso(),
                  winnerTeamId,
                  penaltyScoreA: penaltyScoreA ?? null,
                  penaltyScoreB: penaltyScoreB ?? null,
                }
              : m,
          );
          return { championshipMatches: winnerTeamId ? advanceWinner(updatedMatches, matchId) : updatedMatches };
        });
      },

      sendTeamChallenge: (challengerPeladaId, challengedPeladaId, createdBy, input) => {
        const challenge: TeamChallenge = {
          id: uid(),
          challengerPeladaId,
          challengedPeladaId,
          proposedDate: input.proposedDate,
          proposedTime: input.proposedTime,
          fieldId: input.fieldId,
          message: input.message,
          status: 'pending',
          matchId: null,
          createdBy,
          createdAt: nowIso(),
          respondedAt: null,
        };
        set((state) => ({ teamChallenges: [...state.teamChallenges, challenge] }));
        return challenge;
      },

      respondTeamChallenge: (challengeId, accept) => {
        const challenge = get().teamChallenges.find((c) => c.id === challengeId);
        if (!challenge || challenge.status !== 'pending') return;

        if (!accept) {
          set((state) => ({
            teamChallenges: state.teamChallenges.map((c) =>
              c.id === challengeId ? { ...c, status: 'declined', respondedAt: nowIso() } : c,
            ),
          }));
          return;
        }

        const challengerPelada = get().peladas.find((p) => p.id === challenge.challengerPeladaId);
        const match: FriendlyMatch = {
          id: uid(),
          challengeId,
          peladaAId: challenge.challengerPeladaId,
          peladaBId: challenge.challengedPeladaId,
          fieldId: challenge.fieldId,
          scheduledAt: `${challenge.proposedDate}T${challenge.proposedTime}:00`,
          matchMinutes: challengerPelada?.defaultMatchMinutes ?? 10,
          sportId: challengerPelada?.sportId ?? 'futebol',
          startedAt: null,
          endedAt: null,
          status: 'scheduled',
          winnerPeladaId: null,
        };

        set((state) => ({
          teamChallenges: state.teamChallenges.map((c) =>
            c.id === challengeId ? { ...c, status: 'accepted', respondedAt: nowIso(), matchId: match.id } : c,
          ),
          friendlyMatches: [...state.friendlyMatches, match],
        }));
      },

      cancelTeamChallenge: (challengeId) => {
        set((state) => ({
          teamChallenges: state.teamChallenges.map((c) =>
            c.id === challengeId && c.status === 'pending' ? { ...c, status: 'cancelled', respondedAt: nowIso() } : c,
          ),
        }));
      },

      startFriendlyMatch: (matchId) => {
        set((state) => ({
          friendlyMatches: state.friendlyMatches.map((m) =>
            m.id === matchId ? { ...m, status: 'in_progress', startedAt: m.startedAt ?? nowIso() } : m,
          ),
        }));
      },

      registerFriendlyGoal: (matchId, peladaId, scorerPlayerId) => {
        set((state) => ({
          friendlyMatchGoals: [
            ...state.friendlyMatchGoals,
            { id: uid(), matchId, peladaId, scorerPlayerId, scoredAt: nowIso() } satisfies FriendlyMatchGoal,
          ],
        }));
      },

      undoLastFriendlyGoal: (matchId) => {
        set((state) => {
          const matchGoals = state.friendlyMatchGoals.filter((g) => g.matchId === matchId);
          const last = matchGoals[matchGoals.length - 1];
          if (!last) return state;
          return { friendlyMatchGoals: state.friendlyMatchGoals.filter((g) => g.id !== last.id) };
        });
      },

      endFriendlyMatch: (matchId, winnerPeladaId) => {
        set((state) => ({
          friendlyMatches: state.friendlyMatches.map((m) =>
            m.id === matchId ? { ...m, status: 'finished', endedAt: nowIso(), winnerPeladaId } : m,
          ),
        }));
      },

      sendPlayerDuel: (challengerId, challengedId, message) => {
        const duel: PlayerDuel = {
          id: uid(),
          challengerId,
          challengedId,
          message,
          status: 'pending',
          winnerId: null,
          resultNote: null,
          createdBy: challengerId,
          createdAt: nowIso(),
          respondedAt: null,
          resultRecordedAt: null,
        };
        set((state) => ({ playerDuels: [...state.playerDuels, duel] }));
        return duel;
      },

      respondPlayerDuel: (duelId, accept) => {
        set((state) => ({
          playerDuels: state.playerDuels.map((d) =>
            d.id === duelId && d.status === 'pending'
              ? { ...d, status: accept ? 'accepted' : 'declined', respondedAt: nowIso() }
              : d,
          ),
        }));
      },

      recordPlayerDuelResult: (duelId, winnerId, resultNote) => {
        set((state) => ({
          playerDuels: state.playerDuels.map((d) =>
            d.id === duelId ? { ...d, winnerId, resultNote, resultRecordedAt: nowIso() } : d,
          ),
        }));
      },

      addSchedule: (input) => {
        const schedule: Schedule = {
          id: uid(),
          peladaId: input.peladaId,
          fieldId: input.fieldId,
          recurrence: input.recurrence,
          dayOfWeek: input.dayOfWeek,
          time: input.time,
          startDate: input.startDate,
          endDate: null,
          maxPlayers: input.maxPlayers,
          matchMinutes: input.matchMinutes,
          bookingDurationMinutes: input.bookingDurationMinutes,
          drawMethod: input.drawMethod,
          defaultFieldCost: input.defaultFieldCost,
          matchGoalLimit: input.matchGoalLimit,
          autoBookingEnabled: input.autoBookingEnabled ?? false,
          bookingMinimumPlayers: Math.max(2, input.bookingMinimumPlayers ?? input.maxPlayers),
          bookingResponseMinutes: Math.max(5, input.bookingResponseMinutes ?? 30),
          pollQuorumPercent: 50,
          pollReminderMinutes: 120,
          active: true,
          createdBy: get().currentPlayerId,
        };
        set((state) => ({ schedules: [...state.schedules, schedule] }));
        return schedule;
      },

      addGameFromSchedule: (scheduleId, scheduledAt) => {
        const schedule = get().schedules.find((s) => s.id === scheduleId);
        if (!schedule) throw new Error('Agenda não encontrada');
        const game: Game = {
          id: uid(),
          peladaId: schedule.peladaId,
          scheduleId: schedule.id,
          fieldId: schedule.fieldId,
          scheduledAt,
          maxPlayers: schedule.maxPlayers,
          playersPerTeam: 6,
          matchMinutes: schedule.matchMinutes,
          durationMinutes: schedule.bookingDurationMinutes ?? 90,
          drawMethod: schedule.drawMethod,
          rotationMode: 'teams',
          status: 'open',
          fieldCost: schedule.defaultFieldCost,
          matchGoalLimit: schedule.matchGoalLimit,
          createdBy: get().currentPlayerId,
          createdAt: nowIso(),
        };
        set((state) => ({ games: [...state.games, game] }));
        return game;
      },

      updateGameMaxPlayers: (gameId, maxPlayers) => {
        set((state) => ({ games: state.games.map((g) => (g.id === gameId ? { ...g, maxPlayers } : g)) }));
      },

      setDrawMethod: (gameId, method) => {
        set((state) => ({ games: state.games.map((g) => (g.id === gameId ? { ...g, drawMethod: method } : g)) }));
      },

      promoteFromWaitlist: (gameId) => {
        set((state) => {
          const waitlisted = state.attendances
            .filter((a) => a.gameId === gameId && a.status === 'waitlist')
            .sort((a, b) => (a.confirmedOrder ?? 0) - (b.confirmedOrder ?? 0));
          if (waitlisted.length === 0) return {};
          const next = waitlisted[0];
          const maxOrder = Math.max(0, ...state.attendances.filter((a) => a.gameId === gameId && a.confirmedOrder).map((a) => a.confirmedOrder ?? 0));
          return {
            attendances: state.attendances.map((a) =>
              a.id === next.id ? { ...a, status: 'confirmed', confirmedOrder: maxOrder + 1 } : a,
            ),
          };
        });
      },

      updateScheduleBookingAutomation: (scheduleId, input) => {
        set((state) => ({
          schedules: state.schedules.map((schedule) =>
            schedule.id === scheduleId
              ? {
                  ...schedule,
                  autoBookingEnabled: input.enabled,
                  bookingMinimumPlayers: Math.max(2, input.minimumPlayers),
                  bookingResponseMinutes: Math.max(5, input.responseMinutes),
                  pollQuorumPercent: Math.min(100, Math.max(1, input.pollQuorumPercent ?? schedule.pollQuorumPercent ?? 50)),
                  pollReminderMinutes: Math.max(15, input.pollReminderMinutes ?? schedule.pollReminderMinutes ?? 120),
                }
              : schedule,
          ),
        }));
      },

      addScheduleFieldPreference: (scheduleId, fieldId, source = 'team') => {
        set((state) => {
          if (state.scheduleFieldPreferences.some((row) => row.scheduleId === scheduleId && row.fieldId === fieldId)) return {};
          const priority = Math.max(0, ...state.scheduleFieldPreferences.filter((row) => row.scheduleId === scheduleId).map((row) => row.priority)) + 1;
          return {
            scheduleFieldPreferences: [
              ...state.scheduleFieldPreferences,
              { id: uid(), scheduleId, fieldId, priority, source, createdAt: nowIso() },
            ],
          };
        });
      },

      moveScheduleFieldPreference: (preferenceId, direction) => {
        set((state) => {
          const target = state.scheduleFieldPreferences.find((row) => row.id === preferenceId);
          if (!target) return {};
          const ordered = state.scheduleFieldPreferences
            .filter((row) => row.scheduleId === target.scheduleId)
            .sort((a, b) => a.priority - b.priority);
          const index = ordered.findIndex((row) => row.id === preferenceId);
          const swapIndex = direction === 'up' ? index - 1 : index + 1;
          if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return {};
          const swap = ordered[swapIndex];
          return {
            scheduleFieldPreferences: state.scheduleFieldPreferences.map((row) => {
              if (row.id === target.id) return { ...row, priority: swap.priority };
              if (row.id === swap.id) return { ...row, priority: target.priority };
              return row;
            }),
          };
        });
      },

      removeScheduleFieldPreference: (preferenceId) => {
        set((state) => ({ scheduleFieldPreferences: state.scheduleFieldPreferences.filter((row) => row.id !== preferenceId) }));
      },

      addFieldAvailability: (fieldId, input) => {
        const availability: FieldAvailability = { id: uid(), fieldId, ...input, active: true };
        set((state) => ({ fieldAvailabilities: [...state.fieldAvailabilities, availability] }));
        return availability;
      },

      removeFieldAvailability: (availabilityId) => {
        set((state) => ({ fieldAvailabilities: state.fieldAvailabilities.filter((row) => row.id !== availabilityId) }));
      },

      triggerGameBookingAutomation: (gameId) => {
        const state = get();
        const game = state.games.find((row) => row.id === gameId);
        const schedule = state.schedules.find((row) => row.id === game?.scheduleId);
        const pelada = state.peladas.find((row) => row.id === game?.peladaId);
        if (!game || !schedule || !pelada || !schedule.autoBookingEnabled) return null;
        const confirmed = state.attendances.filter((row) => row.gameId === gameId && row.status === 'confirmed').length;
        if (confirmed < schedule.bookingMinimumPlayers) return null;
        if (state.gameBookingRequests.some((row) => row.gameId === gameId && ['awaiting_owner', 'accepted'].includes(row.status))) return null;

        const attemptedFieldIds = state.gameBookingRequests.filter((row) => row.gameId === gameId).map((row) => row.fieldId);
        const candidate = nextBookingCandidate(
          game,
          pelada.sportId,
          state.fields,
          state.scheduleFieldPreferences,
          state.fieldPromotions,
          attemptedFieldIds,
          state.fieldAvailabilities,
          state.fieldBookings,
        );
        if (!candidate) return null;

        const now = new Date();
        const request: GameBookingRequest = {
          id: uid(),
          gameId,
          scheduleId: schedule.id,
          fieldId: candidate.fieldId,
          preferenceId: candidate.preferenceId,
          source: candidate.source,
          attempt: attemptedFieldIds.length + 1,
          code: createBookingCode(),
          requestedAt: now.toISOString(),
          requestedStartAt: game.scheduledAt,
          durationMinutes: game.durationMinutes ?? 90,
          status: 'awaiting_owner',
          sentAt: now.toISOString(),
          respondedAt: null,
          expiresAt: new Date(now.getTime() + schedule.bookingResponseMinutes * 60_000).toISOString(),
          providerMessageId: `demo-${uid()}`,
          responseMessageId: null,
          failureReason: null,
        };
        const field = state.fields.find((row) => row.id === candidate.fieldId);
        const establishment = state.establishments.find((row) => row.id === field?.establishmentId);
        const phone = normalizeWhatsAppPhone(establishment?.whatsappPhone);
        const delivery: WhatsAppDelivery = {
          id: uid(),
          bookingRequestId: request.id,
          pollId: null,
          toPlayerId: establishment?.ownerPlayerId ?? null,
          phone,
          kind: 'field_request',
          status: phone && establishment?.whatsappOptIn ? 'sent' : 'skipped',
          preview: `${pelada.name} solicita ${field?.name ?? 'o campo'} em ${new Date(game.scheduledAt).toLocaleString('pt-BR')}. Responda SIM ${request.code} ou NÃO ${request.code}.`,
          providerMessageId: phone && establishment?.whatsappOptIn ? request.providerMessageId : null,
          createdAt: now.toISOString(),
          sentAt: phone && establishment?.whatsappOptIn ? now.toISOString() : null,
        };
        set((current) => ({
          gameBookingRequests: [...current.gameBookingRequests, request],
          whatsAppDeliveries: [...current.whatsAppDeliveries, delivery],
        }));
        return request;
      },

      respondGameBookingRequest: (requestId, accepted) => {
        const snapshot = get();
        const request = snapshot.gameBookingRequests.find((row) => row.id === requestId);
        const game = snapshot.games.find((row) => row.id === request?.gameId);
        const field = snapshot.fields.find((row) => row.id === request?.fieldId);
        const pelada = snapshot.peladas.find((row) => row.id === game?.peladaId);
        if (!request || !game || !field || !pelada || request.status !== 'awaiting_owner') return;
        const start = new Date(request.requestedStartAt);
        const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
        const time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
        const conflicts = findBookingConflicts(snapshot.fieldBookings, {
          fieldId: field.id,
          recurrence: 'single',
          dayOfWeek: null,
          date,
          time,
          durationMinutes: request.durationMinutes,
        });
        const responseAt = nowIso();
        const finalAccepted = accepted && conflicts.length === 0;
        const ownerResponseId = `demo-response-${uid()}`;
        set((state) => {
          const deliveries: WhatsAppDelivery[] = [];
          if (finalAccepted) {
            const memberIds = state.memberships.filter((row) => row.peladaId === pelada.id && row.active).map((row) => row.playerId);
            for (const playerId of memberIds) {
              const player = state.players.find((row) => row.id === playerId);
              const phone = player?.whatsappOptIn ? normalizeWhatsAppPhone(player.phone) : null;
              deliveries.push({
                id: uid(), bookingRequestId: request.id, pollId: null, toPlayerId: playerId, phone,
                kind: 'game_confirmed', status: phone ? 'sent' : 'skipped',
                preview: `Jogo confirmado! ${pelada.name} joga em ${field.name}, ${start.toLocaleString('pt-BR')}.`,
                providerMessageId: phone ? `demo-${uid()}` : null, createdAt: responseAt, sentAt: phone ? responseAt : null,
              });
            }
          } else if (!accepted) {
            const admins = state.memberships.filter((row) => row.peladaId === pelada.id && row.active && row.role === 'admin');
            for (const admin of admins) {
              const player = state.players.find((row) => row.id === admin.playerId);
              const phone = player?.whatsappOptIn ? normalizeWhatsAppPhone(player.phone) : null;
              deliveries.push({
                id: uid(), bookingRequestId: request.id, pollId: null, toPlayerId: admin.playerId, phone,
                kind: 'booking_declined', status: phone ? 'sent' : 'skipped',
                preview: `${field.name} recusou ${request.code}. No app: tente o próximo campo ou abra uma enquete de horários.`,
                providerMessageId: phone ? `demo-${uid()}` : null, createdAt: responseAt, sentAt: phone ? responseAt : null,
              });
            }
          }
          const booking: FieldBooking | null = finalAccepted && field.establishmentId ? {
            id: uid(), fieldId: field.id, establishmentId: field.establishmentId, peladaId: pelada.id,
            teamName: pelada.name, recurrence: 'single', dayOfWeek: null, date, time,
            durationMinutes: request.durationMinutes, notes: `Confirmado automaticamente pelo WhatsApp (${request.code})`,
            createdBy: game.createdBy, createdAt: responseAt,
          } : null;
          return {
            gameBookingRequests: state.gameBookingRequests.map((row) => row.id === request.id ? {
              ...row,
              status: finalAccepted ? 'accepted' : accepted ? 'conflict' : 'declined',
              respondedAt: responseAt,
              responseMessageId: ownerResponseId,
              failureReason: accepted && !finalAccepted ? 'O horário ficou ocupado antes da confirmação.' : null,
            } : row),
            games: finalAccepted ? state.games.map((row) => row.id === game.id ? { ...row, fieldId: field.id } : row) : state.games,
            fieldBookings: booking ? [...state.fieldBookings, booking] : state.fieldBookings,
            whatsAppDeliveries: [...state.whatsAppDeliveries, ...deliveries],
          };
        });
      },

      tryNextPreferredField: (gameId) => get().triggerGameBookingAutomation(gameId),

      createGameAvailabilityPoll: (gameId) => {
        const state = get();
        const game = state.games.find((row) => row.id === gameId);
        const schedule = state.schedules.find((row) => row.id === game?.scheduleId);
        const pelada = state.peladas.find((row) => row.id === game?.peladaId);
        if (!game || !schedule || !pelada) return null;
        const preferredFieldIds = state.scheduleFieldPreferences
          .filter((row) => row.scheduleId === schedule.id)
          .sort((a, b) => a.priority - b.priority)
          .map((row) => row.fieldId);
        const promotedFieldIds = state.fieldPromotions.filter((row) => row.active && row.sportId === pelada.sportId).map((row) => row.fieldId);
        const fieldIds = [...new Set([...preferredFieldIds, ...promotedFieldIds])];
        const slots = findAlternativeSlots(fieldIds, game.scheduledAt, game.durationMinutes ?? 90, state.fieldAvailabilities, state.fieldBookings, 4);
        if (slots.length === 0) return null;
        const createdAt = nowIso();
        const activeMemberCount = state.memberships.filter((row) => row.peladaId === pelada.id && row.active).length;
        const poll: TeamAvailabilityPoll = {
          id: uid(), gameId, peladaId: pelada.id, question: 'Qual destes horários você consegue jogar?', status: 'open',
          createdBy: state.currentPlayerId, createdAt, closesAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), selectedOptionId: null,
          quorumRequired: Math.max(1, Math.ceil(activeMemberCount * (schedule.pollQuorumPercent ?? 50) / 100)), reminderSentAt: null,
        };
        const options: TeamAvailabilityPollOption[] = slots.map((slot) => {
          const field = state.fields.find((row) => row.id === slot.fieldId);
          return { id: uid(), pollId: poll.id, fieldId: slot.fieldId, startsAt: slot.startsAt, label: `${field?.name ?? 'Campo'} · ${new Date(slot.startsAt).toLocaleString('pt-BR')}` };
        });
        const deliveries: WhatsAppDelivery[] = state.memberships.filter((row) => row.peladaId === pelada.id && row.active).map((member) => {
          const player = state.players.find((row) => row.id === member.playerId);
          const phone = player?.whatsappOptIn ? normalizeWhatsAppPhone(player.phone) : null;
          return {
            id: uid(), bookingRequestId: null, pollId: poll.id, toPlayerId: member.playerId, phone,
            kind: 'poll_invite' as const, status: phone ? 'sent' as const : 'skipped' as const,
            preview: `${pelada.name}: ${poll.question} Abra o app para votar.`, providerMessageId: phone ? `demo-${uid()}` : null,
            createdAt, sentAt: phone ? createdAt : null,
          };
        });
        set((current) => ({
          teamAvailabilityPolls: [...current.teamAvailabilityPolls, poll],
          teamAvailabilityPollOptions: [...current.teamAvailabilityPollOptions, ...options],
          whatsAppDeliveries: [...current.whatsAppDeliveries, ...deliveries],
        }));
        return poll;
      },

      voteGameAvailabilityPoll: (pollId, optionId, playerId) => {
        set((state) => {
          const existing = state.teamAvailabilityPollVotes.find((row) => row.pollId === pollId && row.playerId === playerId);
          if (existing) return { teamAvailabilityPollVotes: state.teamAvailabilityPollVotes.map((row) => row.id === existing.id ? { ...row, optionId, createdAt: nowIso() } : row) };
          return { teamAvailabilityPollVotes: [...state.teamAvailabilityPollVotes, { id: uid(), pollId, optionId, playerId, createdAt: nowIso() }] };
        });
      },

      finalizeGameAvailabilityPoll: (pollId, optionId) => {
        const state = get();
        const poll = state.teamAvailabilityPolls.find((row) => row.id === pollId && row.status === 'open');
        const option = state.teamAvailabilityPollOptions.find((row) => row.id === optionId && row.pollId === pollId);
        const game = state.games.find((row) => row.id === poll?.gameId);
        const schedule = state.schedules.find((row) => row.id === game?.scheduleId);
        const uniqueVoters = new Set(state.teamAvailabilityPollVotes.filter((row) => row.pollId === pollId).map((row) => row.playerId)).size;
        if (!poll || !option || !game || !schedule || uniqueVoters < (poll.quorumRequired ?? 1)) return null;
        set((current) => ({
          teamAvailabilityPolls: current.teamAvailabilityPolls.map((row) => row.id === pollId ? { ...row, status: 'closed', selectedOptionId: optionId } : row),
          games: current.games.map((row) => row.id === game.id ? { ...row, scheduledAt: option.startsAt, fieldId: option.fieldId } : row),
          gameBookingRequests: current.gameBookingRequests.map((row) => row.gameId === game.id && row.status === 'awaiting_owner' ? { ...row, status: 'cancelled' } : row),
        }));
        const now = new Date();
        const request: GameBookingRequest = {
          id: uid(), gameId: game.id, scheduleId: schedule.id, fieldId: option.fieldId, preferenceId: null, source: 'team',
          attempt: state.gameBookingRequests.filter((row) => row.gameId === game.id).length + 1, code: createBookingCode(), requestedAt: now.toISOString(),
          requestedStartAt: option.startsAt, durationMinutes: game.durationMinutes ?? 90, status: 'awaiting_owner', sentAt: now.toISOString(), respondedAt: null,
          expiresAt: new Date(now.getTime() + schedule.bookingResponseMinutes * 60_000).toISOString(), providerMessageId: `demo-${uid()}`, responseMessageId: null, failureReason: null,
        };
        const field = state.fields.find((row) => row.id === option.fieldId);
        const establishment = state.establishments.find((row) => row.id === field?.establishmentId);
        const phone = normalizeWhatsAppPhone(establishment?.whatsappPhone);
        const delivery: WhatsAppDelivery = {
          id: uid(), bookingRequestId: request.id, pollId, toPlayerId: establishment?.ownerPlayerId ?? null, phone,
          kind: 'field_request', status: phone && establishment?.whatsappOptIn ? 'sent' : 'skipped',
          preview: `${state.peladas.find((row) => row.id === poll.peladaId)?.name ?? 'Time'} solicita ${field?.name ?? 'o campo'} em ${new Date(option.startsAt).toLocaleString('pt-BR')}. Responda SIM ${request.code} ou NÃO ${request.code}.`,
          providerMessageId: phone ? request.providerMessageId : null, createdAt: now.toISOString(), sentAt: phone ? now.toISOString() : null,
        };
        set((current) => ({ gameBookingRequests: [...current.gameBookingRequests, request], whatsAppDeliveries: [...current.whatsAppDeliveries, delivery] }));
        return request;
      },

      updateEstablishmentWhatsApp: (establishmentId, phone, optIn) => {
        set((state) => ({ establishments: state.establishments.map((row) => row.id === establishmentId ? { ...row, whatsappPhone: normalizeWhatsAppPhone(phone), whatsappOptIn: optIn } : row) }));
      },

      sendGameAvailabilityPollReminder: (pollId) => {
        const state = get();
        const poll = state.teamAvailabilityPolls.find((row) => row.id === pollId && row.status === 'open');
        if (!poll) return 0;
        const voters = new Set(state.teamAvailabilityPollVotes.filter((row) => row.pollId === pollId).map((row) => row.playerId));
        const now = nowIso();
        const deliveries: WhatsAppDelivery[] = state.memberships
          .filter((row) => row.peladaId === poll.peladaId && row.active && !voters.has(row.playerId))
          .map((member) => {
            const player = state.players.find((row) => row.id === member.playerId);
            const phone = player?.whatsappOptIn ? normalizeWhatsAppPhone(player.phone) : null;
            return {
              id: uid(), bookingRequestId: null, pollId, toPlayerId: member.playerId, phone,
              kind: 'poll_reminder' as const, status: phone ? 'sent' as const : 'skipped' as const,
              preview: `Lembrete: vote na enquete de horário do seu time no BoraJogo.`, providerMessageId: phone ? `demo-${uid()}` : null,
              createdAt: now, sentAt: phone ? now : null, provider: phone ? 'evolution_go' as const : 'in_app' as const, fallbackFromProvider: null,
            };
          });
        set((current) => ({
          teamAvailabilityPolls: current.teamAvailabilityPolls.map((row) => row.id === pollId ? { ...row, reminderSentAt: now } : row),
          whatsAppDeliveries: [...current.whatsAppDeliveries, ...deliveries],
        }));
        return deliveries.filter((row) => row.status === 'sent').length;
      },

      createBookingDeposit: (requestId, payerPlayerId, method) => {
        const state = get();
        const request = state.gameBookingRequests.find((row) => row.id === requestId && row.status === 'accepted');
        const field = state.fields.find((row) => row.id === request?.fieldId);
        const establishment = state.establishments.find((row) => row.id === field?.establishmentId);
        const game = state.games.find((row) => row.id === request?.gameId);
        if (!request || !field || !establishment || !game) return null;
        const existing = state.bookingDeposits.find((row) => row.bookingRequestId === requestId && !['cancelled', 'refunded'].includes(row.status));
        if (existing) return existing;
        const start = new Date(request.requestedStartAt);
        const availability = state.fieldAvailabilities.find((row) => row.fieldId === field.id && row.dayOfWeek === start.getDay() && row.active);
        const baseAmount = availability?.price ?? game.fieldCost ?? 0;
        const amountCents = Math.round(baseAmount * Math.max(0, establishment.reservationDepositPercent ?? 0));
        if (amountCents <= 0) return null;
        const connection = state.paymentGatewayConnections.find((row) => row.establishmentId === establishment.id && row.status === 'connected');
        const provider = connection?.provider ?? 'manual_pix';
        if (method === 'card' && !connection?.cardEnabled) return null;
        const id = uid();
        const deposit: BookingDeposit = {
          id, bookingRequestId: request.id, payerPlayerId, amountCents, provider, method, status: 'pending',
          externalId: `demo-booking-${id}`, pixCopyPaste: method === 'pix' ? demoPixCode(provider, id, amountCents) : null,
          checkoutUrl: method === 'card' ? `https://checkout.demo/${provider}/booking/${id}` : null,
          dueAt: new Date(Date.now() + 30 * 60_000).toISOString(), paidAt: null, refundedAt: null, createdAt: nowIso(),
        };
        set((current) => ({ bookingDeposits: [...current.bookingDeposits, deposit] }));
        return deposit;
      },

      confirmBookingDeposit: (depositId) => {
        set((state) => ({ bookingDeposits: state.bookingDeposits.map((row) => row.id === depositId && row.status === 'pending' ? { ...row, status: 'paid', paidAt: nowIso() } : row) }));
      },

      cancelConfirmedBooking: (requestId) => {
        const state = get();
        const request = state.gameBookingRequests.find((row) => row.id === requestId && row.status === 'accepted');
        if (!request) return { refunded: false, retained: false };
        const field = state.fields.find((row) => row.id === request.fieldId);
        const establishment = state.establishments.find((row) => row.id === field?.establishmentId);
        const deposit = state.bookingDeposits.find((row) => row.bookingRequestId === requestId && row.status === 'paid');
        const hoursUntil = (new Date(request.requestedStartAt).getTime() - Date.now()) / 3_600_000;
        const refundAllowed = !!deposit && hoursUntil >= (establishment?.cancellationRefundHours ?? 24) && (establishment?.cancellationRefundPercent ?? 100) > 0;
        set((current) => ({
          gameBookingRequests: current.gameBookingRequests.map((row) => row.id === requestId ? { ...row, status: 'cancelled', respondedAt: nowIso(), failureReason: 'Reserva cancelada pelo time.' } : row),
          fieldBookings: current.fieldBookings.filter((row) => !(row.fieldId === request.fieldId && row.peladaId === current.games.find((game) => game.id === request.gameId)?.peladaId && row.notes?.includes(request.code))),
          bookingDeposits: current.bookingDeposits.map((row) => row.id === deposit?.id ? { ...row, status: refundAllowed ? 'refunded' : 'retained', refundedAt: refundAllowed ? nowIso() : null } : row),
        }));
        return { refunded: refundAllowed, retained: !!deposit && !refundAllowed };
      },

      updateEstablishmentBookingPolicy: (establishmentId, input) => {
        set((state) => ({ establishments: state.establishments.map((row) => row.id === establishmentId ? {
          ...row,
          reservationDepositPercent: Math.min(100, Math.max(0, input.depositPercent)),
          cancellationRefundHours: Math.max(0, input.refundHours),
          cancellationRefundPercent: Math.min(100, Math.max(0, input.refundPercent)),
          messagingProvider: input.messagingProvider,
        } : row) }));
      },

      createFieldPromotion: (fieldId, input) => {
        const state = get();
        const field = state.fields.find((row) => row.id === fieldId);
        if (!field?.establishmentId || !input.label.trim()) return null;
        const promotion: FieldPromotion = {
          id: uid(), fieldId, sportId: field.sportId, label: input.label.trim(),
          pricePerConfirmedBooking: Math.max(0, input.pricePerConfirmedBooking), active: true,
          startsAt: nowIso(), endsAt: null, campaignBudget: input.campaignBudget,
        };
        set((current) => ({ fieldPromotions: [...current.fieldPromotions, promotion] }));
        return promotion;
      },

      setFieldPromotionActive: (promotionId, active) => {
        set((state) => ({ fieldPromotions: state.fieldPromotions.map((row) => row.id === promotionId ? { ...row, active } : row) }));
      },

      createFundraisingCampaign: (peladaId, input) => {
        const campaign: FundraisingCampaign = {
          id: uid(), peladaId, title: input.title.trim(), description: input.description,
          category: input.category, targetAmount: Math.max(1, input.targetAmount), suggestedAmount: input.suggestedAmount,
          deadline: input.deadline, imageUrl: null, status: 'active', allowAnonymous: input.allowAnonymous,
          payoutPlayerId: input.payoutPlayerId, createdBy: get().currentPlayerId, createdAt: nowIso(), closedAt: null,
        };
        set((state) => ({ fundraisingCampaigns: [...state.fundraisingCampaigns, campaign] }));
        return campaign;
      },

      createFundraisingContribution: (campaignId, input) => {
        const state = get();
        const campaign = state.fundraisingCampaigns.find((row) => row.id === campaignId && row.status === 'active');
        if (!campaign || input.amount <= 0) return null;
        const establishment = state.establishments.find((row) => row.ownerPlayerId === campaign.payoutPlayerId);
        const connection = state.paymentGatewayConnections.find((row) => row.establishmentId === establishment?.id && row.status === 'connected');
        const provider = connection?.provider ?? 'manual_pix';
        if (input.method === 'card' && !connection?.cardEnabled) return null;
        const id = uid();
        const contribution: FundraisingContribution = {
          id, campaignId, paidByPlayerId: input.paidByPlayerId, creditedPlayerId: input.creditedPlayerId,
          amount: input.amount, method: input.method, provider, status: input.method === 'cash' ? 'paid' : 'pending',
          anonymous: input.anonymous, message: input.message?.trim() || null, externalId: `demo-fund-${id}`,
          pixCopyPaste: input.method === 'pix' ? demoPixCode(provider, id, Math.round(input.amount * 100)) : null,
          checkoutUrl: input.method === 'card' ? `https://checkout.demo/${provider}/fund/${id}` : null,
          createdAt: nowIso(), paidAt: input.method === 'cash' ? nowIso() : null,
        };
        set((current) => ({ fundraisingContributions: [...current.fundraisingContributions, contribution] }));
        return contribution;
      },

      confirmFundraisingContribution: (contributionId) => {
        set((state) => {
          const contribution = state.fundraisingContributions.find((row) => row.id === contributionId && row.status === 'pending');
          if (!contribution) return {};
          const contributions = state.fundraisingContributions.map((row) => row.id === contributionId ? { ...row, status: 'paid' as const, paidAt: nowIso() } : row);
          const campaign = state.fundraisingCampaigns.find((row) => row.id === contribution.campaignId);
          const raised = contributions.filter((row) => row.campaignId === contribution.campaignId && row.status === 'paid').reduce((sum, row) => sum + row.amount, 0);
          return {
            fundraisingContributions: contributions,
            fundraisingCampaigns: state.fundraisingCampaigns.map((row) => row.id === campaign?.id && raised >= row.targetAmount ? { ...row, status: 'funded' as const } : row),
          };
        });
      },

      addFundraisingExpense: (campaignId, title, amount, recordedBy, receiptUrl = null) => {
        if (!title.trim() || amount <= 0) return null;
        const expense: FundraisingExpense = { id: uid(), campaignId, title: title.trim(), amount, receiptUrl, recordedBy, createdAt: nowIso() };
        set((state) => ({ fundraisingExpenses: [...state.fundraisingExpenses, expense] }));
        return expense;
      },

      closeFundraisingCampaign: (campaignId) => {
        set((state) => ({ fundraisingCampaigns: state.fundraisingCampaigns.map((row) => row.id === campaignId ? { ...row, status: 'closed', closedAt: nowIso() } : row) }));
      },

      addAdmin: (peladaId, playerId) => {
        set((state) => ({
          memberships: state.memberships.map((m) => (m.peladaId === peladaId && m.playerId === playerId ? { ...m, role: 'admin' } : m)),
        }));
      },

      removeAdmin: (peladaId, playerId) => {
        set((state) => ({
          memberships: state.memberships.map((m) => (m.peladaId === peladaId && m.playerId === playerId ? { ...m, role: 'member' } : m)),
        }));
      },

      isAdmin: (playerId, peladaId) => {
        return get().memberships.some((m) => m.peladaId === peladaId && m.playerId === playerId && m.role === 'admin' && m.active);
      },

      sendFriendRequest: (requesterId, addresseeId) => {
        if (requesterId === addresseeId) return;
        set((state) => {
          const already = state.friendships.some(
            (f) =>
              f.status !== 'declined' &&
              ((f.requesterId === requesterId && f.addresseeId === addresseeId) ||
                (f.requesterId === addresseeId && f.addresseeId === requesterId)),
          );
          if (already) return {};
          return {
            friendships: [
              ...state.friendships,
              { id: uid(), requesterId, addresseeId, status: 'pending', createdAt: nowIso(), respondedAt: null } satisfies Friendship,
            ],
          };
        });
      },

      respondFriendRequest: (friendshipId, accept) => {
        set((state) => ({
          friendships: state.friendships.map((f) =>
            f.id === friendshipId ? { ...f, status: accept ? 'accepted' : 'declined', respondedAt: nowIso() } : f,
          ),
        }));
      },

      removeFriendship: (friendshipId) => {
        set((state) => ({ friendships: state.friendships.filter((f) => f.id !== friendshipId) }));
      },

      toggleActivityLike: (activityId, playerId) => {
        set((state) => {
          const existing = state.activityLikes.find((l) => l.activityId === activityId && l.playerId === playerId);
          if (existing) {
            return { activityLikes: state.activityLikes.filter((l) => l.id !== existing.id) };
          }
          return {
            activityLikes: [...state.activityLikes, { id: uid(), activityId, playerId, createdAt: nowIso() } satisfies ActivityLike],
          };
        });
      },

      addActivityComment: (activityId, playerId, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        set((state) => ({
          activityComments: [
            ...state.activityComments,
            { id: uid(), activityId, playerId, text: trimmed, createdAt: nowIso() } satisfies ActivityComment,
          ],
        }));
      },

      removeActivityComment: (commentId) => {
        set((state) => ({ activityComments: state.activityComments.filter((c) => c.id !== commentId) }));
      },

      markNotificationsSeen: () => {
        set({ notificationsSeenAt: nowIso() });
      },

      updateCurrentPlayerProfile: (input) => {
        set((state) => ({
          players: state.players.map((p) => (p.id === state.currentPlayerId ? { ...p, ...input } : p)),
        }));
      },

      setPlayerWhatsAppOptIn: (playerId, optIn) => {
        set((state) => ({ players: state.players.map((player) => player.id === playerId ? { ...player, whatsappOptIn: optIn } : player) }));
      },

      setPlayerPhoto: (playerId, photoUrl) => {
        set((state) => ({
          players: state.players.map((p) => (p.id === playerId ? { ...p, avatarUrl: photoUrl } : p)),
        }));
      },

      setPlayerCardBackground: (playerId, cardBackgroundUrl) => {
        set((state) => ({
          players: state.players.map((p) => (p.id === playerId ? { ...p, cardBackgroundUrl } : p)),
        }));
      },

      updatePeladaInfo: (peladaId, input) => {
        set((state) => ({
          peladas: state.peladas.map((p) => (p.id === peladaId ? { ...p, ...input } : p)),
        }));
      },

      updatePeladaInvitePermissions: (peladaId, input) => {
        set((state) => ({
          peladas: state.peladas.map((p) => (p.id === peladaId ? { ...p, memberInvitePermissions: input } : p)),
        }));
      },

      setCurrentPelada: (peladaId) => {
        set({ currentPeladaId: peladaId });
      },

      joinPeladaByCode: (code, playerId) => {
        const normalized = code.trim().toUpperCase();
        const pelada = get().peladas.find((p) => p.inviteCode.toUpperCase() === normalized);
        if (!pelada) return null;

        const alreadyMember = get().memberships.some((m) => m.peladaId === pelada.id && m.playerId === playerId);
        if (!alreadyMember) {
          set((state) => ({
            memberships: [
              ...state.memberships,
              { peladaId: pelada.id, playerId, role: 'member', active: true, joinedAt: nowIso() } satisfies PeladaMembership,
            ],
          }));
        }
        set({ currentPeladaId: pelada.id });
        return pelada;
      },

      createPelada: (ownerPlayerId, input) => {
        const pelada: Pelada = {
          id: uid(),
          name: input.name,
          description: input.description,
          sportId: input.sportId,
          footballVariant: input.footballVariant,
          defaultMaxPlayers: 16,
          defaultMatchMinutes: 10,
          inviteCode: uid().toUpperCase(),
          memberInvitePermissions: { canInviteFreeAgents: false, canInviteNewMembers: false },
          createdBy: ownerPlayerId,
          createdAt: nowIso(),
        };
        const membership: PeladaMembership = {
          peladaId: pelada.id,
          playerId: ownerPlayerId,
          role: 'admin',
          active: true,
          joinedAt: nowIso(),
        };
        set((state) => ({
          peladas: [...state.peladas, pelada],
          memberships: [...state.memberships, membership],
          currentPeladaId: pelada.id,
        }));
        return pelada;
      },

      renewPremium: (playerId) => {
        set((state) => ({
          players: state.players.map((p) =>
            p.id === playerId
              ? { ...p, premiumSince: p.premiumSince ?? nowIso(), premiumUntil: addPremiumPeriod(), premiumAutoRenew: true }
              : p,
          ),
        }));
      },

      cancelPremiumAutoRenew: (playerId) => {
        // Assinatura via loja: cancelar só desliga a renovação automática. O benefício
        // continua valendo até premiumUntil (igual acontece de verdade na App Store/Play).
        set((state) => ({
          players: state.players.map((p) => (p.id === playerId ? { ...p, premiumAutoRenew: false } : p)),
        }));
      },

      setGameFieldCost: (gameId, fieldCost) => {
        set((state) => ({ games: state.games.map((g) => (g.id === gameId ? { ...g, fieldCost } : g)) }));
      },

      setGameMatchMinutes: (gameId, matchMinutes) => {
        set((state) => ({ games: state.games.map((g) => (g.id === gameId ? { ...g, matchMinutes } : g)) }));
      },

      setPaymentStatus: (gameId, playerId, status, method) => {
        set((state) => {
          const existing = state.payments.find((p) => p.gameId === gameId && p.playerId === playerId);
          const paidAt = status === 'paid' ? nowIso() : null;
          if (existing) {
            return {
              payments: state.payments.map((p) =>
                p.id === existing.id ? { ...p, status, method: method ?? p.method, paidAt, paidByPlayerId: status === 'paid' ? p.paidByPlayerId : null } : p,
              ),
            };
          }
          return {
            payments: [
              ...state.payments,
              { id: uid(), gameId, playerId, status, method: method ?? null, paidAt, paidByPlayerId: null } satisfies Payment,
            ],
          };
        });
      },

      payForPlayers: (gameId, payerPlayerId, playerIds, method) => {
        const paidAt = nowIso();
        set((state) => {
          const targets = new Set(playerIds);
          const untouched = state.payments.filter((p) => !(p.gameId === gameId && targets.has(p.playerId)));
          const updated = playerIds.map((playerId) => {
            const existing = state.payments.find((p) => p.gameId === gameId && p.playerId === playerId);
            return {
              id: existing?.id ?? uid(),
              gameId,
              playerId,
              status: 'paid' as PaymentStatus,
              method,
              paidAt,
              paidByPlayerId: payerPlayerId === playerId ? null : payerPlayerId,
            } satisfies Payment;
          });
          return { payments: [...untouched, ...updated] };
        });
      },
    }),
    {
      name: 'pelada-app-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        players: state.players,
        peladas: state.peladas,
        memberships: state.memberships,
        fields: state.fields,
        schedules: state.schedules,
        games: state.games,
        attendances: state.attendances,
        teams: state.teams,
        teamPlayers: state.teamPlayers,
        ratings: state.ratings,
        punishments: state.punishments,
        payments: state.payments,
        matchTurns: state.matchTurns,
        goals: state.goals,
        matchQueue: state.matchQueue,
        waitingPlayers: state.waitingPlayers,
        playerFatigue: state.playerFatigue,
        friendships: state.friendships,
        activityLikes: state.activityLikes,
        activityComments: state.activityComments,
        notificationsSeenAt: state.notificationsSeenAt,
        freeAgentInvites: state.freeAgentInvites,
        establishments: state.establishments,
        championships: state.championships,
        championshipBudgets: state.championshipBudgets,
        championshipTeams: state.championshipTeams,
        championshipTeamPlayers: state.championshipTeamPlayers,
        championshipMatches: state.championshipMatches,
        championshipGoals: state.championshipGoals,
        fieldBookings: state.fieldBookings,
        fieldAvailabilities: state.fieldAvailabilities,
        fieldPromotions: state.fieldPromotions,
        bookingDeposits: state.bookingDeposits,
        scheduleFieldPreferences: state.scheduleFieldPreferences,
        gameBookingRequests: state.gameBookingRequests,
        teamAvailabilityPolls: state.teamAvailabilityPolls,
        teamAvailabilityPollOptions: state.teamAvailabilityPollOptions,
        teamAvailabilityPollVotes: state.teamAvailabilityPollVotes,
        whatsAppDeliveries: state.whatsAppDeliveries,
        fundraisingCampaigns: state.fundraisingCampaigns,
        fundraisingContributions: state.fundraisingContributions,
        fundraisingExpenses: state.fundraisingExpenses,
        teamChallenges: state.teamChallenges,
        friendlyMatches: state.friendlyMatches,
        friendlyMatchGoals: state.friendlyMatchGoals,
        playerDuels: state.playerDuels,
        establishmentStaff: state.establishmentStaff,
        productCategories: state.productCategories,
        products: state.products,
        serviceTabs: state.serviceTabs,
        tabParticipants: state.tabParticipants,
        serviceOrders: state.serviceOrders,
        serviceOrderItems: state.serviceOrderItems,
        orderItemShares: state.orderItemShares,
        salePayments: state.salePayments,
        salePaymentAllocations: state.salePaymentAllocations,
        salePaymentIntents: state.salePaymentIntents,
        paymentGatewayConnections: state.paymentGatewayConnections,
        cashShifts: state.cashShifts,
        coaches: state.coaches,
        classPrograms: state.classPrograms,
        classSessions: state.classSessions,
        classEnrollments: state.classEnrollments,
        classAttendances: state.classAttendances,
        makeupCredits: state.makeupCredits,
        currentPlayerId: state.currentPlayerId,
        currentPeladaId: state.currentPeladaId,
      }),
    },
  ),
);
