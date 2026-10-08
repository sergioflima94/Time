import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type {
  AuditEvent,
  CheckInPass,
  CommercialPlan,
  CommercialSubscription,
  ModerationReason,
  ModerationReport,
  PaymentSettlement,
  ReferralCampaign,
  ReferralRedemption,
  ReliabilityEvent,
  SeasonStanding,
  SportSeason,
  SyncMutation,
} from '@/types/pro';
import { createUuid } from '@/lib/uuid';
import { useAppStore } from '@/store/useAppStore';

const now = () => new Date().toISOString();
const uid = createUuid;

const PLANS: CommercialPlan[] = [
  { id: '11111111-1111-4111-8111-111111111111', audience: 'player', name: 'Jogador Premium', monthlyPrice: 14.9, benefits: ['Sem anúncios', 'Carta e retrospectivas Premium', 'Histórico avançado'], highlighted: false, active: true },
  { id: '22222222-2222-4222-8222-222222222222', audience: 'team', name: 'Time Pro', monthlyPrice: 39.9, benefits: ['WhatsApp e enquetes automáticas', 'Temporadas e rankings', 'Relatórios do time'], highlighted: true, active: true },
  { id: '33333333-3333-4333-8333-333333333333', audience: 'establishment', name: 'Estabelecimento Pro', monthlyPrice: 99.9, benefits: ['Agenda e caixa integrados', 'Inteligência de ocupação', 'CRM, estoque e equipe'], highlighted: true, active: true },
];

interface ProState {
  checkInPasses: CheckInPass[];
  reliabilityEvents: ReliabilityEvent[];
  seasons: SportSeason[];
  standings: SeasonStanding[];
  plans: CommercialPlan[];
  subscriptions: CommercialSubscription[];
  referrals: ReferralCampaign[];
  referralRedemptions: ReferralRedemption[];
  moderationReports: ModerationReport[];
  auditEvents: AuditEvent[];
  syncQueue: SyncMutation[];
  settlements: PaymentSettlement[];
  issueCheckInPass: (gameId: string, playerId: string) => CheckInPass;
  redeemCheckInPass: (gameId: string, playerId: string, token: string, actorPlayerId: string) => { ok: boolean; message: string };
  recordReliability: (input: Omit<ReliabilityEvent, 'id' | 'createdAt'>) => void;
  createSeason: (peladaId: string, sportId: string, name: string, playerIds: string[]) => string;
  simulateSeasonRound: (seasonId: string) => void;
  subscribe: (planId: string, subscriberId: string) => void;
  createReferral: (ownerPlayerId: string) => ReferralCampaign;
  redeemReferral: (code: string, playerId: string) => { ok: boolean; message: string };
  createModerationReport: (reporterPlayerId: string, targetType: ModerationReport['targetType'], targetId: string, reason: ModerationReason, details?: string) => void;
  resolveModerationReport: (reportId: string, actorPlayerId: string) => void;
  enqueueSync: (aggregate: string, aggregateId: string, operation: string, payload: Record<string, unknown>) => void;
  updateSyncMutation: (id: string, patch: Partial<Pick<SyncMutation, 'status' | 'attempts' | 'lastError' | 'syncedAt'>>) => void;
}

function audit(actorPlayerId: string | null, entityType: AuditEvent['entityType'], entityId: string, action: string, summary: string): AuditEvent {
  return { id: uid(), actorPlayerId, entityType, entityId, action, summary, metadata: {}, createdAt: now() };
}

