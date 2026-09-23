import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { colors, radius, spacing } from '@/constants/theme';
import { computeEstablishmentFinancials, type FinancialEntry } from '@/lib/establishmentFinance';
import { formatGameDateShort } from '@/lib/format';
import { formatBRL } from '@/lib/payments';
import { useAppStore } from '@/store/useAppStore';

type Period = 'all' | 'month';

export default function EstablishmentFinanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const establishmentId = id!;
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const establishment = useAppStore((s) => s.establishments.find((e) => e.id === establishmentId));
  const fields = useAppStore((s) => s.fields);
  const games = useAppStore((s) => s.games);
  const attendances = useAppStore((s) => s.attendances);
  const payments = useAppStore((s) => s.payments);
  const championships = useAppStore((s) => s.championships);
  const championshipTeams = useAppStore(useShallow((s) => s.championshipTeams));

  const [period, setPeriod] = useState<Period>('all');

  const { summary, entries } = useMemo(
    () =>
      computeEstablishmentFinancials({
        establishmentId,
        fields,
        games,
        attendances,
        payments,
        championships,
        championshipTeams,
      }),
    [establishmentId, fields, games, attendances, payments, championships, championshipTeams],
  );

  const filteredEntries = useMemo(() => {
    if (period === 'all') return entries;
    const now = new Date();
    return entries.filter((e) => {
      const d = new Date(e.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
  }, [entries, period]);

  const filteredTotal = filteredEntries.reduce((sum, e) => sum + e.amount, 0);

  if (establishment && establishment.ownerPlayerId !== currentPlayerId) {
    return (
      <Screen>
        <Text style={styles.hint}>Você não é dono deste estabelecimento.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.push(`/estabelecimento/${establishmentId}`)} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>📊 Financeiro</Text>
      </View>
      {establishment && <Text style={styles.subtitle}>{establishment.name}</Text>}

      <SegmentedControl<Period>
        options={[
          { value: 'all', label: 'Todo o período' },
          { value: 'month', label: 'Este mês' },
        ]}
        value={period}
        onChange={setPeriod}
      />

      <Card style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total recebido</Text>
        <Text style={styles.totalValue}>{formatBRL(filteredTotal)}</Text>
      </Card>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{formatBRL(summary.gamesRevenue)}</Text>
          <Text style={styles.statLabel}>Rateio de jogos · {summary.gamesPaidCount}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{formatBRL(summary.championshipsRevenue)}</Text>
          <Text style={styles.statLabel}>Taxas de campeonato · {summary.championshipTeamsCount}</Text>
        </View>
      </View>

      {summary.byField.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Recebido por campo</Text>
          {summary.byField.map((f) => (
            <View key={f.fieldId} style={styles.fieldRow}>
              <Text style={styles.fieldName} numberOfLines={1}>
                {f.fieldName}
              </Text>
              <Text style={styles.fieldAmount}>{formatBRL(f.amount)}</Text>
            </View>
          ))}
        </Card>
      )}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>
          {period === 'month' ? 'Transações deste mês' : 'Últimas transações'} ({filteredEntries.length})
        </Text>
        {filteredEntries.length === 0 && <Text style={styles.hint}>Nenhuma transação nesse período.</Text>}
        {filteredEntries.slice(0, 40).map((entry) => (
          <TransactionRow key={entry.id} entry={entry} />
        ))}
      </Card>
    </Screen>
  );
}

function TransactionRow({ entry }: { entry: FinancialEntry }) {
  return (
    <View style={styles.txRow}>
      <View style={[styles.txIcon, entry.type === 'championship_fee' && { backgroundColor: 'rgba(124,58,237,0.15)' }]}>
        <Ionicons
          name={entry.type === 'championship_fee' ? 'trophy' : 'football'}
          size={14}
          color={entry.type === 'championship_fee' ? colors.special : colors.primary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txLabel} numberOfLines={1}>
          {entry.label}
        </Text>
        <Text style={styles.txSub}>
          {entry.sourceName} · {formatGameDateShort(entry.date)}
        </Text>
      </View>
      <Text style={styles.txAmount}>{formatBRL(entry.amount)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
    marginBottom: spacing.lg,
    marginLeft: 34,
  },
  totalCard: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
    gap: 2,
  },
  totalLabel: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalValue: {
    color: colors.special,
    fontSize: 32,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  statValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    marginTop: spacing.xs,
  },
  fieldName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  fieldAmount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    marginTop: spacing.xs,
  },
  txIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: 'rgba(34,197,94,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  txLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  txSub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  txAmount: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
});
