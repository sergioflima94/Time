import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { supabase, isMockMode } from './supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { usePlatformAccessStore } from '@/store/usePlatformAccessStore';
import { applyFriendCache } from './supabaseSync';
import { useAppStore } from '@/store/useAppStore';
import { nativeProductAllowed } from './billingPolicy';

const sdkKey = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
export const nativeBillingConfigured = !isMockMode && ['ios', 'android'].includes(Platform.OS)
  && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient
  && !!sdkKey && sdkKey.startsWith(Platform.OS === 'ios' ? 'appl_' : 'goog_');
export const nativeStoreLabel = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
let configured = false;
let identity: string | null = null;
let chain: Promise<unknown> = Promise.resolve();

function actor() {
  const auth = useAuthStore.getState();
  if (!auth.authReady || !auth.isLoggedIn || !auth.authUserId) throw new Error('Entre na sua conta antes de consultar a assinatura.');
  return auth.authUserId;
}
function checkActor(id: string) { if (actor() !== id) throw new Error('A conta mudou. Consulte a assinatura na conta que iniciou a operação.'); }
function exclusive<T>(operation: (id: string) => Promise<T>) {
  const id = actor();
  const task = chain.catch(() => undefined).then(() => { checkActor(id); return operation(id); });
  chain = task;
  return task;
}
async function sdk(id: string) {
  if (!nativeBillingConfigured) throw new Error('Compras pela loja ainda não configuradas neste aplicativo.');
  const purchases = (await import('react-native-purchases')).default;
  checkActor(id);
  if (!configured) { purchases.configure({ apiKey: sdkKey!, appUserID: id }); configured = true; identity = id; }
  else if (identity !== id) { await purchases.logIn(id); identity = id; }
  checkActor(id);
  return purchases;
}
export interface NativeBillingStatus { active: boolean; canPurchase: boolean; source: 'app_store' | 'play_store' | null; expiresAt: string | null; autoRenew: boolean; since: string | null; playerId: string; allowedProducts: string[] }
async function confirm(id: string): Promise<NativeBillingStatus> {
  if (!supabase || isMockMode) throw new Error('Backend indisponível.');
  checkActor(id);
  const { data, error } = await supabase.functions.invoke('sync-native-subscription', { body: {} });
  checkActor(id);
  if (error) {
    let message = 'A loja e o servidor ainda não confirmaram a assinatura. Consulte novamente; não repita a compra.';
    try { message = (await error.context?.json())?.error ?? message; } catch { /* no raw provider errors */ }
    throw new Error(message);
  }
  const status = data as NativeBillingStatus;
  if (!status || typeof status.active !== 'boolean' || typeof status.canPurchase !== 'boolean' || !status.playerId || !Array.isArray(status.allowedProducts)) throw new Error('Confirmação de assinatura inválida.');
  // Only the authenticated server response updates the local cache, never SDK receipts.
  const state = useAppStore.getState();
  applyFriendCache({ players: state.players.map(p => p.id === status.playerId && p.authUserId === id
    ? { ...p, premiumUntil: status.expiresAt, premiumSince: status.since, premiumAutoRenew: status.autoRenew } : p) });
  await usePlatformAccessStore.getState().refresh();
  checkActor(id);
  return status;
}
export function syncNativeSubscription() { return exclusive(id => confirm(id)); }
export function loadNativeOffer() {
  return exclusive(async id => {
    const purchases = await sdk(id);
    const status = await confirm(id);
    const offerings = await purchases.getOfferings();
    checkActor(id);
    const offer = offerings.all[process.env.EXPO_PUBLIC_REVENUECAT_OFFERING ?? 'premium'];
    const monthly = offer?.monthly;
    if (!monthly || monthly.product.subscriptionPeriod !== 'P1M' || !nativeProductAllowed(monthly.product.identifier,status.allowedProducts)) throw new Error('Plano mensal ainda não publicado/homologado na loja.');
    return { package: monthly, status };
  });
}
export function purchaseNativePremium(pack: PurchasesPackage) {
  return exclusive(async id => {
    const purchases = await sdk(id);
    const before = await confirm(id);
    if (!before.canPurchase) throw new Error('Esta conta já tem acesso ativo ou pagamento pendente. Consulte ou gerencie o plano existente.');
    if (pack.product.subscriptionPeriod !== 'P1M' || !nativeProductAllowed(pack.product.identifier,before.allowedProducts)) throw new Error('Produto não homologado para Premium. Nenhuma compra foi iniciada.');
    checkActor(id);
    await purchases.purchasePackage(pack);
    checkActor(id);
    return confirm(id);
  });
}
export function restoreNativePremium() {
  return exclusive(async id => {
    const purchases = await sdk(id);
    await purchases.restorePurchases();
    checkActor(id);
    return confirm(id);
  });
}
