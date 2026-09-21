import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { computeAllOveralls } from '@/lib/ratings';
import { drawTeams, type DraftedTeam, type DraftPlayer } from '@/lib/teamDraft';
import { useAppStore } from '@/store/useAppStore';
import type { DrawMethod, Team, TeamPlayer } from '@/types';

const TEAM_COLORS = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#A855F7', '#14B8A6'];
const TEAM_NAMES = ['Time A', 'Time B', 'Time C', 'Time D', 'Time E', 'Time F'];

export default function SorteioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = useAppStore((s) => s.games.find((g) => g.id === id));
  const pelada = useAppStore((s) => s.peladas.find((p) => p.id === game?.peladaId));
  const hasGoalkeeper = getSport(pelada?.sportId).hasGoalkeeper;
  const players = useAppStore((s) => s.players);
  const attendances = useAppStore(
    useShallow((s) => s.attendances.filter((a) => a.gameId === id && a.status === 'confirmed')),
  );
  const ratings = useAppStore((s) => s.ratings);
  const setGameTeams = useAppStore((s) => s.setGameTeams);

  const [method, setMethod] = useState<DrawMethod>(game?.drawMethod ?? 'rating');
  const [teamSize, setTeamSize] = useState(String(game?.playersPerTeam ?? getSport(pelada?.sportId).suggestedTeamSize));
  const [preview, setPreview] = useState<DraftedTeam[] | null>(null);

  if (!game) {
    return (
      <Screen>
        <Text style={styles.text}>Jogo não encontrado.</Text>
      </Screen>
    );
  }

  const overalls = computeAllOveralls(players.map((p) => p.id), ratings);

  function handleDraw() {
    const draftPlayers: DraftPlayer[] = attendances.map((a, idx) => {
      const player = players.find((p) => p.id === a.playerId)!;
      return {
        id: player.id,
        name: player.name,
        photoUrl: player.avatarUrl,
        overall: overalls[player.id]?.overall ?? 60,
        isGoalkeeper: hasGoalkeeper && player.preferredPosition === 'goalkeeper',
        confirmedOrder: a.confirmedOrder ?? idx,
      };
    });
    const size = Math.max(2, Number(teamSize) || 6);
    setPreview(drawTeams(draftPlayers, size, method));
  }

  function handleConfirm() {
    if (!preview || !game) return;
    const teams: Team[] = preview.map((t, idx) => ({
      id: `${game.id}-team-${idx}`,
      gameId: game.id,
      name: TEAM_NAMES[idx] ?? `Time ${idx + 1}`,
      color: TEAM_COLORS[idx % TEAM_COLORS.length],
      queueOrder: idx,
    }));
    const teamPlayers: TeamPlayer[] = preview.flatMap((t, idx) =>
      t.players.map((p) => ({
        teamId: teams[idx].id,
        playerId: p.id,
        isGoalkeeper: p.isGoalkeeper,
      })),
    );
    setGameTeams(game.id, teams, teamPlayers);
    router.replace(`/jogo/${game.id}`);
  }

  return (
    <Screen>
      <Text style={styles.subtitle}>{attendances.length} jogadores confirmados</Text>

      <SegmentedControl<DrawMethod>
        label="Método de sorteio"
        value={method}
        onChange={setMethod}
        options={[
          { value: 'arrival', label: 'Ordem de chegada' },
          { value: 'random', label: 'Aleatório' },
          { value: 'rating', label: 'Por nota' },
        ]}
      />
      <TextField label="Jogadores por time" value={teamSize} onChangeText={setTeamSize} keyboardType="number-pad" />

      <Button label="Sortear" onPress={handleDraw} />

      {preview && (
        <View style={{ marginTop: spacing.lg }}>
          {preview.map((team, idx) => (
            <Card key={idx} style={styles.teamCard}>
              <View style={styles.teamHeader}>
                <View style={[styles.dot, { backgroundColor: TEAM_COLORS[idx % TEAM_COLORS.length] }]} />
                <Text style={styles.teamName}>{TEAM_NAMES[idx] ?? `Time ${idx + 1}`}</Text>
                {method === 'rating' && <Text style={styles.teamOverall}>força {team.totalOverall}</Text>}
              </View>
              {team.players.map((p) => (
                <View key={p.id} style={styles.playerRow}>
                  <Avatar name={p.name} photoUrl={p.photoUrl} size={22} />
                  <Text style={styles.playerLine}>
                    {hasGoalkeeper && p.isGoalkeeper ? '🧤 ' : ''}
                    {p.name}
                    {method === 'rating' ? ` (${p.overall})` : ''}
                  </Text>
                </View>
              ))}
            </Card>
          ))}
          <Button label="Confirmar times" onPress={handleConfirm} style={{ marginTop: spacing.sm }} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  text: {
    color: colors.textMuted,
  },
  teamCard: {
    marginBottom: spacing.md,
    gap: 4,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  teamName: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
    flex: 1,
  },
  teamOverall: {
    color: colors.textMuted,
    fontSize: 12,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 1,
  },
  playerLine: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
