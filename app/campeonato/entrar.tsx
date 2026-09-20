import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { colors, radius, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';

export default function EntrarCampeonatoScreen() {
  const championships = useAppStore((s) => s.championships);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleContinue() {
    if (!code.trim()) return;
    const normalized = code.trim().toUpperCase();
    const championship = championships.find((c) => c.registrationCode.toUpperCase() === normalized);
    if (!championship) {
      setError('Código não encontrado. Confira com o dono do campo.');
      return;
    }
    router.replace(`/campeonato/${championship.id}/inscrever-time`);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="trophy" size={48} color={colors.gold} />
        </View>
        <Text style={styles.title}>Entrar num campeonato</Text>
        <Text style={styles.subtitle}>Cole ou digite o código que o dono do campo te passou.</Text>

        <TextInput
          value={code}
          onChangeText={(v) => { setCode(v); setError(null); }}
          placeholder="Ex: COPA-ARENA"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="characters"
          style={styles.input}
        />
        {error && <Text style={styles.error}>{error}</Text>}

        <Button label="Continuar" onPress={handleContinue} disabled={!code.trim()} style={{ marginTop: spacing.lg }} />
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
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 1,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
