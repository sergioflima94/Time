import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { getSport } from '@/constants/sports';
import { colors, spacing } from '@/constants/theme';
import { formatDateTime, formatMoney } from '@/lib/establishmentOperations';
import { useAppStore } from '@/store/useAppStore';

export default function AvailableClassesScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const programs = useAppStore((s) => s.classPrograms);
  const sessions = useAppStore((s) => s.classSessions);
  const enrollments = useAppStore((s) => s.classEnrollments);
  const establishments = useAppStore((s) => s.establishments);
  const enrollInClass = useAppStore((s) => s.enrollInClass);
  const setClassEnrollmentPayment = useAppStore((s) => s.setClassEnrollmentPayment);
  const cancelClassEnrollment = useAppStore((s) => s.cancelClassEnrollment);
  const activeSessions = sessions.filter((session) => !['cancelled', 'completed'].includes(session.status)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <Screen>
      <View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable><View><Text style={styles.title}>Aulas disponíveis</Text><Text style={styles.meta}>Turmas e horários particulares nos estabelecimentos</Text></View></View>
      {activeSessions.map((session) => {
        const program = programs.find((row) => row.id === session.programId);
        if (!program) return null;
        const sport = getSport(program.sportId);
        const establishment = establishments.find((row) => row.id === program.establishmentId);
        const mine = enrollments.find((row) => row.sessionId === session.id && row.playerId === currentPlayerId && row.status !== 'cancelled');
        const occupied = enrollments.filter((row) => row.sessionId === session.id && row.status === 'confirmed').length;
        return (
          <Card key={session.id} style={[styles.card, { borderLeftColor: sport.color }]}>
            <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.program}>{sport.icon} {program.name}</Text><Text style={styles.meta}>{establishment?.name} · {formatDateTime(session.startsAt)}</Text></View><Badge label={program.format === 'group' ? `${occupied}/${program.capacity}` : 'Particular'} color={sport.color} /></View>
            <Text style={styles.description}>{program.level} · {program.durationMinutes} min · {formatMoney(program.price)} {program.billingType === 'monthly' ? '/ mês' : program.billingType === 'package' ? '/ pacote' : '/ aula'}</Text>
            {!mine ? <Button label={occupied >= program.capacity ? 'Entrar na lista de espera' : 'Reservar vaga'} onPress={() => enrollInClass(session.id, currentPlayerId)} /> : <View style={styles.myBox}><Text style={styles.myText}>{mine.status === 'waitlisted' ? `Lista de espera · posição ${mine.waitlistPosition}` : mine.paymentStatus === 'paid' || mine.paymentStatus === 'waived' ? 'Vaga confirmada' : 'Vaga reservada · pagamento pendente'}</Text>{mine.status === 'confirmed' && mine.paymentStatus === 'pending' && <Button label="Pagar via Pix" small onPress={() => setClassEnrollmentPayment(mine.id, 'pix')} />}<Button label="Cancelar inscrição" variant="ghost" small onPress={() => cancelClassEnrollment(mine.id)} /></View>}
          </Card>
        );
      })}
      {activeSessions.length === 0 && <Text style={styles.empty}>Nenhuma aula disponível no momento.</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }, title: { color: colors.text, fontSize: 22, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 12 }, card: { marginBottom: spacing.md, borderLeftWidth: 4 }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, program: { color: colors.text, fontWeight: '800', fontSize: 16 }, description: { color: colors.textMuted, marginVertical: spacing.md }, myBox: { backgroundColor: colors.bgElevated, padding: spacing.md, borderRadius: 12, gap: spacing.sm }, myText: { color: colors.primary, fontWeight: '700' }, empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
});
