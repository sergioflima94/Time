import { identifiers, type DeviceContact } from './friendDiscoveryRules';
export async function readDeviceContacts(): Promise<DeviceContact[]> {
  const api = typeof navigator !== 'undefined' ? (navigator as unknown as { contacts?: { select(properties: string[], options: { multiple: boolean }): Promise<{ name?: string[]; tel?: string[]; email?: string[] }[]> } }).contacts : undefined;
  if (!api || !window.isSecureContext) throw new Error('Este navegador não permite acessar a agenda. Use o aplicativo Android ou busque pelo telefone/e-mail.');
  const selected = await api.select(['name', 'tel', 'email'], { multiple: true });
  return selected.slice(0, 500).map((c, i) => ({ id: String(i), name: c.name?.[0] || 'Contato', identifiers: identifiers(c.tel || [], c.email || []) })).filter(c => c.identifiers.length);
}
