import { useState } from 'react';
import { router } from 'expo-router';
import { Switch, Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { hubStyles, usePlayHub } from '@/components/PlayHubPanels';
import { usePlayHubStore } from '@/store/usePlayHubStore';
export default function StartScreen(){
  usePlayHub();const [persona,setPersona]=useState('player');const [suggestions,setSuggestions]=useState(false);const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  async function start(){setBusy(true);try{await usePlayHubStore.getState().act('onboarding',{persona,suggestionsEnabled:suggestions});router.push(persona==='player'?'/descobrir':persona==='team'?'/criar-pelada':'/estabelecimento');}catch(e){setNotice(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setBusy(false);}}
  return <Screen><Button small variant="ghost" label="Voltar" onPress={()=>router.back()} /><Card style={hubStyles.card}><Text style={hubStyles.title}>Como você quer começar?</Text><Text style={hubStyles.copy}>Você pode usar os três perfis com a mesma conta. Essa escolha só define o primeiro passo.</Text>
    {[['player','Quero jogar','Encontre uma partida, solicite entrada e aguarde a aprovação.'],['team','Organizo um time','Crie o time, convide a galera e agende o primeiro jogo.'],['venue','Tenho um campo ou quadra','Cadastre o espaço, seus campos e publique um horário de oportunidade.']].map(([id,title,copy])=><View key={id}><Button variant={persona===id?'primary':'outline'} label={title} onPress={()=>setPersona(id)} /><Text style={hubStyles.copy}>{copy}</Text></View>)}
    <View style={hubStyles.row}><Switch accessibilityLabel="Sugestões de horários dentro do app" value={suggestions} onValueChange={setSuggestions} /><Text style={hubStyles.copy}>Quero sugestões de horários dentro do app.</Text></View><Text style={hubStyles.copy}>Não ativa mensagens WhatsApp nem notificações push. Você pode mudar esta preferência voltando aqui.</Text>
    <Button label="Salvar e começar" loading={busy} onPress={()=>void start()} />{!!notice&&<Text style={hubStyles.copy}>{notice}</Text>}
  </Card></Screen>;
}
