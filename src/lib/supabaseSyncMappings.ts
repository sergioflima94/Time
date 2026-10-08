export type StoreName = 'app' | 'growth' | 'pro';

export interface TableSpec {
  store: StoreName;
  stateKey: string;
  table: string;
  keyFields?: string[];
  omit?: string[];
  realtimeParents?: string[];
  toRow?: (value: Record<string, any>, storeState: Record<string, any>) => Record<string, any>;
  fromRow?: (row: Record<string, any>) => Record<string, any>;
}

export function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function genericToRow(
  value: Record<string, any>,
  omit: string[] = [],
): Record<string, any> {
  const omitted = new Set(omit);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => !omitted.has(key) && item !== undefined)
      .map(([key, item]) => [camelToSnake(key), item]),
  );
}

export function genericFromRow(row: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [snakeToCamel(key), value]),
  );
}

const app = (stateKey: string, table: string, options: Partial<TableSpec> = {}): TableSpec => ({
  store: 'app',
  stateKey,
  table,
  ...options,
});
const growth = (stateKey: string, table: string, options: Partial<TableSpec> = {}): TableSpec => ({
  store: 'growth',
  stateKey,
  table,
  ...options,
});
const pro = (stateKey: string, table: string, options: Partial<TableSpec> = {}): TableSpec => ({
  store: 'pro',
  stateKey,
  table,
  ...options,
});

const playerSpec = app('players', 'players', {
  toRow: (value) => {
    const row = genericToRow(value, ['location']);
    row.location_lat = value.location?.latitude ?? null;
    row.location_lng = value.location?.longitude ?? null;
    return row;
  },
  fromRow: (row) => {
    const value = genericFromRow(row);
    value.location = row.location_lat === null || row.location_lng === null
      ? null
      : { latitude: row.location_lat, longitude: row.location_lng };
    delete value.locationLat;
    delete value.locationLng;
    return value;
  },
});

const peladaSpec = app('peladas', 'peladas', {
  toRow: (value) => {
    const row = genericToRow(value, ['memberInvitePermissions']);
    row.member_can_invite_free_agents = value.memberInvitePermissions?.canInviteFreeAgents ?? false;
    row.member_can_invite_new_members = value.memberInvitePermissions?.canInviteNewMembers ?? false;
    return row;
  },
  fromRow: (row) => {
    const value = genericFromRow(row);
    value.memberInvitePermissions = {
      canInviteFreeAgents: row.member_can_invite_free_agents,
      canInviteNewMembers: row.member_can_invite_new_members,
    };
    delete value.memberCanInviteFreeAgents;
    delete value.memberCanInviteNewMembers;
    return value;
  },
});

const fieldSpec = app('fields', 'fields', {
  toRow: (value) => {
    const row = genericToRow(value, ['location']);
    row.latitude = value.location?.latitude ?? null;
    row.longitude = value.location?.longitude ?? null;
    return row;
  },
  fromRow: (row) => {
    const value = genericFromRow(row);
    value.location = row.latitude === null || row.longitude === null
      ? null
      : { latitude: row.latitude, longitude: row.longitude };
    delete value.latitude;
    delete value.longitude;
    return value;
  },
});

const scoreboardSpec = growth('scoreboards', 'multi_sport_scoreboards', {
  omit: ['segments'],
  toRow: (value, state) => {
    const row = genericToRow(value, ['segments', 'unit']);
    row.score_unit = value.unit;
    row.created_by = value.createdBy ?? state.currentPlayerId;
    row.game_id = value.gameId ?? null;
    return row;
  },
  fromRow: (row) => {
    const value = genericFromRow(row);
    value.unit = row.score_unit;
    value.segments = [];
    delete value.scoreUnit;
    return value;
  },
});

const chatChannelSpec = growth('chatChannels', 'chat_channels', {
  omit: ['participantIds', 'unreadCount'],
  toRow: (value, state) => {
    const row = genericToRow(value, ['participantIds', 'unreadCount']);
    row.created_by = value.createdBy ?? state.currentPlayerId;
    return row;
  },
  fromRow: (row) => ({
    ...genericFromRow(row),
    participantIds: [],
    unreadCount: 0,
  }),
});

const waiverSpec = growth('waivers', 'digital_waivers', {
  omit: ['acceptedPlayerIds'],
  toRow: (value, state) => {
    const row = genericToRow(value, ['acceptedPlayerIds']);
    row.body = value.body ?? value.title;
    row.version = value.version ?? 1;
    row.created_by = value.createdBy ?? state.currentPlayerId;
    return row;
  },
  fromRow: (row) => ({
    ...genericFromRow(row),
    acceptedPlayerIds: [],
  }),
});

const openSlotSpec = growth('openSlotOffers', 'open_slot_offers', {
  omit: ['fieldName'],
});

const checkInSpec = pro('checkInPasses', 'game_checkin_passes', {
  omit: ['token'],
  toRow: (value) => genericToRow(value, ['token']),
  fromRow: (row) => ({
    ...genericFromRow(row),
    token: '',
  }),
});

const subscriptionSpec = pro('subscriptions', 'commercial_subscriptions', {
  omit: ['subscriberId'],
  toRow: (value, state) => {
    const row = genericToRow(value, ['subscriberId']);
    const audience = state.plans?.find((plan: Record<string, any>) => plan.id === value.planId)?.audience;
    row.subscriber_player_id = audience === 'player' ? value.subscriberId : null;
    row.pelada_id = audience === 'team' ? value.subscriberId : null;
    row.establishment_id = audience === 'establishment' ? value.subscriberId : null;
    return row;
  },
  fromRow: (row) => ({
    ...genericFromRow(row),
    subscriberId: row.subscriber_player_id ?? row.pelada_id ?? row.establishment_id,
  }),
});

