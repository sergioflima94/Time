import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { PLAYER_CARD_ASPECT, PlayerCard } from '@/components/PlayerCard';
import { PlayerCardBack } from '@/components/PlayerCardBack';
import { RotatingCard } from '@/components/RotatingCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { useFriendshipWith } from '@/hooks/useFriends';
import { computePlayerGoalStats } from '@/lib/goals';
import { computePlayerOverall } from '@/lib/ratings';
import { useAppStore } from '@/store/useAppStore';

export default function JogadorPerfilScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const player = useAppStore((s) => s.players.find((p) => p.id === id));
  const ratings = useAppStore((s) => s.ratings);
  const teamPlayers = useAppStore((s) => s.teamPlayers);
  const matchTurns = useAppStore((s) => s.matchTurns);
  const goals = useAppStore((s) => s.goals);
  const sendFriendRequest = useAppStore((s) => s.sendFriendRequest);
  const respondFriendRequest = useAppStore((s) => s.respondFriendRequest);
  const removeFriendship = useAppStore((s) => s.removeFriendship);
  const friendship = useFriendshipWith(id ?? '');

  const duelsBetween = useAppStore(
    useShallow((s) =>
      s.playerDuels.filter(
        (d) =>
          (d.challengerId === currentPlayerId && d.challengedId === id) ||
          (d.challengerId === id && d.challengedId === currentPlayerId),
      ),
    ),
  );
  const sendPlayerDuel = useAppStore((s) => s.sendPlayerDuel);
  const respondPlayerDuel = useAppStore((s) => s.respondPlayerDuel);
  const recordPlayerDuelResult = useAppStore((s) => s.recordPlayerDuelResult);

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
  const isMe = player.id === currentPlayerId;

  const pendingDuel = duelsBetween.find((d) => d.status === 'pending');
  const activeDuel = duelsBetween.find((d) => d.status === 'accepted' && !d.resultRecordedAt);
  const recordedDuels = duelsBetween.filter((d) => d.resultRecordedAt).sort((a, b) => new Date(b.resultRecordedAt!).getTime() - new Date(a.resultRecordedAt!).getTime());
  const myWins = recordedDuels.filter((d) => d.winnerId === currentPlayerId).length;
  const theirWins = recordedDuels.filter((d) => d.winnerId === player.id).length;
  const draws = recordedDuels.filter((d) => d.winnerId === null).length;

  function handleSendDuel() {
    sendPlayerDuel(currentPlayerId, player!.id, null);
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{player.nickname || player.name}</Text>
      </View>

      <View style={styles.cardWrap}>
        <RotatingCard
          width={200}
          height={200 * PLAYER_CARD_ASPECT}
          front={
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
          }
          back={
            <PlayerCardBack
              playerId={player.id}
              overall={overall.overall}
              sportId={player.favoriteSports[0]}
              ratingsCount={overall.ratingsCount}
              width={200}
              height={200 * PLAYER_CARD_ASPECT}
            />
          }
        />
      </View>

      <Text style={styles.name}>{player.name}</Text>
      {player.nickname && <Text style={styles.nickname}>"{player.nickname}"</Text>}

      {!isMe && (
        <View style={styles.friendAction}>
          {friendship.status === 'none' && (
            <Button label="Adicionar amigo" variant="outline" onPress={() => sendFriendRequest(currentPlayerId, player.id)} />
          )}
          {friendship.status === 'pending_sent' && (
            <Button label="Cancelar pedido" variant="ghost" onPress={() => removeFriendship(friendship.friendshipId)} />
          )}
          {friendship.status === 'pending_received' && (
            <View style={styles.friendRequestRow}>
              <Button label="Aceitar" onPress={() => respondFriendRequest(friendship.friendshipId, true)} style={{ flex: 1 }} />
              <Button
                label="Recusar"
                variant="secondary"
                onPress={() => respondFriendRequest(friendship.friendshipId, false)}
                style={{ flex: 1 }}
              />
            </View>
          )}
          {friendship.status === 'friends' && (
            <View style={styles.friendBadge}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.friendBadgeText}>Vocês são amigos</Text>
            </View>
          )}
        </View>
      )}

      {!isMe && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Confronto direto</Text>

          {recordedDuels.length > 0 && (
            <Text style={styles.duelRecord}>
              Você {myWins} x {theirWins} {player.nickname || player.name}
              {draws > 0 ? ` (${draws} empate${draws > 1 ? 's' : ''})` : ''}
            </Text>
          )}

          {activeDuel ? (
            <View style={styles.duelResultRow}>
              <Text style={styles.hint}>Confronto em aberto — quem venceu?</Text>
              <View style={styles.duelResultButtons}>
                <Button label="Eu venci" small onPress={() => recordPlayerDuelResult(activeDuel.id, currentPlayerId, null)} />
                <Button
                  label={`${player.nickname || player.name} venceu`}
                  small
                  variant="secondary"
                  onPress={() => recordPlayerDuelResult(activeDuel.id, player!.id, null)}
                />
                <Button label="Empate" small variant="outline" onPress={() => recordPlayerDuelResult(activeDuel.id, null, null)} />
              </View>
            </View>
          ) : pendingDuel ? (
            pendingDuel.challengedId === currentPlayerId ? (
              <View style={styles.friendRequestRow}>
                <Button label="Aceitar desafio" onPress={() => respondPlayerDuel(pendingDuel.id, true)} style={{ flex: 1 }} />
                <Button label="Recusar" variant="secondary" onPress={() => respondPlayerDuel(pendingDuel.id, false)} style={{ flex: 1 }} />
              </View>
            ) : (
              <Badge label="Desafio enviado, aguardando resposta" color={colors.warning} />
            )
          ) : (
            <Button label="⚔️ Desafiar" variant="outline" onPress={handleSendDuel} />
          )}
        </Card>
      )}

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
  friendAction: {
    marginBottom: spacing.lg,
  },
  friendRequestRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  friendBadgeText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '700',
  },
  duelRecord: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  duelResultRow: {
    gap: spacing.sm,
  },
  duelResultButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
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
