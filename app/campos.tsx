import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { Badge } from '@/components/ui/Badge';
import { FieldDirectoryEditor } from '@/components/FieldDirectoryEditor';
import { hubStyles as st } from '@/components/PlayHubPanels';
import { colors, spacing } from '@/constants/theme';
import { getSport, useSports } from '@/constants/sports';
import { getCurrentLocation } from '@/lib/location';
import { directorySession, searchFieldDirectory, phoneLink, routeLink, type DirectoryRow, type DirectorySearch } from '@/lib/fieldDirectory';
import { isMockMode } from '@/lib/supabase';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import type { GeoPoint } from '@/types';

export default function NearbyFieldsScreen() {
  const params=useLocalSearchParams<{manage?:string}>();const role=usePlatformAdmin();const admin=role==='owner'||role==='admin';
  const sports=useSports();const me=useAppStore(s=>s.currentPlayerId);const auth=useAuthStore(s=>s.authUserId);const logged=useAuthStore(s=>s.isLoggedIn);
  const [manage,setManage]=useState(params.manage==='1');const [origin,setOrigin]=useState<GeoPoint|null>(null);const [query,setQuery]=useState('');const [radius,setRadius]=useState(20);const [sport,setSport]=useState<string|null>(null);
  const [rows,setRows]=useState<DirectoryRow[]>([]);const [total,setTotal]=useState(0);const [notice,setNotice]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const epoch=useRef(0);const lastSearch=useRef<DirectorySearch|null>(null);const key=directorySession();const [forKey,setForKey]=useState<string|null>(null);
  async function search(search:DirectorySearch,append=false){const n=++epoch.current;const session=directorySession();setBusy(true);setError('');if(!append){setRows([]);setTotal(0);}try{const result=await searchFieldDirectory(search);if(n!==epoch.current||session!==directorySession())return;setRows(prev=>append?[...prev,...result.entries]:result.entries);setTotal(result.total);setForKey(session);lastSearch.current={...search,offset:0};}catch(e){if(n===epoch.current){setError(e instanceof Error?e.message:'Falha ao buscar.');setRows([]);setTotal(0);}}finally{if(n===epoch.current)setBusy(false);}}
  useEffect(()=>{setOrigin(null);setRows([]);setForKey(null);setNotice('');lastSearch.current=null;void search({origin:null,radius:20,query:'',sportId:null});return()=>{epoch.current++;};},[me,auth,logged]);
  async function locate(){const n=++epoch.current;const session=directorySession();setBusy(true);setNotice('');try{const point=await getCurrentLocation();if(n!==epoch.current||session!==directorySession())return;if(!point){setOrigin(null);setNotice('GPS indisponível ou sem permissão. Busque pelo bairro ou cidade; não mostramos uma distância inventada.');await search({origin:null,radius,query,sportId:sport});return;}setOrigin(point);setNotice('Distância em linha reta, não tempo de viagem. Seu ponto não é salvo no perfil.');await search({origin:point,radius,query,sportId:sport});}catch(e){if(n===epoch.current)setError(e instanceof Error?e.message:'Localização indisponível.');}finally{if(n===epoch.current)setBusy(false);}}
  async function open(url:string){try{await Linking.openURL(url);}catch{setError('Não foi possível abrir. Use o telefone exibido na ficha.');}}
  const visible=key&&forKey===key?rows:[];
  return <Screen contentStyle={{gap:spacing.sm}}><Button small variant="ghost" label="Voltar" onPress={()=>router.back()} /><Text style={styles.heading}>Campos perto de você</Text><Text style={st.copy}>Cadastrados no BoraJogo primeiro; os mais próximos dentro de cada grupo. O raio vale para ambos. Cadastro não é anúncio nem garantia de disponibilidade.</Text>
    {isMockMode&&<Text style={st.copy}>Demonstração: campos e telefones de exemplo. Não são um catálogo real da sua cidade.</Text>}
    <View style={st.row}><Button small label="Usar minha localização" loading={busy} disabled={busy} onPress={()=>void locate()} />{origin&&<Button small variant="ghost" label="Limpar minha localização" disabled={busy} onPress={()=>{setOrigin(null);setNotice('Sem GPS: ordenação por cadastro e nome.');void search({origin:null,radius,query,sportId:sport});}} />}</View>
    <Text style={st.copy}>{origin?'Filtrando pelo raio selecionado.':'Sem localização: busque por bairro/cidade; a lista não está ordenada por distância.'}</Text>
    <View style={st.row}>{[5,10,20,50,100].map(km=><Button key={km} small variant={radius===km?'primary':'outline'} label={`${km} km`} disabled={busy} onPress={()=>{setRadius(km);void search({origin,radius:km,query,sportId:sport});}} />)}</View>
    <TextField label="Nome, bairro ou cidade" value={query} onChangeText={setQuery} maxLength={120} placeholder="Ex.: Centro, Goiânia" />
    <View style={st.row}><Button small label="Todos os esportes" variant={!sport?'primary':'outline'} disabled={busy} onPress={()=>{setSport(null);void search({origin,radius,query,sportId:null});}} />{sports.map(s=><Button key={s.id} small label={`${s.icon} ${s.label}`} variant={sport===s.id?'primary':'outline'} disabled={busy} onPress={()=>{setSport(s.id);void search({origin,radius,query,sportId:s.id});}} />)}</View>
    <Button small variant="outline" label="Buscar campos" disabled={busy} onPress={()=>void search({origin,radius,query,sportId:sport})} />
    {!!notice&&<Text accessibilityLiveRegion="polite" style={st.copy}>{notice}</Text>}{!!error&&<Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
    <Text style={st.copy}>{visible.length} de {total} campos na última busca.</Text>
    {([true,false] as const).map(registered=>{const group=visible.filter(e=>e.registered===registered);return group.length?<View key={String(registered)} style={{gap:spacing.sm}}><Text style={st.title}>{registered?'Cadastrados no BoraJogo':'Contato direto'}</Text>{group.map(e=><Card key={e.id} style={st.card}>
      <View style={st.row}><Text style={[st.title,{flex:1}]}>{getSport(e.sportId).icon} {e.name}</Text><Text style={st.copy}>{e.distanceKm===null?'Distância indisponível':`${e.distanceKm<1?e.distanceKm.toFixed(1):e.distanceKm.toFixed(0)} km`}</Text></View>
      <Badge label={e.registered?'Cadastrado no BoraJogo':'Contato direto · sem reserva online'} color={e.registered?colors.success:colors.textMuted} />
      <Text style={st.copy}>{e.address}</Text><Text selectable style={st.copy}>{e.phone} · {getSport(e.sportId).label}</Text><Text style={st.copy}>Ficha atualizada em {new Date(e.updatedAt).toLocaleDateString('pt-BR')}</Text>
      <View style={st.row}><Button small variant="outline" label="Ligar" accessibilityLabel={`Ligar para ${e.name}`} onPress={()=>void open(phoneLink(e.phone))} />{e.whatsapp&&<Button small variant="outline" label="WhatsApp" accessibilityLabel={`WhatsApp de ${e.name}`} onPress={()=>void open(phoneLink(e.phone,true))} />}<Button small variant="ghost" label="Ver rota" accessibilityLabel={`Ver rota para ${e.name}`} onPress={()=>void open(routeLink(e))} /></View>
      {e.online&&e.fieldId?<Button small label="Ver horários no app" accessibilityLabel={`Ver horários no app de ${e.name}`} onPress={()=>router.push({pathname:'/bora',params:{fieldId:e.fieldId!}})} />:<Text style={st.copy}>Agendamento diretamente com o local. Não há horários online disponíveis nesta ficha.</Text>}
    </Card>)}</View>:null;})}
    {!busy&&!error&&!visible.length&&<Text style={st.copy}>Nenhum campo publicado corresponde à busca. Tente outro bairro, esporte ou raio.</Text>}
    {visible.length<total&&lastSearch.current&&<Button small variant="outline" label="Carregar mais campos" loading={busy} disabled={busy} onPress={()=>void search({...lastSearch.current!,offset:visible.length},true)} />}
    {admin&&<Button small variant="outline" label={manage?'Fechar gestão do catálogo':'Adicionar ou editar campos'} onPress={()=>setManage(!manage)} />}{admin&&manage&&<FieldDirectoryEditor admin />}
  </Screen>;
}
const styles=StyleSheet.create({heading:{fontSize:21,fontWeight:'800',color:colors.text},error:{fontSize:12,color:colors.danger}});
