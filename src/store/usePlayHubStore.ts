import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isMockMode, supabase } from '@/lib/supabase';
import { emptyPlayHub, compatibleWindows, validateSlot, validateWindow, type PlayHubSnapshot } from '@/lib/playHub';
import { useAppStore } from './useAppStore';
import { useAuthStore } from './useAuthStore';
import type { Json } from '@/types/supabase.generated';
import { demoGamePublished } from '@/lib/discovery';
import { usePlatformStore, recordDemoPlatformAudit } from './usePlatformStore';

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c => { const n=Math.floor(Math.random()*16); return (c==='x'?n:(n&3)|8).toString(16); });
let demo = emptyPlayHub();
const prefs = new Map<string,PlayHubSnapshot['onboarding']>();
let hydration: Promise<void> | null = null;
let loadEpoch=0;
async function hydrate() { if(!hydration) hydration=(async()=>{try {const raw=await AsyncStorage.getItem('borajogo-play-hub-demo-v1'); if(raw){const saved=JSON.parse(raw); demo={...emptyPlayHub(),...saved.data}; Object.entries(saved.prefs??{}).forEach(([k,v])=>prefs.set(k,v as PlayHubSnapshot['onboarding']));}} catch{/* Demo cache only. */}})(); await hydration; }
function session() { const auth=useAuthStore.getState(); return auth.isLoggedIn ? isMockMode ? `demo:${useAppStore.getState().currentPlayerId}` : auth.authUserId : null; }
interface State { data: PlayHubSnapshot; accessFor: string | null; loading: boolean; error: string; load:()=>Promise<void>; act:(action:string,payload:Record<string,unknown>)=>Promise<Record<string,string>> }
export const usePlayHubStore = create<State>((set,get)=>({
  data:emptyPlayHub(),accessFor:null,loading:false,error:'',
  load:async()=>{
    const epoch=++loadEpoch;
    const key=session(); if(!key){set({data:emptyPlayHub(),accessFor:null});return;}
    set({loading:true,error:'',data:get().accessFor===key?get().data:emptyPlayHub()});
    try {
      let data: PlayHubSnapshot;
      if(isMockMode){
        await hydrate(); const app=useAppStore.getState(); const me=app.currentPlayerId;
        data={...demo,
          venues:demo.venues.filter(v=>me==='p1'||v.target_player_id===me),
          buddies:demo.buddies.filter(b=>b.host_player_id===me||b.buddy_player_id===me||app.isAdmin(me,app.games.find(g=>g.id===b.game_id)?.peladaId??'')),
          slots:demo.slots.filter(s=>s.active&&Date.parse(s.starts_at)>Date.now()&&free(s)),
          windows:demo.windows.filter(w=>w.active&&Date.parse(w.ends_at)>Date.now()),
          requests:demo.requests.filter(r=>app.isAdmin(me,r.pelada_id)||app.isAdmin(me,r.opponent_pelada_id??'')||app.establishments.some(e=>e.id===demo.slots.find(s=>s.id===r.slot_id)?.establishment_id&&e.ownerPlayerId===me)),
          onboarding:prefs.get(me)??null};
      } else {
        if(!supabase)throw new Error('Backend indisponível.');
        const {data:rows,error}=await supabase.rpc('growth_snapshot'); if(error)throw new Error(error.message); data=rows as unknown as PlayHubSnapshot;
      }
      if(session()===key&&epoch===loadEpoch)set({data,accessFor:key,loading:false});
    }catch(e){if(session()===key&&epoch===loadEpoch)set({data:emptyPlayHub(),accessFor:key,loading:false,error:e instanceof Error?e.message:'Falha ao carregar.'});}
  },
  act:async(action,payload)=>{
    const key=session(); if(!key)throw new Error('Entre no aplicativo.');
    let result:Record<string,string>={};
    if(!isMockMode){
      if(!supabase)throw new Error('Backend indisponível.');
      const {data,error}=await supabase.rpc('growth_action',{p_action:action,p_data:payload as Json}); if(error)throw new Error(error.message); result=(data??{}) as Record<string,string>;
    }else{
      await hydrate();
      if(action==='buddy_create'&&!await demoGamePublished(String(payload.gameId)))throw new Error('Jogo indisponível.');
      if(action==='buddy_join'){const b=demo.buddies.find(b=>b.code===payload.code);if(!b||!await demoGamePublished(b.game_id))throw new Error('Convite indisponível.');}
      if(action==='buddy_create'||action==='buddy_join'){
        const gameId=action==='buddy_create'?String(payload.gameId):demo.buddies.find(b=>b.code===payload.code)!.game_id;
        const cache=JSON.parse(await AsyncStorage.getItem('borajogo-discovery-demo-v1')??'{}');
        if(cache.requests?.some((entry:[string,{gameId:string;playerId:string;status:string}])=>entry[1].gameId===gameId&&entry[1].playerId===useAppStore.getState().currentPlayerId&&entry[1].status==='pending'))throw new Error('Você já tem solicitação individual pendente.');
      }
      result=demoAction(action,payload); await AsyncStorage.setItem('borajogo-play-hub-demo-v1',JSON.stringify({data:demo,prefs:Object.fromEntries(prefs)}));
      if(action.startsWith('venue_'))await recordDemoPlatformAudit(action,result.id??String(payload.establishmentId??''),String(payload.reason??'Resposta do responsável ao cadastro assistido'));
    }
    if(session()!==key)throw new Error('A conta mudou. Entre novamente.');
    await get().load(); return result;
  },
}));
function free(slot: {field_id:string;starts_at:string;duration_minutes:number}) {
  const start=new Date(slot.starts_at); const mins=start.getHours()*60+start.getMinutes();
  return !useAppStore.getState().fieldBookings.some(b=>b.fieldId===slot.field_id&&(b.recurrence==='weekly'?b.dayOfWeek===start.getDay():b.date===`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`)&&(()=>{const [h,m]=b.time.split(':').map(Number); return h*60+m<mins+slot.duration_minutes&&h*60+m+b.durationMinutes>mins;})());
}
function demoAction(action:string,p:Record<string,unknown>):Record<string,string>{
  const a=useAppStore.getState(); const me=a.currentPlayerId; const name=a.players.find(x=>x.id===me)?.name??'Jogador';
  const admin=(id:string)=>{if(!a.isAdmin(me,id))throw new Error('Somente o administrador deste time.');};
  const owner=(id:string)=>{if(!a.establishments.some(e=>e.id===id&&e.ownerPlayerId===me))throw new Error('Somente o dono do estabelecimento.');};
  const result:Record<string,string>={};
  if(action.startsWith('venue_')&&action!=='venue_respond'){
    if(me!=='p1')throw new Error('Somente a administração da plataforma.');
    if(String(p.reason??'').trim().length<8)throw new Error('Informe um motivo de pelo menos 8 caracteres.');
    if(action==='venue_create'){
      if(String(p.name??'').trim().length<3)throw new Error('Nome inválido.');
      const e=a.createEstablishment(me,{name:String(p.name).trim(),payoutMethod:'in_person',pixKey:null});
      demo.venues.push({establishment_id:e.id,name:e.name,target_player_id:null,status:'draft',revision:1,fields:[]}); result.id=e.id;
    }else{
      const v=demo.venues.find(v=>v.establishment_id===p.establishmentId); if(!v||v.status==='accepted'||v.revision!==p.revision)throw new Error('Cadastro mudou ou indisponível.');
      if(action==='venue_field'){const f=a.addEstablishmentField(v.establishment_id,me,{name:String(p.name),address:String(p.address??''),sportId:String(p.sportId)});v.fields.push({id:f.id,name:f.name,address:f.address,sport_id:f.sportId??'futebol'});}
      else if(action==='venue_availability'){const f=a.fields.find(f=>f.id===p.fieldId&&f.establishmentId===v.establishment_id);if(!f)throw new Error('Campo indisponível.');a.addFieldAvailability(f.id,{dayOfWeek:Number(p.dayOfWeek),startTime:String(p.startTime),endTime:String(p.endTime),slotMinutes:Number(p.slotMinutes),price:Number(p.price)});}
      else if(action==='venue_invite'){if(p.playerId===me||!a.players.some(x=>x.id===p.playerId&&!x.isGuest))throw new Error('Selecione outra conta cadastrada.');v.target_player_id=String(p.playerId);v.status='invited';}else throw new Error('Ação inválida.');
      v.revision++; result.id=v.establishment_id;
    }
  }else if(action==='venue_respond'){
    const v=demo.venues.find(v=>v.establishment_id===p.establishmentId);if(!v||v.target_player_id!==me||v.status!=='invited'||v.revision!==p.revision)throw new Error('Convite indisponível.');
    if(p.accept)useAppStore.setState(s=>({establishments:s.establishments.map(e=>e.id===v.establishment_id?{...e,ownerPlayerId:me,pixKey:null,payoutMethod:'in_person',whatsappOptIn:false}:e)}));
    v.status=p.accept?'accepted':'declined';v.revision++;
  }else if(action==='onboarding'){prefs.set(me,{persona:String(p.persona),completed:true,suggestions_enabled:Boolean(p.suggestionsEnabled)});
  }else if(action==='buddy_create'){
    const g=a.games.find(g=>g.id===p.gameId);if(!g||Date.parse(g.scheduledAt)<=Date.now()||!['open','full'].includes(g.status))throw new Error('Jogo indisponível.');
    if(a.attendances.some(x=>x.gameId===g.id&&x.playerId===me&&['confirmed','waitlist'].includes(x.status)))throw new Error('Você já está na chamada.');
    let b=demo.buddies.find(b=>b.game_id===g.id&&b.host_player_id===me&&['invited','pending'].includes(b.status));
    if(!b){b={id:uuid(),code:uuid(),game_id:g.id,host_player_id:me,buddy_player_id:null,status:'invited',expires_at:new Date(Math.min(Date.parse(g.scheduledAt),Date.now()+86400000)).toISOString(),host_name:name,buddy_name:null};demo.buddies.push(b);}result.id=b.id;result.code=b.code;
  }else if(action==='buddy_join'){
    const b=demo.buddies.find(b=>b.code===p.code);if(!b||b.status!=='invited'||b.host_player_id===me||Date.parse(b.expires_at)<=Date.now())throw new Error('Convite indisponível.');
    if(a.attendances.some(x=>x.gameId===b.game_id&&x.playerId===me&&['confirmed','waitlist'].includes(x.status)))throw new Error('Você já está na chamada.');
    b.buddy_player_id=me;b.buddy_name=name;b.status='pending';
  }else if(action==='buddy_cancel'||action==='buddy_respond'){
    const b=demo.buddies.find(b=>b.id===p.id);if(!b)throw new Error('Convite indisponível.');
    if(action==='buddy_cancel'){if(b.host_player_id!==me||!['invited','pending'].includes(b.status))throw new Error('Sem permissão.');b.status='cancelled';}
    else{const g=a.games.find(g=>g.id===b.game_id)!;admin(g.peladaId);if(b.status!=='pending'||!b.buddy_player_id)throw new Error('Dupla incompleta.');
      if(p.accept){if(Date.parse(b.expires_at)<=Date.now()||!['open','full'].includes(g.status))throw new Error('Chamada encerrada.');if(a.attendances.filter(x=>x.gameId===g.id&&x.status==='confirmed'&&![b.host_player_id,b.buddy_player_id].includes(x.playerId)).length+2>g.maxPlayers)throw new Error('São necessárias duas vagas.');for(const id of [b.host_player_id,b.buddy_player_id]){a.joinPeladaByCode(a.peladas.find(t=>t.id===g.peladaId)!.inviteCode,id);a.setAttendance(g.id,id,'confirmed');}}
      b.status=p.accept?'accepted':'declined';}
  }else if(action==='window_create'){
    validateWindow(String(p.startsAt),String(p.endsAt),String(p.level));
    admin(String(p.teamId));const t=a.peladas.find(t=>t.id===p.teamId)!;if(Date.parse(String(p.startsAt))<=Date.now()||Date.parse(String(p.endsAt))<=Date.parse(String(p.startsAt)))throw new Error('Janela inválida.');
    demo.windows.push({id:uuid(),pelada_id:t.id,team_name:t.name,sport_id:t.sportId,starts_at:String(p.startsAt),ends_at:String(p.endsAt),level:String(p.level),active:true});
  }else if(action==='slot_create'){
    validateSlot(String(p.startsAt),Number(p.durationMinutes),Number(p.regularPrice),Number(p.offerPrice));
    const f=a.fields.find(f=>f.id===p.fieldId);if(!f?.establishmentId)throw new Error('Campo indisponível.');owner(f.establishmentId);
    if(!(Number(p.offerPrice)>0&&Number(p.offerPrice)<Number(p.regularPrice))||Date.parse(String(p.startsAt))<=Date.now())throw new Error('Preço ou data inválidos.');
    const s={id:uuid(),field_id:f.id,field_name:f.name,address:f.address,establishment_id:f.establishmentId,sport_id:f.sportId??'futebol',starts_at:String(p.startsAt),duration_minutes:Number(p.durationMinutes),regular_price:Number(p.regularPrice),offer_price:Number(p.offerPrice),active:true};if(!free(s))throw new Error('Horário ocupado.');demo.slots.push(s);
  }else if(action==='slot_hide'){const s=demo.slots.find(s=>s.id===p.id)!;owner(s.establishment_id);s.active=false;
  }else if(action==='window_hide'){const w=demo.windows.find(w=>w.id===p.id)!;admin(w.pelada_id);w.active=false;
  }else if(action==='slot_request'){
    const s=demo.slots.find(s=>s.id===p.slotId);const t=a.peladas.find(t=>t.id===p.teamId);admin(String(p.teamId));if(!s?.active||!t||t.sportId!==s.sport_id||!free(s)||Date.parse(s.starts_at)<=Date.now())throw new Error('Horário indisponível.');
    if(demo.requests.some(r=>r.slot_id===s.id&&r.pelada_id===t.id&&['pending','confirmed'].includes(r.status)))return {};
    const o=a.peladas.find(t=>t.id===p.opponentId);if(p.opponentId&&(!o||!compatibleWindows(s,demo.windows,t.id).some(w=>w.pelada_id===o.id)))throw new Error('Adversário sem disponibilidade compatível.');
    demo.requests.push({id:uuid(),slot_id:s.id,pelada_id:t.id,team_name:t.name,opponent_pelada_id:o?.id??null,opponent_name:o?.name??null,opponent_accepted:false,status:'pending',price:s.offer_price,commission_percent:usePlatformStore.getState().settings.bookingCommissionPercent,field_name:s.field_name,starts_at:s.starts_at,match_id:null});
  }else if(['slot_respond','opponent_respond','request_cancel'].includes(action)){
    const r=demo.requests.find(r=>r.id===p.id);if(!r||r.status!=='pending')throw new Error('Pedido encerrado.');const s=demo.slots.find(s=>s.id===r.slot_id)!;
    if(action==='request_cancel'){admin(r.pelada_id);r.status='cancelled';}
    else if(action==='opponent_respond'){admin(r.opponent_pelada_id??'');r.opponent_accepted=Boolean(p.accept);if(!p.accept)r.status='declined';}
    else {owner(s.establishment_id);if(!p.accept){r.status='declined';return {};}if(r.opponent_pelada_id&&!r.opponent_accepted)throw new Error('Aguarde o outro time.');if(!s.active||!free(s)||Date.parse(s.starts_at)<=Date.now())throw new Error('Horário ocupado.');const d=new Date(s.starts_at);
      const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const time=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      a.addFieldBooking(s.establishment_id,me,{fieldId:s.field_id,peladaId:r.pelada_id,teamName:r.team_name,recurrence:'single',date,dayOfWeek:null,time,durationMinutes:s.duration_minutes,notes:'Oferta confirmada; pagamento separado'});
      if(r.opponent_pelada_id){const c=a.sendTeamChallenge(r.pelada_id,r.opponent_pelada_id,me,{proposedDate:date,proposedTime:time,fieldId:s.field_id,message:'Horário confirmado pelo campo'});a.respondTeamChallenge(c.id,true);r.match_id=useAppStore.getState().teamChallenges.find(x=>x.id===c.id)?.matchId??null;}
      r.status='confirmed';s.active=false;demo.requests.filter(x=>x.slot_id===s.id&&x.id!==r.id&&x.status==='pending').forEach(x=>x.status='declined');}
  }else throw new Error('Ação inválida.');
  return result;
}
