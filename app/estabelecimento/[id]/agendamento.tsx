import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { SPORTS } from '@/constants/sports';
import { WEEKDAY_LABELS } from '@/lib/format';
import { useAppStore } from '@/store/useAppStore';
import type { FieldBookingRecurrence } from '@/types';

export default function EstablishmentBookingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const establishmentId = id!;
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const establishment = useAppStore((s) => s.establishments.find((e) => e.id === establishmentId));
  const fields = useAppStore(useShallow((s) => s.fields.filter((f) => f.establishmentId === establishmentId)));
  const bookings = useAppStore(useShallow((s) => s.fieldBookings.filter((b) => b.establishmentId === establishmentId)));
  const peladas = useAppStore((s) => s.peladas);
  const addFieldBooking = useAppStore((s) => s.addFieldBooking);
  const removeFieldBooking = useAppStore((s) => s.removeFieldBooking);

  const [open, setOpen] = useState(false);
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? '');
  const [teamMode, setTeamMode] = useState<'pelada' | 'avulso'>('avulso');
  const [peladaId, setPeladaId] = useState(peladas[0]?.id ?? '');
  const [teamName, setTeamName] = useState('');
  const [recurrence, setRecurrence] = useState<FieldBookingRecurrence>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(6);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fieldOf = (fid: string) => fields.find((f) => f.id === fid);
  const sportOf = (sportId: string) => SPORTS.find((s) => s.id === sportId) ?? SPORTS[0];

  function handleAdd() {
    const finalFieldId = fieldId || fields[0]?.id;
    if (!finalFieldId) return;
    const finalTeamName = teamMode === 'pelada' ? peladas.find((p) => p.id === peladaId)?.name ?? '' : teamName.trim();
    if (!finalTeamName) return;
    if (recurrence === 'single' && !date.trim()) return;

    const result = addFieldBooking(establishmentId, currentPlayerId, {
      fieldId: finalFieldId,
      peladaId: teamMode === 'pelada' ? peladaId : null,
      teamName: finalTeamName,
      recurrence,
      dayOfWeek: recurrence === 'weekly' ? dayOfWeek : null,
      date: recurrence === 'single' ? date.trim() : null,
      time,
      durationMinutes: Number(durationMinutes) || 60,
      notes: notes.trim() || null,
    });

    if (result.conflicts.length > 0) {
      const c = result.conflicts[0];
      setError(`Conflito de horário: "${c.teamName}" já está reservado nesse campo e horário.`);
      return;
    }
    setError(null);
    setTeamName('');
    setNotes('');
    setOpen(false);
  }

  if (establishment && establishment.ownerPlayerId !== currentPlayerId) {
    return (
      <Screen>
        <Text style={styles.hint}>Você não é dono deste estabelecimento.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.push(`/estabelecimento/${establishmentId}`)} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>📅 Agendamento</Text>
      </View>
      {establishment && <Text style={styles.subtitle}>{establishment.name}</Text>}

      <Card style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Reservas</Text>
          <Pressable onPress={() => setOpen((v) => !v)}>
            <Ionicons name={open ? 'close' : 'add-circle'} size={22} color={colors.special} />
          </Pressable>
        </View>
        <Text style={styles.hint}>
          Reserve um campo pra um time — cadastrado (de uma pelada) ou avulso — de uma vez só ou fixo toda semana.
        </Text>

        {bookings.map((b) => {
          const field = fieldOf(b.fieldId);
          const fieldSport = field ? sportOf(field.sportId) : null;
          return (
            <View key={b.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>
                  {fieldSport?.icon} {b.teamName}
                  {!b.peladaId && ' (avulso)'}
                </Text>
                <Text style={styles.hint}>
                  {field?.name ?? '?'} ·{' '}
                  {b.recurrence === 'weekly' ? `Fixo · ${WEEKDAY_LABELS[b.dayOfWeek ?? 0]}` : b.date} · {b.time} (
                  {b.durationMinutes} min)
                </Text>
                {b.notes && <Text style={styles.hint}>{b.notes}</Text>}
              </View>
              <Pressable onPress={() => removeFieldBooking(b.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>
          );
        })}
        {bookings.length === 0 && !open && <Text style={styles.hint}>Nenhum agendamento ainda.</Text>}

        {fields.length === 0 && open && (
          <Text style={styles.hint}>Cadastre um campo em "Campos" antes de agendar.</Text>
        )}

        {open && fields.length > 0 && (
          <View style={styles.form}>
            <Text style={styles.hint}>Campo</Text>
            <View style={styles.sportsGrid}>
              {fields.map((f) => {
                const active = fieldId === f.id;
                const sport = sportOf(f.sportId);
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => setFieldId(f.id)}
                    style={[styles.sportChip, active && { borderColor: sport.color, backgroundColor: `${sport.color}26` }]}
                  >
                    <Text style={styles.sportChipIcon}>{sport.icon}</Text>
                    <Text style={[styles.sportChipText, active && { color: sport.color }]}>{f.name}</Text>
                  </Pressable>
                );
              })}
            </View>

            <SegmentedControl<'pelada' | 'avulso'>
              label="Time"
              options={[
                { value: 'avulso', label: 'Avulso' },
                { value: 'pelada', label: 'Cadastrado (pelada)' },
              ]}
              value={teamMode}
              onChange={setTeamMode}
            />
            {teamMode === 'avulso' ? (
              <TextField label="Nome do time" value={teamName} onChangeText={setTeamName} placeholder="Galera da rua" />
            ) : (
              <View style={styles.sportsGrid}>
                {peladas.map((p) => {
                  const active = peladaId === p.id;
                  const sport = sportOf(p.sportId);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setPeladaId(p.id)}
                      style={[styles.sportChip, active && { borderColor: sport.color, backgroundColor: `${sport.color}26` }]}
                    >
                      <Text style={styles.sportChipIcon}>{sport.icon}</Text>
                      <Text style={[styles.sportChipText, active && { color: sport.color }]}>{p.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <SegmentedControl<FieldBookingRecurrence>
              label="Recorrência"
              options={[
                { value: 'weekly', label: 'Fixo (toda semana)' },
                { value: 'single', label: 'Só uma vez' },
              ]}
              value={recurrence}
              onChange={setRecurrence}
            />

            {recurrence === 'weekly' ? (
              <>
                <Text style={styles.hint}>Dia da semana</Text>
                <View style={styles.sportsGrid}>
                  {WEEKDAY_LABELS.map((label, idx) => {
                    const active = dayOfWeek === idx;
                    return (
                      <Pressable
                        key={label}
                        onPress={() => setDayOfWeek(idx)}
                        style={[styles.sportChip, active && { borderColor: colors.special, backgroundColor: 'rgba(124,58,237,0.15)' }]}
                      >
                        <Text style={[styles.sportChipText, active && { color: colors.special }]}>{label.slice(0, 3)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : (
              <TextField label="Data" value={date} onChangeText={setDate} placeholder="2026-09-25" />
            )}

            <View style={styles.row3}>
              <View style={styles.thirdInput}>
                <TextField label="Horário" value={time} onChangeText={setTime} placeholder="19:00" />
              </View>
              <View style={styles.thirdInput}>
                <TextField label="Duração (min)" value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="number-pad" />
              </View>
            </View>
            <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} placeholder="Mensalista, já pago" />

            {error && <Text style={styles.errorText}>{error}</Text>}

            <Button
              label="Reservar"
              onPress={handleAdd}
              disabled={(teamMode === 'avulso' && !teamName.trim()) || (recurrence === 'single' && !date.trim())}
            />
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
    marginBottom: spacing.lg,
    marginLeft: 34,
  },
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    marginTop: spacing.xs,
  },
  rowName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  sportsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  sportChipIcon: {
    fontSize: 15,
  },
  sportChipText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  form: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: spacing.sm,
  },
  row3: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  thirdInput: {
    flex: 1,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
  },
});
