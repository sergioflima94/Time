import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing } from '@/constants/theme';
import { useAuthStore } from '@/store/useAuthStore';

export default function ConfirmarEmailScreen() {
  const pendingEmail = useAuthStore((s) => s.pendingEmail);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const [email, setEmail] = useState(pendingEmail ?? '');
  const [resendAt, setResendAt] = useState(() => pendingEmail ? Date.now() + 60000 : 0);
  const [now, setNow] = useState(Date.now);
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (isLoggedIn) return <Redirect href="/(tabs)" />;
  async function resend() {
    setNotice('');
    const ok = await useAuthStore.getState().resendConfirmation(email);
    if (ok) { setNotice('Se há um cadastro pendente para este e-mail, uma nova confirmação foi enviada. Confira também o spam.'); setNow(Date.now()); setResendAt(Date.now() + 60000); }
  }
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Ionicons name="mail-open-outline" size={48} color={colors.primaryDark} />
    <Text style={styles.title}>Confira seu e-mail</Text>
    <Text style={styles.text}>Falta confirmar seu endereço para liberar a entrada. Abra o e-mail do BoraJogo e toque no link de confirmação: ele volta para este aplicativo.</Text>
    <Text style={styles.text}>Confira também a pasta de spam. Se você já confirmou, entre com o mesmo e-mail e senha — não precisa criar outra conta.</Text>
    <Text style={styles.label}>E-mail do cadastro</Text>
    <TextInput accessibilityLabel="E-mail do cadastro" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="voce@email.com" placeholderTextColor={colors.textFaint} style={styles.input} />
    {!!error && <Text style={styles.error}>{error}</Text>}
    {!!notice && <Text style={styles.text} accessibilityLiveRegion="polite">{notice}</Text>}
    <Button label={remaining ? `Reenviar em ${remaining}s` : 'Reenviar confirmação'} loading={loading} disabled={remaining > 0 || !email.includes('@')} onPress={resend} variant="outline" />
    <Button label="Já confirmei — entrar" onPress={() => {
      useAuthStore.setState({ pendingEmail: email.trim() || null, error: null });
      router.replace('/(auth)/login');
    }} />
    <Text style={styles.hint}>O reenvio depende do limite de e-mails do Supabase. A confirmação continua obrigatória; nenhum acesso é liberado apenas por cadastrar.</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.lg, flexGrow: 1, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  text: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  label: { color: colors.text, fontWeight: '700' },
  input: { color: colors.text, backgroundColor: colors.card, borderColor: colors.cardBorder, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  error: { color: colors.danger, lineHeight: 20 },
  hint: { color: colors.textFaint, fontSize: 12, lineHeight: 18 },
});
