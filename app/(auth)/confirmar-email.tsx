import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { Button } from '@/components/ui/Button';
import { BrandLogo } from '@/components/BrandLogo';
import { colors, radius, spacing } from '@/constants/theme';
import { useAuthStore } from '@/store/useAuthStore';

export default function ConfirmarEmailScreen() {
  const pendingEmail = useAuthStore((s) => s.pendingEmail);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const [email, setEmail] = useState(pendingEmail ?? '');
  const [code, setCode] = useState('');
  const [link, setLink] = useState('');
  const [method, setMethod] = useState<'link' | 'code' | null>(null);
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
    if (loading || remaining > 0) return;
    setNotice('');
    const ok = await useAuthStore.getState().resendConfirmation(email);
    if (ok) { setCode(''); setLink(''); setNotice('Se há um cadastro pendente para este e-mail, uma nova confirmação foi enviada. Use somente o código ou link do e-mail mais recente. Confira também o spam.'); setNow(Date.now()); setResendAt(Date.now() + 60000); }
  }
  async function confirm() {
    if (loading) return;
    setNotice('');
    const auth = useAuthStore.getState();
    const ok = method === 'link' ? await auth.confirmEmailLink(link) : await auth.confirmEmailCode(email, code);
    if (ok) { setCode(''); setLink(''); } // Só libera a Home com sessão validada no servidor.
  }
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <BrandLogo compact />
    <Ionicons name="mail-open-outline" size={48} color={colors.primaryDark} />
    <Text style={styles.title}>Confira seu e-mail</Text>
    <Text style={styles.text}>Abra o e-mail mais recente do MarcouJogou e toque no botão de confirmação para voltar ao aplicativo.</Text>
    <Text style={styles.text}>Confira também a pasta de spam. Se você já confirmou, entre com o mesmo e-mail e senha — não precisa criar outra conta.</Text>
    <Text style={styles.label}>E-mail do cadastro</Text>
    <TextInput accessibilityLabel="E-mail do cadastro" value={email} onChangeText={(value) => { setEmail(value); setCode(''); setLink(''); setNotice(''); }} editable={!loading} autoCapitalize="none" keyboardType="email-address" placeholder="voce@email.com" placeholderTextColor={colors.textFaint} style={styles.input} />
    <Button label="O link não abriu? Confirmar no app" variant="ghost" disabled={loading} onPress={() => { setMethod(method === 'link' ? null : 'link'); useAuthStore.setState({ error: null }); }} />
    {method === 'link' && <>
      <Text style={styles.text}>No e-mail, pressione o botão de confirmação e escolha copiar o endereço do link. Cole abaixo, sem abrir o navegador. Não compartilhe esse link com outras pessoas.</Text>
      <TextInput accessibilityLabel="Link de confirmação" value={link} onChangeText={setLink} editable={!loading} autoCapitalize="none" autoCorrect={false} maxLength={4096} placeholder="Cole o endereço do botão do e-mail" placeholderTextColor={colors.textFaint} style={styles.input} />
    </>}
    <Button label="Meu e-mail tem um código" variant="ghost" disabled={loading} onPress={() => { setMethod(method === 'code' ? null : 'code'); useAuthStore.setState({ error: null }); }} />
    {method === 'code' && <>
      <Text style={styles.text}>Use esta opção somente se o e-mail recebido mostrar um código numérico.</Text>
      <TextInput accessibilityLabel="Código de confirmação" value={code} onChangeText={(value) => setCode(value.replace(/\s/g, ''))} editable={!loading} autoCapitalize="none" keyboardType="number-pad" autoComplete="one-time-code" maxLength={10} placeholder="Código recebido por e-mail" placeholderTextColor={colors.textFaint} style={styles.input} />
    </>}
    {!!error && <Text style={styles.error}>{error}</Text>}
    {!!notice && <Text style={styles.text} accessibilityLiveRegion="polite">{notice}</Text>}
    {method && <Button label="Confirmar e entrar" loading={loading} disabled={method === 'link' ? !link.trim() : !email.includes('@') || !/^\d{6,10}$/.test(code)} onPress={confirm} />}
    <Button label={remaining ? `Reenviar em ${remaining}s` : 'Reenviar confirmação'} loading={loading} disabled={remaining > 0 || !email.includes('@')} onPress={resend} variant="outline" />
    <Button label="Já confirmei — entrar" variant="ghost" disabled={loading} onPress={() => {
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
