import * as Linking from 'expo-linking';
import { router, useNavigationContainerRef } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { colors, spacing } from '@/constants/theme';
import { parseAuthCallback } from '@/lib/authCallback';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

export default function AuthCallbackScreen() {
  const nativeUrl = Linking.useLinkingURL();
  const [webUrl, setWebUrl] = useState(() => typeof window !== 'undefined' ? window.location.href : null);
  const url = Platform.OS === 'web' ? webUrl : nativeUrl;
  const navigation = useNavigationContainerRef();
  const [navigationReady, setNavigationReady] = useState(() => navigation.isReady());
  const handled = useRef<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const receive = () => setWebUrl(window.location.href);
    window.addEventListener('hashchange', receive);
    window.addEventListener('popstate', receive);
    return () => {
      window.removeEventListener('hashchange', receive);
      window.removeEventListener('popstate', receive);
    };
  }, []);
  useEffect(() => {
    const unsubscribe = navigation.addListener('ready', () => setNavigationReady(true));
    if (navigation.isReady()) setNavigationReady(true);
    return unsubscribe;
  }, [navigation]);
  useEffect(() => {
    if (!url || !navigationReady || handled.current === url) return;
    const callback = parseAuthCallback(url);
    // Ignora a URL limpa pelo próprio processamento, mas aceita outro link
    // recebido na mesma tela (ex.: confirmação nova depois de uma expirada).
    if (callback.kind === 'empty' && handled.current) return;
    handled.current = url;
    setError('');
    // Remove credenciais da barra/histórico do navegador antes de navegar.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/auth/callback');
      // O Router também guarda o fragmento no estado da navegação; sem limpar
      // seus parâmetros, ele pode recolocar tokens no histórico após renderizar.
      router.setParams({ '#': '', ...Object.fromEntries([...new URL(url).searchParams.keys()].map((key) => [key, ''])) });
    }
    if (callback.kind === 'error') { setError(callback.message); return; }
    if (!supabase || callback.kind === 'empty') {
      setError('Nenhuma confirmação válida neste link. Se já confirmou seu e-mail, entre com sua senha.'); return;
    }
    const client = supabase;
    void (async () => {
      try {
        const result = callback.kind === 'tokens'
          ? await client.auth.setSession({ access_token: callback.accessToken, refresh_token: callback.refreshToken })
          : await client.auth.exchangeCodeForSession(callback.code);
        if (result.error || !result.data.session) throw new Error('confirmation_failed');
        useAuthStore.getState().setSession(result.data.session);
        router.replace('/(tabs)');
      } catch {
        setError('Não foi possível abrir sua sessão. Tente entrar com sua senha ou solicite outra confirmação.');
      }
    })();
  }, [url, navigationReady]);
  return <View style={styles.screen}>
    {!error && <ActivityIndicator color={colors.primaryDark} size="large" />}
    <Text style={styles.title}>{error ? 'Vamos concluir sua entrada' : 'Confirmando seu e-mail…'}</Text>
    {!!error && <>
      <Text style={styles.text}>{error}</Text>
      <Button label="Entrar com minha senha" onPress={() => router.replace('/(auth)/login')} />
      <Button label="Solicitar outra confirmação" variant="outline" onPress={() => router.replace('/(auth)/confirmar-email')} />
    </>}
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  text: { color: colors.textMuted, lineHeight: 22 },
});
