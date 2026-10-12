/** Physical services never enter the digital-subscription payment pipeline. */
export type BillingPurpose = 'premium' | 'team_software' | 'venue_software' | 'booking' | 'in_person_class' | 'food' | 'physical_product' | 'venue_invoice';
export type BillingPlatform = 'android' | 'ios' | 'web';
export function billingChannel(purpose: BillingPurpose, platform: BillingPlatform) {
  if (['booking', 'in_person_class', 'food', 'physical_product', 'venue_invoice'].includes(purpose)) return 'venue_gateway' as const;
  if (platform === 'web') return 'platform_web' as const;
  // B2B software is not automatically exempt from store rules. No external CTA.
  if (purpose !== 'premium') return 'existing_access_only' as const;
  return platform === 'ios' ? 'app_store' as const : 'play_store' as const;
}
export function subscriptionManagementUrl(source: string | undefined) {
  if (source === 'app_store') return 'https://apps.apple.com/account/subscriptions';
  if (source === 'play_store') return 'https://play.google.com/store/account/subscriptions';
  return null;
}
export function nativeProductAllowed(id: string, allowed: string[]) {
  // Google SDK can append :basePlan; the canonical REST ID may be the SKU.
  return allowed.includes(id) || allowed.includes(id.split(':')[0]);
}
