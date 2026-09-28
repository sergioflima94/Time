import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { formatMoney, tabStatusLabel, tabTotals } from '@/lib/establishmentOperations';
import { useAppStore } from '@/store/useAppStore';

export default function TabsScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const { establishmentId } = useLocalSearchParams<{ establishmentId?: string }>();
  const establishment = useAppStore((s) => s.establishments.find((e) => e.id === establishmentId && e.ownerPlayerId === currentPlayerId) ?? s.establishments.find((e) => e.ownerPlayerId === currentPlayerId));
  const tabs = useAppStore(useShallow((s) => s.serviceTabs.filter((tab) => tab.establishmentId === establishment?.id)));
  const orders = useAppStore((s) => s.serviceOrders);
  const items = useAppStore((s) => s.serviceOrderItems);
  const payments = useAppStore((s) => s.salePayments);
  const openServiceTab = useAppStore((s) => s.openServiceTab);
  const [showForm, setShowForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [tableLabel, setTableLabel] = useState('');

  const sorted = useMemo(() => [...tabs].sort((a, b) => Number(a.status === 'closed') - Number(b.status === 'closed') || b.openedAt.localeCompare(a.openedAt)), [tabs]);

  function handleOpen() {
    if (!establishment || !customerName.trim()) return;
    const tab = openServiceTab(establishment.id, { customerPlayerId: null, customerName: customerName.trim(), tableLabel: tableLabel.trim() || null, gameId: null });
    setCustomerName('');
    setTableLabel('');
    setShowForm(false);
    router.push(`/operacao/comanda/${tab.id}`);
  }

  if (!establishment) return <Screen><Text style={styles.empty}>Cadastre um estabelecimento primeiro.</Text></Screen>;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.title}>Comandas</Text><Text style={styles.subtitle}>{establishment.name}</Text></View>
        <Pressable onPress={() => setShowForm((value) => !value)}><Ionicons name={showForm ? 'close' : 'add-circle'} size={28} color={colors.primary} /></Pressable>
      </View>

      {showForm && (
        <Card style={styles.form}>
          <Text style={styles.sectionTitle}>Abrir nova comanda</Text>
          <TextField label="Cliente ou responsável" value={customerName} onChangeText={setCustomerName} placeholder="Nome do cliente" />
          <TextField label="Mesa, quadra ou referência" value={tableLabel} onChangeText={setTableLabel} placeholder="Mesa 3, Quadra 1..." />
          <Button label="Abrir comanda" onPress={handleOpen} disabled={!customerName.trim()} />
        </Card>
      )}

      <View style={styles.summaryRow}>
        <Summary value={String(tabs.filter((tab) => !['closed', 'cancelled'].includes(tab.status)).length)} label="abertas" />
        <Summary value={formatMoney(tabs.reduce((sum, tab) => sum + tabTotals(tab.id, orders, items, payments).balance, 0))} label="a receber" />
      </View>

      {sorted.map((tab) => {
        const totals = tabTotals(tab.id, orders, items, payments);
        const color = tab.status === 'paid' || tab.status === 'closed' ? colors.success : tab.status === 'partially_paid' ? colors.warning : colors.secondary;
        return (
          <Pressable key={tab.id} onPress={() => router.push(`/operacao/comanda/${tab.id}`)}>
            <Card style={styles.tabCard}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}><Text style={styles.tabName}>{tab.label} · {tab.customerName}</Text><Text style={styles.meta}>{tab.tableLabel || 'Sem referência'} · saldo {formatMoney(totals.balance)}</Text></View>
                <Badge label={tabStatusLabel(tab.status)} color={color} />
              </View>
            </Card>
          </Pressable>
        );
      })}
      {sorted.length === 0 && <Text style={styles.empty}>Nenhuma comanda. Abra a primeira para começar o atendimento.</Text>}
    </Screen>
  );
}

function Summary({ value, label }: { value: string; label: string }) {
  return <View style={styles.summary}><Text style={styles.summaryValue}>{value}</Text><Text style={styles.meta}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 12 },
  form: { marginBottom: spacing.lg }, sectionTitle: { color: colors.text, fontWeight: '800', marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  summary: { flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.cardBorder },
  summaryValue: { color: colors.text, fontSize: 20, fontWeight: '800' },
  tabCard: { marginBottom: spacing.sm }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tabName: { color: colors.text, fontWeight: '700', fontSize: 15 }, meta: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
});
