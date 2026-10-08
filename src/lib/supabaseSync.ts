import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { isMockMode, supabase } from '@/lib/supabase';
import {
  TABLE_SPECS,
  type StoreName,
  type TableSpec,
  genericFromRow,
  genericToRow,
  camelToSnake,
} from '@/lib/supabaseSyncMappings';
import { useAppStore } from '@/store/useAppStore';
import { useDataSyncStore } from '@/store/useDataSyncStore';
import type { DataSyncPatch } from '@/store/useDataSyncStore';
import { useGrowthStore } from '@/store/useGrowthStore';
import { useProStore } from '@/store/useProStore';

const OFFLINE_QUEUE_KEY = 'pelada-supabase-mutation-queue-v1';
const CHILD_TABLES = new Set([
  'scoreboard_segments',
  'chat_participants',
  'waiver_acceptances',
  'game_team_queue',
  'player_preferences',
  'device_push_tokens',
]);

type AnyState = Record<string, any>;
type MutationKind = 'upsert' | 'update' | 'delete' | 'rpc';

interface MutationJob {
  id: string;
  kind: MutationKind;
  table?: string;
  row?: Record<string, any>;
  match?: Record<string, any>;
  onConflict?: string;
  functionName?: string;
  args?: Record<string, any>;
  createdAt: string;
}

interface StartOptions {
  authUserId: string;
}

let applyingRemote = false;
let activeStop: (() => void) | null = null;
let writeChain = Promise.resolve();
let pendingWrites = 0;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
const pendingRefreshTables = new Set<string>();

const client = supabase as any;

function setSyncState(patch: DataSyncPatch) {
  useDataSyncStore.getState().setSyncState(patch);
}

function storeApi(name: StoreName) {
  if (name === 'app') return useAppStore;
  if (name === 'growth') return useGrowthStore;
  return useProStore;
}

function rootStateFor(name: StoreName): AnyState {
  return {
    ...(storeApi(name).getState() as unknown as AnyState),
    currentPlayerId: useAppStore.getState().currentPlayerId,
  };
}

function itemIdentity(spec: TableSpec, item: Record<string, any>): string {
  return (spec.keyFields ?? ['id']).map((field) => String(item[field] ?? '')).join('|');
}

function matchFor(spec: TableSpec, value: Record<string, any>, row: Record<string, any>) {
  return Object.fromEntries(
    (spec.keyFields ?? ['id']).map((field) => [camelToSnake(field), row[camelToSnake(field)] ?? value[field]]),
  );
}

function toRow(spec: TableSpec, value: Record<string, any>, state: AnyState) {
  return spec.toRow
    ? spec.toRow(value, state)
    : genericToRow(value, spec.omit);
}

function fromRow(spec: TableSpec, row: Record<string, any>) {
  return spec.fromRow ? spec.fromRow(row) : genericFromRow(row);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String((error as { message: unknown }).message);
  return String(error);
}

async function readOfflineQueue(): Promise<MutationJob[]> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeOfflineQueue(queue: MutationJob[]) {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  setSyncState({ pendingCount: queue.length });
}

async function enqueueOffline(job: MutationJob) {
  const queue = await readOfflineQueue();
  const duplicateIndex = queue.findIndex((item) =>
    item.kind === job.kind
    && item.table === job.table
    && JSON.stringify(item.match) === JSON.stringify(job.match)
    && item.functionName === job.functionName,
  );
  if (duplicateIndex >= 0 && job.kind !== 'rpc') queue[duplicateIndex] = job;
  else queue.push(job);
  await writeOfflineQueue(queue);
}

async function executeJob(job: MutationJob) {
  if (!client) throw new Error('Supabase não configurado.');

  let result: { error: any } | null = null;
  if (job.kind === 'rpc') {
    result = await client.rpc(job.functionName, job.args);
  } else if (job.kind === 'delete') {
    result = await client.from(job.table).delete().match(job.match);
  } else if (job.kind === 'update') {
    result = await client.from(job.table).update(job.row).match(job.match);
  } else {
    result = await client.from(job.table).upsert(job.row, {
      onConflict: job.onConflict,
    });
  }

  if (result?.error) throw result.error;
}

