// All remote HTTP/WS is stubbed. Credentials are synthetic and no message is sent.
const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.TEST_URL??'http://127.0.0.1:19029',id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,now=new Date().toISOString();
const user={id:id(1),aud:'authenticated',role:'authenticated',email:'whatsapp-admin@test.invalid',app_metadata:{},user_metadata:{name:'Admin de teste'},identities:[],created_at:now};
const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.synthetic`;
const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'synthetic-only',user};
const settings={discoveryEnabled:true,referralsEnabled:true,sponsoredEnabled:false,bookingCommissionPercent:0,whatsappMonthlyAllowance:100,trialDays:14};
const player={id:id(2),auth_user_id:user.id,name:'Admin de teste',nickname:null,phone:null,avatar_url:null,preferred_position:'line',favorite_sports:['volei'],is_guest:false,created_at:now};
async function run(){const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await ctx.newPage(),errors=[],calls=[];let metadata=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await ctx.routeWebSocket('**/*',ws=>ws.close());
 await ctx.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin===base)return route.continue();
   const b=route.request().postData()?route.request().postDataJSON():{};let data=[];
   if(url.pathname.endsWith('/token'))data=session;
   else if(url.pathname.endsWith('/user'))data=user;
   else if(url.pathname.endsWith('/players'))data=url.searchParams.has('auth_user_id')?player:[player];
   else if(url.pathname.endsWith('/platform_configuration'))data={settings};
   else if(url.pathname.endsWith('/commercial_access_snapshot'))data={role:'owner',licenses:[],agreements:[]};
   else if(url.pathname.endsWith('/platform_console_snapshot'))data={role:'owner',configuration:{revision:1,settings},metrics:{players:1,teams:0,establishments:0,upcomingGames:0,openReports:0,activeSubscriptions:0},players:[],teams:[],establishments:[],plans:[],reports:[],admins:[],audit:[]};
   else if(url.pathname.endsWith('/commercial_admin_data'))data=[];
   else if(url.pathname.endsWith('/platform-whatsapp')){
     calls.push(b);let qr={};
     if(b.action==='save'){assert(b.token==='synthetic-ui-token'||b.newGoInstance);metadata=[...metadata.filter(m=>m.provider!==b.provider),{provider:b.provider,url:b.url,instance:'mj-platform-synthetic',enabled:false,revision:1,hasToken:true,hasGlobalKey:b.provider==='evolution_go',probeOk:false,testedAt:null,state:'unknown'}];}
     if(b.action==='test')metadata=metadata.map(m=>m.provider===b.provider?{...m,probeOk:true}:m);
     if(b.action==='enable')metadata=metadata.map(m=>m.provider===b.provider?{...m,enabled:b.enabled,revision:m.revision+1}:m);
     if(b.action==='connect')qr=b.phone?{pairingCode:'12345678'}:{code:'synthetic-qr-only'};
     data={integrations:metadata,message:b.action==='save'?'Configuração salva.':b.action==='test'?'Acesso verificado.':'Configuração atualizada.',...qr};
   }
   await route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},json:data});
 });
 await page.goto(base+'/login');await page.getByPlaceholder('voce@email.com').fill(user.email);await page.getByPlaceholder('••••••••').fill('test-only');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(base+'/');
 await page.goto(base+'/plataforma');await page.getByText('Integrações WhatsApp',{exact:true}).click();
 const input=label=>page.getByText(label,{exact:true}).locator('..').locator('input');
 await input('Host HTTPS').fill('https://wa.example.com');await input('Token administrativo').fill('synthetic-ui-token');await input('Motivo da configuração').fill('Configurar servidor de teste');
 assert.equal(await input('Token administrativo').getAttribute('type'),'password');await page.getByRole('button',{name:'Salvar configuração protegida',exact:true}).click();
 await page.getByText('Configuração salva.',{exact:true}).waitFor();assert.equal(await input('Token administrativo').inputValue(),'');
 await page.getByRole('button',{name:'Testar host e autenticação',exact:true}).click();await page.getByText('Acesso verificado.',{exact:true}).waitFor();
 await input('Motivo da configuração').fill('Ativar servidor verificado');await page.getByRole('button',{name:'Ativar provedor',exact:true}).click();
 await page.getByRole('button',{name:'Desativar novos envios',exact:true}).waitFor();
 await input('Número para pareamento (opcional)').fill('11999998877');await page.getByRole('button',{name:'Criar/conectar instância e gerar QR',exact:true}).click();await page.getByText('Código: 12345678',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Ocultar QR/código',exact:true}).click();assert.equal(await page.getByText('Código: 12345678',{exact:true}).count(),0);
 await page.getByText('Evolution Go',{exact:true}).click();await input('Host HTTPS').fill('https://go.example.com');await input('Token da instância Go').fill('synthetic-ui-token');await input('Chave global Go (opcional, para criar instância)').fill('synthetic-global-ui-key');await input('Motivo da configuração').fill('Configurar remetente Go');await page.getByRole('button',{name:'Salvar configuração protegida',exact:true}).click();await page.getByText('Configuração salva.',{exact:true}).waitFor();
 assert.equal(await input('Chave global Go (opcional, para criar instância)').inputValue(),'');
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');}
 fs.mkdirSync('.test-runtime/platform-whatsapp-prints',{recursive:true});await page.setViewportSize({width:390,height:844});await page.getByText('Evolution Go · API por token',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'.test-runtime/platform-whatsapp-prints/configuracao-go-mobile.png',fullPage:true});
 assert(!calls.filter(c=>c.action!=='save').some(c=>c.token||c.globalKey||c.webhookSecret));assert.deepEqual(errors,[]);
 console.log('PASS: platform admin API/Go configuration, password fields, secret clearing, probe/activation, mobile pairing, QR clearing, no secret in non-save requests and 320/390/1280 layout.');
}finally{await browser.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
