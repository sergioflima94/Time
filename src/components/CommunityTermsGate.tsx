import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { Pressable, Text } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { PrivacyLinks } from '@/components/PrivacyLinks';
import { colors } from '@/constants/theme';
import { isMockMode } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

const version='2026-10-12-v1';
const key=(actor:string)=>`marcoujogou-terms:${version}:${actor}`;
/** Device-local, account-bound acknowledgement; never an auth/payment grant. */
export function CommunityTermsGate({ children, legalPage=false }: PropsWithChildren<{legalPage?:boolean}>) {
  const actor=useAuthStore(s=>s.authUserId),logged=useAuthStore(s=>s.isLoggedIn);
  const [receipt,setReceipt]=useState<{actor:string;accepted:boolean}|null>(null);
  const [checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let current=true;setChecked(false);setError('');setReceipt(null);
    if(actor&&!isMockMode)void AsyncStorage.getItem(key(actor)).then(value=>{if(current)setReceipt({actor,accepted:!!value});}).catch(()=>{if(current)setReceipt({actor,accepted:false});});
    return()=>{current=false;};
  },[actor]);
  async function accept(){if(!actor||!checked||busy)return;setBusy(true);setError('');
    try{await AsyncStorage.setItem(key(actor),JSON.stringify({version,acceptedAt:new Date().toISOString()}));if(useAuthStore.getState().authUserId===actor)setReceipt({actor,accepted:true});}
    catch{setError('Não foi possível guardar seu aceite neste dispositivo. Tente novamente.');}finally{setBusy(false);}
  }
  if(isMockMode||!logged||!actor||legalPage||(receipt?.actor===actor&&receipt.accepted))return <>{children}</>;
  return <Screen contentStyle={{gap:14}}>
    <Text style={{color:colors.text,fontSize:22,fontWeight:'800'}}>Antes de participar</Text>
    <Text style={{color:colors.textMuted,lineHeight:22}}>Leia os termos e as regras da comunidade antes de publicar fotos, comentários, avaliações ou mensagens.</Text>
    <Text style={{color:colors.textMuted,lineHeight:22}}>Não publique assédio, ódio, ameaças, exploração sexual, conteúdo sexual explícito, violência ilícita, fraude ou dados de outras pessoas sem autorização. Proteja crianças e adolescentes. Denúncias podem resultar em remoção de conteúdo e suspensão da conta.</Text>
    <Button small variant="outline" label="Ler termos de uso" onPress={()=>router.push('/termos')} />
    <Pressable accessibilityRole="checkbox" accessibilityLabel="Aceito os termos e as regras da comunidade" accessibilityState={{checked}} onPress={()=>setChecked(v=>!v)} style={{paddingVertical:12}}>
      <Text style={{color:colors.text,lineHeight:22}}>{checked?'☑':'☐'} Li e aceito os termos de uso e as regras da comunidade.</Text>
    </Pressable>
    {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}
    <Button label="Aceitar e continuar" disabled={!checked||busy} loading={busy} onPress={()=>void accept()} />
    <Button variant="ghost" label="Sair sem aceitar" onPress={()=>void useAuthStore.getState().logout()} />
    <PrivacyLinks account />
  </Screen>;
}
