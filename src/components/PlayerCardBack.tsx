import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { overallTier } from '@/lib/ratings';
import type { BanterBadgeSummary } from '@/lib/banter';

interface PlayerCardBackProps {
  playerId: string;
  overall: number;
  sportId?: string | null;
  ratingsCount: number;
  width: number;
  height: number;
  banterBadges?: BanterBadgeSummary[];
  banterVisible?: boolean;
}

/** Verso da carta, estilo carta de colecionador: emblema do esporte, selo de nível e número de série (derivado do id do jogador). */
export function PlayerCardBack({ playerId, overall, sportId, ratingsCount, width, height, banterBadges = [], banterVisible = false }: PlayerCardBackProps) {
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
        <Text style={styles.brand}>MARCOUJOGOU</Text>
        <View style={[styles.emblem, { borderColor: tier.color }]}>
          <Text style={styles.emblemIcon}>{sport.icon}</Text>
        </View>
        {banterVisible && banterBadges.length > 0 ? (
          <View style={styles.banterBlock}>
            <Text style={styles.banterTitle}>MODO RESENHA · 30 DIAS</Text>
            {banterBadges.slice(0, 3).map((badge) => (
              <View key={badge.id} style={[styles.banterBadge, { borderColor: badge.color }]}>
                <Text style={styles.banterIcon}>{badge.icon}</Text>
                <Text style={styles.banterLabel} numberOfLines={1}>{badge.label}</Text>
                <Text style={[styles.banterCount, { color: badge.color }]}>{badge.count}×</Text>
              </View>
            ))}
            <Text style={styles.banterPrivacy}>votos anônimos do time · não altera a nota</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.tierLabel, { color: tier.color }]}>Carta {tier.label}</Text>
            <Text style={styles.ratingsCount}>
              {ratingsCount === 0 ? 'sem avaliações' : `${ratingsCount} avaliações`}
            </Text>
            {banterVisible && <Text style={styles.noBanter}>Sem selos de resenha ativos</Text>}
          </>
        )}
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
    letterSpacing: 2,
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
  banterBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  banterTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  banterBadge: {
    width: '100%',
    minHeight: 31,
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: 6,
  },
  banterIcon: { fontSize: 15 },
  banterLabel: { color: '#FFF', fontSize: 11, fontWeight: '800', flex: 1 },
  banterCount: { fontSize: 11, fontWeight: '900' },
  banterPrivacy: { color: 'rgba(255,255,255,0.48)', fontSize: 8, textAlign: 'center' },
  noBanter: { color: 'rgba(255,255,255,0.45)', fontSize: 9, marginTop: spacing.sm },
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
