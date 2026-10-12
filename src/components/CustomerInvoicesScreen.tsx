import { useRef, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "./ui/Screen";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { AdaptiveSelect } from "./ui/AdaptiveSelect";
import { colors } from "@/constants/theme";
import { useAuthStore } from "@/store/useAuthStore";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import { creditAction, creditExport } from "@/lib/customerInvoices";
import { moneyCents, parsePrice } from "@/lib/venueOperations";
import { createUuid } from "@/lib/uuid";
import type {
  CreditInvoice,
  CreditRental,
  CreditQuery,
} from "@/types/customerInvoices";
import { Consent, Receipt } from "./InvoiceControls";
import {
  InvoiceCorrection,
  InvoiceCheckout,
  InvoiceSources,
  InvoiceReminderPreferences,
} from "./InvoiceAdvanced";
import {
  invoiceCsv,
  shareInvoiceCsv,
  shareReceipt,
} from "@/lib/invoiceExports";
type Run = (
  action: string,
  data: Record<string, unknown>,
  message: string,
) => Promise<boolean>;
const dateLabel = (v: string) =>
  new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR");
export function CustomerInvoicesScreen({
  venue = null,
}: {
  venue?: string | null;
}) {
  const actor = useAuthStore((s) => s.authUserId);
  return <Content key={`${actor}:${venue}`} venue={venue} />;
}
function Content({ venue }: { venue: string | null }) {
  const [query, setQuery] = useState<CreditQuery>({}),
    [trail, setTrail] = useState<CreditQuery[]>([]),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const feed = useCustomerInvoices(venue, null, "search", query),
    d = feed.data;
  const [email, setEmail] = useState(""),
    [cut, setCut] = useState("10"),
    [dueDays, setDueDays] = useState("5"),
    [limit, setLimit] = useState("300"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [accountId, setAccount] = useState(""),
    [bookingId, setBooking] = useState(""),
    [date, setDate] = useState(""),
    [price, setPrice] = useState("");
  const lock = useRef(false),
    pending = useRef<{ key: string; nonce: string } | null>(null);
  const run: Run = async (action, data, success) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setMessage("");
    const key = JSON.stringify({ action, data });
    if (pending.current?.key !== key)
      pending.current = { key, nonce: createUuid() };
    try {
      await creditAction(action, data, pending.current.nonce);
      pending.current = null;
      setMessage(success);
      await feed.refresh();
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const total = (d.accounts ?? []).reduce((s, a) => s + a.balance_cents, 0);
  return (
    <Screen contentStyle={{ maxWidth: 760 }}>
      <Button
        small
        variant="ghost"
        label="Voltar"
        onPress={() => router.back()}
      />
      <Text style={s.title}>
        {venue ? "Clientes e faturas" : "Minhas faturas"}
      </Text>
      <Text style={s.meta}>
        Conta por estabelecimento. Você escolhe em cada consumo se paga na hora
        ou deixa para o vencimento. Pix online depende de gateway configurado.
        Não há débito automático nem juros.
      </Text>
      <Button
        small
        variant="outline"
        label="Atualizar faturas"
        loading={feed.busy}
        onPress={() => void feed.refresh()}
      />
      {!!(feed.error || message) && (
        <Text accessibilityLiveRegion="polite" style={s.message}>
          {feed.error || message}
        </Text>
      )}
      {!feed.ready && !feed.error && (
        <Text style={s.meta}>Consultando acesso e saldos...</Text>
      )}
      <Card style={s.card}>
        <Text style={s.heading}>Pesquisar e filtrar faturas</Text>
        <TextField
          label="Cliente ou estabelecimento"
          value={search}
          onChangeText={setSearch}
        />
        <AdaptiveSelect
          label="Situação"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Todas" },
            { value: "open", label: "Em aberto" },
            { value: "overdue", label: "Vencidas" },
            { value: "paid", label: "Quitadas" },
          ]}
        />
        <TextField
          label="Vencimento de (AAAA-MM-DD)"
          value={from}
          onChangeText={setFrom}
        />
        <TextField
          label="Vencimento até (AAAA-MM-DD)"
          value={to}
          onChangeText={setTo}
        />
        <Button
          small
          label="Aplicar filtros"
          onPress={() => {
            if ([from, to].some((v) => v && !/^\d{4}-\d{2}-\d{2}$/.test(v))) {
              setMessage("Use datas no formato AAAA-MM-DD.");
              return;
            }
            setTrail([]);
            setQuery({ search: search.trim(), status, from, to });
          }}
        />
        <Button
          small
          variant="outline"
          label="Exportar extrato CSV do filtro"
          disabled={busy || !feed.ready}
          onPress={() => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            void creditExport(venue, query)
              .then(async (r) => {
                await shareInvoiceCsv(invoiceCsv(r.invoices));
                setMessage(
                  r.truncated
                    ? "Arquivo limitado a 1.000 faturas. Restrinja o período para completar."
                    : "Extrato privado exportado. Inclui todas as páginas do filtro.",
                );
              })
              .catch((e) => setMessage((e as Error).message))
              .finally(() => {
                lock.current = false;
                setBusy(false);
              });
          }}
        />
        {d.summary && (
          <Text style={s.meta}>
            Filtro: {d.summary.count} faturas · em aberto{" "}
            {moneyCents(d.summary.pending_cents)} · vencido{" "}
            {moneyCents(d.summary.overdue_cents)}
          </Text>
        )}
      </Card>
      {feed.ready && (
        <>
          <Card style={s.card}>
            <Text style={s.heading}>Total em aberto {moneyCents(total)}</Text>
            <Text style={s.meta}>
              Faturado não significa recebido. Pagamentos só baixam após
              conferência do caixa ou confirmação verificada no gateway.
            </Text>
          </Card>
          {d.owner && (
            <Card style={s.card}>
              <Text style={s.heading}>Liberar ou atualizar cliente</Text>
              <Text style={s.meta}>
                Use o e-mail da conta confirmada do cliente. Pré-cadastro não
                recebe crédito. Para reativar, informe o mesmo e-mail e salve. O
                vencimento é definido em dias após o corte. Mudanças não alteram
                faturas já emitidas.
              </Text>
              <TextField
                label="E-mail da conta confirmada"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextField
                label="Dia de corte (1 a 31)"
                value={cut}
                onChangeText={setCut}
                keyboardType="number-pad"
              />
              <TextField
                label="Limite total em aberto (R$)"
                value={limit}
                onChangeText={setLimit}
                keyboardType="decimal-pad"
              />
              <TextField
                label="Dias para pagar após o corte (0 a 45)"
                value={dueDays}
                onChangeText={setDueDays}
                keyboardType="number-pad"
              />
              <Button
                label="Liberar crédito"
                loading={busy}
                onPress={() => {
                  try {
                    const c = Number(cut),
                      l = parsePrice(limit),
                      days = Number(dueDays);
                    if (
                      !Number.isInteger(c) ||
                      c < 1 ||
                      c > 31 ||
                      !l ||
                      !Number.isInteger(days) ||
                      days < 0 ||
                      days > 45
                    )
                      throw new Error("Informe corte e limite válidos.");
                    void run(
                      "account_save",
                      {
                        venueId: venue,
                        email: email.trim(),
                        cutDay: c,
                        limitCents: l,
                        dueDays: days,
                      },
                      "Crédito autorizado.",
                    );
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              />
            </Card>
          )}
          {(d.accounts ?? []).map((a) => (
            <Card key={a.id} style={s.card}>
              <Text style={s.heading}>{venue ? a.name : a.venue_name}</Text>
              <Text style={s.text}>
                {a.enabled ? "Crédito liberado" : "Crédito suspenso"} · corte
                dia {a.cut_day} · pagar em até {a.due_days ?? 0} dias após o
                corte
              </Text>
              <Text style={s.meta}>
                Em aberto {moneyCents(a.balance_cents)} · limite{" "}
                {moneyCents(a.limit_cents)} · disponível{" "}
                {moneyCents(Math.max(0, a.limit_cents - a.balance_cents))}
              </Text>
              {a.overdue && (
                <Text style={s.message}>
                  Há fatura vencida: novos lançamentos bloqueados, pagamento na
                  hora continua disponível.
                </Text>
              )}
              {d.owner && a.enabled && (
                <Button
                  small
                  variant="outline"
                  label={`Suspender crédito de ${a.name}`}
                  disabled={busy}
                  onPress={() =>
                    void run(
                      "account_disable",
                      { accountId: a.id },
                      "Novos lançamentos suspensos; o saldo existente permanece.",
                    )
                  }
                />
              )}
            </Card>
          ))}
          {d.can_offer && !!d.bookings?.length && (
            <Card style={s.card}>
              <Text style={s.heading}>Combinar valor de uma locação</Text>
              <Text style={s.meta}>
                Uma ocorrência por vez, inclusive em reservas semanais. O
                cliente aceita faturar ou paga na hora. Reservas vinculadas a
                jogos usam o rateio, sem cobrança duplicada.
              </Text>
              <AdaptiveSelect
                label="Cliente autorizado"
                value={accountId}
                onChange={setAccount}
                options={(d.accounts ?? [])
                  .filter((a) => a.enabled)
                  .map((a) => ({ value: a.id, label: a.name }))}
              />
              <AdaptiveSelect
                label="Reserva existente"
                value={bookingId}
                onChange={(id) => {
                  setBooking(id);
                  setDate(d.bookings?.find((b) => b.id === id)?.date ?? "");
                }}
                options={d.bookings.map((b) => ({
                  value: b.id,
                  label: `${b.team_name} · ${b.time}`,
                  detail: b.date ? dateLabel(b.date) : "Reserva semanal",
                }))}
              />
              <TextField
                label="Data da ocorrência (AAAA-MM-DD)"
                value={date}
                onChangeText={setDate}
                placeholder="2026-10-15"
              />
              <TextField
                label="Valor combinado (R$)"
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
              />
              <Button
                label="Enviar valor para cliente escolher"
                disabled={
                  busy ||
                  !accountId ||
                  !bookingId ||
                  !/^\d{4}-\d{2}-\d{2}$/.test(date)
                }
                onPress={() => {
                  try {
                    const amount = parsePrice(price);
                    if (!amount) throw new Error("Informe o valor combinado.");
                    void run(
                      "rental_offer",
                      { accountId, bookingId, date, amountCents: amount },
                      "Valor enviado. Ainda não há dívida nem recebimento.",
                    );
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              />
            </Card>
          )}
          <InvoiceReminderPreferences
            preferences={d.preferences ?? []}
            busy={busy}
            run={run}
          />
          <InvoiceSources sources={d.sources} busy={busy} run={run} />
          {!!d.rentals?.length && (
            <Text style={s.heading}>Locações combinadas</Text>
          )}
          {(d.rentals ?? []).map((r) => (
            <Rental
              key={r.id}
              rental={r}
              mine={
                d.accounts?.find((a) => a.id === r.account_id)?.player_id ===
                d.me
              }
              canRecord={!!d.can_record}
              owner={!!d.owner}
              busy={busy}
              run={run}
            />
          ))}
          <Text style={s.heading}>Faturas do filtro</Text>
          {!d.invoices?.length && (
            <Text style={s.meta}>
              Nenhum lançamento em fatura. Consumos pagos na hora continuam nas
              comandas.
            </Text>
          )}
          {(d.invoices ?? []).map((i) => (
            <Invoice
              key={i.id}
              invoice={i}
              canRecord={!!d.can_record}
              owner={!!d.owner}
              busy={busy}
              run={run}
              refresh={feed.refresh}
            />
          ))}
          <View style={s.row}>
            {!!trail.length && (
              <Button
                small
                variant="outline"
                label="Página anterior"
                onPress={() => {
                  const previous = trail[trail.length - 1];
                  setTrail(trail.slice(0, -1));
                  setQuery(previous);
                }}
              />
            )}
            {d.has_more && d.next_cursor && (
              <Button
                small
                variant="outline"
                label="Próxima página"
                onPress={() => {
                  setTrail([...trail, query]);
                  setQuery({ ...query, ...d.next_cursor });
                }}
              />
            )}
          </View>
          {!!d.reminders?.length && (
            <Card style={s.card}>
              <Text style={s.heading}>Histórico de lembretes</Text>
              {d.reminders.map((r) => (
                <Text key={r.id} style={s.meta}>
                  {r.channel === "app"
                    ? "Aviso no app"
                    : r.channel === "email"
                      ? "E-mail"
                      : "WhatsApp"}{" "}
                  ·{" "}
                  {r.stage === "overdue"
                    ? "atraso"
                    : r.stage === "due"
                      ? "vence hoje"
                      : "antes de vencer"}{" "}
                  ·{" "}
                  {(
                    {
                      queued: "aguarda configuração/envio",
                      sending: "em envio",
                      available: "disponível no app",
                      accepted: "aceito pelo provedor (entrega não comprovada)",
                      failed: "falhou",
                      uncertain: "envio inconclusivo; sem repetição automática",
                      cancelled: "cancelado",
                    } as Record<string, string>
                  )[r.status] ?? r.status}
                </Text>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
function Invoice({
  invoice: i,
  canRecord,
  owner,
  busy,
  run,
  refresh,
}: {
  invoice: CreditInvoice;
  canRecord: boolean;
  owner: boolean;
  busy: boolean;
  run: Run;
  refresh: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card style={s.card}>
      <Text style={s.heading}>
        {i.venue_name} · {i.customer_name}
      </Text>
      <Text
        style={[s.text, i.status === "overdue" && { color: colors.danger }]}
      >
        Corte {dateLabel(i.cut_date)} ·{" "}
        {i.status === "overdue"
          ? "Vencida"
          : i.status === "paid"
            ? "Quitada"
            : i.status === "zero_open"
              ? "Saldo zerado · ciclo ainda aberto"
              : "Em aberto"}
      </Text>
      <Text style={s.heading}>Saldo {moneyCents(i.balance_cents)}</Text>
      <Text style={s.meta}>
        Vencimento {dateLabel(i.due_date ?? i.cut_date)}
      </Text>
      <Text style={s.meta}>
        Lançamentos {moneyCents(i.total_cents)} · recebido{" "}
        {moneyCents(
          i.received_cents ??
            i.total_cents - i.balance_cents - (i.credits_cents ?? 0),
        )}{" "}
        · abatimentos {moneyCents(i.credits_cents ?? 0)}
      </Text>
      <Button
        small
        variant="ghost"
        label={expanded ? "Ocultar extrato" : "Ver lançamentos e pagamentos"}
        onPress={() => setExpanded(!expanded)}
      />
      {expanded && (
        <>
          {i.lines.map((l) => (
            <View key={l.id} style={s.line}>
              <Text style={s.text}>
                {l.description} · {moneyCents(l.amount_cents)}
              </Text>
              <Text style={s.meta}>
                {new Date(l.posted_at).toLocaleDateString("pt-BR")} ·{" "}
                {l.acceptance === "app"
                  ? "Aceito no app"
                  : "Autorizado no balcão"}
              </Text>
            </View>
          ))}
          {i.payments.map((p) => (
            <View key={p.id} style={s.line}>
              <Text style={s.meta}>
                Recebido {moneyCents(p.amount_cents)} ·{" "}
                {p.method === "cash"
                  ? "dinheiro"
                  : p.method === "online_pix"
                    ? "Pix confirmado no provedor"
                    : "Pix conferido manualmente"}{" "}
                · {new Date(p.paid_at).toLocaleString("pt-BR")}
                {p.reference ? ` · ref. ${p.reference}` : ""}
              </Text>
              {p.reversal && (
                <Text style={s.message}>
                  Estornado: {p.reversal.reason} ·{" "}
                  {new Date(p.reversal.created_at).toLocaleString("pt-BR")}
                </Text>
              )}
              <Button
                small
                variant="ghost"
                label="Compartilhar recibo"
                onPress={() => void shareReceipt(i, p).catch(() => {})}
              />
            </View>
          ))}
          {(i.notes ?? []).map((n) => (
            <Text key={n.id} style={s.meta}>
              Abatimento {moneyCents(n.amount_cents)} · {n.reason}
            </Text>
          ))}
        </>
      )}
      {i.balance_cents > 0 &&
        (canRecord && !i.online?.held ? (
          <Receipt
            balance={i.balance_cents}
            busy={busy}
            onSave={(data) =>
              run(
                "receive_invoice",
                { invoiceId: i.id, ...data },
                "Recebimento registrado, saldo atualizado.",
              )
            }
          />
        ) : (
          <Text style={s.meta}>
            Pode antecipar ou pagar no vencimento.{" "}
            {i.online?.held
              ? "Há cobrança Pix em preparação ou reconciliação; consulte antes de outra baixa."
              : "O caixa também pode receber presencialmente."}
          </Text>
        ))}
      <InvoiceCheckout invoice={i} owner={owner} refresh={refresh} run={run} />
      {owner && <InvoiceCorrection invoice={i} busy={busy} run={run} />}
    </Card>
  );
}
function Rental({
  rental: r,
  mine,
  canRecord,
  owner,
  busy,
  run,
}: {
  rental: CreditRental;
  mine: boolean;
  canRecord: boolean;
  owner: boolean;
  busy: boolean;
  run: Run;
}) {
  const [consent, setConsent] = useState(false);
  const status = {
    pending: "Aguardando escolha",
    billed: "Na fatura",
    paid: "Pago na hora",
    cancelled: "Valor recusado/cancelado",
  };
  return (
    <Card style={s.card}>
      <Text style={s.heading}>{r.description}</Text>
      <Text style={s.text}>
        {r.customer_name} · {r.venue_name} · {moneyCents(r.amount_cents)}
      </Text>
      <Text style={s.meta}>{status[r.status]}</Text>
      {r.status === "pending" && (
        <>
          {(mine || canRecord) && (
            <>
              <Consent
                value={consent}
                onChange={setConsent}
                label={
                  mine
                    ? "Aceito deixar este valor na minha fatura"
                    : "Cliente autorizou deixar este valor na fatura"
                }
              />
              <Button
                label="Deixar locação na fatura"
                disabled={busy || !consent}
                onPress={() =>
                  void run(
                    "post_rental",
                    {
                      accountId: r.account_id,
                      rentalId: r.id,
                      expectedCents: r.amount_cents,
                      consent,
                    },
                    "Locação incluída na fatura.",
                  )
                }
              />
            </>
          )}
          {canRecord ? (
            <Receipt
              balance={r.amount_cents}
              full
              busy={busy}
              onSave={(data) =>
                run(
                  "receive_rental",
                  { rentalId: r.id, ...data },
                  "Locação paga na hora, sem lançar na fatura.",
                )
              }
            />
          ) : (
            <Text style={s.meta}>
              Prefere pagar na hora? Procure o caixa. O valor só entra na fatura
              se você autorizar.
            </Text>
          )}
          {(owner || mine) && (
            <Button
              small
              variant="ghost"
              label="Recusar valor combinado"
              disabled={busy}
              onPress={() =>
                void run(
                  "cancel_rental",
                  { rentalId: r.id },
                  "Solicitação financeira cancelada. A reserva NÃO foi cancelada.",
                )
              }
            />
          )}
        </>
      )}
    </Card>
  );
}
const s = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  heading: { fontSize: 15, fontWeight: "800", color: colors.text },
  text: { fontSize: 13, lineHeight: 20, color: colors.text },
  meta: { fontSize: 12, lineHeight: 19, color: colors.textMuted },
  message: { fontSize: 13, lineHeight: 20, color: colors.warning },
  card: { gap: 12, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  line: {
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
});
