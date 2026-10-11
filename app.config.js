// Config dinâmica (em vez de app.json) para poder ler os IDs do AdMob do .env
// em tempo de build nativo. Veja .env.example para as variáveis disponíveis.

// IDs de teste oficiais do Google — usados como fallback caso o .env não
// esteja preenchido, para o app já funcionar com anúncios de teste out-of-the-box.
const TEST_ADMOB_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_ADMOB_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

module.exports = {
  expo: {
    name: 'MarcouJogou',
    slug: 'pelada-app',
    owner: 'sergiolima',
    extra: {
      eas: { projectId: 'c42d02c6-99b9-4ca4-aea3-0f836b1624ea' },
    },
    version: '1.0.4',
    orientation: 'portrait',
    icon: './assets/branding/marcoujogou-icon.png',
    scheme: 'pelada',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.pelada.app',
    },
    android: {
      versionCode: 5,
      adaptiveIcon: {
        backgroundColor: '#F5F2EA',
        foregroundImage: './assets/branding/marcoujogou-adaptive.png',
        // Android tints only the alpha mask for themed icons.
        monochromeImage: './assets/branding/marcoujogou-adaptive.png',
      },
      predictiveBackGestureEnabled: false,
      package: 'com.pelada.app',
    },
    web: {
      favicon: './assets/branding/marcoujogou-icon.png',
      bundler: 'metro',
      output: 'static',
    },
    plugins: [
      'expo-router',
      'expo-sharing',
      'expo-notifications',
      [
        'expo-camera',
        {
          cameraPermission: 'O app usa a câmera somente para ler o QR Code de check-in dos jogadores.',
          recordAudioAndroid: false,
          barcodeScannerEnabled: true,
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#F5F2EA',
          image: './assets/branding/marcoujogou-mark.png',
          imageWidth: 200,
          resizeMode: 'contain',
          dark: {
            backgroundColor: '#111416',
            image: './assets/branding/marcoujogou-mark.png',
          },
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
            'O app usa sua localização para buscar campos próximos quando você solicitar, e jogadores livres somente se você ativar essa opção.',
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
