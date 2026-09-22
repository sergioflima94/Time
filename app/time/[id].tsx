import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
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
import { formatGameDateShort } from '@/lib/format';
import { computeAllOveralls } from '@/lib/ratings';
import { TEAM_COLORS } from '@/lib/teamDraft';
import { useAppStore } from '@/store/useAppStore';

export default function TimeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const pelada = useAppStore((s) => s.peladas.find((p) => p.id === id));
  const isAdmin = useAppStore((s) => (pelada ? s.isAdmin(currentPlayerId, pelada.id) : false));
  const setCurrentPelada = useAppStore((s) => s.setCurrentPelada);

  const memberIds = useAppStore(
    useShallow((s) =>
      pelada ? new Set(s.memberships.filter((m) => m.peladaId === pelada.id && m.active).map((m) => m.playerId)) : new Set<string>(),
    ),
  );
  const players = useAppStore((s) => s.players);
  const ratings = useAppStore((s) => s.ratings);

  const games = useAppStore(useShallow((s) => (pelada ? s.games.filter((g) => g.peladaId === pelada.id) : [])));
  const activeGame = [...games]
    .filter((g) => g.status === 'teams_drawn' || g.status === 'in_progress')
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];

  const teams = useAppStore(useShallow((s) => (activeGame ? s.teams.filter((t) => t.gameId === activeGame.id) : [])));
  const teamPlayers = useAppStore((s) => s.teamPlayers);
  const queue = useAppStore((s) => (activeGame ? s.matchQueue[activeGame.id] : undefined));
  const waitingPlayers = useAppStore(
    useShallow((s) => (activeGame ? s.waitingPlayers.filter((w) => w.gameId === activeGame.id) : [])),
  );
  const updateTeam = useAppStore((s) => s.updateTeam);
  const moveTeamInQueue = useAppStore((s) => s.moveTeamInQueue);

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [pickingColorFor, setPickingColorFor] = useState<string | null>(null);

  if (!pelada) {
    return (
      <Screen>
        <Text style={styles.text}>Time não encontrado.</Text>
      </Screen>
    );
  }

  const sport = getSport(pelada.sportId);
  const overalls = computeAllOveralls(players.map((p) => p.id), ratings);
  const roster = players
    .filter((p) => memberIds.has(p.id))
    .sort((a, b) => (overalls[b.id]?.overall ?? 0) - (overalls[a.id]?.overall ?? 0));

  const rosterOf = (teamId: string) => teamPlayers.filter((tp) => tp.teamId === teamId);
  const playerName = (playerId: string) => players.find((p) => p.id === playerId)?.name ?? '—';
  const playerPhoto = (playerId: string) => players.find((p) => p.id === playerId)?.avatarUrl ?? null;
  const [playingAId, playingBId] = queue ?? [];
  const isIndividual = activeGame?.rotationMode === 'players';

  function handleManage() {
    setCurrentPelada(pelada!.id);
    router.push('/(tabs)/admin');
  }

  function handleAgenda() {
    setCurrentPelada(pelada!.id);
    router.push('/(tabs)');
  }

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
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {sport.icon} {pelada.name}
          </Text>
          <Text style={[styles.headerSub, { color: sport.color }]}>{sport.label}</Text>
        </View>
        {isAdmin && <Badge label="Admin" color={colors.special} />}
      </View>

      {pelada.description && <Text style={styles.description}>{pelada.description}</Text>}

      <View style={styles.actionsRow}>
        <Button label="Ver agenda" small variant="secondary" onPress={handleAgenda} />
        {isAdmin && <Button label="Administrar" small onPress={handleManage} />}
      </View>

      {activeGame && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Time sorteado · {formatGameDateShort(activeGame.scheduledAt)}</Text>

          {teams.map((team) => {
            const isPlaying = team.id === playingAId || team.id === playingBId;
            const teamRoster = rosterOf(team.id);
            const isEditingName = editingTeamId === team.id;

            return (
              <View key={team.id} style={styles.teamBlock}>
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

                {teamRoster.map((r) => (
                  <Pressable key={r.playerId} style={styles.playerRow} onPress={() => router.push(`/jogador/${r.playerId}`)}>
                    <Avatar name={playerName(r.playerId)} photoUrl={playerPhoto(r.playerId)} size={22} />
                    <Text style={styles.playerText}>
                      {r.isGoalkeeper ? '🧤 ' : ''}
                      {playerName(r.playerId)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            );
          })}

          {isIndividual && sortedWaitingPlayers.length > 0 && (
            <View style={styles.teamBlock}>
              <Text style={styles.teamName}>Fila de espera individual</Text>
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
            </View>
          )}

          <Button
            label={activeGame.status === 'in_progress' ? 'Abrir cronômetro' : 'Ir pro jogo'}
            small
            variant="secondary"
            onPress={() => router.push(`/jogo/${activeGame.id}/cronometro`)}
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      )}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Elenco ({roster.length})</Text>
        {roster.map((p) => (
          <Pressable key={p.id} style={styles.rosterRow} onPress={() => router.push(`/jogador/${p.id}`)}>
            <Avatar name={p.name} photoUrl={p.avatarUrl} size={32} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rosterName}>{p.name}</Text>
              {p.nickname && <Text style={styles.rosterNick}>{p.nickname}</Text>}
            </View>
            <Text style={styles.rosterOverall}>{overalls[p.id]?.overall ?? '—'}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        ))}
        {roster.length === 0 && <Text style={styles.hint}>Nenhum jogador nesse time ainda.</Text>}
      </Card>
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
    marginBottom: spacing.sm,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  description: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  },
  teamBlock: {
    gap: 4,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  teamHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  rosterName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  rosterNick: {
    color: colors.textMuted,
    fontSize: 12,
  },
  rosterOverall: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
  },
});
