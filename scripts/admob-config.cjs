// Public identifiers only. Native App IDs and JS ad units must use the same build mode.
const TEST_PUBLISHER = '3940256099942544';
const TEST_IDS = {
  androidAppId: `ca-app-pub-${TEST_PUBLISHER}~3347511713`,
  iosAppId: `ca-app-pub-${TEST_PUBLISHER}~1458002511`,
  androidBannerId: `ca-app-pub-${TEST_PUBLISHER}/6300978111`,
  iosBannerId: `ca-app-pub-${TEST_PUBLISHER}/2934735716`,
};

function resolveAdmobConfig(env = process.env) {
  const profile = env.EAS_BUILD_PROFILE;
  const mode = profile === 'preview' ? 'test' : (env.EXPO_PUBLIC_ADMOB_MODE || 'test');
  if (!['off', 'test', 'production'].includes(mode)) throw new Error('EXPO_PUBLIC_ADMOB_MODE inválido. Use off, test ou production.');
  if (profile === 'production' && mode === 'test') {
    throw new Error('Build de loja bloqueado: configure EXPO_PUBLIC_ADMOB_MODE=production e os IDs reais do AdMob (ou off para lançar sem anúncios).');
  }
  if (mode !== 'production') return { mode, ...TEST_IDS };

  const config = {
    mode,
    androidAppId: env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID,
    iosAppId: env.EXPO_PUBLIC_ADMOB_IOS_APP_ID,
    androidBannerId: env.EXPO_PUBLIC_ADMOB_BANNER_ID_ANDROID,
    iosBannerId: env.EXPO_PUBLIC_ADMOB_BANNER_ID_IOS,
  };
  // EAS sets this for a platform build. Local release validation checks both platforms.
  const platforms = ['android', 'ios'].includes(env.EAS_BUILD_PLATFORM) ? [env.EAS_BUILD_PLATFORM] : ['android', 'ios'];
  for (const platform of platforms) {
    const appId = config[`${platform}AppId`];
    const bannerId = config[`${platform}BannerId`];
    const app = /^ca-app-pub-(\d{16})~\d{10}$/.exec(appId || '');
    const banner = /^ca-app-pub-(\d{16})\/\d{10}$/.exec(bannerId || '');
    if (!app || !banner || app[1] === TEST_PUBLISHER || banner[1] === TEST_PUBLISHER || app[1] !== banner[1]) {
      throw new Error(`AdMob ${platform}: informe App ID e Banner ID reais e válidos, do mesmo editor. IDs de teste não são aceitos em produção.`);
    }
  }
  // Keep valid native placeholders for an unbuilt platform; never expose a test ad unit in production.
  config.androidAppId ||= TEST_IDS.androidAppId;
  config.iosAppId ||= TEST_IDS.iosAppId;
  return config;
}

module.exports = { resolveAdmobConfig, TEST_IDS };
