import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing } from '@/constants/theme';
import { computeActivityFeed } from '@/lib/activity';
import { formatGameDateShort } from '@/lib/format';
import { computeNotifications, type AppNotification } from '@/lib/notifications';
import { useAppStore } from '@/store/useAppStore';
import type { Player } from '@/types';

export default function NotificacoesScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const players = useAppStore((s) => s.players);
  const friendships = useAppStore((s) => s.friendships);
  const activityLikes = useAppStore((s) => s.activityLikes);
  const activityComments = useAppStore((s) => s.activityComments);
  const goals = useAppStore((s) => s.goals);
  const games = useAppStore((s) => s.games);
  const memberships = useAppStore((s) => s.memberships);
  const peladas = useAppStore((s) => s.peladas);
  const respondFriendRequest = useAppStore((s) => s.respondFriendRequest);
  const markNotificationsSeen = useAppStore((s) => s.markNotificationsSeen);
  const notificationsSeenAt = useAppStore((s) => s.notificationsSeenAt);

  // captura o "visto até" de antes de abrir, pra ainda destacar como não lida durante essa visita
  const [seenBefore] = useState(notificationsSeenAt);

  useEffect(() => {
    markNotificationsSeen();
  }, [markNotificationsSeen]);

  const notifications = useMemo(
    () => computeNotifications(currentPlayerId, friendships, activityLikes, activityComments),
    [currentPlayerId, friendships, activityLikes, activityComments],
  );

  // feed só do jogador atual, pra dar contexto ("curtiu seu gol em X") nas notificações de curtida/comentário
  const myFeed = useMemo(
    () => computeActivityFeed([currentPlayerId], goals, games, memberships, peladas),
    [currentPlayerId, goals, games, memberships, peladas],
  );

  const seenTime = seenBefore ? new Date(seenBefore).getTime() : 0;

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Notificações</Text>
      </View>

      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-outline" size={32} color={colors.textFaint} />
          <Text style={styles.emptyText}>Nenhuma notificação ainda.</Text>
        </View>
      ) : (
        notifications.map((n) => (
          <NotificationRow
            key={n.id}
            notification={n}
            actor={players.find((p) => p.id === n.actorPlayerId)}
            unread={new Date(n.createdAt).getTime() > seenTime}
            activityContext={n.activityId ? myFeed.find((a) => a.id === n.activityId) : undefined}
            onAccept={() => n.friendshipId && respondFriendRequest(n.friendshipId, true)}
            onDecline={() => n.friendshipId && respondFriendRequest(n.friendshipId, false)}
          />
        ))
      )}
    </Screen>
  );
}

function NotificationRow({
  notification,
  actor,
  unread,
  activityContext,
  onAccept,
  onDecline,
}: {
  notification: AppNotification;
  actor?: Player;
  unread: boolean;
  activityContext?: ReturnType<typeof computeActivityFeed>[number];
  onAccept: () => void;
  onDecline: () => void;
}) {
  if (!actor) return null;
  const who = actor.nickname || actor.name;

  function description(): string {
    switch (notification.type) {
      case 'friend_request':
        return `${who} te pediu amizade`;
      case 'friend_accepted':
        return `${who} aceitou seu pedido de amizade`;
      case 'activity_like':
        return activityContext
          ? `${who} curtiu ${activityContext.type === 'goal' ? 'seu gol/ponto' : 'sua entrada'} em ${activityContext.peladaName}`
          : `${who} curtiu sua atividade`;
      case 'activity_comment':
        return `${who} comentou: "${notification.commentText}"`;
    }
  }

  return (
    <Pressable
      style={[styles.row, unread && styles.rowUnread]}
      onPress={() => router.push(`/jogador/${actor.id}`)}
    >
      <Avatar name={actor.name} photoUrl={actor.avatarUrl} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowText}>{description()}</Text>
        <Text style={styles.rowDate}>{formatGameDateShort(notification.createdAt)}</Text>
        {notification.type === 'friend_request' && (
          <View style={styles.actionsRow}>
            <Pressable style={[styles.actionBtn, styles.acceptBtn]} onPress={onAccept}>
              <Text style={styles.acceptBtnText}>Aceitar</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={onDecline}>
              <Text style={styles.declineBtnText}>Recusar</Text>
            </Pressable>
          </View>
        )}
      </View>
      {unread && <View style={styles.unreadDot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  rowUnread: {
    backgroundColor: colors.bgElevated,
  },
  rowText: {
    color: colors.text,
    fontSize: 14,
  },
  rowDate: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  acceptBtn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  acceptBtnText: {
    color: colors.bg,
    fontSize: 12,
    fontWeight: '700',
  },
  declineBtnText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});