function newJob(input: Omit<MutationJob, 'id' | 'createdAt'>): MutationJob {
  return {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
  };
}

function scheduleJob(job: MutationJob) {
  pendingWrites += 1;
  setSyncState({ status: 'starting' });
  writeChain = writeChain
    .then(async () => {
      try {
        await executeJob(job);
        setSyncState({
          status: 'synced',
          error: null,
          lastSyncedAt: new Date().toISOString(),
        });
      } catch (error) {
        await enqueueOffline(job);
        setSyncState({
          status: 'offline',
          error: errorMessage(error),
        });
      } finally {
        pendingWrites -= 1;
      }
    });
}

async function flushOfflineQueue() {
  const queue = await readOfflineQueue();
  if (!queue.length) return;

  const remaining: MutationJob[] = [];
  for (const job of queue) {
    try {
      await executeJob(job);
    } catch {
      remaining.push(job);
    }
  }
  await writeOfflineQueue(remaining);
  if (remaining.length) {
    setSyncState({ status: 'offline', error: 'Há alterações aguardando conexão.' });
  }
}

function specialCheckInJob(
  previous: Record<string, any> | undefined,
  next: Record<string, any>,
): MutationJob | null {
  if (!previous) {
    if (!next.token) return null;
    return newJob({
      kind: 'rpc',
      functionName: 'issue_game_checkin_pass',
      args: {
        p_game_id: next.gameId,
        p_player_id: next.playerId,
        p_token: next.token,
      },
    });
  }
  if (!previous.redeemedAt && next.redeemedAt && next.token && next.redeemedBy) {
    return newJob({
      kind: 'rpc',
      functionName: 'redeem_game_checkin',
      args: {
        p_game_id: next.gameId,
        p_player_id: next.playerId,
        p_token: next.token,
        p_redeemed_by: next.redeemedBy,
      },
    });
  }
  return null;
}

function syncArray(spec: TableSpec, previous: Record<string, any>[], next: Record<string, any>[], state: AnyState) {
  const before = new Map(previous.map((item) => [itemIdentity(spec, item), item]));
  const after = new Map(next.map((item) => [itemIdentity(spec, item), item]));

  for (const [identity, value] of after) {
    const oldValue = before.get(identity);
    if (oldValue && JSON.stringify(oldValue) === JSON.stringify(value)) continue;

    if (spec.table === 'game_checkin_passes') {
      const job = specialCheckInJob(oldValue, value);
      if (job) scheduleJob(job);
      continue;
    }

    const row = toRow(spec, value, state);
    const match = matchFor(spec, value, row);
    scheduleJob(newJob(oldValue
      ? { kind: 'update', table: spec.table, row, match }
      : {
          kind: 'upsert',
          table: spec.table,
          row,
          onConflict: (spec.keyFields ?? ['id']).map(camelToSnake).join(','),
        }));
  }

  for (const [identity, value] of before) {
    if (after.has(identity)) continue;
    const row = toRow(spec, value, state);
    scheduleJob(newJob({
      kind: 'delete',
      table: spec.table,
      match: matchFor(spec, value, row),
    }));
  }
}

function flattenScoreboardSegments(boards: Record<string, any>[]) {
  return boards.flatMap((board) =>
    (board.segments ?? []).map((segment: Record<string, any>, sequence: number) => ({
      id: segment.id,
      scoreboardId: board.id,
      label: segment.label,
      sequence,
      homeScore: segment.home,
      awayScore: segment.away,
      finished: segment.finished,
    })),
  );
}

function flattenChatParticipants(channels: Record<string, any>[]) {
  return channels.flatMap((channel) =>
    (channel.participantIds ?? []).map((playerId: string) => ({
      channelId: channel.id,
      playerId,
      role: playerId === channel.createdBy ? 'admin' : 'member',
      lastReadAt: null,
    })),
  );
}

