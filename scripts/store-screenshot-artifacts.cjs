// Runs only in the manually triggered screenshot job, never in the app bundle.
const fs = require('node:fs');
const path = require('node:path');
const names = ['MAESTRO_REVIEW_EMAIL', 'MAESTRO_REVIEW_PASSWORD', 'MAESTRO_REVIEW_VENUE'];
function redactText(text, secrets) {
  for (const secret of secrets.filter(Boolean)) {
    for (const value of [secret, JSON.stringify(secret).slice(1, -1), encodeURIComponent(secret)]) {
      text = text.split(value).join('[REDACTED]');
    }
  }
  return text;
}
module.exports = { redactText };
if (require.main !== module) {
  // Importing the pure text helper must never scan or modify local files.
} else if (process.argv[2] === 'check') {
  if (names.some(name => !process.env[name])) throw Error('Missing restricted review test secrets');
  console.log('Restricted test credentials available; values are not logged.');
} else if (process.argv[2] === 'redact') {
  const secrets = names.map(name => process.env[name]).filter(Boolean);
  if (!process.env.MAESTRO_TESTS_DIR) throw Error('An explicit private test-artifact directory is required');
  const target = path.resolve(process.env.MAESTRO_TESTS_DIR);
  const expected = path.resolve(process.cwd(), '.test-runtime', 'ios-screenshot-tests');
  if (target !== expected) throw Error('Refusing to modify files outside the private screenshot test directory');
  const roots = [target];
  let count = 0;
  const visited = new Set();
  function walk(dir) {
    if (!fs.existsSync(dir) || visited.has(dir)) return;
    visited.add(dir);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'Pods'].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && /\.(json|xml|html|log|txt|yml|yaml|csv)$/.test(file) && fs.statSync(file).size < 30_000_000) {
        const before = fs.readFileSync(file, 'utf8');
        const after = redactText(before, secrets);
        if (after !== before) { fs.writeFileSync(file, after); count++; }
      }
    }
  }
  roots.forEach(walk);
  console.log(`Sensitive test values redacted from ${count} text artifacts.`);
} else throw Error('Expected check or redact');
