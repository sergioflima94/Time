import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { InvitePeladaSection } from '@/components/InvitePeladaSection';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { formatGameDateShort } from '@/lib/format';
import { computeAllOveralls } from '@/lib/ratings';
import { TEAM_COLORS } from '@/lib/teamDraft';
import { useAppStore } from '@/store/useAppStore';
import type { ChallengeStatus } from '@/types';

const CHALLENGE_STATUS_LABEL: Record<ChallengeStatus, string> = {
  pending: 'Pendente',
  accepted: 'Aceito',
  declined: 'Recusado',
  cancelled: 'Cancelado',
};

const CHALLENGE_STATUS_COLOR: Record<ChallengeStatus, string> = {
  pending: colors.warning,
  accepted: colors.primary,
  declined: colors.danger,
  cancelled: colors.textFaint,
};

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

  const allPeladas = useAppStore((s) => s.peladas);
  const ownFields = useAppStore(useShallow((s) => (pelada ? s.fields.filter((f) => f.peladaId === pelada.id) : [])));
  const teamChallenges = useAppStore(
    useShallow((s) => (pelada ? s.teamChallenges.filter((c) => c.challengerPeladaId === pelada.id || c.challengedPeladaId === pelada.id) : [])),
  );
  const friendlyMatches = useAppStore(
    useShallow((s) => (pelada ? s.friendlyMatches.filter((m) => m.peladaAId === pelada.id || m.peladaBId === pelada.id) : [])),
  );
  const sendTeamChallenge = useAppStore((s) => s.sendTeamChallenge);
  const respondTeamChallenge = useAppStore((s) => s.respondTeamChallenge);
  const cancelTeamChallenge = useAppStore((s) => s.cancelTeamChallenge);

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [pickingColorFor, setPickingColorFor] = useState<string | null>(null);

  const [showChallengeForm, setShowChallengeForm] = useState(false);
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [challengeDate, setChallengeDate] = useState('');
  const [challengeTime, setChallengeTime] = useState('');
  const [challengeFieldId, setChallengeFieldId] = useState<string | null>(null);
  const [challengeMessage, setChallengeMessage] = useState('');

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

  function handleSendChallenge() {
    if (!pelada || !opponentId || !challengeDate.trim() || !challengeTime.trim() || !currentPlayerId) return;
    sendTeamChallenge(pelada.id, opponentId, currentPlayerId, {
      proposedDate: challengeDate.trim(),
      proposedTime: challengeTime.trim(),
      fieldId: challengeFieldId,
      message: challengeMessage.trim() || null,
    });
    setShowChallengeForm(false);
    setOpponentId(null);
    setChallengeDate('');
    setChallengeTime('');
    setChallengeFieldId(null);
    setChallengeMessage('');
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

      {(isAdmin || pelada.memberInvitePermissions.canInviteNewMembers) && <InvitePeladaSection pelada={pelada} />}

      {friendlyMatches.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Partidas de desafio</Text>
          {friendlyMatches
            .slice()
            .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
            .map((m) => {
              const opponentPeladaId = m.peladaAId === pelada.id ? m.peladaBId : m.peladaAId;
              const opponent = allPeladas.find((p) => p.id === opponentPeladaId);
              return (
                <Pressable key={m.id} style={styles.challengeRow} onPress={() => router.push(`/desafio/${m.id}`)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rosterName}>vs {opponent?.name ?? '—'}</Text>
                    <Text style={styles.hint}>{formatGameDateShort(m.scheduledAt)}</Text>
                  </View>
                  <Badge
                    label={m.status === 'finished' ? 'Encerrada' : m.status === 'in_progress' ? 'Ao vivo' : 'Agendada'}
                    color={m.status === 'finished' ? colors.textFaint : m.status === 'in_progress' ? colors.danger : colors.primary}
                  />
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              );
            })}
        </Card>
      )}

      <Card style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Desafios</Text>
          {isAdmin && (
            <Pressable onPress={() => setShowChallengeForm((v) => !v)}>
              <Text style={styles.adminLink}>{showChallengeForm ? 'Cancelar' : '+ Desafiar outro time'}</Text>
            </Pressable>
          )}
        </View>

        {showChallengeForm && (
          <View style={styles.challengeForm}>
            <Text style={styles.formLabel}>Adversário</Text>
            <View style={styles.opponentList}>
              {allPeladas
                .filter((p) => p.id !== pelada.id && p.sportId === pelada.sportId)
                .map((p) => (
                  <Pressable
                    key={p.id}
                    style={[styles.opponentChip, opponentId === p.id && styles.opponentChipActive]}
                    onPress={() => setOpponentId(p.id)}
                  >
                    <Text style={[styles.opponentChipText, opponentId === p.id && styles.opponentChipTextActive]} numberOfLines={1}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              {allPeladas.filter((p) => p.id !== pelada.id && p.sportId === pelada.sportId).length === 0 && (
                <Text style={styles.hint}>Nenhum outro time de {sport.label.toLowerCase()} cadastrado ainda.</Text>
              )}
            </View>

            <TextField label="Data (AAAA-MM-DD)" value={challengeDate} onChangeText={setChallengeDate} placeholder="2026-10-05" />
            <TextField label="Horário (HH:mm)" value={challengeTime} onChangeText={setChallengeTime} placeholder="19:00" />

            {ownFields.length > 0 && (
              <>
                <Text style={styles.formLabel}>Campo (opcional)</Text>
                <View style={styles.opponentList}>
                  {ownFields.map((f) => (
                    <Pressable
                      key={f.id}
                      style={[styles.opponentChip, challengeFieldId === f.id && styles.opponentChipActive]}
                      onPress={() => setChallengeFieldId(challengeFieldId === f.id ? null : f.id)}
                    >
                      <Text style={[styles.opponentChipText, challengeFieldId === f.id && styles.opponentChipTextActive]} numberOfLines={1}>
                        {f.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <TextField label="Mensagem (opcional)" value={challengeMessage} onChangeText={setChallengeMessage} placeholder="Bora jogar sábado?" />

            <Button
              label="Enviar desafio"
              onPress={handleSendChallenge}
              disabled={!opponentId || !challengeDate.trim() || !challengeTime.trim()}
            />
          </View>
        )}

        {teamChallenges.length === 0 && !showChallengeForm && <Text style={styles.hint}>Nenhum desafio ainda.</Text>}

        {teamChallenges
          .slice()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map((c) => {
            const isReceived = c.challengedPeladaId === pelada.id;
            const otherPeladaId = isReceived ? c.challengerPeladaId : c.challengedPeladaId;
            const other = allPeladas.find((p) => p.id === otherPeladaId);
            return (
              <View key={c.id} style={styles.challengeCard}>
                <View style={styles.challengeCardHeader}>
                  <Text style={styles.rosterName}>
                    {isReceived ? `${other?.name ?? '—'} desafiou vocês` : `Vocês desafiaram ${other?.name ?? '—'}`}
                  </Text>
                  <Badge label={CHALLENGE_STATUS_LABEL[c.status]} color={CHALLENGE_STATUS_COLOR[c.status]} />
                </View>
                <Text style={styles.hint}>
                  {c.proposedDate} às {c.proposedTime}
                  {c.fieldId ? ' · campo definido' : ''}
                </Text>
                {c.message && <Text style={styles.hint}>"{c.message}"</Text>}
                {isAdmin && c.status === 'pending' && isReceived && (
                  <View style={styles.challengeActionsRow}>
                    <Button label="Aceitar" small onPress={() => respondTeamChallenge(c.id, true)} />
                    <Button label="Recusar" small variant="outline" onPress={() => respondTeamChallenge(c.id, false)} />
                  </View>
                )}
                {isAdmin && c.status === 'pending' && !isReceived && (
                  <Pressable onPress={() => cancelTeamChallenge(c.id)}>
                    <Text style={styles.adminLinkMuted}>Cancelar desafio</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
      </Card>

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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  challengeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  challengeForm: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    marginBottom: spacing.xs,
  },
  formLabel: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  opponentList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  opponentChip: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    maxWidth: 180,
  },
  opponentChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '22',
  },
  opponentChipText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  opponentChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  challengeCard: {
    gap: 4,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  challengeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  challengeActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 4,
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
