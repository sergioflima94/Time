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
import { colors, spacing } from '@/constants/theme';
import { SPORTS } from '@/constants/sports';
import { formatChampionshipStatus } from '@/lib/championship';
import { useAppStore } from '@/store/useAppStore';
import type { ChampionshipFormat } from '@/types';

export default function EstablishmentChampionshipsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const establishmentId = id!;
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const establishment = useAppStore((s) => s.establishments.find((e) => e.id === establishmentId));
  const fields = useAppStore(useShallow((s) => s.fields.filter((f) => f.establishmentId === establishmentId)));
  const championships = useAppStore(useShallow((s) => s.championships.filter((c) => c.establishmentId === establishmentId)));
  const createChampionship = useAppStore((s) => s.createChampionship);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sportId, setSportId] = useState('futebol');
  const [format, setFormat] = useState<ChampionshipFormat>('round_robin');
  const [maxTeams, setMaxTeams] = useState('8');
  const [entryFee, setEntryFee] = useState('');
  const [matchMinutes, setMatchMinutes] = useState('10');

  function handleCreate() {
    if (!name.trim()) return;
    const matchingField = fields.find((f) => f.sportId === sportId) ?? fields[0];
    const championship = createChampionship({ establishmentId, organizerPeladaId: null }, currentPlayerId, {
      name: name.trim(),
      sportId,
      format,
      fieldId: matchingField?.id ?? null,
      maxTeams: maxTeams.trim() ? Number(maxTeams) : null,
      entryFee: entryFee.trim() ? Number(entryFee.replace(',', '.')) : null,
      matchMinutes: Number(matchMinutes) || 10,
    });
    setName('');
    setEntryFee('');
    setOpen(false);
    router.push(`/campeonato/${championship.id}`);
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
        <Text style={styles.headerTitle}>🏆 Campeonatos</Text>
      </View>
      {establishment && <Text style={styles.subtitle}>{establishment.name}</Text>}

      <Card style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Campeonatos</Text>
          <Pressable onPress={() => setOpen((v) => !v)}>
            <Ionicons name={open ? 'close' : 'add-circle'} size={22} color={colors.special} />
          </Pressable>
        </View>

        {championships.map((c) => {
          const sport = SPORTS.find((s) => s.id === c.sportId) ?? SPORTS[0];
          return (
            <Pressable key={c.id} style={styles.row} onPress={() => router.push(`/campeonato/${c.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>
                  {sport.icon} {c.name}
                </Text>
                <Text style={styles.hint}>
                  {sport.label} · {c.format === 'round_robin' ? 'Pontos corridos' : 'Mata-mata'}
                </Text>
              </View>
              <Badge label={formatChampionshipStatus(c.status)} color={c.status === 'registration' ? colors.secondary : colors.primary} />
            </Pressable>
          );
        })}
        {championships.length === 0 && !open && <Text style={styles.hint}>Nenhum campeonato criado ainda.</Text>}

        {open && (
          <View style={styles.form}>
            <TextField label="Nome do campeonato" value={name} onChangeText={setName} placeholder="Copa Arena Society Central" />
            <Text style={styles.hint}>Esporte</Text>
            <View style={styles.sportsGrid}>
              {SPORTS.map((sport) => {
                const active = sportId === sport.id;
                return (
                  <Pressable
                    key={sport.id}
                    onPress={() => setSportId(sport.id)}
                    style={[styles.sportChip, active && { borderColor: sport.color, backgroundColor: `${sport.color}26` }]}
                  >
                    <Text style={styles.sportChipIcon}>{sport.icon}</Text>
                    <Text style={[styles.sportChipText, active && { color: sport.color }]}>{sport.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <SegmentedControl<ChampionshipFormat>
              label="Formato"
              options={[
                { value: 'round_robin', label: 'Pontos corridos' },
                { value: 'knockout', label: 'Mata-mata' },
              ]}
              value={format}
              onChange={setFormat}
            />
            <View style={styles.row3}>
              <View style={styles.thirdInput}>
                <TextField label="Máx. times" value={maxTeams} onChangeText={setMaxTeams} keyboardType="number-pad" />
              </View>
              <View style={styles.thirdInput}>
                <TextField label="Duração (min)" value={matchMinutes} onChangeText={setMatchMinutes} keyboardType="number-pad" />
              </View>
              <View style={styles.thirdInput}>
                <TextField label="Taxa (R$)" value={entryFee} onChangeText={setEntryFee} keyboardType="decimal-pad" />
              </View>
            </View>
            <Button label="Criar campeonato" onPress={handleCreate} disabled={!name.trim()} />
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
});
