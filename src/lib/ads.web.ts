// AdMob (react-native-google-mobile-ads) não tem suporte a web — este stub
// evita que o módulo nativo seja incluído no bundle web. Ver ads.ts (nativo).
import { createAdConsentController } from './adConsentController';

export const isAdsSupported = false;

export const adsMode = 'off';
const controller = createAdConsentController(null);
export const initializeAds = controller.initialize;
export const getAdsState = controller.getSnapshot;
export const subscribeAdsState = controller.subscribe;
export const showAdsPrivacyOptions = controller.showPrivacyOptions;
export const refreshAdsPrivacyOptions = controller.refreshPrivacyOptions;

export function getBannerAdUnitId(): string {
  return '';
}

export function BannerAd(): null {
  return null;
}

export const BannerAdSize = {
  BANNER: 'BANNER',
  FULL_BANNER: 'FULL_BANNER',
  INLINE_ADAPTIVE_BANNER: 'INLINE_ADAPTIVE_BANNER',
} as const;
