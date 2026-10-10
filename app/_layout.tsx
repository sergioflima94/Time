import { useEffect } from 'react';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/constants/theme';
import { useNotificationNavigation } from '@/hooks/useNotificationNavigation';
import { usePlatformAccessSync } from '@/hooks/usePlatformAccessSync';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import { initializeAds } from '@/lib/ads';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlatformStore } from '@/store/usePlatformStore';

export default function RootLayout() {
  useNotificationNavigation();
  useSupabaseSync();
  usePlatformAccessSync();
  const initializeAuth = useAuthStore((state) => state.initialize);
  useEffect(() => {
    initializeAds();
    initializeAuth();
    void usePlatformStore.getState().loadPublic();
  }, [initializeAuth]);

  return (
    <ThemeProvider
      value={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: colors.primaryDark,
          background: colors.bg,
          card: colors.card,
          text: colors.text,
          border: colors.cardBorder,
          notification: colors.social,
        },
      }}
    >
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
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
            <Stack.Screen name="plataforma" />
            <Stack.Screen name="descobrir" />
            <Stack.Screen name="bora" />
            <Stack.Screen name="campos" />
            <Stack.Screen name="comecar" />
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
    </ThemeProvider>
  );
}
