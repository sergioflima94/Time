import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function enablePushNotifications(): Promise<{ enabled: boolean; message: string; token: string | null }> {
  const current = await Notifications.getPermissionsAsync();
  const result = current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
  if (result.status !== 'granted') return { enabled: false, message: 'Permissão de notificações não concedida.', token: null };
  let token: string | null = null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (projectId) {
    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch {
      // Expo Go no Android não oferece push remoto; a notificação local ainda funciona.
    }
  }
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Notificações ativadas ⚽', body: 'Você receberá confirmações, mensagens e mudanças de horário.', data: { url: '/central' } },
    trigger: null,
  });
  return { enabled: true, message: token ? 'Notificações e token remoto ativados neste aparelho.' : 'Notificações locais ativadas; o token remoto exige um development build.', token };
}
