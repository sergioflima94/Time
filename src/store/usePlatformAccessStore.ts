import { create } from 'zustand';
import { isMockMode, supabase } from '@/lib/supabase';
import type { PlatformRole } from '@/types/platform';
import { useAppStore } from './useAppStore';
import { useAuthStore } from './useAuthStore';
import { useCommercialStore } from './useCommercialStore';
import type { CommercialAccessSnapshot, CommercialAgreement, LicenseAccess } from '@/types/commercial';

export function platformAccessKey(): string | null {
  const auth = useAuthStore.getState();
  if (!auth.authReady || !auth.isLoggedIn) return null;
  return isMockMode ? `demo:${useAppStore.getState().currentPlayerId}` : auth.authUserId;
}

let revision = 0;
interface AccessState {
  role: PlatformRole | null;
  accessFor: string | null;
  licenses: LicenseAccess[];
  agreements: CommercialAgreement[];
  refresh: () => Promise<void>;
  reset: () => void;
}

// Nunca persiste privilégio no aparelho. Falha de rede/revogação remove a isenção.
export const usePlatformAccessStore = create<AccessState>((set) => ({
  role: null, accessFor: null, licenses: [], agreements: [],
  reset: () => { revision++; set({ role: null, accessFor: null, licenses: [], agreements: [] }); },
  refresh: async () => {
    const key = platformAccessKey();
    const request = ++revision;
    if (!key) { set({ role: null, accessFor: null, licenses: [], agreements: [] }); return; }
    try {
      let role: PlatformRole | null = null;
      let snapshot: CommercialAccessSnapshot = { role: null, licenses: [], agreements: [] };
      if (isMockMode) { await useCommercialStore.getState().hydrate(); snapshot=useCommercialStore.getState().demoAccess(); role=snapshot.role; }
      else if (supabase) {
        const { data, error } = await supabase.rpc('commercial_access_snapshot');
        if (error) throw error;
        snapshot=data as unknown as CommercialAccessSnapshot;
        if (!snapshot || !Array.isArray(snapshot.licenses) || !Array.isArray(snapshot.agreements)) throw new Error('Resposta comercial inválida.');
        role = snapshot.role === 'owner' || snapshot.role === 'admin' || snapshot.role === 'support' ? snapshot.role : null;
      }
      if (request === revision && key === platformAccessKey()) set({ role, accessFor: key, licenses:snapshot.licenses, agreements:snapshot.agreements });
    } catch {
      if (request === revision) set({ role: null, accessFor: key, licenses: [], agreements: [] });
    }
  },
}));