function flattenWaiverAcceptances(waivers: Record<string, any>[]) {
  return waivers.flatMap((waiver) =>
    (waiver.acceptedPlayerIds ?? []).map((playerId: string) => ({
      waiverId: waiver.id,
      playerId,
      waiverVersion: waiver.version ?? 1,
      acceptedAt: new Date().toISOString(),
      deviceInfo: Platform.OS,
    })),
  );
}

function syncPlainRows(
  table: string,
  keyFields: string[],
  previous: Record<string, any>[],
  next: Record<string, any>[],
) {
  const spec: TableSpec = { store: 'app', stateKey: '', table, keyFields };
  syncArray(spec, previous, next, {});
}

function syncNestedCollections(
  stateKey: string,
  previous: Record<string, any>[],
  next: Record<string, any>[],
) {
  if (stateKey === 'scoreboards') {
    syncPlainRows(
      'scoreboard_segments',
      ['id'],
      flattenScoreboardSegments(previous),
      flattenScoreboardSegments(next),
    );
  }
  if (stateKey === 'chatChannels') {
    syncPlainRows(
      'chat_participants',
      ['channelId', 'playerId'],
      flattenChatParticipants(previous),
      flattenChatParticipants(next),
    );
  }
  if (stateKey === 'waivers') {
    syncPlainRows(
      'waiver_acceptances',
      ['waiverId', 'playerId', 'waiverVersion'],
      flattenWaiverAcceptances(previous),
      flattenWaiverAcceptances(next),
    );
  }
}

function flattenMatchQueue(queue: Record<string, string[]>) {
  return Object.entries(queue).flatMap(([gameId, teamIds]) =>
    teamIds.map((teamId, position) => ({ gameId, teamId, position })),
  );
}

function syncPreferences(previous: AnyState, next: AnyState) {
  if (
    previous.currentPeladaId === next.currentPeladaId
    && previous.notificationsSeenAt === next.notificationsSeenAt
  ) return;
  if (!next.currentPlayerId) return;

  scheduleJob(newJob({
    kind: 'upsert',
    table: 'player_preferences',
    row: {
      player_id: next.currentPlayerId,
      current_pelada_id: next.currentPeladaId,
      notifications_seen_at: next.notificationsSeenAt,
      updated_at: new Date().toISOString(),
    },
    onConflict: 'player_id',
  }));
}

function syncPushRegistration(previous: AnyState, next: AnyState) {
  if (
    previous.notificationOptIn === next.notificationOptIn
    && previous.pushToken === next.pushToken
  ) return;
  const playerId = useAppStore.getState().currentPlayerId;
  if (!playerId || !next.pushToken) return;

  scheduleJob(newJob({
    kind: 'upsert',
    table: 'device_push_tokens',
    row: {
      player_id: playerId,
      expo_push_token: next.pushToken,
      platform: Platform.OS,
      active: Boolean(next.notificationOptIn),
      updated_at: new Date().toISOString(),
    },
    onConflict: 'expo_push_token',
  }));
}

function subscribeStore(name: StoreName): () => void {
  const api = storeApi(name);
  return api.subscribe((nextValue, previousValue) => {
    if (applyingRemote) return;
    const next = nextValue as unknown as AnyState;
    const previous = previousValue as unknown as AnyState;
    const root = rootStateFor(name);

    for (const spec of TABLE_SPECS.filter((item) => item.store === name)) {
      if (previous[spec.stateKey] === next[spec.stateKey]) continue;
      syncArray(spec, previous[spec.stateKey] ?? [], next[spec.stateKey] ?? [], root);
      syncNestedCollections(spec.stateKey, previous[spec.stateKey] ?? [], next[spec.stateKey] ?? []);
    }

    if (name === 'app') {
      if (previous.matchQueue !== next.matchQueue) {
        syncPlainRows(
          'game_team_queue',
          ['gameId', 'teamId'],
          flattenMatchQueue(previous.matchQueue ?? {}),
          flattenMatchQueue(next.matchQueue ?? {}),
        );
      }
      syncPreferences(previous, next);
    }
    if (name === 'growth') syncPushRegistration(previous, next);
  });
}

async function fetchRows(table: string): Promise<Record<string, any>[]> {
  const { data, error } = await client.from(table).select('*');
  if (error) throw error;
  return data ?? [];
}

