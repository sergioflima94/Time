import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { BrandLogo } from '@/components/BrandLogo';
import { colors } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Avatar } from './Avatar';

/** Shared visual identity; never selects a team or changes business state. */
export function AppBrandBar() {
  const loggedIn = useAuthStore(s => s.isLoggedIn);
  const player = useAppStore(s => s.players.find(p => p.id === s.currentPlayerId));
  return <View style={styles.bar}>
    <View style={styles.inner}>
      <BrandLogo compact />
      {loggedIn && <Pressable accessibilityRole="button" accessibilityLabel="Abrir meu perfil"
        onPress={() => router.push('/(tabs)/perfil')} style={styles.profile}>
        <Avatar name={player?.name || 'Jogador'} photoUrl={player?.avatarUrl} size={34} color="#566069" />
      </Pressable>}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  bar: { backgroundColor: colors.brand },
  inner: { width: '100%', minHeight: 64, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profile: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
});
