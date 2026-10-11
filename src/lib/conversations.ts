import AsyncStorage from '@react-native-async-storage/async-storage';
import { isMockMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useProStore } from '@/store/useProStore';
import { usePlayHubStore } from '@/store/usePlayHubStore';
import { cleanChatText, conversationUuid, validateTeamChat } from './conversationRules';
import { emptyConversations, type Conversation, type ConversationKind, type ConversationSnapshot, type TeamChatConfig } from '@/types/conversations';
import type { Json } from '@/types/supabase.generated';

interface DemoRoom { id: string; kind: ConversationKind; contextId: string; bookingKind: string | null; title: string; a: string | null; b: string | null; requesterId: string | null; status: Conversation['status']; createdAt: string }
interface DemoData {
  rooms: DemoRoom[]; messages: Array<{id:string;roomId:string;senderId:string;text:string;createdAt:string;nonce:string}>;
  configs: Record<string,TeamChatConfig>; friendsOnly: Record<string,boolean>; blocks: Record<string,string[]>;
  reads: Record<string,string>; requests: Array<{playerId:string;at:string}>;
  reported: Record<string,string>;
}
let demo: DemoData = {rooms:[],messages:[],configs:{},friendsOnly:{},blocks:{},reads:{},requests:[],reported:{}};
let hydrated: Promise<void> | null = null;
let mutation: Promise<unknown> = Promise.resolve();
let bookingHub = usePlayHubStore.getState().data;
const defaultConfig = (): TeamChatConfig => ({mode:'internal',whatsappUrl:null,adminOnly:false});
export function conversationSession() {
  const a = useAuthStore.getState();
  return a.isLoggedIn ? isMockMode ? `demo:${useAppStore.getState().currentPlayerId}` : a.authUserId : null;
}
async function hydrate() {
  if (!hydrated) hydrated = (async () => {
    const raw = await AsyncStorage.getItem('marcoujogou-conversations-demo-v1');
    if (raw) demo = {...demo,...JSON.parse(raw)};
  })();
  await hydrated;
  const hub = await AsyncStorage.getItem('borajogo-play-hub-demo-v1');
  bookingHub = hub ? JSON.parse(hub).data : usePlayHubStore.getState().data;
}
function bookingContext(kind: string | null, id: string) {
  const app = useAppStore.getState();
  if (kind === 'opportunity') {
    const hub = bookingHub;
    const request = hub.requests.find(r => r.id === id);
    const slot = hub.slots.find(s => s.id === request?.slot_id);
    if (request && slot) return {teamId:request.pelada_id,otherTeam:request.opponent_pelada_id,owner:app.establishments.find(e => e.id === slot.establishment_id)?.ownerPlayerId,creator:null,title:`Reserva · ${request.field_name}`};
  }
  if (kind === 'automatic') {
    const request = app.gameBookingRequests.find(r => r.id === id);
    const game = app.games.find(g => g.id === request?.gameId);
    const field = app.fields.find(f => f.id === request?.fieldId);
    if (request && game && field) return {teamId:game.peladaId,otherTeam:null,owner:app.establishments.find(e => e.id === field.establishmentId)?.ownerPlayerId,creator:null,title:`Reserva · ${field.name}`};
  }
  if (kind === 'field') {
    const booking = app.fieldBookings.find(b => b.id === id);
    if (booking) return {teamId:booking.peladaId,otherTeam:null,owner:app.establishments.find(e => e.id === booking.establishmentId)?.ownerPlayerId,creator:booking.createdBy,title:`Reserva · ${booking.teamName}`};
  }
  return null;
}
function isBlocked(a: string, b: string) {return !!(demo.blocks[a]?.includes(b) || demo.blocks[b]?.includes(a));}
function canAccess(room: DemoRoom, me: string) {
  const app = useAppStore.getState();
  if (room.kind === 'direct') return room.a === me || room.b === me;
  if (room.kind === 'team') return app.memberships.some(m => m.active && m.playerId === me && m.peladaId === room.contextId);
  const booking = bookingContext(room.bookingKind,room.contextId);
  return !!booking && (booking.owner === me || booking.creator === me || app.isAdmin(me,booking.teamId ?? '') || app.isAdmin(me,booking.otherTeam ?? ''));
}
function roomView(room: DemoRoom, me: string): Conversation {
  const otherId = room.kind === 'direct' ? room.a === me ? room.b : room.a : null;
  const blocked = !!otherId && isBlocked(me,otherId);
  const visible = !blocked && room.status === 'accepted';
  const messages = visible ? demo.messages.filter(m => m.roomId === room.id) : [];
  const last = messages.at(-1);
  return {id:room.id,kind:room.kind,contextId:room.contextId,bookingKind:room.bookingKind as Conversation['bookingKind'],
    title:otherId ? useAppStore.getState().players.find(p => p.id === otherId)?.name ?? 'Jogador' : room.title,
    status:room.status,requesterId:room.requesterId,otherId,blocked,
    unread:messages.filter(m => m.senderId !== me && m.createdAt > (demo.reads[`${me}:${room.id}`] ?? '')).length,
    lastText:last?.text ?? null,lastAt:last?.createdAt ?? room.createdAt};
}
export async function conversationSnapshot(roomId?: string, before?: string): Promise<ConversationSnapshot> {
  const key = conversationSession(); if (!key) throw new Error('Entre para abrir suas conversas.');
  let snapshot: ConversationSnapshot;
  if (!isMockMode) {
    if (!supabase) throw new Error('Backend indisponível.');
    const {data,error} = await supabase.rpc('community_chat_snapshot',{p_room:roomId ?? undefined,p_before:before ?? undefined});
    if (error) throw new Error('Não foi possível carregar as conversas. Verifique sua conexão e tente novamente.');
    snapshot = data as unknown as ConversationSnapshot;
  } else {
    await hydrate(); const app = useAppStore.getState(), me = app.currentPlayerId;
    const rooms = demo.rooms.filter(r => canAccess(r,me)).map(r => roomView(r,me)).sort((a,b) => b.lastAt.localeCompare(a.lastAt));
    const room = roomId ? demo.rooms.find(r => r.id === roomId && canAccess(r,me)) : undefined;
    if (roomId && !room) throw new Error('Conversa indisponível para sua conta.');
    const view = room ? roomView(room,me) : null;
    const messages = room && view?.status === 'accepted' && !view.blocked ? demo.messages.filter(m => m.roomId === room.id && (!before || m.createdAt < before)) : [];
    const config = room?.kind === 'team' ? demo.configs[room.contextId] ?? defaultConfig() : null;
    const canManage = !!room && room.kind === 'team' && app.isAdmin(me,room.contextId);
    snapshot = {...emptyConversations(),rooms,room:view,settings:{friendsOnly:demo.friendsOnly[me] ?? false},
      blocks:(demo.blocks[me] ?? []).map(id => ({id,name:app.players.find(p => p.id === id)?.name ?? 'Jogador'})),
      messages:messages.slice(-50).map(m => ({...m,senderName:app.players.find(p => p.id === m.senderId)?.name ?? 'Jogador'})),
      teamConfig:config,canManage,hasOlder:messages.length > 50,
      canPost:!!view && view.status === 'accepted' && !view.blocked && (!config || config.mode !== 'whatsapp' && (!config.adminOnly || canManage))};
  }
  if (conversationSession() !== key) throw new Error('A conta mudou. Abra a conversa novamente.');
  return snapshot;
}
export async function conversationAction(action: string, payload: Record<string,unknown>): Promise<{id?:string}> {
  const key = conversationSession(); if (!key) throw new Error('Entre para usar as conversas.');
  let result: {id?:string};
  if (!isMockMode) {
    if (!supabase) throw new Error('Backend indisponível.');
    const {data,error} = await supabase.rpc('community_chat_action',{p_action:action,p_data:payload as Json});
    if (error) throw new Error(error.message.startsWith('CHAT:') ? error.message.slice(5) : 'Não foi possível concluir. Verifique sua permissão e conexão.');
    result = data as {id?:string};
  } else {
    const job = mutation.catch(() => {}).then(async () => {
      await hydrate();
      if(conversationSession()!==key) throw new Error('A conta mudou. Abra a conversa novamente.');
      const result = demoAction(action,payload);
      await AsyncStorage.setItem('marcoujogou-conversations-demo-v1',JSON.stringify(demo)); return result;
    });
    mutation = job; result = await job;
  }
  if (conversationSession() !== key) throw new Error('A conta mudou. Abra a conversa novamente.');
  return result;
}
function demoAction(action:string,p:Record<string,unknown>):{id?:string} {
  const app = useAppStore.getState(), me = app.currentPlayerId, at = new Date().toISOString();
  if (action === 'settings') {if(typeof p.friendsOnly !== 'boolean') throw new Error('Preferência inválida.'); demo.friendsOnly[me] = p.friendsOnly; return {};}
  if (action === 'block' || action === 'unblock') {
    const target = String(p.playerId); if (target === me || !app.players.some(x => x.id === target)) throw new Error('Jogador inválido.');
    demo.blocks[me] = (demo.blocks[me] ?? []).filter(id => id !== target); if (action === 'block') demo.blocks[me].push(target); return {};
  }
  if (action === 'team_config') {
    if (!app.isAdmin(me,String(p.teamId))) throw new Error('Somente o administrador deste time.');
    demo.configs[String(p.teamId)] = validateTeamChat(p.config as TeamChatConfig); return {};
  }
  if (action === 'open') {
    const kind = p.kind as ConversationKind, contextId = String(p.contextId), bookingKind = String(p.bookingKind ?? '');
    let a:string|null = null,b:string|null = null,title='',status:Conversation['status']='accepted';
    if (kind === 'direct') {
      if (contextId === me || !app.players.some(x => x.id === contextId && !x.isGuest)) throw new Error('Escolha outro jogador cadastrado.');
      if (isBlocked(me,contextId)) throw new Error('Contato indisponível.');
      const friends = app.friendships.some(f => f.status === 'accepted' && ((f.requesterId === me && f.addresseeId === contextId) || (f.requesterId === contextId && f.addresseeId === me)));
      const exists = demo.rooms.some(r => r.kind === 'direct' && [r.a,r.b].includes(me) && [r.a,r.b].includes(contextId));
      if (!friends && demo.friendsOnly[contextId] && !exists) throw new Error('Este jogador recebe novas conversas apenas de amigos.');
      [a,b] = [me,contextId].sort(); status = friends ? 'accepted' : 'pending';
    } else if (kind === 'team') {
      if (!app.memberships.some(m => m.active && m.playerId === me && m.peladaId === contextId)) throw new Error('Conversa exclusiva dos membros do time.');
      title = app.peladas.find(t => t.id === contextId)?.name ?? 'Time';
    } else if (kind === 'booking') {
      const context = bookingContext(bookingKind,contextId);
      if (!context || !context.owner) throw new Error('Reserva sem estabelecimento cadastrado.');
      title = context.title;
    } else throw new Error('Tipo de conversa inválido.');
    let room = demo.rooms.find(r => r.kind === kind && (kind === 'direct' ? r.a === a && r.b === b : r.contextId === contextId && (kind !== 'booking' || r.bookingKind === bookingKind)));
    if (!room) {
      room = {id:conversationUuid(),kind,contextId,bookingKind:kind === 'booking' ? bookingKind : null,a,b,title,status,requesterId:kind === 'direct' ? me : null,createdAt:at};
      if (!canAccess(room,me)) throw new Error('Sem permissão para esta reserva.');
      if (status === 'pending') {
        if(demo.requests.filter(r => r.playerId === me && Date.parse(r.at) > Date.now()-86400000).length >= 20) throw new Error('Limite diário de solicitações atingido.');
        demo.requests.push({playerId:me,at});
      }
      demo.rooms.push(room);
    }
    if (!canAccess(room,me)) throw new Error('Conversa indisponível.');
    return {id:room.id};
  }
  const room = demo.rooms.find(r => r.id === p.roomId && canAccess(r,me)); if (!room) throw new Error('Conversa indisponível.');
  const view = roomView(room,me);
  if (action === 'respond') {
    if (room.kind !== 'direct' || room.status !== 'pending' || room.requesterId === me || view.blocked || typeof p.accept !== 'boolean') throw new Error('Solicitação indisponível.');
    room.status = p.accept ? 'accepted' : 'declined'; return {};
  }
  if (action === 'read') {demo.reads[`${me}:${room.id}`] = at; return {};}
  if (action === 'report') {
    const message = demo.messages.find(m => m.id === p.messageId && m.roomId === room.id && m.senderId !== me);
    if(!message || room.status !== 'accepted' || view.blocked) throw new Error('Selecione uma mensagem recebida.');
    const reason = String(p.reason ?? 'other'); if(!['harassment','fraud','unsafe_content','spam','other'].includes(reason)) throw new Error('Motivo inválido.');
    const evidenceKey = `${me}:${message.id}`;
    if(demo.reported[evidenceKey]) return {id:demo.reported[evidenceKey]};
    const id = conversationUuid();
    useProStore.setState(s => ({moderationReports:[...s.moderationReports,{id,reporterPlayerId:me,targetType:'player',targetId:message.senderId,reason:reason as 'other',details:`Conversa ${room.id}; mensagem ${message.id}: ${message.text}`,status:'open',createdAt:at,resolvedAt:null}]}));
    demo.reported[evidenceKey] = id;
    return {id};
  }
  if (action === 'send') {
    if(room.status !== 'accepted' || view.blocked) throw new Error('Aguarde o aceite ou verifique o bloqueio.');
    const config = room.kind === 'team' ? demo.configs[room.contextId] ?? defaultConfig() : null;
    if(config && (config.mode === 'whatsapp' || config.adminOnly && !app.isAdmin(me,room.contextId))) throw new Error('Envio interno não permitido neste time.');
    const text = cleanChatText(p.text), nonce = String(p.nonce ?? '');
    if(!/^[0-9a-f-]{36}$/i.test(nonce)) throw new Error('Identificador inválido.');
    const previous = demo.messages.find(m => m.senderId === me && m.nonce === nonce);
    if(previous) {
      if(previous.roomId !== room.id || previous.text !== text) throw new Error('Identificador de envio já utilizado.');
      return {id:previous.id};
    }
    if(demo.messages.filter(m => m.senderId === me && Date.parse(m.createdAt) > Date.now()-60000).length >= 20) throw new Error('Muitas mensagens. Aguarde um minuto.');
    const id = conversationUuid(); demo.messages.push({id,roomId:room.id,senderId:me,text,createdAt:at,nonce}); return {id};
  }
  throw new Error('Ação inválida.');
}
