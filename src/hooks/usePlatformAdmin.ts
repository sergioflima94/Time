import { useEffect } from 'react';
import { isMockMode } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlatformStore } from '@/store/usePlatformStore';

export function usePlatformAdmin() {
  const loggedIn = useAuthStore(s => s.isLoggedIn);
  const authId = useAuthStore(s => s.authUserId);
  const playerId = useAppStore(s => s.currentPlayerId);
  const snapshot = usePlatformStore(s => s.snapshot);
  const accessFor = usePlatformStore(s => s.accessFor);
  const load = usePlatformStore(s => s.load);
  const reset = usePlatformStore(s => s.reset);
  const key = loggedIn ? isMockMode ? `demo:${playerId}` : authId : null;
  useEffect(() => { if (!key) reset(); else if (usePlatformStore.getState().accessFor !== key) void load(); }, [key, load, reset]);
  return accessFor === key && key ? snapshot?.role ?? null : null;
}
