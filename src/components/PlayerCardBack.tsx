import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { overallTier } from '@/lib/ratings';

interface PlayerCardBackProps {
  playerId: string;
  overall: number;
  sportId?: string | null;
  ratingsCount: number;
  width: number;
  height: number;
}

/** Verso da carta, estilo carta de colecionador: emblema do esporte, selo de nível e número de série (derivado do id do jogador). */
export function PlayerCardBack({ playerId, overall, sportId, ratingsCount, width, height }: PlayerCardBackProps) {
  const sport = getSport(sportId);
  const tier = overallTier(overall);
  const serial = playerId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase().padEnd(8, '0');

  return (
    <View style={[styles.card, { width, height, borderColor: tier.color }]}>
      <LinearGradient
        colors={[tier.gradient[2], tier.gradient[1], tier.gradient[2]]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={styles.watermark} numberOfLines={1}>
        {sport.icon}
      </Text>

      <View style={styles.content}>
        <Text style={styles.brand}>PELADA</Text>
        <View style={[styles.emblem, { borderColor: tier.color }]}>
          <Text style={styles.emblemIcon}>{sport.icon}</Text>
        </View>
        <Text style={[styles.tierLabel, { color: tier.color }]}>Carta {tier.label}</Text>
        <Text style={styles.ratingsCount}>
          {ratingsCount === 0 ? 'sem avaliações' : `${ratingsCount} avaliações`}
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.serialLabel}>Nº DE SÉRIE</Text>
        <Text style={styles.serial}>{serial}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    fontSize: 160,
    opacity: 0.08,
    alignSelf: 'center',
    top: '28%',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  brand: {
    position: 'absolute',
    top: -spacing.xs,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 4,
  },
  emblem: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  emblemIcon: {
    fontSize: 32,
  },
  tierLabel: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  ratingsCount: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  footer: {
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
    paddingTop: spacing.sm,
    width: '100%',
  },
  serialLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  serial: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 2,
  },
});
