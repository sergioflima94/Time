import { Stack } from 'expo-router';

import { colors, liveColors } from '@/constants/theme';

export default function GameLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgElevated },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Jogo' }} />
      <Stack.Screen name="sorteio" options={{ title: 'Sortear times' }} />
      <Stack.Screen
        name="cronometro"
        options={{
          title: 'Cronômetro',
          headerStyle: { backgroundColor: liveColors.bg },
          headerTintColor: liveColors.text,
          contentStyle: { backgroundColor: liveColors.bg },
        }}
      />
      <Stack.Screen name="avaliar" options={{ title: 'Avaliar jogadores' }} />
      <Stack.Screen name="dia-do-jogo" options={{ title: 'Dia do jogo' }} />
      <Stack.Screen name="checkin" options={{ title: 'Check-in' }} />
      <Stack.Screen name="resumo" options={{ title: 'Resenha do jogo' }} />
    </Stack>
  );
}
