// Custom EAS Build runner: genuine simulator screenshots, no production writes.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = process.cwd();
if (process.argv[2] === 'unpack') {
  const input = path.join(root, '.store-test-input');
  const metadata = JSON.parse(fs.readFileSync(path.join(input, 'provenance.json'), 'utf8'));
  const archive = path.join(input, 'simulator.tar.gz');
  if (metadata.version !== '1.0.9' || metadata.build !== '13' || crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== metadata.sha256) throw Error('Simulator archive does not match verified build');
  const target = path.join(root, 'ios/build/Build/Products/Release-iphonesimulator');
  fs.mkdirSync(target, { recursive: true });
  cp.execFileSync('tar', ['-xf', archive, '-C', target]);
  console.log('Verified simulator application extracted; no compilation or store upload.');
  process.exit(0);
}
const publicDir = path.join(root, 'store-native-captures');
const privateDir = path.join(root, '.test-runtime', 'ios-screenshot-tests');
const secretNames = ['MAESTRO_REVIEW_EMAIL', 'MAESTRO_REVIEW_PASSWORD', 'MAESTRO_REVIEW_VENUE'];
const secrets = secretNames.map(name => process.env[name]);
if (process.platform !== 'darwin') throw Error('Native screenshots require the macOS build runner');
if (secrets.some(value => !value)) throw Error('Restricted test secrets unavailable');
fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(privateDir, { recursive: true });
function redact(text) { for (const secret of secrets) text = text.split(secret).join('[REDACTED]'); return text; }
function run(command, args, options = {}) {
  const result = cp.spawnSync(command, args, { encoding: 'utf8', maxBuffer: 30_000_000, timeout: 5 * 60_000, ...options });
  if (result.stdout) console.log(redact(result.stdout));
  if (result.stderr) console.log(redact(result.stderr));
  if (result.error || result.status !== 0) throw Error(`${command} failed with status ${result.status}`);
  return result.stdout;
}
function find(dir, match) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const file = path.join(dir, e.name);
    if (match(file, e)) return [file];
    return e.isDirectory() && !['node_modules', 'Pods'].includes(e.name) ? find(file, match) : [];
  });
}
const candidates = find(path.join(root, 'ios', 'build'), (f, e) => e.isDirectory() && f.endsWith('.app') && f.includes('simulator'));
if (candidates.length !== 1) throw Error(`Expected one simulator .app, found ${candidates.length}`);
const appPath = candidates[0];
const inventory = JSON.parse(cp.execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { encoding: 'utf8' }));
const available = Object.entries(inventory.devices).flatMap(([runtime, devices]) => devices.map(d => ({ ...d, runtime }))).filter(d => d.isAvailable && /iOS/.test(d.runtime));
console.log('Available iOS simulators: ' + available.map(d => d.name).join(', '));
const iphone = available.find(d => /iPhone 17 Pro Max/.test(d.name)) || available.find(d => /iPhone 16 Pro Max/.test(d.name)) || available.find(d => /iPhone 16 Plus/.test(d.name));
const ipad = available.find(d => /iPad Pro 13/.test(d.name)) || available.find(d => /iPad Pro.*12.9/.test(d.name)) || available.find(d => /iPad Air 13/.test(d.name));
if (!iphone || !ipad) throw Error('Store-sized iPhone and iPad simulators unavailable in this image');
const original = path.join(root, '.store-test-input/provenance.json');
const provenance = { version: '1.0.9', build: '13', sourceCommit: process.env.EAS_BUILD_GIT_COMMIT_HASH, buildId: process.env.EAS_BUILD_ID, nativeApplicationBuildId: fs.existsSync(original) ? JSON.parse(fs.readFileSync(original, 'utf8')).nativeApplicationBuildId : process.env.EAS_BUILD_ID, capturedAt: new Date().toISOString(), native: true, devices: [] };
let failed = false;
const targets = [['iphone', iphone], ['ipad', ipad]].filter(([family]) => !process.env.STORE_CAPTURE_FAMILY || process.env.STORE_CAPTURE_FAMILY === family);
if (!targets.length) throw Error('Unsupported capture device family');
for (const [family, device] of targets) {
  try {
    run('xcrun', ['simctl', 'shutdown', 'all']);
    run('xcrun', ['simctl', 'boot', device.udid]);
    run('xcrun', ['simctl', 'bootstatus', device.udid, '-b']);
    run('xcrun', ['simctl', 'status_bar', device.udid, 'override', '--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100']);
    run('xcrun', ['simctl', 'install', device.udid, appPath]);
    const output = path.join(privateDir, family);
    fs.mkdirSync(output, { recursive: true });
    run('maestro', ['--device', device.udid, 'test', '--test-output-dir', output, '--debug-output', output, path.join(root, '.maestro/store-screenshots.yml')], { timeout: 12 * 60_000, env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1', MAESTRO_CAPTURE_DEVICE: family, MAESTRO_CAPTURE_MODEL: device.name } });
    const images = find(output, (f, e) => e.isFile() && /(?:01-home|02-times|03-operacao|04-aulas)\.png$/.test(f));
    if (images.length !== 4) throw Error(`Expected four ${family} captures, found ${images.length}`);
    const target = path.join(publicDir, family);
    fs.mkdirSync(target, { recursive: true });
    const files = images.map(file => {
      const bytes = fs.readFileSync(file);
      const name = path.basename(file);
      fs.copyFileSync(file, path.join(target, name));
      return { name, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    });
    provenance.devices.push({ family, model: device.name, runtime: device.runtime, files });
    fs.writeFileSync(path.join(publicDir, 'provenance.json'), JSON.stringify(provenance, null, 2));
  } catch (error) {
    failed = true; console.error(redact(error.message));
    const diagnosticDir = path.join(root, 'store-test-diagnostics');
    fs.mkdirSync(diagnosticDir, { recursive: true });
    // Diagnostic image stays private; it is never a store screenshot or Git asset.
    try { run('xcrun', ['simctl', 'io', device.udid, 'screenshot', path.join(diagnosticDir, family + '-failure.png')]); } catch {}
  }
}
run(process.execPath, [path.join(root, 'scripts/store-screenshot-artifacts.cjs'), 'redact'], { env: { ...process.env, MAESTRO_TESTS_DIR: privateDir } });
// Only sanitized text diagnostics; never export login screenshots or raw logs.
for (const file of find(privateDir, (f, e) => e.isFile() && /\.(json|xml|txt|log)$/.test(f) && !/device-simulator\.log$/.test(f) && fs.statSync(f).size < 10_000_000)) {
  const target = path.join(root, 'store-test-diagnostics', path.relative(privateDir, file));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let text = redact(fs.readFileSync(file, 'utf8')).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[TOKEN REDACTED]');
  if (file.endsWith('.json')) {
    const scrub = (value, key = '') => {
      if (/inputTextCommand|defineVariablesCommand|password|accessToken|refreshToken/i.test(key)) return '[INPUT REDACTED]';
      if (Array.isArray(value)) return value.map(v => scrub(v));
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v, k)]));
      return value;
    };
    try { text = JSON.stringify(scrub(JSON.parse(text)), null, 2); } catch {}
  }
  fs.writeFileSync(target, text);
}
if (failed) throw Error('A native screenshot test failed; only successful captures are exported');
