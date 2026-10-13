// Cache provenance is not an authorization role. RLS remains the authority.
let account: string | null = null;
let epoch = 0;
const resets = new Set<() => void>();
export const cacheAccount = () => account;
export const cacheEpoch = () => epoch;
export function bindCacheAccount(next: string | null) {
  if (next === account) return;
  account = next; epoch++;
  resets.forEach(reset => reset());
}
export function registerAccountCacheReset(reset: () => void) { resets.add(reset); }

export function emptyAccountState<T extends object>(state: T, demo: boolean): T {
  if (demo) return state;
  const copy = { ...state } as Record<string, unknown>;
  for (const [key,value] of Object.entries(copy)) if (Array.isArray(value)) copy[key] = [];
  for (const key of ['currentPlayerId','currentPeladaId']) if (key in copy) copy[key] = '';
  if ('matchQueue' in copy) copy.matchQueue = {};
  if ('notificationsSeenAt' in copy) copy.notificationsSeenAt = null;
  if ('notificationOptIn' in copy) copy.notificationOptIn = false;
  if ('pushToken' in copy) copy.pushToken = null;
  copy.cacheAuthUserId = null;
  return copy as T;
}
export function mergeAccountCache<T extends object>(saved: unknown, current: T, demo: boolean): T {
  if (!saved || typeof saved !== 'object') return current;
  const owner = (saved as { cacheAuthUserId?: unknown }).cacheAuthUserId;
  if (!demo && (!account || owner !== account)) return current;
  return { ...current, ...saved };
}
export function ownsQueuedJob(job: { authUserId?: string }, actor = account): boolean {
  return Boolean(actor && job.authUserId === actor);
}
