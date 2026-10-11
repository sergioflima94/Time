import AsyncStorage from '@react-native-async-storage/async-storage';
import { isMockMode, supabase } from '@/lib/supabase';
import { genericToRow, TABLE_SPECS } from '@/lib/supabaseSyncMappings';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlayHubStore } from '@/store/usePlayHubStore';
import { historySnapshot, type HistoryEntry, type HistoryPage, type HistoryQuery, type HistoryKind, HISTORY_FIELDS } from './historyRules';

type Row = Record<string, any>;
interface DemoEvent extends Omit<HistoryEntry,'actorName'> {actorId:string|null;subjects:string[];private:boolean}
const CACHE='marcoujogou-history-demo-v1';
let events:DemoEvent[]=[];let sequence=0;let hydrated:Promise<void>|null=null;let saveChain=Promise.resolve();
const tracked=TABLE_SPECS.filter(s=>s.store==='app'&&HISTORY_FIELDS[s.table]);
export function historySession(){const a=useAuthStore.getState();return a.isLoggedIn?(isMockMode?`demo:${useAppStore.getState().currentPlayerId}`:a.authUserId):null;}
async function hydrate(){if(!hydrated)hydrated=(async()=>{try{const raw=await AsyncStorage.getItem(CACHE);if(raw){const data=JSON.parse(raw);events=data.events??[];sequence=data.sequence??0;}}catch{/* Demo storage only. */}})();await hydrated;}
function persist(){const raw=JSON.stringify({events,sequence});saveChain=saveChain.catch(()=>{}).then(()=>AsyncStorage.setItem(CACHE,raw)).catch(()=>{});}
function database(state:Row,hub:Row):Record<string,Row[]>{return Object.fromEntries([...tracked.map(s=>[s.table,(state[s.stateKey]??[]).map((v:Row)=>genericToRow(v))]),['opportunity_slots',hub.slots??[]],['opportunity_requests',hub.requests??[]]]);}
function context(source:string,r:Row,db:Record<string,Row[]>){
  const find=(t:string,id:unknown)=>(db[t]??[]).find(x=>x.id===id);
  let root:Row|undefined;let kind:HistoryKind;let team:string|null=null,venue:string|null=null,field:string|null=null;let title='';let restricted=false;let subjects:string[]=[];
  if(['games','attendances','match_turns','goals','player_fatigue','payments','team_availability_polls'].includes(source)){
    kind='game';root=source==='games'?r:find('games',r.game_id);team=root?.pelada_id;field=root?.field_id;title=useAppStore.getState().peladas.find(p=>p.id===team)?.name??'Jogo';restricted=source==='payments';
  }else if(['field_bookings','game_booking_requests','opportunity_requests','booking_deposits'].includes(source)){
    kind='booking';root=source==='booking_deposits'?find('game_booking_requests',r.booking_request_id):r;team=root?.pelada_id??find('games',root?.game_id)?.pelada_id;field=root?.field_id??find('opportunity_slots',root?.slot_id)?.field_id;title=root?.team_name??'Reserva de campo';restricted=true;
    if(source==='field_bookings'&&root?.created_by)subjects.push(root.created_by);
  }else if(['service_tabs','service_orders','service_order_items','order_item_shares','sale_payments','sale_payment_intents'].includes(source)){
    kind='tab';const order=source==='service_order_items'?find('service_orders',r.order_id):source==='order_item_shares'?find('service_orders',find('service_order_items',r.item_id)?.order_id):null;
    root=source==='service_tabs'?r:find('service_tabs',order?.tab_id??r.tab_id);venue=root?.establishment_id;title=root?.label??'Comanda';restricted=true;if(root?.customer_player_id)subjects.push(root.customer_player_id);
  }else if(['fundraising_campaigns','fundraising_contributions','fundraising_expenses'].includes(source)){
    kind='campaign';root=source==='fundraising_campaigns'?r:find('fundraising_campaigns',r.campaign_id);team=root?.pelada_id;title=root?.title??'Vaquinha';restricted=source==='fundraising_contributions';
  }else{
    kind='class';root=source==='class_sessions'?r:find('class_sessions',r.session_id);const program=useAppStore.getState().classPrograms.find(p=>p.id===root?.program_id);venue=program?.establishmentId??null;field=program?.fieldId??null;title=program?.name??'Aula';restricted=true;
  }
  if(!root?.id)return null;
  if(!venue&&field)venue=useAppStore.getState().fields.find(f=>f.id===field)?.establishmentId??null;
  for(const k of ['player_id','paid_by_player_id','credited_player_id','payer_player_id'])if(r[k])subjects.push(r[k]);
  return {kind,contextId:root.id,teamId:team??null,venueId:venue??null,fieldId:field??null,title,private:restricted,subjects};
}
function record(source:string,row:Row,old:Row|undefined,op:HistoryEntry['operation'],db:Record<string,Row[]>){
  const after=historySnapshot(source,row),before=old?historySnapshot(source,old):null;
  if(op==='UPDATE'&&JSON.stringify(after)===JSON.stringify(before))return;
  const c=context(source,row,db);if(!c)return;
  events.push({...c,id:String(++sequence),source,sourceId:row.id,operation:op,actorId:op==='baseline'?null:useAppStore.getState().currentPlayerId,before:op==='DELETE'?after:before,after:op==='DELETE'?null:after,recordedAt:new Date().toISOString()});
}

