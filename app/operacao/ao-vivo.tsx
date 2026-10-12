import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { AdaptiveSelect } from "@/components/ui/AdaptiveSelect";
import { useVenueOperations } from "@/hooks/useVenueOperations";
import { moneyCents, venueAction } from "@/lib/venueOperations";
import { colors } from "@/constants/theme";
import { formatDateTime } from "@/lib/establishmentOperations";
export default function Live() {
  const { establishmentId } = useLocalSearchParams<{
      establishmentId: string;
    }>(),
    feed = useVenueOperations(establishmentId ?? null),
    d = feed.data;
  const [clock, setClock] = useState(Date.now()),
    [field, setField] = useState(""),
    [label, setLabel] = useState(""),
    [minutes, setMinutes] = useState("60"),
    [incident, setIncident] = useState(""),
    [severity, setSeverity] = useState("warning"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const now = d.server_time
      ? new Date(d.server_time).getTime() + clock - feed.updatedAt
      : clock,
    can = (c: string) => d.capabilities?.includes(c as never);
  async function run(action: string, data: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await venueAction(action, { venueId: establishmentId, ...data });
      setMessage("Operação registrada.");
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
      <Text style={s.title}>Operação ao vivo</Text>
      <Text style={s.text}>{d.name}</Text>
      <Text style={s.meta}>
        {feed.live ? "Conexão em tempo real" : "Atualização a cada 30 segundos"}{" "}
        ·{" "}
        {feed.updatedAt
          ? `última consulta ${new Date(feed.updatedAt).toLocaleTimeString("pt-BR")}`
          : "Conectando"}
      </Text>
      <Button
        small
        variant="outline"
        label="Atualizar agora"
        loading={feed.busy}
        onPress={() => void feed.refresh()}
      />
      {!!(feed.error || message) && (
        <Text style={s.message}>{feed.error || message}</Text>
      )}
      <View style={s.row}>
        {can("pdv") && (
          <Button
            small
            label="PDV / comandas"
            onPress={() =>
              router.push({
                pathname: "/operacao/comandas",
                params: { establishmentId },
              })
            }
          />
        )}{" "}
        {(can("classes") || can("own_classes") || can("cash")) && (
          <Button
            small
            variant="outline"
            label="Aulas"
            onPress={() =>
              router.push({
                pathname: "/operacao/aulas",
                params: { establishmentId },
              })
            }
          />
        )}{" "}
        {(can("cash") || can("reports")) && (
          <Button
            small
            variant="outline"
            label="Caixa e receitas"
            onPress={() =>
              router.push({
                pathname: "/operacao/caixa",
                params: { establishmentId },
              })
            }
          />
        )}{" "}
        {can("kitchen") && (
          <Button
            small
            variant="outline"
            label="Cozinha e bar"
            onPress={() =>
              router.push({
                pathname: "/operacao/cozinha",
                params: { establishmentId },
              })
            }
          />
        )}{" "}
        {d.owner && (
          <Button
            small
            variant="outline"
            label="Equipe e permissões"
            onPress={() =>
              router.push({
                pathname: "/operacao/equipe",
                params: { establishmentId },
              })
            }
          />
        )}
      </View>
      {d.open_tabs !== undefined && (
        <Card style={s.card}>
          <Text style={s.heading}>
            {d.open_tabs} comandas abertas · {d.kitchen_orders} pedidos na
            cozinha
          </Text>
          <Text style={s.meta}>
            Valores financeiros só aparecem para quem possui acesso.
          </Text>
        </Card>
      )}
      {d.invoice_pending_cents !== undefined && <Card style={s.card}><Text style={s.heading}>Faturas a receber {moneyCents(d.invoice_pending_cents)}</Text><Text style={s.meta}>Recebido hoje em contas de clientes e locações {moneyCents(d.credit_received_cents??0)} · conferência do caixa, separado da emissão de faturas.</Text><Button small label="Clientes e faturas" onPress={()=>router.push({pathname:'/operacao/faturas',params:{establishmentId}})}/></Card>}
      {d.food_received_cents !== undefined && (
        <Card style={s.card}>
          <Text style={s.heading}>Recebimentos registrados hoje</Text>
          <Text style={s.text}>
            Lanchonete {moneyCents(d.food_received_cents)} · Aulas em dinheiro{" "}
            {moneyCents(d.classes_cash_cents ?? 0)}
          </Text>
          <Text style={s.meta}>
            Não é lucro, saldo bancário nem previsão de locações. Mensalidade
            conta uma vez no recebimento.
          </Text>
        </Card>
      )}
      {(d.occupancy ?? []).map((o) => {
        const seconds = Math.floor(
            (new Date(o.ends_at).getTime() - now) / 1000,
          ),
          abs = Math.abs(seconds);
        return (
          <Card key={o.id} style={s.card}>
            <Text style={s.heading}>
              {d.fields?.find((f) => f.id === o.field_id)?.name} · {o.label}
            </Text>
            <Text style={[s.timer, seconds < 0 && { color: colors.danger }]}>
              {seconds < 0 ? "Excedeu " : ""}
              {String(Math.floor(abs / 60)).padStart(2, "0")}:
              {String(abs % 60).padStart(2, "0")}
            </Text>
            <Text style={s.meta}>
              Fim previsto {formatDateTime(o.ends_at)}. Tempo vencido não
              encerra nem cobra sozinho.
            </Text>
            {can("reservations") && (
              <View style={s.row}>
                <Button
                  small
                  variant="outline"
                  label="Prorrogar 15 min"
                  disabled={busy}
                  onPress={() =>
                    void run("extend_use", { id: o.id, minutes: 15 })
                  }
                />
                <Button
                  small
                  label="Encerrar uso"
                  disabled={busy}
                  onPress={() => void run("end_use", { id: o.id })}
                />
              </View>
            )}
          </Card>
        );
      })}
      {can("reservations") && (
        <Card style={s.card}>
          <Text style={s.heading}>Iniciar uso da quadra</Text>
          <AdaptiveSelect
            label="Quadra"
            value={field}
            onChange={setField}
            options={(d.fields ?? []).map((f) => ({
              value: f.id,
              label: f.name,
            }))}
          />
          <TextField
            label="Time ou responsável"
            value={label}
            onChangeText={setLabel}
          />
          <TextField
            label="Duração em minutos"
            value={minutes}
            onChangeText={setMinutes}
            keyboardType="number-pad"
          />
          <Text style={s.meta}>
            Cronômetro de operação. Não substitui reserva; confira a agenda
            abaixo antes de iniciar.
          </Text>
          <Button
            label="Iniciar cronômetro"
            loading={busy}
            disabled={!field || !label.trim()}
            onPress={() =>
              void run("start_use", {
                fieldId: field,
                label,
                minutes: Number(minutes),
              })
            }
          />
        </Card>
      )}
      {!!d.bookings?.length && <Text style={s.heading}>Reservas de hoje</Text>}
      {(d.bookings ?? []).map((b) => (
        <Card key={b.id} style={s.card}>
          <Text style={s.text}>
            {b.time} · {b.team_name} · {b.duration_minutes} min
          </Text>
          <Text style={s.meta}>
            {d.fields?.find((f) => f.id === b.field_id)?.name}
          </Text>
        </Card>
      ))}
      {can("live") && (
        <Card style={s.card}>
          <TextField
            label="Registrar ocorrência"
            value={incident}
            onChangeText={setIncident}
            placeholder="Iluminação, manutenção, atendimento..."
          />
          <AdaptiveSelect
            label="Prioridade"
            value={severity}
            onChange={setSeverity}
            options={[
              { value: "info", label: "Informação" },
              { value: "warning", label: "Atenção" },
              { value: "urgent", label: "Urgente" },
            ]}
          />
          <Button
            label="Registrar ocorrência"
            disabled={busy || !incident.trim()}
            onPress={() => void run("incident", { title: incident, severity })}
          />
        </Card>
      )}
      {(d.incidents ?? []).map((i) => (
        <Card key={i.id} style={s.card}>
          <Text style={s.heading}>{i.title}</Text>
          <Text style={s.meta}>
            {i.resolved_at ? "Resolvida" : "Aberta"} ·{" "}
            {formatDateTime(i.created_at)}
          </Text>
          {!i.resolved_at && can("live") && (
            <Button
              small
              variant="outline"
              label="Marcar resolvida"
              disabled={busy}
              onPress={() => void run("resolve_incident", { id: i.id })}
            />
          )}
        </Card>
      ))}
    </Screen>
  );
}
const s = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "800", color: colors.text },
  heading: { fontSize: 15, fontWeight: "700", color: colors.text },
  text: { fontSize: 13, color: colors.text, lineHeight: 20 },
  meta: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  message: { color: colors.warning },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { gap: 10, marginBottom: 8 },
  timer: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.primary,
    fontVariant: ["tabular-nums"],
  },
});
