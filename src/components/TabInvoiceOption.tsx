import { useRef, useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { AdaptiveSelect } from "./ui/AdaptiveSelect";
import { Consent, Receipt } from "./InvoiceControls";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import { creditAction } from "@/lib/customerInvoices";
import { moneyCents } from "@/lib/venueOperations";
import { createUuid } from "@/lib/uuid";
import { colors } from "@/constants/theme";
import type { CreditSnapshot } from "@/types/customerInvoices";
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
  const partsPanel = <PartOptions feed={feed} tabId={tabId} />;
  if (
    d.has_transfers ||
    !d.accounts?.length ||
    balance <= 0 ||
    d.can_bill === false
  )
    return partsPanel;
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
    <>
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
      {partsPanel}
    </>
  );
}
function PartOptions({
  feed,
  tabId,
}: {
  feed: ReturnType<typeof useCustomerInvoices>;
  tabId: string;
}) {
  const d = feed.data;
  if (!d.parts?.length && !d.has_transfers) return null;
  return (
    <Card style={{ gap: 12, marginBottom: 16 }}>
      <Text style={{ color: colors.text, fontWeight: "800" }}>
        Faturar por pessoa
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19 }}>
        Itens precisam estar inteiramente distribuídos entre as pessoas. Após a
        primeira transferência, o consumo fica congelado. As partes restantes
        podem ser faturadas por seus titulares autorizados ou recebidas pelo
        caixa em dinheiro/Pix conferido.
      </Text>
      {!!d.transferred_cents && (
        <Text style={{ color: colors.textMuted }}>
          Transferido para faturas: {moneyCents(d.transferred_cents)} · ainda a
          receber na comanda: {moneyCents(d.balance_cents ?? 0)}
        </Text>
      )}
      {d.split_ready === false && (
        <Text style={{ color: colors.warning }}>
          Distribua todos os itens e pagamentos para habilitar a separação.
        </Text>
      )}
      {(d.parts ?? []).map((p) => (
        <PersonPart key={p.id} part={p} feed={feed} tabId={tabId} />
      ))}
    </Card>
  );
}
function PersonPart({
  part: p,
  feed,
  tabId,
}: {
  part: NonNullable<CreditSnapshot["parts"]>[number];
  feed: ReturnType<typeof useCustomerInvoices>;
  tabId: string;
}) {
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    lock = useRef(false),
    pending = useRef<{ key: string; nonce: string } | null>(null);
  const d = feed.data,
    a = d.accounts?.find((x) => x.player_id === p.player_id);
  async function run(action: string, data: Record<string, unknown>) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    const key = JSON.stringify({ action, data });
    if (pending.current?.key !== key)
      pending.current = { key, nonce: createUuid() };
    try {
      await creditAction(action, data, pending.current.nonce);
      pending.current = null;
      setMessage("Parte registrada.");
      await feed.refresh();
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <View
      style={{
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: colors.cardBorder,
        paddingTop: 12,
      }}
    >
      <Text style={{ color: colors.text, fontWeight: "700" }}>
        {p.name} · {moneyCents(p.remaining_cents)}
      </Text>
      {p.invoice_id ? (
        <>
          <Text style={{ color: colors.textMuted }}>
            Parte transferida: consulte pagamento e vencimento em Faturas.
          </Text>
          <Button
            small
            variant="outline"
            label={`Ver fatura de ${p.name}`}
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
        </>
      ) : p.remaining_cents <= 0 ? (
        <Text style={{ color: colors.textMuted }}>Sem saldo na comanda.</Text>
      ) : (
        <>
          {a && (
            <>
              <Consent
                value={consent}
                onChange={setConsent}
                label={
                  p.player_id === d.me
                    ? "Aceito faturar somente a minha parte"
                    : `Cliente autorizou faturar a parte de ${p.name}`
                }
              />
              <Button
                small
                label={`Faturar parte de ${p.name}`}
                disabled={
                  busy ||
                  !consent ||
                  d.split_ready === false ||
                  a.overdue ||
                  p.remaining_cents > a.limit_cents - a.balance_cents ||
                  d.payment_started ||
                  !d.can_bill
                }
                onPress={() =>
                  void run("post_part", {
                    tabId,
                    participantId: p.id,
                    accountId: a.id,
                    expectedCents: p.remaining_cents,
                    consent,
                  })
                }
              />
            </>
          )}
          {d.can_record &&
            d.split_ready &&
            d.can_bill &&
            !d.payment_started && (
              <Receipt
                full
                balance={p.remaining_cents}
                busy={busy}
                onSave={(data) =>
                  run("pay_part", {
                    tabId,
                    participantId: p.id,
                    expectedCents: p.remaining_cents,
                    consent: true,
                    ...data,
                  })
                }
              />
            )}
          {!a && !d.can_record && (
            <Text style={{ color: colors.textMuted }}>
              Consulte o dono para autorizar crédito ou pague sua parte no
              caixa.
            </Text>
          )}
        </>
      )}
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.warning }}
        >
          {message}
        </Text>
      )}
    </View>
  );
}
