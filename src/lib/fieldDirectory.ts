import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isMockMode } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useSportCatalog } from '@/constants/sports';
import { recordDemoPlatformAudit } from '@/store/usePlatformStore';
import { findBookingConflicts } from '@/lib/fieldBooking';
import type { Json } from '@/types/supabase.generated';

import { rankDirectory, validateDirectoryInput, type DirectoryInput, type DirectoryRow, type ManagedEntry, type DirectorySearch, type DirectoryManagement, type LinkableField } from '@/lib/fieldDirectoryRules';
export * from '@/lib/fieldDirectoryRules';

const CACHE='borajogo-field-directory-demo-v1';
let demo: ManagedEntry[]=[];let hydration: Promise<void>|null=null;
let assistedStatuses=new Map<string,string>();
export function directorySession() { const auth=useAuthStore.getState(); return auth.isLoggedIn ? isMockMode?`demo:${useAppStore.getState().currentPlayerId}`:auth.authUserId : null; }
async function hydrateDemo() {
  if (!hydration) hydration=(async()=>{
    const saved=await AsyncStorage.getItem(CACHE);
    if(saved){try{demo=JSON.parse(saved);return;}catch{/* Seed only for the demo. */}}
    const at=new Date().toISOString();
    demo=[
      {id:'directory-f1',fieldId:'f1',name:'Arena Society Central',address:'Rua das Palmeiras, 123 · Centro',sportId:'futebol',phone:'11988880002',whatsapp:true,latitude:-23.5889,longitude:-46.651,online:true,active:true,revision:1,updatedAt:at},
      {id:'directory-f2',fieldId:'f2',name:'Quadra 1 · Vila Nova',address:'Av. Vila Nova, 500 · Vila Nova',sportId:'futebol',phone:'11988880001',whatsapp:false,latitude:-23.596,longitude:-46.645,online:false,active:true,revision:1,updatedAt:at},
      {id:'directory-contact1',fieldId:null,name:'Campo do Bairro · exemplo',address:'Rua do Esporte, 10 · Centro',sportId:'futebol',phone:'11900000001',whatsapp:false,latitude:-23.589,longitude:-46.65,online:false,active:true,revision:1,updatedAt:at},
      {id:'directory-contact2',fieldId:null,name:'Quadra Comunitária · exemplo',address:'Praça dos Amigos, 20 · Vila Nova',sportId:'volei',phone:'11900000002',whatsapp:true,latitude:-23.6,longitude:-46.64,online:false,active:true,revision:1,updatedAt:at},
    ];
  })();await hydration;
  try{const venues=JSON.parse(await AsyncStorage.getItem('borajogo-play-hub-demo-v1')??'{}').data?.venues??[];assistedStatuses=new Map(venues.map((v:{establishment_id:string;status:string})=>[v.establishment_id,v.status]));}catch{assistedStatuses=new Map();}
}
function demoRegistered(fieldId:string|null) {
  const app=useAppStore.getState();const f=app.fields.find(f=>f.id===fieldId);const e=app.establishments.find(e=>e.id===f?.establishmentId);
  if(!e)return false;
  // Prepared demo venues are not claimed until the recipient accepts.
  return (!assistedStatuses.has(e.id)||assistedStatuses.get(e.id)==='accepted') && app.players.some(p=>p.id===e.ownerPlayerId&&!p.isGuest);
}
export async function searchFieldDirectory(search: DirectorySearch): Promise<{entries: DirectoryRow[];total:number}> {
  if(!directorySession())throw new Error('Entre no aplicativo.');rankDirectory([],search);
  if (!isMockMode && supabase) {
    const {data,error}=await supabase.rpc('search_field_directory',{p_lat:search.origin?.latitude,p_lng:search.origin?.longitude,p_radius:search.radius,p_query:search.query,p_sport:search.sportId??undefined,p_offset:search.offset??0});
    if(error)throw new Error(error.message);return data as unknown as {entries:DirectoryRow[];total:number};
  }
  await hydrateDemo();let slots:Array<{field_id:string;active:boolean;starts_at:string;duration_minutes:number}>=[];
  try{slots=JSON.parse(await AsyncStorage.getItem('borajogo-play-hub-demo-v1')??'{}').data?.slots??[];}catch{/* No demo opportunities. */}
  const available=(s:typeof slots[number])=>{const at=new Date(s.starts_at);return findBookingConflicts(useAppStore.getState().fieldBookings,{fieldId:s.field_id,recurrence:'single',dayOfWeek:null,date:`${at.getFullYear()}-${String(at.getMonth()+1).padStart(2,'0')}-${String(at.getDate()).padStart(2,'0')}`,time:`${String(at.getHours()).padStart(2,'0')}:${String(at.getMinutes()).padStart(2,'0')}`,durationMinutes:s.duration_minutes}).length===0;};
  const rows=rankDirectory(demo.map(e=>({...e,registered:demoRegistered(e.fieldId),online:e.online&&demoRegistered(e.fieldId)&&slots.some(s=>s.field_id===e.fieldId&&s.active&&Date.parse(s.starts_at)>Date.now()&&available(s)),distanceKm:null})),search);
  return {entries:rows.slice(search.offset??0,(search.offset??0)+60),total:rows.length};
}
export async function manageFieldDirectory(): Promise<DirectoryManagement> {
  if(!directorySession())throw new Error('Entre no aplicativo.');
  if(!isMockMode&&supabase){const {data,error}=await supabase.rpc('manage_field_directory');if(error)throw new Error(error.message);
    const raw=data as unknown as {entries:Array<Record<string,unknown>>;fields:LinkableField[]};
    return {fields:raw.fields,entries:raw.entries.map(e=>({id:String(e.id),fieldId:e.field_id as string|null,name:String(e.name),address:String(e.address),sportId:String(e.sport_id),phone:String(e.phone),whatsapp:Boolean(e.whatsapp),latitude:Number(e.latitude),longitude:Number(e.longitude),online:Boolean(e.online_requested),active:Boolean(e.active),revision:Number(e.revision),updatedAt:String(e.updated_at)}))};
  }
  await hydrateDemo();const app=useAppStore.getState();const admin=app.currentPlayerId==='p1';
  const fields=app.fields.filter(f=>demoRegistered(f.id)&&(admin||app.establishments.some(e=>e.id===f.establishmentId&&e.ownerPlayerId===app.currentPlayerId)));
  return {entries:demo.filter(e=>admin||fields.some(f=>f.id===e.fieldId)),fields:fields.map(f=>({id:f.id,name:f.name,address:f.address,sportId:f.sportId,latitude:f.location?.latitude??null,longitude:f.location?.longitude??null,establishmentName:app.establishments.find(e=>e.id===f.establishmentId)!.name}))};
}
export async function saveFieldDirectory(id:string|null,revision:number,d:DirectoryInput,reason:string) {
  const key=directorySession();if(!key)throw new Error('Entre no aplicativo.');validateDirectoryInput(d);
  if(reason.trim().length<8||reason.trim().length>500)throw new Error('Informe motivo de 8 a 500 caracteres.');
  // PostgreSQL accepts NULL for a new entry; generated RPC types do not encode nullable required arguments.
  if(!isMockMode&&supabase){const {data,error}=await supabase.rpc('save_field_directory',{p_id:id!,p_revision:revision,p_data:d as unknown as Json,p_reason:reason});if(error)throw new Error(error.message);return String(data);}
  const managed=await manageFieldDirectory();const admin=useAppStore.getState().currentPlayerId==='p1';const old=demo.find(e=>e.id===id);
  if(id&&(!old||!managed.entries.some(e=>e.id===id)))throw new Error('Sem permissão.');
  if(revision!==(old?.revision??0))throw new Error('Cadastro alterado. Atualize antes de salvar.');
  if(!admin&&(!d.fieldId||!managed.fields.some(f=>f.id===d.fieldId)||(old&&old.fieldId!==d.fieldId)))throw new Error('Somente administrador cria contato; donos publicam seus próprios campos.');
  if(d.fieldId&&!managed.fields.some(f=>f.id===d.fieldId&&f.sportId===d.sportId))throw new Error('Campo ou esporte incompatível.');
  if(!useSportCatalog.getState().catalog.some(s=>s.id===d.sportId))throw new Error('Esporte inválido.');
  if(demo.some(e=>e.id!==id&&((d.fieldId&&e.fieldId===d.fieldId)||(e.active&&d.active&&e.name.trim().toLowerCase()===d.name.trim().toLowerCase()&&e.address.trim().toLowerCase()===d.address.trim().toLowerCase()&&e.sportId===d.sportId))))throw new Error('Este campo já está na lista. Edite o cadastro existente.');
  const result=id??`directory-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  demo=[...demo.filter(e=>e.id!==id),{...d,name:d.name.trim(),address:d.address.trim(),phone:d.phone.replace(/\D/g,''),id:result,revision:revision+1,updatedAt:new Date().toISOString()}];
  await AsyncStorage.setItem(CACHE,JSON.stringify(demo));await recordDemoPlatformAudit('field_directory',result,reason);return result;
}
