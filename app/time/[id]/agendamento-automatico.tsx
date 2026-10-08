import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { WEEKDAY_LABELS } from '@/lib/format';
import { recommendFields } from '@/lib/bookingAutomation';
import { useAppStore } from '@/store/useAppStore';

export default function AutoBookingSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pelada = useAppStore((state) => state.peladas.find((row) => row.id === id));
  const currentPlayer = useAppStore((state) => state.players.find((row) => row.id === state.currentPlayerId));
  const schedules = useAppStore((state) => state.schedules);
  const fields = useAppStore((state) => state.fields);
  const establishments = useAppStore((state) => state.establishments);
  const preferences = useAppStore((state) => state.scheduleFieldPreferences);
  const promotions = useAppStore((state) => state.fieldPromotions);
  const availabilities = useAppStore((state) => state.fieldAvailabilities);
  const updateAutomation = useAppStore((state) => state.updateScheduleBookingAutomation);
  const addPreference = useAppStore((state) => state.addScheduleFieldPreference);
  const movePreference = useAppStore((state) => state.moveScheduleFieldPreference);
  const removePreference = useAppStore((state) => state.removeScheduleFieldPreference);

  const peladaSchedules = schedules.filter((row) => row.peladaId === id);
  const [scheduleId, setScheduleId] = useState(peladaSchedules[0]?.id ?? '');
  const schedule = peladaSchedules.find((row) => row.id === scheduleId) ?? peladaSchedules[0];
  const [enabled, setEnabled] = useState(schedule?.autoBookingEnabled ?? false);
  const [minimum, setMinimum] = useState(String(schedule?.bookingMinimumPlayers ?? 10));
  const [responseMinutes, setResponseMinutes] = useState(String(schedule?.bookingResponseMinutes ?? 30));
  const [pollQuorumPercent, setPollQuorumPercent] = useState(String(schedule?.pollQuorumPercent ?? 50));
  const [pollReminderMinutes, setPollReminderMinutes] = useState(String(schedule?.pollReminderMinutes ?? 120));

  const ordered = useMemo(
    () => preferences.filter((row) => row.scheduleId === schedule?.id).sort((a, b) => a.priority - b.priority),
    [preferences, schedule?.id],
  );
  const compatibleFields = fields.filter((field) => field.sportId === pelada?.sportId && field.establishmentId);
  const recommendations = recommendFields(pelada?.sportId ?? '', compatibleFields, availabilities, currentPlayer?.location ?? null);
  const recommendationByField = new Map(recommendations.map((row) => [row.fieldId, row]));
  const availableToAdd = compatibleFields.filter((field) => !ordered.some((row) => row.fieldId === field.id)).sort((a, b) => (recommendationByField.get(b.id)?.score ?? 0) - (recommendationByField.get(a.id)?.score ?? 0));
  const activePromotions = promotions.filter((row) => row.active && row.sportId === pelada?.sportId);

  function chooseSchedule(nextId: string) {
    const next = peladaSchedules.find((row) => row.id === nextId);
    setScheduleId(nextId);
    setEnabled(next?.autoBookingEnabled ?? false);
    setMinimum(String(next?.bookingMinimumPlayers ?? 10));
    setResponseMinutes(String(next?.bookingResponseMinutes ?? 30));
    setPollQuorumPercent(String(next?.pollQuorumPercent ?? 50));
    setPollReminderMinutes(String(next?.pollReminderMinutes ?? 120));
  }

  function save() {
    if (!schedule) return;
    updateAutomation(schedule.id, {
      enabled,
      minimumPlayers: Number(minimum) || 2,
      responseMinutes: Number(responseMinutes) || 30,
      pollQuorumPercent: Number(pollQuorumPercent) || 50,
      pollReminderMinutes: Number(pollReminderMinutes) || 120,
    });
  }

  if (!pelada) return <Screen><Text style={styles.empty}>Time não encontrado.</Text></Screen>;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Agendamento automático</Text>
          <Text style={styles.subtitle}>{pelada.name}</Text>
        </View>
      </View>

      {peladaSchedules.length > 1 && (
        <View style={styles.chips}>
          {peladaSchedules.map((row) => (
            <Pressable key={row.id} onPress={() => chooseSchedule(row.id)} style={[styles.chip, row.id === schedule?.id && styles.chipActive]}>
              <Text style={[styles.chipText, row.id === schedule?.id && styles.chipTextActive]}>{WEEKDAY_LABELS[row.dayOfWeek ?? 0]} · {row.time}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!schedule ? (
        <Card><Text style={styles.empty}>Crie uma agenda no Admin antes de configurar a automação.</Text></Card>
      ) : (
        <>
          <Card style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Gatilho de confirmação</Text>
                <Text style={styles.hint}>Ao atingir o mínimo, o BoraJogo tenta os campos abaixo na ordem.</Text>
              </View>
              <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: colors.primary }} />
            </View>
            <View style={styles.formRow}>
              <View style={{ flex: 1 }}><TextField label="Mínimo de jogadores" value={minimum} onChangeText={setMinimum} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><TextField label="Resposta em até (min)" value={responseMinutes} onChangeText={setResponseMinutes} keyboardType="number-pad" /></View>
            </View>
            <View style={styles.formRow}>
              <View style={{ flex: 1 }}><TextField label="Quórum da enquete (%)" value={pollQuorumPercent} onChangeText={setPollQuorumPercent} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><TextField label="Lembrar após (min)" value={pollReminderMinutes} onChangeText={setPollReminderMinutes} keyboardType="number-pad" /></View>
            </View>
            <Button label="Salvar automação" onPress={save} />
          </Card>

          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Campos preferidos</Text>
            <Text style={styles.hint}>A ordem do time vem antes de qualquer anúncio patrocinado.</Text>
            {ordered.map((preference, index) => {
              const field = fields.find((row) => row.id === preference.fieldId);
              const establishment = establishments.find((row) => row.id === field?.establishmentId);
              const slots = availabilities.filter((row) => row.fieldId === field?.id && row.active);
              return (
                <View key={preference.id} style={styles.preference}>
                  <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldName}>{field?.name}</Text>
                    <Text style={styles.hint}>{establishment?.name} · {slots.length} janelas disponíveis</Text>
                    <Text style={styles.slotText}>{slots.slice(0, 2).map((slot) => `${WEEKDAY_LABELS[slot.dayOfWeek]} ${slot.startTime}–${slot.endTime}`).join(' · ')}</Text>
                  </View>
                  <View style={styles.controls}>
                    <Pressable disabled={index === 0} onPress={() => movePreference(preference.id, 'up')}><Ionicons name="chevron-up" size={19} color={index === 0 ? colors.textFaint : colors.text} /></Pressable>
                    <Pressable disabled={index === ordered.length - 1} onPress={() => movePreference(preference.id, 'down')}><Ionicons name="chevron-down" size={19} color={index === ordered.length - 1 ? colors.textFaint : colors.text} /></Pressable>
                    <Pressable onPress={() => removePreference(preference.id)}><Ionicons name="trash-outline" size={18} color={colors.danger} /></Pressable>
                  </View>
                </View>
              );
            })}
            {ordered.length === 0 && <Text style={styles.empty}>Nenhum campo preferido. Adicione pelo menos um.</Text>}
            {availableToAdd.length > 0 && <Text style={styles.smallLabel}>Adicionar campo</Text>}
            <View style={styles.chips}>
              {availableToAdd.map((field) => { const recommendation = recommendationByField.get(field.id); return <Pressable key={field.id} style={styles.recommendation} onPress={() => addPreference(schedule.id, field.id)}><View style={{ flex: 1 }}><Text style={styles.addChipText}>{field.name}</Text><Text style={styles.slotText}>{recommendation?.reasons.join(' · ')}</Text></View><Badge label={`${recommendation?.score ?? 0}/100`} color={colors.secondary} /><Ionicons name="add-circle" size={20} color={colors.primary} /></Pressable>; })}
            </View>
          </Card>

          <Card style={styles.card}>
            <View style={styles.rowBetween}><Text style={styles.sectionTitle}>Sugestões do BoraJogo</Text><Badge label="Monetização" color={colors.gold} textColor="#111827" /></View>
            <Text style={styles.hint}>Só aparecem depois dos seus preferidos e sempre identificadas como publicidade.</Text>
            {activePromotions.map((promotion) => {
              const field = fields.find((row) => row.id === promotion.fieldId);
              const alreadyAdded = ordered.some((row) => row.fieldId === promotion.fieldId);
              return (
                <View key={promotion.id} style={styles.promotion}>
                  <View style={{ flex: 1 }}><Text style={styles.fieldName}>{field?.name}</Text><Text style={styles.promoText}>{promotion.label}</Text><Text style={styles.hint}>{recommendationByField.get(promotion.fieldId)?.reasons.join(' · ')}</Text></View>
                  {alreadyAdded ? <Badge label="Na sua lista" color={colors.primary} /> : <Button label="Adicionar" small variant="outline" onPress={() => addPreference(schedule.id, promotion.fieldId, 'sponsored')} />}
                </View>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 13 },
  card: { gap: spacing.md, marginBottom: spacing.lg },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  empty: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: spacing.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999 },
  chipActive: { borderColor: colors.primary, backgroundColor: 'rgba(34,197,94,0.12)' },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: colors.primary },
  preference: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: spacing.md },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#07110A', fontWeight: '900' },
  fieldName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  slotText: { color: colors.primary, fontSize: 11, marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  smallLabel: { color: colors.textFaint, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  addChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  addChipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  recommendation: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 12, padding: spacing.md },
  promotion: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: 12, backgroundColor: 'rgba(212,175,55,0.09)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.28)' },
  promoText: { color: colors.gold, fontSize: 11, marginTop: 2 },
});
