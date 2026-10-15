import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { useLances } from '@/hooks/useLances';
import { colors, spacing } from '@/constants/theme';
import { Button } from './ui/Button';
import { LanceCard } from './LanceCard';
/** Same canonical posts in the community feed and the game, not duplicated activities. */
export function LancesFeed() {
  const feed = useLances();
  return <View style={{ gap: spacing.sm, marginVertical: spacing.md }}>
    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Lances da comunidade</Text>
    <Text style={{ color: colors.textMuted, fontSize: 13 }}>Gols, assistências e jogadas dos times. Publicações respeitam a visibilidade escolhida.</Text>
    {!!feed.error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{feed.error}</Text>}
    {feed.data.items.slice(0, 3).map(lance => <LanceCard key={lance.id} lance={lance} />)}
    {!feed.busy && !feed.error && !feed.data.items.length && <Text style={{ color: colors.textMuted }}>Ainda não há lances publicados para você. Envie um vídeo pela página de uma partida.</Text>}
    <Button label="Explorar lances" small variant="outline" onPress={() => router.push('/lances')} />
  </View>;
}
