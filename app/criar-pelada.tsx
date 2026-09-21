import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { colors, radius, spacing } from '@/constants/theme';
import { SPORTS } from '@/constants/sports';
import { useAppStore } from '@/store/useAppStore';

export default function CriarPeladaScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const createPelada = useAppStore((s) => s.createPelada);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sportId, setSportId] = useState('futebol');

  function handleCreate() {
    if (!name.trim()) return;
    createPelada(currentPlayerId, {
      name: name.trim(),
      description: description.trim() || null,
      sportId,
      footballVariant: 'society',
    });
    router.replace('/(tabs)');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="add-circle" size={48} color={colors.primary} />
        </View>
        <Text style={styles.title}>Criar uma pelada nova</Text>
        <Text style={styles.subtitle}>
          Você vira admin dela na hora — pode ser dono de quantas peladas quiser, além das que já participa.
        </Text>

        <Text style={styles.label}>Nome do grupo</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ex: Pelada dos Amigos - Quintas"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />

        <Text style={styles.label}>Descrição (opcional)</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Ex: Society toda quinta às 20h"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />

        <Text style={styles.label}>Esporte</Text>
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

        <Button label="Criar pelada" onPress={handleCreate} disabled={!name.trim()} style={{ marginTop: spacing.lg }} />
        <Button label="Voltar" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.sm }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 15,
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
    borderRadius: radius.md,
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
});
