export interface ContactIdentifier { kind: 'phone' | 'email'; value: string }
export interface DeviceContact { id: string; name: string; identifiers: ContactIdentifier[] }
export function phoneKey(value: string): string | null {
  let n = value.replace(/\D/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  if (!value.trim().startsWith('+') && [10, 11].includes(n.length)) n = '55' + n;
  return n.length >= 8 && n.length <= 15 ? n : null;
}
export function identifiers(phones: string[], emails: string[]): ContactIdentifier[] {
  const list: ContactIdentifier[] = [];
  for (const phone of phones) { const value = phoneKey(phone); if (value) list.push({ kind: 'phone', value: '+' + value }); }
  for (const email of emails) { const value = email.trim().toLowerCase(); if (value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) list.push({ kind: 'email', value }); }
  return list.filter((v, i) => list.findIndex(x => x.kind === v.kind && x.value === v.value) === i);
}
export const validFriendToken = (token: string) => /^[a-f0-9]{64}$/.test(token);
export const friendInviteUrl = (token: string) => {
  if (!validFriendToken(token)) throw new Error('Convite inválido.');
  return `https://app.marcoujogou.com.br/amigo/${token}`;
};
