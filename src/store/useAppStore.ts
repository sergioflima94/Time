import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  CURRENT_PLAYER_ID,
  MOCK_ATTENDANCES,
  MOCK_ESTABLISHMENTS,
  MOCK_FIELDS,
  MOCK_GAMES,
  MOCK_GOALS,
  MOCK_MATCH_TURNS,
  MOCK_MEMBERSHIPS,
  MOCK_PAYMENTS,
  MOCK_PELADA,
  MOCK_PELADAS,
  MOCK_PLAYERS,
  MOCK_PUNISHMENTS,
  MOCK_RATINGS,
  MOCK_SCHEDULES,
  MOCK_TEAMS,
  MOCK_TEAM_PLAYERS,
} from '@/lib/mockData';
import { addPremiumPeriod } from '@/lib/premium';
import { buildPunishment } from '@/lib/punishment';
import type {
  Attendance,
  AttendanceStatus,
  AvailabilitySlot,
  DrawMethod,
  Establishment,
  EstablishmentPayoutMethod,
  Field,
  FreeAgentInvite,
  Game,
  GameStatus,
  GeoPoint,
  Goal,
  MatchTurn,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Pelada,
  PeladaMembership,
  Player,
  Punishment,
  PunishmentType,
  Rating,
  RecurrenceType,
  Schedule,
  Team,
  TeamPlayer,
} from '@/types';

const uid = () => Math.random().toString(36).slice(2, 10);
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
  freeAgentInvites: FreeAgentInvite[];
  establishments: Establishment[];

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

  // placar ao vivo / gols
  startMatchTurn: (gameId: string, teamAId: string, teamBId: string) => MatchTurn;
  endMatchTurn: (matchTurnId: string, winnerTeamId: string | null) => void;
  registerGoal: (gameId: string, matchTurnId: string, teamId: string, scorerPlayerId: string | null) => void;
  undoLastGoal: (matchTurnId: string) => void;
  setGameGoalLimit: (gameId: string, matchGoalLimit: number | null) => void;

  // avaliações
  submitRating: (rating: Omit<Rating, 'id' | 'createdAt' | 'overall'>) => void;

  // punições
  registerPunishment: (peladaId: string, playerId: string, gameId: string, type: PunishmentType) => void;

  // admin: campos, agenda, vagas
  addField: (peladaId: string, name: string, address: string, notes: string) => Field;
  /** Vincula um campo a um estabelecimento cadastrado (via código de acesso). false = código não encontrado. */
  linkFieldToEstablishment: (fieldId: string, accessCode: string) => boolean;
  unlinkFieldEstablishment: (fieldId: string) => void;
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

  updateCurrentPlayerProfile: (input: { name: string; nickname: string | null; preferredPosition: Player['preferredPosition']; phone: string | null }) => void;
  setPlayerPhoto: (playerId: string, photoUrl: string) => void;
  setPlayerCardBackground: (playerId: string, cardBackgroundUrl: string | null) => void;
  updatePeladaInfo: (peladaId: string, input: { name: string; description: string | null }) => void;
  setCurrentPelada: (peladaId: string) => void;
  /** Entra numa pelada usando o código de convite. Retorna a pelada encontrada, ou null se o código não existir. */
  joinPeladaByCode: (code: string, playerId: string) => Pelada | null;

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
      freeAgentInvites: [],
      establishments: MOCK_ESTABLISHMENTS,

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
        const guest: Player = {
          id: uid(),
          authUserId: null,
          name: name.trim() || 'Convidado',
          nickname: null,
          avatarUrl: null,
          phone: null,
          preferredPosition: 'line',
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
          createdAt: nowIso(),
        };
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
          games: state.games.map((g) => (g.id === gameId ? { ...g, status: 'teams_drawn' } : g)),
          matchQueue: { ...state.matchQueue, [gameId]: teams.map((t) => t.id) },
        }));
      },

      setGameStatus: (gameId, status) => {
        set((state) => ({ games: state.games.map((g) => (g.id === gameId ? { ...g, status } : g)) }));
      },

      setMatchQueue: (gameId, queue) => {
        set((state) => ({ matchQueue: { ...state.matchQueue, [gameId]: queue } }));
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
        set((state) => ({
          matchTurns: state.matchTurns.map((t) => {
            if (t.id !== matchTurnId) return t;
            const durationSeconds = t.startedAt ? Math.round((Date.now() - new Date(t.startedAt).getTime()) / 1000) : 0;
            return { ...t, endedAt: nowIso(), durationSeconds, winnerTeamId };
          }),
        }));
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
        const field: Field = {
          id: uid(),
          peladaId,
          name,
          address: address || null,
          notes: notes || null,
          establishmentId: null,
          createdBy: get().currentPlayerId,
        };
        set((state) => ({ fields: [...state.fields, field] }));
        return field;
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
        freeAgentInvites: state.freeAgentInvites,
        establishments: state.establishments,
        currentPlayerId: state.currentPlayerId,
        currentPeladaId: state.currentPeladaId,
      }),
    },
  ),
);
