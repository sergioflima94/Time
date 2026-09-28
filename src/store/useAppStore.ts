import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  CURRENT_PLAYER_ID,
  MOCK_ATTENDANCES,
  MOCK_CHAMPIONSHIP_GOALS,
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
  MOCK_FIELDS,
  MOCK_FRIENDSHIPS,
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
  MOCK_PUNISHMENTS,
  MOCK_RATINGS,
  MOCK_SCHEDULES,
  MOCK_SALE_PAYMENTS,
  MOCK_SERVICE_ORDER_ITEMS,
  MOCK_SERVICE_ORDERS,
  MOCK_SERVICE_TABS,
  MOCK_TAB_PARTICIPANTS,
  MOCK_TEAMS,
  MOCK_TEAM_PLAYERS,
} from '@/lib/mockData';
import { advanceWinner, generateKnockoutFixtures, generateRoundRobinFixtures } from '@/lib/championship';
import { findBookingConflicts } from '@/lib/fieldBooking';
import { addPremiumPeriod } from '@/lib/premium';
import { buildPunishment } from '@/lib/punishment';
import { pickNextChallenger, teamColor, teamName, type MatchResult, type WaitingEntry } from '@/lib/teamDraft';
import type {
  ActivityComment,
  ActivityLike,
  Attendance,
  AttendanceStatus,
  AvailabilitySlot,
  CashShift,
  ClassAttendance,
  ClassAttendanceStatus,
  ClassEnrollment,
  ClassFormat,
  ClassProgram,
  ClassSession,
  Coach,
  Championship,
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
  FieldBooking,
  FieldBookingRecurrence,
  Friendship,
  FreeAgentInvite,
  FriendlyMatch,
  FriendlyMatchGoal,
  Game,
  GameStatus,
  GeoPoint,
  Goal,
  MatchTurn,
  MakeupCredit,
  Payment,
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
  SalePayment,
  ServiceOrder,
  ServiceOrderItem,
  ServiceTab,
  ServiceTabStatus,
  TabParticipant,
  Team,
  TeamChallenge,
  TeamPlayer,
  WaitingPlayer,
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
  championshipTeams: ChampionshipTeam[];
  championshipTeamPlayers: ChampionshipTeamPlayer[];
  championshipMatches: ChampionshipMatch[];
  championshipGoals: ChampionshipGoal[];
  fieldBookings: FieldBooking[];
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
  salePayments: SalePayment[];
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
    drawMethod: DrawMethod;
    defaultFieldCost: number | null;
    matchGoalLimit: number | null;
  }) => Schedule;
  addGameFromSchedule: (scheduleId: string, scheduledAt: string) => Game;
  updateGameMaxPlayers: (gameId: string, maxPlayers: number) => void;
  setDrawMethod: (gameId: string, method: DrawMethod) => void;
  promoteFromWaitlist: (gameId: string) => void;

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
  setOrderItemStatus: (itemId: string, status: ServiceOrderItem['status'], cancellationReason?: string) => void;
  setServiceTabStatus: (tabId: string, status: ServiceTabStatus) => void;
  payServiceTab: (tabId: string, input: { payerPlayerId: string | null; payerName: string; amount: number; method: PaymentMethod }) => void;
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
      championshipTeams: MOCK_CHAMPIONSHIP_TEAMS,
      championshipTeamPlayers: MOCK_CHAMPIONSHIP_TEAM_PLAYERS,
      championshipMatches: MOCK_CHAMPIONSHIP_MATCHES,
      championshipGoals: MOCK_CHAMPIONSHIP_GOALS,
      fieldBookings: MOCK_FIELD_BOOKINGS,
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
      salePayments: MOCK_SALE_PAYMENTS,
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
        set((state) => ({
          serviceOrders: [...state.serviceOrders, order],
          serviceOrderItems: [...state.serviceOrderItems, ...orderItems],
          products: state.products.map((product) => {
            const quantity = purchased.get(product.id);
            return quantity && product.stockQuantity !== null
              ? { ...product, stockQuantity: Math.max(0, product.stockQuantity - quantity) }
              : product;
          }),
        }));
        return order;
      },

      setOrderItemStatus: (itemId, status, cancellationReason) => {
        set((state) => {
          const target = state.serviceOrderItems.find((item) => item.id === itemId);
          if (!target) return {};
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
          const nextPaid = alreadyPaid + amount;
          const status: ServiceTabStatus = nextPaid + 0.001 >= gross ? 'paid' : 'partially_paid';
          return {
            salePayments: [...state.salePayments, payment],
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
          return { salePayments: payments, serviceTabs: state.serviceTabs.map((tab) => (tab.id === payment.tabId ? { ...tab, status, closedAt: null } : tab)) };
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
        const gameConflict = state.games.some((game) => game.fieldId === program.fieldId && game.status !== 'cancelled' && overlaps(new Date(game.scheduledAt), new Date(new Date(game.scheduledAt).getTime() + Math.max(60, game.matchMinutes) * 60_000)));
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
          drawMethod: input.drawMethod,
          defaultFieldCost: input.defaultFieldCost,
          matchGoalLimit: input.matchGoalLimit,
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
        championshipTeams: state.championshipTeams,
        championshipTeamPlayers: state.championshipTeamPlayers,
        championshipMatches: state.championshipMatches,
        championshipGoals: state.championshipGoals,
        fieldBookings: state.fieldBookings,
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
        salePayments: state.salePayments,
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
