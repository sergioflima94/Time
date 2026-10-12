import { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { Consent } from "./InvoiceControls";
import { colors } from "@/constants/theme";
import { moneyCents } from "@/lib/venueOperations";
import type { CreditInvoice } from "@/types/customerInvoices";
import type { InvoiceRun } from "./InvoiceAdvanced";
export function InvoiceAgreement({
  invoice: i,
  owner,
  mine,
  busy,
  run,
}: {
  invoice: CreditInvoice;
  owner: boolean;
  mine: boolean;
  busy: boolean;
  run: InvoiceRun;
}) {
  const [open, setOpen] = useState(false),
    [count, setCount] = useState("3"),
    [first, setFirst] = useState(""),
    [gap, setGap] = useState("30"),
    [reason, setReason] = useState(""),
    [consent, setConsent] = useState(false);
  const active = i.agreements?.find((a) =>
    ["proposed", "accepted"].includes(a.status),
  );
  return (
    <View
      style={{
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: colors.cardBorder,
        paddingTop: 12,
      }}
    >
      <Text style={{ color: colors.text, fontWeight: "800" }}>
        Negociar vencimentos
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19 }}>
        Sem juros e sem nova dívida. O dono propõe, o cliente aceita no app.
        Datas originais e pagamentos ficam preservados; Pix parcial pode pagar
        uma parcela. Novos consumos não entram neste ciclo após proposta.
      </Text>
      {active && (
        <>
          <Text style={{ color: colors.text }}>
            {active.status === "accepted"
              ? "Acordo aceito"
              : "Proposta aguardando cliente"}{" "}
            · {moneyCents(active.amount_cents)} · {active.reason}
          </Text>
          {active.schedule.map((p) => (
            <Text key={p.number} style={{ color: colors.textMuted }}>
              Parcela {p.number} ·{" "}
              {new Date(p.due_date + "T12:00:00").toLocaleDateString("pt-BR")} ·{" "}
              {moneyCents(p.amount_cents)} · restante{" "}
              {moneyCents(p.remaining_cents)}
            </Text>
          ))}
          {active.needs_review && (
            <Text style={{ color: colors.warning }}>
              Correção/devolução aumentou o saldo além do acordo. Confira com o
              dono; não foi criada parcela extra automaticamente.
            </Text>
          )}
          {active.status === "proposed" &&
            (mine ? (
              <>
                <Consent
                  label="Aceito o valor e os vencimentos deste acordo"
                  value={consent}
                  onChange={setConsent}
                />
                <Button
                  label="Aceitar acordo de pagamento"
                  disabled={busy || !consent || i.online?.held}
                  onPress={() =>
                    void run(
                      "agreement_accept",
                      { agreementId: active.id, consent },
                      "Acordo aceito. Os pagamentos não são automáticos.",
                    )
                  }
                />
                <Button
                  small
                  variant="outline"
                  label="Recusar proposta de acordo"
                  disabled={busy}
                  onPress={() =>
                    void run(
                      "agreement_reject",
                      { agreementId: active.id },
                      "Proposta recusada; dívida original preservada.",
                    )
                  }
                />
              </>
            ) : owner ? (
              <Button
                small
                variant="outline"
                label="Cancelar proposta de acordo"
                disabled={busy}
                onPress={() =>
                  void run(
                    "agreement_cancel",
                    { agreementId: active.id },
                    "Proposta cancelada.",
                  )
                }
              />
            ) : null)}
        </>
      )}
      {owner && !active && i.balance_cents > 0 && (
        <>
          <Button
            small
            variant="outline"
            label={open ? "Fechar proposta" : "Propor parcelamento sem juros"}
            onPress={() => setOpen(!open)}
          />
          {open && (
            <>
              <TextField
                label="Número de parcelas (2 a 12)"
                value={count}
                onChangeText={setCount}
                keyboardType="number-pad"
              />
              <TextField
                label="Primeiro vencimento (AAAA-MM-DD)"
                value={first}
                onChangeText={setFirst}
              />
              <TextField
                label="Intervalo entre parcelas (7 a 45 dias)"
                value={gap}
                onChangeText={setGap}
                keyboardType="number-pad"
              />
              <TextField
                label="Motivo e condições do acordo"
                value={reason}
                onChangeText={setReason}
                maxLength={500}
              />
              <Button
                label="Enviar proposta para o cliente"
                disabled={
                  busy ||
                  i.online?.held ||
                  reason.trim().length < 8 ||
                  !/^\d{4}-\d{2}-\d{2}$/.test(first)
                }
                onPress={() =>
                  void run(
                    "agreement_propose",
                    {
                      invoiceId: i.id,
                      installments: Number(count),
                      firstDue: first,
                      gapDays: Number(gap),
                      reason,
                      expectedCents: i.balance_cents,
                    },
                    "Proposta enviada. Só vale após aceite do cliente.",
                  )
                }
              />
            </>
          )}
        </>
      )}
    </View>
  );
}
