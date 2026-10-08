import { isMockMode, supabase } from '@/lib/supabase';
import type { SyncMutation } from '@/types/pro';

export interface SyncResult {
  id: string;
  ok: boolean;
  error: string | null;
}

/**
 * Envia mutações novas para uma caixa de entrada idempotente. O backend aplica a
 * alteração de domínio e mantém o cliente simples/offline-first. No modo demo a
 * confirmação é local, permitindo demonstrar o mesmo estado de sincronização.
 */
export async function flushSyncMutations(mutations: SyncMutation[]): Promise<SyncResult[]> {
  const pending = mutations.filter((mutation) => mutation.status === 'pending' || mutation.status === 'failed');
  if (isMockMode || !supabase) return pending.map((mutation) => ({ id: mutation.id, ok: true, error: null }));

  const results: SyncResult[] = [];
  for (const mutation of pending) {
    const { error } = await supabase.from('client_mutations').upsert({
      id: mutation.id,
      aggregate: mutation.aggregate,
      aggregate_id: mutation.aggregateId,
      operation: mutation.operation,
      payload: mutation.payload,
      client_created_at: mutation.createdAt,
    }, { onConflict: 'id' });
    results.push({ id: mutation.id, ok: !error, error: error?.message ?? null });
  }
  return results;
}
