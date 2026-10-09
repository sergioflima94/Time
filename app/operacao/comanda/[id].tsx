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
import { contactlessReadiness, startContactlessPayment } from '@/lib/contactlessPayments';
import { formatMoney, orderStatusLabel, tabStatusLabel, tabTotals } from '@/lib/establishmentOperations';
import { getGateway, outstandingByParticipant, paymentMethodLabel } from '@/lib/paymentGateways';
import { isMockMode } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { PaymentMethod } from '@/types';

export default function TabDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tab = useAppStore((s) => s.serviceTabs.find((row) => row.id === id));
  const participants = useAppStore(useShallow((s) => s.tabParticipants.filter((row) => row.tabId === id)));
  const orders = useAppStore(useShallow((s) => s.serviceOrders.filter((row) => row.tabId === id)));
  const allOrders = useAppStore((s) => s.serviceOrders);
  const allItems = useAppStore((s) => s.serviceOrderItems);
  const itemShares = useAppStore((s) => s.orderItemShares);
  const payments = useAppStore((s) => s.salePayments);
  const allocations = useAppStore((s) => s.salePaymentAllocations);
  const paymentIntents = useAppStore(useShallow((s) => s.salePaymentIntents.filter((row) => row.tabId === id)));
  const gatewayConnection = useAppStore((s) => s.paymentGatewayConnections.find((row) => row.establishmentId === tab?.establishmentId && row.status === 'connected'));
  const products = useAppStore(useShallow((s) => s.products.filter((row) => row.establishmentId === tab?.establishmentId && row.active)));
  const addTabParticipant = useAppStore((s) => s.addTabParticipant);
  const createServiceOrder = useAppStore((s) => s.createServiceOrder);
  const splitOrderItem = useAppStore((s) => s.splitOrderItem);
  const createSalePaymentIntent = useAppStore((s) => s.createSalePaymentIntent);
  const confirmSalePaymentIntent = useAppStore((s) => s.confirmSalePaymentIntent);
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
  const [splitItemId, setSplitItemId] = useState<string | null>(null);
  const [splitParticipantIds, setSplitParticipantIds] = useState<string[]>([]);
  const [payerParticipantId, setPayerParticipantId] = useState<string | null>(participants[0]?.id ?? null);
  const [coveredParticipantIds, setCoveredParticipantIds] = useState<string[]>(participants[0]?.id ? [participants[0].id] : []);
  const [currentIntentId, setCurrentIntentId] = useState<string | null>(null);
  const [contactlessStage, setContactlessStage] = useState<'idle' | 'starting' | 'presented' | 'cancelled'>('idle');

  const totals = tab ? tabTotals(tab.id, allOrders, allItems, payments) : { gross: 0, paid: 0, balance: 0 };
  const orderIds = useMemo(() => new Set(orders.map((order) => order.id)), [orders]);
  const items = useMemo(() => allItems.filter((item) => orderIds.has(item.orderId)), [allItems, orderIds]);
  const outstanding = useMemo(
    () => outstandingByParticipant(id ?? '', allOrders, allItems, itemShares, allocations),
    [id, allOrders, allItems, itemShares, allocations],
  );
  const gateway = getGateway(gatewayConnection?.provider ?? 'manual_pix');
  const contactless = contactlessReadiness(gatewayConnection);
  const currentIntent = paymentIntents.find((row) => row.id === currentIntentId) ?? null;
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
    const participant = participants.find((row) => row.name.trim().toLowerCase() === paymentName.trim().toLowerCase());
    payServiceTab(tabId, { payerPlayerId: participant?.playerId ?? null, payerName: paymentName, amount, method: paymentMethod, coveredParticipantIds: coveredParticipantIds.length > 0 ? coveredParticipantIds : undefined });
    setPaymentAmount('');
  }

  function startSplit(itemId: string) {
    const assigned = itemShares.filter((share) => share.itemId === itemId).map((share) => share.participantId);
    setSplitItemId(itemId);
    setSplitParticipantIds(assigned.length > 0 ? assigned : participants[0]?.id ? [participants[0].id] : []);
  }

  function toggleSplitParticipant(participantId: string) {
    setSplitParticipantIds((current) => current.includes(participantId) ? current.filter((id) => id !== participantId) : [...current, participantId]);
  }

  function saveSplit() {
    if (!splitItemId || splitParticipantIds.length === 0) return;
    splitOrderItem(splitItemId, splitParticipantIds);
    setSplitItemId(null);
  }

  function selectPayer(participantId: string) {
    setPayerParticipantId(participantId);
    setCoveredParticipantIds((current) => current.includes(participantId) ? current : [...current, participantId]);
  }

  function toggleCovered(participantId: string) {
    setCoveredParticipantIds((current) => current.includes(participantId) ? current.filter((id) => id !== participantId) : [...current, participantId]);
  }

  async function handleGatewayCharge() {
    if (!payerParticipantId) return;
    if (paymentMethod === 'contactless' && !contactless.available) {
      Alert.alert('Aproximação indisponível', contactless.message);
      return;
    }
    const intent = createSalePaymentIntent(tabId, payerParticipantId, coveredParticipantIds, paymentMethod);
    if (!intent) {
      Alert.alert('Não foi possível criar a cobrança', paymentMethod === 'card' ? `${gateway.label} não está habilitado para cartão.` : paymentMethod === 'contactless' ? `${gateway.label} não está habilitado para aproximação.` : 'Confira as pessoas e os saldos selecionados.');
      return;
    }
    setCurrentIntentId(intent.id);
    if (paymentMethod !== 'contactless' || !gatewayConnection) return;
    setContactlessStage('starting');
    try {
      const result = await startContactlessPayment(intent, gatewayConnection);
      setContactlessStage(result.status === 'cancelled' ? 'cancelled' : 'presented');
    } catch (error) {
      setContactlessStage('idle');
      Alert.alert('Não foi possível abrir o leitor', error instanceof Error ? error.message : 'Tente novamente.');
    }
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
              const shares = itemShares.filter((share) => share.itemId === item.id);
              return (
                <View key={item.id} style={styles.itemBlock}>
                  <View style={styles.itemRow}>
                    <Text style={[styles.itemText, item.status === 'cancelled' && styles.cancelled]}>{item.quantity}× {product?.name ?? 'Produto'} · {formatMoney(item.quantity * item.unitPrice)}</Text>
                    {item.status !== 'cancelled' && <Button label="Rachar" small variant="ghost" onPress={() => startSplit(item.id)} />}
                    {item.status !== 'cancelled' && item.status !== 'delivered' && <Pressable onPress={() => Alert.alert('Cancelar item?', 'O histórico continuará visível.', [{ text: 'Voltar' }, { text: 'Cancelar item', style: 'destructive', onPress: () => setOrderItemStatus(item.id, 'cancelled', 'Cancelado pelo gerente') }])}><Ionicons name="close-circle-outline" size={19} color={colors.danger} /></Pressable>}
                  </View>
                  {shares.length > 0 && <Text style={styles.shareSummary}>{shares.map((share) => `${participants.find((row) => row.id === share.participantId)?.name ?? 'Pessoa'} ${formatMoney(share.amountCents / 100)}`).join(' · ')}</Text>}
                  {splitItemId === item.id && (
                    <View style={styles.splitBox}>
                      <Text style={styles.hint}>Quem consumiu? O valor será dividido igualmente.</Text>
                      <View style={styles.chips}>
                        {participants.map((participant) => <Pressable key={participant.id} onPress={() => toggleSplitParticipant(participant.id)} style={[styles.chip, splitParticipantIds.includes(participant.id) && styles.chipActive]}><Text style={[styles.chipText, splitParticipantIds.includes(participant.id) && styles.chipTextActive]}>{participant.name}</Text></Pressable>)}
                      </View>
                      <View style={styles.inlineButtons}><Button label="Cancelar" small variant="ghost" onPress={() => setSplitItemId(null)} style={{ flex: 1 }} /><Button label={`Dividir entre ${splitParticipantIds.length}`} small onPress={saveSplit} disabled={splitParticipantIds.length === 0} style={{ flex: 1 }} /></View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </Card>

      {!['closed', 'cancelled'].includes(tab.status) && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Fechar e receber</Text>
          {tab.status === 'open' && <Button label="Encerrar consumo e cobrar" variant="secondary" onPress={() => setServiceTabStatus(tab.id, 'awaiting_payment')} />}
          <View style={styles.gatewayBanner}>
            <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}><Text style={styles.gatewayTitle}>{gateway.label}</Text><Text style={styles.meta}>{gatewayConnection ? gatewayConnection.accountLabel : 'Pix manual — configure um gateway no painel do estabelecimento'}</Text></View>
          </View>

          <Text style={styles.subheading}>Saldo por pessoa</Text>
          {participants.filter((participant) => (outstanding[participant.id] ?? 0) > 0).map((participant) => (
            <View key={participant.id} style={styles.balanceRow}><Text style={styles.itemText}>{participant.name}</Text><Text style={styles.balanceValue}>{formatMoney((outstanding[participant.id] ?? 0) / 100)}</Text></View>
          ))}

          <Text style={styles.subheading}>Quem está pagando?</Text>
          <View style={styles.chips}>
            {participants.map((participant) => <Pressable key={participant.id} onPress={() => selectPayer(participant.id)} style={[styles.chip, payerParticipantId === participant.id && styles.chipActive]}><Text style={[styles.chipText, payerParticipantId === participant.id && styles.chipTextActive]}>{participant.name}</Text></Pressable>)}
          </View>

          <Text style={styles.subheading}>Quais partes serão quitadas?</Text>
          <Text style={styles.hint}>Pode pagar a própria parte e a de outras pessoas no mesmo pagamento.</Text>
          <View style={styles.chips}>
            {participants.filter((participant) => (outstanding[participant.id] ?? 0) > 0).map((participant) => <Pressable key={participant.id} onPress={() => toggleCovered(participant.id)} style={[styles.chip, coveredParticipantIds.includes(participant.id) && styles.chipActive]}><Text style={[styles.chipText, coveredParticipantIds.includes(participant.id) && styles.chipTextActive]}>{participant.name} · {formatMoney((outstanding[participant.id] ?? 0) / 100)}</Text></Pressable>)}
          </View>

          <SegmentedControl<PaymentMethod> label="Forma" value={paymentMethod} onChange={(method) => { setPaymentMethod(method); setContactlessStage('idle'); }} options={[{ value: 'pix', label: 'Pix' }, { value: 'contactless', label: 'Aprox.' }, { value: 'card', label: 'Online' }, { value: 'cash', label: 'Dinheiro' }]} />
          {paymentMethod === 'contactless' && (
            <View style={[styles.contactlessInfo, contactless.available && styles.contactlessInfoReady]}>
              <Ionicons name="phone-portrait-outline" size={24} color={contactless.available ? colors.primary : colors.warning} />
              <View style={{ flex: 1 }}><Text style={styles.gatewayTitle}>{contactless.available ? 'Celular pronto para receber' : 'Aproximação indisponível'}</Text><Text style={styles.meta}>{contactless.message}</Text></View>
            </View>
          )}
          <Button loading={contactlessStage === 'starting'} label={paymentMethod === 'pix' ? 'Gerar cobrança Pix' : paymentMethod === 'contactless' ? 'Ativar leitor por aproximação' : paymentMethod === 'card' ? 'Abrir checkout online' : 'Preparar baixa em dinheiro'} onPress={handleGatewayCharge} disabled={!payerParticipantId || coveredParticipantIds.length === 0 || (paymentMethod === 'card' && !gateway.card) || (paymentMethod === 'contactless' && !contactless.available)} />
          {paymentMethod === 'card' && !gateway.card && <Text style={styles.warning}>Escolha Mercado Pago ou PicPay no estabelecimento para aceitar cartão.</Text>}
          {paymentMethod === 'contactless' && !gateway.contactless && <Text style={styles.warning}>Escolha Mercado Pago ou PicPay no estabelecimento para aceitar aproximação.</Text>}

          {currentIntent && (
            <View style={styles.intentBox}>
              <View style={styles.row}><Text style={styles.gatewayTitle}>Cobrança {currentIntent.status === 'paid' ? 'confirmada' : 'gerada'}</Text><Badge label={currentIntent.status === 'paid' ? 'PAGO' : 'AGUARDANDO'} color={currentIntent.status === 'paid' ? colors.success : colors.warning} /></View>
              <Text style={styles.intentAmount}>{formatMoney(currentIntent.amountCents / 100)}</Text>
              <Text style={styles.meta}>{getGateway(currentIntent.provider).label} · {paymentMethodLabel(currentIntent.method)}</Text>
              {currentIntent.pixCopyPaste && <Text selectable style={styles.pixCode}>{currentIntent.pixCopyPaste}</Text>}
              {currentIntent.method === 'contactless' && currentIntent.status === 'pending' && contactlessStage === 'presented' && <View style={styles.tapPrompt}><Ionicons name="radio-outline" size={30} color={colors.primary} /><View style={{ flex: 1 }}><Text style={styles.tapTitle}>Aproxime agora</Text><Text style={styles.meta}>Encoste o cartão, relógio ou celular do cliente na parte traseira deste aparelho e aguarde a confirmação.</Text></View></View>}
              {currentIntent.method === 'contactless' && contactlessStage === 'cancelled' && <Text style={styles.warning}>Leitura cancelada. Você pode ativar o leitor novamente.</Text>}
              {isMockMode && currentIntent.status === 'pending' && <Button label="Simular confirmação do gateway" variant="outline" onPress={() => confirmSalePaymentIntent(currentIntent.id)} />}
            </View>
          )}

          <View style={styles.divider} />
          <Text style={styles.subheading}>Baixa manual pelo caixa</Text>
          <TextField label="Nome de quem paga" value={paymentName} onChangeText={setPaymentName} />
          <TextField label={`Valor (saldo ${formatMoney(totals.balance)})`} value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" placeholder={String(totals.balance.toFixed(2)).replace('.', ',')} />
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }, chip: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, chipActive: { borderColor: colors.primary, backgroundColor: 'rgba(157,235,34,0.12)' }, chipText: { color: colors.textMuted, fontSize: 12 }, chipTextActive: { color: colors.primary, fontWeight: '700' },
  inline: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }, productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.cardBorder }, productName: { color: colors.text, fontWeight: '700' }, qtyButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' }, qtyText: { color: colors.primary, fontSize: 20 }, qty: { width: 26, textAlign: 'center', color: colors.text, fontWeight: '800' },
  orderBlock: { borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingVertical: spacing.md }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, orderTitle: { color: colors.text, fontWeight: '700' }, itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm }, itemText: { color: colors.textMuted, flex: 1 }, cancelled: { textDecorationLine: 'line-through', color: colors.textFaint }, empty: { color: colors.textMuted, textAlign: 'center', marginVertical: spacing.lg },
  itemBlock: { borderBottomWidth: 1, borderBottomColor: colors.cardBorder, paddingBottom: spacing.sm }, shareSummary: { color: colors.primary, fontSize: 11, lineHeight: 16 }, splitBox: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm }, inlineButtons: { flexDirection: 'row', gap: spacing.sm },
  gatewayBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md }, gatewayTitle: { color: colors.text, fontWeight: '800', fontSize: 13 }, subheading: { color: colors.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginTop: spacing.sm }, balanceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.cardBorder }, balanceValue: { color: colors.text, fontWeight: '800' }, warning: { color: colors.warning, fontSize: 11 }, intentBox: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }, intentAmount: { color: colors.primary, fontSize: 24, fontWeight: '900' }, pixCode: { color: colors.textMuted, fontSize: 10, backgroundColor: colors.bg, borderRadius: radius.sm, padding: spacing.sm }, divider: { height: 1, backgroundColor: colors.cardBorder, marginVertical: spacing.sm },
  contactlessInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.warning, backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: radius.md, padding: spacing.md }, contactlessInfoReady: { borderColor: colors.primary, backgroundColor: 'rgba(157,235,34,0.08)' }, tapPrompt: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.md, padding: spacing.md, backgroundColor: 'rgba(157,235,34,0.1)' }, tapTitle: { color: colors.primary, fontSize: 17, fontWeight: '900' },
});
