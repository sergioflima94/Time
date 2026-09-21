import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { findNearbyFreeAgents, formatDistance } from '@/lib/geo';
import { getCurrentLocation } from '@/lib/location';
import { useAppStore } from '@/store/useAppStore';
import type { Game } from '@/types';

interface NearbyFreeAgentsSectionProps {
  game: Game;
  currentPlayerId: string;
  excludePlayerIds: Set<string>;
}

export function NearbyFreeAgentsSection({ game, currentPlayerId, excludePlayerIds }: NearbyFreeAgentsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [locating, setLocating] = useState(false);

  const me = useAppStore((s) => s.players.find((p) => p.id === currentPlayerId));
  const pelada = useAppStore((s) => s.peladas.find((p) => p.id === game.peladaId));
  const sport = getSport(pelada?.sportId);
  const players = useAppStore(
    useShallow((s) => s.players.filter((p) => p.freeAgentOptIn && p.favoriteSports.includes(sport.id))),
  );
  const invitesForGame = useAppStore(useShallow((s) => s.freeAgentInvites.filter((i) => i.gameId === game.id)));
  const updateMyLocation = useAppStore((s) => s.updateMyLocation);
  const sendFreeAgentInvite = useAppStore((s) => s.sendFreeAgentInvite);

  const matches = useMemo(() => {
    if (!me?.location) return [];
    return findNearbyFreeAgents({
      players,
      origin: me.location,
      excludePlayerIds,
      gameScheduledAt: game.scheduledAt,
    });
  }, [players, me?.location, excludePlayerIds, game.scheduledAt]);

  async function handleExpand() {
    setExpanded(true);
    if (!me?.location) {
      setLocating(true);
      const location = await getCurrentLocation();
      setLocating(false);
      if (location) updateMyLocation(currentPlayerId, location);
    }
  }

  if (!expanded) {
    return (
      <View style={styles.wrap}>
        <Pressable onPress={handleExpand}>
          <Text style={styles.link}>🔍 Buscar jogadores livres perto</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{sport.icon} Jogadores de {sport.label.toLowerCase()} livres perto de você</Text>
      {locating && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.secondary} />
          <Text style={styles.hint}>Pegando sua localização...</Text>
        </View>
      )}
      {!locating && !me?.location && <Text style={styles.hint}>Não foi possível pegar sua localização.</Text>}
      {!locating && me?.location && matches.length === 0 && (
        <Text style={styles.hint}>Ninguém disponível dentro do raio deles, por enquanto.</Text>
      )}
      {matches.map(({ player, distanceKm, availableAtGameTime }) => {
        const invited = invitesForGame.some((i) => i.playerId === player.id && i.status !== 'declined');
        return (
          <View key={player.id} style={styles.row}>
            <Avatar name={player.name} photoUrl={player.avatarUrl} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{player.name}</Text>
              <Text style={styles.meta}>
                {formatDistance(distanceKm)}
                {sport.hasGoalkeeper ? ` · ${player.preferredPosition === 'goalkeeper' ? 'Goleiro' : 'Linha'}` : ''}
                {availableAtGameTime ? ' · livre nesse horário' : ' · fora da disponibilidade'}
              </Text>
            </View>
            {invited ? (
              <View style={styles.invitedBadge}>
                <Ionicons name="checkmark" size={12} color={colors.secondary} />
                <Text style={styles.invitedText}>Convidado</Text>
              </View>
            ) : (
              <Button
                label="Convidar"
                small
                variant="secondary"
                onPress={() => sendFreeAgentInvite(game.id, game.peladaId, player.id, currentPlayerId)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: spacing.sm,
  },
  link: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  invitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  invitedText: {
    color: colors.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
});
