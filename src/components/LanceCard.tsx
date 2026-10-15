import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { colors, spacing } from '@/constants/theme';
import type { Lance } from '@/types/lances';

export function LanceCard({ lance }: { lance: Lance }) {
  return <Card style={s.card}>
    <View style={s.row}><Ionicons name="play-circle-outline" size={30} color={colors.primaryDark} /><View style={{ flex: 1 }}>
      <Text style={s.title}>{lance.title}</Text><Text style={s.meta}>{lance.teamName} · {Math.ceil(lance.durationSeconds)}s</Text>
    </View></View>
    <Text style={s.meta}>{lance.hidden ? 'Oculto pela moderação' : !lance.publishedAt ? 'Rascunho privado' : lance.visibility === 'team' ? 'Somente o time' : 'Publicado para todos'} · {lance.source === 'camera' ? 'Câmera' : 'Vídeo enviado'}</Text>
    {!!lance.scorerName && <Text style={s.text}>{lance.kind === 'point' ? 'Ponto' : 'Gol'}: {lance.scorerName}{!lance.scorerConfirmed ? ' · marcação pendente' : ''}</Text>}
    {!!lance.assistName && <Text style={s.text}>Assistência: {lance.assistName}{!lance.assistConfirmed ? ' · marcação pendente' : ''}</Text>}
    <Text style={s.meta}>{lance.likes} curtidas · {lance.commentCount} comentários</Text>
    <Button small variant="outline" label={lance.status === 'uploading' ? 'Conferir envio' : 'Ver lance'} onPress={() => router.push({ pathname: '/lances/[id]', params: { id: lance.id } })} />
  </Card>;
}
const s = StyleSheet.create({ card: { gap: spacing.sm }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, title: { color: colors.text, fontSize: 16, fontWeight: '800' }, text: { color: colors.text, fontSize: 13, lineHeight: 19 }, meta: { color: colors.textMuted, fontSize: 12, lineHeight: 18 } });
