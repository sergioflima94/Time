import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AdBanner } from '@/components/AdBanner';
import { PlayerCard } from '@/components/PlayerCard';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { useFriendRequests, useFriends, useFriendshipWith, type FriendRequest } from '@/hooks/useFriends';
import { useIsAdFree } from '@/hooks/useIsAdFree';
import { computeActivityFeed, type ActivityItem } from '@/lib/activity';
import { formatGameDateShort } from '@/lib/format';
import { computeAllGoalStats } from '@/lib/goals';
import { computeAllOveralls } from '@/lib/ratings';
import { useAppStore } from '@/store/useAppStore';
import type { Player } from '@/types';

export default function AmigosScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const players = useAppStore((s) => s.players);
  const ratings = useAppStore((s) => s.ratings);
  const teamPlayers = useAppStore((s) => s.teamPlayers);
  const matchTurns = useAppStore((s) => s.matchTurns);
  const goals = useAppStore((s) => s.goals);
  const games = useAppStore((s) => s.games);
  const memberships = useAppStore((s) => s.memberships);
  const peladas = useAppStore((s) => s.peladas);
  const sendFriendRequest = useAppStore((s) => s.sendFriendRequest);
  const adFree = useIsAdFree();

  const friends = useFriends();
  const { incoming } = useFriendRequests();
  const [query, setQuery] = useState('');

  const overalls = computeAllOveralls(
    players.map((p) => p.id),
    ratings,
  );
  const goalStats = computeAllGoalStats(
    players.map((p) => p.id),
    teamPlayers,
    matchTurns,
    goals,
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter((p) => !p.isGuest && p.id !== currentPlayerId)
      .filter((p) => p.name.toLowerCase().includes(q) || p.nickname?.toLowerCase().includes(q))
      .slice(0, 15);
  }, [query, players, currentPlayerId]);

  const feed = useMemo(() => {
    const ids = [currentPlayerId, ...friends.map((f) => f.id)];
    return computeActivityFeed(ids, goals, games, memberships, peladas).slice(0, 20);
  }, [currentPlayerId, friends, goals, games, memberships, peladas]);

  const sortedFriends = friends.slice().sort((a, b) => overalls[b.id].overall - overalls[a.id].overall);

  return (
    <Screen>
      <Text style={styles.title}>Amigos</Text>
      <Text style={styles.subtitle}>Sua rede na Pelada — peça amizade, acompanhe o desempenho de quem você joga junto.</Text>

      <TextField label="Buscar jogador" placeholder="Nome ou apelido" value={query} onChangeText={setQuery} />
      {searchResults.length > 0 && (
        <Card style={styles.section}>
          {searchResults.map((p) => (
            <SearchResultRow key={p.id} player={p} onAdd={() => sendFriendRequest(currentPlayerId, p.id)} />
          ))}
        </Card>
      )}

      {incoming.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Solicitações de amizade ({incoming.length})</Text>
          {incoming.map((r) => (
            <FriendRequestRow key={r.friendship.id} request={r} />
          ))}
        </Card>
      )}

      {!adFree && <AdBanner />}

      {feed.length > 0 && (
        <View style={styles.feedSection}>
          <Text style={styles.sectionTitle}>Atividade recente</Text>
          {feed.map((item) => (
            <ActivityRow key={item.id} item={item} player={players.find((p) => p.id === item.playerId)} isMe={item.playerId === currentPlayerId} />
          ))}
        </View>
      )}

      <Text style={[styles.sectionTitle, styles.friendsTitle]}>Meus amigos ({friends.length})</Text>
      {friends.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={32} color={colors.textFaint} />
          <Text style={styles.emptyText}>Você ainda não tem amigos. Busque acima pra adicionar.</Text>
        </View>
      ) : (
        <FlatList
          data={sortedFriends}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Pressable style={styles.cardWrap} onPress={() => router.push(`/jogador/${item.id}`)}>
              <PlayerCard
                name={item.name}
                nickname={item.nickname}
                photoUrl={item.avatarUrl}
                cardBackgroundUrl={item.cardBackgroundUrl}
                position={item.preferredPosition}
                sportId={item.favoriteSports[0]}
                overall={overalls[item.id]}
                goalStats={goalStats[item.id]}
                width={150}
              />
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

function SearchResultRow({ player, onAdd }: { player: Player; onAdd: () => void }) {
  const state = useFriendshipWith(player.id);
  return (
    <Pressable style={styles.resultRow} onPress={() => router.push(`/jogador/${player.id}`)}>
      <Avatar name={player.name} photoUrl={player.avatarUrl} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={styles.resultName} numberOfLines={1}>
          {player.nickname || player.name}
        </Text>
      </View>
      {state.status === 'none' && <Button label="Adicionar" small variant="outline" onPress={onAdd} />}
      {state.status === 'pending_sent' && <Text style={styles.pendingLabel}>Pendente</Text>}
      {state.status === 'pending_received' && <Text style={styles.pendingLabel}>Te chamou</Text>}
      {state.status === 'friends' && <Ionicons name="checkmark-circle" size={20} color={colors.success} />}
    </Pressable>
  );
}

function FriendRequestRow({ request }: { request: FriendRequest }) {
  const respondFriendRequest = useAppStore((s) => s.respondFriendRequest);
  return (
    <View style={styles.requestRow}>
      <Pressable style={styles.requestInfo} onPress={() => router.push(`/jogador/${request.player.id}`)}>
        <Avatar name={request.player.name} photoUrl={request.player.avatarUrl} size={36} />
        <Text style={styles.resultName} numberOfLines={1}>
          {request.player.nickname || request.player.name}
        </Text>
      </Pressable>
      <View style={styles.requestActions}>
        <Pressable style={styles.requestBtn} onPress={() => respondFriendRequest(request.friendship.id, true)}>
          <Ionicons name="checkmark" size={18} color={colors.success} />
        </Pressable>
        <Pressable style={styles.requestBtn} onPress={() => respondFriendRequest(request.friendship.id, false)}>
          <Ionicons name="close" size={18} color={colors.danger} />
        </Pressable>
      </View>
    </View>
  );
}

function ActivityRow({ item, player, isMe }: { item: ActivityItem; player?: Player; isMe: boolean }) {
  if (!player) return null;
  const sport = getSport(item.sportId);
  const who = isMe ? 'Você' : player.nickname || player.name;

  return (
    <Pressable style={styles.activityRow} onPress={() => (isMe ? null : router.push(`/jogador/${player.id}`))}>
      <Avatar name={player.name} photoUrl={player.avatarUrl} size={32} />
      <View style={{ flex: 1 }}>
        <Text style={styles.activityText}>
          <Text style={styles.activityWho}>{who}</Text>
          {item.type === 'goal'
            ? ` marcou ${item.goalCount} ${sport.scorePlural} em ${item.peladaName}`
            : ` entrou na pelada ${item.peladaName}`}
        </Text>
        <Text style={styles.activityDate}>{formatGameDateShort(item.createdAt)}</Text>
      </View>
      <Text style={styles.activityIcon}>{item.type === 'goal' ? sport.icon : '🎉'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  friendsTitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  resultName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  pendingLabel: {
    color: colors.textFaint,
    fontSize: 12,
    fontStyle: 'italic',
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  requestBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  feedSection: {
    marginBottom: spacing.lg,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  activityText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  activityWho: {
    color: colors.text,
    fontWeight: '700',
  },
  activityDate: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: 1,
  },
  activityIcon: {
    fontSize: 16,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  list: {
    paddingBottom: spacing.xxl,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cardWrap: {
    marginBottom: spacing.xs,
  },
});
