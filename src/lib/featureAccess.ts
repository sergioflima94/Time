import type { PlatformRole } from '@/types/platform';

/** Isenção comercial não é uma assinatura nem permissão sobre outra organização. */
export function hasOwnerBenefits(role: PlatformRole | null): boolean {
  return role === 'owner';
}