export const useProStore = create<ProState>()(
  persist(
    (set, get) => ({
      checkInPasses: [],
      reliabilityEvents: [
        { id: 'rel1', entityType: 'player', entityId: 'p1', gameId: 'g0', kind: 'fair_play', points: 6, note: 'Ajudou a organizar o último jogo', createdAt: now() },
        { id: 'rel2', entityType: 'player', entityId: 'p9', gameId: 'g0', kind: 'no_show', points: -18, note: 'Confirmou e não compareceu', createdAt: now() },
      ],
      seasons: [{ id: 'season1', peladaId: 'pel1', name: 'Temporada Primavera 2026', sportId: 'futebol', startsAt: '2026-09-01', endsAt: null, status: 'active', pointsWin: 3, pointsDraw: 1, pointsParticipation: 1, createdAt: now() }],
      standings: [
        { seasonId: 'season1', playerId: 'p1', games: 6, wins: 4, draws: 1, losses: 1, scored: 8, assists: 4, fairPlay: 5, points: 18 },
        { seasonId: 'season1', playerId: 'p2', games: 6, wins: 3, draws: 2, losses: 1, scored: 5, assists: 6, fairPlay: 6, points: 17 },
        { seasonId: 'season1', playerId: 'p3', games: 5, wins: 3, draws: 0, losses: 2, scored: 3, assists: 2, fairPlay: 5, points: 14 },
      ],
      plans: PLANS,
      subscriptions: [],
      referrals: [{ id: 'ref1', ownerPlayerId: 'p1', code: 'BORA-P1', rewardCredits: 10, maxUses: 20, uses: 3, active: true, createdAt: now() }],
      referralRedemptions: [],
      moderationReports: [],
      auditEvents: [audit('p1', 'team', 'pel1', 'team.created', 'Time criado e pronto para receber jogadores')],
      syncQueue: [],
      settlements: [
        { id: 'settle1', establishmentId: 'est2', sourceType: 'sale', sourceId: 'sp1', grossCents: 2000, providerFeeCents: 0, platformFeeCents: 100, netCents: 1900, status: 'settled', settledAt: now() },
      ],

      issueCheckInPass: (gameId, playerId) => {
        const existing = get().checkInPasses.find((pass) => pass.gameId === gameId && pass.playerId === playerId);
        if (existing) return existing;
        const pass: CheckInPass = { id: uid(), gameId, playerId, token: uid().replace('-', '').toUpperCase(), issuedAt: now(), redeemedAt: null, redeemedBy: null };
        set((state) => ({ checkInPasses: [...state.checkInPasses, pass] }));
        return pass;
      },
      redeemCheckInPass: (gameId, playerId, token, actorPlayerId) => {
        const pass = get().checkInPasses.find((row) => row.gameId === gameId && row.playerId === playerId && row.token === token);
        if (!pass) return { ok: false, message: 'QR Code inválido para este jogo.' };
        if (pass.redeemedAt) return { ok: false, message: 'Este ingresso já foi utilizado.' };
        const redeemedAt = now();
        set((state) => ({
          checkInPasses: state.checkInPasses.map((row) => row.id === pass.id ? { ...row, redeemedAt, redeemedBy: actorPlayerId } : row),
          reliabilityEvents: [...state.reliabilityEvents, { id: uid(), entityType: 'player', entityId: playerId, gameId, kind: 'checked_in', points: 2, note: 'Check-in confirmado por QR Code', createdAt: redeemedAt }],
          auditEvents: [...state.auditEvents, audit(actorPlayerId, 'game', gameId, 'checkin.redeemed', `Check-in confirmado para ${playerId}`)],
        }));
        get().enqueueSync('game_checkin', pass.id, 'upsert', { gameId, playerId, token, redeemedAt, redeemedBy: actorPlayerId });
        return { ok: true, message: 'Check-in confirmado.' };
      },
      recordReliability: (input) => set((state) => ({ reliabilityEvents: [...state.reliabilityEvents, { ...input, id: uid(), createdAt: now() }] })),
      createSeason: (peladaId, sportId, name, playerIds) => {
        const id = uid();
        const season: SportSeason = { id, peladaId, sportId, name: name.trim() || 'Nova temporada', startsAt: now().slice(0, 10), endsAt: null, status: 'active', pointsWin: 3, pointsDraw: 1, pointsParticipation: 1, createdAt: now() };
        const rows = playerIds.map((playerId) => ({ seasonId: id, playerId, games: 0, wins: 0, draws: 0, losses: 0, scored: 0, assists: 0, fairPlay: 0, points: 0 }));
        set((state) => ({ seasons: [...state.seasons, season], standings: [...state.standings, ...rows], auditEvents: [...state.auditEvents, audit(useAppStore.getState().currentPlayerId, 'team', peladaId, 'season.created', `Temporada ${season.name} criada`)] }));
        get().enqueueSync('season', id, 'insert', season as unknown as Record<string, unknown>);
        return id;
      },
      simulateSeasonRound: (seasonId) => set((state) => ({
        standings: state.standings.map((row, index) => row.seasonId !== seasonId ? row : index % 3 === 0
          ? { ...row, games: row.games + 1, wins: row.wins + 1, scored: row.scored + 2, points: row.points + 4 }
          : index % 3 === 1
            ? { ...row, games: row.games + 1, draws: row.draws + 1, scored: row.scored + 1, points: row.points + 2 }
            : { ...row, games: row.games + 1, losses: row.losses + 1, points: row.points + 1 }),
        auditEvents: [...state.auditEvents, audit(useAppStore.getState().currentPlayerId, 'team', seasonId, 'season.round_recorded', 'Rodada registrada na classificação')],
      })),
      subscribe: (planId, subscriberId) => {
        const period = new Date(); period.setMonth(period.getMonth() + 1);
        set((state) => ({ subscriptions: [...state.subscriptions.filter((row) => !(row.planId === planId && row.subscriberId === subscriberId)), { id: uid(), planId, subscriberId, status: 'trial', currentPeriodEnd: period.toISOString(), createdAt: now() }], auditEvents: [...state.auditEvents, audit(useAppStore.getState().currentPlayerId, 'payment', subscriberId, 'subscription.started', `Assinatura ${planId} iniciada em demonstração`)] }));
      },
      createReferral: (ownerPlayerId) => {
        const existing = get().referrals.find((row) => row.ownerPlayerId === ownerPlayerId && row.active);
        if (existing) return existing;
        const campaign: ReferralCampaign = { id: uid(), ownerPlayerId, code: `BORA-${ownerPlayerId}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase(), rewardCredits: 10, maxUses: 20, uses: 0, active: true, createdAt: now() };
        set((state) => ({ referrals: [...state.referrals, campaign] }));
        return campaign;
      },
      redeemReferral: (code, playerId) => {
        const campaign = get().referrals.find((row) => row.code.toUpperCase() === code.toUpperCase() && row.active);
        if (!campaign) return { ok: false, message: 'Convite inválido ou encerrado.' };
        if (campaign.ownerPlayerId === playerId) return { ok: false, message: 'Você não pode usar o próprio convite.' };
        if (get().referralRedemptions.some((row) => row.referredPlayerId === playerId)) return { ok: false, message: 'Você já utilizou uma indicação.' };
        if (campaign.maxUses !== null && campaign.uses >= campaign.maxUses) return { ok: false, message: 'Este convite atingiu o limite.' };
        set((state) => ({
          referrals: state.referrals.map((row) => row.id === campaign.id ? { ...row, uses: row.uses + 1 } : row),
          referralRedemptions: [...state.referralRedemptions, { id: uid(), campaignId: campaign.id, referredPlayerId: playerId, status: 'pending', createdAt: now() }],
        }));
        return { ok: true, message: 'Indicação registrada. O bônus será liberado após o primeiro jogo pago.' };
      },
      createModerationReport: (reporterPlayerId, targetType, targetId, reason, details) => set((state) => ({ moderationReports: [...state.moderationReports, { id: uid(), reporterPlayerId, targetType, targetId, reason, details: details?.trim() || null, status: 'open', createdAt: now(), resolvedAt: null }], auditEvents: [...state.auditEvents, audit(reporterPlayerId, targetType, targetId, 'moderation.reported', 'Conteúdo enviado para moderação')] })),
      resolveModerationReport: (reportId, actorPlayerId) => set((state) => ({ moderationReports: state.moderationReports.map((row) => row.id === reportId ? { ...row, status: 'resolved', resolvedAt: now() } : row), auditEvents: [...state.auditEvents, audit(actorPlayerId, 'player', reportId, 'moderation.resolved', 'Denúncia analisada e encerrada')] })),
      enqueueSync: (aggregate, aggregateId, operation, payload) => set((state) => ({ syncQueue: [...state.syncQueue, { id: uid(), aggregate, aggregateId, operation, payload, status: 'pending', attempts: 0, lastError: null, createdAt: now(), syncedAt: null }] })),
      updateSyncMutation: (id, patch) => set((state) => ({ syncQueue: state.syncQueue.map((row) => row.id === id ? { ...row, ...patch } : row) })),
    }),
    { name: 'pelada-pro-storage', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
