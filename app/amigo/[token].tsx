import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { colors } from '@/constants/theme';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendInviteStore } from '@/store/useFriendInviteStore';
import { claimFriendInvite, previewFriendInvite, type FoundFriend } from '@/lib/friendDiscovery';
import { validFriendToken } from '@/lib/friendDiscoveryRules';
export default function FriendInviteScreen(){
  const {token}=useLocalSearchParams<{token:string}>(),logged=useAuthStore(s=>s.isLoggedIn);
  const [person,setPerson]=useState<FoundFriend|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
  useEffect(()=>{let live=true;if(!validFriendToken(token||'')){setError('Convite inválido.');return;}
    if(useFriendInviteStore.getState().token!==token)useFriendInviteStore.getState().save(token);
    if(logged)void previewFriendInvite(token).then(p=>{if(live)setPerson(p);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};
  },[token,logged]);
  async function claim(){setBusy(true);setError('');try{await claimFriendInvite(token);useFriendInviteStore.getState().clear();setDone(true);}catch(e){setError(e instanceof Error?e.message:'Não foi possível retomar o convite.');}finally{setBusy(false);}}
  function cancel(){useFriendInviteStore.getState().clear();router.replace(logged?'/(tabs)/amigos':'/(auth)/login');}
  return <Screen><Card style={{gap:12}}><Text style={{fontSize:23,fontWeight:'800',color:colors.text}}>Convite de amizade</Text>
    <Text style={{color:colors.textMuted}}>Entre ou crie sua conta para retomar o vínculo. A amizade só começa após o aceite; não é criada pelo número de telefone.</Text>
    {person&&<><Avatar name={person.name} photoUrl={person.avatarUrl} size={60}/><Text style={{color:colors.text,fontWeight:'700'}}>{person.nickname||person.name}</Text></>}
    {done?<><Text style={{color:colors.primaryDark}}>Convite retomado. Confira seus pedidos de amizade; nenhum aceite foi feito automaticamente.</Text><Button label="Ver amigos" onPress={()=>router.replace('/(tabs)/amigos')}/></>:logged?<Button label="Retomar convite e pedir amizade" disabled={!person||!!error} loading={busy} onPress={()=>void claim()}/>:<><Button label="Entrar para retomar convite" disabled={!!error} onPress={()=>router.push('/(auth)/login')}/><Button label="Criar conta com convite" variant="outline" disabled={!!error} onPress={()=>router.push('/(auth)/cadastro')}/></>}
    {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}<Button label="Agora não" variant="ghost" onPress={cancel}/>
  </Card></Screen>;
}
