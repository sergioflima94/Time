const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const projectEnv = require('@expo/env').parseProjectEnv(root, { mode: 'production', silent: true }).env;
const env = { ...process.env, ...projectEnv, NODE_ENV: 'production', EXPO_NO_DOTENV: '1',
  MARCOUJOGOU_WEB_OUTPUT: 'single', EXPO_PUBLIC_APP_WEB_URL: 'https://app.marcoujogou.com.br' };
const backend = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (backend !== 'https://oyhbmbstsiagwljatawq.supabase.co' || !key) throw new Error('Configure o Supabase de produção antes de exportar; demonstração não é publicável.');
if (!key.startsWith('sb_publishable_')) {
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { }
  if (role !== 'anon') throw new Error('Somente chave publicável/anon pode entrar no navegador.');
}
for (const [name, value] of Object.entries(env)) {
  if (name.startsWith('EXPO_PUBLIC_') && value && (/SECRET|SERVICE_ROLE|PASSWORD|PRIVATE|ACCESS_TOKEN/i.test(name)
    || /sb_secret_|sbp_|sk-proj-/i.test(value))) throw new Error(`Variável pública proibida: ${name}`);
}
const trackedChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim();
if (trackedChanges) throw new Error('Faça commit das alterações do app antes de exportar para registrar uma origem exata.');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const output = path.join(root, '.test-runtime', `web-hostgator-${crypto.randomUUID()}`);
execFileSync(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'export', '--platform', 'web', '--output-dir', output, '--max-workers', '2'], { cwd: root, env, stdio: 'inherit' });
if (!fs.existsSync(path.join(output, 'index.html'))) throw new Error('Exportação não gerou index.html.');
fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify({
  app: 'MarcouJogou', version: require('../package.json').version,
  sourceRepository: 'https://github.com/sergioflima94/Time', sourceCommit,
  generatedAt: new Date().toISOString(), webOrigin: env.EXPO_PUBLIC_APP_WEB_URL,
  supabaseUrl: backend, output: 'single',
}, null, 2) + '\n');
console.log(`Exportação web de produção: ${output}`);
console.log('No repositório marcoujogou-site: node scripts/import-app.cjs "<pasta acima>"');
