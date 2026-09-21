import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';
import { initializeAds } from '@/lib/ads';

export default function RootLayout() {
  useEffect(() => {
    initializeAds();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="jogo/[id]" />
          <Stack.Screen name="entrar-pelada" options={{ presentation: 'modal' }} />
          <Stack.Screen name="criar-pelada" options={{ presentation: 'modal' }} />
          <Stack.Screen name="estabelecimento" />
          <Stack.Screen name="campeonato" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
