export interface ManagedWhatsAppConfig { enabled: boolean; url: string; key: string; globalKey?: string; webhookSecret: string; instance: string; revision: number }
export type WhatsAppSettings = Partial<Record<'evolution_api' | 'evolution_go', ManagedWhatsAppConfig>>;
export async function loadWhatsAppSettings(db: any): Promise<WhatsAppSettings> {
  const { data, error } = await db.rpc('platform_whatsapp_service', { p_action: 'runtime', p_data: {} });
  if (error || !data || Array.isArray(data) || typeof data !== 'object') throw Error('Configuração WhatsApp indisponível.');
  return data;
}
export function publicWhatsAppUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')
    || /(^|\.)(localhost|local|internal|invalid|test)$/.test(host) || value.length > 500) throw Error('Use um domínio HTTPS público, sem usuário, senha ou parâmetros.');
  return url.href.replace(/\/$/, '');
}
export function publicAddress(ip: string) {
  if (ip.includes(':')) {
    const first = parseInt(ip.split(':')[0],16);
    return first>=0x2000 && first<=0x3fff && !/^2001:(db8|0):|^2002:/i.test(ip);
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(v => !Number.isInteger(v) || v<0 || v>255)) return false;
  const [a,b] = p;
  return a>0 && a<224 && ![10,127].includes(a) && !(a===169&&b===254) && !(a===172&&b>=16&&b<=31) && !(a===192&&(b===168||b===0))
    && !(a===100&&b>=64&&b<=127) && !(a===198&&(b===18||b===19||b===51)) && !(a===203&&b===0);
}
export async function assertPublicWhatsAppUrl(value: string, resolver = (host: string, kind: 'A' | 'AAAA') => Deno.resolveDns(host,kind)) {
  const normalized = publicWhatsAppUrl(value), host = new URL(normalized).hostname;
  const responses = await Promise.all([resolver(host,'A').catch(()=>[]),resolver(host,'AAAA').catch(()=>[])]);
  const addresses = responses.flat();
  if (!addresses.length || addresses.some(ip => !publicAddress(ip))) throw Error('Host não resolve somente para endereços públicos permitidos.');
  return normalized;
}
export async function managedWhatsAppFetch(url: string, options: RequestInit) {
  await assertPublicWhatsAppUrl(new URL(url).origin);
  return fetch(url, { ...options, redirect: 'error' });
}
