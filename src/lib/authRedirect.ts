import * as Linking from 'expo-linking';

/** No APK, o scheme declarado em app.config.js produz pelada://auth/callback. */
export function getAuthRedirectUrl(): string {
  return Linking.createURL('/auth/callback');
}
