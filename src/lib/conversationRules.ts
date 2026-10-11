import type { TeamChatConfig } from '@/types/conversations';

export function validateWhatsAppGroup(value: string): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'chat.whatsapp.com' || url.port || url.username || url.password
      || !/^\/[A-Za-z0-9_-]{16,64}\/?$/.test(url.pathname) || url.search || url.hash) throw new Error();
    return url.href;
  } catch { throw new Error('Use o link HTTPS de convite do grupo em chat.whatsapp.com, sem parâmetros.'); }
}
export function validateTeamChat(value: TeamChatConfig): TeamChatConfig {
  if (!['internal','whatsapp','both'].includes(value.mode) || typeof value.adminOnly !== 'boolean') throw new Error('Configuração de conversa inválida.');
  const whatsappUrl = validateWhatsAppGroup(value.whatsappUrl ?? '');
  if (value.mode !== 'internal' && !whatsappUrl) throw new Error('Cadastre o convite do grupo para usar WhatsApp.');
  return { ...value, whatsappUrl };
}
export function cleanChatText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 2000) throw new Error('Escreva uma mensagem de 1 a 2.000 caracteres.');
  return value.trim();
}
export const conversationUuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const n = Math.floor(Math.random()*16); return (c === 'x' ? n : (n & 3) | 8).toString(16);
});
