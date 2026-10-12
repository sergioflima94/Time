import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { createAdConsentController } from './adConsentController';

/**
 * react-native-google-mobile-ads é um módulo nativo que não existe dentro do binário
 * do Expo Go — só funciona em dev client / build nativo de verdade (EAS Build). Por
 * isso o require é condicional: em Expo Go nem tentamos carregar o módulo (evita
 * crash no import). Web e Expo Go não exibem anúncios.
 */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = Constants.expoConfig?.extra?.admob;
export const adsMode = config?.mode === 'off' ? 'off' : __DEV__ ? 'test' : (config?.mode ?? 'test');
const nativeAds = isExpoGo || adsMode === 'off' ? null : require('react-native-google-mobile-ads');

export const isAdsSupported = Boolean(nativeAds);
export const BannerAd = nativeAds?.default?.BannerAd ?? nativeAds?.BannerAd ?? null;
export const BannerAdSize = nativeAds?.BannerAdSize ?? { BANNER: 'BANNER', FULL_BANNER: 'FULL_BANNER', INLINE_ADAPTIVE_BANNER: 'INLINE_ADAPTIVE_BANNER' };

export function getBannerAdUnitId(): string {
  if (!nativeAds) return '';
  if (adsMode !== 'production') return nativeAds.TestIds.BANNER;
  const id = Platform.OS === 'ios' ? config?.iosBannerId : config?.androidBannerId;
  // Never silently turn a broken release into a test-ad release.
  return /^ca-app-pub-\d{16}\/\d{10}$/.test(id ?? '') && !id.includes('3940256099942544') ? id : '';
}

const controller = createAdConsentController(nativeAds && getBannerAdUnitId() ? {
  gatherConsent: () => nativeAds.AdsConsent.gatherConsent(),
  getConsentInfo: () => nativeAds.AdsConsent.getConsentInfo(),
  showPrivacyOptionsForm: () => nativeAds.AdsConsent.showPrivacyOptionsForm(),
  initialize: () => nativeAds.default().initialize(),
} : null);

export const initializeAds = controller.initialize;
export const getAdsState = controller.getSnapshot;
export const subscribeAdsState = controller.subscribe;
export const showAdsPrivacyOptions = controller.showPrivacyOptions;
export const refreshAdsPrivacyOptions = controller.refreshPrivacyOptions;
