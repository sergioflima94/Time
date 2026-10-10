import { isMockMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
export interface GameRecap {name:string;sportId:string;date:string;nextGame:string|null;consentedIds:string[];participants:Array<{id:string;name:string}>;rounds:Array<{id:string;teamA:string;teamB:string;scoreA:number;scoreB:number}>;highlights:Array<{id:string;name:string;votes:number}>}
let votes:Record<string,Record<string,string>>={};let consents:Record<string,string[]>={};let hydrated=false;
async function hydrate(){if(hydrated)return;hydrated=true;try{const raw=await AsyncStorage.getItem('borajogo-recap-demo-v1');if(raw){const x=JSON.parse(raw);votes=x.votes??{};consents=x.consents??{};}}catch{/* Demo only */}}
async function save(){await AsyncStorage.setItem('borajogo-recap-demo-v1',JSON.stringify({votes,consents}));}
export async function getGameRecap(id:string):Promise<GameRecap>{
  if(!isMockMode){if(!supabase)throw new Error('Backend indisponível.');const {data,error}=await supabase.rpc('game_recap',{p_game:id});if(error)throw new Error(error.message);return data as unknown as GameRecap;}
  await hydrate();const s=useAppStore.getState();const g=s.games.find(g=>g.id===id);if(!g||g.status!=='finished'||!s.memberships.some(m=>m.peladaId===g.peladaId&&m.playerId===s.currentPlayerId&&m.active))throw new Error('Finalize o jogo; resumo exclusivo dos membros do time.');
  const p=s.peladas.find(p=>p.id===g.peladaId)!;const turns=s.matchTurns.filter(t=>t.gameId===id&&t.endedAt);const ids=new Set(turns.flatMap(t=>t.rosterSnapshot?.map(r=>r.playerId)??[]));
  const totals:Record<string,number>={};Object.values(votes[id]??{}).forEach(p=>totals[p]=(totals[p]??0)+1);
  return {name:p.name,sportId:p.sportId,date:g.scheduledAt,nextGame:s.games.filter(x=>x.peladaId===p.id&&Date.parse(x.scheduledAt)>Date.now()&&['open','full'].includes(x.status)).sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt))[0]?.scheduledAt??null,consentedIds:consents[id]??[],participants:s.players.filter(x=>ids.has(x.id)).map(x=>({id:x.id,name:x.name})),rounds:turns.map(t=>({id:t.id,teamA:s.teams.find(x=>x.id===t.teamAId)?.name??'Time A',teamB:s.teams.find(x=>x.id===t.teamBId)?.name??'Time B',scoreA:s.goals.filter(g=>g.matchTurnId===t.id&&g.teamId===t.teamAId).length,scoreB:s.goals.filter(g=>g.matchTurnId===t.id&&g.teamId===t.teamBId).length})),highlights:Object.entries(totals).map(([id,votes])=>({id,votes,name:s.players.find(p=>p.id===id)?.name??'Jogador'})).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name))};
}
export async function voteHighlight(gameId:string,playerId:string){
  if(!isMockMode){if(!supabase)throw new Error('Backend indisponível.');const {error}=await supabase.rpc('vote_game_highlight',{p_game:gameId,p_player:playerId});if(error)throw new Error(error.message);return;}
  const recap=await getGameRecap(gameId);const me=useAppStore.getState().currentPlayerId;if(!recap.participants.some(p=>p.id===me)||!recap.participants.some(p=>p.id===playerId))throw new Error('A votação requer participação registrada.');(votes[gameId]??={})[me]=playerId;await save();
}
export async function allowRecapName(gameId:string,allow:boolean){
  if(!isMockMode){if(!supabase)throw new Error('Backend indisponível.');const {error}=await supabase.rpc('set_recap_consent',{p_game:gameId,p_allow:allow});if(error)throw new Error(error.message);return;}
  await getGameRecap(gameId);const me=useAppStore.getState().currentPlayerId;consents[gameId]=(consents[gameId]??[]).filter(p=>p!==me);if(allow)consents[gameId].push(me);await save();
}