const clientMutationSpec = pro('syncQueue', 'client_mutations', {
  toRow: (value) => ({
    id: value.id,
    aggregate: value.aggregate,
    aggregate_id: value.aggregateId,
    operation: value.operation,
    payload: value.payload,
    client_created_at: value.createdAt,
  }),
  fromRow: (row) => ({
    id: row.id,
    aggregate: row.aggregate,
    aggregateId: row.aggregate_id,
    operation: row.operation,
    payload: row.payload,
    status: row.processing_error ? 'failed' : row.processed_at ? 'synced' : 'pending',
    attempts: 0,
    lastError: row.processing_error,
    createdAt: row.client_created_at,
    syncedAt: row.processed_at,
  }),
});

export const TABLE_SPECS: TableSpec[] = [
  playerSpec,
  peladaSpec,
  app('memberships', 'pelada_memberships', { keyFields: ['peladaId', 'playerId'] }),
  fieldSpec,
  app('schedules', 'schedules'),
  app('games', 'games'),
  app('attendances', 'attendances'),
  app('teams', 'teams'),
  app('teamPlayers', 'team_players', { keyFields: ['teamId', 'playerId'] }),
  app('ratings', 'ratings'),
  app('banterVotes', 'banter_votes'),
  app('punishments', 'punishments'),
  app('payments', 'payments'),
  app('matchTurns', 'match_turns'),
  app('goals', 'goals'),
  app('waitingPlayers', 'waiting_players', { keyFields: ['gameId', 'playerId'] }),
  app('playerFatigue', 'player_fatigue'),
  app('friendships', 'friendships'),
  app('activityLikes', 'activity_likes'),
  app('activityComments', 'activity_comments'),
  app('freeAgentInvites', 'free_agent_invites'),
  app('establishments', 'establishments'),
  app('championships', 'championships'),
  app('championshipBudgets', 'championship_budgets'),
  app('championshipTeams', 'championship_teams'),
  app('championshipTeamPlayers', 'championship_team_players', { keyFields: ['championshipTeamId', 'playerId'] }),
  app('championshipMatches', 'championship_matches'),
  app('championshipGoals', 'championship_goals'),
  app('fieldBookings', 'field_bookings'),
  app('fieldAvailabilities', 'field_availabilities'),
  app('fieldPromotions', 'field_promotions'),
  app('bookingDeposits', 'booking_deposits'),
  app('scheduleFieldPreferences', 'schedule_field_preferences'),
  app('gameBookingRequests', 'game_booking_requests'),
  app('teamAvailabilityPolls', 'team_availability_polls'),
  app('teamAvailabilityPollOptions', 'team_availability_poll_options'),
  app('teamAvailabilityPollVotes', 'team_availability_poll_votes'),
  app('whatsAppDeliveries', 'whatsapp_deliveries'),
  app('fundraisingCampaigns', 'fundraising_campaigns'),
  app('fundraisingContributions', 'fundraising_contributions'),
  app('fundraisingExpenses', 'fundraising_expenses'),
  app('teamChallenges', 'team_challenges'),
  app('friendlyMatches', 'friendly_matches'),
  app('friendlyMatchGoals', 'friendly_match_goals'),
  app('playerDuels', 'player_duels'),
  app('establishmentStaff', 'establishment_staff'),
  app('productCategories', 'product_categories'),
  app('products', 'products'),
  app('serviceTabs', 'service_tabs'),
  app('tabParticipants', 'tab_participants'),
  app('serviceOrders', 'service_orders'),
  app('serviceOrderItems', 'service_order_items'),
  app('orderItemShares', 'order_item_shares'),
  app('salePayments', 'sale_payments'),
  app('salePaymentAllocations', 'sale_payment_allocations'),
  app('salePaymentIntents', 'sale_payment_intents'),
  app('paymentGatewayConnections', 'payment_gateway_connections', { omit: ['credentialSecretId'] }),
  app('cashShifts', 'cash_shifts'),
  app('coaches', 'coaches'),
  app('classPrograms', 'class_programs'),
  app('classSessions', 'class_sessions'),
  app('classEnrollments', 'class_enrollments'),
  app('classAttendances', 'class_attendances'),
  app('makeupCredits', 'makeup_credits'),

  scoreboardSpec,
  chatChannelSpec,
  growth('chatMessages', 'chat_messages'),
  growth('walletEntries', 'wallet_ledger'),
  growth('loyaltyPlans', 'loyalty_plans'),
  growth('loyaltySubscriptions', 'loyalty_subscriptions'),
  growth('sportsStaff', 'sports_staff'),
  growth('staffAssignments', 'staff_assignments'),
  openSlotSpec,
  waiverSpec,
  growth('highlights', 'sport_highlights'),
  growth('commerceListings', 'commerce_listings'),
  growth('rentalOrders', 'rental_orders'),

  checkInSpec,
  pro('reliabilityEvents', 'reliability_events'),
  pro('seasons', 'sport_seasons'),
  pro('standings', 'season_standings', { keyFields: ['seasonId', 'playerId'] }),
  pro('plans', 'commercial_plans'),
  subscriptionSpec,
  pro('referrals', 'referral_campaigns'),
  pro('referralRedemptions', 'referral_redemptions'),
  pro('moderationReports', 'moderation_reports'),
  pro('auditEvents', 'audit_events'),
  clientMutationSpec,
  pro('settlements', 'payment_settlements'),
];

export const SPEC_BY_TABLE = new Map(TABLE_SPECS.map((spec) => [spec.table, spec]));
