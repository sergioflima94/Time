import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import { lanceSnapshot } from '@/lib/lances';
import type { LanceQuery, LanceSnapshot } from '@/types/lances';
const empty = (): LanceSnapshot => ({ items: [], participants: [], comments: [], me: null });
export function useLances(query: LanceQuery = {}) {
  const actor = useAuthStore(s => s.authUserId), key = JSON.stringify(query), scope = `${actor}:${key}`;
  const [raw, setRaw] = useState(empty), [loadedScope, setLoadedScope] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const epoch = useRef(0), current = useRef(scope); current.current = scope;
  const refresh = useCallback(async () => {
    const n = ++epoch.current; setBusy(true); setError('');
    try {
      const next = await lanceSnapshot(JSON.parse(key));
      if (n === epoch.current && current.current === scope) { setRaw(next); setLoadedScope(scope); }
    } catch (e) {
      if (n === epoch.current && current.current === scope) { setRaw(empty()); setLoadedScope(''); setError((e as Error).message); }
    } finally { if (n === epoch.current && current.current === scope) setBusy(false); }
  }, [key, scope]);
  useFocusEffect(useCallback(() => { void refresh(); return () => { epoch.current++; }; }, [refresh]));
  return { data: loadedScope === scope ? raw : empty(), busy, error, refresh };
}
