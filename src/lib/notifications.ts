import type { ActivityComment, ActivityLike, ClassEnrollment, ClassProgram, ClassSession, Friendship, ServiceOrder, ServiceOrderItem, ServiceTab } from '@/types';

export type NotificationType = 'friend_request' | 'friend_accepted' | 'activity_like' | 'activity_comment' | 'order_ready' | 'class_booking' | 'class_payment_due';

export interface AppNotification {
  id: string;
  type: NotificationType;
  createdAt: string;
  /** Quem fez a ação (pediu amizade, aceitou, curtiu, comentou). */
  actorPlayerId?: string;
  friendshipId?: string;
  activityId?: string;
  commentText?: string;
  title?: string;
  body?: string;
  route?: string;
}

interface OperationNotificationData {
  serviceTabs: ServiceTab[];
  serviceOrders: ServiceOrder[];
  serviceOrderItems: ServiceOrderItem[];
  classEnrollments: ClassEnrollment[];
  classSessions: ClassSession[];
  classPrograms: ClassProgram[];
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
  operations?: OperationNotificationData,
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

  if (operations) {
    const myTabs = operations.serviceTabs.filter((tab) => tab.customerPlayerId === currentPlayerId);
    for (const tab of myTabs) {
      const tabOrders = operations.serviceOrders.filter((order) => order.tabId === tab.id);
      const orderIds = new Set(tabOrders.map((order) => order.id));
      const ready = operations.serviceOrderItems.filter((item) => orderIds.has(item.orderId) && item.status === 'ready');
      if (ready.length > 0) {
        const newest = tabOrders.map((order) => order.submittedAt ?? order.createdAt).sort().at(-1) ?? tab.openedAt;
        items.push({ id: `order_ready:${tab.id}:${ready.length}`, type: 'order_ready', createdAt: newest, title: 'Pedido pronto', body: `${ready.length} item(ns) da ${tab.label} estão prontos para retirada.`, route: `/operacao/comanda/${tab.id}` });
      }
    }

    for (const enrollment of operations.classEnrollments.filter((row) => row.playerId === currentPlayerId && row.status !== 'cancelled')) {
      const session = operations.classSessions.find((row) => row.id === enrollment.sessionId);
      const program = operations.classPrograms.find((row) => row.id === session?.programId);
      if (!session || !program || session.status === 'cancelled') continue;
      items.push({ id: `class_booking:${enrollment.id}:${enrollment.status}`, type: 'class_booking', createdAt: enrollment.enrolledAt, title: enrollment.status === 'waitlisted' ? 'Lista de espera' : 'Aula reservada', body: enrollment.status === 'waitlisted' ? `${program.name}: você está na posição ${enrollment.waitlistPosition}.` : `${program.name} em ${new Date(session.startsAt).toLocaleString('pt-BR')}.`, route: '/aulas' });
      if (enrollment.status === 'confirmed' && enrollment.paymentStatus === 'pending') {
        items.push({ id: `class_payment:${enrollment.id}`, type: 'class_payment_due', createdAt: enrollment.enrolledAt, title: 'Pagamento da aula pendente', body: `${program.name}: confirme o pagamento para manter sua vaga.`, route: '/aulas' });
      }
    }
  }

  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
