import { PageHeading } from '@/components/ui/PageHeading';
import { useRef, useState } from "react";
import { router } from "expo-router";
import {
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useShallow } from "zustand/react/shallow";
import { Screen } from "./ui/Screen";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { AdaptiveSelect } from "./ui/AdaptiveSelect";
import { useVenueOperations } from "@/hooks/useVenueOperations";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import { creditAction } from "@/lib/customerInvoices";
import { useAuthStore } from "@/store/useAuthStore";
import { sendVenueInvite, venueAction } from "@/lib/venueOperations";
import { createUuid } from "@/lib/uuid";
import { useAppStore } from "@/store/useAppStore";
import { applyOperationCache } from "@/lib/supabaseSync";
import {
  formatMoney,
  tabStatusLabel,
  tabTotals,
} from "@/lib/establishmentOperations";
import { colors } from "@/constants/theme";
import type { ServiceTab, TabParticipant } from "@/types";
export function VenuePdv({ venue }: { venue: string | null }) {
  const actor = useAuthStore((s) => s.authUserId);
  return <VenuePdvContent key={`${actor}:${venue}`} venue={venue} />;
}
function VenuePdvContent({ venue }: { venue: string | null }) {
  const feed = useVenueOperations(venue),
    credit = useCustomerInvoices(venue, null, "directory"),
    d = feed.data,
    { width } = useWindowDimensions();
  const tabs = useAppStore(
      useShallow((s) =>
        s.serviceTabs.filter((t) => t.establishmentId === venue),
      ),
    ),
    orders = useAppStore((s) => s.serviceOrders),
    items = useAppStore((s) => s.serviceOrderItems),
    payments = useAppStore((s) => s.salePayments);
  const [team, setTeam] = useState(""),
    [creditCustomer, setCreditCustomer] = useState(""),
    [player, setPlayer] = useState(""),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [phone, setPhone] = useState(""),
    [table, setTable] = useState(""),
    [consent, setConsent] = useState(false),
    [channel, setChannel] = useState("whatsapp"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const nonce = useRef(createUuid()),
    lock = useRef(false),
    selected = d.teams?.find((t) => t.id === team);
  async function open() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      type OpenResult = {
        tab: Record<string, unknown>;
        participant: Record<string, unknown>;
        inviteId: string | null;
      };
      const r = creditCustomer
        ? await creditAction<OpenResult>(
            "open_tab",
            { accountId: creditCustomer, table },
            nonce.current,
          )
        : await venueAction<OpenResult>("tab_open", {
            venueId: venue,
            requestId: nonce.current,
            playerId: player || null,
            name,
            email,
            phone,
            table,
            consent: !player && consent,
            channel,
          });
      const t = r.tab,
        p = r.participant,
        tab: ServiceTab = {
          id: t.id as string,
          establishmentId: t.establishment_id as string,
          label: t.label as string,
          customerPlayerId: t.customer_player_id as string | null,
          customerName: t.customer_name as string,
          tableLabel: t.table_label as string | null,
          gameId: t.game_id as string | null,
          status: t.status as ServiceTab["status"],
          openedByPlayerId: t.opened_by_player_id as string,
          openedAt: t.opened_at as string,
          closedAt: t.closed_at as string | null,
        };
      const participant: TabParticipant = {
        id: p.id as string,
        tabId: p.tab_id as string,
        playerId: p.player_id as string | null,
        name: p.name as string,
      };
      const state = useAppStore.getState();
      applyOperationCache({
        serviceTabs: [...state.serviceTabs.filter((x) => x.id !== tab.id), tab],
        tabParticipants: [
          ...state.tabParticipants.filter((x) => x.id !== participant.id),
          participant,
        ],
      });
      nonce.current = createUuid();
      setOpenedId(tab.id);
      setMessage("Comanda aberta.");
      if (r.inviteId) {
        try {
          const sent = await sendVenueInvite(r.inviteId);
          setMessage(`Comanda aberta. ${sent.message}`);
        } catch (e) {
          setMessage((e as Error).message);
        }
      }
      await feed.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen contentStyle={{ maxWidth: 1100 }}>
      <Button
        small
        variant="ghost"
        label="Voltar"
        onPress={() => router.back()}
      />
      <PageHeading><Text style={s.title}>PDV · {d.name ?? "Comandas"}</Text>
      <Text style={s.meta}>
        Times com jogo ou reserva hoje. Clientes avulsos também podem abrir
        comanda.
      </Text></PageHeading>
      <Button
        small
        variant="outline"
        label="Atualizar times"
        loading={feed.busy}
        onPress={() => void feed.refresh()}
      />
      {!!(message || feed.error) && (
        <Text style={s.message}>{feed.error || message}</Text>
      )}
      {openedId && d.capabilities?.includes("pdv") && (
        <Button
          label="Ir para pedidos da comanda aberta"
          onPress={() => router.push(`/operacao/comanda/${openedId}`)}
        />
      )}
      {d.capabilities?.includes("pdv") && (
        <View
          style={[s.layout, { flexDirection: width >= 700 ? "row" : "column" }]}
        >
          <Card style={[s.card, width >= 700 ? { width: 240 } : {}]}>
            <Text style={s.heading}>Times em atendimento</Text>
            <Button
              small
              variant={!team ? "primary" : "outline"}
              label="Cliente avulso"
              onPress={() => {
                setTeam("");
                setPlayer("");
                setCreditCustomer("");
              }}
            />
            {(d.teams ?? []).map((t) => (
              <Button
                key={t.id}
                small
                variant={team === t.id ? "primary" : "outline"}
                label={t.name}
                onPress={() => {
                  setTeam(t.id);
                  setPlayer("");
                  setCreditCustomer("");
                }}
              />
            ))}
            {!d.teams?.length && (
              <Text style={s.meta}>
                Sem times na agenda de hoje. Use cliente avulso.
              </Text>
            )}
            {!!credit.data.customers?.length && (
              <AdaptiveSelect
                label="Clientes com conta autorizada"
                value={creditCustomer}
                onChange={(v) => {
                  setCreditCustomer(v);
                  setTeam("");
                  setPlayer("");
                  nonce.current = createUuid();
                }}
                options={credit.data.customers.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
            )}
            {!!credit.error && (
              <Text style={s.meta}>
                Clientes autorizados indisponíveis. Atualize para consultar.
              </Text>
            )}
          </Card>
          <Card style={[s.card, { flex: 1 }]}>
            <Text style={s.heading}>Abrir comanda</Text>
            {creditCustomer ? (
              <Text style={s.meta}>
                Cliente autorizado:{" "}
                {
                  credit.data.customers?.find((c) => c.id === creditCustomer)
                    ?.name
                }
                . Abrir comanda não gera dívida: o cliente escolhe pagar agora
                ou faturar ao fechar.
              </Text>
            ) : selected ? (
              <AdaptiveSelect
                label={`Jogador de ${selected.name}`}
                value={player}
                onChange={setPlayer}
                options={selected.players.map((p) => ({
                  value: p.id,
                  label: p.name,
                }))}
              />
            ) : (
              <>
                <TextField
                  label="Nome do cliente"
                  value={name}
                  onChangeText={setName}
                />
                <TextField
                  label="Celular"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
                <TextField
                  label="Ou e-mail"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <View style={s.row}>
                  <Text style={[s.text, { flex: 1 }]}>
                    Cliente autorizou receber convite ao app
                  </Text>
                  <Switch value={consent} onValueChange={setConsent} />
                </View>
                {consent && (
                  <AdaptiveSelect
                    label="Canal do convite"
                    value={channel}
                    onChange={setChannel}
                    options={[
                      { value: "whatsapp", label: "WhatsApp" },
                      { value: "email", label: "E-mail" },
                    ]}
                  />
                )}
                <Text style={s.meta}>
                  Pré-cadastro privado do estabelecimento. Não cria conta
                  confirmada, amizade nem transfere dívida. Envio depende de
                  provedor configurado.
                </Text>
              </>
            )}
            <TextField
              label="Mesa ou referência"
              value={table}
              onChangeText={setTable}
            />
            <Button
              label="Abrir comanda"
              loading={busy}
              disabled={
                creditCustomer
                  ? !credit.data.customers?.some((c) => c.id === creditCustomer)
                  : selected
                    ? !player
                    : !name.trim() || (!email.trim() && !phone.trim())
              }
              onPress={() => void open()}
            />
          </Card>
        </View>
      )}
      {(d.invites ?? []).map((i) => (
        <Card key={i.id} style={s.card}>
          <Text style={s.heading}>Convite · {i.name}</Text>
          <Text style={s.meta}>
            {i.status === "queued"
              ? "Pendente de envio"
              : i.status === "accepted"
                ? "Aceito pelo provedor (entrega não confirmada)"
                : i.status === "expired"
                  ? "Expirado"
                  : i.status === "sending"
                    ? "Envio iniciado"
                    : "Confira o provedor antes de repetir"}
          </Text>
          {i.status === "queued" && (
            <Button
              small
              variant="outline"
              label="Enviar convite autorizado"
              disabled={busy}
              onPress={() => {
                setBusy(true);
                void sendVenueInvite(i.id)
                  .then((r) => setMessage(r.message))
                  .catch((e) => setMessage((e as Error).message))
                  .finally(() => {
                    setBusy(false);
                    void feed.refresh();
                  });
              }}
            />
          )}
        </Card>
      ))}
      {(d.capabilities?.includes("pdv") ? [...tabs] : [])
        .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
        .map((t) => {
          const total = tabTotals(t.id, orders, items, payments);
          return (
            <Card key={t.id} style={s.card}>
              <Text style={s.heading}>
                {t.label} · {t.customerName}
              </Text>
              <Text style={s.meta}>
                {tabStatusLabel(t.status)} · {t.tableLabel ?? "Sem mesa"} ·
                saldo a receber agora{" "}
                {formatMoney(
                  (d.tab_credit_balances?.find((x) => x.id === t.id)
                    ?.balance_cents ?? Math.round(total.balance * 100)) / 100,
                )}
                {!!d.tab_credit_balances?.find((x) => x.id === t.id)
                  ?.transferred_cents &&
                  ` · ${formatMoney((d.tab_credit_balances?.find((x) => x.id === t.id)?.transferred_cents ?? 0) / 100)} em faturas`}
              </Text>
              <Button
                small
                variant="outline"
                label="Abrir pedidos e pagamento"
                onPress={() => router.push(`/operacao/comanda/${t.id}`)}
              />
            </Card>
          );
        })}
    </Screen>
  );
}
const s = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  heading: { fontSize: 15, fontWeight: "700", color: colors.text },
  text: { fontSize: 13, color: colors.text },
  meta: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  message: { color: colors.warning },
  card: { gap: 12, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  layout: { gap: 12, alignItems: "stretch" },
});
