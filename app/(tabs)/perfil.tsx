import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { FreeAgentInvitesSection } from '@/components/FreeAgentInvitesSection';
import { FreeAgentSection } from '@/components/FreeAgentSection';
import { PlayerCard } from '@/components/PlayerCard';
import { PremiumSection } from '@/components/PremiumSection';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing } from '@/constants/theme';
import { getSport, scoreLabel } from '@/constants/sports';
import { useMyPeladas } from '@/hooks/useCurrentPelada';
import { formatGameDateShort } from '@/lib/format';
import { computePlayerGoalStats, computePlayerGoalStatsByGroup } from '@/lib/goals';
import { pickProfilePhoto } from '@/lib/photo';
import { isPremiumActive } from '@/lib/premium';
import { punishmentLabel } from '@/lib/punishment';
import { computePlayerOverall, getPendingRatingGames } from '@/lib/ratings';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';

export default function PerfilScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const player = useAppStore((s) => s.players.find((p) => p.id === currentPlayerId)!);
  const ratings = useAppStore((s) => s.ratings);
  const games = useAppStore((s) => s.games);
  const attendances = useAppStore((s) => s.attendances);
  const teamPlayers = useAppStore((s) => s.teamPlayers);
  const matchTurns = useAppStore((s) => s.matchTurns);
  const goals = useAppStore((s) => s.goals);
  const myPeladas = useMyPeladas();
  const punishments = useAppStore(useShallow((s) => s.punishments.filter((p) => p.playerId === currentPlayerId)));
  const setPlayerPhoto = useAppStore((s) => s.setPlayerPhoto);
  const setPlayerCardBackground = useAppStore((s) => s.setPlayerCardBackground);
  const renewPremium = useAppStore((s) => s.renewPremium);
  const cancelPremiumAutoRenew = useAppStore((s) => s.cancelPremiumAutoRenew);
  const logout = useAuthStore((s) => s.logout);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [pickingBg, setPickingBg] = useState(false);
  const [showLockNotice, setShowLockNotice] = useState(false);

  const overall = computePlayerOverall(currentPlayerId, ratings);
  const goalStats = computePlayerGoalStats(currentPlayerId, teamPlayers, matchTurns, goals);
  const goalStatsByGroup = computePlayerGoalStatsByGroup(currentPlayerId, teamPlayers, matchTurns, goals, games, myPeladas);
  const pendingGames = getPendingRatingGames(games, attendances, ratings, currentPlayerId);
  const isPremium = isPremiumActive(player);

  async function handleChangePhoto() {
    setPickingPhoto(true);
    const uri = await pickProfilePhoto();
    if (uri) setPlayerPhoto(currentPlayerId, uri);
    setPickingPhoto(false);
  }

  async function handleChangeBackground() {
    if (!isPremium) {
      setShowLockNotice(true);
      return;
    }
    setPickingBg(true);
    const uri = await pickProfilePhoto();
    if (uri) setPlayerCardBackground(currentPlayerId, uri);
    setPickingBg(false);
  }

  return (
    <Screen>
      <Pressable style={styles.cardCenter} onPress={handleChangePhoto} disabled={pickingPhoto}>
        <PlayerCard
          name={player.name}
          nickname={player.nickname}
          photoUrl={player.avatarUrl}
          cardBackgroundUrl={player.cardBackgroundUrl}
          position={player.preferredPosition}
          sportId={player.favoriteSports[0]}
          overall={overall}
          goalStats={goalStats}
          width={190}
        />
        <View style={styles.changePhotoRow}>
          {pickingPhoto ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="camera" size={14} color={colors.primary} />
          )}
          <Text style={styles.changePhotoText}>{pickingPhoto ? 'Abrindo galeria...' : 'Alterar foto'}</Text>
        </View>
      </Pressable>

      <Text style={styles.name}>{player.name}</Text>
      {player.nickname && <Text style={styles.nickname}>"{player.nickname}"</Text>}

      <PremiumSection
        premiumSince={player.premiumSince}
        premiumUntil={player.premiumUntil}
        autoRenew={player.premiumAutoRenew}
        onSubscribe={() => renewPremium(currentPlayerId)}
        onCancelAutoRenew={() => cancelPremiumAutoRenew(currentPlayerId)}
      />

      <FreeAgentInvitesSection playerId={currentPlayerId} />
      <FreeAgentSection player={player} />

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Plano de fundo da carta</Text>
        <Text style={styles.bgHint}>
          A cor da faixa (bronze/prata/ouro/especial) é sempre definida pela sua nota geral e
          aparece por cima — você só escolhe a foto de fundo.
        </Text>

        <View style={styles.bgRow}>
          <Text style={styles.bgLabel}>
            {player.cardBackgroundUrl
              ? 'Fundo com foto personalizada'
              : isPremium
                ? 'Use uma foto como fundo da carta'
                : 'Fundo com foto é exclusivo do Premium'}
          </Text>
          <View style={styles.bgActions}>
            <Pressable onPress={handleChangeBackground} disabled={pickingBg} style={styles.bgActionBtn}>
              {pickingBg ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name={isPremium ? 'image' : 'lock-closed'} size={14} color={colors.primary} />
              )}
              <Text style={styles.bgActionText}>{player.cardBackgroundUrl ? 'Trocar' : 'Escolher imagem'}</Text>
            </Pressable>
            {player.cardBackgroundUrl && (
              <Pressable onPress={() => setPlayerCardBackground(currentPlayerId, null)} style={styles.bgActionBtn}>
                <Ionicons name="close-circle" size={14} color={colors.danger} />
                <Text style={[styles.bgActionText, { color: colors.danger }]}>Remover</Text>
              </Pressable>
            )}
          </View>
          {showLockNotice && !isPremium && (
            <Text style={styles.lockNotice}>🔒 Esse recurso é exclusivo do Premium — assine para desbloquear.</Text>
          )}
        </View>
      </Card>

      {myPeladas.length > 1 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Gols/pontos por grupo</Text>
          <View style={styles.goalGroupRow}>
            <Text style={styles.goalGroupName}>Geral (todos os grupos)</Text>
            <Text style={styles.goalGroupStats}>
              🏆 {goalStats.scored} · saldo {goalStats.balance > 0 ? `+${goalStats.balance}` : goalStats.balance}
            </Text>
          </View>
          {goalStatsByGroup.map((g) => {
            const groupSport = getSport(myPeladas.find((p) => p.id === g.peladaId)?.sportId);
            return (
              <View key={g.peladaId} style={styles.goalGroupRow}>
                <Text style={styles.goalGroupName}>{g.peladaName}</Text>
                <Text style={styles.goalGroupStats}>
                  {groupSport.icon} {g.stats.scored} {scoreLabel(groupSport.id, g.stats.scored)} · saldo{' '}
                  {g.stats.balance > 0 ? `+${g.stats.balance}` : g.stats.balance}
                </Text>
              </View>
            );
          })}
        </Card>
      )}

      {pendingGames.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Avaliações pendentes</Text>
          {pendingGames.map((g) => (
            <View key={g.id} style={styles.pendingRow}>
              <Text style={styles.pendingText}>Jogo de {formatGameDateShort(g.scheduledAt)}</Text>
              <Button label="Avaliar" small onPress={() => router.push(`/jogo/${g.id}/avaliar`)} />
            </View>
          ))}
        </Card>
      )}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Punições</Text>
        {punishments.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma punição registrada. Continue assim!</Text>
        ) : (
          punishments.map((p) => (
            <View key={p.id} style={styles.punishmentRow}>
              <Ionicons name="warning" size={16} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.punishmentText}>{punishmentLabel(p.type)}</Text>
                {p.suspendedUntilGameCount > 0 && (
                  <Text style={styles.punishmentSub}>Suspenso por {p.suspendedUntilGameCount} jogo(s)</Text>
                )}
              </View>
              <Badge label={`Nível ${p.strikeLevel}`} color={colors.warning} />
            </View>
          ))
        )}
      </Card>

      <Button
        label="🏟️ Sou dono de um campo"
        variant="secondary"
        onPress={() => router.push('/estabelecimento')}
        style={{ marginTop: spacing.xl }}
      />
      <Button
        label="🏆 Entrar num campeonato"
        variant="secondary"
        onPress={() => router.push('/campeonato/entrar')}
        style={{ marginTop: spacing.sm }}
      />
      <Button label="Sair" variant="outline" onPress={logout} style={{ marginTop: spacing.sm }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardCenter: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  changePhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  changePhotoText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  name: {
    textAlign: 'center',
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: spacing.lg,
  },
  nickname: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 2,
    marginBottom: spacing.lg,
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
    marginBottom: spacing.xs,
  },
  pendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingText: {
    color: colors.text,
    fontSize: 14,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  punishmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  punishmentText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  punishmentSub: {
    color: colors.textMuted,
    fontSize: 12,
  },
  bgHint: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 2,
  },
  bgRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: spacing.sm,
  },
  bgLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  bgActions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  bgActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bgActionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  lockNotice: {
    color: colors.warning,
    fontSize: 11,
    marginTop: spacing.xs,
  },
  goalGroupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  goalGroupName: {
    color: colors.text,
    fontSize: 14,
    flex: 1,
  },
  goalGroupStats: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
