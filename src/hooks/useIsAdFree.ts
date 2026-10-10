import { useShallow } from 'zustand/react/shallow';

import { isAdFree } from '@/lib/payments';
import { isPremiumActive } from '@/lib/premium';
import { useAppStore } from '@/store/useAppStore';
import { useCommercialAccess } from '@/hooks/useCommercialAccess';

/** Sem anúncios: proprietário ativo, Premium ou rateio já pago. */
export function useIsAdFree(): boolean {
  const playerId = useAppStore(s=>s.currentPlayerId);
  const { included } = useCommercialAccess('player',playerId);
  const paidAccess = useAppStore(
    useShallow((s) => {
      const player = s.players.find((p) => p.id === s.currentPlayerId);
      if (!player) return false;
      return isAdFree(isPremiumActive(player), player.id, s.payments);
    }),
  );
  return included || paidAccess;
}
