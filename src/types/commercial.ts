import type { CommercialAudience } from './pro';
import type { PlatformRole } from './platform';

export type AgreementKind = 'license' | 'discount' | 'price';
export interface CommercialAgreement {
  id: string; audience: CommercialAudience; targetId: string; planId: string;
  kind: AgreementKind; status: 'granted' | 'offered' | 'accepted' | 'declined' | 'revoked';
  listMonthlyPrice: number; agreedMonthlyPrice: number; discountPercent: number | null;
  durationMonths: number | null; expiresAt: string | null; note: string;
  revision: number; createdAt: string; respondedAt: string | null;
}
export interface LicenseAccess {
  /** Período comercial liquidado pelo provedor; não é uma licença gratuita. */
  paid?: boolean;
  id: string; audience: CommercialAudience; targetId: string; planId: string; expiresAt: string | null;
}
export interface CommercialAccessSnapshot {
  role: PlatformRole | null; licenses: LicenseAccess[]; agreements: CommercialAgreement[];
}
export interface AgreementInput {
  requestId: string; expectedMonthlyPrice: number;
  audience: CommercialAudience; targetId: string; planId: string; kind: AgreementKind;
  agreedMonthlyPrice: number | null; discountPercent: number | null;
  durationMonths: number | null; expiresAt: string | null; note: string;
}
