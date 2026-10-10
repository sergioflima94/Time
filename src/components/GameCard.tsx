import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { formatGameDateLong } from '@/lib/format';
import { useAppStore } from '@/store/useAppStore';
import type { Game } from '@/types';

const STATUS_META: Record<Game['status'], { label: string; color: string }> = {
  open: { label: 'Chamada aberta', color: colors.primary },
  full: { label: 'Vagas esgotadas', color: colors.warning },
  teams_drawn: { label: 'Times sorteados', color: colors.special },
  in_progress: { label: 'Em andamento', color: colors.danger },
  finished: { label: 'Encerrado', color: colors.textFaint },
  cancelled: { label: 'Cancelado', color: colors.textFaint },
};

export function GameCard({ game, compact = false }: { game: Game; compact?: boolean }) {
  const field = useAppStore((s) => s.fields.find((f) => f.id === game.fieldId));
  const pelada = useAppStore((s) => s.peladas.find((p) => p.id === game.peladaId));
  const sport = getSport(pelada?.sportId);
  const confirmedCount = useAppStore(
    (s) => s.attendances.filter((a) => a.gameId === game.id && a.status === 'confirmed').length,
  );
  const status = STATUS_META[game.status];

  return (
    <Pressable onPress={() => router.push(`/jogo/${game.id}`)}>
      <Card style={[styles.card, compact && styles.compactCard, { borderLeftWidth: 3, borderLeftColor: sport.color }]}>
        <View style={styles.topRow}>
          <View style={styles.statusGroup}>
            <View style={[styles.sportMark, { backgroundColor: `${sport.color}24` }]}>
              <Text style={styles.sportIcon}>{sport.icon}</Text>
            </View>
            <Badge label={status.label} color={status.color} />
          </View>
          <View style={styles.vagas}>
            <Ionicons name="people" size={14} color={colors.textMuted} />
            <Text style={styles.vagasText}>
              {confirmedCount}/{game.maxPlayers}
            </Text>
          </View>
        </View>
        <Text style={[styles.date, compact && styles.compactDate]}>{formatGameDateLong(game.scheduledAt)}</Text>
        {pelada && <Text style={styles.fieldText}>{pelada.name} · {sport.label}</Text>}
        <View style={styles.fieldRow}>
          <Ionicons name="location" size={14} color={colors.textMuted} />
          <Text style={styles.fieldText}>{field?.name ?? 'Local a definir'}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  compactCard: { padding: spacing.md, borderRadius: 16, marginBottom: spacing.sm },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sportMark: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sportIcon: { fontSize: 16 },
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
  date: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.25,
    marginTop: spacing.xs,
  },
  compactDate: { fontSize: 16, marginTop: 2 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fieldText: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
