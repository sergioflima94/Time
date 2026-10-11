import { Redirect, Stack } from 'expo-router';

import { colors } from '@/constants/theme';
import { useAuthStore } from '@/store/useAuthStore';

export default function AuthLayout() {
  const authReady = useAuthStore(s => s.authReady);
  const isLoggedIn = useAuthStore(s => s.isLoggedIn);
  if (authReady && isLoggedIn) return <Redirect href="/(tabs)" />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="cadastro" />
      <Stack.Screen name="confirmar-email" />
    </Stack>
  );
}
