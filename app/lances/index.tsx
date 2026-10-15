import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { LanceCard } from '@/components/LanceCard';
import { useLances } from '@/hooks/useLances';
import { chooseLanceVideo, uploadLance } from '@/lib/lances';
import { colors, spacing } from '@/constants/theme';

export default function LancesScreen() {
  const params = useLocalSearchParams<{ gameId?: string; teamId?: string }>();
  const gameId = typeof params.gameId === 'string' ? params.gameId : undefined, teamId = typeof params.teamId === 'string' ? params.teamId : undefined;
  const [cursor, setCursor] = useState<{ before: string; beforeId: string }>();
  const feed = useLances({ gameId, teamId, ...cursor }), lock = useRef(false);
  useEffect(() => { setCursor(undefined); setVideo(null); setTitle(''); }, [gameId, teamId]);
  const [title, setTitle] = useState(''), [video, setVideo] = useState<Awaited<ReturnType<typeof chooseLanceVideo>>>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function choose() { setBusy(true); setMessage(''); try { setVideo(await chooseLanceVideo()); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); } }
  async function send() {
    if (!gameId || !video || lock.current) return;
    lock.current = true;
    setBusy(true); setMessage('Enviando vídeo. Aguarde a confirmação…');
    try { const id = await uploadLance(gameId, title.trim(), video); setVideo(null); setTitle(''); router.push({ pathname: '/lances/[id]', params: { id } }); }
    catch (e) { setMessage((e as Error).message); } finally { lock.current = false; setBusy(false); void feed.refresh(); }
  }
  return <Screen contentStyle={{ gap: spacing.md }}>
    <Button small variant="ghost" label="Voltar" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/amigos')} />
    <Text style={{ color: colors.text, fontSize: 23, fontWeight: '800' }}>Lances</Text>
    <Text style={{ color: colors.textMuted }}>A jogada acaba. A resenha continua. Vídeos de até 90 segundos e 60 MB, em MP4.</Text>
    {!!gameId && <Card style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.text, fontWeight: '800' }}>Enviar um lance desta partida</Text>
      <TextField label="Título do lance" value={title} onChangeText={setTitle} maxLength={100} placeholder="Aquele gol de primeira" />
      <Button variant="outline" label="Escolher vídeo da galeria" disabled={busy} onPress={() => void choose()} />
      {!!video && <Text style={{ color: colors.textMuted }}>{video.name} · {Math.ceil(video.seconds)}s · {(video.bytes.byteLength / 1048576).toFixed(1)} MB</Text>}
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>O envio cria um rascunho privado. Você escolhe as marcações e a publicação depois.</Text>
      <Button label="Enviar como rascunho" loading={busy} disabled={!video || title.trim().length < 3 || !!feed.error || !feed.data.me} onPress={() => void send()} />
    </Card>}
    <Card style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.text, fontWeight: '800' }}>Replay da câmera</Text>
      <Text style={{ color: colors.textMuted }}>A integração com câmeras ainda não está conectada. Por enquanto, envie um vídeo já gravado. Nenhum botão captura os últimos 30 segundos nesta versão.</Text>
    </Card>
    {!!(message || feed.error) && <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>{message || feed.error}</Text>}
    <Button small variant="outline" label="Atualizar lances" loading={feed.busy} onPress={() => void feed.refresh()} />
    {feed.data.items.slice(0, 20).map(lance => <LanceCard key={lance.id} lance={lance} />)}
    {feed.data.items.length > 20 && <Button label="Ver lances mais antigos" variant="outline" onPress={() => { const last = feed.data.items[19]; setCursor({ before: last.createdAt, beforeId: last.id }); }} />}
    {!!cursor && <Button label="Voltar aos mais recentes" variant="ghost" onPress={() => setCursor(undefined)} />}
    {!feed.busy && !feed.error && !feed.data.items.length && <Text style={{ color: colors.textMuted }}>Nenhum lance por aqui ainda.</Text>}
    {!gameId && !teamId && <View><Text style={{ color: colors.textMuted, fontSize: 12 }}>Para enviar, abra Times → seu time → uma partida → Lances.</Text></View>}
  </Screen>;
}
