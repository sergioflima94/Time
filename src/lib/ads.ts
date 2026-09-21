import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * react-native-google-mobile-ads é um módulo nativo que não existe dentro do binário
 * do Expo Go — só funciona em dev client / build nativo de verdade (EAS Build). Por
 * isso o require é condicional: em Expo Go nem tentamos carregar o módulo (evita
 * crash no import), e caímos no "house ad" do AdBanner.tsx (mesmo fallback do web).
 */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nativeAds = isExpoGo ? null : require('react-native-google-mobile-ads');

export const isAdsSupported = !isExpoGo;
export const BannerAd = nativeAds?.default?.BannerAd ?? nativeAds?.BannerAd ?? null;
export const BannerAdSize = nativeAds?.BannerAdSize ?? { BANNER: 'BANNER', FULL_BANNER: 'FULL_BANNER' };

export function initializeAds() {
  if (isExpoGo) return;
  nativeAds.default().initialize();
}

export function getBannerAdUnitId(): string {
  if (isExpoGo) return '';
  const envId = Platform.select({
    ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_ID_IOS,
    android: process.env.EXPO_PUBLIC_ADMOB_BANNER_ID_ANDROID,
    default: undefined,
  });
  return envId || nativeAds.TestIds.BANNER;
}
