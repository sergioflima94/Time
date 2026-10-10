import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { BrandLogo } from '@/components/BrandLogo';
import { colors } from '@/constants/theme';
import { useAuthStore } from '@/store/useAuthStore';

export default function Index() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const authReady = useAuthStore((s) => s.authReady);
  if (!authReady) return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><BrandLogo /></View>;
  return <Redirect href={isLoggedIn ? '/(tabs)' : '/(auth)/login'} />;
}
