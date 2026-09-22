import type { ActivityComment, ActivityLike, Friendship } from '@/types';

export type NotificationType = 'friend_request' | 'friend_accepted' | 'activity_like' | 'activity_comment';

export interface AppNotification {
  id: string;
  type: NotificationType;
  createdAt: string;
  /** Quem fez a ação (pediu amizade, aceitou, curtiu, comentou). */
  actorPlayerId: string;
  friendshipId?: string;
  activityId?: string;
  commentText?: string;
}

/** O feed de atividades usa chaves estáveis tipo "goal:<playerId>:<gameId>" — o dono é sempre o 2º pedaço. */
function activityOwnerId(activityId: string): string {
  return activityId.split(':')[1] ?? '';
}

/**
 * Notificações do jogador atual, derivadas dos mesmos dados que já existem (pedidos de
 * amizade, curtidas e comentários no feed) — sem precisar de uma tabela de notificações
 * separada. Cobre: pedido de amizade recebido, pedido que você mandou foi aceito,
 * curtida e comentário em algo que é seu no feed.
 */
export function computeNotifications(
  currentPlayerId: string,
  friendships: Friendship[],
  activityLikes: ActivityLike[],
  activityComments: ActivityComment[],
): AppNotification[] {
  const items: AppNotification[] = [];

  for (const f of friendships) {
    if (f.status === 'pending' && f.addresseeId === currentPlayerId) {
      items.push({ id: `friend_request:${f.id}`, type: 'friend_request', createdAt: f.createdAt, actorPlayerId: f.requesterId, friendshipId: f.id });
    }
    if (f.status === 'accepted' && f.requesterId === currentPlayerId && f.respondedAt) {
      items.push({
        id: `friend_accepted:${f.id}`,
        type: 'friend_accepted',
        createdAt: f.respondedAt,
        actorPlayerId: f.addresseeId,
        friendshipId: f.id,
      });
    }
  }

  for (const like of activityLikes) {
    if (like.playerId === currentPlayerId) continue;
    if (activityOwnerId(like.activityId) !== currentPlayerId) continue;
    items.push({ id: `activity_like:${like.id}`, type: 'activity_like', createdAt: like.createdAt, actorPlayerId: like.playerId, activityId: like.activityId });
  }

  for (const comment of activityComments) {
    if (comment.playerId === currentPlayerId) continue;
    if (activityOwnerId(comment.activityId) !== currentPlayerId) continue;
    items.push({
      id: `activity_comment:${comment.id}`,
      type: 'activity_comment',
      createdAt: comment.createdAt,
      actorPlayerId: comment.playerId,
      activityId: comment.activityId,
      commentText: comment.text,
    });
  }

  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
