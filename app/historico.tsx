import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { historySession, readHistory } from '@/lib/history';
import { isMockMode } from '@/lib/supabase';
import { HISTORY_KINDS, HISTORY_SOURCES, historyChanges, historyPeriod, historyValue, type HistoryEntry, type HistoryKind, type HistoryQuery } from '@/lib/historyRules';

export default function HistoryScreen(){
  const params=useLocalSearchParams<{scope?:string;venueId?:string;kind?:string;contextId?:string}>();
  const scope=params.scope==='venue'?'venue':params.scope==='context'?'context':'mine';
  const me=useAppStore(s=>s.currentPlayerId);const auth=useAuthStore(s=>s.authUserId);const logged=useAuthStore(s=>s.isLoggedIn);
  const teams=useAppStore(useShallow(s=>s.peladas.filter(p=>s.memberships.some(m=>m.peladaId===p.id&&m.playerId===me&&m.active))));
  const venue=useAppStore(s=>s.establishments.find(e=>e.id===params.venueId));
  const venues=useAppStore(useShallow(s=>s.establishments.filter(e=>e.ownerPlayerId===me||s.establishmentStaff.some(staff=>staff.establishmentId===e.id&&staff.playerId===me&&staff.active&&staff.roles.some(r=>r==='manager'||r==='cashier')))));
  const fields=useAppStore(useShallow(s=>s.fields.filter(f=>scope==='venue'?f.establishmentId===params.venueId:s.games.some(g=>g.fieldId===f.id&&teams.some(t=>t.id===g.peladaId)))));
  const names=useAppStore(useShallow(s=>Object.fromEntries([...s.players.map(p=>[p.id,p.nickname||p.name]),...s.fields.map(f=>[f.id,f.name]),...s.teams.map(t=>[t.id,t.name]),...s.products.map(p=>[p.id,p.name]),...s.tabParticipants.map(p=>[p.id,p.name]),...s.teamAvailabilityPollOptions.map(p=>[p.id,p.label]),
    ...[...s.attendances,...s.payments,...s.playerFatigue,...s.classEnrollments].flatMap(row=>{const p=s.players.find(p=>p.id===row.playerId);return p?[[row.id,p.nickname||p.name]]:[];}),
    ...s.orderItemShares.flatMap(row=>{const p=s.tabParticipants.find(p=>p.id===row.participantId);return p?[[row.id,p.name]]:[];}),
    ...s.serviceOrderItems.flatMap(row=>{const p=s.products.find(p=>p.id===row.productId);return p?[[row.id,p.name]]:[];})])));
  const [kind,setKind]=useState<HistoryKind|undefined>(params.kind&&params.kind in HISTORY_KINDS?params.kind as HistoryKind:undefined);
  const [filters,setFilters]=useState(false);const [from,setFrom]=useState(''),[to,setTo]=useState('');
  const [period,setPeriod]=useState<{from?:string;to?:string}>({});const [teamId,setTeamId]=useState<string|undefined>();const [fieldId,setFieldId]=useState<string|undefined>();
  const [rows,setRows]=useState<HistoryEntry[]>([]);const [hasMore,setHasMore]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [forKey,setForKey]=useState<string|null>(null);const [refresh,setRefresh]=useState(0);
  const epoch=useRef(0);const key=historySession();const query:HistoryQuery={scope,venueId:params.venueId,kind,contextId:params.contextId,...period,teamId,fieldId};
  const queryRef=useRef(query);queryRef.current=query;
  const load=useCallback(async(append=false)=>{const n=++epoch.current,session=historySession();setBusy(true);setError('');if(!append){setRows([]);setHasMore(false);setForKey(null);}
    try{const data=await readHistory({...queryRef.current,before:append?rows.at(-1)?.id:undefined});if(n!==epoch.current||session!==historySession())return;setRows(prev=>append?[...prev,...data.entries.filter(e=>!prev.some(p=>p.id===e.id))]:data.entries);setHasMore(data.hasMore);setForKey(session);}
    catch(e){if(n===epoch.current){setRows([]);setHasMore(false);setForKey(null);setError(e instanceof Error?e.message:'Histórico indisponível.');}}
    finally{if(n===epoch.current)setBusy(false);}
  },[rows]);
  const loadRef=useRef(load);loadRef.current=load;
  useFocusEffect(useCallback(()=>{void loadRef.current();const subscription=AppState.addEventListener('change',s=>{if(s==='active')void loadRef.current();});return()=>{epoch.current++;subscription.remove();};},[me,auth,logged,scope,params.venueId,params.contextId,kind,teamId,fieldId,period.from,period.to,refresh]));
  const visible=key&&forKey===key?rows:[];
  const title=scope==='venue'?'Histórico do estabelecimento':scope==='context'?'Linha do tempo':'Meu histórico';
  function applyPeriod(){try{setPeriod(historyPeriod(from.trim(),to.trim()));setError('');}catch(e){setError(e instanceof Error?e.message:'Período inválido.');}}
  return <Screen contentStyle={{gap:spacing.sm}}>
    <View style={styles.header}><Button small variant="ghost" label="Voltar" onPress={()=>router.back()} /><Text style={styles.title}>{title}</Text></View>
    <Text style={styles.copy}>{scope==='venue'?venue?.name??'Estabelecimento':scope==='context'?'Alterações registradas neste jogo, reserva ou comanda.':'Sua atividade nos times, reservas, consumo, vaquinhas e aulas.'}</Text>
    <Text style={styles.note}>Estados iniciais mostram apenas o que já existia. Mudanças posteriores têm data de registro e antes/depois. Horários abaixo são do registro, não da partida.</Text>
    {isMockMode&&<Text style={styles.copy}>Demonstração local · não comprova transações reais.</Text>}
    {scope==='mine'&&venues.length>0&&<View style={{gap:6}}><Text style={styles.label}>Históricos dos meus estabelecimentos</Text><View style={styles.chips}>{venues.map(v=><Button key={v.id} small variant="outline" label={v.name} accessibilityLabel={`Histórico de ${v.name}`} onPress={()=>router.push({pathname:'/historico',params:{scope:'venue',venueId:v.id}})} />)}</View></View>}
    {scope!=='context'&&<View style={styles.chips}><Filter active={!kind} label="Tudo" onPress={()=>setKind(undefined)} />{Object.entries(HISTORY_KINDS).map(([id,label])=><Filter key={id} active={kind===id} label={label} onPress={()=>setKind(id as HistoryKind)} />)}</View>}
    <View style={styles.chips}><Button small variant="outline" label={filters?'Fechar filtros':'Filtros'} accessibilityLabel={filters?'Fechar filtros':'Filtrar período, time ou campo'} onPress={()=>setFilters(!filters)} /><Button small variant="ghost" label="Atualizar" accessibilityLabel="Atualizar histórico" loading={busy} onPress={()=>setRefresh(x=>x+1)} /></View>
    {filters&&<Card style={{gap:10}}>
      <TextField label="De (AAAA-MM-DD)" value={from} onChangeText={setFrom} placeholder="2026-10-01" maxLength={10} />
      <TextField label="Até (AAAA-MM-DD)" value={to} onChangeText={setTo} placeholder="2026-10-31" maxLength={10} />
      <Button small label="Aplicar período" onPress={applyPeriod} />
      {scope==='mine'&&<><Text style={styles.label}>Time</Text><View style={styles.chips}><Filter active={!teamId} label="Todos os times" onPress={()=>setTeamId(undefined)} />{teams.map(t=><Filter key={t.id} active={t.id===teamId} label={t.name} onPress={()=>setTeamId(t.id)} />)}</View></>}
      <Text style={styles.label}>Campo / quadra</Text><View style={styles.chips}><Filter active={!fieldId} label="Todos os campos" onPress={()=>setFieldId(undefined)} />{fields.map(f=><Filter key={f.id} active={fieldId===f.id} label={f.name} onPress={()=>setFieldId(f.id)} />)}</View>
      <Button small variant="ghost" label="Limpar filtros" onPress={()=>{setKind(scope==='context'?params.kind as HistoryKind:undefined);setFrom('');setTo('');setPeriod({});setTeamId(undefined);setFieldId(undefined);}} />
    </Card>}
    {!!error&&<Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
    {!busy&&!error&&!visible.length&&<Card><Text style={styles.label}>Nenhum registro neste filtro</Text><Text style={styles.copy}>Ainda não há eventos disponíveis, ou você não tem acesso a este registro.</Text></Card>}
    {visible.map(e=><Event key={e.id} event={e} names={names} timeline={scope==='context'} />)}
    {hasMore&&<Button small variant="outline" label="Carregar registros anteriores" loading={busy} onPress={()=>void load(true)} />}
  </Screen>;
}
function Filter({label,active,onPress}:{label:string;active:boolean;onPress:()=>void}){return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected:active}} style={[styles.filter,active&&styles.active]} onPress={onPress}><Text style={[styles.filterText,active&&{color:colors.primaryDark}]}>{label}</Text></Pressable>;}
function Event({event:e,names,timeline}:{event:HistoryEntry;names:Record<string,string>;timeline:boolean}){
  const [expanded,setExpanded]=useState(false);const changes=historyChanges(e);
  const op={baseline:'Estado inicial',INSERT:'Criado',UPDATE:'Alterado',DELETE:'Removido'}[e.operation];
  const preview=changes.filter(c=>['status','payment_status','amount','amount_cents','quantity','scheduled_at','date','time','match_minutes'].includes(c.key)).slice(0,2);
  return <View style={styles.event}><View style={styles.rail}><View style={[styles.dot,e.operation==='DELETE'&&{backgroundColor:colors.warning}]} /><View style={styles.line} /></View><View style={styles.eventBody}>
    <View style={styles.eventHeader}><Text style={styles.label}>{HISTORY_SOURCES[e.source]??HISTORY_KINDS[e.kind]}</Text><Text style={styles.operation}>{op}</Text></View>
    <Text style={styles.context}>{e.title}</Text><Text style={styles.copy}>{new Date(e.recordedAt).toLocaleString('pt-BR')}</Text><Text style={styles.copy}>{e.operation==='baseline'?'Importado do estado existente, sem autor reconstruído.':`Responsável: ${e.actorName}`}</Text>
    {!!names[e.sourceId]&&<Text style={styles.copy}>Referente a: {names[e.sourceId]}</Text>}
    {preview.map(c=><Text key={c.key} style={styles.after}>{c.label}: {e.operation==='UPDATE'?`${historyValue(c.key,c.before,names)} → `:''}{historyValue(c.key,e.operation==='DELETE'?c.before:c.after,names)}</Text>)}
    {e.operation==='DELETE'&&<Text style={styles.note}>O registro foi removido da lista operacional. Esta ação permanece no histórico.</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded?'Ocultar':'Ver'} detalhes do registro ${e.id}`} style={styles.detailToggle} onPress={()=>setExpanded(!expanded)}><Text style={styles.link}>{expanded?'Ocultar detalhes':`Ver detalhes${e.operation==='UPDATE'?` · ${changes.length} ${changes.length===1?'alteração':'alterações'}`:''}`}</Text><Ionicons name={expanded?'chevron-up':'chevron-down'} size={14} color={colors.primaryDark} /></Pressable>
    {expanded&&<View style={styles.details}>{changes.map(c=><View key={c.key} style={styles.change}><Text style={styles.changeLabel}>{c.label}</Text>{e.operation==='UPDATE'?<><Text style={styles.copy}>Antes: {historyValue(c.key,c.before,names)}</Text><Text style={styles.after}>Depois: {historyValue(c.key,c.after,names)}</Text></>:<Text style={styles.after}>{historyValue(c.key,e.operation==='DELETE'?c.before:c.after,names)}</Text>}</View>)}</View>}
    {!timeline&&<Pressable accessibilityRole="button" accessibilityLabel={`Abrir linha do tempo ${e.id}`} style={styles.detailToggle} onPress={()=>router.push({pathname:'/historico',params:{scope:'context',kind:e.kind,contextId:e.contextId}})}><Text style={styles.link}>Linha do tempo completa</Text><Ionicons name="arrow-forward" size={14} color={colors.primaryDark} /></Pressable>}
  </View></View>;
}
const styles=StyleSheet.create({header:{flexDirection:'row',alignItems:'center',gap:8},title:{fontSize:21,fontWeight:'800',color:colors.text,flex:1},copy:{fontSize:12,color:colors.textMuted,lineHeight:18},note:{fontSize:11,color:colors.textMuted,lineHeight:16},chips:{flexDirection:'row',flexWrap:'wrap',gap:6},filter:{minHeight:44,paddingHorizontal:12,paddingVertical:10,borderRadius:16,borderWidth:1,borderColor:colors.cardBorder,justifyContent:'center',maxWidth:'100%'},active:{backgroundColor:colors.bgElevated,borderColor:colors.primary},filterText:{fontSize:12,fontWeight:'600',color:colors.textMuted},label:{fontSize:13,fontWeight:'800',color:colors.text,flexShrink:1},error:{fontSize:12,color:colors.danger},event:{flexDirection:'row',gap:12},rail:{width:10,alignItems:'center',paddingTop:5},dot:{width:8,height:8,borderRadius:4,backgroundColor:colors.primaryDark},line:{width:1,flex:1,backgroundColor:colors.cardBorder,marginTop:4},eventBody:{flex:1,paddingBottom:16,borderBottomWidth:1,borderBottomColor:colors.cardBorder,gap:3},eventHeader:{flexDirection:'row',justifyContent:'space-between',gap:8},operation:{fontSize:10,color:colors.textMuted,paddingTop:2},context:{fontSize:12,fontWeight:'600',color:colors.text},detailToggle:{minHeight:44,flexDirection:'row',alignItems:'center',gap:6},link:{fontSize:12,fontWeight:'700',color:colors.primaryDark,flexShrink:1},details:{backgroundColor:colors.card,borderRadius:12,padding:12,gap:10},change:{gap:3},changeLabel:{fontSize:11,fontWeight:'700',color:colors.textMuted},after:{fontSize:12,color:colors.text,lineHeight:18}});