async function fetchSpecs(specs: TableSpec[]) {
  const results = new Map<string, Record<string, any>[]>();
  const errors: string[] = [];

  for (let index = 0; index < specs.length; index += 10) {
    const batch = specs.slice(index, index + 10);
    const settled = await Promise.allSettled(
      batch.map(async (spec) => [spec.table, await fetchRows(spec.table)] as const),
    );
    settled.forEach((result, resultIndex) => {
      const table = batch[resultIndex].table;
      if (result.status === 'fulfilled') results.set(result.value[0], result.value[1]);
      else errors.push(`${table}: ${errorMessage(result.reason)}`);
    });
  }
  return { results, errors };
}

async function resolveCurrentPlayer(authUserId: string) {
  let response = await client.from('players').select('*').eq('auth_user_id', authUserId).maybeSingle();
  if (response.error) throw response.error;

  if (!response.data) {
    const { data: authData } = await client.auth.getUser();
    const metadata = authData.user?.user_metadata ?? {};
    const inserted = await client
      .from('players')
      .upsert({
        auth_user_id: authUserId,
        name: metadata.name || authData.user?.email?.split('@')[0] || 'Novo jogador',
        phone: metadata.phone ?? null,
        preferred_position: metadata.preferred_position === 'goalkeeper' ? 'goalkeeper' : 'line',
        favorite_sports: metadata.favorite_sports ?? ['futebol'],
      }, { onConflict: 'auth_user_id' })
      .select('*')
      .single();
    if (inserted.error) throw inserted.error;
    response = inserted;
  }
  return response.data as Record<string, any>;
}

function attachSpecialChildren(
  stateByStore: Record<StoreName, AnyState>,
  auxiliary: Record<string, Record<string, any>[]>,
) {
  const growth = stateByStore.growth;
  const app = stateByStore.app;

  const segments = auxiliary.scoreboard_segments ?? [];
  growth.scoreboards = (growth.scoreboards ?? []).map((board: Record<string, any>) => ({
    ...board,
    segments: segments
      .filter((row) => row.scoreboard_id === board.id)
      .sort((a, b) => a.sequence - b.sequence)
      .map((row) => ({
        id: row.id,
        label: row.label,
        home: row.home_score,
        away: row.away_score,
        finished: row.finished,
      })),
  }));

  const participants = auxiliary.chat_participants ?? [];
  growth.chatChannels = (growth.chatChannels ?? []).map((channel: Record<string, any>) => ({
    ...channel,
    participantIds: participants
      .filter((row) => row.channel_id === channel.id)
      .map((row) => row.player_id),
  }));

  const acceptances = auxiliary.waiver_acceptances ?? [];
  growth.waivers = (growth.waivers ?? []).map((waiver: Record<string, any>) => ({
    ...waiver,
    acceptedPlayerIds: acceptances
      .filter((row) => row.waiver_id === waiver.id && row.waiver_version === (waiver.version ?? 1))
      .map((row) => row.player_id),
  }));

  const fields = new Map<string, Record<string, any>>(
    (app.fields ?? []).map((field: Record<string, any>) => [field.id, field]),
  );
  growth.openSlotOffers = (growth.openSlotOffers ?? []).map((offer: Record<string, any>) => ({
    ...offer,
    fieldName: fields.get(offer.fieldId)?.name ?? 'Campo',
  }));

  const localPasses = useProStore.getState().checkInPasses;
  stateByStore.pro.checkInPasses = (stateByStore.pro.checkInPasses ?? []).map((pass: Record<string, any>) => ({
    ...pass,
    token: localPasses.find((local) => local.id === pass.id)?.token ?? '',
  }));
}

function queueRowsToObject(rows: Record<string, any>[]) {
  return rows
    .sort((a, b) => a.position - b.position)
    .reduce<Record<string, string[]>>((result, row) => {
      (result[row.game_id] ??= []).push(row.team_id);
      return result;
    }, {});
}

