// Authorized review identity only. Real Auth + read-only backend verification.
// No customer screenshots, credentials, tokens or response bodies in output.
const {chromium}=require('playwright-core'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve('.test-runtime/native-billing-web'),port=19033,account=JSON.parse(fs.readFileSync('.test-runtime/store-release/review-account.json','utf8'));
const server=http.createServer((req,res)=>{let f=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(f!==root&&!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}if(!fs.existsSync(f)||!fs.statSync(f).isFile())f=path.join(root,'index.html');res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.png':'image/png','.ttf':'font/ttf'}[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);});
let stage='launch',browser;const diagnostics=[];
async function run(){try{
 await new Promise(r=>server.listen(port,'127.0.0.1',r));browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const ctx=await browser.newContext({viewport:{width:390,height:844}}),errors=[];let blockedWrites=0;
 await ctx.routeWebSocket('**/*',ws=>ws.close());
 const readRpcs=new Set(['commercial_access_snapshot','growth_snapshot','account_deletion_self','venue_reviews_snapshot','platform_console_snapshot','player_profiles_snapshot']);
 await ctx.route('**/*',route=>{
  const req=route.request(),u=new URL(req.url());if(u.hostname==='127.0.0.1')return route.continue();
  if(u.hostname!==`${account.project}.supabase.co`)return route.abort();
  if(u.pathname.startsWith('/functions/'))return route.abort();
  if(u.pathname.startsWith('/rest/')&&req.method()!=='GET'&&req.method()!=='OPTIONS'){
   if(u.pathname.includes('/rpc/')&&readRpcs.has(u.pathname.split('/').pop())){
    if(u.pathname.endsWith('/account_deletion_self')&&req.postDataJSON()?.p_action!=='status'){blockedWrites++;return route.abort();}
    return route.continue();
   }
   blockedWrites++;diagnostics.push(req.method()+' '+u.pathname.split('/').pop());return route.abort();
  }
  return route.continue();
 });
 const page=await ctx.newPage();page.setDefaultTimeout(60000);page.on('pageerror',()=>errors.push('Runtime error'));
 stage='login';await page.goto(`http://127.0.0.1:${port}/login`);await page.getByPlaceholder('voce@email.com').fill(account.email);await page.getByPlaceholder('••••••••').fill(account.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByText('Antes de participar',{exact:true}).waitFor();
 assert(!(await page.getByRole('button',{name:'Aceitar e continuar',exact:true}).isEnabled()));
 stage='public-terms';await page.getByRole('button',{name:'Ler termos de uso',exact:true}).click();await page.getByText('Regras da comunidade',{exact:true}).waitFor();
 stage='cold-team-link-consent';await page.goto(`http://127.0.0.1:${port}/time/${account.teamId}`);await page.getByText('Antes de participar',{exact:true}).waitFor();
 assert.equal(await page.getByText('⚽ [REVISÃO] Time de Demonstração',{exact:true}).count(),0);
 stage='leave-without-accepting';await page.getByRole('button',{name:'Sair sem aceitar',exact:true}).click();await page.getByPlaceholder('voce@email.com').waitFor();
 assert.equal(blockedWrites,0);assert.deepEqual(errors,[]);
 console.log('PASS: real restricted reviewer login, mandatory rules before social access/cold links, public terms and logout without accepting. No agreement accepted on behalf of a person, domain writes, payment/messages, private output or customer screenshots.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}}
run().catch(e=>{console.error('Reviewer UI verification failed at '+stage+'; no private response, token or credentials printed.',{type:e.name,assertion:e.code,actualCount:typeof e.actual==='number'?e.actual:undefined,blockedRoutes:[...new Set(diagnostics)]});process.exitCode=1;});
