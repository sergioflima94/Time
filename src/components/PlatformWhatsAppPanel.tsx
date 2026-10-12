import { useEffect, useRef, useState } from 'react';
import { AppState, Image, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { supabase,isMockMode } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { TextField } from './ui/TextField';
import { SegmentedControl } from './ui/SegmentedControl';
import { colors,spacing } from '@/constants/theme';
type Provider='evolution_api'|'evolution_go';
interface Metadata {provider:Provider;url:string;instance:string;enabled:boolean;revision:number;hasToken:boolean;hasGlobalKey:boolean;probeOk:boolean;testedAt:string|null;state:string;provisionState:string}
interface Result {integrations:Metadata[];message?:string;qr?:string|null;code?:string|null;pairingCode?:string|null}
const copy={color:colors.textMuted,fontSize:12,lineHeight:19};
export function PlatformWhatsAppPanel(){
  const actor=useAuthStore(s=>s.authUserId),role=usePlatformAdmin();
  return role==='owner'||role==='admin'?<Panel key={actor??'demo'} />:<Text style={copy}>Somente administradores da plataforma configuram integrações.</Text>;
}
function Panel(){
  const [provider,setProvider]=useState<Provider>('evolution_api'),[items,setItems]=useState<Metadata[]>([]),[host,setHost]=useState(''),[token,setToken]=useState(''),[globalKey,setGlobalKey]=useState(''),[webhook,setWebhook]=useState(''),[reason,setReason]=useState(''),[phone,setPhone]=useState(''),[newGo,setNewGo]=useState(false),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[qr,setQr]=useState<Pick<Result,'qr'|'code'|'pairingCode'>|null>(null);
  const epoch=useRef(0),lock=useRef(false),live=useRef(true);
  const selected=items.find(i=>i.provider===provider);
  function clearSecrets(){setToken('');setGlobalKey('');setWebhook('');setQr(null);}
  useEffect(()=>{live.current=true;return()=>{live.current=false;epoch.current++;};},[]);
  useEffect(()=>{clearSecrets();setHost(selected?.url??'');setNewGo(false);},[provider,selected?.url]);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state!=='active'){epoch.current++;clearSecrets();}});return()=>sub.remove();},[]);
  useEffect(()=>{if(!qr)return;const t=setTimeout(()=>setQr(null),60000);return()=>clearTimeout(t);},[qr]);
  async function run(action:'metadata'|'save'|'test'|'connect'|'status'|'enable'){
    if(lock.current)return;
    if(isMockMode||!supabase){setNotice('Demonstração: nenhum token é salvo e nenhuma conexão real é criada.');clearSecrets();return;}
    lock.current=true;setBusy(true);setNotice('');setQr(null);
    const request=++epoch.current,actor=useAuthStore.getState().authUserId;
    const input={action,provider,revision:selected?.revision??0,...(action==='save'?{url:host.trim(),token,globalKey,webhookSecret:webhook,newGoInstance:newGo}:{}),reason:reason.trim()||(action==='connect'?'Parear WhatsApp da plataforma':''),phone:phone.replace(/\D/g,'').replace(/^(\d{10,11})$/,'55$1'),enabled:!selected?.enabled};
    if(action==='save')clearSecrets();
    try{
      const {data,error}=await supabase.functions.invoke('platform-whatsapp',{body:input});
      if(!live.current||request!==epoch.current||actor!==useAuthStore.getState().authUserId)return;
      if(error){let message='Configuração indisponível.';try{message=(await error.context?.json())?.error??message;}catch{}throw Error(message);}
      const result=data as Result;
      if(!Array.isArray(result.integrations))throw Error('Resposta da configuração inválida.');
      setItems(result.integrations);setNotice(result.message??'Configuração atualizada.');
      if(result.qr||result.code||result.pairingCode)setQr({qr:result.qr,code:result.code,pairingCode:result.pairingCode});
      if(action==='save'){setReason('');setNewGo(false);}
    }catch(error){if(live.current&&request===epoch.current)setNotice(error instanceof Error?error.message:'Não foi possível salvar.');}
    finally{lock.current=false;if(live.current)setBusy(false);}
  }
  useEffect(()=>{void run('metadata');},[]);
  return <View style={{gap:spacing.md}}>
    <Text style={copy}>Configuração global protegida. O token é enviado ao servidor para armazenamento criptografado e nunca retorna ao app. Campos continuam escolhendo seu provedor. Nenhum teste envia mensagens.</Text>
    <SegmentedControl value={provider} onChange={value=>{if(!busy){epoch.current++;setPhone('');setReason('');setNotice('');setProvider(value);}}} options={[{value:'evolution_api',label:'Evolution API'},{value:'evolution_go',label:'Evolution Go'}]} />
    <Card style={{gap:12}}>
      <Text style={{color:colors.text,fontSize:16,fontWeight:'800'}}>{provider==='evolution_api'?'Evolution API v2':'Evolution Go · API por token'}</Text>
      <Text style={copy}>{provider==='evolution_api'?'Use a chave administrativa do servidor v2. Cada estabelecimento mantém sua própria instância; esta tela também conecta o remetente da plataforma.':'Perfil /send/text e /instance/status. Use token de uma instância existente ou a chave global para criar uma nova. O remetente Go é compartilhado pela plataforma; não é uma instância exclusiva para cada campo.'}</Text>
      <Text style={copy}>{selected?`${selected.enabled?'Ativado':'Desativado'} · ${selected.state==='open'?'Conectado':selected.state==='connecting'?'Aguardando pareamento':'Conexão não confirmada'} · revisão ${selected.revision}`:'Ainda não configurado pela tela. Secrets antigos continuam válidos até a primeira configuração.'}</Text>
      {selected&&<Text selectable style={copy}>{provider==='evolution_api'?'Instância':'Referência interna'}: {selected.instance}</Text>}
      <TextField label="Host HTTPS" value={host} onChangeText={setHost} autoCapitalize="none" autoCorrect={false} editable={!busy} placeholder="https://whatsapp.seudominio.com.br" />
      <TextField label={provider==='evolution_api'?'Token administrativo':'Token da instância Go'} value={token} onChangeText={setToken} secureTextEntry autoComplete="off" autoCapitalize="none" autoCorrect={false} editable={!busy} placeholder={selected?'Deixe vazio para manter o token salvo':'Informe o token'} />
      {provider==='evolution_go'&&<>
        <TextField label="Chave global Go (opcional, para criar instância)" value={globalKey} onChangeText={setGlobalKey} secureTextEntry autoComplete="off" autoCapitalize="none" autoCorrect={false} editable={!busy} placeholder="Não é o token da instância" />
        {!selected&&<SegmentedControl value={newGo?'new':'existing'} onChange={v=>setNewGo(v==='new')} options={[{value:'existing',label:'Instância existente'},{value:'new',label:'Criar nova'}]} />}
      </>}
      <TextField label="Segredo de webhook (opcional)" value={webhook} onChangeText={setWebhook} secureTextEntry autoComplete="off" autoCapitalize="none" autoCorrect={false} editable={!busy} placeholder="Vazio: gerar ou manter segredo no servidor" />
      <Text style={copy}>Alterar host ou token desativa novos envios até testar e ativar novamente. Trocar o host da Evolution API exige reconectar os campos. Instâncias antigas não são excluídas do servidor anterior.</Text>
      <TextField label="Motivo da configuração" value={reason} onChangeText={setReason} editable={!busy} placeholder="Mínimo 8 caracteres; não coloque tokens aqui" />
      <Button label="Salvar configuração protegida" loading={busy} disabled={busy||!host.trim()||reason.trim().length<8||(!selected&&!newGo&&!token)} onPress={()=>void run('save')} />
      {selected&&<>
        <Button small variant="outline" label="Testar host e autenticação" disabled={busy} onPress={()=>void run('test')} />
        <Button small variant={selected.enabled?'danger':'outline'} label={selected.enabled?'Desativar novos envios':'Ativar provedor'} disabled={busy||reason.trim().length<8||(!selected.enabled&&!selected.probeOk)} onPress={()=>void run('enable')} />
        <TextField label="Número para pareamento (opcional)" value={phone} onChangeText={setPhone} editable={!busy} keyboardType="phone-pad" placeholder="55 + DDD + número" />
        <Button small label="Criar/conectar instância e gerar QR" disabled={busy} onPress={()=>void run('connect')} />
        <Button small variant="outline" label="Consultar conexão" disabled={busy} onPress={()=>void run('status')} />
      </>}
    </Card>
    {qr&&<Card style={{gap:12}}>
      <Text style={copy}>No WhatsApp, abra Aparelhos conectados. QR/código são temporários; se estiver no mesmo celular, use o código de pareamento.</Text>
      {qr.qr?<Image source={{uri:qr.qr}} style={{width:220,height:220,alignSelf:'center'}} accessibilityLabel="QR temporário do WhatsApp da plataforma" />:qr.code?<View style={{backgroundColor:'white',padding:12,alignSelf:'center'}}><QRCode value={qr.code} size={200} /></View>:null}
      {qr.pairingCode&&<Text selectable style={{color:colors.text,fontSize:22,fontWeight:'800'}}>Código: {qr.pairingCode}</Text>}
      <Button small variant="ghost" label="Ocultar QR/código" onPress={()=>setQr(null)} />
    </Card>}
    <Button small variant="ghost" label="Atualizar integrações" disabled={busy} onPress={()=>void run('metadata')} />
    {!!notice&&<Text accessibilityLiveRegion="polite" style={copy}>{notice}</Text>}
  </View>;
}
