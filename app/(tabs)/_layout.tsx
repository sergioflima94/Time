import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { AmigosTabIcon } from '@/components/AmigosTabIcon';
import { colors } from '@/constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.cardBorder,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Agenda',
          tabBarActiveTintColor: colors.primary,
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="amigos"
        options={{
          title: 'Amigos',
          tabBarActiveTintColor: colors.secondary,
          tabBarIcon: ({ color, size }) => <AmigosTabIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="times"
        options={{
          title: 'Times',
          tabBarActiveTintColor: colors.warning,
          tabBarIcon: ({ color, size }) => <Ionicons name="shirt" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarActiveTintColor: colors.gold,
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          tabBarActiveTintColor: colors.special,
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
