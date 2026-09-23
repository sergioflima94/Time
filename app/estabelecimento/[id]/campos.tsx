import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { SPORTS } from '@/constants/sports';
import { useAppStore } from '@/store/useAppStore';

export default function EstablishmentFieldsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const establishmentId = id!;
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const establishment = useAppStore((s) => s.establishments.find((e) => e.id === establishmentId));
  const myFields = useAppStore(
    useShallow((s) => s.fields.filter((f) => f.establishmentId === establishmentId && f.peladaId === null)),
  );
  const linkedFields = useAppStore(
    useShallow((s) => s.fields.filter((f) => f.establishmentId === establishmentId && f.peladaId !== null)),
  );
  const addEstablishmentField = useAppStore((s) => s.addEstablishmentField);
  const removeEstablishmentField = useAppStore((s) => s.removeEstablishmentField);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [sportId, setSportId] = useState('futebol');

  function handleAdd() {
    if (!name.trim()) return;
    addEstablishmentField(establishmentId, currentPlayerId, { name: name.trim(), address: address.trim(), sportId });
    setName('');
    setAddress('');
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
        <Text style={styles.headerTitle}>⚽ Campos</Text>
      </View>
      {establishment && <Text style={styles.subtitle}>{establishment.name}</Text>}

      <Card style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Meus campos</Text>
          <Pressable onPress={() => setOpen((v) => !v)}>
            <Ionicons name={open ? 'close' : 'add-circle'} size={22} color={colors.special} />
          </Pressable>
        </View>
        <Text style={styles.hint}>Campos que você mesmo cadastra, um por esporte — não dependem de nenhuma pelada.</Text>

        {myFields.map((f) => {
          const sport = SPORTS.find((s) => s.id === f.sportId) ?? SPORTS[0];
          return (
            <View key={f.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>
                  {sport.icon} {f.name}
                </Text>
                <Text style={styles.hint}>
                  {sport.label}
                  {f.address ? ` · ${f.address}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => removeEstablishmentField(f.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>
          );
        })}
        {myFields.length === 0 && !open && <Text style={styles.hint}>Nenhum campo cadastrado ainda.</Text>}

        {open && (
          <View style={styles.form}>
            <TextField label="Nome do campo" value={name} onChangeText={setName} placeholder="Quadra 1 - Vôlei" />
            <TextField label="Endereço (opcional)" value={address} onChangeText={setAddress} placeholder="Rua Exemplo, 123" />
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
            <Button label="Adicionar campo" onPress={handleAdd} disabled={!name.trim()} />
          </View>
        )}
      </Card>

      {linkedFields.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Campos vinculados de peladas</Text>
          <Text style={styles.hint}>Campos que já pertencem a uma pelada e foram vinculados por um admin dela.</Text>
          {linkedFields.map((f) => {
            const sport = SPORTS.find((s) => s.id === f.sportId) ?? SPORTS[0];
            return (
              <View key={f.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>
                    {sport.icon} {f.name}
                  </Text>
                  <Text style={styles.hint}>{sport.label}{f.address ? ` · ${f.address}` : ''}</Text>
                </View>
              </View>
            );
          })}
        </Card>
      )}
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
});
