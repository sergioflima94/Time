import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { AdaptiveSelect } from '@/components/ui/AdaptiveSelect';
import { LanceVideo } from '@/components/LanceVideo';
import { useLances } from '@/hooks/useLances';
import { lanceAction, shareLance } from '@/lib/lances';
import { createUuid } from '@/lib/uuid';
import { lancePublicLink } from '@/lib/lanceRules';
import { getSport } from '@/constants/sports';
import { colors, spacing } from '@/constants/theme';
import type { Lance, LanceKind, LanceSnapshot } from '@/types/lances';

type Run = (action: string, data?: Record<string, unknown>) => Promise<boolean>;
export default function LanceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(), feed = useLances({ id });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [comment, setComment] = useState('');
  const [reporting, setReporting] = useState(false), [reason, setReason] = useState('unsafe_content'), [details, setDetails] = useState('');
  const [deleting, setDeleting] = useState(false);
  const lock = useRef(false), commentNonce = useRef(createUuid());
  const lance = feed.data.items[0], me = feed.data.me;
  useEffect(() => { setComment(''); setDetails(''); setMessage(''); setReporting(false); setDeleting(false); commentNonce.current = createUuid(); }, [id, me]);
  async function run(action: string, data: Record<string, unknown> = {}) {
    if (!lance || lock.current) return false;
    lock.current = true;
    setBusy(true); setMessage('');
    try {
      await lanceAction(action, { id: lance.id, revision: lance.revision, ...data });
      if (action === 'delete') { router.replace({ pathname: '/lances', params: { gameId: lance.gameId } }); return true; }
      await feed.refresh(); setMessage(action === 'report' ? 'Denúncia enviada à moderação.' : 'Alteração confirmada.'); return true;
    } catch (e) { setMessage((e as Error).message); return false; } finally { lock.current = false; setBusy(false); }
  }
  async function share() {
    if (!lance) return;
    try { const result = await shareLance(lance); if (result) setMessage(result); } catch (e) { setMessage((e as Error).message); }
  }
  return <Screen contentStyle={{ gap: spacing.md }}>
    <Button small variant="ghost" label="Voltar" onPress={() => router.canGoBack() ? router.back() : router.replace('/lances')} />
    <Button small variant="outline" label="Atualizar lance" loading={feed.busy} onPress={() => void feed.refresh()} />
    {!!(message || feed.error) && <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>{message || feed.error}</Text>}
    {!lance ? <><Text style={{ color: colors.text }}>{feed.busy ? 'Carregando lance…' : 'Lance indisponível, removido ou privado.'}</Text><Button label="Tentar novamente" onPress={() => void feed.refresh()} /></> : <>
      <Text style={{ color: colors.text, fontSize: 23, fontWeight: '800' }}>{lance.title}</Text>
      <Text style={{ color: colors.textMuted }}>{lance.teamName} · {lance.authorName} · {lance.publishedAt ? lance.visibility === 'team' ? 'Somente o time' : 'Publicado para todos' : 'Rascunho privado'}</Text>
      {lance.mediaKey ? <LanceVideo key={`${id}:${lance.revision}`} mediaKey={lance.mediaKey} /> : <Card><Text style={{ color: colors.textMuted }}>Envio incompleto. Se o arquivo já chegou, tente concluir abaixo. Caso contrário, exclua este rascunho e envie novamente pela partida.</Text></Card>}
      {!!lance.caption && <Text style={{ color: colors.text }}>{lance.caption}</Text>}
      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.text, fontWeight: '800' }}>Quem participou do lance</Text>
        <Text style={{ color: colors.text }}>{lance.scorerName ? `${lance.kind === 'point' ? 'Ponto' : 'Gol'}: ${lance.scorerName}${lance.scorerConfirmed ? ' · confirmado' : ' · aguardando confirmação'}` : 'Sem autoria marcada'}</Text>
        <Text style={{ color: colors.text }}>{lance.assistName ? `Assistência: ${lance.assistName}${lance.assistConfirmed ? ' · confirmada' : ' · aguardando confirmação'}` : 'Sem assistência marcada'}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>As marcações deste vídeo não alteram o placar nem as estatísticas oficiais.</Text>
        {(['scorer', 'assist'] as const).map(role => lance[role === 'scorer' ? 'scorerId' : 'assistId'] === me && me ? <View key={role} style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.text }}>Você foi marcado: {role === 'scorer' ? 'autoria' : 'assistência'}.</Text>
          {!lance[role === 'scorer' ? 'scorerConfirmed' : 'assistConfirmed'] && <Button small label="Confirmar minha marcação" disabled={busy} onPress={() => void run('tag', { role, accept: true })} />}
          <Button small variant="outline" label="Remover minha marcação" disabled={busy} onPress={() => void run('tag', { role, accept: false })} />
        </View> : null)}
      </Card>
      {lance.canManage && !lance.publishedAt && <>
        {lance.status === 'uploading' && <Button label="Concluir envio recebido" disabled={busy} onPress={() => void run('finish_upload')} />}
        <Editor key={`${lance.id}:${lance.revision}`} lance={lance} participants={feed.data.participants} run={run} busy={busy} />
        {lance.status === 'ready' && <Publication key={`pub:${lance.revision}`} run={run} busy={busy} />}
      </>}
      {lance.canManage && !!lance.publishedAt && <Button variant="outline" label="Retirar publicação para editar" disabled={busy} onPress={() => void run('unpublish')} />}
      {!!lance.publishedAt && <>
        <Text style={{ color: colors.textMuted }}>{lance.likes} curtidas · {lance.commentCount} comentários</Text>
        {!!me && <Button small variant="outline" label={lance.liked ? 'Descurtir lance' : 'Curtir lance'} disabled={busy} onPress={() => void run('like', { liked: !lance.liked })} />}
        {lance.visibility === 'public' && !lance.hidden ? <>
          <Button label="Compartilhar lance" onPress={() => void share()} />
          <Text selectable style={{ color: colors.textMuted, fontSize: 12 }}>{lancePublicLink(lance.id)}</Text>
        </> : <Text style={{ color: colors.textMuted }}>Lance restrito ao time: compartilhamento externo desativado.</Text>}
        <Text style={{ color: colors.text, fontWeight: '800' }}>Comentários</Text>
        {feed.data.comments.map(c => <Card key={c.id}><Text style={{ color: colors.text, fontWeight: '700' }}>{c.name}</Text><Text style={{ color: colors.text }}>{c.body}</Text></Card>)}
        {!feed.data.comments.length && <Text style={{ color: colors.textMuted }}>Seja o primeiro a comentar.</Text>}
        {!!me && <><TextField label="Seu comentário" value={comment} onChangeText={v => { setComment(v); commentNonce.current = createUuid(); }} maxLength={500} multiline /><Button small label="Comentar" disabled={busy || !comment.trim()} onPress={() => { void run('comment', { body: comment.trim(), nonce: commentNonce.current }).then(ok => { if (ok) { setComment(''); commentNonce.current = createUuid(); } }); }} />
          <Button small variant="ghost" label="Denunciar lance" onPress={() => setReporting(v => !v)} />
          {reporting && <Card style={{ gap: spacing.sm }}><AdaptiveSelect label="Motivo da denúncia" value={reason} onChange={setReason} options={[{ value: 'unsafe_content', label: 'Conteúdo impróprio / imagem sem autorização' }, { value: 'harassment', label: 'Assédio ou ofensa' }, { value: 'spam', label: 'Spam' }, { value: 'other', label: 'Outro' }]} /><TextField label="Detalhes para a moderação" value={details} onChangeText={setDetails} maxLength={1000} multiline /><Button label="Enviar denúncia" disabled={busy} onPress={() => void run('report', { reason, details }).then(ok => { if (ok) setReporting(false); })} /></Card>}
        </>}
      </>}
      {lance.canManage && <>
        <Button small variant="ghost" label="Excluir lance" disabled={busy} onPress={() => setDeleting(true)} />
        {deleting && <Card style={{ gap: spacing.sm }}><Text style={{ color: colors.text }}>Retirar definitivamente este lance do app? Links deixarão de dar acesso; cópias já compartilhadas não podem ser recolhidas.</Text><Button label="Confirmar exclusão do lance" variant="danger" disabled={busy} onPress={() => void run('delete')} /><Button label="Cancelar exclusão" variant="ghost" onPress={() => setDeleting(false)} /></Card>}
      </>}
      {lance.canModerate && <Card style={{ gap: spacing.sm }}><TextField label="Motivo da moderação" value={details} onChangeText={setDetails} maxLength={1000} /><Button variant="danger" label={lance.hidden ? 'Restaurar lance moderado' : 'Ocultar lance pela moderação'} disabled={busy || details.trim().length < 5} onPress={() => void run('moderate', { hidden: !lance.hidden, reason: details })} /></Card>}
    </>}
  </Screen>;
}

