export interface AssistedVenue {
  establishment_id: string; name: string; target_player_id: string | null;
  status: 'draft' | 'invited' | 'accepted' | 'declined'; revision: number;
  fields: Array<{ id: string; name: string; sport_id: string; address: string | null }>;
}
export interface BuddyInvite {
  id: string; game_id: string; host_player_id: string; buddy_player_id: string | null;
  code: string; status: string; expires_at: string; host_name: string; buddy_name: string | null;
}
export interface OpportunitySlot {
  id: string; field_id: string; field_name: string; establishment_id: string; address: string | null;
  sport_id: string; starts_at: string; duration_minutes: number; regular_price: number; offer_price: number; active: boolean;
}
export interface PlayWindow { id: string; pelada_id: string; team_name: string; sport_id: string; starts_at: string; ends_at: string; level: string; active: boolean }
export interface OpportunityRequest {
  id: string; slot_id: string; pelada_id: string; team_name: string; opponent_pelada_id: string | null; opponent_name: string | null;
  opponent_accepted: boolean; status: string; price: number; commission_percent: number; field_name: string; starts_at: string; match_id: string | null;
}
export interface PlayHubSnapshot {
  venues: AssistedVenue[]; buddies: BuddyInvite[]; slots: OpportunitySlot[]; windows: PlayWindow[]; requests: OpportunityRequest[];
  onboarding: { persona: string; completed: boolean; suggestions_enabled: boolean } | null;
}
export const emptyPlayHub = (): PlayHubSnapshot => ({ venues: [], buddies: [], slots: [], windows: [], requests: [], onboarding: null });
export function validateWindow(start:string,end:string,level:string,now=Date.now()){
  const a=Date.parse(start),b=Date.parse(end);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<=now||b<=a||b-a>8*3600000||!['all','beginner','intermediate','advanced'].includes(level))throw new Error('Janela inválida: data futura, até 8 horas e nível válido.');
}
export function validateSlot(start:string,minutes:number,regular:number,offer:number,now=Date.now()){
  const a=Date.parse(start);const d=new Date(a),end=new Date(a+minutes*60000);
  if(!Number.isFinite(a)||a<=now||!Number.isInteger(minutes)||minutes<15||minutes>240||d.getDate()!==end.getDate()||!Number.isFinite(regular)||!Number.isFinite(offer)||offer<=0||offer>=regular||Math.abs(offer*100-Math.round(offer*100))>0.000001||Math.abs(regular*100-Math.round(regular*100))>0.000001)throw new Error('Horário/preço inválidos: 15–240 min, mesmo dia e desconto em centavos.');
}
export function compatibleWindows(slot: OpportunitySlot, windows: PlayWindow[], teamId: string): PlayWindow[] {
  return windows.filter(w => w.active && w.pelada_id !== teamId && w.sport_id === slot.sport_id && Date.parse(w.starts_at) <= Date.parse(slot.starts_at)
    && Date.parse(w.ends_at) >= Date.parse(slot.starts_at) + slot.duration_minutes * 60000);
}
export function localDateTime(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Use data AAAA-MM-DD e horário HH:mm.');
  const parsed = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(parsed.getTime()) || parsed.getFullYear() !== Number(date.slice(0,4)) || parsed.getMonth()+1 !== Number(date.slice(5,7)) || parsed.getDate() !== Number(date.slice(8,10))) throw new Error('Data inválida.');
  return parsed.toISOString();
}
export function matchesAvailability(game: { scheduledAt: string; durationMinutes: number; level: string }, date: string, from: string, until: string, level: string): boolean {
  if((from||until)&&!date)throw new Error('Informe a data para filtrar por horário.');
  if (level !== 'all' && game.level !== 'all' && game.level !== level) return false;
  if (!date) return true;
  const start = Date.parse(localDateTime(date, from || '00:00'));
  const end = Date.parse(localDateTime(date, until || '23:59'));
  if(end<=start)throw new Error('O horário final deve ser depois do início.');
  return Date.parse(game.scheduledAt) >= start && Date.parse(game.scheduledAt) + game.durationMinutes*60000 <= end;
}