async function hydrateAll(authUserId: string) {
  const profile = await resolveCurrentPlayer(authUserId);
  const auxiliaryTables = [
    'scoreboard_segments',
    'chat_participants',
    'waiver_acceptances',
    'game_team_queue',
    'player_preferences',
    'device_push_tokens',
  ];

  const [{ results, errors }, auxiliaryResults] = await Promise.all([
    fetchSpecs(TABLE_SPECS),
    Promise.allSettled(auxiliaryTables.map(async (table) => [table, await fetchRows(table)] as const)),
  ]);

  const stateByStore: Record<StoreName, AnyState> = { app: {}, growth: {}, pro: {} };
  for (const spec of TABLE_SPECS) {
    const rows = results.get(spec.table);
    if (!rows) continue;
    stateByStore[spec.store][spec.stateKey] = rows.map((row) => fromRow(spec, row));
  }

  const auxiliary: Record<string, Record<string, any>[]> = {};
  auxiliaryResults.forEach((result, index) => {
    if (result.status === 'fulfilled') auxiliary[result.value[0]] = result.value[1];
    else errors.push(`${auxiliaryTables[index]}: ${errorMessage(result.reason)}`);
  });
  attachSpecialChildren(stateByStore, auxiliary);

  const preferences = auxiliary.player_preferences?.find((row) => row.player_id === profile.id);
  const ownMemberships = (stateByStore.app.memberships ?? []).filter(
    (membership: Record<string, any>) => membership.playerId === profile.id && membership.active,
  );
  const preferredPelada = preferences?.current_pelada_id;
  const currentPeladaId = ownMemberships.some((membership: Record<string, any>) => membership.peladaId === preferredPelada)
    ? preferredPelada
    : ownMemberships[0]?.peladaId ?? null;

  stateByStore.app.currentPlayerId = profile.id;
  stateByStore.app.currentPeladaId = currentPeladaId;
  stateByStore.app.notificationsSeenAt = preferences?.notifications_seen_at ?? null;
  stateByStore.app.matchQueue = queueRowsToObject(auxiliary.game_team_queue ?? []);

  const deviceToken = (auxiliary.device_push_tokens ?? []).find(
    (row) => row.player_id === profile.id && row.active,
  );
  stateByStore.growth.notificationOptIn = Boolean(deviceToken);
  stateByStore.growth.pushToken = deviceToken?.expo_push_token ?? null;

  applyingRemote = true;
  try {
    useAppStore.setState(stateByStore.app);
    useGrowthStore.setState(stateByStore.growth);
    useProStore.setState(stateByStore.pro);
  } finally {
    applyingRemote = false;
  }

  if (errors.length) {
    setSyncState({ error: errors.slice(0, 3).join(' | ') });
  }
}

function realtimeParent(table: string): string {
  if (table === 'scoreboard_segments') return 'multi_sport_scoreboards';
  if (table === 'chat_participants') return 'chat_channels';
  if (table === 'waiver_acceptances') return 'digital_waivers';
  return table;
}