function Editor({ lance, participants, run, busy }: { lance: Lance; participants: LanceSnapshot['participants']; run: Run; busy: boolean }) {
  const [title, setTitle] = useState(lance.title), [caption, setCaption] = useState(lance.caption), [kind, setKind] = useState<LanceKind>(lance.kind);
  const [scorerId, setScorer] = useState(lance.scorerId || ''), [assistId, setAssist] = useState(lance.assistId || '');
  const sport = getSport(lance.sportId), scoring = kind === 'goal' || kind === 'point';
  const options = [{ value: '', label: 'Não marcar' }, ...participants.map(p => ({ value: p.id, label: p.name }))];
  return <Card style={{ gap: spacing.sm }}>
    <Text style={{ color: colors.text, fontWeight: '800' }}>Identificar a jogada</Text>
    <TextField label="Título" value={title} onChangeText={setTitle} maxLength={100} />
    <TextField label="Legenda" value={caption} onChangeText={setCaption} maxLength={1200} multiline />
    <AdaptiveSelect label="Tipo de lance" value={kind} onChange={v => { setKind(v as LanceKind); setScorer(''); setAssist(''); }} options={[{ value: sport.scoreSingular === 'gol' ? 'goal' : 'point', label: sport.scoreSingular === 'gol' ? 'Gol' : 'Ponto / cesta' }, { value: 'save', label: 'Defesa' }, { value: 'play', label: 'Outra jogada' }]} />
    {scoring && <><AdaptiveSelect label={kind === 'goal' ? 'Quem fez o gol' : 'Quem marcou o ponto'} value={scorerId} onChange={setScorer} options={options.filter(p => !p.value || p.value !== assistId)} /><AdaptiveSelect label="Quem deu a assistência" value={assistId} onChange={setAssist} options={options.filter(p => !p.value || p.value !== scorerId)} /></>}
    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Apenas participantes confirmados podem ser marcados. Marcações de outras pessoas ficam pendentes até elas confirmarem.</Text>
    <Button label="Salvar identificação" disabled={busy || title.trim().length < 3} onPress={() => void run('edit', { title: title.trim(), caption, kind, scorerId: scoring ? scorerId : '', assistId: scoring ? assistId : '' })} />
  </Card>;
}
function Publication({ run, busy }: { run: Run; busy: boolean }) {
  const [visibility, setVisibility] = useState('team'), [rights, setRights] = useState(false);
  return <Card style={{ gap: spacing.sm }}>
    <Text style={{ color: colors.text, fontWeight: '800' }}>Publicar na rede social</Text>
    <AdaptiveSelect label="Quem pode assistir" value={visibility} onChange={setVisibility} options={[{ value: 'team', label: 'Somente meu time' }, { value: 'public', label: 'Todos, inclusive por link' }]} />
    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Para publicar para todos, as marcações precisam estar confirmadas. Você pode publicar primeiro só para o time e pedir a confirmação.</Text>
    <Button small variant={rights ? 'primary' : 'outline'} label={rights ? 'Autorização de publicação confirmada' : 'Confirmar que posso publicar este vídeo'} onPress={() => setRights(v => !v)} />
    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Confirmo que tenho os direitos e as autorizações das pessoas filmadas para a visibilidade escolhida. Sem imagens de terceiros sem autorização.</Text>
    <Button label="Publicar lance" disabled={!rights || busy} onPress={() => void run('publish', { visibility, rightsConfirmed: rights })} />
  </Card>;
}
