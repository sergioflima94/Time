import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing } from '@/constants/theme';
import { formatDateTime, formatMoney } from '@/lib/establishmentOperations';
import { useAppStore } from '@/store/useAppStore';

export default function ClassDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useAppStore((s) => s.classSessions.find((row) => row.id === id));
  const program = useAppStore((s) => s.classPrograms.find((row) => row.id === session?.programId));
  const coach = useAppStore((s) => s.coaches.find((row) => row.id === program?.coachId));
  const players = useAppStore((s) => s.players);
  const enrollments = useAppStore(useShallow((s) => s.classEnrollments.filter((row) => row.sessionId === id)));
  const attendances = useAppStore(useShallow((s) => s.classAttendances.filter((row) => row.sessionId === id)));
  const enrollInClass = useAppStore((s) => s.enrollInClass);
  const setClassEnrollmentPayment = useAppStore((s) => s.setClassEnrollmentPayment);
  const cancelClassEnrollment = useAppStore((s) => s.cancelClassEnrollment);
  const cancelClassSession = useAppStore((s) => s.cancelClassSession);
  const completeClassSession = useAppStore((s) => s.completeClassSession);
  const recordClassAttendance = useAppStore((s) => s.recordClassAttendance);

  if (!session || !program) return <Screen><Text style={styles.empty}>Aula não encontrada.</Text></Screen>;
  const coachPlayer = players.find((player) => player.id === coach?.playerId);
  const confirmed = enrollments.filter((row) => row.status === 'confirmed');
  const waitlisted = enrollments.filter((row) => row.status === 'waitlisted').sort((a, b) => (a.waitlistPosition ?? 99) - (b.waitlistPosition ?? 99));
  const availablePlayers = players.filter((player) => !player.isGuest && !enrollments.some((row) => row.playerId === player.id && row.status !== 'cancelled')).slice(0, 8);

  return (
    <Screen>
      <View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable><View style={{ flex: 1 }}><Text style={styles.title}>{program.name}</Text><Text style={styles.meta}>{formatDateTime(session.startsAt)} · {program.durationMinutes} min</Text></View><Badge label={session.status === 'full' ? 'Lotada' : session.status === 'cancelled' ? 'Cancelada' : 'Aberta'} color={session.status === 'cancelled' ? colors.danger : session.status === 'full' ? colors.warning : colors.success} /></View>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Resumo</Text>
        <Text style={styles.line}>Professor: <Text style={styles.strong}>{coachPlayer?.name ?? 'Não informado'}</Text></Text>
        <Text style={styles.line}>Formato: <Text style={styles.strong}>{program.format === 'group' ? `Turma, ${program.capacity} vagas` : 'Particular'}</Text></Text>
        <Text style={styles.line}>Cobrança: <Text style={styles.strong}>{formatMoney(program.price)} · {program.billingType === 'monthly' ? 'mensal' : program.billingType === 'package' ? 'pacote' : 'avulsa'}</Text></Text>
      </Card>

      {session.status !== 'cancelled' && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Adicionar aluno</Text>
          <View style={styles.chips}>{availablePlayers.map((player) => <Pressable key={player.id} style={styles.chip} onPress={() => enrollInClass(session.id, player.id)}><Ionicons name="add" size={14} color={colors.primary} /><Text style={styles.chipText}>{player.name}</Text></Pressable>)}</View>
          <Text style={styles.meta}>Quando não houver vaga, o aluno entra automaticamente na lista de espera.</Text>
        </Card>
      )}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Confirmados ({confirmed.length}/{program.capacity})</Text>
        {confirmed.map((enrollment) => {
          const player = players.find((row) => row.id === enrollment.playerId);
          const attendance = attendances.find((row) => row.playerId === enrollment.playerId);
          return (
            <View key={enrollment.id} style={styles.student}>
              <View style={{ flex: 1 }}><Text style={styles.studentName}>{player?.name}</Text><Text style={styles.meta}>{enrollment.isTrial ? 'Experimental' : enrollment.paymentStatus === 'paid' ? 'Pago' : enrollment.paymentStatus === 'waived' ? 'Cortesia' : 'Pagamento pendente'}{attendance ? ` · ${attendance.status === 'present' ? 'presente' : attendance.status === 'absent' ? 'faltou' : 'falta justificada'}` : ''}</Text></View>
              <View style={styles.actions}>
                {enrollment.paymentStatus === 'pending' && <Pressable onPress={() => setClassEnrollmentPayment(enrollment.id, 'pix')}><Ionicons name="cash-outline" size={20} color={colors.success} /></Pressable>}
                <Pressable onPress={() => recordClassAttendance(session.id, enrollment.playerId, 'present')}><Ionicons name="checkmark-circle-outline" size={21} color={colors.primary} /></Pressable>
                <Pressable onPress={() => recordClassAttendance(session.id, enrollment.playerId, 'absent')}><Ionicons name="close-circle-outline" size={21} color={colors.warning} /></Pressable>
                <Pressable onPress={() => recordClassAttendance(session.id, enrollment.playerId, 'excused', 'Reposição liberada por 30 dias')}><Ionicons name="refresh-circle-outline" size={21} color={colors.secondary} /></Pressable>
                <Pressable onPress={() => cancelClassEnrollment(enrollment.id)}><Ionicons name="trash-outline" size={19} color={colors.danger} /></Pressable>
              </View>
            </View>
          );
        })}
        {confirmed.length === 0 && <Text style={styles.empty}>Nenhum aluno confirmado.</Text>}
      </Card>

      {waitlisted.length > 0 && <Card style={styles.section}><Text style={styles.sectionTitle}>Lista de espera</Text>{waitlisted.map((enrollment) => <View key={enrollment.id} style={styles.student}><Text style={styles.studentName}>{enrollment.waitlistPosition}. {players.find((row) => row.id === enrollment.playerId)?.name}</Text><Button label="Remover" variant="ghost" small onPress={() => cancelClassEnrollment(enrollment.id)} /></View>)}</Card>}

      {!['cancelled', 'completed'].includes(session.status) && <><Button label="Concluir aula e salvar chamada" onPress={() => completeClassSession(session.id)} /><Button label="Cancelar aula" variant="danger" style={{ marginTop: spacing.sm }} onPress={() => Alert.alert('Cancelar esta aula?', 'Pagamentos confirmados serão marcados como reembolsados.', [{ text: 'Voltar' }, { text: 'Cancelar aula', style: 'destructive', onPress: () => cancelClassSession(session.id, 'Cancelada pelo estabelecimento') }])} /></>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }, title: { color: colors.text, fontSize: 21, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 12 }, section: { marginBottom: spacing.lg }, sectionTitle: { color: colors.text, fontWeight: '800', marginBottom: spacing.md }, line: { color: colors.textMuted, marginBottom: spacing.sm }, strong: { color: colors.text, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }, chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 16 }, chipText: { color: colors.text },
  student: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingVertical: spacing.md }, studentName: { color: colors.text, fontWeight: '700' }, actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }, empty: { color: colors.textMuted, textAlign: 'center', marginVertical: spacing.md },
});
