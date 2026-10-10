import { create } from 'zustand';
import { isMockMode, supabase } from '@/lib/supabase';
import type { PlatformRole } from '@/types/platform';
import { useAppStore } from './useAppStore';
import { useAuthStore } from './useAuthStore';

export function platformAccessKey(): string | null {
  const auth = useAuthStore.getState();
  if (!auth.authReady || !auth.isLoggedIn) return null;
  return isMockMode ? `demo:${useAppStore.getState().currentPlayerId}` : auth.authUserId;
}

let revision = 0;
interface AccessState {
  role: PlatformRole | null;
  accessFor: string | null;
  refresh: () => Promise<void>;
  reset: () => void;
}

// Nunca persiste privilégio no aparelho. Falha de rede/revogação remove a isenção.
export const usePlatformAccessStore = create<AccessState>((set) => ({
  role: null, accessFor: null,
  reset: () => { revision++; set({ role: null, accessFor: null }); },
  refresh: async () => {
    const key = platformAccessKey();
    const request = ++revision;
    if (!key) { set({ role: null, accessFor: null }); return; }
    try {
      let role: PlatformRole | null = null;
      if (isMockMode) role = key === 'demo:p1' ? 'owner' : null;
      else if (supabase) {
        const { data, error } = await supabase.rpc('platform_admin_role');
        if (error) throw error;
        role = data === 'owner' || data === 'admin' || data === 'support' ? data : null;
      }
      if (request === revision && key === platformAccessKey()) set({ role, accessFor: key });
    } catch {
      if (request === revision) set({ role: null, accessFor: key });
    }
  },
}));
