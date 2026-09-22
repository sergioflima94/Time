import { useShallow } from 'zustand/react/shallow';

import { computeNotifications } from '@/lib/notifications';
import { useAppStore } from '@/store/useAppStore';

/** Todas as notificações do jogador atual, mais recentes primeiro. */
export function useNotifications() {
  return useAppStore(
    useShallow((s) => computeNotifications(s.currentPlayerId, s.friendships, s.activityLikes, s.activityComments)),
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
