import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport, scoreLabel } from '@/constants/sports';
import { advanceQueue, type MatchResult } from '@/lib/teamDraft';
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

export default function CronometroScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const game = useAppStore((s) => s.games.find((g) => g.id === id));
  const pelada = useAppStore((s) => s.peladas.find((p) => p.id === game?.peladaId));
  const sport = getSport(pelada?.sportId);
  const scoreWord = sport.scoreSingular.charAt(0).toUpperCase() + sport.scoreSingular.slice(1);
  const teams = useAppStore(useShallow((s) => s.teams.filter((t) => t.gameId === id)));
  const teamPlayers = useAppStore((s) => s.teamPlayers);
  const players = useAppStore((s) => s.players);
  const queue = useAppStore((s) => (id ? s.matchQueue[id] : undefined));
  const setMatchQueue = useAppStore((s) => s.setMatchQueue);
  const matchTurns = useAppStore(useShallow((s) => s.matchTurns.filter((t) => t.gameId === id)));
  const goals = useAppStore(useShallow((s) => s.goals.filter((g) => g.gameId === id)));
  const playerFatigue = useAppStore(useShallow((s) => s.playerFatigue.filter((f) => f.gameId === id)));
  const startMatchTurn = useAppStore((s) => s.startMatchTurn);
  const endMatchTurn = useAppStore((s) => s.endMatchTurn);
  const registerGoal = useAppStore((s) => s.registerGoal);
  const undoLastGoal = useAppStore((s) => s.undoLastGoal);
  const substitutePlayer = useAppStore((s) => s.substitutePlayer);
  const clearPlayerFatigue = useAppStore((s) => s.clearPlayerFatigue);
  const isAdmin = useAppStore((s) => (game ? s.isAdmin(currentPlayerId, game.peladaId) : false));

  const matchSeconds = (game?.matchMinutes ?? 10) * 60;
  const matchGoalLimit = game?.matchGoalLimit ?? null;
  const [remaining, setRemaining] = useState(matchSeconds);
  const [running, setRunning] = useState(false);
  const [pickingGoalTeam, setPickingGoalTeam] = useState<'A' | 'B' | null>(null);
  const [substituting, setSubstituting] = useState<{ teamId: string; playerId: string } | null>(null);
  const [subReason, setSubReason] = useState<'normal' | 'resting' | 'done_for_today'>('normal');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentTurn = matchTurns.find((t) => !t.endedAt);

  useEffect(() => {
    if (!id || !queue || queue.length < 2) return;
    if (!matchTurns.some((t) => !t.endedAt)) {
      startMatchTurn(id, queue[0], queue[1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, queue?.[0], queue?.[1], matchTurns.length]);

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

  // tempo esgotou: decide o resultado automaticamente pelo placar (empate se igual)
  useEffect(() => {
    if (remaining !== 0 || !currentTurn) return;
    const scoreA = goals.filter((g) => g.matchTurnId === currentTurn.id && g.teamId === currentTurn.teamAId).length;
    const scoreB = goals.filter((g) => g.matchTurnId === currentTurn.id && g.teamId === currentTurn.teamBId).length;
    if (scoreA > scoreB) handleResult('teamA');
    else if (scoreB > scoreA) handleResult('teamB');
    else handleResult('draw');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  if (!game) {
    return (
      <Screen>
        <Text style={styles.text}>Jogo não encontrado.</Text>
      </Screen>
    );
  }

  if (!queue || queue.length < 2) {
    return (
      <Screen>
        <Text style={styles.text}>Sorteie os times antes de iniciar o cronômetro.</Text>
      </Screen>
    );
  }

  const teamOf = (teamId: string) => teams.find((t) => t.id === teamId);
  const rosterOf = (teamId: string) => teamPlayers.filter((tp) => tp.teamId === teamId);
  const playerName = (playerId: string) => players.find((p) => p.id === playerId)?.name ?? '—';
  const playerPhoto = (playerId: string) => players.find((p) => p.id === playerId)?.avatarUrl ?? null;

  const [teamAId, teamBId, ...waitingIds] = queue;
  const teamA = teamOf(teamAId);
  const teamB = teamOf(teamBId);
  const scoreOf = (teamId: string) => (currentTurn ? goals.filter((g) => g.matchTurnId === currentTurn.id && g.teamId === teamId).length : 0);
  const scoreA = scoreOf(teamAId);
  const scoreB = scoreOf(teamBId);
  const turnGoals = currentTurn ? goals.filter((g) => g.matchTurnId === currentTurn.id) : [];

  const onFieldIds = new Set([...rosterOf(teamAId), ...rosterOf(teamBId)].map((r) => r.playerId));
  const fatiguedIds = new Set(
    playerFatigue
      .filter((f) => f.status === 'done_for_today' || (f.status === 'resting' && (f.matchesRemaining ?? 0) > 0))
      .map((f) => f.playerId),
  );
  const gameTeamIds = new Set(teams.map((t) => t.id));
  const substituteCandidates = teamPlayers.filter(
    (tp) => gameTeamIds.has(tp.teamId) && !onFieldIds.has(tp.playerId) && !fatiguedIds.has(tp.playerId),
  );

  function handleSubstitute(inPlayerId: string) {
    if (!id || !substituting) return;
    substitutePlayer(id, substituting.teamId, substituting.playerId, inPlayerId, subReason);
    setSubstituting(null);
    setSubReason('normal');
  }

  function handleResult(result: MatchResult) {
    if (!id || !queue) return;
    if (currentTurn) {
      const winnerTeamId = result === 'teamA' ? currentTurn.teamAId : result === 'teamB' ? currentTurn.teamBId : null;
      endMatchTurn(currentTurn.id, winnerTeamId);
    }
    const nextQueue = advanceQueue(queue, result);
    setMatchQueue(id, nextQueue);
    if (nextQueue.length >= 2) startMatchTurn(id, nextQueue[0], nextQueue[1]);
    setRemaining(matchSeconds);
    setRunning(false);
    setPickingGoalTeam(null);
  }

  function handleGoal(teamId: string, scorerPlayerId: string | null) {
    if (!id || !currentTurn) return;
    registerGoal(id, currentTurn.id, teamId, scorerPlayerId);
    setPickingGoalTeam(null);
    const newScore = scoreOf(teamId) + 1;
    if (matchGoalLimit && newScore >= matchGoalLimit) {
      handleResult(teamId === teamAId ? 'teamA' : 'teamB');
    }
  }

  const progress = 1 - remaining / matchSeconds;

  return (
    <Screen>
      <Card style={styles.timerCard}>
        <Text style={styles.timerLabel}>
          Tempo da rodada{game.matchGoalLimit ? ` · até ${game.matchGoalLimit} ${scoreLabel(sport.id, game.matchGoalLimit)}` : ''}
        </Text>
        <Text style={styles.timer}>{formatTime(remaining)}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(100, progress * 100)}%` }]} />
        </View>
        {isAdmin && (
          <View style={styles.timerControls}>
            <Button
              label={running ? 'Pausar' : 'Iniciar'}
              onPress={() => setRunning((r) => !r)}
              variant={running ? 'secondary' : 'primary'}
              small
            />
            <Button
              label="Zerar"
              variant="outline"
              small
              onPress={() => {
                setRunning(false);
                setRemaining(matchSeconds);
              }}
            />
          </View>
        )}
      </Card>

      <Card style={styles.scoreboardCard}>
        <View style={styles.scoreboardRow}>
          <Text style={styles.scoreboardTeam} numberOfLines={1}>
            {teamA?.name}
          </Text>
          <View style={styles.scoreboardScoreWrap}>
            <Text style={styles.scoreboardScore}>
              {scoreA} - {scoreB}
            </Text>
          </View>
          <Text style={[styles.scoreboardTeam, { textAlign: 'right' }]} numberOfLines={1}>
            {teamB?.name}
          </Text>
        </View>

        {isAdmin && (
          <View style={styles.goalButtonsRow}>
            <Button
              label={`${sport.icon} ${scoreWord} ${teamA?.name ?? 'Time A'}`}
              small
              variant="secondary"
              onPress={() => setPickingGoalTeam('A')}
            />
            <Button
              label={`${sport.icon} ${scoreWord} ${teamB?.name ?? 'Time B'}`}
              small
              variant="secondary"
              onPress={() => setPickingGoalTeam('B')}
            />
          </View>
        )}

        {isAdmin && pickingGoalTeam && (
          <View style={styles.scorerPicker}>
            <Text style={styles.scorerPickerTitle}>Quem fez o {sport.scoreSingular}?</Text>
            <View style={styles.scorerList}>
              {rosterOf(pickingGoalTeam === 'A' ? teamAId : teamBId).map((r) => (
                <Pressable
                  key={r.playerId}
                  style={styles.scorerOption}
                  onPress={() => handleGoal(pickingGoalTeam === 'A' ? teamAId : teamBId, r.playerId)}
                >
                  <Avatar name={playerName(r.playerId)} photoUrl={playerPhoto(r.playerId)} size={22} />
                  <Text style={styles.scorerOptionText}>{playerName(r.playerId)}</Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.scorerOption}
                onPress={() => handleGoal(pickingGoalTeam === 'A' ? teamAId : teamBId, null)}
              >
                <View style={styles.scorerUnknownIcon}>
                  <Ionicons name="help" size={14} color={colors.textMuted} />
                </View>
                <Text style={styles.scorerOptionText}>{sport.hasGoalkeeper ? `${scoreWord} contra / sem autor` : `${scoreWord} sem autor`}</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => setPickingGoalTeam(null)}>
              <Text style={styles.cancelPicker}>Cancelar</Text>
            </Pressable>
          </View>
        )}

        {turnGoals.length > 0 && (
          <View style={styles.goalsLog}>
            {turnGoals.map((g) => (
              <View key={g.id} style={styles.goalsLogRow}>
                <Text style={styles.goalsLogText}>
                  {sport.icon} {g.scorerPlayerId ? playerName(g.scorerPlayerId) : `${scoreWord} contra`} (
                  {g.teamId === teamAId ? teamA?.name : teamB?.name})
                </Text>
              </View>
            ))}
            {isAdmin && (
              <Pressable onPress={() => currentTurn && undoLastGoal(currentTurn.id)}>
                <Text style={styles.undoLink}>Desfazer último {sport.scoreSingular}</Text>
              </Pressable>
            )}
          </View>
        )}
      </Card>

      <View style={styles.matchup}>
        <TeamBox
          name={teamA?.name}
          color={teamA?.color}
          roster={rosterOf(teamAId)}
          playerName={playerName}
          playerPhoto={playerPhoto}
          onPressPlayer={isAdmin ? (playerId) => setSubstituting({ teamId: teamAId, playerId }) : undefined}
        />
        <Text style={styles.vs}>x</Text>
        <TeamBox
          name={teamB?.name}
          color={teamB?.color}
          roster={rosterOf(teamBId)}
          playerName={playerName}
          playerPhoto={playerPhoto}
          onPressPlayer={isAdmin ? (playerId) => setSubstituting({ teamId: teamBId, playerId }) : undefined}
        />
      </View>

      {isAdmin && substituting && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Substituir {playerName(substituting.playerId)}</Text>

          <Text style={styles.subLabel}>Motivo</Text>
          <View style={styles.reasonRow}>
            <Pressable
              style={[styles.reasonChip, subReason === 'normal' && styles.reasonChipActive]}
              onPress={() => setSubReason('normal')}
            >
              <Text style={[styles.reasonChipText, subReason === 'normal' && styles.reasonChipTextActive]}>Troca normal</Text>
            </Pressable>
            <Pressable
              style={[styles.reasonChip, subReason === 'resting' && styles.reasonChipActive]}
              onPress={() => setSubReason('resting')}
            >
              <Text style={[styles.reasonChipText, subReason === 'resting' && styles.reasonChipTextActive]}>🥵 Cansado · 2 partidas fora</Text>
            </Pressable>
            <Pressable
              style={[styles.reasonChip, subReason === 'done_for_today' && styles.reasonChipActive]}
              onPress={() => setSubReason('done_for_today')}
            >
              <Text style={[styles.reasonChipText, subReason === 'done_for_today' && styles.reasonChipTextActive]}>🏠 Encerrou por hoje</Text>
            </Pressable>
          </View>

          <Text style={styles.subLabel}>Quem entra</Text>
          {substituteCandidates.length === 0 && <Text style={styles.hint}>Ninguém disponível pra entrar agora.</Text>}
          <View style={styles.scorerList}>
            {substituteCandidates.map((c) => (
              <Pressable key={c.playerId} style={styles.scorerOption} onPress={() => handleSubstitute(c.playerId)}>
                <Avatar name={playerName(c.playerId)} photoUrl={playerPhoto(c.playerId)} size={22} />
                <Text style={styles.scorerOptionText}>{playerName(c.playerId)}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => {
              setSubstituting(null);
              setSubReason('normal');
            }}
          >
            <Text style={styles.cancelPicker}>Cancelar</Text>
          </Pressable>
        </Card>
      )}

      {playerFatigue.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Jogadores de fora</Text>
          {playerFatigue.map((f) => (
            <View key={f.id} style={styles.waitingRow}>
              <Text style={styles.waitingName}>{playerName(f.playerId)}</Text>
              <Text style={styles.hint}>
                {f.status === 'done_for_today' ? '🏠 encerrou por hoje' : `🥵 volta em ${f.matchesRemaining} rodada${f.matchesRemaining === 1 ? '' : 's'}`}
              </Text>
              <Pressable onPress={() => id && clearPlayerFatigue(id, f.playerId)}>
                <Text style={styles.undoLink}>voltar a jogar</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      {isAdmin && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Encerrar rodada manualmente</Text>
          <View style={styles.resultRow}>
            <Button label={`${teamA?.name ?? 'Time A'} venceu`} small onPress={() => handleResult('teamA')} />
            <Button label={`${teamB?.name ?? 'Time B'} venceu`} small onPress={() => handleResult('teamB')} />
          </View>
          <Button label="Empate" small variant="secondary" onPress={() => handleResult('draw')} />
        </Card>
      )}

      {waitingIds.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Próximos de fora</Text>
          {waitingIds.map((tId) => {
            const t = teamOf(tId);
            return (
              <View key={tId} style={styles.waitingRow}>
                <View style={[styles.dot, { backgroundColor: t?.color }]} />
                <Text style={styles.waitingName}>{t?.name}</Text>
                <Text style={styles.waitingCount}>{rosterOf(tId).length} jogadores</Text>
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

function TeamBox({
  name,
  color,
  roster,
  playerName,
  playerPhoto,
  onPressPlayer,
}: {
  name?: string;
  color?: string;
  roster: { playerId: string; isGoalkeeper: boolean }[];
  playerName: (id: string) => string;
  playerPhoto: (id: string) => string | null;
  onPressPlayer?: (playerId: string) => void;
}) {
  return (
    <View style={styles.teamBox}>
      <Badge label={name ?? '—'} color={color ?? colors.primary} />
      {roster.map((r) => (
        <Pressable
          key={r.playerId}
          style={styles.teamBoxPlayerRow}
          onPress={onPressPlayer ? () => onPressPlayer(r.playerId) : undefined}
        >
          <Avatar name={playerName(r.playerId)} photoUrl={playerPhoto(r.playerId)} size={22} />
          <Text style={styles.teamBoxPlayer}>
            {r.isGoalkeeper ? '🧤 ' : ''}
            {playerName(r.playerId)}
          </Text>
          {onPressPlayer && <Ionicons name="swap-horizontal" size={13} color={colors.textFaint} />}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
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
    fontSize: 56,
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
    marginTop: spacing.md,
    gap: spacing.sm,
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
  scoreboardScoreWrap: {
    paddingHorizontal: spacing.sm,
  },
  scoreboardScore: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
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
  goalsLogRow: {
    flexDirection: 'row',
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
  matchup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  teamBox: {
    flex: 1,
    gap: 4,
  },
  teamBoxPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  teamBoxPlayer: {
    color: colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
  vs: {
    color: colors.textFaint,
    fontSize: 16,
    fontWeight: '700',
    marginTop: spacing.sm,
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
  resultRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  waitingName: {
    color: colors.text,
    fontSize: 14,
    flex: 1,
  },
  waitingCount: {
    color: colors.textMuted,
    fontSize: 12,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  subLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  reasonChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.bgElevated,
  },
  reasonChipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  reasonChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  reasonChipTextActive: {
    color: colors.primary,
  },
});
