import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { WEEKDAY_LABELS } from '@/lib/geo';
import { getCurrentLocation } from '@/lib/location';
import { useAppStore } from '@/store/useAppStore';
import type { AvailabilitySlot, Player } from '@/types';

interface FreeAgentSectionProps {
  player: Player;
}

export function FreeAgentSection({ player }: FreeAgentSectionProps) {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const setFreeAgentOptIn = useAppStore((s) => s.setFreeAgentOptIn);
  const setFreeAgentSettings = useAppStore((s) => s.setFreeAgentSettings);
  const updateMyLocation = useAppStore((s) => s.updateMyLocation);

  const [radiusDraft, setRadiusDraft] = useState(player.freeAgentRadiusKm ? String(player.freeAgentRadiusKm) : '10');
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set(player.freeAgentAvailability.map((s) => s.weekday)));
  const [startTime, setStartTime] = useState(player.freeAgentAvailability[0]?.startTime ?? '19:00');
  const [endTime, setEndTime] = useState(player.freeAgentAvailability[0]?.endTime ?? '23:00');
  const [locatingNow, setLocatingNow] = useState(false);
  const [locationError, setLocationError] = useState(false);

  function toggleWeekday(day: number) {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  function saveSettings() {
    const radiusKm = Math.max(1, Number(radiusDraft.replace(',', '.')) || 10);
    const availability: AvailabilitySlot[] = [...weekdays].map((weekday) => ({ weekday, startTime, endTime }));
    setFreeAgentSettings(currentPlayerId, { radiusKm, availability });
  }

  async function handleToggleOptIn(value: boolean) {
    if (value && !player.location) {
      setLocatingNow(true);
      setLocationError(false);
      const location = await getCurrentLocation();
      setLocatingNow(false);
      if (!location) {
        setLocationError(true);
        return;
      }
      updateMyLocation(currentPlayerId, location);
    }
    setFreeAgentOptIn(currentPlayerId, value);
    if (value) saveSettings();
  }

  async function handleUpdateLocation() {
    setLocatingNow(true);
    setLocationError(false);
    const location = await getCurrentLocation();
    setLocatingNow(false);
    if (!location) {
      setLocationError(true);
      return;
    }
    updateMyLocation(currentPlayerId, location);
  }

  return (
    <Card style={styles.section}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Jogador livre</Text>
          <Text style={styles.hint}>
            Apareça pra outras peladas perto de você chamarem quando faltar gente pra fechar o time.
          </Text>
        </View>
        {locatingNow ? (
          <ActivityIndicator color={colors.secondary} />
        ) : (
          <Switch
            value={player.freeAgentOptIn}
            onValueChange={handleToggleOptIn}
            trackColor={{ false: colors.cardBorder, true: colors.secondary }}
            thumbColor={colors.white}
          />
        )}
      </View>

      {locationError && (
        <Text style={styles.errorText}>
          Não consegui pegar sua localização. Verifique a permissão do app e tente de novo.
        </Text>
      )}

      {player.freeAgentOptIn && (
        <View style={styles.settings}>
          <View style={styles.locationRow}>
            <Ionicons name="location" size={14} color={colors.textMuted} />
            <Text style={styles.locationText}>
              {player.location ? `Localização salva · atualizada agora` : 'Sem localização salva ainda'}
            </Text>
            <Pressable onPress={handleUpdateLocation}>
              <Text style={styles.link}>Atualizar</Text>
            </Pressable>
          </View>

          <TextField
            label="Raio máximo que topa se deslocar (km)"
            value={radiusDraft}
            onChangeText={setRadiusDraft}
            onBlur={saveSettings}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Dias em que costuma estar livre</Text>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, day) => (
              <Pressable
                key={day}
                onPress={() => {
                  toggleWeekday(day);
                  setTimeout(saveSettings, 0);
                }}
                style={[styles.weekdayChip, weekdays.has(day) && styles.weekdayChipActive]}
              >
                <Text style={[styles.weekdayChipText, weekdays.has(day) && styles.weekdayChipTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.timeRow}>
            <TextField label="Das" value={startTime} onChangeText={setStartTime} onBlur={saveSettings} style={styles.timeInput} placeholder="19:00" />
            <TextField label="Até" value={endTime} onChangeText={setEndTime} onBlur={saveSettings} style={styles.timeInput} placeholder="23:00" />
          </View>
          <Button label="Salvar disponibilidade" small variant="secondary" onPress={saveSettings} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    marginTop: 2,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
  },
  settings: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
  },
  link: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: 6,
  },
  weekdayChip: {
    width: 40,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayChipActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  weekdayChipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  weekdayChipTextActive: {
    color: colors.white,
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timeInput: {
    width: 90,
  },
});
