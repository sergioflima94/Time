// Local production bundle; all external HTTP/WS blocked or stubbed.
const { chromium }=require('playwright-core'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('.test-runtime/native-billing-web'),port=19029;
const types={'.html':'text/html','.js':'text/javascript','.png':'image/png','.ttf':'font/ttf','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=path.resolve(root,`.${pathname}`);
  if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');
  res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
async function run(){let browser;try{
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext();
 await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='127.0.0.1')return route.continue();
   const body=url.pathname.endsWith('/platform_configuration')?{settings:{discoveryEnabled:true,referralsEnabled:true,sponsoredEnabled:false,bookingCommissionPercent:0,whatsappMonthlyAllowance:0,trialDays:7},plans:[],sports:[]}:[];
   return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(body)});
 });
 await context.routeWebSocket('**/*',ws=>ws.close());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/termos`,{waitUntil:'networkidle'});
 await page.getByText('Termos de uso · MarcouJogou',{exact:true}).waitFor();
 for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Legal page must not overflow');
 }
 await page.setViewportSize({width:390,height:844});fs.mkdirSync('.test-runtime/native-billing-prints',{recursive:true});
 await page.screenshot({path:'.test-runtime/native-billing-prints/termos-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: production web export, public terms route, physical/digital disclosures, 320/390/1280 widths and no native SDK/browser crash.');
 // Existing physical-service browser regression with isolated backend fixtures.
 const {spawn}=require('node:child_process');
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/test-venue-academy-ui.cjs'],{env:{...process.env,TEST_URL:`http://127.0.0.1:${port}`},stdio:'inherit'});child.on('exit',code=>code===0?resolve():reject(new Error(`Academy regression exit ${code}`)));child.on('error',reject);});
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}}
run().catch(e=>{console.error(e);process.exitCode=1;});
