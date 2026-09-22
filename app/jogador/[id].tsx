import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PlayerCard } from '@/components/PlayerCard';
import { RotatingCard } from '@/components/RotatingCard';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { computePlayerGoalStats } from '@/lib/goals';
import { computePlayerOverall } from '@/lib/ratings';
import { useAppStore } from '@/store/useAppStore';

export default function JogadorPerfilScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const player = useAppStore((s) => s.players.find((p) => p.id === id));
  const ratings = useAppStore((s) => s.ratings);
  const teamPlayers = useAppStore((s) => s.teamPlayers);
  const matchTurns = useAppStore((s) => s.matchTurns);
  const goals = useAppStore((s) => s.goals);

  if (!player) {
    return (
      <Screen>
        <Text style={styles.text}>Jogador não encontrado.</Text>
      </Screen>
    );
  }

  const overall = computePlayerOverall(player.id, ratings);
  const goalStats = computePlayerGoalStats(player.id, teamPlayers, matchTurns, goals);
  const primarySport = getSport(player.favoriteSports[0]);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{player.nickname || player.name}</Text>
      </View>

      <View style={styles.cardWrap}>
        <RotatingCard>
          <PlayerCard
            name={player.name}
            nickname={player.nickname}
            photoUrl={player.avatarUrl}
            cardBackgroundUrl={player.cardBackgroundUrl}
            position={player.preferredPosition}
            sportId={player.favoriteSports[0]}
            overall={overall}
            goalStats={goalStats}
            width={200}
          />
        </RotatingCard>
      </View>

      <Text style={styles.name}>{player.name}</Text>
      {player.nickname && <Text style={styles.nickname}>"{player.nickname}"</Text>}

      {player.favoriteSports.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Esportes favoritos</Text>
          <View style={styles.sportsRow}>
            {player.favoriteSports.map((sportId) => {
              const sport = getSport(sportId);
              return (
                <View key={sportId} style={[styles.sportChip, { borderColor: sport.color }]}>
                  <Text style={styles.sportChipIcon}>{sport.icon}</Text>
                  <Text style={[styles.sportChipText, { color: sport.color }]}>{sport.label}</Text>
                </View>
              );
            })}
          </View>
        </Card>
      )}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Estatísticas</Text>
        <View style={styles.statsRow}>
          <Stat label="Nota geral" value={String(overall.overall)} />
          <Stat label="Avaliações" value={String(overall.ratingsCount)} />
          <Stat label={primarySport.scorePlural} value={String(goalStats.scored)} />
        </View>
      </Card>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
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
  cardWrap: {
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  name: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  nickname: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  section: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sportsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.bgElevated,
  },
  sportChipIcon: {
    fontSize: 14,
  },
  sportChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 20,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textTransform: 'capitalize',
  },
});
