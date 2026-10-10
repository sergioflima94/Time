import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { useSports } from '@/constants/sports';
import { usePlayHubStore } from '@/store/usePlayHubStore';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { isMockMode } from '@/lib/supabase';
import { emptyPlayHub } from '@/lib/playHub';
import type { PlatformSnapshot } from '@/types/platform';

export const hubStyles = { title: { color: colors.text, fontSize: 15, fontWeight: '800' as const }, copy: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 }, card: { gap: spacing.sm, marginBottom: spacing.md } };
export function usePlayHub() {
  const player=useAppStore(s=>s.currentPlayerId); const auth=useAuthStore(s=>s.authUserId); const logged=useAuthStore(s=>s.isLoggedIn);
  const key=logged?(isMockMode?`demo:${player}`:auth):null;
  const raw=usePlayHubStore(s=>s.data); const access=usePlayHubStore(s=>s.accessFor); const error=usePlayHubStore(s=>s.error); const loading=usePlayHubStore(s=>s.loading);
  useEffect(()=>{void usePlayHubStore.getState().load();},[key]);
  return {data:key&&access===key?raw:emptyPlayHub(),error,loading,refresh:usePlayHubStore.getState().load};
}
export function AssistedVenuePanel({snapshot}:{snapshot:PlatformSnapshot}) {
  const SPORTS=useSports(); const {data,error,refresh}=usePlayHub();
  const [name,setName]=useState('');const [reason,setReason]=useState('');const [selected,setSelected]=useState('');
  const [fieldName,setFieldName]=useState('');const [address,setAddress]=useState('');const [sport,setSport]=useState('futebol');
  const [availabilityField,setAvailabilityField]=useState('');const [weekday,setWeekday]=useState('6');const [startTime,setStartTime]=useState('08:00');const [endTime,setEndTime]=useState('22:00');const [slotMinutes,setSlotMinutes]=useState('60');const [hourPrice,setHourPrice]=useState('');
  const availabilities=useAppStore(s=>s.fieldAvailabilities);
  const [target,setTarget]=useState('');const [query,setQuery]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  const venue=data.venues.find(v=>v.establishment_id===selected);
  async function run(action:string,payload:Record<string,unknown>){setBusy(true);try{const r=await usePlayHubStore.getState().act(action,{...payload,reason});if(r.id)setSelected(r.id);if(action==='venue_create')setName('');if(action==='venue_field')setFieldName('');await usePlayHubStore.getState().load();setNotice('Salvo. O vínculo só muda após o aceite do responsável.');}catch(e){setNotice(e instanceof Error?e.message:'Falha ao salvar.');}finally{setBusy(false);}}
  return <Card style={hubStyles.card}><Text style={hubStyles.title}>Cadastro assistido de estabelecimentos</Text><Text style={hubStyles.copy}>Prepare o espaço e os campos antes do dono se cadastrar. Convide uma conta existente; após o aceite, ela configura Pix, gateway e WhatsApp. Cadastros com reservas ou gateway conectado não podem ser transferidos por este fluxo.</Text>
    <TextField label="Motivo administrativo" value={reason} onChangeText={setReason} placeholder="Mínimo 8 caracteres para auditoria" />
    <TextField label="Nome do novo estabelecimento" value={name} onChangeText={setName} />
    <Button small label="Preparar estabelecimento" disabled={busy||name.trim().length<3||reason.trim().length<8} onPress={()=>void run('venue_create',{name})} />
    <View style={hubStyles.row}>{data.venues.map(v=><Button key={v.establishment_id} small variant={selected===v.establishment_id?'primary':'outline'} label={`${v.name} · ${{draft:'Aguardando responsável',invited:'Convite enviado',accepted:'Vinculado',declined:'Recusado'}[v.status]}`} onPress={()=>setSelected(v.establishment_id)} />)}</View>
    {venue&&<><Text style={hubStyles.title}>{venue.name}</Text>{venue.fields.map(f=><Text key={f.id} style={hubStyles.copy}>{f.name} · {f.sport_id} · {f.address}</Text>)}{venue.status!=='accepted'&&<>
      <TextField label="Nome do campo/quadra" value={fieldName} onChangeText={setFieldName} /><TextField label="Endereço" value={address} onChangeText={setAddress} />
      <View style={hubStyles.row}>{SPORTS.map(s=><Button key={s.id} small variant={sport===s.id?'primary':'outline'} label={`${s.icon} ${s.label}`} onPress={()=>setSport(s.id)} />)}</View>
      <Button small label="Adicionar campo" disabled={busy||fieldName.trim().length<3||reason.trim().length<8} onPress={()=>void run('venue_field',{establishmentId:venue.establishment_id,revision:venue.revision,name:fieldName,address,sportId:sport})} />
      <Text style={hubStyles.title}>Horários e preços preparados</Text>{availabilities.filter(a=>venue.fields.some(f=>f.id===a.fieldId)).map(a=><Text key={a.id} style={hubStyles.copy}>{venue.fields.find(f=>f.id===a.fieldId)?.name} · dia {a.dayOfWeek} · {a.startTime}–{a.endTime} · R$ {a.price} / {a.slotMinutes} min</Text>)}<View style={hubStyles.row}>{venue.fields.map(f=><Button key={f.id} small variant={availabilityField===f.id?'primary':'outline'} label={f.name} onPress={()=>setAvailabilityField(f.id)} />)}</View><TextField label="Dia da semana (0 domingo a 6 sábado)" value={weekday} onChangeText={setWeekday} keyboardType="number-pad" /><View style={hubStyles.row}><View style={{flex:1}}><TextField label="Abertura (HH:mm)" value={startTime} onChangeText={setStartTime} /></View><View style={{flex:1}}><TextField label="Fechamento (HH:mm)" value={endTime} onChangeText={setEndTime} /></View></View><TextField label="Duração do horário (min)" value={slotMinutes} onChangeText={setSlotMinutes} keyboardType="number-pad" /><TextField label="Preço por horário (R$)" value={hourPrice} onChangeText={setHourPrice} keyboardType="decimal-pad" /><Button small label="Preparar horário e preço" disabled={busy||!availabilityField||!hourPrice||reason.trim().length<8} onPress={()=>void run('venue_availability',{establishmentId:venue.establishment_id,revision:venue.revision,fieldId:availabilityField,dayOfWeek:Number(weekday),startTime,endTime,slotMinutes:Number(slotMinutes),price:Number(hourPrice.replace(',','.'))})} />
      <TextField label="Buscar futuro responsável" value={query} onChangeText={setQuery} />
      <Text style={hubStyles.copy}>Contas da busca da plataforma. Se não encontrar, use “Buscar na plataforma” acima. A pessoa precisa ter se cadastrado.</Text>
      <View style={hubStyles.row}>{snapshot.players.filter(p=>(isMockMode||p.authUserId)&&!p.suspended&&p.name.toLowerCase().includes(query.toLowerCase())).map(p=><Button key={p.id} small variant={target===p.id?'primary':'outline'} label={p.name} onPress={()=>setTarget(p.id)} />)}</View>
      <Button small label="Convidar responsável" disabled={busy||!target||reason.trim().length<8} onPress={()=>void run('venue_invite',{establishmentId:venue.establishment_id,revision:venue.revision,playerId:target})} />
    </>}</>}
    <Button small variant="ghost" label="Atualizar cadastros" onPress={()=>void refresh()} />
    {!!(notice||error)&&<Text accessibilityLiveRegion="polite" style={hubStyles.copy}>{notice||error}</Text>}
  </Card>;
}
export function HomePlayHub() {
  const {data}=usePlayHub();const me=useAppStore(s=>s.currentPlayerId);const favoriteSports=useAppStore(s=>s.players.find(p=>p.id===s.currentPlayerId)?.favoriteSports);const suggestions=data.slots.filter(slot=>favoriteSports?.includes(slot.sport_id));const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  async function respond(id:string,revision:number,accept:boolean){setBusy(true);try{await usePlayHubStore.getState().act('venue_respond',{establishmentId:id,revision,accept});setNotice(accept?'Estabelecimento vinculado. Configure sua conta de recebimento em Meus estabelecimentos.':'Convite recusado.');}catch(e){setNotice(e instanceof Error?e.message:'Falha ao responder.');}finally{setBusy(false);}}
  return <>{!data.onboarding?.completed&&<Card style={hubStyles.card}><Text style={hubStyles.title}>Seu primeiro passo no BoraJogo</Text><Text style={hubStyles.copy}>Jogar, organizar um time ou receber a galera no seu espaço?</Text><Button small variant="outline" label="Configurar minha experiência" onPress={()=>router.push('/comecar')} /></Card>}
    <View style={[hubStyles.row,{marginBottom:spacing.md}]}><Button small label="Bora jogar hoje?" onPress={()=>router.push('/descobrir')} /><Button small variant="outline" label="Campos próximos" onPress={()=>router.push('/campos')} /><Button small variant="outline" label="Horários e desafios" onPress={()=>router.push('/bora')} /></View>
    {data.onboarding?.completed&&<Button small variant="ghost" label="Minha experiência e sugestões" onPress={()=>router.push('/comecar')} />}
    {data.onboarding?.suggestions_enabled&&suggestions.length>0&&<Text style={[hubStyles.copy,{marginBottom:8}]}>Há {suggestions.length} horários de oportunidade para seus esportes favoritos. Confira condições em Horários e desafios.</Text>}
    {data.venues.filter(v=>v.target_player_id===me&&v.status==='invited').map(v=><Card key={v.establishment_id} style={hubStyles.card}><Text style={hubStyles.title}>Assumir {v.name}?</Text><Text style={hubStyles.copy}>Confira os campos preparados: {v.fields.map(f=>f.name).join(', ')||'Nenhum campo ainda'}. O aceite transfere a gestão para sua conta. Conta de recebimento deve ser configurada por você.</Text><View style={hubStyles.row}><Button small label="Aceitar estabelecimento" disabled={busy} onPress={()=>void respond(v.establishment_id,v.revision,true)} /><Button small variant="outline" label="Recusar vínculo" disabled={busy} onPress={()=>void respond(v.establishment_id,v.revision,false)} /></View></Card>)}
    {!!notice&&<Text style={hubStyles.copy}>{notice}</Text>}
  </>;
}
