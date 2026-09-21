import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radius, spacing } from '@/constants/theme';
import { isMockMode } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleLogin() {
    login();
    router.replace('/(tabs)');
  }

  return (
    <LinearGradient colors={[colors.pitchDark, colors.bg]} style={styles.container}>
      <View style={styles.logoWrap}>
        <View style={styles.logoCircle}>
          <Ionicons name="football" size={40} color={colors.bg} />
        </View>
        <Text style={styles.title}>Pelada</Text>
        <Text style={styles.subtitle}>Times, chamada e cronômetro pro seu esporte amador — futebol, vôlei e mais</Text>
      </View>

      {isMockMode && (
        <View style={styles.mockBanner}>
          <Ionicons name="information-circle" size={16} color={colors.warning} />
          <Text style={styles.mockBannerText}>
            Modo demonstração: dados de exemplo salvos no aparelho. Configure o Supabase (ver README) para dados reais.
          </Text>
        </View>
      )}

      <View style={styles.form}>
        <Text style={styles.label}>E-mail</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="voce@email.com"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <Text style={styles.label}>Senha</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          style={styles.input}
        />

        <Button label="Entrar" onPress={handleLogin} style={{ marginTop: spacing.lg }} />

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Ainda não tem conta?</Text>
          <Link href="/(auth)/cadastro" asChild>
            <Text style={styles.footerLink}> Criar conta</Text>
          </Link>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  mockBanner: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'flex-start',
  },
  mockBannerText: {
    color: colors.warning,
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  form: {
    gap: spacing.xs,
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
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  footerLink: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});
