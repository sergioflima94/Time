import { useMemo } from 'react';

import { computeNotifications } from '@/lib/notifications';
import { useAppStore } from '@/store/useAppStore';

/**
 * Todas as notificações do jogador atual, mais recentes primeiro.
 *
 * `computeNotifications` monta objetos novos a cada chamada, então não dá pra
 * derivar isso direto num selector do Zustand (mesmo com `useShallow`, que só
 * compara os elementos do array por referência) — sem `useMemo`, cada render
 * gera uma array "diferente" mesmo com os mesmos dados, e o componente entra
 * em loop de re-render.
 */
export function useNotifications() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const friendships = useAppStore((s) => s.friendships);
  const activityLikes = useAppStore((s) => s.activityLikes);
  const activityComments = useAppStore((s) => s.activityComments);
  return useMemo(
    () => computeNotifications(currentPlayerId, friendships, activityLikes, activityComments),
    [currentPlayerId, friendships, activityLikes, activityComments],
  );
}

/** Quantas notificações chegaram depois da última vez que a central foi aberta. */
export function useUnreadNotificationsCount(): number {
  const notifications = useNotifications();
  const seenAt = useAppStore((s) => s.notificationsSeenAt);
  if (!seenAt) return notifications.length;
  const seenTime = new Date(seenAt).getTime();
  return notifications.filter((n) => new Date(n.createdAt).getTime() > seenTime).length;
}
