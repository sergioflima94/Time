import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { formatMoney } from '@/lib/establishmentOperations';
import { useAppStore } from '@/store/useAppStore';

export default function CashScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const { establishmentId } = useLocalSearchParams<{ establishmentId?: string }>();
  const establishment = useAppStore((s) => s.establishments.find((row) => row.id === establishmentId && row.ownerPlayerId === currentPlayerId) ?? s.establishments.find((row) => row.ownerPlayerId === currentPlayerId));
  const tabs = useAppStore(useShallow((s) => s.serviceTabs.filter((row) => row.establishmentId === establishment?.id)));
  const payments = useAppStore((s) => s.salePayments);
  const shifts = useAppStore(useShallow((s) => s.cashShifts.filter((row) => row.establishmentId === establishment?.id)));
  const classPrograms = useAppStore(useShallow((s) => s.classPrograms.filter((row) => row.establishmentId === establishment?.id)));
  const classSessions = useAppStore((s) => s.classSessions);
  const classEnrollments = useAppStore((s) => s.classEnrollments);
  const fields = useAppStore(useShallow((s) => s.fields.filter((row) => row.establishmentId === establishment?.id)));
  const games = useAppStore((s) => s.games);
  const gamePayments = useAppStore((s) => s.payments);
  const attendances = useAppStore((s) => s.attendances);
  const openCashShift = useAppStore((s) => s.openCashShift);
  const closeCashShift = useAppStore((s) => s.closeCashShift);
  const [amount, setAmount] = useState('');
  const openShift = shifts.find((shift) => shift.status === 'open');
  const tabIds = new Set(tabs.map((tab) => tab.id));
  const activePayments = payments.filter((payment) => tabIds.has(payment.tabId) && !payment.reversedAt && (!openShift || payment.paidAt >= openShift.openedAt));
  const foodRevenue = activePayments.reduce((sum, payment) => sum + payment.amount, 0);
  const sessionIds = new Set(classSessions.filter((session) => classPrograms.some((program) => program.id === session.programId)).map((session) => session.id));
  const classRevenue = classEnrollments.filter((row) => sessionIds.has(row.sessionId) && row.paymentStatus === 'paid').reduce((sum, row) => sum + row.amount, 0);
  const fieldIds = new Set(fields.map((field) => field.id));
  const fieldRevenue = games.filter((game) => fieldIds.has(game.fieldId) && game.fieldCost).reduce((sum, game) => { const confirmed = attendances.filter((row) => row.gameId === game.id && row.status === 'confirmed').length; const paid = gamePayments.filter((row) => row.gameId === game.id && row.status === 'paid').length; return sum + (game.fieldCost ?? 0) * (confirmed ? paid / confirmed : 0); }, 0);
  const byMethod = (method: string) => activePayments.filter((payment) => payment.method === method).reduce((sum, payment) => sum + payment.amount, 0);

  function handleShift() {
    const value = Number(amount.replace(',', '.')) || 0;
    if (!establishment) return;
    if (openShift) closeCashShift(openShift.id, value);
    else openCashShift(establishment.id, value);
    setAmount('');
  }

  return (
    <Screen>
      <View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable><View><Text style={styles.title}>Caixa e receitas</Text><Text style={styles.meta}>Visão consolidada, origens separadas</Text></View></View>
      <View style={styles.grid}><Metric label="Alimentação" value={foodRevenue} color={colors.warning} /><Metric label="Aulas" value={classRevenue} color={colors.secondary} /><Metric label="Quadras" value={fieldRevenue} color={colors.primary} /><Metric label="Total" value={foodRevenue + classRevenue + fieldRevenue} color={colors.gold} /></View>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>{openShift ? 'Turno de caixa aberto' : 'Abrir turno de caixa'}</Text>
        {openShift && <><Text style={styles.line}>Fundo inicial: {formatMoney(openShift.openingAmount)}</Text><Text style={styles.line}>Dinheiro recebido: {formatMoney(byMethod('cash'))}</Text><Text style={styles.line}>Pix: {formatMoney(byMethod('pix'))} · cartão: {formatMoney(byMethod('card'))}</Text></>}
        <TextField label={openShift ? 'Valor contado no caixa' : 'Fundo inicial'} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <Button label={openShift ? 'Fechar e conferir turno' : 'Abrir turno'} variant={openShift ? 'danger' : 'primary'} onPress={handleShift} />
      </Card>

      {shifts.filter((shift) => shift.status === 'closed').slice(-5).reverse().map((shift) => <Card key={shift.id} style={styles.history}><View style={styles.row}><View><Text style={styles.line}>Turno encerrado</Text><Text style={styles.meta}>{new Date(shift.closedAt!).toLocaleString('pt-BR')}</Text></View><Text style={[styles.difference, { color: shift.difference === 0 ? colors.success : colors.warning }]}>{shift.difference === 0 ? 'Conferido' : `Diferença ${formatMoney(shift.difference ?? 0)}`}</Text></View></Card>)}
    </Screen>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) { return <View style={[styles.metric, { borderTopColor: color }]}><Text style={styles.metricValue}>{formatMoney(value)}</Text><Text style={styles.meta}>{label}</Text></View>; }
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }, title: { color: colors.text, fontSize: 22, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 12 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }, metric: { width: '48%', backgroundColor: colors.bgElevated, borderRadius: radius.md, borderTopWidth: 3, padding: spacing.md }, metricValue: { color: colors.text, fontWeight: '800', fontSize: 16 }, section: { marginBottom: spacing.lg }, sectionTitle: { color: colors.text, fontWeight: '800', marginBottom: spacing.md }, line: { color: colors.text, marginBottom: spacing.sm }, history: { marginBottom: spacing.sm }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, difference: { fontWeight: '800', fontSize: 12 },
});
