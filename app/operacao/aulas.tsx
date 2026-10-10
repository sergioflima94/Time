import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { useSports, getSport } from '@/constants/sports';
import { colors, spacing } from '@/constants/theme';
import { formatDateTime, formatMoney } from '@/lib/establishmentOperations';
import { useAppStore } from '@/store/useAppStore';
import type { ClassBillingType, ClassFormat } from '@/types';

export default function ClassesManagementScreen() {
  const SPORTS = useSports();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const { establishmentId } = useLocalSearchParams<{ establishmentId?: string }>();
  const establishment = useAppStore((s) => s.establishments.find((e) => e.id === establishmentId && e.ownerPlayerId === currentPlayerId) ?? s.establishments.find((e) => e.ownerPlayerId === currentPlayerId));
  const fields = useAppStore(useShallow((s) => s.fields.filter((field) => field.establishmentId === establishment?.id)));
  const coaches = useAppStore(useShallow((s) => s.coaches.filter((coach) => coach.establishmentId === establishment?.id && coach.active)));
  const players = useAppStore((s) => s.players);
  const programs = useAppStore(useShallow((s) => s.classPrograms.filter((program) => program.establishmentId === establishment?.id)));
  const sessions = useAppStore((s) => s.classSessions);
  const enrollments = useAppStore((s) => s.classEnrollments);
  const addCoach = useAppStore((s) => s.addCoach);
  const createClassProgram = useAppStore((s) => s.createClassProgram);
  const createClassSession = useAppStore((s) => s.createClassSession);
  const [showProgram, setShowProgram] = useState(false);
  const [name, setName] = useState('');
  const [sportId, setSportId] = useState('futebol');
  const [format, setFormat] = useState<ClassFormat>('group');
  const [billingType, setBillingType] = useState<ClassBillingType>('monthly');
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? '');
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? '');
  const [level, setLevel] = useState('Iniciante');
  const [capacity, setCapacity] = useState('10');
  const [duration, setDuration] = useState('60');
  const [price, setPrice] = useState('');
  const [sessionProgramId, setSessionProgramId] = useState(programs[0]?.id ?? '');
  const [startsAt, setStartsAt] = useState('');
  const [message, setMessage] = useState('');

  function ensureCoach() {
    if (coachId) return coachId;
    if (!establishment) return '';
    return addCoach(establishment.id, currentPlayerId, [sportId], 'Professor do estabelecimento').id;
  }

  function handleProgram() {
    if (!establishment || !name.trim() || !fieldId) return;
    const selectedCoach = ensureCoach();
    const program = createClassProgram(establishment.id, { name, sportId, format, coachId: selectedCoach, fieldId, level, capacity: Number(capacity) || 10, durationMinutes: Number(duration) || 60, price: Number(price.replace(',', '.')) || 0, billingType });
    setSessionProgramId(program.id); setName(''); setPrice(''); setShowProgram(false); setMessage('Programa criado. Agora publique o primeiro horário.');
  }

  function handleSession() {
    if (!sessionProgramId || !startsAt.trim()) return;
    const normalized = startsAt.includes('T') ? startsAt : startsAt.replace(' ', 'T');
    const session = createClassSession(sessionProgramId, normalized);
    setMessage(session ? 'Horário publicado sem conflito.' : 'Não foi possível publicar: data inválida ou o campo já está ocupado.');
    if (session) setStartsAt('');
  }

  return (
    <Screen>
      <View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable><View style={{ flex: 1 }}><Text style={styles.title}>Aulas esportivas</Text><Text style={styles.meta}>Turmas, particulares, agenda e alunos</Text></View><Pressable onPress={() => setShowProgram((value) => !value)}><Ionicons name={showProgram ? 'close' : 'add-circle'} size={28} color={colors.primary} /></Pressable></View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {showProgram && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Novo programa</Text>
          <TextField label="Nome" value={name} onChangeText={setName} placeholder="Escolinha de vôlei" />
          <Text style={styles.label}>Esporte</Text><View style={styles.chips}>{SPORTS.map((sport) => <Pressable key={sport.id} onPress={() => { setSportId(sport.id); const matching = fields.find((field) => field.sportId === sport.id); if (matching) setFieldId(matching.id); }} style={[styles.chip, sportId === sport.id && { borderColor: sport.color }]}><Text style={[styles.chipText, sportId === sport.id && { color: sport.color }]}>{sport.icon} {sport.label}</Text></Pressable>)}</View>
          <SegmentedControl<ClassFormat> label="Formato" value={format} onChange={setFormat} options={[{ value: 'group', label: 'Turma' }, { value: 'private', label: 'Particular' }]} />
          <Text style={styles.label}>Campo</Text><View style={styles.chips}>{fields.filter((field) => field.sportId === sportId).map((field) => <Pressable key={field.id} onPress={() => setFieldId(field.id)} style={[styles.chip, fieldId === field.id && styles.chipActive]}><Text style={[styles.chipText, fieldId === field.id && styles.chipTextActive]}>{field.name}</Text></Pressable>)}</View>
          {coaches.length > 0 && <><Text style={styles.label}>Professor</Text><View style={styles.chips}>{coaches.map((coach) => <Pressable key={coach.id} onPress={() => setCoachId(coach.id)} style={[styles.chip, coachId === coach.id && styles.chipActive]}><Text style={[styles.chipText, coachId === coach.id && styles.chipTextActive]}>{players.find((player) => player.id === coach.playerId)?.name}</Text></Pressable>)}</View></>}
          <TextField label="Nível" value={level} onChangeText={setLevel} />
          <View style={styles.inline}><View style={{ flex: 1 }}><TextField label="Capacidade" value={format === 'private' ? '1' : capacity} onChangeText={setCapacity} editable={format === 'group'} keyboardType="number-pad" /></View><View style={{ flex: 1 }}><TextField label="Duração (min)" value={duration} onChangeText={setDuration} keyboardType="number-pad" /></View></View>
          <TextField label="Preço (R$)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
          <SegmentedControl<ClassBillingType> label="Cobrança" value={billingType} onChange={setBillingType} options={[{ value: 'drop_in', label: 'Avulsa' }, { value: 'package', label: 'Pacote' }, { value: 'monthly', label: 'Mensal' }]} />
          <Button label="Criar programa" onPress={handleProgram} disabled={!name.trim() || !fieldId} />
        </Card>
      )}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Publicar horário</Text>
        <Text style={styles.label}>Programa</Text><View style={styles.chips}>{programs.map((program) => <Pressable key={program.id} onPress={() => setSessionProgramId(program.id)} style={[styles.chip, sessionProgramId === program.id && styles.chipActive]}><Text style={[styles.chipText, sessionProgramId === program.id && styles.chipTextActive]}>{program.name}</Text></Pressable>)}</View>
        <TextField label="Início (AAAA-MM-DD HH:mm)" value={startsAt} onChangeText={setStartsAt} placeholder="2026-10-05 18:00" />
        <Button label="Verificar agenda e publicar" onPress={handleSession} disabled={!sessionProgramId || !startsAt.trim()} />
      </Card>

      {programs.map((program) => {
        const sport = getSport(program.sportId);
        const programSessions = sessions.filter((session) => session.programId === program.id).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        return (
          <Card key={program.id} style={styles.section}>
            <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.programName}>{sport.icon} {program.name}</Text><Text style={styles.meta}>{program.format === 'group' ? `Turma · até ${program.capacity}` : 'Particular'} · {formatMoney(program.price)} · {program.durationMinutes} min</Text></View><Badge label={program.active ? 'Ativo' : 'Pausado'} color={program.active ? sport.color : colors.textFaint} /></View>
            {programSessions.map((session) => { const count = enrollments.filter((row) => row.sessionId === session.id && row.status === 'confirmed').length; return <Pressable key={session.id} style={styles.sessionRow} onPress={() => router.push(`/operacao/aula/${session.id}`)}><View><Text style={styles.sessionDate}>{formatDateTime(session.startsAt)}</Text><Text style={styles.meta}>{count}/{program.capacity} confirmados</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>; })}
            {programSessions.length === 0 && <Text style={styles.meta}>Nenhum horário publicado.</Text>}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }, title: { color: colors.text, fontSize: 22, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 12 }, message: { color: colors.warning, marginBottom: spacing.md },
  section: { marginBottom: spacing.lg }, sectionTitle: { color: colors.text, fontWeight: '800', marginBottom: spacing.md }, label: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.xs }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }, chip: { borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 16 }, chipActive: { borderColor: colors.primary }, chipText: { color: colors.textMuted, fontSize: 12 }, chipTextActive: { color: colors.primary, fontWeight: '700' }, inline: { flexDirection: 'row', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, programName: { color: colors.text, fontWeight: '800', fontSize: 15 }, sessionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingVertical: spacing.md, marginTop: spacing.sm }, sessionDate: { color: colors.text, fontWeight: '700' },
});
