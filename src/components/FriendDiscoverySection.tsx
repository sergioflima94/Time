import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { TextField } from './ui/TextField';
import { FriendButton } from './FriendButton';
import { SegmentedControl } from './ui/SegmentedControl';
import { readDeviceContacts } from '@/lib/deviceContacts';
import { configureDiscovery, createFriendInvite, discoveryPreferences, matchContacts, nearbyFriends, searchFriends, type ContactMatch, type DiscoveryPreferences, type FoundFriend } from '@/lib/friendDiscovery';
import { friendInviteUrl, phoneKey, type DeviceContact } from '@/lib/friendDiscoveryRules';
import { getCurrentLocation } from '@/lib/location';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { isMockMode } from '@/lib/supabase';
import { colors, spacing } from '@/constants/theme';
export function FriendDiscoverySection() {
  const playerId = useAppStore(s=>s.currentPlayerId);
  const authUserId=useAuthStore(s=>s.authUserId),accountScope=isMockMode?playerId:authUserId;
  const [mode,setMode]=useState<'search'|'contacts'|'nearby'|'privacy'>('search');
  const [query,setQuery]=useState(''), [rows,setRows]=useState<FoundFriend[]>([]);
  const [contacts,setContacts]=useState<DeviceContact[]>([]), [selected,setSelected]=useState<string[]>([]);
  const [matches,setMatches]=useState<ContactMatch[]>([]), [checked,setChecked]=useState(false), [visible,setVisible]=useState(40);
  const [prefs,setPrefs]=useState<DiscoveryPreferences>({byPhone:false,byEmail:false,nearby:false,locationFresh:false});
  const [busy,setBusy]=useState(false), [notice,setNotice]=useState(''), [searched,setSearched]=useState(false);
  const [radius,setRadius]=useState('5'), [invite,setInvite]=useState<{url:string;contact?:DeviceContact}|null>(null);
  const generation=useRef(0);
  useEffect(()=>{const g=++generation.current;setBusy(true);setContacts([]);setSelected([]);setMatches([]);setRows([]);setInvite(null);setChecked(false);setSearched(false);
    void discoveryPreferences().then(p=>{if(generation.current===g)setPrefs(p);}).catch(e=>{if(generation.current===g)setNotice(e.message);}).finally(()=>{if(generation.current===g)setBusy(false);});
    return ()=>{generation.current++;};},[accountScope]);
  async function task(fn:()=>Promise<void>) { const g=generation.current;setBusy(true);setNotice('');try{await fn();}catch(e){if(g===generation.current)setNotice(e instanceof Error?e.message:'Não foi possível concluir.');}finally{if(g===generation.current)setBusy(false);} }
  async function locate() { const point=await getCurrentLocation();if(!point)throw new Error('Localização não autorizada ou indisponível. A busca manual continua disponível.');setPrefs(await configureDiscovery({nearby:true,...point})); }
  const selectedKeys=contacts.filter(c=>selected.includes(c.id)).flatMap(c=>c.identifiers.map(key=>({...key,contactId:c.id})));
  const matchRows=matches.map(m=>({...m,contactId:selectedKeys[m.index]?.contactId})).filter((m,i,a)=>a.findIndex(n=>n.contactId===m.contactId&&n.player.id===m.player.id)===i);
  async function invitation(contact?:DeviceContact) { const result=await createFriendInvite();setInvite({url:friendInviteUrl(result.token),contact});setNotice('Convite pronto por 7 dias. Escolha como enviar; nenhuma mensagem foi enviada automaticamente.'); }
  return <Card style={styles.card}>
    <Text style={styles.title}>Encontre sua turma</Text>
    <SegmentedControl value={mode} onChange={m=>{if(busy)return;setMode(m);setRows([]);setSearched(false);}} options={[{value:'search',label:'Buscar'},{value:'contacts',label:'Contatos'},{value:'nearby',label:'Perto'},{value:'privacy',label:'Privacidade'}]}/>
    {mode==='search'&&<>
    <TextField label="Buscar amigos" placeholder="Nome, celular com DDD ou e-mail completo" value={query} onChangeText={setQuery} autoCapitalize="none" maxLength={254}/>
    <Button label="Buscar amigos" small loading={busy} onPress={()=>void task(async()=>{setRows(await searchFriends(query));setSearched(true);})}/>
    </>}
    {searched && !rows.length && <Text style={styles.hint}>Nenhuma pessoa disponível para essa busca. Ela pode não ter conta ou ter desativado a descoberta.</Text>}
    {rows.map(p=><FoundRow key={p.id} player={p}/>)}
    {(mode==='privacy'||mode==='nearby')&&<><Text style={styles.title}>Como podem me encontrar</Text>
    <Text style={styles.hint}>Telefone e e-mail ficam ocultos nos resultados. Tudo desligado por padrão. O celular usado na busca é o salvo no seu perfil, não uma identidade verificada.</Text>
    {([['byPhone','Permitir busca pelo meu celular'],['byEmail','Permitir busca pelo meu e-mail']] as const).map(([key,label])=><View key={key} style={styles.row}><Text style={styles.label}>{label}</Text><Switch accessibilityLabel={label} disabled={busy} value={prefs[key]} onValueChange={value=>void task(async()=>setPrefs(await configureDiscovery({[key]:value})))}/></View>)}
    <View style={styles.row}><Text style={styles.label}>Aparecer por perto por até 2 horas</Text><Switch accessibilityLabel="Aparecer por perto" disabled={busy} value={prefs.nearby&&prefs.locationFresh} onValueChange={value=>void task(async()=>{if(value)await locate();else {setPrefs(await configureDiscovery({nearby:false}));setRows([]);}})}/></View>
    <Text style={styles.hint}>Só pessoas que também ativaram aparecem. Distâncias são aproximadas; nenhum endereço ou coordenada é exibido. Desligar apaga a localização dessa busca.</Text>
    </>}
    {mode==='nearby'&&<><Text style={styles.hint}>Ao buscar, você ativa sua presença aproximada por até 2 horas. Pode desligar acima a qualquer momento.</Text>
    <TextField label="Raio da busca em km (1 a 20)" value={radius} onChangeText={setRadius} keyboardType="numeric"/>
    <Button label="Buscar amigos por proximidade" small variant="outline" loading={busy} onPress={()=>void task(async()=>{const n=Number(radius);if(!Number.isFinite(n)||n<1||n>20)throw new Error('Escolha um raio entre 1 e 20 km.');await locate();setRows(await nearbyFriends(n));setSearched(true);})}/>
    </>}
    {mode==='contacts'&&<><Text style={styles.title}>Contatos do celular</Text>
    <Text style={styles.hint}>Ao abrir, a agenda fica apenas nesta tela. Depois você escolhe até 50 telefones/e-mails para comparar no servidor. Não salvamos nomes da agenda nem a lista de contatos no banco.</Text>
    <Button label="Escolher contatos do celular" variant="outline" small loading={busy} onPress={()=>void task(async()=>{const g=generation.current;const list=await readDeviceContacts();if(g!==generation.current)return;setContacts(list);setSelected([]);setMatches([]);setChecked(false);})}/>
    {contacts.length>0&&<>
      <Text style={styles.hint}>{contacts.length} contatos carregados (até 500). {selectedKeys.length}/50 identificadores selecionados.</Text>
      {contacts.slice(0,visible).map(c=><View key={c.id} style={styles.contact}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{checked:selected.includes(c.id)}} accessibilityLabel={`Selecionar ${c.name}`} disabled={busy||checked} onPress={()=>setSelected(s=>s.includes(c.id)?s.filter(id=>id!==c.id):[...s,c.id])} style={styles.row}><Text style={styles.label}>{selected.includes(c.id)?'☑':'☐'} {c.name}</Text><Text style={styles.hint}>{c.identifiers.length} identificadores</Text></Pressable>
        {checked&&selected.includes(c.id)&&(!matchRows.some(m=>m.contactId===c.id)?<Button label={`Convidar ${c.name} para o app`} small variant="ghost" onPress={()=>void task(()=>invitation(c))}/>:matchRows.filter(m=>m.contactId===c.id).map(m=><FoundRow key={`${c.id}-${m.index}-${m.player.id}`} player={m.player}/>))}
      </View>)}
      {visible<contacts.length&&<Button label="Mostrar mais contatos" small variant="ghost" onPress={()=>setVisible(v=>v+40)}/>}
      <Button label={checked?'Escolher outros contatos':'Encontrar contatos no app'} small disabled={busy||(!checked&&!selectedKeys.length)} loading={busy} onPress={()=>{if(checked){setChecked(false);setMatches([]);}else void task(async()=>{if(selectedKeys.length>50)throw new Error('Selecione no máximo 50 telefones/e-mails por comparação.');setMatches(await matchContacts(selectedKeys.map(({kind,value})=>({kind,value}))));setChecked(true);});}}/>
      <Button label="Limpar contatos desta tela" small variant="ghost" disabled={busy} onPress={()=>{setContacts([]);setSelected([]);setMatches([]);setChecked(false);}}/>
    </>}
    </>}
    <Button label="Criar convite para baixar o app" variant="outline" small loading={busy} onPress={()=>void task(()=>invitation())}/>
    {invite&&<View style={styles.contact}><Text style={styles.hint}>O link abre a versão web para entrar ou criar conta. Após o cadastro, a pessoa pode retomar o convite e pedir amizade. Você ainda decide aceitar.</Text>
      <Button label="Compartilhar convite" small onPress={()=>void task(async()=>{await Share.share({message:`Vamos ser amigos no MarcouJogou? Entre ou crie sua conta: ${invite.url}`});})}/>
      {invite.contact?.identifiers.some(k=>k.kind==='phone')&&<>
        <Button label="Enviar convite pelo WhatsApp" small variant="outline" onPress={()=>void task(async()=>{const n=phoneKey(invite.contact!.identifiers.find(k=>k.kind==='phone')!.value)!;await Linking.openURL(`https://wa.me/${n}?text=${encodeURIComponent(`Vamos jogar? Crie sua conta no MarcouJogou e peça minha amizade: ${invite.url}`)}`);})}/>
        <Button label="Enviar convite por SMS" small variant="outline" onPress={()=>void task(async()=>{const n=phoneKey(invite.contact!.identifiers.find(k=>k.kind==='phone')!.value)!;await Linking.openURL(`sms:+${n}${Platform.OS==='ios'?'&':'?'}body=${encodeURIComponent(`Vamos jogar no MarcouJogou? ${invite.url}`)}`);})}/>
      </>}
      <Button label="Fechar convite" variant="ghost" small onPress={()=>setInvite(null)}/>
    </View>}
    {!!notice&&<Text accessibilityRole="alert" style={styles.hint}>{notice}</Text>}
  </Card>;
}
function FoundRow({player:p}:{player:FoundFriend}) {return <View style={styles.row}><Pressable style={styles.profile} onPress={()=>router.push(`/jogador/${p.id}`)}><Avatar name={p.name} photoUrl={p.avatarUrl} size={32}/><View style={{flex:1}}><Text style={styles.label}>{p.nickname||p.name}</Text>{p.distanceKm!==undefined&&<Text style={styles.hint}>Até cerca de {p.distanceKm} km</Text>}</View></Pressable><FriendButton playerId={p.id}/></View>;}
const styles=StyleSheet.create({card:{gap:spacing.sm,marginBottom:spacing.lg},title:{fontSize:16,fontWeight:'800',color:colors.text,marginTop:8},hint:{color:colors.textMuted,fontSize:12,lineHeight:18},label:{fontSize:13,color:colors.text,flex:1},row:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},profile:{flex:1,flexDirection:'row',alignItems:'center',gap:8,minWidth:120},contact:{borderTopWidth:1,borderColor:colors.cardBorder,paddingTop:8,gap:6}});
