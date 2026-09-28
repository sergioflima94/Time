import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { formatMoney, orderStatusLabel, tabStatusLabel, tabTotals } from '@/lib/establishmentOperations';
import { useAppStore } from '@/store/useAppStore';
import type { PaymentMethod } from '@/types';

export default function TabDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tab = useAppStore((s) => s.serviceTabs.find((row) => row.id === id));
  const participants = useAppStore(useShallow((s) => s.tabParticipants.filter((row) => row.tabId === id)));
  const orders = useAppStore(useShallow((s) => s.serviceOrders.filter((row) => row.tabId === id)));
  const allOrders = useAppStore((s) => s.serviceOrders);
  const allItems = useAppStore((s) => s.serviceOrderItems);
  const payments = useAppStore((s) => s.salePayments);
  const products = useAppStore(useShallow((s) => s.products.filter((row) => row.establishmentId === tab?.establishmentId && row.active)));
  const addTabParticipant = useAppStore((s) => s.addTabParticipant);
  const createServiceOrder = useAppStore((s) => s.createServiceOrder);
  const setOrderItemStatus = useAppStore((s) => s.setOrderItemStatus);
  const setServiceTabStatus = useAppStore((s) => s.setServiceTabStatus);
  const payServiceTab = useAppStore((s) => s.payServiceTab);
  const [participantName, setParticipantName] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(participants[0]?.id ?? null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentName, setPaymentName] = useState(tab?.customerName ?? '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');

  const totals = tab ? tabTotals(tab.id, allOrders, allItems, payments) : { gross: 0, paid: 0, balance: 0 };
  const orderIds = useMemo(() => new Set(orders.map((order) => order.id)), [orders]);
  const items = useMemo(() => allItems.filter((item) => orderIds.has(item.orderId)), [allItems, orderIds]);
  const canOrder = tab?.status === 'open';

  if (!tab) return <Screen><Text style={styles.empty}>Comanda não encontrada.</Text></Screen>;
  const tabId = tab.id;

  function changeQuantity(productId: string, delta: number) {
    setCart((current) => ({ ...current, [productId]: Math.max(0, (current[productId] ?? 0) + delta) }));
  }

  function handleParticipant() {
    if (!participantName.trim()) return;
    const participant = addTabParticipant(tabId, { playerId: null, name: participantName });
    setSelectedParticipant(participant.id);
    setParticipantName('');
  }

  function handleOrder() {
    const selected = Object.entries(cart).filter(([, quantity]) => quantity > 0);
    const order = createServiceOrder(tabId, selected.map(([productId, quantity]) => ({ productId, quantity, participantId: selectedParticipant, notes: null })), orderNotes);
    if (!order) return;
    setCart({});
    setOrderNotes('');
  }

  function handlePayment() {
    const amount = Number(paymentAmount.replace(',', '.')) || totals.balance;
    payServiceTab(tabId, { payerPlayerId: null, payerName: paymentName, amount, method: paymentMethod });
    setPaymentAmount('');
  }

  function handleClose() {
    setServiceTabStatus(tabId, 'closed');
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.title}>{tab.label}</Text><Text style={styles.meta}>{tab.customerName} · {tab.tableLabel || 'sem referência'}</Text></View>
        <Badge label={tabStatusLabel(tab.status)} color={tab.status === 'paid' || tab.status === 'closed' ? colors.success : colors.warning} />
      </View>

      <View style={styles.totals}>
        <Total label="Consumo" value={totals.gross} />
        <Total label="Pago" value={totals.paid} />
        <Total label="Saldo" value={totals.balance} highlight />
      </View>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Pessoas na comanda</Text>
        <View style={styles.chips}>
          {participants.map((participant) => <Pressable key={participant.id} onPress={() => setSelectedParticipant(participant.id)} style={[styles.chip, selectedParticipant === participant.id && styles.chipActive]}><Text style={[styles.chipText, selectedParticipant === participant.id && styles.chipTextActive]}>{participant.name}</Text></Pressable>)}
        </View>
        {canOrder && <View style={styles.inline}><View style={{ flex: 1 }}><TextField label="Adicionar pessoa" value={participantName} onChangeText={setParticipantName} /></View><Button label="Adicionar" small onPress={handleParticipant} disabled={!participantName.trim()} /></View>}
      </Card>

      {canOrder && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Novo pedido</Text>
          <Text style={styles.hint}>Os itens serão atribuídos a {participants.find((row) => row.id === selectedParticipant)?.name ?? 'responsável'}.</Text>
          {products.map((product) => (
            <View key={product.id} style={styles.productRow}>
              <View style={{ flex: 1 }}><Text style={styles.productName}>{product.name}</Text><Text style={styles.meta}>{formatMoney(product.price)} · {product.station === 'kitchen' ? 'cozinha' : product.station === 'bar' ? 'bar' : 'balcão'}{product.stockQuantity !== null ? ` · estoque ${product.stockQuantity}` : ''}</Text></View>
              <Pressable style={styles.qtyButton} onPress={() => changeQuantity(product.id, -1)}><Text style={styles.qtyText}>−</Text></Pressable>
              <Text style={styles.qty}>{cart[product.id] ?? 0}</Text>
              <Pressable style={styles.qtyButton} onPress={() => changeQuantity(product.id, 1)}><Text style={styles.qtyText}>+</Text></Pressable>
            </View>
          ))}
          <TextField label="Observação geral" value={orderNotes} onChangeText={setOrderNotes} placeholder="Sem cebola, entregar na quadra..." />
          <Button label="Enviar pedido" onPress={handleOrder} disabled={!Object.values(cart).some((quantity) => quantity > 0)} />
        </Card>
      )}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Pedidos</Text>
        {orders.length === 0 && <Text style={styles.empty}>Nenhum pedido lançado.</Text>}
        {orders.map((order) => (
          <View key={order.id} style={styles.orderBlock}>
            <View style={styles.row}><Text style={styles.orderTitle}>Pedido #{order.id.slice(-4).toUpperCase()}</Text><Badge label={orderStatusLabel(order.status)} color={order.status === 'ready' ? colors.success : colors.secondary} /></View>
            {items.filter((item) => item.orderId === order.id).map((item) => {
              const product = products.find((row) => row.id === item.productId);
              return <View key={item.id} style={styles.itemRow}><Text style={[styles.itemText, item.status === 'cancelled' && styles.cancelled]}>{item.quantity}× {product?.name ?? 'Produto'} · {formatMoney(item.quantity * item.unitPrice)}</Text>{item.status !== 'cancelled' && item.status !== 'delivered' && <Pressable onPress={() => Alert.alert('Cancelar item?', 'O histórico continuará visível.', [{ text: 'Voltar' }, { text: 'Cancelar item', style: 'destructive', onPress: () => setOrderItemStatus(item.id, 'cancelled', 'Cancelado pelo gerente') }])}><Ionicons name="close-circle-outline" size={19} color={colors.danger} /></Pressable>}</View>;
            })}
          </View>
        ))}
      </Card>

      {!['closed', 'cancelled'].includes(tab.status) && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Receber pagamento</Text>
          {tab.status === 'open' && <Button label="Encerrar consumo e cobrar" variant="secondary" onPress={() => setServiceTabStatus(tab.id, 'awaiting_payment')} />}
          <TextField label="Nome de quem paga" value={paymentName} onChangeText={setPaymentName} />
          <TextField label={`Valor (saldo ${formatMoney(totals.balance)})`} value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" placeholder={String(totals.balance.toFixed(2)).replace('.', ',')} />
          <SegmentedControl<PaymentMethod> label="Forma" value={paymentMethod} onChange={setPaymentMethod} options={[{ value: 'pix', label: 'Pix' }, { value: 'card', label: 'Cartão' }, { value: 'cash', label: 'Dinheiro' }]} />
          <Button label="Registrar pagamento" onPress={handlePayment} disabled={totals.balance <= 0 || !paymentName.trim()} />
          {totals.balance <= 0 && <Button label="Fechar comanda" variant="outline" onPress={handleClose} style={{ marginTop: spacing.sm }} />}
        </Card>
      )}
    </Screen>
  );
}

