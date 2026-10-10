import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radius, spacing } from '@/constants/theme';
import { isMockMode } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const authError = useAuthStore((s) => s.error);
  const [email, setEmail] = useState(() => useAuthStore.getState().pendingEmail ?? '');
  const [password, setPassword] = useState('');

  async function handleLogin() {
    const ok = await login(email, password);
    if (ok) router.replace('/(tabs)');
  }

  return (
    <View style={styles.container}>
      <View style={styles.logoWrap}>
        <Image source={require('../../assets/branding/borajogo-logo-v1.png')} style={styles.logo} contentFit="contain" />
        <Text style={styles.kicker}>SEU CLUBE COMEÇA AQUI</Text>
        <Text style={styles.subtitle}>Mais amigos, mais jogos e toda a organização do esporte amador em um só lugar.</Text>
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

        {authError && <Text style={styles.authError}>{authError}</Text>}
        <Button label="Entrar" loading={loading} disabled={!isMockMode && (!email.trim() || !password)} onPress={handleLogin} style={{ marginTop: spacing.lg }} />
        {!isMockMode && <Button label="Preciso confirmar meu e-mail" variant="ghost" onPress={() => {
          useAuthStore.setState({ pendingEmail: email.trim() || null, error: null });
          router.push('/(auth)/confirmar-email');
        }} />}

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Ainda não tem conta?</Text>
          <Link href="/(auth)/cadastro" asChild>
            <Text style={styles.footerLink}> Criar conta</Text>
          </Link>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logo: { width: 230, height: 150 },
  kicker: { color: colors.primaryDark, fontSize: 11, fontWeight: '900', letterSpacing: 1.8, marginTop: -spacing.md },
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
    backgroundColor: '#FFF3D8',
    borderWidth: 1,
    borderColor: '#EDCE8E',
    borderRadius: radius.lg,
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
    minHeight: 50,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
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
  authError: { color: colors.danger, fontSize: 12, marginTop: spacing.sm },
});
