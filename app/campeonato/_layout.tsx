import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

export default function CampeonatoLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="entrar" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[id]/index" />
      <Stack.Screen name="[id]/inscrever-time" />
      <Stack.Screen name="[id]/partida/[matchId]" />
    </Stack>
  );
}
