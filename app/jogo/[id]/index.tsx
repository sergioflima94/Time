import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { NearbyFreeAgentsSection } from '@/components/NearbyFreeAgentsSection';
import { PaymentSplitSection } from '@/components/PaymentSplitSection';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { drawMethodLabel, formatGameDateLong } from '@/lib/format';
import { isPlayerSuspended } from '@/lib/punishment';
import { useAppStore } from '@/store/useAppStore';
import type { Attendance, DrawMethod } from '@/types';

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const players = useAppStore((s) => s.players);
  const game = useAppStore((s) => s.games.find((g) => g.id === id));
  const field = useAppStore((s) => s.fields.find((f) => f.id === game?.fieldId));
  const establishment = useAppStore((s) => s.establishments.find((e) => e.id === field?.establishmentId));
  const attendances = useAppStore(useShallow((s) => s.attendances.filter((a) => a.gameId === id)));
  const teams = useAppStore(useShallow((s) => s.teams.filter((t) => t.gameId === id)));
  const teamPlayers = useAppStore((s) => s.teamPlayers);
  const punishments = useAppStore((s) => s.punishments);
  const games = useAppStore((s) => s.games);
  const isAdmin = useAppStore((s) => (game ? s.isAdmin(currentPlayerId, game.peladaId) : false));
  const peladaMemberIds = useAppStore(
    useShallow((s) => new Set(s.memberships.filter((m) => m.peladaId === game?.peladaId && m.active).map((m) => m.playerId))),
  );

  const setAttendance = useAppStore((s) => s.setAttendance);
  const updateGameMaxPlayers = useAppStore((s) => s.updateGameMaxPlayers);
  const setDrawMethod = useAppStore((s) => s.setDrawMethod);
  const setGameStatus = useAppStore((s) => s.setGameStatus);
  const registerPunishment = useAppStore((s) => s.registerPunishment);
  const promoteFromWaitlist = useAppStore((s) => s.promoteFromWaitlist);
  const setGameMatchMinutes = useAppStore((s) => s.setGameMatchMinutes);
  const setGameGoalLimit = useAppStore((s) => s.setGameGoalLimit);
  const addGuest = useAppStore((s) => s.addGuest);

  const [editingLimit, setEditingLimit] = useState(false);
  const [limitDraft, setLimitDraft] = useState(String(game?.maxPlayers ?? ''));
  const [editingMatch, setEditingMatch] = useState(false);
  const [minutesDraft, setMinutesDraft] = useState(String(game?.matchMinutes ?? ''));
  const [goalLimitDraft, setGoalLimitDraft] = useState(String(game?.matchGoalLimit ?? ''));
  const [addingGuest, setAddingGuest] = useState(false);
  const [guestName, setGuestName] = useState('');

  if (!game) {
    return (
      <Screen>
        <Text style={styles.notFound}>Jogo não encontrado.</Text>
      </Screen>
    );
  }

  const confirmed = attendances
    .filter((a) => a.status === 'confirmed')
    .sort((a, b) => (a.confirmedOrder ?? 0) - (b.confirmedOrder ?? 0));
  const waitlist = attendances
    .filter((a) => a.status === 'waitlist')
    .sort((a, b) => (a.confirmedOrder ?? 0) - (b.confirmedOrder ?? 0));
  const declined = attendances.filter((a) => a.status === 'declined');

  const myAttendance = attendances.find((a) => a.playerId === currentPlayerId);
  const iAmSuspended = isPlayerSuspended(currentPlayerId, punishments, games, game.id);

  const playerName = (playerId: string) => players.find((p) => p.id === playerId)?.name ?? '—';
  const playerPhoto = (playerId: string) => players.find((p) => p.id === playerId)?.avatarUrl ?? null;
  const playerIsGuest = (playerId: string) => players.find((p) => p.id === playerId)?.isGuest ?? false;

  const teamsExist = teams.length > 0;

  function saveLimit() {
    const n = Number(limitDraft);
    if (n > 0) updateGameMaxPlayers(game!.id, n);
    setEditingLimit(false);
  }

  function saveMatchConfig() {
    const minutes = Number(minutesDraft);
    if (minutes > 0) setGameMatchMinutes(game!.id, minutes);
    const goalN = Number(goalLimitDraft);
    setGameGoalLimit(game!.id, goalLimitDraft.trim() && goalN > 0 ? goalN : null);
    setEditingMatch(false);
  }

  return (
    <Screen>
      <Text style={styles.date}>{formatGameDateLong(game.scheduledAt)}</Text>
      <View style={styles.metaRow}>
        <Ionicons name="location" size={14} color={colors.textMuted} />
        <Text style={styles.metaText}>{field?.name ?? 'Local a definir'}</Text>
      </View>

      <Card style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Chamada</Text>
          <View style={styles.vagas}>
            <Ionicons name="people" size={14} color={colors.textMuted} />
            <Text style={styles.vagasText}>
              {confirmed.length}/{game.maxPlayers}
            </Text>
          </View>
        </View>

        {isAdmin && (
          <View style={styles.limitRow}>
            {editingLimit ? (
              <>
                <TextField
                  label=""
                  value={limitDraft}
                  onChangeText={setLimitDraft}
                  keyboardType="number-pad"
                  style={{ width: 80 }}
                />
                <Button label="Salvar" small onPress={saveLimit} />
              </>
            ) : (
              <Pressable onPress={() => { setLimitDraft(String(game.maxPlayers)); setEditingLimit(true); }}>
                <Text style={styles.link}>Alterar limite de vagas</Text>
              </Pressable>
            )}
          </View>
        )}

        {iAmSuspended ? (
          <View style={styles.suspendedBanner}>
            <Ionicons name="warning" size={16} color={colors.danger} />
            <Text style={styles.suspendedText}>Você está suspenso e não pode confirmar presença neste jogo.</Text>
          </View>
        ) : (
          <View style={styles.rsvpRow}>
            <Button
              label="Vou"
              small
              variant={myAttendance?.status === 'confirmed' ? 'primary' : 'secondary'}
              onPress={() => setAttendance(game.id, currentPlayerId, 'confirmed')}
            />
            <Button
              label="Não vou"
              small
              variant={myAttendance?.status === 'declined' ? 'danger' : 'secondary'}
              onPress={() => setAttendance(game.id, currentPlayerId, 'declined')}
            />
          </View>
        )}

        <PlayerList title="Confirmados" attendances={confirmed} nameOf={playerName} photoOf={playerPhoto} guestOf={playerIsGuest} />
        {waitlist.length > 0 && (
          <PlayerList
            title="Lista de espera"
            attendances={waitlist}
            nameOf={playerName}
            photoOf={playerPhoto}
            guestOf={playerIsGuest}
            action={isAdmin ? { label: 'Promover 1º da fila', onPress: () => promoteFromWaitlist(game.id) } : undefined}
          />
        )}
        {declined.length > 0 && (
          <PlayerList title="Não vão" attendances={declined} nameOf={playerName} photoOf={playerPhoto} guestOf={playerIsGuest} muted />
        )}

        {isAdmin && (
          <View style={styles.guestSection}>
            {addingGuest ? (
              <View style={styles.guestForm}>
                <TextField
                  label=""
                  value={guestName}
                  onChangeText={setGuestName}
                  placeholder="Nome do convidado"
                  style={{ flex: 1 }}
                />
                <Button
                  label="Adicionar"
                  small
                  onPress={() => {
                    if (!guestName.trim()) return;
                    addGuest(game.id, guestName.trim());
                    setGuestName('');
                    setAddingGuest(false);
                  }}
                />
              </View>
            ) : (
              <Pressable onPress={() => setAddingGuest(true)}>
                <Text style={styles.link}>+ Adicionar convidado (sem app)</Text>
              </Pressable>
            )}
          </View>
        )}

        {isAdmin && (
          <NearbyFreeAgentsSection
            game={game}
            currentPlayerId={currentPlayerId}
            excludePlayerIds={new Set([...peladaMemberIds, ...attendances.map((a) => a.playerId)])}
          />
        )}
      </Card>

      <PaymentSplitSection
        gameId={game.id}
        fieldCost={game.fieldCost}
        confirmed={confirmed}
        isAdmin={isAdmin}
        currentPlayerId={currentPlayerId}
        establishment={establishment ?? null}
      />

      {isAdmin && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Sorteio</Text>
          <SegmentedControl<DrawMethod>
            label="Método"
            value={game.drawMethod}
            onChange={(m) => setDrawMethod(game.id, m)}
            options={[
              { value: 'arrival', label: 'Chegada' },
              { value: 'random', label: 'Aleatório' },
              { value: 'rating', label: 'Por nota' },
            ]}
          />
          {editingMatch ? (
            <View style={styles.matchConfigRow}>
              <TextField label="Minutos" value={minutesDraft} onChangeText={setMinutesDraft} keyboardType="number-pad" style={{ width: 70 }} />
              <TextField
                label="Ou gols (opcional)"
                value={goalLimitDraft}
                onChangeText={setGoalLimitDraft}
                keyboardType="number-pad"
                style={{ width: 90 }}
              />
              <Button label="Salvar" small onPress={saveMatchConfig} />
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setMinutesDraft(String(game.matchMinutes));
                setGoalLimitDraft(game.matchGoalLimit ? String(game.matchGoalLimit) : '');
                setEditingMatch(true);
              }}
            >
              <Text style={styles.link}>
                Duração da rodada: {game.matchMinutes} min{game.matchGoalLimit ? ` ou ${game.matchGoalLimit} gols` : ''} (alterar)
              </Text>
            </Pressable>
          )}
          <Button
            label={teamsExist ? 'Refazer sorteio' : 'Sortear times'}
            onPress={() => router.push(`/jogo/${game.id}/sorteio`)}
            disabled={confirmed.length < 4}
          />
          {confirmed.length < 4 && <Text style={styles.hint}>Precisa de pelo menos 4 confirmados.</Text>}
        </Card>
      )}

      {teamsExist && (
        <Card style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Times sorteados ({drawMethodLabel(game.drawMethod)})</Text>
          </View>
          {teams.map((team) => {
            const roster = teamPlayers.filter((tp) => tp.teamId === team.id);
            return (
              <View key={team.id} style={styles.teamRow}>
                <View style={[styles.teamDot, { backgroundColor: team.color }]} />
                <Text style={styles.teamName}>{team.name}</Text>
                <Text style={styles.teamCount}>{roster.length} jogadores</Text>
              </View>
            );
          })}

          {game.status === 'teams_drawn' && (
            <Button
              label="Iniciar jogo (cronômetro)"
              onPress={() => {
                setGameStatus(game.id, 'in_progress');
                router.push(`/jogo/${game.id}/cronometro`);
              }}
              style={{ marginTop: spacing.sm }}
            />
          )}
          {game.status === 'in_progress' && (
            <Button
              label="Abrir cronômetro"
              onPress={() => router.push(`/jogo/${game.id}/cronometro`)}
              style={{ marginTop: spacing.sm }}
            />
          )}
        </Card>
      )}

      {(game.status === 'in_progress' || game.status === 'teams_drawn') && isAdmin && (
        <Button
          label="Encerrar jogo"
          variant="outline"
          onPress={() => setGameStatus(game.id, 'finished')}
          style={{ marginTop: spacing.md }}
        />
      )}

      {game.status === 'finished' && (
        <>
          <Button
            label="Avaliar jogadores"
            onPress={() => router.push(`/jogo/${game.id}/avaliar`)}
            style={{ marginTop: spacing.md }}
          />
          {isAdmin && (
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Marcar falta (confirmou e não foi)</Text>
              {confirmed.map((a) => (
                <View key={a.id} style={styles.row}>
                  <Text style={styles.rowText}>{playerName(a.playerId)}</Text>
                  {a.noShow ? (
                    <Badge label="Falta registrada" color={colors.danger} />
                  ) : (
                    <Pressable onPress={() => registerPunishment(game.peladaId, a.playerId, game.id, 'no_show')}>
                      <Text style={styles.linkDanger}>marcar falta</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function PlayerList({
  title,
  attendances,
  nameOf,
  photoOf,
  guestOf,
  muted,
  action,
}: {
  title: string;
  attendances: Attendance[];
  nameOf: (id: string) => string;
  photoOf: (id: string) => string | null;
  guestOf?: (id: string) => boolean;
  muted?: boolean;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.listSection}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.listTitle}>
          {title} ({attendances.length})
        </Text>
        {action && (
          <Pressable onPress={action.onPress}>
            <Text style={styles.link}>{action.label}</Text>
          </Pressable>
        )}
      </View>
      {attendances.map((a) => (
        <View key={a.id} style={styles.playerRow}>
          <Avatar name={nameOf(a.playerId)} photoUrl={photoOf(a.playerId)} size={30} />
          <Text style={[styles.playerName, muted && { color: colors.textFaint }]}>{nameOf(a.playerId)}</Text>
          {guestOf?.(a.playerId) && <Badge label="Convidado" color={colors.textFaint} textColor={colors.bg} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  date: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  vagas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  vagasText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  matchConfigRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  link: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  linkDanger: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  suspendedBanner: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    borderRadius: 10,
    padding: spacing.sm,
  },
  suspendedText: {
    color: colors.danger,
    fontSize: 12,
    flex: 1,
  },
  rsvpRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  listSection: {
    marginTop: spacing.sm,
  },
  guestSection: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  guestForm: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  listTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  playerName: {
    color: colors.text,
    fontSize: 14,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  teamDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  teamName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  teamCount: {
    color: colors.textMuted,
    fontSize: 12,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  rowText: {
    color: colors.text,
    fontSize: 14,
  },
  notFound: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