function Total({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) { return <View style={styles.total}><Text style={styles.meta}>{label}</Text><Text style={[styles.totalValue, highlight && { color: colors.warning }]}>{formatMoney(value)}</Text></View>; }

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }, title: { color: colors.text, fontSize: 21, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 12 },
  totals: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }, total: { flex: 1, backgroundColor: colors.bgElevated, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder }, totalValue: { color: colors.text, fontWeight: '800', marginTop: 4 },
  section: { marginBottom: spacing.lg }, sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: spacing.sm }, hint: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }, chip: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, chipActive: { borderColor: colors.primary, backgroundColor: 'rgba(34,197,94,0.12)' }, chipText: { color: colors.textMuted, fontSize: 12 }, chipTextActive: { color: colors.primary, fontWeight: '700' },
  inline: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }, productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.cardBorder }, productName: { color: colors.text, fontWeight: '700' }, qtyButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' }, qtyText: { color: colors.primary, fontSize: 20 }, qty: { width: 26, textAlign: 'center', color: colors.text, fontWeight: '800' },
  orderBlock: { borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingVertical: spacing.md }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, orderTitle: { color: colors.text, fontWeight: '700' }, itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm }, itemText: { color: colors.textMuted, flex: 1 }, cancelled: { textDecorationLine: 'line-through', color: colors.textFaint }, empty: { color: colors.textMuted, textAlign: 'center', marginVertical: spacing.lg },
});
