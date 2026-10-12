import { useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { TextField } from "./ui/TextField";
import { AdaptiveSelect } from "./ui/AdaptiveSelect";
import { Consent } from "./InvoiceControls";
import { colors } from "@/constants/theme";
import { createUuid } from "@/lib/uuid";
import { moneyCents, parsePrice } from "@/lib/venueOperations";
import { invoicePayment, creditHistory } from "@/lib/customerInvoices";
import type {
  CreditInvoice,
  CreditSource,
  CreditSnapshot,
} from "@/types/customerInvoices";
export type InvoiceRun = (
  action: string,
  data: Record<string, unknown>,
  message: string,
) => Promise<boolean>;
export function InvoiceCorrection({
  invoice: i,
  busy,
  run,
}: {
  invoice: CreditInvoice;
  busy: boolean;
  run: InvoiceRun;
}) {
  const [mode, setMode] = useState(""),
    [payment, setPayment] = useState(""),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  const manual = i.payments.filter(
    (p) => p.method !== "online_pix" && !p.reversal,
  );
  async function save() {
    try {
      setError("");
      const cents = mode === "credit" ? parsePrice(amount) : null;
      if (mode === "credit" && (!cents || cents > i.balance_cents))
        throw new Error("Abatimento deve ser positivo e até o saldo.");
      if (
        await run(
          mode === "credit" ? "credit_note" : "reverse_payment",
          mode === "credit"
            ? { invoiceId: i.id, amountCents: cents, reason, confirmed }
            : { paymentId: payment, reason, confirmed },
          "Correção registrada sem apagar o histórico.",
        )
      ) {
        setMode("");
        setConfirmed(false);
        setReason("");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <View style={s.section}>
      <Button
        small
        variant="outline"
        label={
          mode ? "Fechar correção" : "Corrigir pagamento ou conceder abatimento"
        }
        onPress={() => setMode(mode ? "" : "reverse")}
      />
      {mode && (
        <>
          <Text style={s.meta}>
            Só o dono. Correção de lançamento não devolve dinheiro, não altera
            turno já fechado e não apaga o recibo. Pagamentos online usam
            devolução no provedor.
          </Text>
          <AdaptiveSelect
            label="Tipo de correção"
            value={mode}
            onChange={(v) => {
              setMode(v);
              setConfirmed(false);
            }}
            options={[
              { value: "reverse", label: "Estornar registro manual" },
              { value: "credit", label: "Abater dívida" },
            ]}
          />
          {mode === "reverse" ? (
            <AdaptiveSelect
              label="Recebimento a corrigir"
              value={payment}
              onChange={setPayment}
              options={manual.map((p) => ({
                value: p.id,
                label:
                  moneyCents(p.amount_cents) +
                  " · " +
                  new Date(p.paid_at).toLocaleDateString("pt-BR"),
              }))}
            />
          ) : (
            <TextField
              label="Valor do abatimento (R$)"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
          )}
          <TextField
            label="Motivo da correção (mínimo 8 caracteres)"
            value={reason}
            onChangeText={setReason}
            maxLength={500}
          />
          <Consent
            value={confirmed}
            onChange={setConfirmed}
            label="Conferi e assumo a responsabilidade pela correção"
          />
          {!!error && <Text style={s.warning}>{error}</Text>}
          <Button
            label="Registrar correção auditada"
            disabled={
              busy ||
              !confirmed ||
              reason.trim().length < 8 ||
              i.online?.held ||
              (mode === "reverse" && !payment)
            }
            onPress={() => void save()}
          />
        </>
      )}
    </View>
  );
}
export function InvoiceCheckout({
  invoice: i,
  owner,
  refresh,
  run,
}: {
  invoice: CreditInvoice;
  owner: boolean;
  refresh: () => Promise<void>;
  run: InvoiceRun;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [reason, setReason] = useState(""),
    [external, setExternal] = useState(""),
    [payAmount, setPayAmount] = useState(""),
    [refundAmount, setRefundAmount] = useState(""),
    [selected, setSelected] = useState(""),
    [history, setHistory] = useState<
      import("@/types/customerInvoices").CreditIntent[]
    >([]);
  const lock = useRef(false),
    nonce = useRef(createUuid());
  const online = i.online,
    all = [
      ...(online?.intents ?? []),
      ...history.filter((t) => !online?.intents.some((x) => x.id === t.id)),
    ].sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id)),
    last = all.find((t) => t.id === selected) ?? all[0];
  async function invoke(
    action: "checkout" | "reconcile" | "refund" | "recover",
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const amount =
        action === "checkout" && payAmount.trim()
          ? parsePrice(payAmount)
          : action === "refund" && refundAmount.trim()
            ? parsePrice(refundAmount)
            : undefined;
      if (
        amount !== undefined &&
        (!amount ||
          amount >
            (action === "checkout"
              ? i.balance_cents
              : (last?.amount_cents ?? 0) - (last?.refunded_cents ?? 0)))
      )
        throw Error("Valor deve ser positivo e até o saldo disponível.");
      const r = await invoicePayment(
        action,
        action === "checkout"
          ? { invoiceId: i.id, requestId: nonce.current, amountCents: amount }
          : {
              intentId: last?.id,
              confirmed: confirm,
              externalId: external,
              ...(action === "refund"
                ? { amountCents: amount, requestId: createUuid() }
                : {}),
            },
      );
      setMessage(r.message);
      if (action === "checkout") nonce.current = createUuid();
      await refresh();
      if (selected) {
        const rows = await creditHistory(i.id, undefined, selected);
        setHistory((h) => [...rows, ...h.filter((t) => t.id !== selected)]);
      }
      if (action === "refund") {
        setConfirm(false);
        setRefundAmount("");
      }
    } catch (e) {
      setMessage((e as Error).message);
      await refresh();
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  if (!online?.available && !last) return null;
  const url = last?.checkout_url;
  const validUrl = (() => {
    try {
      return (
        !!url &&
        [
          "https://www.mercadopago.com.br",
          "https://mercadopago.com.br",
          "https://link.picpay.com",
          "https://cobranca.picpay.com",
          "https://link.ppay.me",
          "https://cobranca.ppay.me",
        ].includes(new URL(url).origin)
      );
    } catch {
      return false;
    }
  })();
  return (
    <View style={s.section}>
      <Text style={s.heading}>Pix da fatura</Text>
      <Text style={s.meta}>
        Recebe o estabelecimento no gateway escolhido. Não há débito automático;
        abrir o Pix não significa pagar.
      </Text>
      {i.balance_cents > 0 && !online?.held && (
        <>
          <TextField
            label="Valor do Pix (R$) · vazio paga todo o saldo"
            value={payAmount}
            onChangeText={(v) => {
              setPayAmount(v);
              nonce.current = createUuid();
            }}
            keyboardType="decimal-pad"
          />
          <Button
            label="Gerar Pix da fatura"
            loading={busy}
            onPress={() => void invoke("checkout")}
          />
        </>
      )}
      {!!all.length && (
        <>
          <AdaptiveSelect
            label="Cobrança para consultar ou devolver"
            value={last?.id ?? ""}
            onChange={(v) => {
              setSelected(v);
              setConfirm(false);
              setRefundAmount("");
            }}
            options={all.map((t) => ({
              value: t.id,
              label: `${new Date(t.created_at).toLocaleString("pt-BR")} · ${moneyCents(t.amount_cents)} · ${t.state}`,
            }))}
          />
          <Button
            small
            variant="outline"
            label="Carregar histórico anterior de cobranças"
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void creditHistory(i.id, all.at(-1)?.created_at,undefined,all.at(-1)?.id)
                .then((rows) =>
                  setHistory((h) => [
                    ...h,
                    ...rows.filter((t) => !h.some((x) => x.id === t.id)),
                  ]),
                )
                .catch(() => setMessage("Histórico indisponível. Atualize."))
                .finally(() => setBusy(false));
            }}
          />
        </>
      )}
      {last && (
        <>
          <Text style={s.text}>
            {last.provider === "picpay" ? "PicPay" : "Mercado Pago"} ·{" "}
            {
              {
                building: "em preparação",
                pending: "aguardando pagamento",
                uncertain: "inconclusivo: consultar",
                paid: "pagamento confirmado",
                cancelled: "cobrança encerrada",
                refunded: "devolução confirmada",
                review: "precisa de conferência",
              }[last.state]
            }{" "}
            · {moneyCents(last.amount_cents)}
          </Text>
          {i.balance_cents > 0 &&
            last.pix_code &&
            ["pending", "building", "uncertain"].includes(last.state) && (
              <>
                <View style={s.qr}>
                  <QRCode value={last.pix_code} size={160} />
                </View>
                <Text selectable style={s.code}>
                  {last.pix_code}
                </Text>
              </>
            )}
          {i.balance_cents > 0 &&
            validUrl &&
            ["pending", "building", "uncertain"].includes(last.state) && (
              <Button
                small
                label="Abrir pagamento Pix seguro"
                onPress={() => void Linking.openURL(url!)}
              />
            )}
          <Button
            small
            variant="outline"
            label="Consultar pagamento no provedor"
            loading={busy}
            onPress={() => void invoke("reconcile")}
          />
          {owner && last.state === "paid" && (
            <>
              {last.provider === "mercado_pago" && (
                <TextField
                  label="Valor a devolver (R$) · vazio devolve o restante"
                  value={refundAmount}
                  onChangeText={setRefundAmount}
                  keyboardType="decimal-pad"
                />
              )}
              <Text style={s.meta}>
                Devolvido: {moneyCents(last.refunded_cents ?? 0)}. Taxa:{" "}
                {last.fee_cents == null
                  ? "não informada"
                  : moneyCents(last.fee_cents)}
                . Líquido da transação informado pelo provedor:{" "}
                {last.net_cents == null
                  ? "não informado"
                  : moneyCents(last.net_cents)}
                . Não é saldo bancário disponível; confira devoluções
                separadamente.
              </Text>
              <Consent
                value={confirm}
                onChange={setConfirm}
                label="Confirmo o valor da devolução deste Pix"
              />
              <Button
                small
                variant="outline"
                label={
                  last.refund_pending
                    ? "Consultar devolução solicitada"
                    : "Solicitar devolução no provedor"
                }
                disabled={busy || !confirm}
                onPress={() =>
                  void invoke(last.refund_pending ? "reconcile" : "refund")
                }
              />
              <Text style={s.meta}>
                Só a confirmação do provedor registra o estorno. A dívida volta
                ao saldo; se o serviço foi cancelado, registre o abatimento
                correspondente.
              </Text>
            </>
          )}
          {owner &&
            ["uncertain", "building", "review"].includes(last.state) &&
            last.provider === "picpay" && (
              <>
                <TextField
                  label="ID do link PicPay a recuperar"
                  value={external}
                  onChangeText={setExternal}
                />
                <Button
                  small
                  label="Recuperar link após conferir no provedor"
                  disabled={busy || !external.trim()}
                  onPress={() => void invoke("recover")}
                />
              </>
            )}
          {owner && online?.held && ['building','pending','uncertain','review'].includes(last.state) && (
            <>
              <TextField
                label="Motivo da conferência do gateway"
                value={reason}
                onChangeText={setReason}
                maxLength={500}
              />
              <Consent
                value={confirm}
                onChange={setConfirm}
                label="Conferi a cobrança diretamente no provedor"
              />
              {last.state === "review" && (
                <Button
                  small
                  variant="outline"
                  label="Registrar conferência da divergência"
                  disabled={busy || !confirm || reason.trim().length < 8}
                  onPress={() =>
                    void run(
                      "resolve_review",
                      { intentId: last.id, reason, confirmed: confirm },
                      "Conferência registrada; isso não cria um pagamento.",
                    )
                  }
                />
              )}
              {Date.now() > new Date(last.expires_at).getTime() + 300000 && (
                <>
                  <Text style={s.warning}>
                    Exceção manual: encerre primeiro a cobrança NO PROVEDOR e
                    confira que não existe pagamento pendente. Expirar no app
                    não cancela no banco. Um pagamento tardio poderá exigir
                    devolução.
                  </Text>
                  <Button
                    small
                    variant="outline"
                    label="Registrar cobrança encerrada pelo dono"
                    disabled={busy || !confirm || reason.trim().length < 8}
                    onPress={() =>
                      void run(
                        "release_checkout",
                        { intentId: last.id, reason, confirmed: confirm },
                        "Encerramento manual auditado. Nenhum recebimento foi inventado.",
                      )
                    }
                  />
                </>
              )}
            </>
          )}
        </>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={s.warning}>
          {message}
        </Text>
      )}
    </View>
  );
}
export function InvoiceSources({
  sources,
  busy,
  run,
}: {
  sources?: CreditSnapshot["sources"];
  busy: boolean;
  run: InvoiceRun;
}) {
  const [kind, setKind] = useState("class");
  const rows = kind === "class" ? sources?.classes : sources?.games;
  if (!sources) return null;
  return (
    <Card style={s.card}>
      <Text style={s.heading}>Aulas e cotas na mesma fatura</Text>
      <Text style={s.meta}>
        Transferência opcional, não uma nova cobrança. A origem fica bloqueada
        para outra baixa. Preços de aulas e rateio são conferidos no servidor.
      </Text>
      <AdaptiveSelect
        label="Origem"
        value={kind}
        onChange={setKind}
        options={[
          { value: "class", label: "Aulas" },
          { value: "game", label: "Cotas de jogos" },
        ]}
      />
      {!rows?.length && (
        <Text style={s.meta}>
          Sem cobrança pendente elegível para seus clientes autorizados nesta
          lista (até 50 por origem).
        </Text>
      )}
      {(rows ?? []).map((source) => (
        <Source
          key={source.id + source.account_id}
          source={source}
          busy={busy}
          run={run}
        />
      ))}
    </Card>
  );
}
function Source({
  source: a,
  busy,
  run,
}: {
  source: CreditSource;
  busy: boolean;
  run: InvoiceRun;
}) {
  const [consent, setConsent] = useState(false);
  return (
    <View style={s.section}>
      <Text style={s.heading}>
        {a.description} · {moneyCents(a.amount_cents)}
      </Text>
      <Text style={s.meta}>
        {a.customer_name} ·{" "}
        {a.kind === "class"
          ? (a.competence ?? "Aula avulsa")
          : a.scheduled_at
            ? new Date(a.scheduled_at).toLocaleString("pt-BR")
            : ""}
      </Text>
      <Consent
        value={consent}
        onChange={setConsent}
        label="Confirmo autorização para transferir este valor à fatura"
      />
      <Button
        small
        label={
          a.kind === "class" ? "Deixar aula na fatura" : "Deixar cota na fatura"
        }
        disabled={busy || !consent || a.amount_cents <= 0}
        onPress={() =>
          void run(
            a.kind === "class" ? "post_class" : "post_game",
            {
              accountId: a.account_id,
              ...(a.kind === "class" ? { billId: a.id } : { gameId: a.id }),
              expectedCents: a.amount_cents,
              consent,
            },
            "Cobrança transferida para fatura, sem duplicar na origem.",
          )
        }
      />
    </View>
  );
}
export function InvoiceReminderPreferences({
  preferences,
  busy,
  run,
}: {
  preferences: NonNullable<CreditSnapshot["preferences"]>;
  busy: boolean;
  run: InvoiceRun;
}) {
  return (
    <>
      {preferences.map((p) => (
        <Reminder key={JSON.stringify(p)} pref={p} busy={busy} run={run} />
      ))}
    </>
  );
}
function Reminder({
  pref: p,
  busy,
  run,
}: {
  pref: NonNullable<CreditSnapshot["preferences"]>[number];
  busy: boolean;
  run: InvoiceRun;
}) {
  const [app, setApp] = useState(p.in_app),
    [email, setEmail] = useState(p.email),
    [wa, setWa] = useState(p.whatsapp);
  return (
    <Card style={s.card}>
      <Text style={s.heading}>Meus lembretes de vencimento</Text>
      <Text style={s.meta}>
        Antes do vencimento, no dia e após atraso. Só você pode alterar seus
        canais. E-mail/WhatsApp dependem de provedor configurado; aceite de
        envio não comprova entrega.
      </Text>
      <Consent value={app} onChange={setApp} label="Avisos dentro do app" />
      {p.email_verified && (
        <Consent
          value={email}
          onChange={setEmail}
          label="Autorizar lembretes por e-mail"
        />
      )}
      {p.phone_verified ? (
        <Consent
          value={wa}
          onChange={setWa}
          label="Autorizar lembretes por WhatsApp"
        />
      ) : (
        <Text style={s.meta}>
          WhatsApp só pode ser ativado com telefone brasileiro verificado na
          autenticação; o telefone do perfil não é verificação.
        </Text>
      )}
      <Button
        small
        label="Salvar minhas preferências de lembrete"
        disabled={busy}
        onPress={() =>
          void run(
            "reminder_preferences",
            { accountId: p.account_id, inApp: app, email, whatsapp: wa },
            "Preferências de lembrete salvas.",
          )
        }
      />
    </Card>
  );
}
const s = StyleSheet.create({
  heading: { color: colors.text, fontSize: 15, fontWeight: "800" },
  text: { color: colors.text, fontSize: 13, lineHeight: 20 },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 19 },
  warning: { color: colors.warning, fontSize: 12, lineHeight: 19 },
  section: {
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  card: { gap: 12, marginBottom: 8 },
  qr: { padding: 12, backgroundColor: "white", alignSelf: "center" },
  code: { color: colors.text, fontSize: 11, lineHeight: 17 },
});
