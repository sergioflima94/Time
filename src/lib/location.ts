import * as Location from 'expo-location';

import type { GeoPoint } from '@/types';

/** Pede permissão e pega a localização atual (aproximada). null se negou ou falhou. */
export async function getCurrentLocation(): Promise<GeoPoint | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return null;
  }
}
