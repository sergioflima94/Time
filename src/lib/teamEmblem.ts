import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { isMockMode, supabase, sessionBoundClient } from './supabase';
import { pickPhotoAsset } from './photo';
import { createUuid } from './uuid';
import { teamEmblemUrl, validateTeamEmblem } from './teamEmblemRules';
import { applyTeamCache } from './supabaseSync';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';

function authorize(teamId: string, actor: string | null) {
  if (actor !== useAuthStore.getState().authUserId) throw new Error('A conta mudou. Abra o time novamente.');
  const s = useAppStore.getState();
  if (!s.isAdmin(s.currentPlayerId, teamId)) throw new Error('Somente administradores alteram o emblema.');
}
async function writer(teamId: string, actor: string | null) {
  authorize(teamId, actor);
  if (!supabase) throw new Error('Conecte o servidor para salvar o emblema.');
  const { data, error } = await supabase.auth.getSession(); authorize(teamId, actor);
  if (error || !actor || data.session?.user.id !== actor) throw new Error('Entre novamente para alterar o emblema.');
  return sessionBoundClient(data.session.access_token);
}
async function saveBytes(teamId: string, bytes: ArrayBuffer, mime: string, actor: string | null) {
  const extension = validateTeamEmblem(bytes, mime), client = await writer(teamId, actor);
  const key = `${teamId}/${actor}/${createUuid()}.${extension}`;
  const { error } = await client.storage.from('team-logos').upload(key, bytes, { contentType: mime, upsert: false });
  authorize(teamId, actor);
  if (error) throw new Error('Não foi possível enviar. Confira sua conexão e a ativação do recurso.');
  await commit(teamId, key, actor, client);
}
async function commit(teamId: string, key: string | null, actor: string | null, client: Awaited<ReturnType<typeof writer>>) {
  const { error } = await client.rpc('set_team_emblem', { p_team: teamId, p_key: key });
  authorize(teamId, actor);
  if (error) throw new Error('O emblema não foi salvo. Atualize o time e tente novamente.');
  applyTeamCache(teamId, { logoKey: key, logoUrl: teamEmblemUrl(key) });
}
export async function chooseTeamEmblem(teamId: string) {
  const actor = useAuthStore.getState().authUserId; authorize(teamId, actor);
  const asset = await pickPhotoAsset(); authorize(teamId, actor);
  if (!asset) return false;
  if (isMockMode) { applyTeamCache(teamId, { logoUrl: asset.uri }); return true; }
  if (asset.fileSize && asset.fileSize > 5242880) throw new Error('Use uma imagem de até 5 MB.');
  const bytes = Platform.OS === 'web' ? await asset.file?.arrayBuffer() : await new File(asset.uri).arrayBuffer();
  if (!bytes) throw new Error('Selecione a imagem novamente.');
  await saveBytes(teamId, bytes, asset.mimeType || asset.file?.type || 'image/jpeg', actor); return true;
}
export async function saveGeneratedTeamEmblem(teamId: string, dataUrl: string) {
  const actor = useAuthStore.getState().authUserId; authorize(teamId, actor);
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 7_000_000) throw new Error('O gerador não retornou uma imagem PNG válida.');
  if (isMockMode) { applyTeamCache(teamId, { logoUrl: dataUrl }); return; }
  const data = atob(dataUrl.split(',')[1]), bytes = new Uint8Array(data.length);
  for (let i=0; i<data.length; i++) bytes[i] = data.charCodeAt(i);
  await saveBytes(teamId, bytes.buffer, 'image/png', actor);
}
export async function removeTeamEmblem(teamId: string) {
  const actor = useAuthStore.getState().authUserId; authorize(teamId, actor);
  if (isMockMode) { applyTeamCache(teamId, { logoKey: null, logoUrl: null }); return; }
  await commit(teamId, null, actor, await writer(teamId, actor));
}
