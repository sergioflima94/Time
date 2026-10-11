// SDK 57: procedural functions belong to /legacy, not the new top-level API.
import * as Contacts from 'expo-contacts/legacy';
import { identifiers, type DeviceContact } from './friendDiscoveryRules';
export async function readDeviceContacts(): Promise<DeviceContact[]> {
  const permission = await Contacts.requestPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Acesso aos contatos não permitido. Você pode buscar manualmente ou liberar nas configurações do celular.');
  const result: DeviceContact[] = [];
  for (let offset = 0; offset < 500; offset += 50) {
    const page = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails], pageSize: 50, pageOffset: offset, sort: Contacts.SortTypes.FirstName });
    for (const c of page.data) {
      const keys = identifiers(c.phoneNumbers?.map(p => p.number || '') || [], c.emails?.map(e => e.email || '') || []);
      if (keys.length) result.push({ id: c.id!, name: c.name || 'Contato', identifiers: keys });
    }
    if (!page.hasNextPage) break;
  }
  return result;
}
