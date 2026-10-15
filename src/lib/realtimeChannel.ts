import type { RealtimeClient } from '@supabase/supabase-js';
import { createUuid } from './uuid';

const runtimeId = createUuid();
let subscriptionSequence = 0;

/**
 * Supabase reuses channels by topic, but refuses new postgres listeners after
 * subscribe(). Native stacks keep the previous screen mounted, so two screens
 * may legitimately subscribe to the same account/venue at once. Give each
 * effect its own channel, including during asynchronous cleanup/Strict Mode.
 * Callers must still remove their own channel on cleanup; RLS is unchanged.
 */
export function createScopedRealtimeChannel(client: Pick<RealtimeClient, 'channel'>, scope: string) {
  return client.channel(`${scope}:${runtimeId}:${++subscriptionSequence}`);
}
