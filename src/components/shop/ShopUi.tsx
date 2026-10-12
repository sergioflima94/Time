import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { colors, spacing } from "@/constants/theme";
import { SHOP_STATUS, shopMoney, type ShopOrder } from "@/types/shop";
export const shopStyles = StyleSheet.create({
  page: { gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  section: { fontSize: 16, fontWeight: "800", color: colors.text },
  label: { fontSize: 13, fontWeight: "700", color: colors.text },
  copy: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  notice: { fontSize: 13, lineHeight: 20, color: colors.secondaryDark },
  error: { fontSize: 13, lineHeight: 20, color: colors.danger },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  group: { gap: spacing.sm },
  form: { gap: spacing.md },
  field: { marginBottom: 0 },
  price: { fontSize: 18, fontWeight: "800", color: colors.primaryDark },
  divider: {
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
});
export function ShopOrderTile({ order: o }: { order: ShopOrder }) {
  return (
    <Card>
      <View style={shopStyles.row}>
        <Text style={[shopStyles.label, { flex: 1 }]}>{o.seller_name}</Text>
        <Text style={shopStyles.price}>{shopMoney(o.total_cents)}</Text>
      </View>
      <Text style={shopStyles.copy}>
        Pedido {o.id.slice(0, 8)} ·{" "}
        {new Date(o.created_at).toLocaleString("pt-BR")}
      </Text>
      <Text style={shopStyles.label}>{SHOP_STATUS[o.status]}</Text>
      <Button
        small
        variant="outline"
        label={`Ver pedido ${o.id.slice(0, 8)}`}
        onPress={() =>
          router.push({ pathname: "/loja/pedido/[id]", params: { id: o.id } })
        }
      />
    </Card>
  );
}
