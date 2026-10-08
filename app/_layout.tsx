import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';
import { useNotificationNavigation } from '@/hooks/useNotificationNavigation';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import { initializeAds } from '@/lib/ads';
import { useAuthStore } from '@/store/useAuthStore';

export default function RootLayout() {
  useNotificationNavigation();
  useSupabaseSync();
  const initializeAuth = useAuthStore((state) => state.initialize);
  useEffect(() => {
    initializeAds();
    initializeAuth();
  }, [initializeAuth]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="jogo/[id]" />
          <Stack.Screen name="time/[id]" />
          <Stack.Screen name="time/[id]/agendamento-automatico" />
          <Stack.Screen name="time/[id]/vaquinhas" />
          <Stack.Screen name="vaquinha/[id]" />
          <Stack.Screen name="desafio/[matchId]" />
          <Stack.Screen name="jogador/[id]" />
          <Stack.Screen name="notificacoes" />
          <Stack.Screen name="central" />
          <Stack.Screen name="recursos/[slug]" />
          <Stack.Screen name="operacao-pro" />
          <Stack.Screen name="pro/[slug]" />
          <Stack.Screen name="checkin/[gameId]" />
          <Stack.Screen name="convite/[code]" />
          <Stack.Screen name="entrar-pelada" options={{ presentation: 'modal' }} />
          <Stack.Screen name="criar-pelada" options={{ presentation: 'modal' }} />
          <Stack.Screen name="estabelecimento" />
          <Stack.Screen name="operacao" />
          <Stack.Screen name="aulas" />
          <Stack.Screen name="campeonato" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
