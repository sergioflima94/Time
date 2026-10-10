import AsyncStorage from '@react-native-async-storage/async-storage';
import { isMockMode, supabase } from './supabase';
import { useAppStore } from '@/store/useAppStore';
import { usePlatformStore } from '@/store/usePlatformStore';

export interface OpenGame {
  gameId: string; teamName: string; sportId: string; fieldName: string; address: string | null;
  scheduledAt: string; durationMinutes: number; maxPlayers: number; fieldCost: number | null;
  confirmedCount: number; level: string; description: string; requestStatus: string | null;
}
export interface OpenGameAdminData {
  listing: { published: boolean; level: string; description: string } | null;
  requests: Array<{ id: string; playerId: string; name: string; status: string }>;
}
const demoListings = new Map<string, NonNullable<OpenGameAdminData['listing']>>();
const demoRequests = new Map<string, { gameId: string; id: string; playerId: string; name: string; status: string }>();

let demoHydrated: Promise<void> | null=null;
async function hydrateDemo(){if(!demoHydrated)demoHydrated=(async()=>{try{const raw=await AsyncStorage.getItem('borajogo-discovery-demo-v1');if(raw){const x=JSON.parse(raw);(x.listings??[]).forEach(([k,v]:[string,NonNullable<OpenGameAdminData['listing']>])=>demoListings.set(k,v));(x.requests??[]).forEach(([k,v]:[string,any])=>demoRequests.set(k,v));}}catch{/* Demo cache only */}})();await demoHydrated;}
async function saveDemo(){await AsyncStorage.setItem('borajogo-discovery-demo-v1',JSON.stringify({listings:[...demoListings],requests:[...demoRequests]}));}
export async function demoGamePublished(gameId:string){await hydrateDemo();return !!demoListings.get(gameId)?.published&&usePlatformStore.getState().settings.discoveryEnabled;}

function client() {
  if (!supabase) throw new Error('Backend indisponível.');
  return supabase;
}
async function rpc<T>(request: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return data as unknown as T;
}

function assertDemoAdmin(gameId: string) {
  const s = useAppStore.getState(); const game = s.games.find(g => g.id === gameId);
  if (!game || !s.isAdmin(s.currentPlayerId, game.peladaId)) throw new Error('Somente o administrador deste time.');
  return game;
}

export async function listOpenGames(sport: string, query: string): Promise<OpenGame[]> {
  if (!isMockMode) return rpc<OpenGame[]>(client().rpc('list_open_games', { p_sport: sport === 'all' ? undefined : sport, p_query: query }));
  await hydrateDemo();
  if (!usePlatformStore.getState().settings.discoveryEnabled) return [];
  const s = useAppStore.getState(); const q = query.trim().toLocaleLowerCase();
  return s.games.filter(g => demoListings.get(g.id)?.published && Date.parse(g.scheduledAt) > Date.now() && ['open','full'].includes(g.status)).flatMap(g => {
    const team = s.peladas.find(p => p.id === g.peladaId); const field = s.fields.find(f => f.id === g.fieldId); const listing = demoListings.get(g.id)!;
    if (!team || !field || sport !== 'all' && team.sportId !== sport || q && !`${team.name} ${field.name} ${field.address ?? ''}`.toLocaleLowerCase().includes(q)) return [];
    return [{ gameId: g.id, teamName: team.name, sportId: team.sportId, fieldName: field.name, address: field.address, scheduledAt: g.scheduledAt, durationMinutes: g.durationMinutes, maxPlayers: g.maxPlayers, fieldCost: g.fieldCost,
      confirmedCount: s.attendances.filter(a => a.gameId === g.id && a.status === 'confirmed').length, level: listing.level, description: listing.description, requestStatus: demoRequests.get(`${g.id}:${s.currentPlayerId}`)?.status ?? null }];
  }).sort((a,b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export async function publishOpenGame(gameId: string, published: boolean, level: string, description: string) {
  if (!isMockMode) return rpc<void>(client().rpc('publish_open_game', { p_game_id: gameId, p_published: published, p_level: level, p_description: description }));
  await hydrateDemo();
  const game = assertDemoAdmin(gameId);
  if (published && (Date.parse(game.scheduledAt) <= Date.now() || !['open','full'].includes(game.status))) throw new Error('Só jogos futuros com chamada aberta.');
  demoListings.set(gameId, { published, level, description }); await saveDemo();
}

export async function openGameAdminData(gameId: string): Promise<OpenGameAdminData> {
  if (!isMockMode) return rpc<OpenGameAdminData>(client().rpc('open_game_admin_data', { p_game_id: gameId }));
  await hydrateDemo(); assertDemoAdmin(gameId);
  return { listing: demoListings.get(gameId) ?? null, requests: [...demoRequests.values()].filter(r => r.gameId === gameId) };
}

export async function requestOpenGame(gameId: string): Promise<string> {
  if (!isMockMode) return rpc<string>(client().rpc('request_open_game', { p_game_id: gameId }));
  await hydrateDemo();
  const groupCache=JSON.parse(await AsyncStorage.getItem('borajogo-play-hub-demo-v1')??'{}');const me=useAppStore.getState().currentPlayerId;
  if(groupCache.data?.buddies?.some((b:any)=>b.game_id===gameId&&[b.host_player_id,b.buddy_player_id].includes(me)&&['invited','pending'].includes(b.status)&&Date.parse(b.expires_at)>Date.now()))throw new Error('Você já tem uma dupla pendente; cancele antes de solicitar individualmente.');
  if (!demoListings.get(gameId)?.published || !usePlatformStore.getState().settings.discoveryEnabled) throw new Error('Jogo indisponível.');
  const s = useAppStore.getState(); const player = s.players.find(p => p.id === s.currentPlayerId)!;
  const game = s.games.find(g => g.id === gameId);
  if (!game || !player || Date.parse(game.scheduledAt) <= Date.now() || !['open','full'].includes(game.status)) throw new Error('Jogo indisponível.');
  if (s.attendances.some(a => a.gameId === gameId && a.playerId === player.id && ['confirmed','waitlist'].includes(a.status))) throw new Error('Você já está na chamada deste jogo.');
  const key = `${gameId}:${player.id}`;
  if (!demoRequests.has(key)) demoRequests.set(key, { id: key, gameId, playerId: player.id, name: player.name, status: 'pending' });
  await saveDemo(); return demoRequests.get(key)!.status;
}

export async function respondOpenGameRequest(id: string, accept: boolean): Promise<string> {
  if (!isMockMode) return rpc<string>(client().rpc('respond_open_game_request', { p_request_id: id, p_accept: accept }));
  await hydrateDemo();
  const request = [...demoRequests.values()].find(r => r.id === id);
  if (!request) throw new Error('Solicitação não encontrada.');
  const game = assertDemoAdmin(request.gameId); const s = useAppStore.getState();
  if (request.status !== 'pending') return request.status;
  if (accept) {
    if (Date.parse(game.scheduledAt) <= Date.now() || !['open','full'].includes(game.status)) throw new Error('Chamada encerrada.');
    if (!s.memberships.some(m => m.peladaId === game.peladaId && m.playerId === request.playerId && m.active)) s.joinPeladaByCode(s.peladas.find(p => p.id === game.peladaId)!.inviteCode, request.playerId);
    s.setAttendance(game.id, request.playerId, 'confirmed');
  }
  request.status = accept ? 'accepted' : 'declined'; await saveDemo();
  return accept ? useAppStore.getState().attendances.find(a => a.gameId === game.id && a.playerId === request.playerId)?.status ?? 'accepted' : 'declined';
}
