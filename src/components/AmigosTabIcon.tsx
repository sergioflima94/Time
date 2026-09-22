import { Ionicons } from '@expo/vector-icons';
import { ColorValue, View } from 'react-native';

import { colors, radius } from '@/constants/theme';
import { useUnreadNotificationsCount } from '@/hooks/useNotifications';

/** Ícone da aba Amigos com uma bolinha vermelha quando há notificação não lida (pedido de amizade, curtida, comentário...). */
export function AmigosTabIcon({ color, size }: { color: ColorValue; size: number }) {
  const unreadCount = useUnreadNotificationsCount();

  return (
    <View>
      <Ionicons name="people" color={color} size={size} />
      {unreadCount > 0 && <View style={{ position: 'absolute', top: -1, right: -1, width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.danger }} />}
    </View>
  );
}
