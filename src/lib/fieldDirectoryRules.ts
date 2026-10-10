import { distanceKm } from '@/lib/geo';
import type { GeoPoint } from '@/types';

export interface DirectoryInput {
  fieldId: string | null; name: string; address: string; sportId: string;
  phone: string; whatsapp: boolean; latitude: number; longitude: number;
  online: boolean; active: boolean;
}
export interface DirectoryRow extends DirectoryInput {
  id: string; registered: boolean; distanceKm: number | null; updatedAt: string;
}
export interface ManagedEntry extends DirectoryInput { id: string; revision: number; updatedAt: string }
export interface LinkableField { id: string; name: string; address: string | null; sportId: string; latitude: number | null; longitude: number | null; establishmentName: string }
export interface DirectoryManagement { entries: ManagedEntry[]; fields: LinkableField[] }
export interface DirectorySearch { origin: GeoPoint | null; radius: number; query: string; sportId: string | null; offset?: number }
export const emptyDirectoryManagement = (): DirectoryManagement => ({ entries: [], fields: [] });
export function validateDirectoryInput(d: DirectoryInput) {
  if (d.name.trim().length < 3 || d.name.trim().length > 120 || d.address.trim().length < 5 || d.address.trim().length > 240
    || !/^\d{10,15}$/.test(d.phone.replace(/\D/g, '')) || !Number.isFinite(d.latitude) || Math.abs(d.latitude)>90
    || !Number.isFinite(d.longitude) || Math.abs(d.longitude)>180 || !d.sportId) throw new Error('Informe nome, endereço, telefone com DDD, esporte e coordenadas válidos.');
  if (d.online && !d.fieldId) throw new Error('Contato direto não permite agendamento online.');
}
export function phoneLink(phone: string, whatsapp = false) {
  const digits = phone.replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(digits)) throw new Error('Telefone inválido.');
  const international = digits.length===10 || digits.length===11 ? `55${digits}` : digits;
  return whatsapp ? `https://wa.me/${international}` : `tel:+${international}`;
}
export function routeLink(row: Pick<DirectoryRow,'latitude'|'longitude'>) {
  if (!Number.isFinite(row.latitude) || Math.abs(row.latitude)>90 || !Number.isFinite(row.longitude) || Math.abs(row.longitude)>180) throw new Error('Coordenadas inválidas.');
  return `https://www.google.com/maps/dir/?api=1&destination=${row.latitude},${row.longitude}`;
}
export function rankDirectory(entries: DirectoryRow[], search: DirectorySearch) {
  if (!Number.isFinite(search.radius)||search.radius<1||search.radius>100||search.query.length>120
    || (search.origin&&(!Number.isFinite(search.origin.latitude)||Math.abs(search.origin.latitude)>90||!Number.isFinite(search.origin.longitude)||Math.abs(search.origin.longitude)>180))) throw new Error('Busca inválida.');
  const q=search.query.trim().toLocaleLowerCase();
  return entries.filter(e=>e.active&&(!search.sportId||e.sportId===search.sportId)&&`${e.name} ${e.address}`.toLocaleLowerCase().includes(q))
    .map(e=>({...e,distanceKm:search.origin?distanceKm(search.origin,e):null}))
    .filter(e=>e.distanceKm===null||e.distanceKm<=search.radius)
    .sort((a,b)=>Number(b.registered)-Number(a.registered)||(a.distanceKm??Infinity)-(b.distanceKm??Infinity)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
