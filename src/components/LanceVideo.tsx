import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { lanceVideoUrl } from '@/lib/lances';
import { colors } from '@/constants/theme';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from './ui/Button';

function Player({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri); // No autoplay or feed-wide downloads.
  useFocusEffect(useCallback(() => () => { player.pause(); }, [player]));
  const [error, setError] = useState('');
  useEffect(() => { const sub = player.addListener('statusChange', e => { if (e.status === 'error') setError('Não foi possível reproduzir. Recarregue ou envie um MP4 compatível.'); }); return () => { sub.remove(); player.pause(); }; }, [player]);
  return <View style={{ gap: 8 }}><VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111416', borderRadius: 12 }} />{!!error && <Text style={{ color: colors.danger }}>{error}</Text>}</View>;
}
export function LanceVideo({ mediaKey }: { mediaKey: string }) {
  const actor = useAuthStore(s => s.authUserId), scope = `${actor}:${mediaKey}`;
  const [source, setSource] = useState<{ scope: string; url: string }>(), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; setSource(undefined); setError('');
    void lanceVideoUrl(mediaKey).then(url => { if (active) setSource({ scope, url }); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [mediaKey, scope, attempt]);
  return <View style={{ gap: 8 }}>
    {source?.scope === scope ? <Player key={source.url} uri={source.url} /> : <Text style={{ color: colors.textMuted }}>{error || 'Carregando vídeo privado…'}</Text>}
    <Button small variant="ghost" label="Recarregar vídeo" onPress={() => setAttempt(n => n + 1)} />
  </View>;
}
