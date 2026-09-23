import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

export default function EstabelecimentoLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]/index" />
      <Stack.Screen name="[id]/campos" />
      <Stack.Screen name="[id]/agendamento" />
      <Stack.Screen name="[id]/campeonatos" />
      <Stack.Screen name="[id]/financeiro" />
    </Stack>
  );
}
