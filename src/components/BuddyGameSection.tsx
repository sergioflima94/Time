import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { hubStyles as st, usePlayHub } from '@/components/PlayHubPanels';
import { usePlayHubStore } from '@/store/usePlayHubStore';
import { useAppStore } from '@/store/useAppStore';
export function BuddyGameSection({gameId,admin=false}:{gameId:string;admin?:boolean}){
  const {data,error}=usePlayHub();const me=useAppStore(s=>s.currentPlayerId);const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  const rows=data.buddies.filter(b=>b.game_id===gameId&&(admin||b.host_player_id===me||b.buddy_player_id===me));
  async function run(action:string,p:Record<string,unknown>){setBusy(true);try{await usePlayHubStore.getState().act(action,p);setNotice('Atualizado. A dupla só entra após aprovação com duas vagas.');}catch(e){setNotice(e instanceof Error?e.message:'Falha ao responder.');}finally{setBusy(false);}}
  async function share(code:string){const base=process.env.EXPO_PUBLIC_APP_WEB_URL?.replace(/\/$/,'');const url=base?`${base}/descobrir?buddyCode=${encodeURIComponent(code)}`:Linking.createURL('/descobrir',{queryParams:{buddyCode:code}});await Share.share({message:`Vamos jogar juntos? Confirme seu interesse no BoraJogo: ${url}`});}
  return <>{rows.map(b=><Card key={b.id} style={st.card}><Text style={st.title}>{b.host_name}{b.buddy_name?` + ${b.buddy_name}`:' · aguardando amigo'}</Text><Text style={st.copy}>Dupla · {b.status==='invited'?'Convite criado':b.status==='pending'?'Aguardando organizador':b.status==='accepted'?'Dupla aprovada':b.status==='declined'?'Recusada':'Cancelada'} · prazo {new Date(b.expires_at).toLocaleString('pt-BR')}</Text>
    {['invited','pending'].includes(b.status)&&Date.parse(b.expires_at)>Date.now()&&<View style={st.row}>{admin&&b.status==='pending'&&<><Button small label="Aprovar dupla" disabled={busy} onPress={()=>void run('buddy_respond',{id:b.id,accept:true})} /><Button small variant="outline" label="Recusar dupla" disabled={busy} onPress={()=>void run('buddy_respond',{id:b.id,accept:false})} /></>}{b.host_player_id===me&&<><Button small variant="outline" label="Compartilhar convite do amigo" onPress={()=>void share(b.code).catch(()=>setNotice('Não foi possível compartilhar.'))} /><Button small variant="ghost" label="Cancelar convite da dupla" disabled={busy} onPress={()=>void run('buddy_cancel',{id:b.id})} /></>}</View>}
  </Card>)}{!!(notice||error)&&<Text style={st.copy}>{notice||error}</Text>}</>;
}
