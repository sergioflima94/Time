// Synthetic SDK only: never requests or clicks real ads.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const { resolveAdmobConfig, TEST_IDS } = require('./admob-config.cjs');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);

const synthetic = {
  EXPO_PUBLIC_ADMOB_MODE: 'production',
  EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: 'ca-app-pub-1111111111111111~1111111111',
  EXPO_PUBLIC_ADMOB_IOS_APP_ID: 'ca-app-pub-1111111111111111~2222222222',
  EXPO_PUBLIC_ADMOB_BANNER_ID_ANDROID: 'ca-app-pub-1111111111111111/3333333333',
  EXPO_PUBLIC_ADMOB_BANNER_ID_IOS: 'ca-app-pub-1111111111111111/4444444444',
};

async function run() {
  assert.deepEqual(resolveAdmobConfig({}), { mode: 'test', ...TEST_IDS });
  assert.equal(resolveAdmobConfig({ ...synthetic, EAS_BUILD_PROFILE: 'preview' }).androidAppId, TEST_IDS.androidAppId);
  assert.throws(() => resolveAdmobConfig({ EAS_BUILD_PROFILE: 'production' }), /bloqueado/);
  assert.throws(() => resolveAdmobConfig({ EXPO_PUBLIC_ADMOB_MODE: 'production' }), /AdMob android/);
  assert.throws(() => resolveAdmobConfig({ ...synthetic, EXPO_PUBLIC_ADMOB_BANNER_ID_ANDROID: TEST_IDS.androidBannerId }), /reais/);
  assert.throws(() => resolveAdmobConfig({ ...synthetic, EXPO_PUBLIC_ADMOB_BANNER_ID_IOS: 'ca-app-pub-2222222222222222/1234567890' }), /mesmo editor/);
  assert.throws(() => resolveAdmobConfig({ ...synthetic, EXPO_PUBLIC_ADMOB_IOS_APP_ID: 'invalid' }), /AdMob ios/);
  assert.equal(resolveAdmobConfig(synthetic).mode, 'production');
  assert.equal(resolveAdmobConfig({ ...synthetic, EAS_BUILD_PLATFORM: 'android', EXPO_PUBLIC_ADMOB_IOS_APP_ID: undefined }).mode, 'production');
  assert.equal(resolveAdmobConfig({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_ADMOB_MODE: 'off' }).mode, 'off');
  const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_ADMOB_MODE, 'test');
  assert.equal(eas.build.production.environment, 'production');
  assert.equal(eas.build.production.env.EXPO_PUBLIC_ADMOB_MODE, 'production');

  const { createAdConsentController } = require('../src/lib/adConsentController.ts');
  let gathers = 0, inits = 0, cached = 0, forms = 0;
  let info = { canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' };
  let networkFail = false, sdkFail = false, cacheFail = false;
  const calls = [];
  const adapter = {
    gatherConsent: async () => { gathers++; calls.push('consent'); if (networkFail) throw Error('offline'); return info; },
    getConsentInfo: async () => { cached++; if (cacheFail) throw Error('offline'); return info; },
    showPrivacyOptionsForm: async () => { forms++; return info; },
    initialize: async () => { inits++; calls.push('initialize'); if (sdkFail) throw Error('native failure'); },
  };
  const denied = createAdConsentController(adapter);
  await denied.initialize();
  assert.equal(denied.getSnapshot().ready, false); assert.equal(inits, 0);
  assert.equal(denied.getSnapshot().privacyOptionsRequired, true);
  info = { ...info, canRequestAds: true };
  const allowed = createAdConsentController(adapter);
  const snapshot = allowed.getSnapshot();
  assert.equal(allowed.getSnapshot(), snapshot, 'stable snapshot avoids React render loop');
  let notifications = 0;
  const unsubscribe = allowed.subscribe(() => notifications++);
  const first = allowed.initialize(), second = allowed.initialize();
  assert.equal(first, second, 'concurrent banners share a consent/SDK initialization');
  assert.equal(allowed.getSnapshot().ready, false, 'banner blocked until async SDK finishes');
  await first;
  assert.equal(inits, 1); assert.equal(allowed.getSnapshot().ready, true);
  assert.deepEqual(calls.slice(-2), ['consent', 'initialize']);
  await allowed.initialize(); assert.equal(inits, 1);
  info = { ...info, canRequestAds: false };
  const beforeRevocation = allowed.getSnapshot().revision;
  const revoke = allowed.showPrivacyOptions();
  assert.equal(allowed.getSnapshot().ready, false, 'all banners removed before privacy dialog');
  await revoke;
  assert.equal(allowed.getSnapshot().ready, false); assert.equal(forms, 1);
  assert.ok(allowed.getSnapshot().revision > beforeRevocation);
  info = { ...info, canRequestAds: true };
  await allowed.showPrivacyOptions(); assert.equal(inits, 1, 'SDK initializes once even after choices change');
  assert.ok(notifications > 0); unsubscribe();
  networkFail = true;
  const prior = createAdConsentController(adapter); await prior.initialize();
  assert.equal(prior.getSnapshot().ready, true); assert.equal(cached, 1);
  info = { ...info, canRequestAds: false };
  const noPrior = createAdConsentController(adapter); await noPrior.initialize();
  assert.equal(noPrior.getSnapshot().ready, false);
  cacheFail = true;
  const noInfo = createAdConsentController(adapter); await noInfo.initialize();
  assert.equal(noInfo.getSnapshot().ready, false); assert.ok(noInfo.getSnapshot().error);
  networkFail = cacheFail = false; sdkFail = true; info = { ...info, canRequestAds: true };
  const broken = createAdConsentController(adapter); await broken.initialize();
  assert.equal(broken.getSnapshot().ready, false); assert.ok(broken.getSnapshot().error);
  sdkFail = false;
  const off = createAdConsentController(null); await off.initialize(); await off.showPrivacyOptions();
  assert.equal(off.getSnapshot().ready, false);

  // Native wrapper: no native require in Expo Go/off; no real unit in debug/test.
  const originalLoad = Module._load;
  let expoGo = false, nativeLoads = 0, dev = false, mode = 'test', platform = 'android';
  global.__DEV__ = dev;
  Module._load = function (name, ...rest) {
    if (name === 'expo-constants') return { __esModule: true, default: {
      executionEnvironment: expoGo ? 'storeClient' : 'standalone', expoConfig: { extra: { admob: {
        mode, androidBannerId: synthetic.EXPO_PUBLIC_ADMOB_BANNER_ID_ANDROID, iosBannerId: synthetic.EXPO_PUBLIC_ADMOB_BANNER_ID_IOS,
      } } },
    }, ExecutionEnvironment: { StoreClient: 'storeClient' } };
    if (name === 'react-native') return { Platform: { OS: platform } };
    if (name === 'react-native-google-mobile-ads') { nativeLoads++; return {
      default: () => ({ initialize: adapter.initialize }), AdsConsent: adapter, BannerAd: () => null,
      BannerAdSize: { BANNER: 'BANNER' }, TestIds: { BANNER: 'official-test-only' },
    }; }
    return originalLoad.call(this, name, ...rest);
  };
  const readAds = () => { delete require.cache[require.resolve('../src/lib/ads.ts')]; return require('../src/lib/ads.ts'); };
  try {
    assert.equal(readAds().getBannerAdUnitId(), 'official-test-only');
    mode = 'production'; assert.equal(readAds().getBannerAdUnitId(), synthetic.EXPO_PUBLIC_ADMOB_BANNER_ID_ANDROID);
    platform = 'ios'; assert.equal(readAds().getBannerAdUnitId(), synthetic.EXPO_PUBLIC_ADMOB_BANNER_ID_IOS);
    global.__DEV__ = true; assert.equal(readAds().getBannerAdUnitId(), 'official-test-only');
    mode = 'off'; let loads = nativeLoads; assert.equal(readAds().isAdsSupported, false); assert.equal(nativeLoads, loads);
    global.__DEV__ = false; mode = 'production'; expoGo = true; loads = nativeLoads;
    assert.equal(readAds().isAdsSupported, false); assert.equal(nativeLoads, loads);
    const web = require('../src/lib/ads.web.ts'); await web.initializeAds(); assert.equal(web.isAdsSupported, false);
    assert.equal(web.getBannerAdUnitId(), ''); assert.equal(web.getAdsState().ready, false);
  } finally { Module._load = originalLoad; delete global.__DEV__; }
  console.log('PASS: production ID guards, preview isolation, consent gating, deduplication, revocation, cached-consent/error paths, native initialization, debug/test/off/Expo Go and web. No real ad traffic.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
