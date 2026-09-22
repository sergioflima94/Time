import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { AdBanner } from '@/components/AdBanner';
import { PlayerCard } from '@/components/PlayerCard';
import { colors, spacing } from '@/constants/theme';
import { useCurrentPelada } from '@/hooks/useCurrentPelada';
import { useIsAdFree } from '@/hooks/useIsAdFree';
import { computeAllGoalStats } from '@/lib/goals';
import { computeAllOveralls } from '@/lib/ratings';
import { useAppStore } from '@/store/useAppStore';

export default function JogadoresScreen() {
  const pelada = useCurrentPelada();
  const players = useAppStore((s) => s.players);
  const memberIds = useAppStore(
    useShallow((s) => new Set(s.memberships.filter((m) => m.peladaId === pelada.id && m.active).map((m) => m.playerId))),
  );
  const ratings = useAppStore((s) => s.ratings);
  const teamPlayers = useAppStore((s) => s.teamPlayers);
  const matchTurns = useAppStore((s) => s.matchTurns);
  const goals = useAppStore((s) => s.goals);
  const adFree = useIsAdFree();
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

  const sorted = players
    .filter((p) => !p.isGuest && memberIds.has(p.id))
    .sort((a, b) => overalls[b.id].overall - overalls[a.id].overall);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Elenco</Text>
      <Text style={styles.subtitle}>{pelada.name}</Text>
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        ListHeaderComponent={!adFree ? <AdBanner /> : null}
        renderItem={({ item }) => (
          <Pressable style={styles.cardWrap} onPress={() => router.push(`/jogador/${item.id}`)}>
            <PlayerCard
              name={item.name}
              nickname={item.nickname}
              photoUrl={item.avatarUrl}
              cardBackgroundUrl={item.cardBackgroundUrl}
              position={item.preferredPosition}
              sportId={pelada.sportId}
              overall={overalls[item.id]}
              goalStats={goalStats[item.id]}
              width={150}
            />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
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
