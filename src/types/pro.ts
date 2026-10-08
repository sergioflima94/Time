export type ProEntityType = 'player' | 'team' | 'establishment' | 'game' | 'payment';

export type ReliabilityEventKind = 'checked_in' | 'late' | 'late_cancel' | 'no_show' | 'fair_play';

export interface ReliabilityEvent {
  id: string;
  entityType: Extract<ProEntityType, 'player' | 'team' | 'establishment'>;
  entityId: string;
  gameId: string | null;
  kind: ReliabilityEventKind;
  points: number;
  note: string | null;
  createdAt: string;
}
export interface CheckInPass {
  id: string;
  gameId: string;
  playerId: string;
  token: string;
  issuedAt: string;
  redeemedAt: string | null;
  redeemedBy: string | null;
}

export type SeasonStatus = 'draft' | 'active' | 'finished';

export interface SportSeason {
  id: string;
  peladaId: string;
  name: string;
  sportId: string;
  startsAt: string;
  endsAt: string | null;
  status: SeasonStatus;
  pointsWin: number;
  pointsDraw: number;
  pointsParticipation: number;
  createdAt: string;
}

export interface SeasonStanding {
  seasonId: string;
  playerId: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  scored: number;
  assists: number;
  fairPlay: number;
  points: number;
}

export type CommercialAudience = 'player' | 'team' | 'establishment';

export interface CommercialPlan {
  id: string;
  audience: CommercialAudience;
  name: string;
  monthlyPrice: number;
  benefits: string[];
  highlighted: boolean;
  active: boolean;
}

export interface CommercialSubscription {
  id: string;
  planId: string;
  subscriberId: string;
  status: 'trial' | 'active' | 'past_due' | 'cancelled';
  currentPeriodEnd: string;
  createdAt: string;
}

export interface ReferralCampaign {
  id: string;
  ownerPlayerId: string;
  code: string;
  rewardCredits: number;
  maxUses: number | null;
  uses: number;
  active: boolean;
  createdAt: string;
}

export interface ReferralRedemption {
  id: string;
  campaignId: string;
  referredPlayerId: string;
  status: 'pending' | 'qualified' | 'rewarded';
  createdAt: string;
}

export type ModerationReason = 'harassment' | 'fraud' | 'unsafe_content' | 'spam' | 'other';

export interface ModerationReport {
  id: string;
  reporterPlayerId: string;
  targetType: Extract<ProEntityType, 'player' | 'team' | 'establishment'>;
  targetId: string;
  reason: ModerationReason;
  details: string | null;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt: string | null;
}

export interface AuditEvent {
  id: string;
  actorPlayerId: string | null;
  entityType: ProEntityType;
  entityId: string;
  action: string;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface PaymentSettlement {
  id: string;
  establishmentId: string;
  sourceType: 'sale' | 'booking' | 'fundraising' | 'subscription';
  sourceId: string;
  grossCents: number;
  providerFeeCents: number;
  platformFeeCents: number;
  netCents: number;
  status: 'pending' | 'settled' | 'refunded';
  settledAt: string | null;
}

export type SyncMutationStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface SyncMutation {
  id: string;
  aggregate: string;
  aggregateId: string;
  operation: string;
  payload: Record<string, unknown>;
  status: SyncMutationStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  syncedAt: string | null;
}

export type ProDomainVersion = 1;
