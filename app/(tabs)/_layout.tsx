import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { AmigosTabIcon } from '@/components/AmigosTabIcon';
import { colors } from '@/constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', paddingBottom: 4 },
        tabBarItemStyle: { paddingTop: 5 },
        tabBarStyle: {
          height: 68,
          backgroundColor: colors.card,
          borderTopColor: colors.cardBorder,
          borderTopWidth: 1,
          shadowColor: colors.shadow,
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
          elevation: 8,
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
