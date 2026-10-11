import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { Badge } from '@/components/ui/Badge';
import { colors, spacing } from '@/constants/theme';
import { isMockMode } from '@/lib/supabase';
import { readVenueReviews, reviewSession, venueReviewAction, type ReviewQuery } from '@/lib/venueReviews';
import { validateReview } from '@/lib/venueReviewRules';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import { REVIEW_CRITERIA, type ReviewExperience, type ReviewSnapshot, type VenueReview } from '@/types/venueReviews';

const REASONS = { harassment: 'Ofensa ou assédio', fraud: 'Fraude', unsafe_content: 'Conteúdo impróprio', spam: 'Spam', other: 'Outro' } as const;
export default function VenueReviewsScreen() {
  const { establishmentId, fieldId, moderation } = useLocalSearchParams<{ establishmentId?: string; fieldId?: string; moderation?: string }>();
  const logged = useAuthStore(s => s.isLoggedIn), authId = useAuthStore(s => s.authUserId), player = useAppStore(s => s.currentPlayerId);
  const key = `${reviewSession()}:${establishmentId ?? ''}:${fieldId ?? ''}:${moderation ?? ''}`;
  const [data, setData] = useState<ReviewSnapshot | null>(null), [forKey, setForKey] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const epoch = useRef(0);
  const query: ReviewQuery = { establishmentId, fieldId, moderation: moderation === '1' };
  const load = useCallback(async (before?: string) => {
    const n = ++epoch.current, session = reviewSession(); setBusy(true); setError('');
    try {
      const next = await readVenueReviews({ establishmentId, fieldId, moderation: moderation === '1', before });
      if (n !== epoch.current || session !== reviewSession()) return;
      setData(old => before && old ? { ...next, reviews: [...old.reviews, ...next.reviews.filter(r => !old.reviews.some(o => o.id===r.id))] } : next); setForKey(key);
    } catch (e) { if (n === epoch.current && session === reviewSession()) {setError(e instanceof Error ? e.message : 'Não foi possível carregar.');setData(null);} }
    finally { if (n === epoch.current) setBusy(false); }
  }, [key, establishmentId, fieldId, moderation]);
  useEffect(() => { setData(null); setForKey(''); setNotice(''); return () => {epoch.current++;}; }, [key, logged, authId, player]);
  useFocusEffect(useCallback(() => { void load(); return () => {epoch.current++;}; }, [load]));
  async function act(action: string, payload: Record<string, unknown>) {
    const session = reviewSession(); setBusy(true); setError(''); setNotice('');
    try { await venueReviewAction(action, payload); if(session!==reviewSession())return false; await load(); setNotice(action==='create'?'Avaliação publicada. Obrigado por ajudar outros jogadores!':action==='report'?'Denúncia enviada para análise. O conteúdo não é ocultado automaticamente.':action==='visit'?'Presença registrada. O participante já pode avaliar.':'Alteração salva.'); return true; }
    catch(e) { if(session===reviewSession())setError(e instanceof Error?e.message:'Não foi possível salvar.');return false; }
    finally { if(session===reviewSession())setBusy(false); }
  }
  const view = forKey===key ? data : null;
  return <Screen contentStyle={{gap:spacing.md}}>
    <View style={st.row}><Button small variant="ghost" label="Voltar" onPress={()=>router.back()} /><Text style={st.heading}>{moderation==='1'?'Moderação':'Avaliações do local'}</Text></View>
    {isMockMode&&<Text style={st.copy}>Demonstração: avaliações e presenças salvas somente neste navegador/aparelho.</Text>}
    {!!error&&<Text accessibilityLiveRegion="polite" style={st.error}>{error}</Text>}{!!notice&&<Text accessibilityLiveRegion="polite" style={st.copy}>{notice}</Text>}
    <Button small variant="outline" label="Atualizar avaliações" loading={busy} onPress={()=>void load()} />
    {view&&<>
      <Text style={st.title}>{view.title}</Text>
      {!query.moderation&&<>
        <Text style={st.copy}>Avaliações vinculadas a presença registrada. Patrocínio e assinatura não alteram notas nem compram destaque na reputação.</Text>
        <View style={st.row}><Button small label="Estabelecimento" variant={view.target==='establishment'?'primary':'outline'} onPress={()=>router.setParams({establishmentId:view.establishmentId!,fieldId:undefined})} />{view.fields.map(f=><Button key={f.id} small label={f.name} variant={view.fieldId===f.id?'primary':'outline'} onPress={()=>router.setParams({fieldId:f.id,establishmentId:undefined})} />)}</View>
        <Card><Text style={st.score}>{view.summary.average===null?'Sem avaliações':`★ ${view.summary.average.toFixed(1)} / 5`}</Text><Text style={st.copy}>{view.summary.count} avaliação(ões) verificada(s)</Text><View style={st.row}>{Object.entries(view.summary.criteria).map(([k,v])=><Text key={k} style={st.copy}>{(REVIEW_CRITERIA[view.target] as Record<string,string>)[k]}: {v.toFixed(1)}</Text>)}</View></Card>
        {view.nps&&<Card><Text style={st.title}>NPS do estabelecimento</Text><Text style={st.score}>{view.nps.value===null?'Aguardando amostra':`${view.nps.value} NPS`}</Text><Text style={st.copy}>{view.nps.responses} resposta(s). Resultado de −100 a 100, separado das estrelas.</Text>{view.nps.value===null?<Text style={st.copy}>Mostramos o resultado a partir de 5 respostas, sem expor a nota individual.</Text>:<Text style={st.copy}>{view.nps.promoters} promotores (9–10) · {view.nps.passives} neutros (7–8) · {view.nps.detractors} detratores (0–6)</Text>}</Card>}
        {!logged?<Button small label="Entrar para avaliar" onPress={()=>router.push('/(auth)/login')} />:view.experiences.length>0?<ReviewForm key={key} data={view} busy={busy} act={act} />:<Text style={st.copy}>{view.canReply?'Você pode responder às avaliações, mas não avaliar o próprio local.':'Para avaliar: partida encerrada com check-in e sem falta, aula concluída com presença ou presença confirmada pelo dono na reserva avulsa. Cada experiência permite uma avaliação por local. Se já avaliou, não aparece novamente.'}</Text>}
        {view.canReply&&view.visitCandidates.length>0&&<Visits data={view} busy={busy} act={act} />}
      </>}
      {query.moderation&&<Text style={st.copy}>Denúncias e conteúdos ocultados. Analise o contexto: uma crítica negativa não é motivo para remoção. Toda decisão exige justificativa e fica na auditoria.</Text>}
      <Text style={st.title}>{query.moderation?'Fila de moderação':'Comentários e experiências'}</Text>
      {!view.reviews.length&&<Text style={st.copy}>{query.moderation?'Nenhuma avaliação aguardando análise.':'Ainda não há avaliações publicadas para este local.'}</Text>}
      {view.reviews.map(r=><ReviewRow key={r.id} review={r} owner={view.canReply} moderator={!!query.moderation&&view.canModerate} logged={logged} busy={busy} act={act} />)}
      {view.hasMore&&<Button small variant="outline" label="Carregar mais avaliações" loading={busy} onPress={()=>void load(view.reviews.at(-1)?.id)} />}
    </>}
  </Screen>;
}
type Act = (action:string,payload:Record<string,unknown>)=>Promise<boolean>;
function RatingPicker({label,value,onChange,nps=false,disabled=false}:{label:string;value:number|null;onChange:(v:number)=>void;nps?:boolean;disabled?:boolean}) {
  return <View style={{gap:spacing.xs}}><Text style={st.label}>{label}</Text><View style={st.row}>{Array.from({length:nps?11:5},(_,i)=>nps?i:i+1).map(n=><Pressable key={n} accessibilityRole="radio" accessibilityLabel={`${label}: ${n}`} accessibilityState={{selected:value===n,disabled}} disabled={disabled} onPress={()=>onChange(n)} style={[st.rating,value===n&&st.selected,disabled&&{opacity:0.6}]}><Text style={[st.ratingText,value===n&&{color:colors.onAction}]}>{nps?n:`${n}★`}</Text></Pressable>)}</View></View>;
}
function ReviewForm({data,busy,act}:{data:ReviewSnapshot;busy:boolean;act:Act}) {
  const [selected,setSelected]=useState<ReviewExperience|null>(null),[score,setScore]=useState<number|null>(null),[criteria,setCriteria]=useState<Record<string,number>>({});
  const [nps,setNps]=useState<number|null>(null),[comment,setComment]=useState(''),[error,setError]=useState('');
  const e=selected&&data.experiences.some(e=>e.id===selected.id&&e.kind===selected.kind)?selected:data.experiences[0];
  async function submit(){try{validateReview(data.target,score,criteria,nps);setError('');if(await act('create',{target:data.target,kind:e.kind,experienceId:e.id,score,criteria,nps,comment})){setScore(null);setCriteria({});setComment('');setNps(null);}}catch(e){setError(e instanceof Error?e.message:'Verifique as notas.');}}
  return <Card style={{gap:spacing.md}}><Text style={st.title}>Conte como foi</Text><Text style={st.copy}>Seu nome/apelido, estrelas e comentário serão públicos. A recomendação NPS é opcional e só aparece agregada para o dono. Depois de enviar, não é possível votar novamente nesta experiência.</Text>
    <Text style={st.label}>Experiência verificada</Text>{data.experiences.slice(0,30).map(x=><Button key={`${x.kind}:${x.id}`} small variant={x.id===e.id?'primary':'outline'} disabled={busy} label={`${x.label} · ${new Date(x.at).toLocaleDateString('pt-BR')}`} onPress={()=>setSelected(x)} />)}
    <RatingPicker label="Nota geral" value={score} onChange={setScore} disabled={busy} />
    {Object.entries(REVIEW_CRITERIA[data.target]).map(([k,label])=><View key={k}><RatingPicker label={label} value={criteria[k]??null} onChange={v=>setCriteria({...criteria,[k]:v})} disabled={busy} />{k==='snack'&&<Button small variant="ghost" label="Não utilizei a lanchonete" disabled={busy} onPress={()=>setCriteria(({snack,...others})=>others)} />}</View>)}
    <TextField label="Comentário público (opcional)" value={comment} onChangeText={setComment} maxLength={1500} multiline editable={!busy} placeholder="O que foi bom? O que pode melhorar?" />
    {data.target==='establishment'&&<><RatingPicker label="Quanto recomendaria este estabelecimento?" nps value={nps} onChange={setNps} disabled={busy} /><Button small variant="ghost" label="Prefiro não responder o NPS" disabled={busy} onPress={()=>setNps(null)} /></>}
    {!!error&&<Text style={st.error}>{error}</Text>}<Button small label="Publicar avaliação" loading={busy} onPress={()=>void submit()} />
  </Card>;
}
function ReviewRow({review:r,owner,moderator,logged,busy,act}:{review:VenueReview;owner:boolean;moderator:boolean;logged:boolean;busy:boolean;act:Act}) {
  const [editing,setEditing]=useState(false),[text,setText]=useState(r.reply??''),[report,setReport]=useState<'review'|'reply'|null>(null);
  const [reason,setReason]=useState<keyof typeof REASONS>('other'),[details,setDetails]=useState(''),[moderationReason,setModerationReason]=useState('');
  useEffect(()=>setText(r.reply??''),[r.reply]);
  return <Card style={{gap:spacing.sm}}>
    <View style={st.row}><Text style={[st.title,{flex:1}]}>{r.authorName}{r.mine?' · você':''}</Text><Text style={st.label}>★ {r.score}/5</Text></View>
    <Badge label="Experiência verificada" color={colors.success} /><Text style={st.copy}>{new Date(r.createdAt).toLocaleDateString('pt-BR')} · {r.target==='field'?r.fieldName:r.establishmentName}</Text>
    {!!r.comment&&<Text style={st.comment}>{r.comment}</Text>}{r.hidden&&<Text style={st.error}>Avaliação ocultada pela plataforma</Text>}
    {!!r.reply&&<View style={st.reply}><Text style={st.label}>Resposta do proprietário</Text><Text style={st.comment}>{r.reply}</Text>{r.replyHidden&&<Text style={st.error}>Resposta ocultada</Text>}</View>}
    {owner&&!r.hidden&&!r.replyHidden&&<><Button small variant="outline" label={editing?'Cancelar resposta':r.reply?'Editar resposta':'Responder avaliação'} disabled={busy} onPress={()=>setEditing(!editing)} />{editing&&<><TextField label="Resposta pública" value={text} onChangeText={setText} maxLength={1500} multiline editable={!busy} /><Button small label="Publicar resposta" loading={busy} disabled={!text.trim()} onPress={()=>void act('reply',{reviewId:r.id,text}).then(ok=>ok&&setEditing(false))} /></>}</>}
    {logged&&!moderator&&<View style={st.row}>{!r.mine&&<Button small variant="ghost" label={r.reported?'Avaliação denunciada':'Denunciar avaliação'} disabled={busy||r.reported} onPress={()=>setReport('review')} />}{!!r.reply&&!owner&&<Button small variant="ghost" label={r.replyReported?'Resposta denunciada':'Denunciar resposta'} disabled={busy||r.replyReported} onPress={()=>setReport('reply')} />}</View>}
    {report&&<><Text style={st.label}>Denunciar {report==='reply'?'resposta':'avaliação'}</Text><View style={st.row}>{Object.entries(REASONS).map(([k,label])=><Button key={k} small label={label} variant={reason===k?'primary':'outline'} disabled={busy} onPress={()=>setReason(k as keyof typeof REASONS)} />)}</View><TextField label="Detalhes da denúncia (privados)" value={details} onChangeText={setDetails} maxLength={1000} multiline editable={!busy} /><View style={st.row}><Button small label="Enviar denúncia" loading={busy} onPress={()=>void act('report',{reviewId:r.id,subject:report,reason,details}).then(ok=>ok&&setReport(null))} /><Button small variant="ghost" label="Cancelar denúncia" disabled={busy} onPress={()=>setReport(null)} /></View></>}
    {moderator&&<>{r.reports.map((p,i)=><Text key={i} style={st.copy}>Denúncia de {p.subject==='reply'?'resposta':'avaliação'}: {REASONS[p.reason as keyof typeof REASONS]??p.reason} · {p.details||'Sem detalhes'}</Text>)}<TextField label="Justificativa da moderação" value={moderationReason} onChangeText={setModerationReason} maxLength={1000} multiline editable={!busy} /><View style={st.row}>{(['review','reply'] as const).filter(s=>s==='review'||r.reply!==null).map(subject=><Button key={subject} small variant="outline" label={`${(subject==='review'?r.hidden:r.replyHidden)?'Restaurar':'Ocultar'} ${subject==='review'?'avaliação':'resposta'}`} disabled={busy||moderationReason.trim().length<10} onPress={()=>void act('moderate',{reviewId:r.id,subject,hidden:!(subject==='review'?r.hidden:r.replyHidden),reason:moderationReason})} />)}{r.reports.length>0&&<Button small variant="ghost" label="Arquivar denúncias mantendo a decisão atual" disabled={busy||moderationReason.trim().length<10} onPress={()=>void (async()=>{for(const subject of new Set(r.reports.map(p=>p.subject)))if(!await act('moderate',{reviewId:r.id,subject,hidden:subject==='review'?r.hidden:r.replyHidden,reason:moderationReason}))break;})()} />}</View></>}
  </Card>;
}
function Visits({data,busy,act}:{data:ReviewSnapshot;busy:boolean;act:Act}) {
  const [open,setOpen]=useState(false),[pending,setPending]=useState<string|null>(null);
  return <Card style={{gap:spacing.sm}}><Text style={st.title}>Presença nas reservas</Text><Text style={st.copy}>Confirme somente quem realmente compareceu. Não cria avaliação nem exige nota positiva. Partidas com check-in e aulas com chamada já liberam a avaliação automaticamente.</Text><Button small variant="outline" label={open?'Fechar presenças':'Conferir reservas encerradas'} disabled={busy} onPress={()=>setOpen(!open)} />{open&&data.visitCandidates.map(c=>{const id=`${c.bookingId}:${c.date}:${c.playerId}`;return <View key={id} style={st.reply}><Text style={st.label}>{c.playerName}</Text><Text style={st.copy}>{c.label} · {c.date.split('-').reverse().join('/')}</Text><Button small variant="outline" label={pending===id?'Confirmar que compareceu':'Registrar presença'} disabled={busy} onPress={()=>pending===id?void act('visit',{...c,establishmentId:data.establishmentId}).then(ok=>ok&&setPending(null)):setPending(id)} /></View>;})}</Card>;
}
const st=StyleSheet.create({heading:{fontSize:18,fontWeight:'800',color:colors.text,flex:1},title:{fontSize:16,fontWeight:'800',color:colors.text},score:{fontSize:24,fontWeight:'800',color:colors.primaryDark},copy:{fontSize:12,color:colors.textMuted,lineHeight:18},label:{fontSize:13,fontWeight:'700',color:colors.text},comment:{fontSize:14,color:colors.text,lineHeight:21},error:{fontSize:12,color:colors.danger},row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:spacing.sm},rating:{minWidth:40,minHeight:40,padding:8,borderRadius:10,borderWidth:1,borderColor:colors.cardBorder,alignItems:'center',justifyContent:'center',backgroundColor:colors.bg},selected:{backgroundColor:colors.action,borderColor:colors.primaryDark},ratingText:{fontSize:13,fontWeight:'700',color:colors.text},reply:{padding:spacing.sm,borderLeftWidth:3,borderLeftColor:colors.primary,backgroundColor:colors.bg,gap:spacing.xs}});
