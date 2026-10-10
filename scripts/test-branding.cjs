const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const config = require('../app.config.js').expo;
assert.equal(config.name, 'MarcouJogou');
assert.equal(config.version, '1.0.3');
assert.equal(config.android.versionCode, 4);
// Upgrade/session/callback compatibility is deliberate, not old public branding.
assert.equal(config.android.package, 'com.pelada.app');
assert.equal(config.ios.bundleIdentifier, 'com.pelada.app');
assert.equal(config.scheme, 'pelada');
assert.equal(config.slug, 'pelada-app');
assert.equal(config.extra.eas.projectId, 'c42d02c6-99b9-4ca4-aea3-0f836b1624ea');
const splash = config.plugins.find(p => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
assert.equal(splash.resizeMode, 'contain');
assert.equal(splash.imageWidth, 200);
assert.equal(splash.dark.backgroundColor, '#111416');
const assets = [config.icon, config.web.favicon, config.android.adaptiveIcon.foregroundImage, config.android.adaptiveIcon.monochromeImage, splash.image, splash.dark.image];
for (const asset of assets) {
  assert.match(asset, /marcoujogou/);
  const bytes = fs.readFileSync(path.resolve(asset));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
  assert(bytes.readUInt32BE(16) >= 1024);
}
const pkg = require('../package.json'), lock = require('../package-lock.json');
assert.equal(pkg.name, 'marcoujogou');
assert.equal(pkg.version, config.version);
assert.equal(lock.packages[''].name, pkg.name);
assert.equal(lock.packages[''].version, pkg.version);
const files = execFileSync('git', ['ls-files', 'app', 'src', 'supabase/functions', 'config/mobile-auth/confirmation.html', 'scripts/configure-auth-email.ps1'], { encoding: 'utf8' }).trim().split(/\r?\n/);
for (const file of files) {
  if (!/\.(tsx?|js|html|ps1)$/.test(file)) continue;
  const code = fs.readFileSync(file, 'utf8');
  assert(!/BoraJogo|BORAJOGO|borajogo-logo|app Pelada/.test(code), `Old visible brand in ${file}`);
}
assert.match(fs.readFileSync('src/store/useAuthStore.ts', 'utf8'), /pelada-auth-storage/);
assert.match(fs.readFileSync('src/store/usePlayHubStore.ts', 'utf8'), /borajogo-play-hub-demo-v1/);
console.log('PASS: MarcouJogou branding, square PNG assets, splash, version, package lock and upgrade/session compatibility.');
