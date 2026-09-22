import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { getSport, scoreLabel } from '@/constants/sports';
import { hexToRgba } from '@/lib/color';
import type { PlayerGoalStats } from '@/lib/goals';
import { overallTier } from '@/lib/ratings';
import type { PlayerOverall } from '@/types';

export const PLAYER_CARD_ASPECT = 1.35;

interface PlayerCardProps {
  name: string;
  nickname?: string | null;
  photoUrl?: string | null;
  /** Foto de fundo escolhida pelo jogador (Premium). A cor da faixa sempre aparece por cima, como uma camada — não dá pra escolher a cor da carta. */
  cardBackgroundUrl?: string | null;
  position: 'goalkeeper' | 'line';
  /** Esporte de referência (SportId) — decide se mostra badge de goleiro e o rótulo gol/ponto. */
  sportId?: string | null;
  overall: PlayerOverall;
  goalStats?: PlayerGoalStats;
  width?: number;
}

export function PlayerCard({
  name,
  nickname,
  photoUrl,
  cardBackgroundUrl,
  position,
  sportId,
  overall,
  goalStats,
  width = 160,
}: PlayerCardProps) {
  const sport = getSport(sportId);
  const tier = overallTier(overall.overall);
  const borderColor = tier.color;
  const height = width * PLAYER_CARD_ASPECT;
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!photoUrl && !photoFailed;
  const [bgFailed, setBgFailed] = useState(false);
  const showBackground = !!cardBackgroundUrl && !bgFailed;

  return (
    <View style={[styles.card, { width, height, borderColor }]}>
      {showBackground ? (
        <Image
          source={{ uri: cardBackgroundUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          onError={() => setBgFailed(true)}
        />
      ) : (
        <LinearGradient
          colors={tier.gradient}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {/* Camada de cor da faixa (bronze/prata/ouro/especial) por cima do fundo — sempre
          automática pela nota geral, nunca escolhida pelo jogador. */}
      {showBackground && (
        <LinearGradient
          colors={[hexToRgba(tier.gradient[0], 0.22), hexToRgba(tier.gradient[2], 0.82)]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {/* Brilho diagonal estilo carta de pacote */}
      <LinearGradient
        colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.08)']}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.header}>
        <Text style={styles.overall}>{overall.overall}</Text>
        {sport.hasGoalkeeper && <Text style={styles.position}>{position === 'goalkeeper' ? 'GOL' : 'LIN'}</Text>}
      </View>

      <View style={styles.avatarWrap}>
        <View style={styles.avatarCircle}>
          {showPhoto ? (
            <Image
              source={{ uri: photoUrl }}
              style={styles.avatarPhoto}
              contentFit="cover"
              transition={150}
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <Text style={styles.avatarInitials}>
              {name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0])
                .join('')
                .toUpperCase()}
            </Text>
          )}
        </View>
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {nickname || name}
      </Text>
      <View style={styles.tierPill}>
        <Text style={styles.tierLabel}>{tier.label}</Text>
      </View>

      <View style={styles.statsRow}>
        <Stat label="ATA" value={overall.attack} />
        <Stat label="DEF" value={overall.defense} />
        <Stat label="VEL" value={overall.pace} />
      </View>
      <Text style={styles.ratingsCount}>
        {overall.ratingsCount === 0 ? 'sem avaliações' : `${overall.ratingsCount} avaliações`}
      </Text>
      {goalStats && (
        <Text style={styles.goalStats}>
          {sport.icon} {goalStats.scored} {scoreLabel(sportId, goalStats.scored)} · saldo{' '}
          {goalStats.balance > 0 ? `+${goalStats.balance}` : goalStats.balance}
        </Text>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.md,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  overall: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  position: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
    opacity: 0.85,
  },
  avatarWrap: {
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
  },
  avatarPhoto: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 18,
  },
  name: {
    marginTop: spacing.sm,
    textAlign: 'center',
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  tierPill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  tierLabel: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
    paddingTop: spacing.sm,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 15,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    marginTop: 2,
  },
  ratingsCount: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    marginTop: spacing.xs,
  },
  goalStats: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
});
