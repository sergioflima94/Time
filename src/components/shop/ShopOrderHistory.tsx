import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/useAuthStore";
import { shopOrdersPage } from "@/lib/shop";
import type { ShopOrder } from "@/types/shop";
import { ShopOrderTile, shopStyles as st } from "./ShopUi";

export function ShopOrderHistory({
  sellerId = null,
  mode = "buyer",
}: {
  sellerId?: string | null;
  mode?: "buyer" | "manage";
}) {
  const actor = useAuthStore((s) => s.authUserId),
    scope = `${actor}:${sellerId}:${mode}`,
    epoch = useRef(0);
  const [rows, setRows] = useState<ShopOrder[]>([]),
    [forScope, setForScope] = useState(""),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    async (before?: ShopOrder) => {
      const n = ++epoch.current;
      setBusy(true);
      setError("");
      try {
        const data = await shopOrdersPage(mode, sellerId, before);
        if (n === epoch.current) {
          setRows((old) =>
            before
              ? [
                  ...new Map(
                    [...old, ...data.orders].map((o) => [o.id, o]),
                  ).values(),
                ]
              : data.orders,
          );
          setForScope(scope);
          setMore(data.hasMore);
        }
      } catch (e) {
        if (n === epoch.current)
          setError(
            e instanceof Error
              ? e.message
              : "Não foi possível consultar o histórico.",
          );
      } finally {
        if (n === epoch.current) setBusy(false);
      }
    },
    [scope, mode, sellerId],
  );
  useEffect(() => {
    void load();
    return () => {
      epoch.current++;
    };
  }, [load]);
  const visible = forScope === scope ? rows : [];
  return (
    <View style={st.page}>
      <Button
        small
        variant="outline"
        label="Atualizar histórico de pedidos"
        loading={busy}
        onPress={() => void load()}
      />
      {!!error && <Text style={st.error}>{error}</Text>}
      {!busy && !visible.length && (
        <Text style={st.copy}>Nenhum pedido neste histórico.</Text>
      )}
      {visible.map((o) => (
        <ShopOrderTile key={o.id} order={o} />
      ))}
      {forScope === scope && more && (
        <Button
          small
          label="Pedidos mais antigos"
          loading={busy}
          onPress={() => void load(visible[visible.length - 1])}
        />
      )}
    </View>
  );
}
