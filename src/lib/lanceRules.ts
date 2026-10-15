export const LANCE_MAX_BYTES = 60 * 1024 * 1024;
export const LANCE_MAX_SECONDS = 90;
export function validateLanceVideo(bytes: number, seconds: number, mime: string) {
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > LANCE_MAX_BYTES) throw new Error('Use um vídeo de até 60 MB.');
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > LANCE_MAX_SECONDS) throw new Error('Use um lance de até 90 segundos.');
  if (mime !== 'video/mp4') throw new Error('Escolha um vídeo MP4. Exporte seu vídeo nesse formato se necessário.');
}
export function lancePublicLink(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Lance inválido.');
  return `https://app.marcoujogou.com.br/lances/${id}`;
}
