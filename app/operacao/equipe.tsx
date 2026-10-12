import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Switch, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { AdaptiveSelect } from "@/components/ui/AdaptiveSelect";
import { useVenueOperations } from "@/hooks/useVenueOperations";
import { venueAction } from "@/lib/venueOperations";
import {
  VENUE_CAPABILITIES,
  type VenueCapability,
} from "@/types/venueOperations";
import { colors } from "@/constants/theme";
export default function Team() {
  const { establishmentId } = useLocalSearchParams<{
      establishmentId: string;
    }>(),
    feed = useVenueOperations(establishmentId ?? null);
  const [email, setEmail] = useState(""),
    [role, setRole] = useState("coach"),
    [caps, setCaps] = useState<VenueCapability[]>(["own_classes"]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(action: string, data: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await venueAction(action, { venueId: establishmentId, ...data });
      setMessage("Acesso atualizado. Mudanças ficam registradas no histórico.");
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
      <Text style={{ fontSize: 21, fontWeight: "800", color: colors.text }}>
        Equipe e permissões
      </Text>
      <Text style={{ color: colors.textMuted }}>{feed.data.name}</Text>
      {!!(feed.error || message) && (
        <Text style={{ color: colors.warning }}>{feed.error || message}</Text>
      )}
      {feed.data.owner && (
        <Card style={{ gap: 12 }}>
          <TextField
            label="E-mail confirmado do funcionário / sócio"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <AdaptiveSelect
            label="Função"
            value={role}
            onChange={setRole}
            options={[
              { value: "coach", label: "Professor" },
              { value: "cashier", label: "Caixa" },
              { value: "manager", label: "Gerente" },
              { value: "partner", label: "Sócio" },
              { value: "kitchen", label: "Cozinha" },
            ]}
          />
          {VENUE_CAPABILITIES.map((c) => (
            <View
              key={c.value}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text style={{ flex: 1, color: colors.text }}>{c.label}</Text>
              <Switch
                value={caps.includes(c.value)}
                onValueChange={(b) =>
                  setCaps(
                    b ? [...caps, c.value] : caps.filter((x) => x !== c.value),
                  )
                }
              />
            </View>
          ))}
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Precificar exige também “suas aulas” ou “todas as turmas”.
            Relatórios não libera recebimento. Sem permissão marcada, não há
            acesso operacional.
          </Text>
          <Button
            label="Cadastrar / atualizar acesso"
            disabled={!email.trim()}
            loading={busy}
            onPress={() =>
              void run("staff_save", { email, role, capabilities: caps })
            }
          />
        </Card>
      )}
      {(feed.data.staff ?? []).map((s) => (
        <Card key={s.player_id} style={{ gap: 10 }}>
          <Text style={{ fontWeight: "700", color: colors.text }}>
            {s.name} · {s.active ? "Ativo" : "Revogado"}
          </Text>
          <Text style={{ color: colors.textMuted }}>
            {s.capabilities
              .map((c) => VENUE_CAPABILITIES.find((x) => x.value === c)?.label)
              .join(" · ") || "Sem permissões"}
          </Text>
          {s.active && (
            <Button
              variant="outline"
              label="Revogar acesso"
              disabled={busy}
              onPress={() =>
                void run("staff_revoke", { playerId: s.player_id })
              }
            />
          )}
        </Card>
      ))}
      {!feed.busy && !feed.data.owner && (
        <Text style={{ color: colors.textMuted }}>
          Somente o proprietário pode conceder acessos.
        </Text>
      )}
    </Screen>
  );
}
