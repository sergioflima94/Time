import { useEffect } from 'react';
import { AppState } from 'react-native';
import { isMockMode } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlatformAccessStore } from '@/store/usePlatformAccessStore';
import { useCommercialStore } from '@/store/useCommercialStore';

/** Uma consulta pequena de papel, sem carregar o console/dados globais. */
export function usePlatformAccessSync() {
  const ready = useAuthStore(s => s.authReady);
  const loggedIn = useAuthStore(s => s.isLoggedIn);
  const authId = useAuthStore(s => s.authUserId);
  const playerId = useAppStore(s => s.currentPlayerId);
  const key = ready && loggedIn ? isMockMode ? `demo:${playerId}` : authId : null;
  useEffect(() => {
    const store = usePlatformAccessStore.getState();
    store.reset();
    useCommercialStore.getState().reset();
    if (!key) return;
    void store.refresh();
    const refresh = () => { if (AppState.currentState === 'active') void store.refresh(); };
    const timer = setInterval(refresh, 60_000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') void store.refresh();
      else store.reset();
    });
    return () => { clearInterval(timer); listener.remove(); store.reset(); };
  }, [key]);
}
