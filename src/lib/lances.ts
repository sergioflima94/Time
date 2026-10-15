import { Platform, Share } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { supabase, sessionBoundClient } from './supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { createUuid } from './uuid';
import { lancePublicLink, validateLanceVideo } from './lanceRules';
import type { Lance, LanceQuery, LanceSnapshot } from '@/types/lances';
import type { Json } from '@/types/supabase.generated';

function same(actor: string | null) {
  if (actor !== useAuthStore.getState().authUserId) throw new Error('A conta mudou. Abra o lance novamente.');
}
function fail(error: { message: string }) {
  throw new Error(error.message.includes('LANCES:') ? error.message.split('LANCES:')[1] : 'Lances indisponíveis. Confira sua conexão ou a ativação deste recurso.');
}
async function writer() {
  if (!supabase) throw new Error('Envio de lances exige o servidor configurado. Nenhum vídeo será simulado.');
  const actor = useAuthStore.getState().authUserId;
  const { data } = await supabase.auth.getSession();
  same(actor);
  if (!actor || data.session?.user.id !== actor) throw new Error('Entre na sua conta para continuar.');
  return { actor, client: sessionBoundClient(data.session.access_token) };
}
export async function lanceSnapshot(query: LanceQuery = {}): Promise<LanceSnapshot> {
  if (!supabase) return { items: [], participants: [], comments: [], me: null };
  const actor = useAuthStore.getState().authUserId;
  const { data, error } = await supabase.rpc('lance_snapshot', {
    p_game: query.gameId!, p_team: query.teamId!, p_id: query.id!, p_before: query.before!, p_before_id: query.beforeId!,
  });
  same(actor); if (error) fail(error);
  const snapshot = data as unknown as LanceSnapshot;
  if (!Array.isArray(snapshot?.items) || !Array.isArray(snapshot?.participants) || !Array.isArray(snapshot?.comments)) throw new Error('Não foi possível carregar os lances.');
  return snapshot;
}
export async function lanceAction(action: string, data: Record<string, unknown>) {
  const { client, actor } = await writer(); same(actor);
  const { data: result, error } = await client.rpc('lance_action', { p_action: action, p_data: data as Json });
  same(actor); if (error) fail(error); return result as { id: string; mediaKey?: string };
}
/** Selection is an explicit user gesture; no background capture or camera access. */
export async function chooseLanceVideo() {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsEditing: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  let bytes: ArrayBuffer;
  if (Platform.OS === 'web') {
    if (!asset.file) throw new Error('Selecione novamente o vídeo no navegador.');
    if (asset.file.size > 60 * 1024 * 1024) throw new Error('Use um vídeo de até 60 MB.');
    bytes = await asset.file.arrayBuffer();
  } else {
    const file = new File(asset.uri);
    if (file.size > 60 * 1024 * 1024) throw new Error('Use um vídeo de até 60 MB.');
    bytes = await file.arrayBuffer();
  }
  const mime = asset.mimeType || asset.file?.type || (/\.mp4$/i.test(asset.fileName || '') ? 'video/mp4' : '');
  let seconds = (asset.duration ?? 0) / 1000;
  // Browser system pickers may omit duration; read local metadata without uploading.
  if (Platform.OS === 'web' && !seconds && asset.file) {
    seconds = await new Promise<number>((resolve, reject) => {
      const video = document.createElement('video'), url = URL.createObjectURL(asset.file!);
      const timer = setTimeout(() => finish(new Error('Não foi possível ler a duração do vídeo.')), 10000);
      function finish(error?: Error) { const duration = video.duration; clearTimeout(timer); URL.revokeObjectURL(url); video.removeAttribute('src'); error ? reject(error) : resolve(duration); }
      video.preload = 'metadata'; video.onloadedmetadata = () => finish(); video.onerror = () => finish(new Error('Vídeo inválido ou não suportado.')); video.src = url;
    });
  }
  validateLanceVideo(bytes.byteLength, seconds, mime);
  return { bytes, seconds, name: asset.fileName || 'Lance.mp4' };
}
export async function uploadLance(gameId: string, title: string, video: NonNullable<Awaited<ReturnType<typeof chooseLanceVideo>>>) {
  const { client, actor } = await writer();
  const { data, error } = await client.rpc('lance_action', { p_action: 'create', p_data: {
    gameId, title, durationSeconds: video.seconds, nonce: createUuid(),
  } });
  same(actor); if (error) fail(error);
  const draft = data as { id: string; mediaKey: string };
  const { error: uploadError } = await client.storage.from('lances').upload(draft.mediaKey, video.bytes, { contentType: 'video/mp4', upsert: false });
  same(actor);
  if (uploadError) throw new Error('O vídeo não foi confirmado. Atualize os lances: o rascunho permite conferir ou excluir o envio incompleto.');
  const result = await client.rpc('lance_action', { p_action: 'finish_upload', p_data: { id: draft.id, revision: 1 } });
  same(actor); if (result.error) fail(result.error);
  return draft.id;
}
export async function lanceVideoUrl(key: string) {
  if (!supabase) throw new Error('Vídeo indisponível.');
  const actor = useAuthStore.getState().authUserId;
  const { data, error } = await supabase.storage.from('lances').createSignedUrl(key, 120);
  same(actor); if (error || !data?.signedUrl) throw new Error('O acesso ao vídeo expirou ou foi removido. Atualize o lance.');
  return data.signedUrl;
}
/** Never expose a temporary storage token or a private draft in a shared URL. */
export async function shareLance(lance: Lance) {
  if (!lance.publishedAt || lance.visibility !== 'public' || lance.hidden) throw new Error('Compartilhamento externo exige publicação para todos. Lances do time permanecem privados.');
  const url = lancePublicLink(lance.id), title = `${lance.title} · ${lance.teamName}`;
  if (Platform.OS === 'web') {
    if (navigator.share) { try { await navigator.share({ title, text: 'Meu lance no MarcouJogou', url }); } catch (e) { if ((e as Error).name !== 'AbortError') throw e; } return; }
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); return 'Link copiado.'; }
    return url;
  }
  await Share.share({ title, message: `${title}\n${url}` });
}
