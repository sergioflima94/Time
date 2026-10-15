import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';
import { useAuthStore } from '@/store/useAuthStore';

const groups = [
  { title: 'SEU ESPORTE', items: [
    { label: 'Início', path: '/', icon: 'home-outline' },
    { label: 'Amigos', path: '/amigos', icon: 'people-outline' },
    { label: 'Times', path: '/times', icon: 'shirt-outline' },
    { label: 'Lances', path: '/lances', icon: 'videocam-outline' },
  ] },
  { title: 'EXPLORE', items: [
    { label: 'Campos e quadras', path: '/campos', icon: 'location-outline' },
    { label: 'Horários e desafios', path: '/bora', icon: 'calendar-outline' },
    { label: 'Aulas', path: '/aulas', icon: 'school-outline' },
    { label: 'Loja', path: '/loja', icon: 'bag-outline' },
  ] },
  { title: 'GESTÃO E CONTA', items: [
    { label: 'Administrar times', path: '/admin', icon: 'settings-outline' },
    { label: 'Meus acessos nos campos', path: '/operacao', icon: 'business-outline' },
    { label: 'Minhas faturas', path: '/faturas', icon: 'document-text-outline' },
    { label: 'Meu perfil', path: '/perfil', icon: 'person-circle-outline' },
  ] },
] as const;
export function DesktopNavigation() {
  const loggedIn = useAuthStore(s => s.isLoggedIn), pathname = usePathname();
  if (!loggedIn) return null;
  return <View style={styles.rail}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    {groups.map(group => <View key={group.title} style={styles.group}>
      <Text style={styles.caption}>{group.title}</Text>
      {group.items.map(item => {
        const selected = item.path === '/' ? pathname === '/' : pathname === item.path || pathname.startsWith(item.path + '/');
        return <Pressable key={item.path} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected }}
          onPress={() => router.push(item.path)} style={({ pressed }) => [styles.item, selected && styles.selected, pressed && styles.pressed]}>
          <Ionicons name={item.icon} size={19} color={selected ? colors.primaryDark : colors.textMuted} />
          <Text style={[styles.label, selected && { color: colors.primaryDark }]}>{item.label}</Text>
        </Pressable>;
      })}
    </View>)}
  </ScrollView></View>;
}
const styles=StyleSheet.create({
  rail: { width: 210, backgroundColor: colors.card, borderRightWidth: 1, borderRightColor: colors.cardBorder },
  content: { padding: 14, gap: 22 }, group: { gap: 4 },
  caption: { color: colors.textMuted, fontSize: 10, lineHeight: 16, letterSpacing: 1, fontWeight: '700', padding: 10 },
  item: { minHeight: 46, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  selected: { backgroundColor: colors.selection }, pressed: { backgroundColor: colors.cardPressed },
});
