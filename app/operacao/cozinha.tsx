import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing } from '@/constants/theme';
import { orderStatusLabel } from '@/lib/establishmentOperations';
import { useAppStore } from '@/store/useAppStore';
import type { ServiceOrderItem } from '@/types';

const columns: Array<{ status: ServiceOrderItem['status']; title: string; next: ServiceOrderItem['status'] | null; action: string }> = [
  { status: 'submitted', title: 'Recebidos', next: 'preparing', action: 'Iniciar preparo' },
  { status: 'preparing', title: 'Em preparo', next: 'ready', action: 'Marcar pronto' },
  { status: 'ready', title: 'Prontos', next: 'delivered', action: 'Entregar' },
];

export default function KitchenScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const { establishmentId } = useLocalSearchParams<{ establishmentId?: string }>();
  const establishment = useAppStore((s) => s.establishments.find((e) => e.id === establishmentId && e.ownerPlayerId === currentPlayerId) ?? s.establishments.find((e) => e.ownerPlayerId === currentPlayerId));
  const tabs = useAppStore(useShallow((s) => s.serviceTabs.filter((tab) => tab.establishmentId === establishment?.id)));
  const orders = useAppStore((s) => s.serviceOrders);
  const items = useAppStore((s) => s.serviceOrderItems);
  const products = useAppStore((s) => s.products);
  const setOrderItemStatus = useAppStore((s) => s.setOrderItemStatus);
  const tabIds = new Set(tabs.map((tab) => tab.id));
  const orderIds = new Set(orders.filter((order) => tabIds.has(order.tabId)).map((order) => order.id));

  return (
    <Screen>
      <View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable><View><Text style={styles.title}>Cozinha e bar</Text><Text style={styles.meta}>Fila por item, sem acesso ao caixa</Text></View></View>
      {columns.map((column) => {
        const rows = items.filter((item) => orderIds.has(item.orderId) && item.status === column.status);
        return (
          <View key={column.status} style={styles.column}>
            <View style={styles.columnHeader}><Text style={styles.columnTitle}>{column.title}</Text><Text style={styles.count}>{rows.length}</Text></View>
            {rows.map((item) => {
              const order = orders.find((row) => row.id === item.orderId);
              const tab = tabs.find((row) => row.id === order?.tabId);
              const product = products.find((row) => row.id === item.productId);
              return (
                <Card key={item.id} style={styles.itemCard}>
                  <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.itemName}>{item.quantity}× {product?.name}</Text><Text style={styles.meta}>{tab?.label} · {tab?.customerName}{item.notes ? ` · ${item.notes}` : ''}</Text></View><Text style={styles.station}>{product?.station === 'bar' ? 'BAR' : product?.station === 'kitchen' ? 'COZINHA' : 'BALCÃO'}</Text></View>
                  {column.next && <Button label={column.action} small onPress={() => setOrderItemStatus(item.id, column.next!)} style={{ marginTop: spacing.sm }} />}
                </Card>
              );
            })}
            {rows.length === 0 && <Text style={styles.empty}>Nada em {orderStatusLabel(column.status).toLowerCase()}.</Text>}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }, title: { color: colors.text, fontSize: 22, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 12 },
  column: { marginBottom: spacing.xl }, columnHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }, columnTitle: { color: colors.text, fontSize: 16, fontWeight: '800' }, count: { color: colors.onPrimary, backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, fontSize: 11, fontWeight: '800' },
  itemCard: { marginBottom: spacing.sm }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, itemName: { color: colors.text, fontWeight: '700' }, station: { color: colors.warning, fontSize: 10, fontWeight: '800' }, empty: { color: colors.textFaint, fontSize: 12, marginVertical: spacing.sm },
});
