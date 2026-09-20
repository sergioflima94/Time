// Config dinâmica (em vez de app.json) para poder ler os IDs do AdMob do .env
// em tempo de build nativo. Veja .env.example para as variáveis disponíveis.

// IDs de teste oficiais do Google — usados como fallback caso o .env não
// esteja preenchido, para o app já funcionar com anúncios de teste out-of-the-box.
const TEST_ADMOB_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_ADMOB_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

module.exports = {
  expo: {
    name: 'Pelada',
    slug: 'pelada-app',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'pelada',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.pelada.app',
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#0F1B12',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      package: 'com.pelada.app',
    },
    web: {
      favicon: './assets/favicon.png',
      bundler: 'metro',
      output: 'static',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#0F1B12',
          image: './assets/icon.png',
          imageWidth: 160,
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'O app usa suas fotos para você escolher a foto do seu perfil de jogador.',
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'O app usa sua localização pra achar jogadores livres perto de você (só se você ativar essa opção no Perfil).',
        },
      ],
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || TEST_ADMOB_ANDROID_APP_ID,
          iosAppId: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || TEST_ADMOB_IOS_APP_ID,
          userTrackingUsageDescription:
            'Usamos seus dados para mostrar anúncios mais relevantes na pelada.',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
  },
};
