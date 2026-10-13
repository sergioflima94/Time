const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const base={...process.env,EAS_BUILD_PROFILE:'store',EXPO_PUBLIC_ADMOB_MODE:'off',EXPO_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
function config(env){return spawnSync(process.execPath,['-e',"const c=require('./app.config.js').expo;console.log(JSON.stringify({package:c.android.package,bundle:c.ios.bundleIdentifier,mode:c.extra.admob.mode,plugins:c.plugins,permissions:c.android.blockedPermissions,ios:c.ios.infoPlist}))"],{cwd:require('node:path').resolve(__dirname,'..'),env,encoding:'utf8'});}
let out=config(base);assert.equal(out.status,0,out.stderr);const c=JSON.parse(out.stdout);
assert.equal(c.package,'com.marcoujogou.app');assert.equal(c.bundle,c.package);assert.equal(c.mode,'off');
assert.equal(c.plugins.some(p=>Array.isArray(p)&&p[0]==='react-native-google-mobile-ads'),false);
assert(c.permissions.includes('com.google.android.gms.permission.AD_ID'));
assert(c.permissions.includes('android.permission.RECORD_AUDIO'));
assert(c.permissions.includes('android.permission.SYSTEM_ALERT_WINDOW'));
assert.equal(c.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-image-picker')[1].microphonePermission,false);
assert.equal(c.ios.ITSAppUsesNonExemptEncryption,false);
out=config({...base,EXPO_PUBLIC_SUPABASE_URL:'',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',EXPO_PUBLIC_SUPABASE_ANON_KEY:''});assert.notEqual(out.status,0);assert.match(out.stderr,/variáveis públicas/);
const native=spawnSync(process.execPath,['-e',"console.log(JSON.stringify(require('./react-native.config.js')))"],{env:base,encoding:'utf8'});assert.equal(native.status,0);assert.deepEqual(JSON.parse(native.stdout).dependencies['react-native-google-mobile-ads'].platforms,{android:null,ios:null});
const eas=require('../eas.json');assert.equal(eas.build.store.android.buildType,'app-bundle');assert.equal(eas.build.store.env.EXPO_PUBLIC_ADMOB_MODE,'off');assert.equal(eas.build.production.env.EXPO_PUBLIC_ADMOB_MODE,'production');
console.log('PASS: brand package, real backend required, no-ads native exclusion, AD_ID blocked, encryption metadata and independent future AdMob production profile.');
