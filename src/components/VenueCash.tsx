import { useState } from "react";
import { router } from "expo-router";
import { Text } from "react-native";
import { Screen } from "./ui/Screen";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { useVenueOperations } from "@/hooks/useVenueOperations";
import { moneyCents, parsePrice, venueAction } from "@/lib/venueOperations";
import { formatDateTime } from "@/lib/establishmentOperations";
import { colors } from "@/constants/theme";
export function VenueCash({ venue }: { venue: string | null }) {
  const feed = useVenueOperations(venue),
    d = feed.data,
    shift = d.shifts?.find((x) => x.status === "open");
  const [amount, setAmount] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const cents = parsePrice(amount);
      if (cents === null) throw new Error("Informe o valor contado.");
      await venueAction("cash_shift", {
        venueId: venue,
        operation: shift ? "close" : "open",
        shiftId: shift?.id,
        amountCents: cents,
      });
      setMessage("Turno registrado no banco.");
      setAmount("");
      await feed.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const canCash = d.capabilities?.includes("cash");
  return (
    <Screen>
      <Button
        small
        variant="ghost"
        label="Voltar"
        onPress={() => router.back()}
      />
      <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text }}>
        Caixa · {d.name}
      </Text>
      <Text style={{ color: colors.textMuted }}>
        Recebimentos de alimentação e aulas. Mensalidade entra uma vez, na data
        de recebimento. Locações não são estimadas como dinheiro em caixa.
      </Text>
      {!!(message || feed.error) && (
        <Text style={{ color: colors.warning }}>{feed.error || message}</Text>
      )}
      <Button
        small
        variant="outline"
        label="Atualizar caixa"
        loading={feed.busy}
        onPress={() => void feed.refresh()}
      />
      {d.food_received_cents !== undefined && (
        <Card>
          <Text style={{ color: colors.text }}>
            Hoje · lanchonete {moneyCents(d.food_received_cents)} · aulas em
            dinheiro {moneyCents(d.classes_cash_cents ?? 0)}
          </Text>
        </Card>
      )}
      {d.invoice_pending_cents !== undefined && <Card style={{gap:12}}><Text style={{color:colors.text}}>Faturas a receber {moneyCents(d.invoice_pending_cents)} · não entram no caixa até o pagamento.</Text><Text style={{color:colors.text}}>Recebido hoje em contas de clientes e locações: {moneyCents(d.credit_received_cents ?? 0)} · conferido pelo caixa ou provedor. Valores brutos, não lucro nem saldo bancário líquido.</Text><Button small variant="outline" label="Clientes e faturas" onPress={()=>router.push({pathname:'/operacao/faturas',params:{establishmentId:venue??''}})}/></Card>}
      {canCash && (
        <Card style={{ gap: 12 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>
            {shift ? "Encerrar turno" : "Abrir turno"}
          </Text>
          {shift && (
            <Text style={{ color: colors.textMuted }}>
              Desde {formatDateTime(shift.opened_at)} · fundo{" "}
              {moneyCents(Math.round(Number(shift.opening_amount) * 100))}
            </Text>
          )}
          <TextField
            label={shift ? "Dinheiro total contado (R$)" : "Fundo inicial (R$)"}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <Button
            label={shift ? "Fechar e conferir" : "Abrir turno"}
            loading={busy}
            onPress={() => void submit()}
          />
        </Card>
      )}
      {(d.shifts ?? [])
        .filter((x) => x.status === "closed")
        .map((x) => (
          <Card key={x.id}>
            <Text style={{ fontWeight: "700", color: colors.text }}>
              Turno encerrado · {formatDateTime(x.closed_at!)}
            </Text>
            <Text style={{ color: colors.textMuted }}>
              Contado {moneyCents(Math.round(Number(x.closing_amount) * 100))} ·
              esperado {moneyCents(Math.round(Number(x.expected_amount) * 100))}{" "}
              · diferença {moneyCents(Math.round(Number(x.difference) * 100))}
            </Text>
          </Card>
        ))}
      {!!d.audit?.length && (
        <Text style={{ fontWeight: "700", color: colors.text }}>
          Últimas operações autorizadas
        </Text>
      )}
      {(d.audit ?? []).map((a, i) => (
        <Text key={i} style={{ color: colors.textMuted, fontSize: 12 }}>
          {formatDateTime(a.created_at)} · {a.action.replaceAll("_", " ")}
        </Text>
      ))}
    </Screen>
  );
}
