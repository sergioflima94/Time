export async function enablePushNotifications(): Promise<{ enabled: boolean; message: string; token: string | null }> {
  return { enabled: false, message: 'Push nativo exige Android/iOS. No navegador, os avisos continuam dentro do app.', token: null };
}
