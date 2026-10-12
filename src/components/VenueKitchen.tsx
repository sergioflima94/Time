import { useState } from "react";
import { router } from "expo-router";
import { Text } from "react-native";
import { Screen } from "./ui/Screen";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { useVenueOperations } from "@/hooks/useVenueOperations";
import { venueAction } from "@/lib/venueOperations";
import { colors } from "@/constants/theme";
export function VenueKitchen({ venue }: { venue: string | null }) {
  const feed = useVenueOperations(venue),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function change(id: string, status: string) {
    if (busy) return;
    setBusy(true);
    try {
      await venueAction("kitchen_status", {
        venueId: venue,
        itemId: id,
        status,
      });
      await feed.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Button
        small
        variant="ghost"
        label="Voltar"
        onPress={() => router.back()}
      />
      <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text }}>
        Cozinha e bar
      </Text>
      <Text style={{ color: colors.textMuted }}>
        Fila de produção, sem preços, contatos ou caixa.
      </Text>
      <Button
        small
        variant="outline"
        label="Atualizar fila"
        loading={feed.busy}
        onPress={() => void feed.refresh()}
      />
      {!!(message || feed.error) && (
        <Text style={{ color: colors.warning }}>{message || feed.error}</Text>
      )}
      {(feed.data.kitchen ?? []).map((i) => (
        <Card key={i.id} style={{ gap: 10 }}>
          <Text style={{ fontWeight: "700", color: colors.text }}>
            {i.quantity}× {i.name}
          </Text>
          <Text style={{ color: colors.textMuted }}>
            {i.tab_label} · {i.table_label ?? "Balcão"} · {i.notes ?? ""}
          </Text>
          <Button
            small
            disabled={busy}
            label={
              i.status === "submitted"
                ? "Iniciar preparo"
                : i.status === "preparing"
                  ? "Marcar pronto"
                  : "Entregar"
            }
            onPress={() =>
              void change(
                i.id,
                i.status === "submitted"
                  ? "preparing"
                  : i.status === "preparing"
                    ? "ready"
                    : "delivered",
              )
            }
          />
        </Card>
      ))}
      {!feed.data.kitchen?.length && !feed.busy && (
        <Text style={{ color: colors.textMuted }}>
          Nenhum pedido disponível para seu acesso.
        </Text>
      )}
    </Screen>
  );
}
