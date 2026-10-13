// Config dinâmica (em vez de app.json) para poder ler os IDs do AdMob do .env
// em tempo de build nativo. Veja .env.example para as variáveis disponíveis.

const { resolveAdmobConfig } = require('./scripts/admob-config.cjs');
const admob = resolveAdmobConfig();
const storeRelease = process.env.EAS_BUILD_PROFILE === 'store';
if (storeRelease && (!process.env.EXPO_PUBLIC_SUPABASE_URL ||
    !(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY))) {
  throw new Error('Build de loja bloqueado: configure as variáveis públicas do Supabase no ambiente production do EAS.');
}

module.exports = {
  expo: {
    name: 'MarcouJogou',
    slug: 'pelada-app',
    owner: 'sergiolima',
    extra: {
      eas: { projectId: 'c42d02c6-99b9-4ca4-aea3-0f836b1624ea' },
      admob,
    },
    version: '1.0.6',
    orientation: 'portrait',
    icon: './assets/branding/marcoujogou-icon.png',
    scheme: 'pelada',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.marcoujogou.app',
      buildNumber: '8',
      // HTTPS is provided by the OS; the app implements no custom encryption.
      infoPlist: { ITSAppUsesNonExemptEncryption: false },
    },
    android: {
      versionCode: 8,
      adaptiveIcon: {
        backgroundColor: '#F5F2EA',
        foregroundImage: './assets/branding/marcoujogou-adaptive.png',
        // Android tints only the alpha mask for themed icons.
        monochromeImage: './assets/branding/marcoujogou-adaptive.png',
      },
      predictiveBackGestureEnabled: false,
      package: 'com.marcoujogou.app',
      blockedPermissions: ['android.permission.WRITE_CONTACTS', 'android.permission.RECORD_AUDIO', ...(storeRelease ? ['android.permission.SYSTEM_ALERT_WINDOW'] : []), ...(admob.mode === 'off' ? ['com.google.android.gms.permission.AD_ID'] : [])],
    },
    web: {
      favicon: './assets/branding/marcoujogou-icon.png',
      bundler: 'metro',
      // HostGator serves the authenticated app as a SPA (dynamic game/team IDs).
      // Keep the existing static output for all other export workflows.
      output: process.env.MARCOUJOGOU_WEB_OUTPUT === 'single' ? 'single' : 'static',
    },
    plugins: [
      'expo-router',
      'expo-sharing',
      ['expo-contacts', { contactsPermission: 'Leia contatos escolhidos para encontrar amigos no MarcouJogou. Sua agenda não será salva pelo app.' }],
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
          photosPermission: 'Escolha fotos para seu perfil, times ou produtos da loja.',
          microphonePermission: false,
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'O app usa sua localização para buscar campos próximos quando você solicitar, e jogadores livres somente se você ativar essa opção.',
        },
      ],
      ...(admob.mode === 'off' ? [] : [[
        'react-native-google-mobile-ads',
        {
          androidAppId: admob.androidAppId,
          iosAppId: admob.iosAppId,
          delayAppMeasurementInit: true,
          userTrackingUsageDescription:
            'Com sua permissão, o identificador do dispositivo pode ser usado pela publicidade no MarcouJogou.',
        },
      ]]),
    ],
    experiments: {
      typedRoutes: true,
    },
  },
};
