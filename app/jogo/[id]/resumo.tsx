import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Share, Switch, Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { hubStyles as st } from '@/components/PlayHubPanels';
import { getGameRecap, voteHighlight, allowRecapName, type GameRecap } from '@/lib/gameRecap';
import { shareViewAsImage } from '@/lib/shareImage';
import { colors } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { useAppStore } from '@/store/useAppStore';

export default function RecapScreen(){
  const {id}=useLocalSearchParams<{id:string}>();const me=useAppStore(s=>s.currentPlayerId);const [recap,setRecap]=useState<GameRecap|null>(null);const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const image=useRef<View>(null);
  useEffect(()=>{let live=true;setRecap(null);void getGameRecap(id).then(r=>{if(live)setRecap(r);}).catch(e=>{if(live)setNotice(e.message);});return()=>{live=false;};},[id,me]);
  async function run(fn:()=>Promise<unknown>){setBusy(true);try{await fn();setRecap(await getGameRecap(id));setNotice('Atualizado.');}catch(e){setNotice(e instanceof Error?e.message:'Não foi possível concluir.');}finally{setBusy(false);}}
  const sport=getSport(recap?.sportId);const top=recap?.highlights[0];const tie=!!top&&recap!.highlights.filter(h=>h.votes===top.votes).length>1;
  return <Screen><Button small variant="ghost" label="Voltar ao jogo" onPress={()=>router.back()} /><Text style={st.title}>Resenha do jogo</Text>{!!notice&&<Text style={st.copy}>{notice}</Text>}{recap&&<>
    <View ref={image} collapsable={false} style={{backgroundColor:colors.card,padding:24,borderRadius:18,borderWidth:1,borderColor:sport.color,gap:12}}><Text style={{color:sport.color,fontSize:12,fontWeight:'900'}}>BORAJOGO · {sport.label.toUpperCase()}</Text><Text style={{color:colors.text,fontSize:23,fontWeight:'900'}}>{recap.name}</Text><Text style={st.copy}>{new Date(recap.date).toLocaleDateString('pt-BR')} · {recap.rounds.length} rodadas finalizadas</Text>
      {recap.rounds.map(r=><View key={r.id} style={{flexDirection:'row',justifyContent:'space-between',gap:8}}><Text style={st.copy}>{r.teamA} × {r.teamB}</Text><Text style={st.title}>{r.scoreA} : {r.scoreB}</Text></View>)}
      <Text style={st.copy}>{recap.participants.length?`${recap.participants.length} participantes com escalação registrada`:'Escalações históricas não disponíveis; não estimamos participação.'}</Text>
      {recap.participants.filter(p=>recap.consentedIds.includes(p.id)).length>0&&<Text style={st.copy}>Com autorização: {recap.participants.filter(p=>recap.consentedIds.includes(p.id)).map(p=>p.name).join(' · ')}</Text>}
      {top&&!tie&&recap.consentedIds.includes(top.id)&&<Text style={st.title}>Destaque da galera: {top.name} · {top.votes} voto(s)</Text>}
      <Text style={st.copy}>Organize seu próximo encontro no BoraJogo.</Text>
    </View><Text style={st.copy}>A imagem não inclui localização, telefone, próximo horário privado nem nomes sem autorização individual. O compartilhamento é voluntário.</Text>
    <View style={st.row}><Button small label="Compartilhar imagem" disabled={busy} onPress={()=>void run(()=>shareViewAsImage(image,'borajogo-resumo'))} /><Button small variant="outline" label="Compartilhar convite do app" onPress={()=>void Share.share({message:`Jogamos ${recap.rounds.length} rodadas com ${recap.name}! Bora jogar? ${process.env.EXPO_PUBLIC_APP_WEB_URL??'BoraJogo'}`}).catch(()=>setNotice('Não foi possível compartilhar.'))} /></View>
    <Card style={st.card}><Text style={st.title}>Destaque escolhido pelos participantes</Text><Text style={st.copy}>Um voto por pessoa, editável. Empates aparecem como empate; não escolhemos um vencedor arbitrário.</Text>{top&&<Text style={st.copy}>{tie?'Votação empatada':`${top.name} lidera`} · {top.votes} voto(s)</Text>}<View style={st.row}>{recap.participants.map(p=><Button key={p.id} small variant="outline" label={`Votar em ${p.name}`} disabled={busy||!recap.participants.some(p=>p.id===me)} onPress={()=>void run(()=>voteHighlight(id,p.id))} />)}</View>
      <View style={st.row}><Switch accessibilityLabel="Permitir meu nome na imagem deste jogo" value={recap.consentedIds.includes(me)} disabled={busy} onValueChange={allow=>void run(()=>allowRecapName(id,allow))} /><Text style={st.copy}>Permitir meu nome na imagem deste jogo.</Text></View><Text style={st.copy}>Revogar impede novas imagens com seu nome; não apaga imagens já compartilhadas.</Text>
    </Card>{recap.nextGame&&<Card><Text style={st.title}>Próximo encontro do seu time</Text><Text style={st.copy}>{new Date(recap.nextGame).toLocaleString('pt-BR')} — informação interna, fora da imagem pública.</Text></Card>}
  </>}</Screen>;
}
