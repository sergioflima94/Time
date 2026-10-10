import { useEffect, useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { hubStyles as st } from '@/components/PlayHubPanels';
import { useSports } from '@/constants/sports';
import { getCurrentLocation } from '@/lib/location';
import { directorySession, emptyDirectoryManagement, manageFieldDirectory, saveFieldDirectory, type DirectoryInput, type DirectoryManagement, type ManagedEntry } from '@/lib/fieldDirectory';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';

const blank=():DirectoryInput=>({fieldId:null,name:'',address:'',sportId:'futebol',phone:'',whatsapp:false,latitude:NaN,longitude:NaN,online:false,active:true});
export function FieldDirectoryEditor({admin=false,establishmentId}:{admin?:boolean;establishmentId?:string}) {
  const player=useAppStore(s=>s.currentPlayerId);const auth=useAuthStore(s=>s.authUserId);const logged=useAuthStore(s=>s.isLoggedIn);
  const sports=useSports();const fields=useAppStore(s=>s.fields);
  const key=directorySession();const [forKey,setForKey]=useState<string|null>(null);const [data,setData]=useState<DirectoryManagement>(emptyDirectoryManagement);
  const [form,setForm]=useState<DirectoryInput>(blank);const [id,setId]=useState<string|null>(null);const [revision,setRevision]=useState(0);
  const [latitude,setLatitude]=useState('');const [longitude,setLongitude]=useState('');const [reason,setReason]=useState('');const [consent,setConsent]=useState(false);
  const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const epoch=useRef(0);
  async function load(){const n=++epoch.current;const session=directorySession();try{const rows=await manageFieldDirectory();if(n===epoch.current&&session===directorySession()){setData(rows);setForKey(session);}}catch(e){if(n===epoch.current){setData(emptyDirectoryManagement());setForKey(null);setNotice(e instanceof Error?e.message:'Falha ao consultar.');}}}
  useEffect(()=>{setData(emptyDirectoryManagement());setForKey(null);setForm(blank());setId(null);setRevision(0);setConsent(false);setLatitude('');setLongitude('');setNotice('');void load();return()=>{epoch.current++;};},[player,auth,logged]);
  const visible=data&&forKey===key?data:emptyDirectoryManagement();
  const eligible=visible.fields.filter(f=>!establishmentId||fields.some(x=>x.id===f.id&&x.establishmentId===establishmentId));
  const entries=visible.entries.filter(e=>!establishmentId||eligible.some(f=>f.id===e.fieldId));
  function edit(e:ManagedEntry){setForm({...e});setId(e.id);setRevision(e.revision);setLatitude(String(e.latitude));setLongitude(String(e.longitude));setConsent(false);setNotice('');}
  function reset(){setForm(blank());setId(null);setRevision(0);setLatitude('');setLongitude('');setConsent(false);setNotice('');}
  function pickField(fieldId:string|null){const f=eligible.find(f=>f.id===fieldId);setForm(prev=>({...prev,fieldId,online:fieldId?prev.online:false,...(f?{name:f.name,address:f.address??prev.address,sportId:f.sportId}:{})}));if(f?.latitude!==null&&f?.latitude!==undefined){setLatitude(String(f.latitude));setLongitude(String(f.longitude));}}
  async function currentPoint(){setBusy(true);const session=directorySession();try{const p=await getCurrentLocation();if(session!==directorySession())return;if(!p)throw new Error('Localização indisponível. Informe as coordenadas do campo manualmente.');setLatitude(String(p.latitude));setLongitude(String(p.longitude));setNotice('Confira: este ponto deve ser o campo, não sua casa ou outro local.');}catch(e){setNotice(e instanceof Error?e.message:'Falha ao localizar.');}finally{setBusy(false);}}
  async function save(){setBusy(true);const session=directorySession();try{if(!consent)throw new Error('Confirme que os dados podem ser publicados.');if(!latitude.trim()||!longitude.trim())throw new Error('Informe a posição do campo.');await saveFieldDirectory(id,revision,{...form,latitude:Number(latitude.replace(',','.')),longitude:Number(longitude.replace(',','.'))},reason);if(session!==directorySession())return;await load();reset();setNotice('Ficha pública salva. Reserva online só aparece com vínculo ativo e horário disponível.');}catch(e){if(session===directorySession())setNotice(e instanceof Error?e.message:'Falha ao salvar.');}finally{setBusy(false);}}
  if(!key||forKey!==key)return <Card style={st.card}><Text style={st.copy}>{notice||'Consultando seus campos e permissões…'}</Text><Button small variant="outline" label="Consultar catálogo novamente" onPress={()=>void load()} /></Card>;
  return <Card style={st.card}><Text style={st.title}>{admin?'Catálogo de campos e contatos':'Meu campo na busca por proximidade'}</Text><Text style={st.copy}>Publique apenas endereço e telefone comerciais que podem ser divulgados. Coordenadas são do campo. Contatos sem vínculo não recebem reservas; “Cadastrado no BoraJogo” não é patrocínio nem selo de qualidade.</Text>
    <View style={st.row}><Button small variant="outline" label={admin?'Novo contato de campo':'Nova ficha do meu campo'} onPress={reset} disabled={busy} /><Button small variant="ghost" label="Atualizar catálogo" onPress={()=>void load()} disabled={busy} /></View>
    {entries.map(e=><Button key={e.id} small variant={id===e.id?'primary':'outline'} label={`Editar ${e.name}${e.active?'':' · oculto'}`} onPress={()=>edit(e)} disabled={busy} />)}
    <Text style={st.title}>{id?'Editar ficha pública':'Nova ficha pública'}</Text><Text style={st.copy}>Vínculo com campo cadastrado (não transfere propriedade):</Text>
    <View style={st.row}>{admin&&<Button small variant={!form.fieldId?'primary':'outline'} label="Somente contato" disabled={busy} onPress={()=>pickField(null)} />}{eligible.map(f=><Button key={f.id} small variant={form.fieldId===f.id?'primary':'outline'} label={`${f.name} · ${f.establishmentName}`} disabled={busy||(!admin&&!!id&&form.fieldId!==f.id)} onPress={()=>pickField(f.id)} />)}</View>
    {!admin&&!eligible.length&&<Text style={st.copy}>Seu estabelecimento precisa de campo cadastrado e responsável confirmado para aparecer aqui.</Text>}
    <TextField label="Nome público do campo" value={form.name} onChangeText={name=>setForm(f=>({...f,name}))} maxLength={120} /><TextField label="Endereço, bairro e cidade" value={form.address} onChangeText={address=>setForm(f=>({...f,address}))} maxLength={240} />
    <View style={st.row}>{sports.map(s=><Button small key={s.id} label={`${s.icon} ${s.label}`} variant={form.sportId===s.id?'primary':'outline'} disabled={busy||!!form.fieldId} onPress={()=>setForm(f=>({...f,sportId:s.id}))} />)}</View>
    <TextField label="Telefone público com DDD" value={form.phone} onChangeText={phone=>setForm(f=>({...f,phone}))} keyboardType="phone-pad" maxLength={25} />
    <View style={st.row}><Switch accessibilityLabel="Este telefone tem WhatsApp" value={form.whatsapp} onValueChange={whatsapp=>setForm(f=>({...f,whatsapp}))} disabled={busy} /><Text style={st.copy}>Este telefone comercial tem WhatsApp</Text></View>
    <View style={st.row}><View style={{flex:1}}><TextField label="Latitude do campo" value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" /></View><View style={{flex:1}}><TextField label="Longitude do campo" value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" /></View></View>
    <Button small variant="outline" label="Estou no campo: usar este ponto" onPress={()=>void currentPoint()} disabled={busy} />
    <View style={st.row}><Switch accessibilityLabel="Exibir horários online do campo" value={form.online} disabled={busy||!form.fieldId} onValueChange={online=>setForm(f=>({...f,online}))} /><Text style={st.copy}>Exibir horários online disponíveis (somente cadastro vinculado)</Text></View>
    <Text style={st.copy}>Sem horários de oportunidade publicados, a ficha oferece apenas contato. Publicar aqui não cria disponibilidade ou pagamento.</Text>
    <View style={st.row}><Switch accessibilityLabel="Mostrar campo no catálogo" value={form.active} onValueChange={active=>setForm(f=>({...f,active}))} disabled={busy} /><Text style={st.copy}>Mostrar campo no catálogo</Text></View>
    <View style={st.row}><Switch accessibilityLabel="Confirmo publicação dos dados comerciais" value={consent} onValueChange={setConsent} disabled={busy} /><Text style={st.copy}>Confirmo endereço, posição e autorização para divulgar estes dados comerciais.</Text></View>
    <TextField label="Motivo da publicação ou alteração" value={reason} onChangeText={setReason} maxLength={500} placeholder="Mínimo 8 caracteres · registrado na auditoria" />
    <Button small label="Salvar ficha do campo" disabled={busy||!consent||reason.trim().length<8||(!admin&&!form.fieldId)} loading={busy} onPress={()=>void save()} />
    {!!notice&&<Text accessibilityLiveRegion="polite" style={st.copy}>{notice}</Text>}
  </Card>;
}
