import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { isMockMode, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

export function useAuthSession() {
  useEffect(() => {
    if (isMockMode || !supabase) {
      void useAuthStore.getState().initialize();
      return;
    }
    const client = supabase;
    // Callback síncrono: não dispara queries dentro do lock do Supabase Auth.
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      useAuthStore.getState().setSession(session);
    });
    void useAuthStore.getState().initialize();
    const refresh = (state: string) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    const listener = Platform.OS !== 'web' ? AppState.addEventListener('change', refresh) : null;
    if (Platform.OS !== 'web') refresh(AppState.currentState);
    return () => {
      data.subscription.unsubscribe();
      listener?.remove();
      if (Platform.OS !== 'web') client.auth.stopAutoRefresh();
    };
  }, []);
}
