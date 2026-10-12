import { useSyncExternalStore } from 'react';
import { getAdsState, subscribeAdsState } from '@/lib/ads';

export function useAdsState() {
  return useSyncExternalStore(subscribeAdsState, getAdsState, getAdsState);
}
