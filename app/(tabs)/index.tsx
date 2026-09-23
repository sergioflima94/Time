import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { AdBanner } from '@/components/AdBanner';
import { GameCard } from '@/components/GameCard';
import { PeladaSwitcher } from '@/components/PeladaSwitcher';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport, scoreLabel } from '@/constants/sports';
import { useCurrentPelada, useMyPeladas } from '@/hooks/useCurrentPelada';
import { useIsAdFree } from '@/hooks/useIsAdFree';
import { computePlayerGoalStats } from '@/lib/goals';
import { computePlayerActivitySummary, computePlayerRecord, computeOverallTrend } from '@/lib/performance';
import { computePlayerOverall } from '@/lib/ratings';
import { useAppStore } from '@/store/useAppStore';

export default function AgendaScreen() {
  const pelada = useCurrentPelada();
  const myPeladas = useMyPeladas();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const games = useAppStore(useShallow((s) => s.games.filter((g) => g.peladaId === pelada.id)));
  const allGames = useAppStore((s) => s.games);
  const attendances = useAppStore((s) => s.attendances);
  const ratings = useAppStore((s) => s.ratings);
  const teamPlayers = useAppStore((s) => s.teamPlayers);
  const matchTurns = useAppStore((s) => s.matchTurns);
  const goals = useAppStore((s) => s.goals);
  const adFree = useIsAdFree();

  const overall = computePlayerOverall(currentPlayerId, ratings);
  const trend = computeOverallTrend(currentPlayerId, ratings);
  const record = computePlayerRecord(currentPlayerId, teamPlayers, matchTurns);
  const goalStats = computePlayerGoalStats(currentPlayerId, teamPlayers, matchTurns, goals);
  const activity = computePlayerActivitySummary(currentPlayerId, allGames, attendances);
  const sport = getSport(pelada.sportId);

  const now = Date.now();
  const upcoming = games
    .filter((g) => new Date(g.scheduledAt).getTime() >= now && g.status !== 'cancelled')
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const past = games
    .filter((g) => new Date(g.scheduledAt).getTime() < now || g.status === 'finished')
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

  return (
    <Screen>
      <View style={styles.peladaHeader}>
        <PeladaSwitcher />
        {pelada.description && <Text style={styles.peladaDescription}>{pelada.description}</Text>}
      </View>
      {!adFree && <AdBanner />}

      <Card style={styles.perfCard}>
        <View style={styles.perfHeaderRow}>
          <Text style={styles.sectionTitle}>Seu desempenho</Text>
          <TrendBadge trend={trend} />
        </View>
        <View style={styles.perfStatsRow}>
          <PerfStat label="Nota geral" value={String(overall.overall)} />
          <PerfStat label="Jogos" value={String(activity.gamesPlayed)} />
          <PerfStat label="Vitórias" value={String(record.wins)} />
          <PerfStat label={scoreLabel(sport.id, goalStats.scored)} value={String(goalStats.scored)} />
        </View>
        {record.played > 0 && (
          <Text style={styles.perfRecordText}>
            {record.wins}V · {record.draws}E · {record.losses}D
            {'  ·  '}saldo {goalStats.balance > 0 ? `+${goalStats.balance}` : goalStats.balance}
          </Text>
        )}
        <Pressable style={styles.perfLink} onPress={() => router.push('/(tabs)/perfil')}>
          <Text style={styles.perfLinkText}>Ver perfil completo</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      </Card>

      {myPeladas.length > 0 && (
        <View style={styles.shortcutsSection}>
          <Text style={styles.sectionTitle}>Seus times</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcutsRow}>
            {myPeladas.map((p) => (
              <TeamShortcut key={p.id} peladaId={p.id} name={p.name} sportId={p.sportId} active={p.id === pelada.id} />
            ))}
            <Pressable style={styles.addTeamShortcut} onPress={() => router.push('/criar-pelada')}>
              <Ionicons name="add" size={20} color={colors.primary} />
              <Text style={styles.addTeamShortcutText}>Novo time</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      <Text style={styles.sectionTitle}>Próximos jogos</Text>
      {upcoming.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Nenhum jogo agendado. Peça para um admin criar um na aba Admin.</Text>
        </View>
      ) : (
        upcoming.map((game) => <GameCard key={game.id} game={game} />)
      )}

      {past.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Jogos anteriores</Text>
          {past.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </>
      )}
    </Screen>
  );
}

function PerfStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.perfStat}>
      <Text style={styles.perfStatValue}>{value}</Text>
      <Text style={styles.perfStatLabel}>{label}</Text>
    </View>
  );
}

function TrendBadge({ trend }: { trend: ReturnType<typeof computeOverallTrend> }) {
  if (trend.direction === 'new' || trend.delta === null) return null;
  const isUp = trend.direction === 'up';
  const isStable = trend.direction === 'stable';
  const color = isStable ? colors.textMuted : isUp ? colors.success : colors.danger;
  const icon = isStable ? 'remove' : isUp ? 'trending-up' : 'trending-down';
  return (
    <View style={[styles.trendBadge, { backgroundColor: `${color}22` }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.trendBadgeText, { color }]}>
        {isStable ? 'estável' : `${trend.delta > 0 ? '+' : ''}${trend.delta}`}
      </Text>
    </View>
  );
}

function TeamShortcut({
  peladaId,
  name,
  sportId,
  active,
}: {
  peladaId: string;
  name: string;
  sportId: string;
  active: boolean;
}) {
  const sport = getSport(sportId);
  return (
    <Pressable style={[styles.teamShortcut, active && styles.teamShortcutActive]} onPress={() => router.push(`/time/${peladaId}`)}>
      <View style={[styles.teamShortcutBadge, { backgroundColor: `${sport.color}26` }]}>
        <Text style={styles.teamShortcutIcon}>{sport.icon}</Text>
      </View>
      <Text style={styles.teamShortcutName} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  peladaHeader: {
    marginBottom: spacing.lg,
  },
  peladaDescription: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  empty: {
    padding: spacing.lg,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  perfCard: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  perfHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -spacing.xs,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  trendBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  perfStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  perfStat: {
    alignItems: 'center',
    flex: 1,
  },
  perfStatValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  perfStatLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  perfRecordText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  perfLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  perfLinkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  shortcutsSection: {
    marginBottom: spacing.lg,
  },
  shortcutsRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  teamShortcut: {
    alignItems: 'center',
    width: 72,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  teamShortcutActive: {
    borderColor: colors.primary,
  },
  teamShortcutBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  teamShortcutIcon: {
    fontSize: 16,
  },
  teamShortcutName: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  addTeamShortcut: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    gap: 4,
  },
  addTeamShortcutText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
});
