import { useRef, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Screen } from "./ui/Screen";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { AdaptiveSelect } from "./ui/AdaptiveSelect";
import { useAcademy, useVenueOperations } from "@/hooks/useVenueOperations";
import {
  academyAction,
  compatiblePrograms,
  moneyCents,
  parsePrice,
} from "@/lib/venueOperations";
import { createUuid } from "@/lib/uuid";
import { formatDateTime } from "@/lib/establishmentOperations";
import { useSports } from "@/constants/sports";
import { colors, spacing } from "@/constants/theme";
import { useAppStore } from "@/store/useAppStore";
import type { AcademyProgram, AcademySession } from "@/types/venueOperations";
const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
type Save = (
  action: string,
  data: Record<string, unknown>,
  message: string,
) => Promise<{ id: string; count: number } | undefined>;
export function AcademyScreen({
  venue = null,
  sessionId = null,
}: {
  venue?: string | null;
  sessionId?: string | null;
}) {
  const feed = useAcademy(venue),
    access = useVenueOperations(
      venue ??
        feed.data.programs.find((p) =>
          p.sessions.some((s) => s.id === sessionId),
        )?.establishment_id ??
        null,
    ),
    me = useAppStore((s) => s.currentPlayerId),
    sports = useSports();
  const [message, setMessage] = useState(""),
    [running, setRunning] = useState(false),
    [form, setForm] = useState(false);
  const [name, setName] = useState(""),
    [sport, setSport] = useState("volei"),
    [field, setField] = useState(""),
    [coach, setCoach] = useState(""),
    [format, setFormat] = useState("group");
  const [level, setLevel] = useState("Iniciante"),
    [capacity, setCapacity] = useState("10"),
    [duration, setDuration] = useState("60"),
    [monthly, setMonthly] = useState(""),
    [dropin, setDropin] = useState("");
  const [enroll, setEnroll] = useState<{
    program: AcademyProgram;
    session: AcademySession;
    plan: string;
  } | null>(null);
  const locked = useRef(false),
    nonce = useRef(createUuid());
  const canCreate =
    access.data.owner ||
    ((access.data.capabilities?.includes("classes") ||
      access.data.capabilities?.includes("own_classes")) &&
      access.data.capabilities?.includes("class_prices"));
  const run: Save = async (action, data, success) => {
    if (locked.current) return;
    locked.current = true;
    setRunning(true);
    setMessage("");
    try {
      const r = await academyAction(action, data);
      setMessage(
        action === "publish"
          ? `${r.count} horários publicados; duplicados ignorados.`
          : success,
      );
      await feed.refresh();
      await access.refresh();
      return r;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      locked.current = false;
      setRunning(false);
    }
  };
  const programs = feed.data.programs.filter(
    (p) => !sessionId || p.sessions.some((s) => s.id === sessionId),
  );
  return (
    <Screen>
      <View style={styles.row}>
        <Button
          small
          variant="ghost"
          label="Voltar"
          onPress={() => router.back()}
        />
        <Text style={styles.title}>
          {venue ? "Aulas e professores" : "Aulas esportivas"}
        </Text>
      </View>
      <Text style={styles.muted}>
        Mensalidade por mês civil, sem renovação automática. Avulsa tem preço
        próprio. Reserva não confirma pagamento.
      </Text>
      <Button
        small
        variant="outline"
        label="Atualizar aulas"
        loading={feed.busy}
        onPress={() => void feed.refresh()}
      />
      {!!feed.error && <Text style={styles.error}>{feed.error}</Text>}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      )}
      {canCreate && (
        <Button
          label={form ? "Fechar cadastro" : "Nova turma / aula particular"}
          onPress={() => setForm(!form)}
        />
      )}
      {form && canCreate && (
        <Card style={styles.card}>
          <Text style={styles.heading}>Cadastrar e precificar</Text>
          <TextField label="Nome da aula" value={name} onChangeText={setName} />
          <AdaptiveSelect
            label="Esporte"
            value={sport}
            onChange={(value) => {
              setSport(value);
              setField("");
            }}
            options={sports.map((s) => ({ value: s.id, label: s.label }))}
          />
          <AdaptiveSelect
            label="Quadra"
            value={field}
            onChange={setField}
            options={(access.data.fields ?? [])
              .filter((f) => !f.sport_ids || f.sport_ids.includes(sport))
              .map((f) => ({
                value: f.id,
                label: f.name,
              }))}
          />
          <AdaptiveSelect
            label="Professor"
            value={coach}
            onChange={setCoach}
            options={[
              { value: "", label: "Eu serei o professor" },
              ...(access.data.coaches ?? []).map((c) => ({
                value: c.id,
                label: c.name,
              })),
            ]}
          />
          <AdaptiveSelect
            label="Formato"
            value={format}
            onChange={setFormat}
            options={[
              { value: "group", label: "Turma" },
              { value: "private", label: "Particular" },
            ]}
          />
          <TextField
            label="Nível (trocas exigem nível compatível)"
            value={level}
            onChangeText={setLevel}
          />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <TextField
                label="Vagas"
                value={format === "private" ? "1" : capacity}
                onChangeText={setCapacity}
                keyboardType="number-pad"
                editable={format === "group"}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                label="Duração (min)"
                value={duration}
                onChangeText={setDuration}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <TextField
            label="Mensalidade (R$) — vazio desabilita"
            value={monthly}
            onChangeText={setMonthly}
            keyboardType="decimal-pad"
            placeholder="180,00"
          />
          <TextField
            label="Avulsa (R$) — vazio desabilita"
            value={dropin}
            onChangeText={setDropin}
            keyboardType="decimal-pad"
            placeholder="35,00"
          />
          <Button
            label="Salvar turma e preços"
            loading={running}
            disabled={
              !name.trim() || !field || (!monthly.trim() && !dropin.trim())
            }
            onPress={() => {
              try {
                void run(
                  "program_save",
                  {
                    venueId: venue,
                    name,
                    sportId: sport,
                    fieldId: field,
                    coachId: coach || null,
                    format,
                    level,
                    capacity: Number(capacity),
                    durationMinutes: Number(duration),
                    monthlyCents: parsePrice(monthly),
                    dropInCents: parsePrice(dropin),
                  },
                  "Turma criada. Publique os horários.",
                ).then((r) => {
                  if (r) {
                    setForm(false);
                    setName("");
                  }
                });
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          />
        </Card>
      )}
      {enroll && (
        <Card style={styles.card}>
          <Text style={styles.heading}>
            Confirmar reserva · {enroll.program.name}
          </Text>
          <Text style={styles.text}>
            {enroll.plan === "monthly"
              ? `${moneyCents(enroll.program.monthly_cents!)} pelo mês civil de ${formatDateTime(enroll.session.starts_at)}. Reserva todas as aulas futuras já publicadas nesse mês, sem pró-rata automático.`
              : `${moneyCents(enroll.program.drop_in_cents!)} por ${formatDateTime(enroll.session.starts_at)}.`}
          </Text>
          <Text style={styles.muted}>
            Mensalidade existente é reutilizada. Horários publicados depois
            precisam ser reservados novamente. Pagamento combinado com o
            estabelecimento.
          </Text>
          <Button
            label="Confirmar reserva e cobrança pendente"
            loading={running}
            onPress={() =>
              void run(
                "enroll",
                {
                  sessionId: enroll.session.id,
                  plan: enroll.plan,
                  requestId: nonce.current,
                },
                "Reserva feita. Veja sua cobrança abaixo.",
              ).then((r) => {
                if (r) {
                  nonce.current = createUuid();
                  setEnroll(null);
                }
              })
            }
          />
          <Button
            variant="ghost"
            label="Cancelar"
            onPress={() => setEnroll(null)}
          />
        </Card>
      )}
      {programs.map((p) => (
        <Card key={p.id} style={styles.card}>
          <Text style={styles.heading}>{p.name}</Text>
          <Text style={styles.muted}>
            {p.venue_name} · {p.coach_name} · {p.level} ·{" "}
            {p.format === "private" ? "Particular" : `${p.capacity} vagas`} ·{" "}
            {p.duration_minutes} min
          </Text>
          <Text style={styles.text}>
            {p.monthly_cents !== null
              ? `Mensal ${moneyCents(p.monthly_cents)}`
              : "Sem mensal"}{" "}
            ·{" "}
            {p.drop_in_cents !== null
              ? `Avulsa ${moneyCents(p.drop_in_cents)}`
              : "Sem avulsa"}
          </Text>
          {p.can_price && <Pricing program={p} running={running} save={run} />}
          {p.can_manage && (
            <Recurring program={p} running={running} save={run} />
          )}
          {access.data.owner && (
            <>
              <Toggle
                label="Permitir trocas com turmas compatíveis"
                value={p.swaps_enabled}
                onChange={(b) =>
                  void run(
                    "policy",
                    {
                      programId: p.id,
                      swaps: b,
                      makeups: p.makeups_enabled,
                      cutoffHours: p.cutoff_hours,
                      makeupDays: p.makeup_days,
                    },
                    "Política atualizada.",
                  )
                }
              />
              <Toggle
                label="Permitir reposição de ausência avisada"
                value={p.makeups_enabled}
                onChange={(b) =>
                  void run(
                    "policy",
                    {
                      programId: p.id,
                      swaps: p.swaps_enabled,
                      makeups: b,
                      cutoffHours: p.cutoff_hours,
                      makeupDays: p.makeup_days,
                    },
                    "Política atualizada.",
                  )
                }
              />
            </>
          )}
          <Text style={styles.muted}>
            {p.swaps_enabled ? "Trocas habilitadas" : "Sem trocas"} ·{" "}
            {p.makeups_enabled
              ? `Reposição em ${p.makeup_days} dias, até 2/mês`
              : "Sem reposição"}{" "}
            · aviso mínimo {p.cutoff_hours}h
          </Text>
          {p.sessions
            .filter((s) => !sessionId || s.id === sessionId)
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
            .map((s) => {
              const own = feed.data.seats.find(
                  (a) =>
                    a.session_id === s.id && a.player_id === me && a.active,
                ),
                future = new Date(s.starts_at).getTime() > Date.now(),
                available =
                  ["open", "full", "scheduled"].includes(s.status) && future;
              return (
                <View key={s.id} style={styles.session}>
                  <Text style={styles.heading}>
                    {formatDateTime(s.starts_at)}
                  </Text>
                  <Text style={styles.muted}>
                    {s.occupied}/{p.capacity} reservados ·{" "}
                    {s.status === "cancelled"
                      ? "Cancelada"
                      : future
                        ? "Agendada"
                        : "Horário passado"}
                  </Text>
                  {available && !own && (
                    <View style={styles.row}>
                      {p.drop_in_cents !== null && (
                        <Button
                          small
                          label="Reservar avulsa"
                          disabled={running || s.occupied >= p.capacity}
                          onPress={() =>
                            setEnroll({
                              program: p,
                              session: s,
                              plan: "drop_in",
                            })
                          }
                        />
                      )}
                      {p.monthly_cents !== null && (
                        <Button
                          small
                          variant="outline"
                          label="Reservar mensal"
                          disabled={running || s.occupied >= p.capacity}
                          onPress={() =>
                            setEnroll({
                              program: p,
                              session: s,
                              plan: "monthly",
                            })
                          }
                        />
                      )}
                    </View>
                  )}
                  {own && (
                    <Text style={styles.message}>Sua vaga está reservada.</Text>
                  )}
                  {own && available && (
                    <SeatActions
                      programs={feed.data.programs}
                      program={p}
                      seatId={own.id}
                      sessionId={s.id}
                      running={running}
                      save={run}
                    />
                  )}
                  {p.can_manage && available && (
                    <SessionEditor session={s} running={running} save={run} />
                  )}
                  {p.can_manage &&
                    feed.data.seats
                      .filter((a) => a.session_id === s.id && a.active)
                      .map((a) => (
                        <View key={a.id} style={styles.roster}>
                          <Text style={styles.text}>
                            {a.name} · {a.attendance ?? "Sem chamada"}
                          </Text>
                          {!future && (
                            <View style={styles.row}>
                              <Button
                                small
                                variant="outline"
                                label="Presente"
                                disabled={running}
                                onPress={() =>
                                  void run(
                                    "attendance",
                                    { seatId: a.id, status: "present" },
                                    "Chamada registrada.",
                                  )
                                }
                              />
                              <Button
                                small
                                variant="ghost"
                                label="Ausente"
                                disabled={running}
                                onPress={() =>
                                  void run(
                                    "attendance",
                                    { seatId: a.id, status: "absent" },
                                    "Chamada registrada.",
                                  )
                                }
                              />
                            </View>
                          )}
                        </View>
                      ))}
                </View>
              );
            })}
          {!p.sessions.length && (
            <Text style={styles.muted}>Nenhum horário publicado.</Text>
          )}
        </Card>
      ))}
      <Text style={styles.heading}>Trocas solicitadas</Text>
      {feed.data.swaps.map((w) => (
        <Card key={w.id} style={styles.card}>
          <Text style={styles.text}>
            Trocar{" "}
            {formatDateTime(
              feed.data.programs
                .flatMap((p) => p.sessions)
                .find((s) => s.id === w.source_session_id)?.starts_at ?? "",
            )}{" "}
            por{" "}
            {formatDateTime(
              feed.data.programs
                .flatMap((p) => p.sessions)
                .find((s) => s.id === w.target_session_id)?.starts_at ?? "",
            )}
          </Text>
          {feed.data.seats.some(
            (a) =>
              a.session_id === w.target_session_id &&
              a.player_id === me &&
              a.active,
          ) && (
            <Button
              label="Aceitar troca dos dois horários"
              loading={running}
              onPress={() =>
                void run(
                  "accept_swap",
                  { swapId: w.id },
                  "Troca confirmada para ambos; a cobrança não mudou.",
                )
              }
            />
          )}
        </Card>
      ))}
      {!feed.data.swaps.length && (
        <Text style={styles.muted}>Sem propostas de troca para você.</Text>
      )}
      {feed.data.credits.map((c) => (
        <Makeup
          key={c.id}
          credit={c}
          programs={feed.data.programs}
          program={feed.data.programs.find((p) => p.id === c.program_id)}
          running={running}
          save={run}
        />
      ))}
      <Text style={styles.heading}>
        Cobranças {venue ? "autorizadas" : "das suas aulas"}
      </Text>
      {feed.data.bills.map((b) => (
        <Card key={b.id} style={styles.card}>
          <Text style={styles.heading}>
            {moneyCents(b.amount_cents)} ·{" "}
            {b.plan === "monthly"
              ? `Mensal ${b.competence?.slice(0, 7)}`
              : b.plan === "legacy"
                ? "Registro anterior"
                : "Avulsa"}
          </Text>
          <Text style={styles.text}>
            {b.name} ·{" "}
            {b.status === "invoiced"
              ? "Na fatura do cliente"
              : b.status === "invoice_paid"
                ? "Quitada pela fatura"
                : b.status === "pending"
                  ? "A combinar / pendente"
                  : b.status === "cancelled"
                    ? "Cancelada"
                    : "Recebimento registrado"}
          </Text>
          {(!venue ||
            access.data.owner ||
            access.data.capabilities?.includes("cash") ||
            access.data.capabilities?.includes("reports")) &&
            b.plan !== "legacy" &&
            b.status !== "cancelled" &&
            b.status !== "cash_paid" && (
              <Button
                small
                variant="outline"
                label={
                  b.status === "pending"
                    ? "Consultar opção de faturar aula"
                    : "Consultar fatura da aula"
                }
                onPress={() =>
                  router.push(
                    venue
                      ? {
                          pathname: "/operacao/faturas",
                          params: { establishmentId: venue },
                        }
                      : "/faturas",
                  )
                }
              />
            )}
          {b.status === "pending" &&
            b.plan !== "legacy" &&
            (access.data.owner ||
              access.data.capabilities?.includes("cash")) && (
              <Button
                variant="outline"
                label="Recebi em dinheiro presencialmente"
                disabled={running}
                onPress={() =>
                  void run(
                    "cash_received",
                    { billId: b.id },
                    "Recebimento em dinheiro registrado no histórico.",
                  )
                }
              />
            )}
        </Card>
      ))}
      {feed.data.notices.map((n) => (
        <Card key={n.id} style={styles.card}>
          <Text style={styles.heading}>{n.title}</Text>
          <Text style={styles.text}>{n.body}</Text>
        </Card>
      ))}
      {!programs.length && !feed.busy && (
        <Text style={styles.muted}>
          Nenhuma turma disponível. Programas antigos por pacote precisam ser
          revisados pelo estabelecimento.
        </Text>
      )}
    </Screen>
  );
}
function Pricing({
  program: p,
  running,
  save,
}: {
  program: AcademyProgram;
  running: boolean;
  save: Save;
}) {
  const [open, setOpen] = useState(false),
    [monthly, setMonthly] = useState(
      p.monthly_cents === null ? "" : String(p.monthly_cents / 100),
    ),
    [drop, setDrop] = useState(
      p.drop_in_cents === null ? "" : String(p.drop_in_cents / 100),
    ),
    [error, setError] = useState("");
  return (
    <View style={{ gap: 8 }}>
      <Button
        small
        variant="ghost"
        label={open ? "Fechar preços" : "Editar mensalidade e avulsa"}
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <TextField
            label="Mensalidade (R$)"
            value={monthly}
            onChangeText={setMonthly}
            keyboardType="decimal-pad"
          />
          <TextField
            label="Avulsa (R$)"
            value={drop}
            onChangeText={setDrop}
            keyboardType="decimal-pad"
          />
          <Text style={styles.muted}>
            Vazio desativa a modalidade. Novos preços não alteram cobranças
            existentes.
          </Text>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Button
            label="Salvar novos preços"
            loading={running}
            onPress={() => {
              try {
                setError("");
                void save(
                  "program_save",
                  {
                    id: p.id,
                    monthlyCents: parsePrice(monthly),
                    dropInCents: parsePrice(drop),
                  },
                  "Novos preços salvos; cobranças anteriores preservadas.",
                ).then((r) => r && setOpen(false));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </>
      )}
    </View>
  );
}
function Recurring({
  program: p,
  running,
  save,
}: {
  program: AcademyProgram;
  running: boolean;
  save: Save;
}) {
  const [open, setOpen] = useState(false),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState(""),
    [slots, setSlots] = useState([
      { weekday: 1, time: "18:00" },
      { weekday: 3, time: "18:00" },
    ]);
  return (
    <View style={{ gap: 8 }}>
      <Button
        small
        variant="outline"
        label={open ? "Fechar horários" : "Publicar agenda recorrente"}
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <Text style={styles.muted}>
            Até 12 semanas, horário de Brasília. Conflito de quadra cancela toda
            a publicação.
          </Text>
          <TextField
            label="Primeiro dia (AAAA-MM-DD)"
            value={from}
            onChangeText={setFrom}
          />
          <TextField
            label="Último dia (AAAA-MM-DD)"
            value={until}
            onChangeText={setUntil}
          />
          {slots.map((slot, i) => (
            <View key={i} style={styles.card}>
              <AdaptiveSelect
                label={`Dia ${i + 1}`}
                value={String(slot.weekday)}
                onChange={(s) =>
                  setSlots((old) =>
                    old.map((x, j) =>
                      j === i ? { ...x, weekday: Number(s) } : x,
                    ),
                  )
                }
                options={weekdays.map((label, value) => ({
                  value: String(value),
                  label,
                }))}
              />
              <TextField
                label="Horário (HH:mm)"
                value={slot.time}
                onChangeText={(s) =>
                  setSlots((old) =>
                    old.map((x, j) => (j === i ? { ...x, time: s } : x)),
                  )
                }
              />
            </View>
          ))}
          <View style={styles.row}>
            <Button
              small
              variant="ghost"
              label="Mais um dia"
              disabled={slots.length >= 7}
              onPress={() =>
                setSlots([...slots, { weekday: 5, time: "18:00" }])
              }
            />
            <Button
              small
              variant="ghost"
              label="Remover último"
              disabled={slots.length <= 1}
              onPress={() => setSlots(slots.slice(0, -1))}
            />
          </View>
          <Button
            label="Verificar agenda e publicar"
            loading={running}
            onPress={() =>
              void save(
                "publish",
                { programId: p.id, from, until, slots },
                "Agenda publicada.",
              )
            }
          />
        </>
      )}
    </View>
  );
}
function SeatActions({
  program: p,
  programs,
  seatId,
  sessionId,
  running,
  save,
}: {
  program: AcademyProgram;
  programs: AcademyProgram[];
  seatId: string;
  sessionId: string;
  running: boolean;
  save: Save;
}) {
  const [target, setTarget] = useState("");
  return (
    <View style={{ gap: 8 }}>
      {p.swaps_enabled && (
        <>
          <AdaptiveSelect
            label="Trocar com aluno de outro horário"
            value={target}
            onChange={setTarget}
            options={programs
              .filter((x) => compatiblePrograms(p, x))
              .flatMap((x) =>
                x.sessions
                  .filter(
                    (s) =>
                      s.id !== sessionId &&
                      new Date(s.starts_at).getTime() > Date.now(),
                  )
                  .map((s) => ({
                    value: s.id,
                    label: `${x.name} · ${formatDateTime(s.starts_at)}`,
                  })),
              )}
          />
          <Button
            small
            variant="outline"
            label="Perguntar aos alunos desse horário"
            disabled={running || !target}
            onPress={() =>
              void save(
                "offer_swap",
                { seatId, targetSessionId: target },
                "Pedido enviado aos alunos elegíveis. Sua reserva continua válida até o aceite.",
              )
            }
          />
        </>
      )}
      {p.makeups_enabled && (
        <Button
          small
          variant="ghost"
          label="Avisar ausência e gerar reposição"
          disabled={running}
          onPress={() =>
            void save(
              "makeup_request",
              { seatId },
              "Vaga liberada e crédito de reposição criado.",
            )
          }
        />
      )}
    </View>
  );
}
function SessionEditor({
  session: s,
  running,
  save,
}: {
  session: AcademySession;
  running: boolean;
  save: Save;
}) {
  const [open, setOpen] = useState(false),
    [date, setDate] = useState(""),
    [reason, setReason] = useState(""),
    [cancel, setCancel] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Button
        small
        variant="ghost"
        label={open ? "Fechar alteração" : "Alterar / cancelar horário"}
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <TextField
            label="Nova data e hora Brasília (AAAA-MM-DD HH:mm)"
            value={date}
            onChangeText={setDate}
          />
          <Text style={styles.muted}>
            Verifica conflitos de quadra e dos alunos, cancela propostas de
            troca e envia avisos no app.
          </Text>
          <Button
            small
            variant="outline"
            label="Verificar e remarcar"
            disabled={running || !date.trim()}
            onPress={() =>
              void save(
                "session_change",
                { sessionId: s.id, startsLocal: date },
                "Aula remarcada; alunos avisados no app.",
              )
            }
          />
          <TextField
            label="Motivo do cancelamento"
            value={reason}
            onChangeText={setReason}
          />
          <Button
            small
            variant="ghost"
            label="Cancelar esta aula"
            disabled={running || !reason.trim()}
            onPress={() => setCancel(true)}
          />
          {cancel && (
            <>
              <Text style={styles.error}>
                Cancelar a aula não confirma estorno nem devolve dinheiro. O
                estabelecimento deve combinar reposição ou reembolso com os
                alunos.
              </Text>
              <Button
                label="Confirmar cancelamento da aula"
                variant="danger"
                disabled={running}
                onPress={() =>
                  void save(
                    "session_change",
                    { sessionId: s.id, status: "cancelled", reason },
                    "Aula cancelada; alunos avisados. Trate pagamentos e reposições com eles.",
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
function Makeup({
  credit: c,
  program: p,
  programs,
  running,
  save,
}: {
  credit: { id: string; expires_at: string };
  program?: AcademyProgram;
  programs: AcademyProgram[];
  running: boolean;
  save: Save;
}) {
  const [target, setTarget] = useState("");
  const options = programs
    .filter((x) => p && compatiblePrograms(p, x, true))
    .flatMap((x) =>
      x.sessions
        .filter(
          (s) =>
            new Date(s.starts_at).getTime() > Date.now() &&
            new Date(s.starts_at).getTime() <=
              new Date(c.expires_at).getTime() &&
            s.occupied < x.capacity,
        )
        .map((s) => ({
          value: s.id,
          label: `${x.name} · ${formatDateTime(s.starts_at)}`,
        })),
    );
  return (
    <Card style={styles.card}>
      <Text style={styles.heading}>Reposição · {p?.name}</Text>
      <Text style={styles.muted}>
        Válida até {formatDateTime(c.expires_at)}. Sem cobrança adicional.
      </Text>
      <AdaptiveSelect
        label="Horário para reposição"
        value={target}
        onChange={setTarget}
        options={options}
      />
      <Button
        label="Usar crédito e reservar"
        disabled={!target || running}
        onPress={() =>
          void save(
            "makeup_book",
            { creditId: c.id, sessionId: target },
            "Reposição reservada sem nova cobrança.",
          )
        }
      />
    </Card>
  );
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.text, { flex: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}
const styles = StyleSheet.create({
  title: { fontSize: 21, fontWeight: "800", color: colors.text },
  heading: { fontSize: 15, fontWeight: "700", color: colors.text },
  text: { fontSize: 13, color: colors.text, lineHeight: 20 },
  muted: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  card: { gap: spacing.sm, marginBottom: spacing.sm },
  session: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
    paddingTop: spacing.md,
    marginTop: spacing.md,
  },
  roster: { gap: 6, paddingVertical: 6 },
  message: { fontSize: 13, color: colors.primary, lineHeight: 20 },
  error: { fontSize: 13, color: colors.danger },
});
