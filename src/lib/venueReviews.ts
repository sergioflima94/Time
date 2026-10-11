import AsyncStorage from '@react-native-async-storage/async-storage';
import { isMockMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useProStore } from '@/store/useProStore';
import { conversationUuid } from './conversationRules';
import { recordDemoPlatformAudit } from '@/store/usePlatformStore';
import { reviewText, summarizeNps, summarizeReviews, validateReview } from './venueReviewRules';
import type { Json } from '@/types/supabase.generated';
import type { ModerationReason } from '@/types/pro';
import type { ReviewExperience, ReviewSnapshot, VenueReview, VisitCandidate } from '@/types/venueReviews';

interface DemoReview extends VenueReview { playerId: string; kind: string; experienceId: string; nps: number | null }
interface DemoReport { id: string; reviewId: string; playerId: string; subject: 'review' | 'reply'; reason: string; details: string; resolved: boolean; createdAt: string }
interface DemoVisit { id: string; bookingId: string; date: string; playerId: string }
interface DemoData { reviews: DemoReview[]; reports: DemoReport[]; visits: DemoVisit[]; audit: Array<{ action: string; actor: string; id: string; reason: string; at: string }> }
let demo: DemoData = { reviews: [], reports: [], visits: [], audit: [] };
let hydrated: Promise<void> | null = null, mutations: Promise<unknown> = Promise.resolve();
const CACHE = 'marcoujogou-venue-reviews-demo-v1';
export function reviewSession() {
  const a = useAuthStore.getState();
  return a.isLoggedIn ? isMockMode ? `demo:${useAppStore.getState().currentPlayerId}` : a.authUserId : 'anonymous';
}
async function hydrate() {
  if (!hydrated) hydrated = (async () => { const raw = await AsyncStorage.getItem(CACHE); if (raw) demo = { ...demo, ...JSON.parse(raw) }; })();
  await hydrated;
}
function me() { return useAuthStore.getState().isLoggedIn ? useAppStore.getState().currentPlayerId : null; }
function experiences(playerId: string): ReviewExperience[] {
  const s = useAppStore.getState(), result: ReviewExperience[] = [];
  const add = (kind: ReviewExperience['kind'], id: string, fieldId: string | null, label: string, at: string) => {
    const field = s.fields.find(f => f.id === fieldId);
    if (field?.establishmentId) result.push({ kind, id, fieldId: field.id, establishmentId: field.establishmentId, label, at });
  };
  for (const g of s.games) if (g.status === 'finished' && Date.parse(g.scheduledAt) + g.durationMinutes * 60000 <= Date.now()
    && s.attendances.some(a => a.gameId === g.id && a.playerId === playerId && a.status === 'confirmed' && a.checkedIn && !a.noShow))
    add('game', g.id, g.fieldId, `Jogo · ${s.peladas.find(p => p.id === g.peladaId)?.name ?? 'Time'}`, g.scheduledAt);
  for (const c of s.classSessions) if (c.status === 'completed' && Date.parse(c.endsAt) <= Date.now()
    && s.classAttendances.some(a => a.sessionId === c.id && a.playerId === playerId && a.status === 'present')) {
    const p = s.classPrograms.find(p => p.id === c.programId); if (p) add('class', c.id, p.fieldId, `Aula · ${p.name}`, c.startsAt);
  }
  for (const v of demo.visits.filter(v => v.playerId === playerId)) {
    const b = s.fieldBookings.find(b => b.id === v.bookingId); if (b) add('visit', v.id, b.fieldId, `Reserva · ${b.teamName}`, `${v.date}T${b.time}:00-03:00`);
  }
  return result.sort((a, b) => b.at.localeCompare(a.at));
}
function candidates(venue: string): VisitCandidate[] {
  const s = useAppStore.getState(), owner = s.establishments.find(e => e.id === venue)?.ownerPlayerId;
  if (owner !== me()) return [];
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })); today.setHours(0, 0, 0, 0);
  const result: VisitCandidate[] = [];
  for (const b of s.fieldBookings.filter(b => b.establishmentId === venue)) {
    const d = new Date(today); if (b.recurrence === 'weekly') d.setDate(d.getDate() - (d.getDay() - (b.dayOfWeek ?? 0) + 7) % 7);
    const dateOf=()=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if(b.recurrence==='weekly'&&Date.parse(`${dateOf()}T${b.time}:00-03:00`)+b.durationMinutes*60000>Date.now())d.setDate(d.getDate()-7);
    const date = b.recurrence === 'single' ? b.date! : dateOf();
    const start = Date.parse(`${date}T${b.time}:00-03:00`), end = start + b.durationMinutes * 60000;
    if (!Number.isFinite(start) || end > Date.now() || start < Date.parse(b.createdAt) || start < Date.now()-91*86400000
      || s.games.some(g => g.fieldId === b.fieldId && g.peladaId === b.peladaId && Date.parse(g.scheduledAt) >= start && Date.parse(g.scheduledAt) < end)) continue;
    for (const p of s.players) if (!p.isGuest && p.id !== owner && (p.id === b.createdBy || s.memberships.some(m => m.peladaId === b.peladaId && m.playerId === p.id && m.active && Date.parse(m.joinedAt) <= start))
      && !demo.visits.some(v => v.bookingId === b.id && v.date === date && v.playerId === p.id))
      result.push({ bookingId: b.id, date, playerId: p.id, playerName: p.nickname || p.name, label: `${b.teamName} · ${s.fields.find(f => f.id === b.fieldId)?.name}` });
  }
  return result.sort((a,b) => b.date.localeCompare(a.date)).slice(0,100);
}
export interface ReviewQuery { establishmentId?: string; fieldId?: string; before?: string; moderation?: boolean }
export async function demoFieldReviewSummaries(fieldIds: Array<string|null>) {
  if (!isMockMode) throw new Error('Resumo local disponível somente na demonstração.');
  await hydrate(); return Object.fromEntries(fieldIds.filter((id):id is string=>!!id).map(id=>[id,summarizeReviews(demo.reviews.filter(r=>r.fieldId===id&&r.target==='field'))]));
}
export async function readVenueReviews(query: ReviewQuery): Promise<ReviewSnapshot> {
  const session = reviewSession(); let result: ReviewSnapshot;
  if (!isMockMode) {
    if (!supabase) throw new Error('Backend indisponível.');
    const { data, error } = await supabase.rpc('venue_review_snapshot', { p_venue: query.establishmentId, p_field: query.fieldId, p_before: query.before, p_moderation: query.moderation ?? false });
    if (error) throw new Error(error.message.includes('REVIEW:') ? error.message.split('REVIEW:')[1] : 'Não foi possível carregar avaliações. Tente novamente.');
    result = data as unknown as ReviewSnapshot;
  } else {
    await hydrate(); const s = useAppStore.getState(), player = me(), moderator = player === 'p1';
    if (query.moderation && !moderator) throw new Error('Acesso exclusivo da administração.');
    const field = s.fields.find(f => f.id === query.fieldId), venue = s.establishments.find(e => e.id === (field?.establishmentId ?? query.establishmentId));
    if (!query.moderation && !venue) throw new Error('Local cadastrado não encontrado.');
    const target = query.fieldId ? 'field' : 'establishment', own = !!venue && venue.ownerPlayerId === player;
    const targetRows = demo.reviews.filter(r => r.establishmentId === venue?.id && r.target === target && (!query.fieldId || r.fieldId === query.fieldId));
    const list = (query.moderation ? demo.reviews.filter(r => r.hidden || r.replyHidden || demo.reports.some(p => p.reviewId === r.id && !p.resolved)) : targetRows.filter(r => !r.hidden))
      .sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const cursor = query.before ? demo.reviews.find(r => r.id === query.before) : null;
    if (query.before && (!cursor || !query.moderation && !targetRows.includes(cursor))) throw new Error('Página inválida.');
    const rows = list.filter(r => !cursor || r.createdAt < cursor.createdAt || r.createdAt === cursor.createdAt && r.id < cursor.id);
    result = { title: query.moderation ? 'Moderação de avaliações' : field?.name ?? venue!.name, target,
      establishmentId: venue?.id ?? null, fieldId: query.fieldId ?? null, canReply: own, canModerate: moderator,
      summary: summarizeReviews(targetRows), nps: own ? summarizeNps(demo.reviews.filter(r => r.establishmentId === venue!.id && r.target === 'establishment' && !r.hidden && r.nps !== null).map(r => r.nps!)) : null,
      experiences: player && !own && !query.moderation ? experiences(player).filter(e => e.establishmentId === venue?.id && (!field || e.fieldId === field.id)
        && !demo.reviews.some(r => r.playerId === player && r.kind === e.kind && r.experienceId === e.id && r.target === target)) : [],
      visitCandidates: own ? candidates(venue!.id) : [], hasMore: rows.length > 50, fields: s.fields.filter(f => f.establishmentId===venue?.id).map(({id,name})=>({id,name})),
      reviews: rows.slice(0,50).map(({playerId,kind,experienceId,nps,...r}) => ({ ...r, mine: playerId === player,
        reply: !r.replyHidden || query.moderation ? r.reply : null,
        reported: demo.reports.some(p => p.reviewId === r.id && p.playerId === player && p.subject === 'review'),
        replyReported: demo.reports.some(p => p.reviewId === r.id && p.playerId === player && p.subject === 'reply' && p.createdAt >= (r.repliedAt??'')),
        reports: query.moderation ? demo.reports.filter(p => p.reviewId === r.id).map(({subject,reason,details}) => ({subject,reason,details})) : [] })),
    };
  }
  if (reviewSession() !== session) throw new Error('A conta mudou. Atualize as avaliações.');
  return result;
}
export async function venueReviewAction(action: string, payload: Record<string, unknown>): Promise<void> {
  const session = reviewSession(); if (session === 'anonymous' || !session) throw new Error('Entre com uma conta ativa.');
  if (!isMockMode) {
    if (!supabase) throw new Error('Backend indisponível.');
    const { error } = await supabase.rpc('venue_review_action', { p_action: action, p_data: payload as Json });
    if (error) throw new Error(error.message.includes('REVIEW:') ? error.message.split('REVIEW:')[1] : 'Não foi possível salvar. Verifique sua conexão e permissão.');
  } else {
    const job = mutations.catch(() => {}).then(async () => {
      await hydrate(); if (reviewSession() !== session) throw new Error('A conta mudou.');
      demoAction(action, payload); await AsyncStorage.setItem(CACHE, JSON.stringify(demo));
      if(action==='moderate')await recordDemoPlatformAudit('venue_review_moderate',String(payload.reviewId),String(payload.reason));
    }); mutations = job; await job;
  }
  if (reviewSession() !== session) throw new Error('A conta mudou. Atualize as avaliações.');
}
function demoAction(action: string, p: Record<string, unknown>) {
  const s = useAppStore.getState(), player = me()!, at = new Date().toISOString();
  const audit = (id: string, reason: string) => demo.audit.push({action,actor:player,id,reason,at});
  if (action === 'create') {
    const e = experiences(player).find(e => e.id === p.experienceId && e.kind === p.kind);
    if (!e) throw new Error('É necessário encerrar a experiência e registrar sua presença.');
    const venue = s.establishments.find(v => v.id === e.establishmentId)!;
    if (venue.ownerPlayerId === player) throw new Error('O proprietário não avalia o próprio local.');
    validateReview(p.target as VenueReview['target'], p.score, p.criteria, p.nps);
    if (demo.reviews.some(r => r.playerId === player && r.kind === e.kind && r.experienceId === e.id && r.target === p.target)) throw new Error('Você já avaliou este local nesta experiência.');
    if (demo.reviews.filter(r => r.playerId === player && Date.parse(r.createdAt)>Date.now()-3600000).length>=10) throw new Error('Muitas avaliações. Tente mais tarde.');
    const row: DemoReview = { id: conversationUuid(), target: p.target as VenueReview['target'], score: p.score as number, criteria: p.criteria as Record<string,number>, comment: reviewText(p.comment ?? ''),
      playerId: player, kind: e.kind, experienceId: e.id, nps: (p.nps as number | null | undefined) ?? null,
      establishmentId: venue.id, establishmentName: venue.name, fieldId: e.fieldId, fieldName: s.fields.find(f => f.id === e.fieldId)!.name,
      authorName: s.players.find(p => p.id === player)?.nickname || s.players.find(p => p.id === player)?.name || 'Jogador', mine: true,
      createdAt: at, reply: null, repliedAt: null, hidden: false, replyHidden: false, reported: false, replyReported: false, reports: [] };
    demo.reviews.push(row); audit(row.id, 'Experiência e presença verificadas'); return;
  }
  if (action === 'visit') {
    const c = candidates(String(p.establishmentId)).find(c => c.bookingId === p.bookingId && c.date === p.date && c.playerId === p.playerId);
    if (!c) throw new Error('Confirme apenas uma presença de reserva encerrada sob sua gestão.');
    demo.visits.push({id:conversationUuid(),bookingId:c.bookingId,date:c.date,playerId:c.playerId});audit(c.bookingId,`Presença ${c.playerId} em ${c.date}`);return;
  }
  const r = demo.reviews.find(r => r.id === p.reviewId); if (!r) throw new Error('Avaliação indisponível.');
  if (action === 'reply') {
    if (s.establishments.find(e => e.id === r.establishmentId)?.ownerPlayerId !== player || r.hidden || r.replyHidden) throw new Error('Resposta exclusiva do proprietário; conteúdo moderado não pode ser alterado.');
    if (demo.reports.some(p => p.reviewId === r.id && p.subject === 'reply' && !p.resolved)) throw new Error('Resposta em análise não pode ser alterada.');
    r.reply = reviewText(p.text, true); r.repliedAt = at; audit(r.id, r.reply); return;
  }
  if (action === 'report') {
    if (!['review','reply'].includes(String(p.subject)) || r.hidden || p.subject === 'reply' && (!r.reply || r.replyHidden)) throw new Error('Conteúdo indisponível.');
    if (!['harassment','fraud','unsafe_content','spam','other'].includes(String(p.reason))) throw new Error('Denúncia inválida.');
    const previous = demo.reports.find(d => d.reviewId === r.id && d.playerId === player && d.subject === p.subject);
    if (previous && (p.subject==='review'||previous.createdAt >= (r.repliedAt??''))) return;
    if (demo.reports.filter(d => d.playerId === player && Date.parse(d.createdAt)>Date.now()-3600000).length>=10) throw new Error('Muitas denúncias.');
    const id = conversationUuid(), details = reviewText(p.details ?? '', false, 1000);
    if(previous)demo.reports=demo.reports.filter(d=>d.id!==previous.id);
    demo.reports.push({id,reviewId:r.id,playerId:player,subject:p.subject as DemoReport['subject'],reason:String(p.reason),details,resolved:false,createdAt:at});
    useProStore.setState(state => ({moderationReports:[...state.moderationReports,{id,reporterPlayerId:player,targetType:'establishment',targetId:r.establishmentId,reason:p.reason as ModerationReason,details:`Avaliação ${r.id} · ${p.subject}: ${details}\nConteúdo: ${p.subject==='reply'?r.reply:r.comment}`,status:'open',createdAt:at,resolvedAt:null}]}));return;
  }
  if (action === 'moderate') {
    if (player !== 'p1') throw new Error('Acesso exclusivo da administração.');
    const reason = reviewText(p.reason, true, 1000);
    if (reason.length < 10 || typeof p.hidden !== 'boolean' || !['review','reply'].includes(String(p.subject)) || p.subject === 'reply' && !r.reply) throw new Error('Informe conteúdo, decisão e motivo de 10 a 1.000 caracteres.');
    if (p.subject === 'review') r.hidden = p.hidden; else r.replyHidden = p.hidden;
    for (const report of demo.reports.filter(d => d.reviewId === r.id && d.subject === p.subject)) {
      report.resolved = true; useProStore.setState(state => ({moderationReports:state.moderationReports.map(m => m.id===report.id?{...m,status:p.hidden?'resolved':'dismissed',resolvedAt:at}:m)}));
    }
    audit(r.id, `${p.subject} ${p.hidden?'ocultado':'publicado'}: ${reason}`);return;
  }
  throw new Error('Ação inválida.');
}
