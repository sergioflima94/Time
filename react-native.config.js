// The no-ads store build omits the native SDK as well as its Expo plugin.
// Merely hiding banners leaves Android's MobileAdsInitProvider in the binary.
const { resolveAdmobConfig } = require('./scripts/admob-config.cjs');
module.exports = {
  dependencies: resolveAdmobConfig().mode === 'off' ? {
    'react-native-google-mobile-ads': { platforms: { android: null, ios: null } },
  } : {},
};
