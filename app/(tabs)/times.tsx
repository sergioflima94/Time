import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { useCurrentPelada } from '@/hooks/useCurrentPelada';
import { formatGameDateShort } from '@/lib/format';
import { TEAM_COLORS } from '@/lib/teamDraft';
import { useAppStore } from '@/store/useAppStore';

export default function TimesScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const pelada = useCurrentPelada();
  const isAdmin = useAppStore((s) => s.isAdmin(currentPlayerId, pelada.id));
  const sport = getSport(pelada.sportId);

  const games = useAppStore(useShallow((s) => s.games.filter((g) => g.peladaId === pelada.id)));
  const activeGame = [...games]
    .filter((g) => g.status === 'teams_drawn' || g.status === 'in_progress')
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];

  const teams = useAppStore(useShallow((s) => (activeGame ? s.teams.filter((t) => t.gameId === activeGame.id) : [])));
  const teamPlayers = useAppStore((s) => s.teamPlayers);
  const players = useAppStore((s) => s.players);
  const queue = useAppStore((s) => (activeGame ? s.matchQueue[activeGame.id] : undefined));
  const waitingPlayers = useAppStore(
    useShallow((s) => (activeGame ? s.waitingPlayers.filter((w) => w.gameId === activeGame.id) : [])),
  );
  const updateTeam = useAppStore((s) => s.updateTeam);
  const moveTeamInQueue = useAppStore((s) => s.moveTeamInQueue);

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [pickingColorFor, setPickingColorFor] = useState<string | null>(null);

  if (!activeGame) {
    return (
      <Screen>
        <Text style={styles.title}>Times</Text>
        <View style={styles.empty}>
          <Ionicons name="shirt-outline" size={32} color={colors.textFaint} />
          <Text style={styles.emptyText}>
            Nenhum jogo com times sorteados agora. Sorteie os times de um jogo na Agenda pra
            ver e gerenciar eles aqui.
          </Text>
          <Button label="Ir pra Agenda" small onPress={() => router.push('/(tabs)')} />
        </View>
      </Screen>
    );
  }

  const rosterOf = (teamId: string) => teamPlayers.filter((tp) => tp.teamId === teamId);
  const playerName = (playerId: string) => players.find((p) => p.id === playerId)?.name ?? '—';
  const playerPhoto = (playerId: string) => players.find((p) => p.id === playerId)?.avatarUrl ?? null;
  const [playingAId, playingBId] = queue ?? [];
  const isIndividual = activeGame.rotationMode === 'players';

  function handleStartEdit(teamId: string, currentName: string) {
    setEditingTeamId(teamId);
    setNameDraft(currentName);
    setPickingColorFor(null);
  }

  function handleSaveName(teamId: string) {
    if (nameDraft.trim()) updateTeam(teamId, { name: nameDraft.trim() });
    setEditingTeamId(null);
  }

  const sortedWaitingPlayers = [...waitingPlayers].sort(
    (a, b) => b.roundsWaited - a.roundsWaited || a.tiebreakRank - b.tiebreakRank,
  );

  return (
    <Screen>
      <Text style={styles.title}>Times</Text>
      <Text style={styles.subtitle}>
        {sport.icon} {pelada.name} · {formatGameDateShort(activeGame.scheduledAt)}
      </Text>

      {teams.map((team) => {
        const isPlaying = team.id === playingAId || team.id === playingBId;
        const roster = rosterOf(team.id);
        const isEditingName = editingTeamId === team.id;

        return (
          <Card key={team.id} style={styles.teamCard}>
            <View style={styles.teamHeaderRow}>
              <View style={[styles.dot, { backgroundColor: team.color }]} />
              {isEditingName ? (
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  style={styles.nameInput}
                  placeholderTextColor={colors.textFaint}
                  autoFocus
                />
              ) : (
                <Text style={styles.teamName} numberOfLines={1}>
                  {team.name}
                </Text>
              )}
              <Badge label={isPlaying ? 'Jogando' : 'Aguardando'} color={isPlaying ? colors.primary : colors.textFaint} />
            </View>

            {isAdmin && (
              <View style={styles.adminRow}>
                {isEditingName ? (
                  <>
                    <Pressable onPress={() => handleSaveName(team.id)}>
                      <Text style={styles.adminLink}>Salvar</Text>
                    </Pressable>
                    <Pressable onPress={() => setEditingTeamId(null)}>
                      <Text style={styles.adminLinkMuted}>Cancelar</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable onPress={() => handleStartEdit(team.id, team.name)}>
                    <Text style={styles.adminLink}>Renomear</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setPickingColorFor(pickingColorFor === team.id ? null : team.id)}>
                  <Text style={styles.adminLink}>Cor</Text>
                </Pressable>
                {!isPlaying && !isIndividual && (
                  <View style={styles.reorderRow}>
                    <Pressable onPress={() => moveTeamInQueue(activeGame.id, team.id, 'up')} hitSlop={6}>
                      <Ionicons name="chevron-up-circle-outline" size={20} color={colors.textMuted} />
                    </Pressable>
                    <Pressable onPress={() => moveTeamInQueue(activeGame.id, team.id, 'down')} hitSlop={6}>
                      <Ionicons name="chevron-down-circle-outline" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {pickingColorFor === team.id && (
              <View style={styles.colorRow}>
                {TEAM_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => {
                      updateTeam(team.id, { color: c });
                      setPickingColorFor(null);
                    }}
                    style={[styles.colorSwatch, { backgroundColor: c }, c === team.color && styles.colorSwatchActive]}
                  />
                ))}
              </View>
            )}

            {roster.map((r) => (
              <View key={r.playerId} style={styles.playerRow}>
                <Avatar name={playerName(r.playerId)} photoUrl={playerPhoto(r.playerId)} size={22} />
                <Text style={styles.playerText}>
                  {r.isGoalkeeper ? '🧤 ' : ''}
                  {playerName(r.playerId)}
                </Text>
              </View>
            ))}
            {roster.length === 0 && <Text style={styles.emptyRoster}>Sem jogadores neste time ainda.</Text>}
          </Card>
        );
      })}

      {isIndividual && sortedWaitingPlayers.length > 0 && (
        <Card style={styles.teamCard}>
          <Text style={styles.teamName}>Fila de espera individual</Text>
          <Text style={styles.hint}>Quem já esperou mais rodadas entra primeiro no próximo confronto.</Text>
          {sortedWaitingPlayers.map((w, i) => (
            <View key={w.playerId} style={styles.playerRow}>
              <Avatar name={playerName(w.playerId)} photoUrl={playerPhoto(w.playerId)} size={22} />
              <Text style={styles.playerText}>
                {w.isGoalkeeper ? '🧤 ' : ''}
                {playerName(w.playerId)}
              </Text>
              <Text style={styles.waitingBadge}>{i === 0 ? 'próximo' : `${w.roundsWaited}x fora`}</Text>
            </View>
          ))}
        </Card>
      )}

      <Button
        label={activeGame.status === 'in_progress' ? 'Abrir cronômetro' : 'Ir pro jogo'}
        onPress={() => router.push(`/jogo/${activeGame.id}/cronometro`)}
        style={{ marginTop: spacing.sm }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  emptyRoster: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  teamCard: {
    marginBottom: spacing.md,
    gap: 4,
  },
  teamHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
  },
  teamName: {
    flex: 1,
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  nameInput: {
    flex: 1,
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 2,
  },
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    marginBottom: 4,
  },
  adminLink: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  adminLinkMuted: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: '600',
  },
  reorderRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginLeft: 'auto',
  },
  colorRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: colors.text,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  playerText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
  },
  waitingBadge: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '600',
  },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
});
