import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import { formatBRL } from '@/lib/payments';
import { useAppStore } from '@/store/useAppStore';

export function BookingAutomationCard({ gameId, isAdmin }: { gameId: string; isAdmin: boolean }) {
  const currentPlayerId = useAppStore((state) => state.currentPlayerId);
  const game = useAppStore((state) => state.games.find((row) => row.id === gameId));
  const schedule = useAppStore((state) => state.schedules.find((row) => row.id === game?.scheduleId));
  const fields = useAppStore((state) => state.fields);
  const establishments = useAppStore((state) => state.establishments);
  const confirmedCount = useAppStore((state) => state.attendances.filter((row) => row.gameId === gameId && row.status === 'confirmed').length);
  const requests = useAppStore(useShallow((state) => state.gameBookingRequests.filter((row) => row.gameId === gameId)));
  const polls = useAppStore(useShallow((state) => state.teamAvailabilityPolls.filter((row) => row.gameId === gameId)));
  const options = useAppStore((state) => state.teamAvailabilityPollOptions);
  const votes = useAppStore((state) => state.teamAvailabilityPollVotes);
  const deliveries = useAppStore((state) => state.whatsAppDeliveries);
  const deposits = useAppStore((state) => state.bookingDeposits);
  const respond = useAppStore((state) => state.respondGameBookingRequest);
  const tryNext = useAppStore((state) => state.tryNextPreferredField);
  const createPoll = useAppStore((state) => state.createGameAvailabilityPoll);
  const vote = useAppStore((state) => state.voteGameAvailabilityPoll);
  const finalizePoll = useAppStore((state) => state.finalizeGameAvailabilityPoll);
  const trigger = useAppStore((state) => state.triggerGameBookingAutomation);
  const sendReminder = useAppStore((state) => state.sendGameAvailabilityPollReminder);
  const createDeposit = useAppStore((state) => state.createBookingDeposit);
  const confirmDeposit = useAppStore((state) => state.confirmBookingDeposit);
  const cancelBooking = useAppStore((state) => state.cancelConfirmedBooking);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!game || !schedule?.autoBookingEnabled) return null;
  const latest = [...requests].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
  const field = fields.find((row) => row.id === latest?.fieldId);
  const establishment = establishments.find((row) => row.id === field?.establishmentId);
  const activePoll = [...polls].reverse().find((row) => row.status === 'open');
  const pollOptions = options.filter((row) => row.pollId === activePoll?.id);
  const myVote = votes.find((row) => row.pollId === activePoll?.id && row.playerId === currentPlayerId);
  const lastDelivery = deliveries.filter((row) => row.bookingRequestId === latest?.id && row.kind === 'field_request').at(-1);
  const deposit = deposits.find((row) => row.bookingRequestId === latest?.id && !['cancelled'].includes(row.status));

  function handleNext() {
    const next = tryNext(gameId);
    setFeedback(next ? 'Solicitação enviada ao próximo campo.' : 'Nenhum outro campo está livre neste horário. Abra uma enquete.');
  }

  function handleCreatePoll() {
    const poll = createPoll(gameId);
    setFeedback(poll ? 'Enquete enviada para o time.' : 'Não encontramos horários cadastrados para a enquete.');
  }

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}><Ionicons name="logo-whatsapp" size={20} color="#07110A" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Reserva automática</Text>
          <Text style={styles.subtitle}>{confirmedCount}/{schedule.bookingMinimumPlayers} confirmados para disparar</Text>
        </View>
        <Badge label={statusLabel(latest?.status, confirmedCount >= schedule.bookingMinimumPlayers)} color={statusColor(latest?.status)} />
      </View>

      {!latest && (
        <View style={styles.progressBox}>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, confirmedCount / schedule.bookingMinimumPlayers * 100)}%` }]} /></View>
          <Text style={styles.help}>{confirmedCount >= schedule.bookingMinimumPlayers ? 'O mínimo foi atingido. A busca pode ser iniciada.' : `Faltam ${schedule.bookingMinimumPlayers - confirmedCount} confirmações.`}</Text>
          {isAdmin && confirmedCount >= schedule.bookingMinimumPlayers && <Button label="Iniciar busca agora" small onPress={() => trigger(gameId)} />}
        </View>
      )}

      {latest && (
        <View style={styles.requestBox}>
          <View style={styles.rowBetween}><Text style={styles.field}>{field?.name ?? 'Campo'}</Text>{latest.source === 'sponsored' && <Badge label="Patrocinado" color={colors.gold} textColor="#111827" />}</View>
          <Text style={styles.help}>{establishment?.name} · tentativa {latest.attempt} · código {latest.code}</Text>
          <Text style={styles.help}>{new Date(latest.requestedStartAt).toLocaleString('pt-BR')} · {latest.durationMinutes} min</Text>
          <View style={styles.deliveryRow}><Ionicons name={lastDelivery?.status === 'sent' ? 'checkmark-done' : 'alert-circle'} size={15} color={lastDelivery?.status === 'sent' ? colors.primary : colors.warning} /><Text style={styles.deliveryText}>{lastDelivery?.status === 'sent' ? `WhatsApp enviado para ${maskPhone(lastDelivery.phone)}` : 'WhatsApp não enviado: configure e autorize o número comercial.'}</Text></View>
          {latest.failureReason && <Text style={styles.error}>{latest.failureReason}</Text>}
        </View>
      )}

      {isAdmin && latest?.status === 'awaiting_owner' && (
        <View style={styles.demoBox}>
          <Text style={styles.demoTitle}>Modo apresentação · resposta do dono</Text>
          <Text style={styles.help}>Na produção, estes eventos chegam pelo webhook da Evolution Go.</Text>
          <View style={styles.buttonRow}>
            <Button label={`SIM ${latest.code}`} small onPress={() => respond(latest.id, true)} />
            <Button label={`NÃO ${latest.code}`} small variant="danger" onPress={() => respond(latest.id, false)} />
          </View>
        </View>
      )}

      {latest?.status === 'accepted' && <View style={styles.success}><Ionicons name="checkmark-circle" size={20} color={colors.primary} /><Text style={styles.successText}>Campo confirmado e time avisado pelo WhatsApp.</Text></View>}

      {latest?.status === 'accepted' && (establishment?.reservationDepositPercent ?? 0) > 0 && (
        <View style={styles.depositBox}>
          <View style={styles.rowBetween}><Text style={styles.actionTitle}>Sinal da reserva</Text><Badge label={deposit?.status === 'paid' ? 'Pago' : deposit?.status === 'refunded' ? 'Reembolsado' : deposit?.status === 'retained' ? 'Retido' : 'Pendente'} color={deposit?.status === 'paid' ? colors.primary : deposit?.status === 'refunded' ? colors.secondary : colors.warning} /></View>
          <Text style={styles.help}>{establishment?.reservationDepositPercent}% para garantir o horário · reembolso de {establishment?.cancellationRefundPercent ?? 100}% até {establishment?.cancellationRefundHours ?? 24}h antes.</Text>
          {!deposit && <Button label="Gerar Pix do sinal" small onPress={() => createDeposit(latest.id, currentPlayerId, 'pix')} />}
          {deposit?.status === 'pending' && <><Text style={styles.code}>{deposit.pixCopyPaste}</Text><Button label={`Simular sinal pago · ${formatBRL(deposit.amountCents / 100)}`} small onPress={() => confirmDeposit(deposit.id)} /></>}
          {isAdmin && ['pending', 'paid'].includes(deposit?.status ?? '') && <Button label="Cancelar reserva" small variant="danger" onPress={() => { const result = cancelBooking(latest.id); setFeedback(result.refunded ? 'Reserva cancelada e sinal marcado para reembolso.' : result.retained ? 'Reserva cancelada fora da política; sinal retido.' : 'Reserva cancelada.'); }} />}
        </View>
      )}

      {isAdmin && ['declined', 'conflict', 'expired'].includes(latest?.status ?? '') && !activePoll && (
        <View style={styles.actions}>
          <Text style={styles.actionTitle}>O horário não deu certo. Como deseja continuar?</Text>
          <Button label="Tentar próximo campo" onPress={handleNext} />
          <Button label="Perguntar outros horários ao time" variant="outline" onPress={handleCreatePoll} />
        </View>
      )}

      {activePoll && (
        <View style={styles.poll}>
          <View style={styles.rowBetween}><Text style={styles.pollTitle}>Enquete aberta</Text><Badge label="Time votando" color={colors.secondary} /></View>
          <Text style={styles.help}>{activePoll.question}</Text>
          <View style={styles.rowBetween}><Text style={styles.help}>Quórum: {new Set(votes.filter((row) => row.pollId === activePoll.id).map((row) => row.playerId)).size}/{activePoll.quorumRequired ?? 1} pessoas</Text>{isAdmin && <Button label="Lembrar quem não votou" small variant="ghost" onPress={() => setFeedback(`${sendReminder(activePoll.id)} lembrete(s) enviado(s).`)} />}</View>
          {pollOptions.map((option) => {
            const count = votes.filter((row) => row.optionId === option.id).length;
            const selected = myVote?.optionId === option.id;
            const availability = useAppStore.getState().fieldAvailabilities.find((row) => row.fieldId === option.fieldId && row.active);
            return (
              <View key={option.id} style={[styles.option, selected && styles.optionSelected]}>
                <Pressable style={{ flex: 1 }} onPress={() => vote(activePoll.id, option.id, currentPlayerId)}>
                  <Text style={styles.optionText}>{option.label}</Text>
                  <Text style={styles.help}>{count} voto{count === 1 ? '' : 's'}{availability?.price ? ` · ${formatBRL(availability.price)}` : ''}</Text>
                </Pressable>
                {selected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                {isAdmin && <Button label="Escolher" small variant="ghost" disabled={new Set(votes.filter((row) => row.pollId === activePoll.id).map((row) => row.playerId)).size < (activePoll.quorumRequired ?? 1)} onPress={() => finalizePoll(activePoll.id, option.id)} />}
              </View>
            );
          })}
        </View>
      )}
      {feedback && <Text style={styles.feedback}>{feedback}</Text>}
    </Card>
  );
}

function statusLabel(status: string | undefined, ready: boolean): string {
  if (!status) return ready ? 'Pronto' : 'Aguardando mínimo';
  return ({ awaiting_owner: 'Aguardando campo', accepted: 'Confirmado', declined: 'Recusado', expired: 'Expirado', conflict: 'Conflito', cancelled: 'Cancelado' } as Record<string, string>)[status] ?? status;
}

function statusColor(status?: string): string {
  if (status === 'accepted') return colors.primary;
  if (status === 'declined' || status === 'conflict') return colors.danger;
  return colors.warning;
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return 'número não informado';
  return `•••• ${phone.slice(-4)}`;
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, marginBottom: spacing.lg, borderColor: 'rgba(34,197,94,0.35)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 12 },
  requestBox: { gap: 3, backgroundColor: colors.bgElevated, borderRadius: 12, padding: spacing.md },
  field: { color: colors.text, fontSize: 15, fontWeight: '800' },
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  deliveryRow: { flexDirection: 'row', gap: 5, alignItems: 'center', marginTop: spacing.xs },
  deliveryText: { color: colors.textMuted, fontSize: 11, flex: 1 },
  demoBox: { gap: spacing.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.cardBorder, borderRadius: 12, padding: spacing.md },
  demoTitle: { color: colors.warning, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  success: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: 'rgba(34,197,94,0.1)', padding: spacing.md, borderRadius: 12 },
  successText: { color: colors.primary, fontSize: 13, fontWeight: '700', flex: 1 },
  actions: { gap: spacing.sm },
  actionTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  poll: { gap: spacing.sm },
  pollTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 12, padding: spacing.md },
  optionSelected: { borderColor: colors.primary, backgroundColor: 'rgba(34,197,94,0.08)' },
  optionText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  feedback: { color: colors.warning, fontSize: 12, textAlign: 'center' },
  progressBox: { gap: spacing.sm },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 4, backgroundColor: colors.primary },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.xs },
  depositBox: { gap: spacing.sm, backgroundColor: 'rgba(234,179,8,0.08)', borderWidth: 1, borderColor: 'rgba(234,179,8,0.25)', borderRadius: 12, padding: spacing.md },
  code: { color: colors.text, fontSize: 10, lineHeight: 14 },
});
