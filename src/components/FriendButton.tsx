import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from './ui/Button';
import { useFriendshipWith } from '@/hooks/useFriends';
import { useAppStore } from '@/store/useAppStore';
import { requestFriend, respondFriend } from '@/lib/friendDiscovery';
import { colors } from '@/constants/theme';
export function FriendButton({ playerId }: { playerId: string }) {
  const current = useAppStore(s => s.currentPlayerId);
  const guest = useAppStore(s => s.players.find(p => p.id === playerId)?.isGuest);
  const state = useFriendshipWith(playerId);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!current || current === playerId || guest) return null;
  async function send() { setBusy(true); setError(''); try { if (state.status === 'pending_received') await respondFriend(state.friendshipId, true); else await requestFriend(playerId); } catch(e) { setError(e instanceof Error ? e.message : 'Não foi possível enviar.'); } finally { setBusy(false); } }
  return <View style={{maxWidth:200}}>
    {state.status === 'friends' ? <Text style={{color:colors.primaryDark,fontSize:12}}>✓ Amigos</Text> : state.status === 'pending_sent' ? <Text style={{color:colors.textMuted,fontSize:12}}>Pedido enviado</Text> : <Button small variant="outline" label={state.status === 'pending_received' ? 'Aceitar amizade' : 'Chamar pra ser amigo'} loading={busy} onPress={() => void send()} />}
    {!!error && <Text accessibilityRole="alert" style={{color:colors.danger,fontSize:12}}>{error}</Text>}
  </View>;
}
