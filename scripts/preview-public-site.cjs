// Read-only local preview. No PHP, account deletion, mail delivery or backend writes.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../.test-runtime/public-site');
const port = Number(process.env.PUBLIC_SITE_PORT || 19016);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.xml':'application/xml','.txt':'text/plain'};
http.createServer((req,res) => {
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    const url = new URL(req.url,'http://localhost');
    const route = decodeURIComponent(url.pathname);
    let file = path.resolve(root, `.${route}`);
    if (file !== root && !file.startsWith(root + path.sep) || route.includes('\\') || route.split('/').some(part => part.startsWith('.') && part !== '')) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file,'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('Não encontrado'); return; }
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'"});
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(400); res.end(); }
}).listen(port,'127.0.0.1',() => console.log(`Preview local: http://127.0.0.1:${port}`));
