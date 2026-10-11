// Build-only output: source files remain under website/public, outside Expo Router.
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'website/public');
const output = path.join(root, '.test-runtime/public-site');
const archive = path.join(root, '.test-runtime/marcoujogou-site-hostgator.zip');
const files = ['index.html','politica-de-privacidade/index.html','excluir-conta/index.html',
  '.htaccess','assets/site.css','assets/exclusao.js','robots.txt','sitemap.xml'];
fs.mkdirSync(output, { recursive: true });
for (const file of files) {
  fs.mkdirSync(path.dirname(path.join(output,file)), {recursive:true});
  fs.copyFileSync(path.join(source,file), path.join(output,file));
}
for (const [from, to] of [['marcoujogou-mark.png','logo.png'], ['marcoujogou-icon.png','icon.png']]) {
  fs.copyFileSync(path.join(root, 'assets/branding', from), path.join(output, 'assets', to));
}
const packageFiles = [...files,'assets/logo.png','assets/icon.png'];
for (const file of ['index.html','politica-de-privacidade/index.html','excluir-conta/index.html','.htaccess','assets/site.css','assets/exclusao.js','assets/logo.png','assets/icon.png']) {
  if (!fs.existsSync(path.join(output,file))) throw new Error(`Arquivo obrigatório ausente: ${file}`);
}
if (process.argv.includes('--zip')) {
  // Literal paths, no shell interpolation. dotfile .htaccess must not be omitted.
  if (process.platform === 'win32') {
    execFileSync('tar.exe', ['-a','-cf',archive,'-C',output,...packageFiles], { stdio: 'inherit' });
  } else {
    // -FS synchronizes a previous archive to this explicit allowlist.
    execFileSync('zip', ['-FS',archive,...packageFiles], { cwd: output, stdio: 'inherit' });
  }
  console.log(`ZIP HostGator: ${archive}`);
}
console.log(`Site estático: ${output}`);
