import type { AgreementInput, CommercialAgreement, LicenseAccess } from '@/types/commercial';
import type { CommercialPlan } from '@/types/pro';
import type { PeladaMembership, Establishment, EstablishmentStaff } from '@/types';

export function licenseIsActive(license: LicenseAccess, now = Date.now()): boolean {
  return license.expiresAt === null || Date.parse(license.expiresAt) > now;
}
export function agreementLabel(a: CommercialAgreement, now = Date.now()): string {
  if (a.status === 'revoked') return 'Revogada';
  if (a.status === 'accepted') return 'Aceita · contratação pendente';
  if (a.status === 'declined') return 'Recusada';
  if (a.expiresAt && Date.parse(a.expiresAt) <= now) return 'Expirada';
  return a.kind === 'license' ? 'Licença ativa' : 'Aguardando resposta';
}
export function agreementPrice(input: AgreementInput, plan: CommercialPlan, now = Date.now()): number {
  if (!plan.active || input.audience !== plan.audience || !input.targetId || input.planId !== plan.id) throw new Error('Plano e destinatário incompatíveis.');
  if (input.expectedMonthlyPrice !== plan.monthlyPrice) throw new Error('Preço do catálogo mudou. Atualize e revise a oferta.');
  if (!['license','discount','price'].includes(input.kind) || input.note.length > 500) throw new Error('Condição inválida.');
  if (input.expiresAt && (!Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= now || Date.parse(input.expiresAt) > now + 3660*86400000)) throw new Error('Prazo deve ser futuro e de até 10 anos.');
  if (input.kind === 'license') return 0;
  if (!input.expiresAt || !Number.isInteger(input.durationMonths) || input.durationMonths! < 1 || input.durationMonths! > 36) throw new Error('Oferta exige prazo e duração de 1 a 36 mensalidades.');
  const percent = input.discountPercent;
  if (input.kind === 'discount' && (percent === null || !Number.isFinite(percent) || percent <= 0 || percent >= 100 || Math.abs(percent*100 - Math.round(percent*100)) > 0.000001)) throw new Error('Desconto entre 0 e 100%; para gratuidade use licença.');
  const price = input.kind === 'discount' ? Math.round(plan.monthlyPrice*100*(1-percent!/100))/100 : input.agreedMonthlyPrice;
  if (price === null || !Number.isFinite(price) || price <= 0 || price > 10000 || Math.abs(price*100 - Math.round(price*100)) > 0.000001) throw new Error('Preço deve ser positivo, em centavos, até R$ 10.000.');
  return price;
}
export interface CommercialContext {
  currentPlayerId: string; memberships: PeladaMembership[]; establishments: Establishment[];
  establishmentStaff: EstablishmentStaff[];
}
export function canManageAgreement(a: Pick<CommercialAgreement,'audience'|'targetId'>, app: CommercialContext): boolean {
  if (a.audience === 'player') return a.targetId === app.currentPlayerId;
  if (a.audience === 'team') return app.memberships.some(m=>m.peladaId===a.targetId && m.playerId===app.currentPlayerId && m.active && m.role==='admin');
  return app.establishments.some(e=>e.id===a.targetId && e.ownerPlayerId===app.currentPlayerId);
}
export function canUseLicense(a: LicenseAccess, app: CommercialContext): boolean {
  return canManageAgreement(a, app) || (a.audience==='team' && app.memberships.some(m=>m.peladaId===a.targetId && m.playerId===app.currentPlayerId && m.active))
    || (a.audience==='establishment' && app.establishmentStaff.some(s=>s.establishmentId===a.targetId && s.playerId===app.currentPlayerId && s.active));
}
