import { hasOwnerBenefits } from '@/lib/featureAccess';
import { isMockMode } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlatformAccessStore } from '@/store/usePlatformAccessStore';

export function useOwnerBenefits(): boolean {
  const ready = useAuthStore(s => s.authReady);
  const loggedIn = useAuthStore(s => s.isLoggedIn);
  const authId = useAuthStore(s => s.authUserId);
  const playerId = useAppStore(s => s.currentPlayerId);
  const playerAuthId = useAppStore(s => s.players.find(p => p.id === s.currentPlayerId)?.authUserId);
  const role = usePlatformAccessStore(s => s.role);
  const accessFor = usePlatformAccessStore(s => s.accessFor);
  const key = ready && loggedIn ? isMockMode ? `demo:${playerId}` : authId : null;
  return !!key && key === accessFor && (isMockMode || playerAuthId === authId) && hasOwnerBenefits(role);
}