async function refreshFromRealtime(authUserId: string, changedTables: string[]) {
  try {
    await writeChain;
    const tables = [...new Set(changedTables.map(realtimeParent))];
    const patches: Record<StoreName, AnyState> = { app: {}, growth: {}, pro: {} };

    for (const table of tables) {
      if (table === 'player_preferences') {
        const rows = await fetchRows(table);
        const playerId = useAppStore.getState().currentPlayerId;
        const row = rows.find((item) => item.player_id === playerId);
        patches.app.currentPeladaId = row?.current_pelada_id ?? useAppStore.getState().currentPeladaId;
        patches.app.notificationsSeenAt = row?.notifications_seen_at ?? null;
        continue;
      }
      if (table === 'game_team_queue') {
        patches.app.matchQueue = queueRowsToObject(await fetchRows(table));
        continue;
      }
      if (table === 'device_push_tokens') {
        const rows = await fetchRows(table);
        const playerId = useAppStore.getState().currentPlayerId;
        const token = rows.find((item) => item.player_id === playerId && item.active);
        patches.growth.notificationOptIn = Boolean(token);
        patches.growth.pushToken = token?.expo_push_token ?? null;
        continue;
      }

      const spec = TABLE_SPECS.find((item) => item.table === table);
      if (!spec) continue;
      const rows = await fetchRows(table);
      let values = rows.map((row) => fromRow(spec, row));

      if (table === 'multi_sport_scoreboards') {
        const segments = await fetchRows('scoreboard_segments');
        values = values.map((board) => ({
          ...board,
          segments: segments
            .filter((row) => row.scoreboard_id === board.id)
            .sort((a, b) => a.sequence - b.sequence)
            .map((row) => ({ id: row.id, label: row.label, home: row.home_score, away: row.away_score, finished: row.finished })),
        }));
      }
      if (table === 'chat_channels') {
        const participants = await fetchRows('chat_participants');
        values = values.map((channel) => ({
          ...channel,
          participantIds: participants.filter((row) => row.channel_id === channel.id).map((row) => row.player_id),
        }));
      }
      if (table === 'digital_waivers') {
        const acceptances = await fetchRows('waiver_acceptances');
        values = values.map((waiver) => ({
          ...waiver,
          acceptedPlayerIds: acceptances
            .filter((row) => row.waiver_id === waiver.id && row.waiver_version === (waiver.version ?? 1))
            .map((row) => row.player_id),
        }));
      }
      if (table === 'game_checkin_passes') {
        const local = useProStore.getState().checkInPasses;
        values = values.map((pass) => ({ ...pass, token: local.find((item) => item.id === pass.id)?.token ?? '' }));
      }
      if (table === 'open_slot_offers') {
        const fields = new Map(useAppStore.getState().fields.map((field) => [field.id, field.name]));
        values = values.map((offer) => ({ ...offer, fieldName: fields.get(offer.fieldId) ?? 'Campo' }));
      }
      patches[spec.store][spec.stateKey] = values;
    }

    applyingRemote = true;
    try {
      if (Object.keys(patches.app).length) useAppStore.setState(patches.app);
      if (Object.keys(patches.growth).length) useGrowthStore.setState(patches.growth);
      if (Object.keys(patches.pro).length) useProStore.setState(patches.pro);
    } finally {
      applyingRemote = false;
    }
    setSyncState({
      status: 'synced',
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (error) {
    setSyncState({ status: 'offline', error: errorMessage(error) });
  }
}

function scheduleRefresh(authUserId: string, table: string) {
  pendingRefreshTables.add(table);
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const tables = [...pendingRefreshTables];
    pendingRefreshTables.clear();
    void refreshFromRealtime(authUserId, tables);
  }, 500);
}

export async function startSupabaseSync({ authUserId }: StartOptions): Promise<() => void> {
  activeStop?.();
  activeStop = null;

  if (isMockMode || !client) {
    setSyncState({ status: 'disabled', pendingCount: 0, error: null });
    return () => {};
  }

  setSyncState({ status: 'starting', error: null });
  try {
    await Promise.all([
      useAppStore.persist.rehydrate(),
      useGrowthStore.persist.rehydrate(),
      useProStore.persist.rehydrate(),
    ]);
    await flushOfflineQueue();
    await hydrateAll(authUserId);

    const unsubscribers = [
      subscribeStore('app'),
      subscribeStore('growth'),
      subscribeStore('pro'),
    ];

    const channel = client
      .channel(`app-sync-${authUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload: { table?: string }) => {
          const table = payload.table;
          if (table && (TABLE_SPECS.some((spec) => spec.table === table) || CHILD_TABLES.has(table))) {
            scheduleRefresh(authUserId, table);
          }
        },
      )
      .subscribe();

    setSyncState({
      status: 'synced',
      lastSyncedAt: new Date().toISOString(),
      error: null,
    });

    const stop = () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = null;
      pendingRefreshTables.clear();
      void client.removeChannel(channel);
      if (activeStop === stop) activeStop = null;
    };
    activeStop = stop;
    return stop;
  } catch (error) {
    setSyncState({
      status: 'offline',
      error: errorMessage(error),
    });
    return () => {};
  }
}

export function stopSupabaseSync() {
  activeStop?.();
  activeStop = null;
}
