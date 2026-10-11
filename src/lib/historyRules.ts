export type HistoryKind = 'game' | 'booking' | 'tab' | 'campaign' | 'class';
export interface HistoryEntry {
  id: string; source: string; sourceId: string; kind: HistoryKind; contextId: string;
  teamId: string | null; venueId: string | null; fieldId: string | null; title: string;
  operation: 'baseline' | 'INSERT' | 'UPDATE' | 'DELETE'; actorName: string;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null; recordedAt: string;
}
export interface HistoryQuery {
  scope: 'mine' | 'venue' | 'context'; venueId?: string; kind?: HistoryKind; contextId?: string;
  before?: string; from?: string; to?: string; teamId?: string; fieldId?: string;
}
export interface HistoryPage { entries: HistoryEntry[]; hasMore: boolean }
export const HISTORY_KINDS: Record<HistoryKind, string> = {game:'Jogos',booking:'Reservas',tab:'Consumo',campaign:'Vaquinhas',class:'Aulas'};
export const HISTORY_FIELDS: Record<string, string[]> = {
  games: ['scheduled_at','status','field_cost','max_players','players_per_team','match_minutes','duration_minutes','draw_method','rotation_mode','field_id'],
  attendances: ['status','checked_in','no_show','responded_at'],
  match_turns: ['started_at','ended_at','duration_seconds','winner_team_id'],
  goals: ['team_id','scorer_player_id','scored_at'], player_fatigue: ['status','matches_remaining'],
  payments: ['method','status','paid_at'],
  field_bookings: ['recurrence','day_of_week','date','time','duration_minutes','field_id','team_name'],
  game_booking_requests: ['status','requested_start_at','duration_minutes','attempt','responded_at','field_id'],
  opportunity_requests: ['status','price','booking_id'],
  booking_deposits: ['status','amount_cents','provider','method','paid_at','refunded_at'],
  service_tabs: ['label','table_label','status','opened_at','closed_at'],
  service_orders: ['status','submitted_at','completed_at'],
  service_order_items: ['product_id','quantity','unit_price','status','cancellation_reason'],
  order_item_shares: ['participant_id','amount_cents'], sale_payments: ['amount','method','paid_at','reversed_at'],
  sale_payment_intents: ['status','amount_cents','provider','method','paid_at','expires_at'],
  team_availability_polls: ['question','status','closes_at','selected_option_id','quorum_required'],
  fundraising_campaigns: ['title','status','target_amount','deadline','closed_at'],
  fundraising_contributions: ['amount','method','provider','status','paid_at'],
  fundraising_expenses: ['title','amount','created_at'],
  class_sessions: ['starts_at','ends_at','status','cancellation_reason'],
  class_enrollments: ['status','payment_status','payment_method','amount','is_trial','enrolled_at','paid_at'],
};
export const HISTORY_SOURCES: Record<string, string> = {
  games:'Jogo',attendances:'Presença',match_turns:'Rodada',goals:'Placar',player_fatigue:'Descanso',payments:'Pagamento do jogo',
  field_bookings:'Reserva',game_booking_requests:'Pedido de reserva',opportunity_requests:'Reserva de oportunidade',booking_deposits:'Sinal da reserva',
  service_tabs:'Comanda',service_orders:'Pedido',service_order_items:'Item do pedido',order_item_shares:'Divisão do consumo',sale_payments:'Pagamento da comanda',sale_payment_intents:'Cobrança da comanda',
  team_availability_polls:'Enquete de horário',fundraising_campaigns:'Vaquinha',fundraising_contributions:'Contribuição',fundraising_expenses:'Despesa da vaquinha',class_sessions:'Aula',class_enrollments:'Inscrição na aula',
};
const LABELS: Record<string,string> = {
  status:'Situação',payment_status:'Pagamento',scheduled_at:'Data do jogo',field_cost:'Valor do campo',max_players:'Limite de jogadores',players_per_team:'Jogadores por time',match_minutes:'Minutos por rodada',duration_minutes:'Duração (min)',draw_method:'Sorteio',rotation_mode:'Rodízio',field_id:'Campo',
  checked_in:'Check-in',no_show:'Falta',responded_at:'Resposta em',started_at:'Início',ended_at:'Fim',duration_seconds:'Duração (s)',winner_team_id:'Vencedor',team_id:'Time',scorer_player_id:'Marcador',scored_at:'Registrado em',matches_remaining:'Rodadas de descanso',
  amount:'Valor',amount_cents:'Valor',method:'Forma de pagamento',provider:'Provedor',paid_at:'Pago em',refunded_at:'Reembolsado em',reversed_at:'Estornado em',expires_at:'Validade',requested_start_at:'Horário solicitado',attempt:'Tentativa',booking_id:'Reserva vinculada',
  recurrence:'Repetição',day_of_week:'Dia da semana',date:'Data',time:'Horário',team_name:'Nome do time',price:'Preço',label:'Nome',table_label:'Mesa',opened_at:'Aberta em',closed_at:'Encerrada em',submitted_at:'Enviado em',completed_at:'Concluído em',
  product_id:'Produto',participant_id:'Participante',quantity:'Quantidade',unit_price:'Preço unitário',cancellation_reason:'Motivo do cancelamento',question:'Pergunta',closes_at:'Encerramento previsto',selected_option_id:'Horário escolhido',quorum_required:'Quórum',title:'Título',target_amount:'Meta',deadline:'Prazo',created_at:'Criado em',starts_at:'Início',ends_at:'Fim',payment_method:'Forma de pagamento',is_trial:'Aula experimental',enrolled_at:'Inscrição em',
};
const VALUES: Record<string,string> = {open:'Aberto',full:'Lotado',teams_drawn:'Times sorteados',in_progress:'Em andamento',finished:'Encerrado',cancelled:'Cancelado',confirmed:'Confirmado',declined:'Recusado',waitlist:'Na espera',waitlisted:'Na espera',pending:'Pendente',paid:'Pago',waived:'Isento',refunded:'Reembolsado',retained:'Retido',failed:'Falhou',expired:'Expirado',accepted:'Aceito',awaiting_owner:'Aguardando dono',conflict:'Conflito de horário',awaiting_payment:'Aguardando pagamento',partially_paid:'Pago parcialmente',closed:'Encerrado',submitted:'Enviado',preparing:'Em preparo',ready:'Pronto',delivered:'Entregue',draft:'Rascunho',active:'Ativo',funded:'Meta atingida',scheduled:'Agendado',completed:'Concluído',resting:'Descansando',done_for_today:'Encerrou por hoje',single:'Uma vez',weekly:'Semanal',rating:'Por avaliação',random:'Aleatório',arrival:'Por chegada',teams:'Times fixos',players:'Individual',pix:'Pix',cash:'Dinheiro',card:'Cartão',contactless:'Aproximação',manual_pix:'Pix direto',mercado_pago:'Mercado Pago',picpay:'PicPay',sicoob:'Sicoob',inter:'Inter'};
export function historySnapshot(source: string, row: Record<string,unknown>) {
  return Object.fromEntries((HISTORY_FIELDS[source]??[]).filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
}
export function historyChanges(e: HistoryEntry): Array<{key:string;label:string;before:unknown;after:unknown}> {
  const keys = new Set([...Object.keys(e.before??{}),...Object.keys(e.after??{})]);
  return [...keys].filter(k=>e.operation!=='UPDATE'||JSON.stringify(e.before?.[k])!==JSON.stringify(e.after?.[k]))
    .map(k=>({key:k,label:LABELS[k]??k,before:e.before?.[k],after:e.after?.[k]}));
}
export function historyValue(key:string,value:unknown,names:Record<string,string>={}) {
  if(value===undefined||value===null||value==='') return 'Não informado';
  if(typeof value==='boolean')return value?'Sim':'Não';
  if(key==='day_of_week')return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][Number(value)]??String(value);
  if(['amount','amount_cents','price','unit_price','field_cost','target_amount'].includes(key))return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)/(key==='amount_cents'?100:1));
  const text=String(value);
  if(key.endsWith('_id'))return names[text]??`Registro ${text.slice(0,8)}`;
  if(key.endsWith('_at')||key==='deadline') {const date=new Date(text);return Number.isNaN(date.getTime())?text:date.toLocaleString('pt-BR');}
  return VALUES[text]??text;
}
export function historyPeriod(from:string,to:string): {from?:string;to?:string} {
  function date(s:string) {if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error('Use datas no formato AAAA-MM-DD.');const d=new Date(`${s}T00:00:00`);if(Number.isNaN(d.getTime())||`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`!==s)throw new Error('Data inválida.');return d;}
  const a=from?date(from):null,b=to?date(to):null;
  if(a&&b&&a>b)throw new Error('A data final deve ser igual ou posterior à inicial.');
  if(b)b.setDate(b.getDate()+1);
  return {from:a?.toISOString(),to:b?.toISOString()};
}
