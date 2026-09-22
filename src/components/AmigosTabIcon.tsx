import { Ionicons } from '@expo/vector-icons';
import { ColorValue, View } from 'react-native';

import { colors, radius } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';

/** Ícone da aba Amigos com uma bolinha vermelha quando há pedido de amizade pendente pra responder. */
export function AmigosTabIcon({ color, size }: { color: ColorValue; size: number }) {
  const pendingCount = useAppStore(
    (s) => s.friendships.filter((f) => f.status === 'pending' && f.addresseeId === s.currentPlayerId).length,
  );

  return (
    <View>
      <Ionicons name="people" color={color} size={size} />
      {pendingCount > 0 && <View style={{ position: 'absolute', top: -1, right: -1, width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.danger }} />}
    </View>
  );
}
