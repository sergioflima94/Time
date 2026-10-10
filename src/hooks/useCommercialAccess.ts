import { useOwnerBenefits } from './useOwnerBenefits';
import { licenseIsActive } from '@/lib/commercial';
import { isMockMode } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlatformAccessStore } from '@/store/usePlatformAccessStore';
import type { CommercialAudience } from '@/types/pro';

export function useCommercialAccess(audience: CommercialAudience, targetId: string | undefined) {
  const owner = useOwnerBenefits();
  const ready = useAuthStore(s=>s.authReady);
  const loggedIn = useAuthStore(s=>s.isLoggedIn);
  const authId = useAuthStore(s=>s.authUserId);
  const playerId = useAppStore(s=>s.currentPlayerId);
  const playerAuthId = useAppStore(s=>s.players.find(p=>p.id===s.currentPlayerId)?.authUserId);
  const accessFor = usePlatformAccessStore(s=>s.accessFor);
  const licenses = usePlatformAccessStore(s=>s.licenses);
  const agreements = usePlatformAccessStore(s=>s.agreements);
  const key=ready && loggedIn ? isMockMode ? `demo:${playerId}` : authId : null;
  const valid=!!key && key===accessFor && (isMockMode || playerAuthId===authId);
  const license=valid ? licenses.find(l=>l.audience===audience && l.targetId===targetId && licenseIsActive(l)) : undefined;
  return { owner, license, included: !!targetId && (owner || !!license),
    agreements: valid ? agreements.filter(a=>a.audience===audience && a.targetId===targetId) : [] };
}