/** Mock-only recorder. Production history is created by database triggers, never by client claims. */
export function startDemoHistory(){
  if(!isMockMode)return()=>{};
  let disposed=false;let previous:Record<string,Row[]>={};let ready=false;let canonicalHub:Row={slots:[],requests:[]};let hubReads=Promise.resolve();
  async function readHub(){try{const saved=JSON.parse(await AsyncStorage.getItem('borajogo-play-hub-demo-v1')??'{}');return saved.data??{slots:[],requests:[]};}catch{return {slots:[],requests:[]};}}
  // A filtered snapshot is not a deletion. Journal the canonical demo cache, not
  // the user's visible inbox or the list of slots still free after a confirmation.
  function current(){return database(useAppStore.getState(),canonicalHub);}
  function track(){if(!ready||disposed||!historySession())return;const next=current();
    for(const [source,rows] of Object.entries(next)){if(!HISTORY_FIELDS[source])continue;const old=new Map((previous[source]??[]).map(r=>[r.id,r]));const now=new Set(rows.map(r=>r.id));
      for(const r of rows){const prior=old.get(r.id);if(!prior||JSON.stringify(prior)!==JSON.stringify(r))record(source,r,prior,prior?'UPDATE':'INSERT',next);}
      for(const r of old.values())if(!now.has(r.id))record(source,r,undefined,'DELETE',previous);
    }previous=JSON.parse(JSON.stringify(next));persist();
  }
  const stopApp=useAppStore.subscribe(track),stopHub=usePlayHubStore.subscribe(()=>{
    const key=historySession();hubReads=hubReads.then(async()=>{const data=await readHub();if(disposed||!ready||key!==historySession())return;canonicalHub=data;track();}).catch(()=>{});
  });
  void Promise.all([hydrate(),readHub()]).then(([,hub])=>{
    if(disposed)return;
    canonicalHub=hub;
    function initialize(){if(disposed||ready)return;previous=JSON.parse(JSON.stringify(current()));const seen=new Set(events.map(e=>`${e.source}:${e.sourceId}`));
      for(const [source,rows] of Object.entries(previous))if(HISTORY_FIELDS[source])for(const r of rows)if(!seen.has(`${source}:${r.id}`))record(source,r,undefined,'baseline',previous);
      ready=true;persist();
    }
    if(useAppStore.persist.hasHydrated())initialize();else stopHydration=useAppStore.persist.onFinishHydration(initialize);
  });
  let stopHydration:(()=>void)|undefined;
  return()=>{disposed=true;stopApp();stopHub();stopHydration?.();};
}
function venueAccess(venue:string|null,me:string){const s=useAppStore.getState();return !!venue&&(s.establishments.some(e=>e.id===venue&&e.ownerPlayerId===me)||s.establishmentStaff.some(e=>e.establishmentId===venue&&e.playerId===me&&e.active&&e.roles.some(r=>r==='manager'||r==='cashier')));}
function access(e:DemoEvent,me:string){const s=useAppStore.getState();return e.subjects.includes(me)||venueAccess(e.venueId,me)||(!!e.teamId&&s.memberships.some(m=>m.peladaId===e.teamId&&m.playerId===me&&m.active&&(!e.private||m.role==='admin')))||(e.kind==='tab'&&s.tabParticipants.some(p=>p.tabId===e.contextId&&p.playerId===me))||(e.kind==='class'&&e.source==='class_sessions'&&s.classEnrollments.some(p=>p.sessionId===e.contextId&&p.playerId===me&&p.status!=='cancelled'));}
export async function readHistory(query:HistoryQuery):Promise<HistoryPage>{
  const key=historySession();if(!key)throw new Error('Entre no aplicativo.');
  if(!isMockMode&&supabase){const {data,error}=await supabase.rpc('activity_history_read',{
    p_scope:query.scope,p_venue:query.venueId,p_kind:query.kind,p_context:query.contextId,p_before:query.before?Number(query.before):undefined,p_from:query.from,p_to:query.to,p_team:query.teamId,p_field:query.fieldId,
  });if(key!==historySession())throw new Error('A conta mudou. Abra o histórico novamente.');if(error)throw new Error(error.message.includes('HISTORY:')?error.message.split('HISTORY:')[1].trim():'Não foi possível carregar o histórico. Tente novamente.');return data as unknown as HistoryPage;}
  await hydrate();if(key!==historySession())throw new Error('A conta mudou.');const me=useAppStore.getState().currentPlayerId;
  if(query.scope==='venue'&&!venueAccess(query.venueId??null,me))throw new Error('Sem permissão para este estabelecimento.');
  const matches=events.filter(e=>access(e,me)&&(!query.before||Number(e.id)<Number(query.before))&&(!query.kind||e.kind===query.kind)&&(!query.teamId||e.teamId===query.teamId)&&(!query.fieldId||e.fieldId===query.fieldId)&&(!query.from||e.recordedAt>=query.from)&&(!query.to||e.recordedAt<query.to)&&
    (query.scope==='venue'?e.venueId===query.venueId:query.scope==='context'?e.contextId===query.contextId:e.subjects.includes(me)||e.actorId===me||(!e.private&&!!e.teamId&&useAppStore.getState().memberships.some(m=>m.playerId===me&&m.peladaId===e.teamId&&m.active))||personalContext(e,me)))
    .sort((a,b)=>Number(b.id)-Number(a.id));
  return {entries:matches.slice(0,50).map(({actorId,subjects,private:_,...e})=>({...e,actorName:actorId===me?'Você':actorId?useAppStore.getState().players.find(p=>p.id===actorId)?.name??'Conta indisponível':'Sistema / responsável não registrado'})),hasMore:matches.length>50};
}
function personalContext(e:DemoEvent,me:string){const s=useAppStore.getState();return(e.kind==='booking'&&!!e.teamId&&s.memberships.some(m=>m.playerId===me&&m.peladaId===e.teamId&&m.active&&m.role==='admin'))||(e.kind==='tab'&&s.tabParticipants.some(p=>p.playerId===me&&p.tabId===e.contextId))||(e.kind==='class'&&e.source==='class_sessions'&&s.classEnrollments.some(p=>p.playerId===me&&p.sessionId===e.contextId&&p.status!=='cancelled'));}
