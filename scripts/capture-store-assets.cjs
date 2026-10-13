// Render the actual production web UI with isolated, synthetic server fixtures.
// No real customer data, payments, invitations, ads or backend writes.
const {chromium}=require('playwright-core'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),ts=require('typescript'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve('.test-runtime/native-billing-web'),out=path.resolve('assets/store'),port=19031;
const m=new Module(path.resolve('src/lib/mockData.ts'));m._compile(ts.transpileModule(fs.readFileSync(m.id,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,m.id);
const d=m.exports,actor='00000000-0000-4000-8000-000000000001',at=new Date().toISOString();
const own={...d.MOCK_PLAYERS[0],name:'Lucas Costa',nickname:'Lucas',phone:null,avatarUrl:null,authUserId:actor};
const snake=v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),x]));
const tables={
 players:d.MOCK_PLAYERS.map(p=>snake({...p,...(p.id===own.id?own:{}),phone:null,avatarUrl:null})),
 peladas:d.MOCK_PELADAS.map((p,i)=>snake({...p,name:i?'Vôlei da Vila':'Resenha FC'})),
 pelada_memberships:[...d.MOCK_MEMBERSHIPS,...(!d.MOCK_MEMBERSHIPS.some(x=>x.peladaId===d.MOCK_PELADAS[1].id&&x.playerId===own.id)?[{peladaId:d.MOCK_PELADAS[1].id,playerId:own.id,role:'member',active:true,joinedAt:at}]:[])].map(snake),
 fields:d.MOCK_FIELDS.map(snake),games:d.MOCK_GAMES.map(snake),attendances:d.MOCK_ATTENDANCES.map(snake),
 ratings:d.MOCK_RATINGS.map(snake),payments:d.MOCK_PAYMENTS.map(snake),establishments:d.MOCK_ESTABLISHMENTS.map(snake),
 schedules:d.MOCK_SCHEDULES.map(snake),friendships:d.MOCK_FRIENDSHIPS.map(snake),
 player_preferences:[{player_id:own.id,current_pelada_id:d.MOCK_PELADAS[0].id}],
};
const user={id:actor,aud:'authenticated',role:'authenticated',email:'store-preview@test.invalid',app_metadata:{},user_metadata:{name:own.name},identities:[],created_at:at};
const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:actor,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture-signature`;
const session={access_token:token,refresh_token:'fixture-only',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
let serverTables=tables,serverOwn=own,serverUser=user,serverSession=session;
const directory=d.MOCK_FIELDS.slice(0,2).map((f,i)=>({id:'directory-'+i,fieldId:f.id,name:f.name,address:f.address,sportId:f.sportId,sportIds:[f.sportId],phone:null,whatsapp:false,registered:true,online:false,active:true,latitude:null,longitude:null,distanceKm:null,reviewAverage:null,reviewCount:0,revision:1,updatedAt:at}));
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 let file=url.pathname==='/brand-icon.png'?path.resolve('assets/branding/marcoujogou-icon.png'):path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(url.pathname!=='/brand-icon.png'&&!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(root,'index.html');
 res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.png':'image/png','.ttf':'font/ttf','.ico':'image/x-icon'}[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
async function run(){let browser,page;try{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(port,'127.0.0.1',r));
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const design=await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});
 await design.setContent(`<html><body style="margin:0;background:#F5F2EA"><img src="http://127.0.0.1:${port}/brand-icon.png" width="512" height="512" alt="MarcouJogou"></body></html>`);
 await design.locator('img').evaluate(img=>img.decode());await design.screenshot({path:path.join(out,'google-icon-512.png')});
 await design.setViewportSize({width:1024,height:500});
 await design.setContent(`<html><body style="margin:0;background:#F5F2EA;color:#172320;font-family:Arial,sans-serif"><main style="height:500px;display:flex;align-items:center;gap:44px;padding:0 65px;box-sizing:border-box"><img src="http://127.0.0.1:${port}/brand-icon.png" width="265" height="265" alt=""><div><p style="font-size:18px;letter-spacing:3px;font-weight:700;color:#087E5B;margin:0 0 20px">MARCOU O ESPAÇO. REUNIU A TURMA.</p><h1 style="font-size:62px;letter-spacing:-3px;margin:0 0 22px">MarcouJogou</h1><p style="font-size:29px;line-height:1.35;margin:0">Seu time. Seu lugar.<br>Seu próximo jogo.</p></div></main></body></html>`);
 await design.locator('img').evaluate(img=>img.decode());await design.screenshot({path:path.join(out,'google-feature-1024x500.png')});await design.close();
 const ctx=await browser.newContext({viewport:{width:360,height:640},deviceScaleFactor:3});
 await ctx.routeWebSocket('**/*',ws=>ws.close());
 let receipt=null,requests=0,unexpectedWrites=0;
 await ctx.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();
   if(!url.hostname.endsWith('.supabase.co'))return route.abort();
   const table=url.pathname.split('/').pop(),body=route.request().postData()?route.request().postDataJSON():{};
   if(url.pathname.startsWith('/rest/v1/')&&!url.pathname.includes('/rpc/')&&route.request().method()!=='GET'&&route.request().method()!=='OPTIONS')unexpectedWrites++;
   let value=serverTables[table]??[];
   if(table==='token')value=serverSession;
   else if(table==='user')value=serverUser;
   else if(table==='players'&&url.searchParams.has('auth_user_id'))value=snake(serverOwn);
   else if(table==='player_profiles_snapshot')value=serverTables.players;
   else if(table==='platform_configuration')value={settings:{discoveryEnabled:true,referralsEnabled:true,sponsoredEnabled:false,bookingCommissionPercent:0,whatsappMonthlyAllowance:100,trialDays:14}};
   else if(table==='commercial_access_snapshot')value={role:null,licenses:[],agreements:[]};
   else if(table==='growth_snapshot')value={venues:[],buddies:[],slots:[],windows:[],requests:[]};
   else if(table==='search_field_directory')value={entries:directory,total:directory.length};
   else if(table==='account_deletion_self'){
     if(body.p_action==='request'){requests++;receipt={id:'00000000-0000-4000-8000-000000000010',status:'requested',expectedBy:new Date(Date.now()+7*86400000).toISOString()};}
     if(body.p_action==='cancel'&&receipt)receipt={...receipt,status:'cancelled'};
     value=receipt;
   }
   return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(value)});
 });
 page=await ctx.newPage();const errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>{console.log('Fixture runtime error:',e.message);errors.push(e.message);});
 page.on('console',m=>{if(m.type()==='error')console.log('Fixture console error:',m.text());});
 await page.goto(`http://127.0.0.1:${port}/login`,{waitUntil:'networkidle'});
 await page.getByPlaceholder('voce@email.com').fill(user.email);
 await page.getByPlaceholder('••••••••').fill('fixture-password-never-real');
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByText('Antes de participar',{exact:true}).waitFor();
 assert(!(await page.getByRole('button',{name:'Aceitar e continuar',exact:true}).isEnabled()));
 await page.getByRole('button',{name:'Ler termos de uso',exact:true}).click();
 await page.getByText('Termos de uso · MarcouJogou',{exact:true}).waitFor();await page.getByRole('button',{name:'Voltar',exact:true}).click();
 await page.getByRole('checkbox',{name:'Aceito os termos e as regras da comunidade',exact:true}).click();await page.getByRole('button',{name:'Aceitar e continuar',exact:true}).click();
 await page.getByText('Seus times',{exact:true}).waitFor();
 const routes=[['/','01-home-phone.png','Seus times'],['/times','02-times-phone.png','Times'],['/time/pel1','03-time-phone.png','⚽ Resenha FC'],['/campos','04-campos-phone.png','Campos perto de você']];
 for(const [route,file,label] of routes){
   await page.goto(`http://127.0.0.1:${port}${route}`,{waitUntil:'networkidle'});
   await page.getByText(label,{exact:true}).first().waitFor();
   if(route==='/campos')await page.getByText('Cadastrados no MarcouJogou',{exact:true}).scrollIntoViewIfNeeded();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:path.join(out,file)});
 }
 // Verify the in-app privacy workflow against fixtures; never send a real request.
 await page.goto(`http://127.0.0.1:${port}/perfil`,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Solicitar exclusão da conta',exact:true}).click();
 const confirm=page.getByText('Digite EXCLUIR para confirmar a solicitação',{exact:true}).locator('..').locator('input');
 await confirm.fill('EXCLUIR');await page.getByRole('button',{name:'Enviar pedido de exclusão',exact:true}).click();
 await page.getByText(/Pedido registrado no servidor/).waitFor();assert.equal(requests,1);
 await page.getByRole('button',{name:'Atualizar solicitação',exact:true}).click();assert.equal(requests,1);
 await page.getByRole('button',{name:'Cancelar solicitação de exclusão',exact:true}).click();
 await page.getByText(/Solicitação cancelada/).waitFor();assert.equal(receipt.status,'cancelled');
 // Exercise the real persisted stores and login/logout UI across two identities.
 await page.getByRole('button',{name:'Sair',exact:true}).click();
 await page.getByPlaceholder('voce@email.com').waitFor();
 const storageState=()=>page.evaluate(()=>Object.fromEntries(['pelada-app-storage','pelada-growth-storage','pelada-pro-storage'].map(k=>[k,JSON.parse(localStorage.getItem(k)||'{}').state])));
 const cleared=await storageState();
 for(const state of Object.values(cleared)) { assert.equal(state.cacheAuthUserId,null); for(const value of Object.values(state))if(Array.isArray(value))assert.equal(value.length,0); }
 const actorB='00000000-0000-4000-8000-000000000002';
 serverOwn={...own,id:'player-b',name:'Revisor Isolado',nickname:'Revisor',authUserId:actorB};
 serverUser={...user,id:actorB,email:'review-b@test.invalid',user_metadata:{name:serverOwn.name}};
 const tokenB=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:actorB,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture-signature`;
 serverSession={...session,user:serverUser,access_token:tokenB,refresh_token:'fixture-b-only'};
 serverTables={players:[snake(serverOwn)],peladas:[snake({...d.MOCK_PELADAS[0],id:'team-b',name:'Time Isolado B',createdBy:serverOwn.id})],pelada_memberships:[{pelada_id:'team-b',player_id:serverOwn.id,role:'member',active:true,joined_at:at}]};
 await page.getByPlaceholder('voce@email.com').fill(serverUser.email);
 await page.getByPlaceholder('••••••••').fill('fixture-b-password-never-real');
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByText('Antes de participar',{exact:true}).waitFor();
 assert(!(await page.getByRole('button',{name:'Aceitar e continuar',exact:true}).isEnabled()),'Another account must not inherit terms acceptance');
 await page.getByRole('checkbox',{name:'Aceito os termos e as regras da comunidade',exact:true}).click();await page.getByRole('button',{name:'Aceitar e continuar',exact:true}).click();
 await page.getByText('Time Isolado B',{exact:true}).waitFor();
 assert(!(await page.locator('body').innerText()).includes('Lucas'));assert(!(await page.locator('body').innerText()).includes('Resenha FC'));
 for(const state of Object.values(await storageState()))assert.equal(state.cacheAuthUserId,actorB);
 await page.goto(`http://127.0.0.1:${port}/time/team-b`,{waitUntil:'networkidle'});
 await page.getByText('⚽ Time Isolado B',{exact:true}).waitFor();
 await page.goto(`http://127.0.0.1:${port}/time/pel1`,{waitUntil:'networkidle'});
 await page.getByText('Time não encontrado.',{exact:true}).waitFor();
 assert(!(await page.locator('body').innerText()).includes('Resenha FC'));
 assert.equal(unexpectedWrites,0,'Reset/hydration must not generate REST mutations or cross-account deletes');
 assert.deepEqual(errors,[]);
 for(const f of ['google-icon-512.png','google-feature-1024x500.png',...routes.map(r=>r[1])]){const b=fs.readFileSync(path.join(out,f));assert(b.length<8*1024*1024);console.log(f,b.readUInt32BE(16)+'x'+b.readUInt32BE(20));}
 console.log('PASS: real responsive UI, cold deep links, deletion request/cancel, logout/cache clearing, second-account isolation/reload and no reset writes. No external traffic. Web captures are not proof of native runtime testing.');
}catch(e){if(page){console.log('Fixture UI:',page.url(),(await page.locator('body').innerText()).slice(0,2500));console.log(await page.evaluate(()=>({keys:Object.keys(localStorage),auth:localStorage.getItem('pelada-auth-storage'),html:document.body.innerHTML.slice(0,1800)})));await page.screenshot({path:path.resolve('.test-runtime/store-release/capture-failure.png')});}throw e;}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}}
run().catch(e=>{console.error(e);process.exitCode=1;});
