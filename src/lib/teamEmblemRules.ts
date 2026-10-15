const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const TEAM_EMBLEM_KEY = new RegExp(`^${UUID}/${UUID}/${UUID}\\.(png|jpg|webp)$`, 'i');
export const TEAM_EMBLEM_LIMIT = 5 * 1024 * 1024;
export function teamEmblemUrl(key?: string | null): string | null {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return key && TEAM_EMBLEM_KEY.test(key) && base?.startsWith('https://')
    ? `${base.replace(/\/$/, '')}/storage/v1/object/public/team-logos/${key}` : null;
}
export function validateTeamEmblem(bytes: ArrayBuffer, mime: string): 'png' | 'jpg' | 'webp' {
  if (!bytes.byteLength || bytes.byteLength > TEAM_EMBLEM_LIMIT) throw new Error('Use uma imagem de até 5 MB.');
  const b = new Uint8Array(bytes), ascii = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
  if (mime === 'image/png' && b[0] === 137 && ascii(1, 4) === 'PNG' && b[4] === 13 && b[5] === 10 && b[6] === 26 && b[7] === 10) return 'png';
  if (mime === 'image/jpeg' && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpg';
  if (mime === 'image/webp' && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  throw new Error('Use uma imagem JPG, PNG ou WebP válida.');
}
