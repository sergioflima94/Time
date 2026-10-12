import { useRef, useState } from "react";
import { router } from "expo-router";
import { Text } from "react-native";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { AdaptiveSelect } from "./ui/AdaptiveSelect";
import { Consent } from "./CustomerInvoicesScreen";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import { creditAction } from "@/lib/customerInvoices";
import { moneyCents } from "@/lib/venueOperations";
import { createUuid } from "@/lib/uuid";
import { colors } from "@/constants/theme";
export function TabInvoiceOption({
  feed,
  tabId,
  hasIntent,
}: {
  feed: ReturnType<typeof useCustomerInvoices>;
  tabId: string;
  hasIntent: boolean;
}) {
  const d = feed.data,
    [selected, setSelected] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    lock = useRef(false),
    pending = useRef<{ key: string; id: string } | null>(null);
  const account = d.accounts?.find((a) => a.id === selected),
    balance = d.balance_cents ?? 0;
  if (!feed.ready)
    return (
      <Card>
        <Text style={{ color: colors.textMuted }}>
          {feed.error || "Consultando opção de fatura..."}
        </Text>
        <Button
          small
          label="Atualizar opção de fatura"
          onPress={() => void feed.refresh()}
        />
      </Card>
    );
  if (d.billed)
    return (
      <Card style={{ gap: 12 }}>
        <Text style={{ color: colors.text, fontWeight: "800" }}>
          Comanda na fatura · {moneyCents(d.billed.amount_cents)}
        </Text>
        <Text style={{ color: colors.textMuted }}>
          Responsável: {d.billed.customer_name} · corte{" "}
          {new Date(`${d.billed.cut_date}T12:00:00`).toLocaleDateString(
            "pt-BR",
          )}
          . Consumo encerrado; não é um pagamento. Consulte o saldo atualizado
          em Faturas.
        </Text>
        <Button
          label="Ver faturas"
          onPress={() =>
            router.push(
              d.can_record
                ? {
                    pathname: "/operacao/faturas",
                    params: { establishmentId: d.venue_id },
                  }
                : "/faturas",
            )
          }
        />
      </Card>
    );
  if (!d.accounts?.length || balance <= 0 || d.can_bill === false) return null;
  async function post() {
    if (lock.current || !account) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const key = `${account.id}:${balance}:${tabId}`;
    if (pending.current?.key !== key)
      pending.current = { key, id: createUuid() };
    try {
      await creditAction(
        "post_tab",
        { tabId, accountId: account.id, expectedCents: balance, consent },
        pending.current.id,
      );
      pending.current = null;
      await feed.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 12, marginBottom: 16 }}>
      <Text style={{ fontSize: 15, fontWeight: "800", color: colors.text }}>
        Pagar agora ou deixar na fatura
      </Text>
      <Text style={{ fontSize: 12, lineHeight: 19, color: colors.textMuted }}>
        Pagar na hora continua disponível abaixo. Para faturar, um cliente
        autorizado assume TODO o saldo restante de {moneyCents(balance)},
        inclusive itens compartilhados. Para consumir outro dia, abra outra
        comanda.
      </Text>
      <AdaptiveSelect
        label="Quem assume o saldo"
        value={selected}
        onChange={(v) => {
          setSelected(v);
          setConsent(false);
        }}
        options={d.accounts.map((a) => ({ value: a.id, label: a.name }))}
      />
      {account && (
        <>
          <Text style={{ color: colors.textMuted }}>
            Corte dia {account.cut_day} · disponível{" "}
            {moneyCents(
              Math.max(0, account.limit_cents - account.balance_cents),
            )}
          </Text>
          <Consent
            value={consent}
            onChange={setConsent}
            label={
              account.player_id === d.me
                ? "Aceito assumir o saldo inteiro na minha fatura"
                : "Cliente autorizou assumir o saldo inteiro na fatura"
            }
          />
        </>
      )}
      {hasIntent && (
        <Text style={{ color: colors.warning }}>
          Já foi iniciado pagamento nesta comanda. Conclua esse fluxo; não é
          possível transferir para fatura.
        </Text>
      )}
      {account?.overdue && (
        <Text style={{ color: colors.warning }}>
          Fatura vencida: pague na hora ou quite o atraso.
        </Text>
      )}
      {!!error && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.warning }}
        >
          {error}
        </Text>
      )}
      <Button
        label="Deixar na fatura"
        loading={busy}
        disabled={
          !account ||
          !consent ||
          hasIntent ||
          account.overdue ||
          balance > account.limit_cents - account.balance_cents
        }
        onPress={() => void post()}
      />
    </Card>
  );
}
