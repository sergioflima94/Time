import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { useAppStore } from '@/store/useAppStore';

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

export default function FriendlyMatchScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const match = useAppStore((s) => s.friendlyMatches.find((m) => m.id === matchId));
  const peladaA = useAppStore((s) => s.peladas.find((p) => p.id === match?.peladaAId));
  const peladaB = useAppStore((s) => s.peladas.find((p) => p.id === match?.peladaBId));
  const goals = useAppStore(useShallow((s) => s.friendlyMatchGoals.filter((g) => g.matchId === matchId)));
  const players = useAppStore((s) => s.players);
  const memberships = useAppStore(useShallow((s) => s.memberships.filter((m) => m.active)));
  const isAdminA = useAppStore((s) => (match ? s.isAdmin(currentPlayerId, match.peladaAId) : false));
  const isAdminB = useAppStore((s) => (match ? s.isAdmin(currentPlayerId, match.peladaBId) : false));
  const startFriendlyMatch = useAppStore((s) => s.startFriendlyMatch);
  const registerFriendlyGoal = useAppStore((s) => s.registerFriendlyGoal);
  const undoLastFriendlyGoal = useAppStore((s) => s.undoLastFriendlyGoal);
  const endFriendlyMatch = useAppStore((s) => s.endFriendlyMatch);

  const isAdmin = isAdminA || isAdminB;
  const matchSeconds = (match?.matchMinutes ?? 10) * 60;
  const [remaining, setRemaining] = useState(matchSeconds);
  const [running, setRunning] = useState(false);
  const [pickingGoalSide, setPickingGoalSide] = useState<'A' | 'B' | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            Vibration.vibrate([0, 400, 200, 400]);
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

  if (!match || !peladaA || !peladaB) {
    return (
      <Screen>
        <Text style={styles.text}>Partida não encontrada.</Text>
      </Screen>
    );
  }

  const sport = getSport(match.sportId);
  const scoreWord = sport.scoreSingular.charAt(0).toUpperCase() + sport.scoreSingular.slice(1);

  const rosterOf = (peladaId: string) => {
    const memberIds = new Set(memberships.filter((m) => m.peladaId === peladaId).map((m) => m.playerId));
    return players.filter((p) => memberIds.has(p.id));
  };
  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? '—';
  const playerPhoto = (id: string) => players.find((p) => p.id === id)?.avatarUrl ?? null;

  const scoreA = goals.filter((g) => g.peladaId === match.peladaAId).length;
  const scoreB = goals.filter((g) => g.peladaId === match.peladaBId).length;

  function handleGoal(peladaId: string, scorerId: string | null) {
    if (!match) return;
    registerFriendlyGoal(match.id, peladaId, scorerId);
    setPickingGoalSide(null);
  }

  function handleEnd() {
    if (!match) return;
    let winnerPeladaId: string | null = null;
    if (scoreA > scoreB) winnerPeladaId = match.peladaAId;
    else if (scoreB > scoreA) winnerPeladaId = match.peladaBId;
    endFriendlyMatch(match.id, winnerPeladaId);
  }

  const isFinished = match.status === 'finished';

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{sport.icon} Desafio</Text>
          <Text style={styles.headerSub}>Amistoso · {sport.label}</Text>
        </View>
        {isFinished && (
          <Badge
            label={match.winnerPeladaId ? `${match.winnerPeladaId === peladaA.id ? peladaA.name : peladaB.name} venceu` : 'Empate'}
            color={colors.primary}
          />
        )}
      </View>

      {!isFinished && (
        <Card style={styles.timerCard}>
          <Text style={styles.timerLabel}>Tempo da partida</Text>
          <Text style={styles.timer}>{formatTime(remaining)}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(100, (1 - remaining / matchSeconds) * 100)}%` }]} />
          </View>
          {isAdmin && (
            <View style={styles.timerControls}>
              <Button
                label={running ? 'Pausar' : 'Iniciar'}
                small
                variant={running ? 'secondary' : 'primary'}
                onPress={() => {
                  if (match.status === 'scheduled') startFriendlyMatch(match.id);
                  setRunning((r) => !r);
                }}
              />
              <Button label="Zerar" small variant="outline" onPress={() => { setRunning(false); setRemaining(matchSeconds); }} />
            </View>
          )}
        </Card>
      )}

      <Card style={styles.scoreboardCard}>
        <View style={styles.scoreboardRow}>
          <Text style={styles.scoreboardTeam} numberOfLines={1}>
            {peladaA.name}
          </Text>
          <Text style={styles.scoreboardScore}>
            {scoreA} - {scoreB}
          </Text>
          <Text style={[styles.scoreboardTeam, { textAlign: 'right' }]} numberOfLines={1}>
            {peladaB.name}
          </Text>
        </View>

        {isAdmin && !isFinished && (
          <View style={styles.goalButtonsRow}>
            <Button label={`${sport.icon} ${scoreWord} ${peladaA.name}`} small variant="secondary" onPress={() => setPickingGoalSide('A')} />
            <Button label={`${sport.icon} ${scoreWord} ${peladaB.name}`} small variant="secondary" onPress={() => setPickingGoalSide('B')} />
          </View>
        )}

        {isAdmin && pickingGoalSide && (
          <View style={styles.scorerPicker}>
            <Text style={styles.scorerPickerTitle}>Quem fez o {sport.scoreSingular}?</Text>
            <View style={styles.scorerList}>
              {rosterOf(pickingGoalSide === 'A' ? peladaA.id : peladaB.id).map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.scorerOption}
                  onPress={() => handleGoal(pickingGoalSide === 'A' ? peladaA.id : peladaB.id, p.id)}
                >
                  <Avatar name={playerName(p.id)} photoUrl={playerPhoto(p.id)} size={22} />
                  <Text style={styles.scorerOptionText}>{playerName(p.id)}</Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.scorerOption}
                onPress={() => handleGoal(pickingGoalSide === 'A' ? peladaA.id : peladaB.id, null)}
              >
                <View style={styles.scorerUnknownIcon}>
                  <Ionicons name="help" size={14} color={colors.textMuted} />
                </View>
                <Text style={styles.scorerOptionText}>{sport.hasGoalkeeper ? `${scoreWord} contra / sem autor` : `${scoreWord} sem autor`}</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => setPickingGoalSide(null)}>
              <Text style={styles.cancelPicker}>Cancelar</Text>
            </Pressable>
          </View>
        )}

        {goals.length > 0 && (
          <View style={styles.goalsLog}>
            {goals.map((g) => (
              <Text key={g.id} style={styles.goalsLogText}>
                {sport.icon} {g.scorerPlayerId ? playerName(g.scorerPlayerId) : `${scoreWord} contra`} (
                {g.peladaId === peladaA.id ? peladaA.name : peladaB.name})
              </Text>
            ))}
            {isAdmin && !isFinished && (
              <Pressable onPress={() => undoLastFriendlyGoal(match.id)}>
                <Text style={styles.undoLink}>Desfazer último {sport.scoreSingular}</Text>
              </Pressable>
            )}
          </View>
        )}
      </Card>

      {isAdmin && !isFinished && (
        <Button label="Encerrar partida" variant="secondary" onPress={handleEnd} />
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
    fontSize: 20,
    fontWeight: '800',
  },
  headerSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  timerCard: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
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
  progressTrack: {
    height: 6,
    width: '100%',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  timerControls: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  scoreboardCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  scoreboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scoreboardTeam: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
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
    gap: spacing.xs,
  },
  scorerPickerTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  scorerList: {
    gap: 2,
    maxHeight: 260,
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
  scorerUnknownIcon: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelPicker: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: spacing.xs,
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
});
