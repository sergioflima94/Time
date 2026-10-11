import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { ConversationEntry, WhatsAppGroupButton } from '@/components/ConversationEntry';
import { colors } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { conversationAction, conversationSession, conversationSnapshot } from '@/lib/conversations';
import { conversationUuid } from '@/lib/conversationRules';
import { isMockMode, supabase } from '@/lib/supabase';
import type { BookingChatKind, ConversationKind, ConversationSnapshot, TeamChatConfig } from '@/types/conversations';

export default function ConversationsScreen() {
  const params = useLocalSearchParams<{roomId?:string;kind?:ConversationKind;contextId?:string;bookingKind?:BookingChatKind}>();
  const me = useAppStore(s => s.currentPlayerId);
  const auth = useAuthStore(s => s.authUserId);
  const logged = useAuthStore(s => s.isLoggedIn);
  const teams = useAppStore(s => s.peladas);
  const memberships = useAppStore(s => s.memberships);
  const games = useAppStore(s => s.games);
  const campaigns = useAppStore(s => s.fundraisingCampaigns);
  const polls = useAppStore(s => s.teamAvailabilityPolls);
  const key = logged ? isMockMode ? `demo:${me}` : auth : null;
  const [loaded,setLoaded] = useState<{key:string|null;data:ConversationSnapshot}|null>(null);
  const [roomId,setRoomId] = useState(params.roomId);
  const [text,setText] = useState('');
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [settings,setSettings] = useState(false);
  const [teamEditor,setTeamEditor] = useState(false);
  const [config,setConfig] = useState<TeamChatConfig>({mode:'internal',whatsappUrl:null,adminOnly:false});
  const [reportId,setReportId] = useState<string|null>(null);
  const [older,setOlder] = useState<ConversationSnapshot['messages']>([]);
  const [olderAvailable,setOlderAvailable] = useState(true);
  const [paging,setPaging] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const activeRoom = useRef(roomId);
  const viewGeneration = useRef(0);
  activeRoom.current = roomId;
  const nonce = useRef<string|null>(null);
  const draftScope = useRef('');
  const lastWindow = useRef<{key:string|null;roomId:string;messages:ConversationSnapshot['messages']}|null>(null);
  const scroll = useRef<ScrollView>(null);
  const atBottom = useRef(true);
  const snapshot = loaded?.key === key ? loaded.data : null;

  function publish(data:ConversationSnapshot,expectedKey:string|null) {
    if(conversationSession()!==expectedKey) return;
    const previous=lastWindow.current;
    if(data.room && previous?.key===expectedKey && previous.roomId===data.room.id) {
      setOlder(history => history.length ? [...new Map([...history,...previous.messages].map(m => [m.id,m])).values()]
        .filter(m => !data.messages.some(n => n.id===m.id)).sort((a,b) => a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)) : history);
    }
    lastWindow.current=data.room?{key:expectedKey,roomId:data.room.id,messages:data.messages}:null;
    setLoaded({key:expectedKey,data});
  }

  useFocusEffect(useCallback(() => {
    let cancelled=false,inFlight=false;
    viewGeneration.current++;
    setBusy(false);setPaging(false);setReportId(null);setTeamEditor(false);
    const activeKey=key;
    let selected=params.roomId;
    setLoading(true); setNotice(''); setLoaded(null); setOlder([]); setOlderAvailable(true);lastWindow.current=null;
    const scope=`${activeKey}:${params.roomId??`${params.kind}:${params.contextId}:${params.bookingKind}`}`;
    if(draftScope.current!==scope){setText('');nonce.current=null;draftScope.current=scope;}
    async function reload(initial=false) {
      if(inFlight || AppState.currentState==='background') return;
      inFlight=true;
      try {
        if(initial && params.kind && params.contextId) selected=(await conversationAction('open',{kind:params.kind,contextId:params.contextId,bookingKind:params.bookingKind})).id;
        if(cancelled || conversationSession()!==activeKey) return;
        const data=await conversationSnapshot(selected);
        if(cancelled || conversationSession()!==activeKey) return;
        publish(data,activeKey); setRoomId(selected);
        if(initial && data.teamConfig) setConfig(data.teamConfig);
        if(selected && data.room?.status==='accepted' && !data.room.blocked) await conversationAction('read',{roomId:selected});
      } catch(e) {
        if(!cancelled && conversationSession()===activeKey) {
          setNotice(e instanceof Error?e.message:'Falha ao carregar conversas.');
          // Falhar fechado: sem histórico na tela se o servidor não confirmar acesso.
          setLoaded(null);
        }
      } finally {inFlight=false; if(!cancelled) setLoading(false);}
    }
    void reload(true);
    const interval=setInterval(() => void reload(),10000);
    const lifecycle=AppState.addEventListener('change',state => {if(state==='active') void reload();});
    const channel=!isMockMode && supabase ? supabase.channel(`community-chat:${activeKey}:${params.roomId??params.contextId??'inbox'}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'community_messages'},() => void reload()).subscribe() : null;
    return () => {cancelled=true;clearInterval(interval);lifecycle.remove();if(channel && supabase) void supabase.removeChannel(channel);};
  },[key,params.roomId,params.kind,params.contextId,params.bookingKind,attempt]));

  async function refresh() {
    const expected=key;
    const generation=viewGeneration.current;
    const data=await conversationSnapshot(roomId);
    if(generation===viewGeneration.current) publish(data,expected);
  }
  async function act(action:string,payload:Record<string,unknown>,success='Salvo.') {
    if(busy) return;
    const generation=viewGeneration.current;
    setBusy(true);setNotice('');
    try {await conversationAction(action,payload);if(generation!==viewGeneration.current)return;await refresh();if(generation===viewGeneration.current)setNotice(success);} catch(e) {
      if(generation!==viewGeneration.current)return;
      setNotice(e instanceof Error?e.message:'Não foi possível concluir.');
      // Não manter uma conversa acessível depois de revogação/bloqueio remoto.
      try {await refresh();} catch {setLoaded(null);}
    } finally {if(generation===viewGeneration.current)setBusy(false);}
  }
  async function send() {
    if(busy || !roomId || !snapshot?.canPost || !text.trim()) return;
    const generation=viewGeneration.current;
    setBusy(true);setNotice('');nonce.current??=conversationUuid();
    const currentText=text;
    try {
      await conversationAction('send',{roomId,text:currentText,nonce:nonce.current});
      if(generation!==viewGeneration.current)return;
      setText('');nonce.current=null;atBottom.current=true;
      await conversationAction('read',{roomId});await refresh();
    } catch(e) {
      if(generation!==viewGeneration.current)return;
      setNotice(e instanceof Error?e.message:'Envio não concluído. Sua mensagem foi mantida para tentar novamente.');
      try {await refresh();} catch {setLoaded(null);}
    }
    finally {if(generation===viewGeneration.current)setBusy(false);}
  }
  async function loadOlder() {
    if(!roomId || paging) return;setPaging(true);
    const generation=viewGeneration.current;
    try {
      const cursor=older[0]?.createdAt ?? snapshot?.messages[0]?.createdAt;
      const data=await conversationSnapshot(roomId,cursor);
      if(activeRoom.current!==roomId || generation!==viewGeneration.current) return;
      setOlder(previous => [...data.messages,...previous]);setOlderAvailable(data.hasOlder);
    }catch(e){if(generation===viewGeneration.current)setNotice(e instanceof Error?e.message:'Falha ao carregar histórico.');}finally{if(generation===viewGeneration.current)setPaging(false);}
  }
  const room=snapshot?.room;
  const ownTeams=teams.filter(t => memberships.some(m => m.peladaId===t.id && m.playerId===me && m.active));
  const incoming=snapshot?.rooms.filter(r => r.status==='pending' && r.requesterId!==me && !r.blocked) ?? [];
  const selectedTeam=room?.kind==='team' ? room.contextId : null;
  const nextGame=games.filter(g => g.peladaId===selectedTeam && (g.status==='in_progress' || Date.parse(g.scheduledAt)>=Date.now() && !['finished','cancelled'].includes(g.status)))
    .sort((a,b) => Number(b.status==='in_progress')-Number(a.status==='in_progress') || Date.parse(a.scheduledAt)-Date.parse(b.scheduledAt))[0];
  const openCampaigns=campaigns.filter(c => c.peladaId===selectedTeam && c.status==='active').length;
  const openPolls=polls.filter(p => p.status==='open' && games.some(g => g.id===p.gameId && g.peladaId===selectedTeam)).length;
  const header=<View style={styles.header}>
    <Button small variant="ghost" label={room || params.kind || params.roomId?'Conversas':'Voltar'} onPress={() => room || params.kind || params.roomId ? router.replace('/conversas') : router.back()} />
    <View style={{flex:1}}><Text style={styles.title}>{room?.title ?? 'Conversas'}</Text><Text style={styles.caption}>{room?.kind==='booking'?'Conversa não confirma reserva nem pagamento.':room?.kind==='team'?'O ponto de encontro do seu time.':'Combine o jogo, sem expor seu telefone.'}</Text></View>
  </View>;
  const feedback=notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null;
  if(room) return <Screen scroll={false} contentStyle={{flex:1,paddingBottom:12}}>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      {header}{feedback}
      {room.kind==='team'&&<View style={styles.pins}>
        {nextGame&&<Button small variant="outline" label={nextGame.status==='in_progress'?'Jogo ao vivo':'Próximo jogo'} onPress={() => router.push(`/jogo/${nextGame.id}`)} />}
        <Button small variant="outline" label={`Vaquinhas${openCampaigns?` (${openCampaigns})`:''}`} onPress={() => router.push(`/time/${room.contextId}/vaquinhas`)} />
        {openPolls>0&&<Button small variant="outline" label={`Enquetes (${openPolls})`} onPress={() => {const poll=polls.find(p => p.status==='open' && games.some(g => g.id===p.gameId && g.peladaId===selectedTeam));if(poll)router.push(`/jogo/${poll.gameId}`);}} />}
        {snapshot.teamConfig?.mode!=='internal' && snapshot.teamConfig?.whatsappUrl && <WhatsAppGroupButton url={snapshot.teamConfig.whatsappUrl} />}
        {snapshot.canManage&&<Button small variant="ghost" label="Configurar chat do time" onPress={() => {if(snapshot.teamConfig)setConfig(snapshot.teamConfig);setTeamEditor(!teamEditor);}} />}
      </View>}
      <ScrollView ref={scroll} style={{flex:1}} contentContainerStyle={{paddingVertical:10,gap:10}}
        onScroll={e => {const {layoutMeasurement,contentOffset,contentSize}=e.nativeEvent;atBottom.current=contentSize.height-contentOffset.y-layoutMeasurement.height<90;}} scrollEventThrottle={100}
        onContentSizeChange={() => {if(atBottom.current&&!paging)scroll.current?.scrollToEnd({animated:false});}}>
        {teamEditor&&snapshot.canManage&&<Card style={{gap:10}}><Text style={styles.section}>Como o time conversa</Text>
          <View style={styles.pins}>{(['internal','whatsapp','both'] as const).map(mode => <Button key={mode} small variant={config.mode===mode?'primary':'outline'} label={{internal:'Interno',whatsapp:'WhatsApp',both:'Ambos'}[mode]} onPress={() => setConfig(c => ({...c,mode}))} />)}</View>
          <TextField label="Link do grupo do WhatsApp" value={config.whatsappUrl??''} onChangeText={whatsappUrl => setConfig(c => ({...c,whatsappUrl}))} autoCapitalize="none" placeholder="https://chat.whatsapp.com/..." />
          <View style={styles.switchRow}><Text style={styles.copy}>Só administradores publicam no chat interno</Text><Switch accessibilityLabel="Só administradores publicam" value={config.adminOnly} onValueChange={adminOnly => setConfig(c => ({...c,adminOnly}))} /></View>
          <Text style={styles.caption}>O convite fica visível apenas aos membros. Conversas do WhatsApp não são copiadas para o app.</Text>
          <Button label="Salvar configuração do chat" loading={busy} onPress={() => void act('team_config',{teamId:room.contextId,config},'Configuração do time atualizada.')} />
        </Card>}
        {room.blocked?<Card><Text style={styles.copy}>Conversa indisponível por bloqueio. O histórico privado não é exibido.</Text></Card>:room.status==='pending'?<Card style={{gap:10}}>
          <Text style={styles.section}>{room.requesterId===me?'Solicitação enviada':'Solicitação de conversa'}</Text>
          <Text style={styles.copy}>Nenhuma mensagem é liberada antes do aceite. Aceitar não adiciona a pessoa como amiga.</Text>
          {room.requesterId!==me&&<View style={styles.pins}><Button small label="Aceitar conversa" disabled={busy} onPress={() => void act('respond',{roomId,accept:true},'Conversa aceita.')} /><Button small variant="outline" label="Recusar conversa" disabled={busy} onPress={() => void act('respond',{roomId,accept:false},'Solicitação recusada.')} /></View>}
        </Card>:room.status==='declined'?<Text style={styles.copy}>Solicitação recusada. Não é possível enviar mensagens nem reenviar a solicitação.</Text>:<>
          {snapshot.hasOlder&&olderAvailable&&<Button small variant="ghost" label="Carregar mensagens anteriores" loading={paging} onPress={() => void loadOlder()} />}
          {snapshot.messages.length===0&&<Text style={styles.empty}>Sem mensagens. Combine horário, transporte ou tire uma dúvida.</Text>}
          {[...older.filter(m => !snapshot.messages.some(n => n.id===m.id)),...snapshot.messages].map(message => <View key={message.id} style={[styles.bubble,message.senderId===me&&styles.mine]}>
            <Text style={styles.sender}>{message.senderId===me?'Você':message.senderName}</Text>
            <Text selectable style={styles.message}>{message.text}</Text>
            <View style={styles.messageFooter}><Text style={styles.time}>{new Date(message.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</Text>
              {message.senderId!==me&&<Pressable accessibilityRole="button" accessibilityLabel={`Denunciar mensagem de ${message.senderName}`} style={styles.reportButton} onPress={() => setReportId(message.id)}><Text style={styles.caption}>Denunciar</Text></Pressable>}
            </View>
          </View>)}
        </>}
        {reportId&&<Card style={{gap:8}}><Text style={styles.section}>Por que denunciar esta mensagem?</Text><View style={styles.pins}>{[['harassment','Assédio'],['spam','Spam'],['fraud','Fraude'],['unsafe_content','Conteúdo impróprio'],['other','Outro motivo']].map(([reason,label]) => <Button key={reason} small variant="outline" label={label} disabled={busy} onPress={() => {void act('report',{roomId,messageId:reportId,reason},'Denúncia enviada à administração com a mensagem para análise.');setReportId(null);}} />)}</View><Button small variant="ghost" label="Cancelar denúncia" onPress={() => setReportId(null)} /></Card>}
      </ScrollView>
      {room.otherId&&<Button small variant="ghost" label={snapshot.blocks.some(b => b.id===room.otherId)?'Desbloquear jogador':'Bloquear jogador'} disabled={busy} onPress={() => void act(snapshot.blocks.some(b => b.id===room.otherId)?'unblock':'block',{playerId:room.otherId},'Preferência de contato atualizada.')} />}
      {snapshot.canPost?<View style={styles.composer}><TextInput accessibilityLabel="Mensagem" placeholder="Escreva uma mensagem…" placeholderTextColor={colors.textMuted} multiline maxLength={2000} value={text} editable={!busy} onChangeText={value => {setText(value);nonce.current=null;}} style={styles.input} /><Button small label="Enviar" loading={busy} disabled={!text.trim()} onPress={() => void send()} /></View>
        :room.status==='accepted'&&!room.blocked&&<Text style={styles.caption}>{snapshot.teamConfig?.mode==='whatsapp'?'Este time conversa no WhatsApp. Use o botão do grupo.':'Somente administradores publicam neste canal.'}</Text>}
    </KeyboardAvoidingView>
  </Screen>;

  return <Screen>{header}{feedback}
    {loading&&<Text style={styles.copy}>Carregando conversas…</Text>}
    {!!(params.kind||params.roomId)&&!loading&&<Button label="Tentar novamente" variant="outline" onPress={() => setAttempt(n => n+1)} />}
    <Button small variant="ghost" label={settings?'Fechar privacidade':'Privacidade das conversas'} onPress={() => setSettings(!settings)} />
    {settings&&snapshot&&<Card style={styles.card}><View style={styles.switchRow}><Text style={styles.copy}>Novas conversas só de amigos</Text><Switch accessibilityLabel="Novas conversas só de amigos" value={snapshot.settings.friendsOnly} disabled={busy} onValueChange={friendsOnly => void act('settings',{friendsOnly},'Preferência atualizada.')} /></View><Text style={styles.caption}>Quando desligado, pessoas de fora precisam de aceite. Bloqueios impedem mensagens privadas nos dois sentidos, mas não removem membros dos grupos.</Text>{snapshot.blocks.map(b => <View key={b.id} style={styles.switchRow}><Text style={styles.copy}>{b.name}</Text><Button small variant="outline" label={`Desbloquear ${b.name}`} disabled={busy} onPress={() => void act('unblock',{playerId:b.id})} /></View>)}</Card>}
    {ownTeams.length>0&&<><Text style={styles.section}>Seus times</Text><View style={styles.pins}>{ownTeams.map(t => <ConversationEntry key={t.id} kind="team" contextId={t.id} label={t.name} />)}</View></>}
    {incoming.length>0&&<Text style={styles.section}>Solicitações recebidas ({incoming.length})</Text>}
    {incoming.map(r => <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push({pathname:'/conversas',params:{roomId:r.id}})}><Card style={styles.card}><Text style={styles.roomTitle}>{r.title}</Text><Text style={styles.caption}>Quer conversar com você · toque para aceitar ou recusar</Text></Card></Pressable>)}
    <Text style={styles.section}>Suas conversas</Text>
    {!snapshot?.rooms.length&&!loading&&<Text style={styles.empty}>Abra o chat de um time, o perfil de um amigo ou o atendimento de uma reserva.</Text>}
    {snapshot?.rooms.filter(r => !incoming.some(p => p.id===r.id)).map(r => <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`Abrir conversa ${r.title}`} onPress={() => router.push({pathname:'/conversas',params:{roomId:r.id}})}><Card style={styles.roomCard}><View style={{flex:1}}><Text style={styles.roomTitle}>{r.title}</Text><Text numberOfLines={1} style={styles.caption}>{r.blocked?'Contato bloqueado':r.status==='pending'?'Aguardando aceite':r.status==='declined'?'Solicitação recusada':r.lastText??'Comece a conversa'}</Text></View>{r.unread>0&&<Text style={styles.unread}>{r.unread}</Text>}<Ionicons name="chevron-forward" size={16} color={colors.textMuted} /></Card></Pressable>)}
    <Button small variant="outline" label="Encontrar meus amigos" onPress={() => router.push('/(tabs)/amigos')} />
  </Screen>;
}
const styles=StyleSheet.create({
  header:{flexDirection:'row',alignItems:'center',gap:6,marginBottom:12},title:{fontSize:19,fontWeight:'900',color:colors.text},caption:{fontSize:11,lineHeight:16,color:colors.textMuted},
  copy:{fontSize:13,lineHeight:19,color:colors.text,flexShrink:1},section:{fontSize:15,fontWeight:'800',color:colors.text,marginVertical:8},
  pins:{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:8},card:{gap:8,marginBottom:10,padding:12},roomCard:{flexDirection:'row',gap:10,alignItems:'center',padding:12,marginBottom:8},
  roomTitle:{fontSize:14,fontWeight:'800',color:colors.text},unread:{padding:6,backgroundColor:colors.action,borderRadius:14,fontWeight:'800',color:colors.onAction},
  notice:{fontSize:12,lineHeight:18,color:colors.secondaryDark,marginBottom:8},switchRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  bubble:{alignSelf:'flex-start',maxWidth:'90%',backgroundColor:colors.card,borderWidth:1,borderColor:colors.cardBorder,borderRadius:16,paddingHorizontal:12,paddingVertical:8},
  mine:{alignSelf:'flex-end',backgroundColor:'#E7F7CF',borderColor:'#C8DFAD'},sender:{fontSize:11,fontWeight:'800',color:colors.primaryDark,marginBottom:4},message:{fontSize:14,lineHeight:21,color:colors.text},
  messageFooter:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},time:{fontSize:10,color:colors.textMuted},reportButton:{minHeight:44,justifyContent:'center',paddingHorizontal:8},
  empty:{color:colors.textMuted,fontSize:13,lineHeight:19,paddingVertical:18},composer:{flexDirection:'row',alignItems:'flex-end',gap:8,paddingTop:8,borderTopWidth:1,borderTopColor:colors.cardBorder},
  input:{flex:1,minHeight:44,maxHeight:100,borderWidth:1,borderColor:colors.cardBorder,borderRadius:14,padding:10,color:colors.text,backgroundColor:colors.card,fontSize:14},
});
