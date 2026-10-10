import { useShallow } from 'zustand/react/shallow';

import { isAdFree } from '@/lib/payments';
import { isPremiumActive } from '@/lib/premium';
import { useAppStore } from '@/store/useAppStore';
import { useOwnerBenefits } from '@/hooks/useOwnerBenefits';

/** Sem anúncios: proprietário ativo, Premium ou rateio já pago. */
export function useIsAdFree(): boolean {
  const ownerBenefits = useOwnerBenefits();
  const paidAccess = useAppStore(
    useShallow((s) => {
      const player = s.players.find((p) => p.id === s.currentPlayerId);
      if (!player) return false;
      return isAdFree(isPremiumActive(player), player.id, s.payments);
    }),
  );
  return ownerBenefits || paidAccess;
}
