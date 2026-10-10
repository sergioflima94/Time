import type { CommercialPlan } from './pro';

export type PlatformRole = 'owner' | 'admin' | 'support';
export interface PlatformSettings {
  discoveryEnabled: boolean;
  referralsEnabled: boolean;
  sponsoredEnabled: boolean;
  bookingCommissionPercent: number;
  whatsappMonthlyAllowance: number;
  trialDays: number;
}
export interface PlatformSnapshot {
  role: PlatformRole;
  configuration: { revision: number; settings: PlatformSettings };
  metrics: { players: number; teams: number; establishments: number; upcomingGames: number; openReports: number; activeSubscriptions: number };
  players: Array<{ id: string; name: string; nickname: string | null; authUserId: string | null; createdAt: string; suspended: boolean }>;
  teams: Array<{ id: string; name: string; sportId: string; createdAt: string }>;
  establishments: Array<{ id: string; name: string; ownerPlayerId: string; fieldCount: number }>;
  plans: CommercialPlan[];
  reports: Array<{ id: string; targetId: string; targetType: string; reason: string; details: string | null; status: string; createdAt: string }>;
  admins: Array<{ authUserId: string; name: string; role: PlatformRole; active: boolean }>;
  audit: Array<{ id: string; action: string; targetId: string | null; reason: string; createdAt: string }>;
}
export type PlatformAction = 'settings' | 'plan' | 'report' | 'account' | 'admin' | 'sport';

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  discoveryEnabled: true, referralsEnabled: true, sponsoredEnabled: false,
  bookingCommissionPercent: 0, whatsappMonthlyAllowance: 100, trialDays: 14,
};

export function validatePlatformSettings(value: PlatformSettings): boolean {
  return typeof value.discoveryEnabled === 'boolean' && typeof value.referralsEnabled === 'boolean' && typeof value.sponsoredEnabled === 'boolean'
    && Number.isFinite(value.bookingCommissionPercent) && value.bookingCommissionPercent >= 0 && value.bookingCommissionPercent <= 20
    && Number.isInteger(value.whatsappMonthlyAllowance) && value.whatsappMonthlyAllowance >= 0 && value.whatsappMonthlyAllowance <= 10000
    && Number.isInteger(value.trialDays) && value.trialDays >= 1 && value.trialDays <= 30;
}
