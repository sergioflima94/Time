// Actual production UI against an isolated backend; never uploads to Supabase or AI.
const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.TEST_URL||'http://127.0.0.1:19050',id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),pid=id(2),tid=id(3),now=new Date().toISOString();
const user={id:actor,aud:'authenticated',role:'authenticated',email:'emblem@test.invalid',app_metadata:{},user_metadata:{name:'Rafa'},identities:[],created_at:now};
const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
const session={access_token:token,refresh_token:'fixture-only',token_type:'bearer',expires_in:3600,user};
const player={id:pid,auth_user_id:actor,name:'Rafa',favorite_sports:['volei'],is_guest:false,created_at:now};
let key=null,member=false,fail=false,uploads=0,mutations=0,remoteRequests=0;
const png=fs.readFileSync('assets/branding/marcoujogou-icon.png');
async function run(){const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const ctx=await browser.newContext({viewport:{width:390,height:844}});await ctx.routeWebSocket('**/*',ws=>ws.close());
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(['127.0.0.1','localhost'].includes(url.hostname))return route.continue();
  if(!url.hostname.endsWith('.supabase.co')){remoteRequests++;return route.abort();}
  const fn=url.pathname.split('/').pop(),body=req.postData()?(()=>{try{return req.postDataJSON()}catch{return {}}})():{};let json=[];
  if(url.pathname.includes('/storage/v1/object/public/team-logos/'))return route.fulfill({contentType:'image/png',body:png});
  if(url.pathname.includes('/storage/v1/object/team-logos/')){assert.equal(req.method(),'POST');uploads++;return route.fulfill({json:{Key:'team-logos/'+url.pathname.split('/team-logos/')[1]}});}
  if(fn==='token')json=session;else if(fn==='user')json=user;
  else if(fn==='players')json=url.searchParams.has('auth_user_id')?player:[player];
  else if(fn==='player_profiles_snapshot')json=[player];
  else if(fn==='peladas')json=[{id:tid,name:'Turma do Vôlei',sport_id:'volei',football_variant:'society',default_max_players:12,default_match_minutes:15,invite_code:'FIXTURE',created_by:pid,created_at:now,logo_key:key}];
  else if(fn==='pelada_memberships')json=[{pelada_id:tid,player_id:pid,role:member?'member':'admin',active:true,joined_at:now}];
  else if(fn==='player_preferences')json=[{player_id:pid,current_pelada_id:tid}];
  else if(fn==='commercial_access_snapshot')json={role:null,licenses:[],agreements:[]};
  else if(fn==='growth_snapshot')json={venues:[],buddies:[],slots:[],windows:[],requests:[]};
  else if(fn==='platform_configuration')json={settings:{discoveryEnabled:true},plans:[],sports:[]};
  else if(fn==='set_team_emblem'){mutations++;assert.equal(body.p_team,tid);if(fail)return route.fulfill({status:403,json:{message:'Blocked fixture'}});key=body.p_key;json={id:tid,logoKey:key};}
  else if(fn==='generate-team-logo')return route.fulfill({status:503,json:{error:'not configured'}});
  return route.fulfill({status:200,json});
 });
 const page=await ctx.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/login');await page.getByPlaceholder('voce@email.com').fill(user.email);await page.getByPlaceholder('••••••••').fill('fixture-password');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByRole('checkbox',{name:'Aceito os termos e as regras da comunidade'}).click();await page.getByRole('button',{name:'Aceitar e continuar'}).click();
 await page.getByText('Seus times',{exact:true}).waitFor();await page.goto(base+'/time/'+tid);
 await page.getByRole('button',{name:'Enviar emblema',exact:true}).waitFor();
 async function choose(label){const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:label,exact:true}).click();await (await picker).setFiles({name:'emblema.png',mimeType:'image/png',buffer:png});}
 await choose('Enviar emblema');await page.getByText('Emblema atualizado.',{exact:true}).waitFor();assert.equal(uploads,1);assert.equal(mutations,1);assert(key.startsWith(tid+'/'+actor+'/'));
 await page.reload();await page.getByRole('button',{name:'Trocar emblema',exact:true}).waitFor();
 assert(await page.locator('img').evaluateAll(images=>images.some(i=>i.src.includes('/team-logos/'))));
 const saved=key;fail=true;await choose('Trocar emblema');await page.getByText(/O emblema não foi salvo/).waitFor();assert.equal(key,saved);fail=false;
 await page.getByRole('button',{name:'Gerar com IA',exact:true}).click();await page.getByPlaceholder('Ex.: águia, azul e branco, sem texto').fill('Águia azul sem bola');await page.getByRole('button',{name:'Gerar e salvar emblema'}).click();await page.getByText(/O gerador está indisponível/).waitFor();assert.equal(key,saved);
 fs.mkdirSync('.test-runtime/compact-ui-prints',{recursive:true});await page.screenshot({path:'.test-runtime/compact-ui-prints/emblema-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Remover',exact:true}).click();assert.equal(key,saved);await page.getByRole('button',{name:'Confirmar remoção'}).click();await page.getByRole('button',{name:'Enviar emblema',exact:true}).waitFor();assert.equal(key,null);
 member=true;await page.reload();await page.getByRole('button',{name:'Lances do time'}).waitFor();await page.getByRole('button',{name:'Enviar emblema',exact:true}).waitFor({state:'hidden'});
 assert.equal(remoteRequests,0);assert.deepEqual(errors,[]);console.log('PASS: actual image chooser/upload/save, reload persistence, RPC failure preserves emblem, unavailable AI never saves fake image, deliberate removal and member read-only. All network synthetic.');
}finally{await browser.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
