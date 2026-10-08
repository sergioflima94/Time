import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { formatGameDateLong } from '@/lib/format';
import { useAppStore } from '@/store/useAppStore';

export default function MatchDayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlayerId = useAppStore((state) => state.currentPlayerId);
  const game = useAppStore((state) => state.games.find((row) => row.id === id));
  const attendances = useAppStore(useShallow((state) => state.attendances.filter((row) => row.gameId === id)));
  const payments = useAppStore(useShallow((state) => state.payments.filter((row) => row.gameId === id)));
  const teams = useAppStore(useShallow((state) => state.teams.filter((row) => row.gameId === id)));
  const booking = useAppStore((state) => state.gameBookingRequests.filter((row) => row.gameId === id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0]);
  const field = useAppStore((state) => state.fields.find((row) => row.id === game?.fieldId));
  const establishment = useAppStore((state) => state.establishments.find((row) => row.id === field?.establishmentId));
  const tabs = useAppStore(useShallow((state) => state.serviceTabs.filter((row) => row.gameId === id && row.status !== 'cancelled')));
  const isAdmin = useAppStore((state) => game ? state.isAdmin(currentPlayerId, game.peladaId) : false);
  if (!game) return <Screen><Text style={styles.empty}>Jogo não encontrado.</Text></Screen>;

  const confirmed = attendances.filter((row) => row.status === 'confirmed');
  const checked = confirmed.filter((row) => row.checkedIn).length;
  const paid = payments.filter((row) => row.status === 'paid').length;
  const myAttendance = attendances.find((row) => row.playerId === currentPlayerId);
  const bookingOk = !booking || booking.status === 'accepted';
  const steps = [
    { icon: 'calendar', title: 'Campo', detail: bookingOk ? `${field?.name ?? 'Local definido'} confirmado` : 'Aguardando resposta do campo', done: bookingOk, route: `/jogo/${game.id}` },
    { icon: 'people', title: 'Chamada', detail: `${confirmed.length}/${game.maxPlayers} confirmados`, done: confirmed.length >= Math.min(game.playersPerTeam * 2, game.maxPlayers), route: `/jogo/${game.id}` },
    { icon: 'wallet', title: 'Pagamentos', detail: `${paid}/${confirmed.length} cotas quitadas`, done: paid >= confirmed.length && confirmed.length > 0, route: `/jogo/${game.id}` },
    { icon: 'qr-code', title: 'Check-in', detail: `${checked}/${confirmed.length} presentes`, done: checked >= confirmed.length && confirmed.length > 0, route: isAdmin ? `/jogo/${game.id}/checkin` : `/checkin/${game.id}` },
    { icon: 'shuffle', title: 'Times', detail: teams.length ? `${teams.length} times prontos` : 'Sorteio ainda não realizado', done: teams.length >= 2, route: `/jogo/${game.id}/sorteio` },
    { icon: 'stopwatch', title: 'Partida', detail: game.status === 'finished' ? 'Encerrada' : game.status === 'in_progress' ? 'Em andamento' : 'Aguardando início', done: game.status === 'finished', route: teams.length ? `/jogo/${game.id}/cronometro` : `/jogo/${game.id}` },
  ] as const;

  return (
    <Screen contentStyle={styles.screen}>
      <Button label="← Voltar" variant="ghost" onPress={() => router.back()} style={styles.back} />
      <View><Text style={styles.eyebrow}>CENTRAL DO DIA DO JOGO</Text><Text style={styles.title}>{formatGameDateLong(game.scheduledAt)}</Text><Text style={styles.subtitle}>{field?.name ?? 'Local a definir'} · {game.durationMinutes} min</Text></View>
      <View style={styles.metrics}><Metric value={`${confirmed.length}`} label="confirmados" color={colors.secondary} /><Metric value={`${checked}`} label="presentes" color={colors.primary} /><Metric value={`${paid}`} label="pagos" color={colors.gold} /></View>
      <View style={styles.timeline}>{steps.map((step, index) => <Pressable key={step.title} style={styles.step} onPress={() => router.push(step.route as never)}><View style={[styles.stepIcon, step.done && styles.stepDone]}><Ionicons name={step.done ? 'checkmark' : step.icon} size={18} color={step.done ? colors.bg : colors.textMuted} /></View><View style={{ flex: 1 }}><Text style={styles.stepTitle}>{step.title}</Text><Text style={styles.stepDetail}>{step.detail}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textFaint} />{index < steps.length - 1 && <View style={[styles.line, step.done && styles.lineDone]} />}</Pressable>)}</View>

      <Card style={styles.actions}><Text style={styles.sectionTitle}>Agora</Text>{myAttendance?.status === 'confirmed' && <Button label={myAttendance.checkedIn ? 'Meu check-in confirmado' : 'Abrir meu ingresso QR'} variant={myAttendance.checkedIn ? 'secondary' : 'primary'} disabled={myAttendance.checkedIn} onPress={() => router.push(`/checkin/${game.id}`)} />}{isAdmin && <Button label="Validar entrada dos jogadores" variant="outline" onPress={() => router.push(`/jogo/${game.id}/checkin`)} />}{establishment && <Button label={tabs.length ? `Abrir comanda (${tabs.length})` : 'Abrir comanda na lanchonete'} variant="secondary" onPress={() => router.push({ pathname: '/operacao/comandas', params: { establishmentId: establishment.id } })} />}</Card>
      <View style={styles.note}><Ionicons name="cloud-done-outline" size={18} color={colors.primary} /><Text style={styles.noteText}>Cada ação crítica gera auditoria e entra na fila offline para sincronização.</Text></View>
    </Screen>
  );
}

function Metric({ value, label, color }: { value: string; label: string; color: string }) { return <View style={styles.metric}><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  screen: { gap: spacing.lg }, back: { alignSelf: 'flex-start', paddingHorizontal: 0 }, eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, title: { color: colors.text, fontSize: 25, fontWeight: '900', marginTop: 3 }, subtitle: { color: colors.textMuted, marginTop: spacing.xs }, metrics: { flexDirection: 'row', gap: spacing.sm }, metric: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' }, metricValue: { fontSize: 24, fontWeight: '900' }, metricLabel: { color: colors.textMuted, fontSize: 10 }, timeline: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing.md }, step: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, position: 'relative' }, stepIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.cardBorder, zIndex: 2 }, stepDone: { backgroundColor: colors.primary, borderColor: colors.primary }, line: { position: 'absolute', left: 16, top: 49, width: 2, height: 30, backgroundColor: colors.cardBorder }, lineDone: { backgroundColor: colors.primary }, stepTitle: { color: colors.text, fontWeight: '800' }, stepDetail: { color: colors.textMuted, fontSize: 11, marginTop: 2 }, actions: { gap: spacing.sm }, sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 15 }, note: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: radius.md, padding: spacing.md }, noteText: { color: colors.textMuted, fontSize: 11, flex: 1 }, empty: { color: colors.textMuted, textAlign: 'center' },
});
