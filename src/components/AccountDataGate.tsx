import type { PropsWithChildren } from 'react';
import { Text } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { colors } from '@/constants/theme';
import { isMockMode } from '@/lib/supabase';
import { startSupabaseSync } from '@/lib/supabaseSync';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useDataSyncStore } from '@/store/useDataSyncStore';

/** Keep the navigator mounted, but do not mount account screens with stale data. */
export function AccountDataGate({ children }: PropsWithChildren) {
  const ready = useAuthStore(s => s.authReady);
  const loggedIn = useAuthStore(s => s.isLoggedIn);
  const actor = useAuthStore(s => s.authUserId);
  const owner = useAppStore(s => s.cacheAuthUserId);
  const player = useAppStore(s => s.currentPlayerId);
  const error = useDataSyncStore(s => s.error);
  if (!isMockMode && (!ready || (loggedIn && (!actor || owner !== actor || !player)))) return <Screen>
    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Carregando seus dados</Text>
    <Text style={{ color: colors.textMuted, lineHeight: 20 }}>{error || 'Estamos buscando seu perfil e seus times. Dados de outra conta não serão exibidos.'}</Text>
    {error && actor && <Button label="Tentar carregar novamente" onPress={() => void startSupabaseSync({ authUserId: actor })} />}
  </Screen>;
  return <>{children}</>;
}
