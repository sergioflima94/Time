import { Redirect } from 'expo-router';

import { useAuthStore } from '@/store/useAuthStore';

export default function Index() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const authReady = useAuthStore((s) => s.authReady);
  if (!authReady) return null;
  return <Redirect href={isLoggedIn ? '/(tabs)' : '/(auth)/login'} />;
}
