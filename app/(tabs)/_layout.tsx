import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, useWindowDimensions } from 'react-native';

import { AmigosTabIcon } from '@/components/AmigosTabIcon';
import { colors } from '@/constants/theme';
import { useAuthStore } from '@/store/useAuthStore';

export default function TabsLayout() {
  const actor = useAuthStore(s => s.authUserId);
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  return (
    <Tabs
      key={actor ?? 'demo'}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', paddingBottom: 4 },
        tabBarItemStyle: { paddingTop: 5 },
        tabBarStyle: {
          display: desktop ? 'none' : 'flex',
          height: 66,
          backgroundColor: colors.card,
          borderTopColor: colors.cardBorder,
          borderTopWidth: 1,
          shadowColor: colors.shadow,
          shadowOpacity: 0,
          shadowRadius: 0,
          shadowOffset: { width: 0, height: -4 },
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="amigos"
        options={{
          title: 'Amigos',
          tabBarIcon: ({ color, size }) => <AmigosTabIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="times"
        options={{
          title: 'Times',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'shirt' : 'shirt-outline'} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'settings' : 'settings-outline'} color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
