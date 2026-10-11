import { supabase } from './supabase';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { applyFriendCache } from './supabaseSync';
import { phoneKey, type ContactIdentifier } from './friendDiscoveryRules';
import { conversationUuid } from './conversationRules';
import type { Friendship, Player } from '@/types';
import type { Json } from '@/types/supabase.generated';
export interface FoundFriend { id: string; name: string; nickname: string | null; avatarUrl: string | null; favoriteSports: string[]; preferredPosition: Player['preferredPosition']; friendship: Friendship | null; distanceKm?: number }
export interface DiscoveryPreferences { byPhone: boolean; byEmail: boolean; nearby: boolean; locationFresh: boolean }
export interface ContactMatch { index: number; player: FoundFriend }
const prefs = new Map<string, DiscoveryPreferences>();
const invitations = new Map<string, string>();
function remember(rows: FoundFriend[]) {
  const state = useAppStore.getState();
  const players = [...state.players], friendships = [...state.friendships];
  for (const row of rows) {
    const i = players.findIndex(p => p.id === row.id);
    const publicData = { id: row.id, name: row.name, nickname: row.nickname, avatarUrl: row.avatarUrl, favoriteSports: row.favoriteSports, preferredPosition: row.preferredPosition };
    if (i >= 0) players[i] = { ...players[i], ...publicData };
    else players.push({ ...publicData, authUserId: null, phone: null, cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: new Date().toISOString() });
    if (row.friendship) { const j = friendships.findIndex(f => f.id === row.friendship!.id); if (j >= 0) friendships[j] = row.friendship; else friendships.push(row.friendship); }
  }
  applyFriendCache({ players, friendships });
}
async function rpc<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) return demo(action, data) as T;
  const actor = useAuthStore.getState().authUserId;
  const { data: result, error } = await supabase.rpc('friend_discovery', { p_action: action, p_data: data as Json });
  if (actor !== useAuthStore.getState().authUserId) throw new Error('A conta mudou. Repita a operação.');
  if (error) throw new Error(error.message.includes('AMIGOS:') ? error.message.split('AMIGOS:')[1] : 'Não foi possível concluir. Verifique a conexão e tente novamente.');
  return result as T;
}
export async function discoveryPreferences() { return rpc<DiscoveryPreferences>('preferences'); }
export async function configureDiscovery(data: Record<string, unknown>) { return rpc<DiscoveryPreferences>('configure', data); }
export async function searchFriends(query: string) {
  const result = await rpc<(FoundFriend | ContactMatch)[]>('search', { query });
  const rows = result.map(r => 'player' in r ? r.player : r); remember(rows); return rows;
}
export async function matchContacts(list: ContactIdentifier[]) { const result = await rpc<ContactMatch[]>('match', { identifiers: list }); remember(result.map(r => r.player)); return result; }
export async function nearbyFriends(radiusKm: number) { const result = await rpc<FoundFriend[]>('nearby', { radiusKm }); remember(result); return result; }
export async function requestFriend(playerId: string) { const row = await rpc<FoundFriend>('request', { playerId }); remember([row]); }
export async function respondFriend(friendshipId: string, accept: boolean) { const row = await rpc<FoundFriend>('respond', { friendshipId, accept }); remember([row]); }
export async function createFriendInvite() { return rpc<{ token: string; expiresAt: string }>('invite_create'); }
export async function previewFriendInvite(token: string) { return rpc<FoundFriend>('invite_preview', { token }); }
export async function claimFriendInvite(token: string) { const row = await rpc<FoundFriend>('invite_claim', { token }); remember([row]); return row; }
function demo(action: string, data: Record<string, unknown>): unknown {
  const state = useAppStore.getState(), me = state.currentPlayerId;
  const config = prefs.get(me) || { byPhone: false, byEmail: false, nearby: false, locationFresh: false };
  const row = (p: Player): FoundFriend => ({ id: p.id, name: p.name, nickname: p.nickname, avatarUrl: p.avatarUrl, favoriteSports: p.favoriteSports, preferredPosition: p.preferredPosition, friendship: useAppStore.getState().friendships.find(f => (f.requesterId === me && f.addresseeId === p.id) || (f.addresseeId === me && f.requesterId === p.id)) || null });
  if (action === 'preferences') return config;
  if (action === 'configure') { const next = { ...config, ...data, locationFresh: !!data.nearby } as DiscoveryPreferences; prefs.set(me, next); return next; }
  const players = state.players.filter(p => p.id !== me && !p.isGuest);
  if (action === 'search') { const q = String(data.query).trim().toLowerCase(); if (q.length < 3) throw new Error('Informe pelo menos 3 caracteres.'); return players.filter(p => (q.includes('@') ? q === `${p.id}@demo.marcoujogou.invalid` : /^[+0-9() .-]+$/.test(q) ? phoneKey(p.phone || '') === phoneKey(q) : `${p.name} ${p.nickname}`.toLowerCase().includes(q))).slice(0, 20).map(row); }
  if (action === 'match') return (data.identifiers as ContactIdentifier[]).flatMap((key, index) => players.filter(p => key.kind === 'phone' ? phoneKey(p.phone || '') === phoneKey(key.value) : key.value === `${p.id}@demo.marcoujogou.invalid`).map(p => ({ index, player: row(p) })));
  if (action === 'nearby') { if (!config.nearby) throw new Error('Ative aparecer por perto.'); return []; }
  if (action === 'request') { state.sendFriendRequest(me, String(data.playerId)); return row(players.find(p => p.id === data.playerId)!); }
  if (action === 'respond') { const f = state.friendships.find(f => f.id === data.friendshipId)!; if (f.addresseeId !== me) throw new Error('Pedido indisponível.'); state.respondFriendRequest(f.id, !!data.accept); return row(players.find(p => p.id === f.requesterId)!); }
  if (action === 'invite_create') { const token = conversationUuid().replace(/-/g, '') + conversationUuid().replace(/-/g, ''); invitations.set(token, me); return { token, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }; }
  if (action === 'invite_preview' || action === 'invite_claim') { const p = players.find(p => p.id === invitations.get(String(data.token))); if (!p) throw new Error('Convite indisponível.'); if (action === 'invite_claim') state.sendFriendRequest(me, p.id); return row(p); }
  throw new Error('Ação inválida.');
}
