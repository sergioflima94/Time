import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function ChampionshipMatchScreen() {
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const championship = useAppStore((s) => s.championships.find((c) => c.id === id));
  const establishment = useAppStore((s) => s.establishments.find((e) => e.id === championship?.establishmentId));
  const match = useAppStore((s) => s.championshipMatches.find((m) => m.id === matchId));
  const teams = useAppStore(useShallow((s) => s.championshipTeams.filter((t) => t.championshipId === id)));
  const rosterRows = useAppStore(useShallow((s) => s.championshipTeamPlayers.filter((tp) => tp.championshipTeamId === match?.teamAId || tp.championshipTeamId === match?.teamBId)));
  const players = useAppStore((s) => s.players);
  const goals = useAppStore(useShallow((s) => s.championshipGoals.filter((g) => g.matchId === matchId)));
  const startChampionshipMatch = useAppStore((s) => s.startChampionshipMatch);
  const registerChampionshipGoal = useAppStore((s) => s.registerChampionshipGoal);
  const undoLastChampionshipGoal = useAppStore((s) => s.undoLastChampionshipGoal);
  const endChampionshipMatch = useAppStore((s) => s.endChampionshipMatch);

  const isOwner = establishment?.ownerPlayerId === currentPlayerId;
  const matchSeconds = (championship?.matchMinutes ?? 10) * 60;
  const [remaining, setRemaining] = useState(matchSeconds);
  const [running, setRunning] = useState(false);
  const [pickingGoalTeam, setPickingGoalTeam] = useState<'A' | 'B' | null>(null);
  const [showPenalties, setShowPenalties] = useState(false);
  const [penA, setPenA] = useState('');
  const [penB, setPenB] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            setRunning(false);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  if (!championship || !match) {
    return (
      <Screen>
        <Text style={styles.text}>Partida não encontrada.</Text>
      </Screen>
    );
  }

  const teamA = teams.find((t) => t.id === match.teamAId);
  const teamB = teams.find((t) => t.id === match.teamBId);
  const rosterOf = (teamId?: string) => rosterRows.filter((r) => r.championshipTeamId === teamId);
  const playerName = (playerId: string) => players.find((p) => p.id === playerId)?.name ?? '—';
  const playerPhoto = (playerId: string) => players.find((p) => p.id === playerId)?.avatarUrl ?? null;

  const scoreA = goals.filter((g) => g.teamId === match.teamAId).length;
  const scoreB = goals.filter((g) => g.teamId === match.teamBId).length;
  const isTied = scoreA === scoreB;
  const isFinished = match.status === 'finished';

  function handleGoal(teamId: string, scorerPlayerId: string | null) {
    registerChampionshipGoal(match!.id, teamId, scorerPlayerId);
    setPickingGoalTeam(null);
  }

  function handleEnd() {
    if (championship!.format === 'knockout' && isTied) {
      setShowPenalties(true);
      return;
    }
    endChampionshipMatch(match!.id);
    setRunning(false);
  }

  function confirmPenalties() {
    endChampionshipMatch(match!.id, Number(penA) || 0, Number(penB) || 0);
    setShowPenalties(false);
    setRunning(false);
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{match.roundLabel}</Text>
      </View>

      {!isFinished && (
        <Card style={styles.timerCard}>
          <Text style={styles.timerLabel}>Tempo da partida</Text>
          <Text style={styles.timer}>{formatTime(remaining)}</Text>
          {isOwner && (
            <View style={styles.timerControls}>
              <Button
                label={running ? 'Pausar' : 'Iniciar'}
                small
                variant={running ? 'secondary' : 'primary'}
                onPress={() => {
                  if (match.status === 'scheduled') startChampionshipMatch(match.id);
                  setRunning((r) => !r);
                }}
              />
            </View>
          )}
        </Card>
      )}

      <Card style={styles.scoreboardCard}>
        <View style={styles.scoreboardRow}>
          <View style={styles.scoreboardSide}>
            {teamA && <Avatar name={teamA.name} photoUrl={teamA.logoUrl} size={24} color={teamA.color} />}
            <Text style={[styles.scoreboardTeam, { color: teamA?.color }]} numberOfLines={1}>{teamA?.name}</Text>
          </View>
          <Text style={styles.scoreboardScore}>{scoreA} - {scoreB}</Text>
          <View style={[styles.scoreboardSide, styles.scoreboardSideRight]}>
            <Text style={[styles.scoreboardTeam, styles.scoreboardTeamRight, { color: teamB?.color }]} numberOfLines={1}>{teamB?.name}</Text>
            {teamB && <Avatar name={teamB.name} photoUrl={teamB.logoUrl} size={24} color={teamB.color} />}
          </View>
        </View>

        {isFinished && (
          <Badge
            label={match.winnerTeamId ? `${teams.find((t) => t.id === match.winnerTeamId)?.name} venceu` + (match.penaltyScoreA !== null ? ` (pênaltis ${match.penaltyScoreA}x${match.penaltyScoreB})` : '') : 'Empate'}
            color={colors.primary}
          />
        )}

        {isOwner && !isFinished && (
          <View style={styles.goalButtonsRow}>
            <Button label={`⚽ Gol ${teamA?.name ?? 'A'}`} small variant="secondary" onPress={() => setPickingGoalTeam('A')} />
            <Button label={`⚽ Gol ${teamB?.name ?? 'B'}`} small variant="secondary" onPress={() => setPickingGoalTeam('B')} />
          </View>
        )}

        {isOwner && pickingGoalTeam && (
          <View style={styles.scorerPicker}>
            <Text style={styles.scorerPickerTitle}>Quem fez o gol?</Text>
            {rosterOf(pickingGoalTeam === 'A' ? match.teamAId ?? undefined : match.teamBId ?? undefined).map((r) => (
              <Pressable key={r.playerId} style={styles.scorerOption} onPress={() => handleGoal(pickingGoalTeam === 'A' ? match.teamAId! : match.teamBId!, r.playerId)}>
                <Avatar name={playerName(r.playerId)} photoUrl={playerPhoto(r.playerId)} size={22} />
                <Text style={styles.scorerOptionText}>{playerName(r.playerId)}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.scorerOption} onPress={() => handleGoal(pickingGoalTeam === 'A' ? match.teamAId! : match.teamBId!, null)}>
              <Text style={styles.scorerOptionText}>Gol contra / sem autor</Text>
            </Pressable>
            <Pressable onPress={() => setPickingGoalTeam(null)}>
              <Text style={styles.cancelPicker}>Cancelar</Text>
            </Pressable>
          </View>
        )}

        {goals.length > 0 && (
          <View style={styles.goalsLog}>
            {goals.map((g) => (
              <Text key={g.id} style={styles.goalsLogText}>
                ⚽ {g.scorerPlayerId ? playerName(g.scorerPlayerId) : 'Gol contra'} ({g.teamId === match.teamAId ? teamA?.name : teamB?.name})
              </Text>
            ))}
            {isOwner && !isFinished && (
              <Pressable onPress={() => undoLastChampionshipGoal(match.id)}>
                <Text style={styles.undoLink}>Desfazer último gol</Text>
              </Pressable>
            )}
          </View>
        )}
      </Card>

      {isOwner && !isFinished && !showPenalties && (
        <Button label="Encerrar partida" variant="danger" onPress={handleEnd} style={{ marginTop: spacing.lg }} />
      )}

      {showPenalties && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Empatou — decide nos pênaltis</Text>
          <View style={styles.penRow}>
            <TextField label={teamA?.name ?? 'A'} value={penA} onChangeText={setPenA} keyboardType="number-pad" style={{ flex: 1 }} />
            <TextField label={teamB?.name ?? 'B'} value={penB} onChangeText={setPenB} keyboardType="number-pad" style={{ flex: 1 }} />
          </View>
          <Button label="Confirmar resultado" onPress={confirmPenalties} disabled={penA === '' || penB === '' || penA === penB} />
        </Card>
      )}
    </Screen>
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
  timerCard: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  timerLabel: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timer: {
    color: colors.text,
    fontSize: 48,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  timerControls: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  scoreboardCard: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  scoreboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scoreboardSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoreboardSideRight: {
    flexDirection: 'row-reverse',
  },
  scoreboardTeam: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  scoreboardTeamRight: {
    textAlign: 'right',
  },
  scoreboardScore: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    paddingHorizontal: spacing.sm,
  },
  goalButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  scorerPicker: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 6,
  },
  scorerPickerTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  scorerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  scorerOptionText: {
    color: colors.text,
    fontSize: 14,
  },
  cancelPicker: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 4,
  },
  goalsLog: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: spacing.sm,
    gap: 4,
  },
  goalsLogText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  undoLink: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  section: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  penRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
