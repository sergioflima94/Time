const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.TEST_URL||'http://localhost:19019',uid='00000000-0000-4000-8000-000000000123',pid='00000000-0000-4000-8000-000000000124',other='00000000-0000-4000-8000-000000000125';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'validation@example.invalid',app_metadata:{},user_metadata:{name:'Validação'},identities:[],created_at:new Date().toISOString()};
const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test-signature`;
const session={access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user};
const player={id:pid,auth_user_id:uid,name:'Validação',nickname:null,phone:null,avatar_url:null,card_background_url:null,preferred_position:'line',favorite_sports:['futebol'],premium_since:null,premium_until:null,premium_auto_renew:false,free_agent_opt_in:false,free_agent_availability:[],is_guest:false,created_at:user.created_at};
async function run(){const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:-16.68,longitude:-49.25}}),page=await ctx.newPage();page.setDefaultTimeout(15000);
 const errors=[],calls=[];let relation=null,preferences={byPhone:false,byEmail:false,nearby:false,locationFresh:false};
 page.on('pageerror',e=>errors.push(e.message));
 const found=()=>({id:other,name:'Amigo de teste',nickname:null,avatarUrl:null,favoriteSports:['volei'],preferredPosition:'line',friendship:relation});
 await ctx.addInitScript(()=>{Object.defineProperty(navigator,'contacts',{configurable:true,value:{select:async()=>[{name:['Amigo da agenda'],tel:['(11) 99999-1234'],email:['friend@test.invalid']},{name:['Novo da agenda'],tel:['11988881234']}]}});});
 await ctx.routeWebSocket(/supabase\.co/,ws=>ws.close());
 await ctx.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url()),headers={'content-type':'application/json','access-control-allow-origin':'*','x-supabase-api-version':'2024-01-01'};
  let json=[];
  if(url.pathname.endsWith('/token'))json=session;
  else if(url.pathname.endsWith('/user'))json=user;
  else if(url.pathname.endsWith('/players'))json=url.searchParams.has('auth_user_id')?player:[player,{...player,id:other,auth_user_id:'00000000-0000-4000-8000-000000000127',name:'Amigo de teste'}];
  else if(url.pathname.endsWith('/peladas'))json=[{id:'00000000-0000-4000-8000-000000000128',name:'Time de teste',description:null,sport_id:'volei',football_variant:'society',default_match_minutes:10,default_max_players:12,default_players_per_team:6,default_draw_method:'rating',invite_code:'TESTTEAM',created_by:pid,created_at:user.created_at}];
  else if(url.pathname.endsWith('/pelada_memberships'))json=[pid,other].map(id=>({pelada_id:'00000000-0000-4000-8000-000000000128',player_id:id,role:id===pid?'admin':'member',active:true,joined_at:user.created_at}));
  else if(url.pathname.endsWith('/platform_configuration'))json={settings:{discoveryEnabled:true,referralsEnabled:true,sponsoredEnabled:false}};
  else if(url.pathname.endsWith('/commercial_access_snapshot'))json={role:null,licenses:[],agreements:[]};
  else if(url.pathname.endsWith('/friend_discovery')){
   const {p_action:a,p_data:d={}}=route.request().postDataJSON();calls.push({a,d});
   if(a==='preferences')json=preferences;
   else if(a==='configure'){preferences={...preferences,...d,locationFresh:!!d.nearby};json=preferences;}
   else if(a==='search')json=d.query==='11999991234'||d.query==='friend@test.invalid'?[{index:0,player:found()}]:[];
   else if(a==='match'){assert.equal(d.identifiers.length,3);assert(!JSON.stringify(d).includes('Amigo da agenda'));json=[{index:0,player:found()},{index:1,player:found()}];}
   else if(a==='request'){relation={id:'00000000-0000-4000-8000-000000000126',requesterId:pid,addresseeId:other,status:'pending',createdAt:user.created_at,respondedAt:null};json=found();}
   else if(a==='nearby')json=[{...found(),distanceKm:2}];
   else if(a==='invite_create')json={token:'a'.repeat(64),expiresAt:new Date(Date.now()+86400000).toISOString()};
   else if(a==='invite_preview'||a==='invite_claim')json=found();
  }
  await route.fulfill({status:200,headers,json});
 });
 await page.goto(base+'/login');await page.getByPlaceholder('voce@email.com').fill(user.email);await page.getByPlaceholder('••••••••').fill('test-password');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(base+'/');
 await page.goto(base+'/time/00000000-0000-4000-8000-000000000128');await page.getByText('Elenco (2)',{exact:true}).waitFor();await page.getByRole('button',{name:'Chamar pra ser amigo',exact:true}).waitFor();
 await page.goto(base+'/amigos');await page.getByText('Encontre sua turma',{exact:true}).waitFor();
 const search=page.getByPlaceholder('Nome, celular com DDD ou e-mail completo');await search.fill('11999991234');await page.getByRole('button',{name:'Buscar amigos',exact:true}).click();try{await page.getByText('Amigo de teste',{exact:true}).waitFor();}catch(e){console.log({calls,errors,body:(await page.locator('body').innerText()).slice(0,1200)});throw e;}
 await search.fill('friend@test.invalid');await page.getByRole('button',{name:'Buscar amigos',exact:true}).click();await page.getByRole('button',{name:'Chamar pra ser amigo',exact:true}).click();await page.getByText('Pedido enviado',{exact:true}).waitFor();
 await page.getByText('Contatos',{exact:true}).click();await page.getByRole('button',{name:'Escolher contatos do celular'}).click();await page.getByRole('checkbox',{name:'Selecionar Amigo da agenda'}).click();await page.getByRole('checkbox',{name:'Selecionar Novo da agenda'}).click();await page.getByRole('button',{name:'Encontrar contatos no app'}).click();
 await page.getByRole('button',{name:'Convidar Novo da agenda para o app'}).waitFor();assert.equal(await page.getByText('Amigo de teste',{exact:true}).count(),1);
 await page.getByRole('button',{name:'Convidar Novo da agenda para o app'}).click();await page.getByRole('button',{name:'Enviar convite pelo WhatsApp'}).waitFor();await page.getByRole('button',{name:'Enviar convite por SMS'}).waitFor();
 await page.getByRole('button',{name:'Fechar convite'}).click();await page.getByText('Perto',{exact:true}).click();await page.getByRole('button',{name:'Buscar amigos por proximidade'}).click();await page.getByText('Até cerca de 2 km',{exact:true}).waitFor();
 await page.getByText('Privacidade',{exact:true}).click();const sw=page.getByRole('switch',{name:'Permitir busca pelo meu celular'});await sw.click();await page.waitForFunction(()=>document.querySelector('[aria-label="Permitir busca pelo meu celular"]').checked);
 const out=path.resolve('.test-runtime/friend-ui');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'privacidade.png'),fullPage:true});
 await page.goto(base+'/amigo/'+'a'.repeat(64));await page.getByRole('button',{name:'Retomar convite e pedir amizade'}).waitFor();await page.getByRole('button',{name:'Retomar convite e pedir amizade'}).click();await page.getByText(/Convite retomado/).waitFor();assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('marcoujogou-pending-friend-invite'))).state.token,null);
 await page.getByRole('button',{name:'Ver amigos'}).click();await page.getByText('Encontre sua turma',{exact:true}).waitFor();assert(calls.some(c=>c.a==='invite_claim'));assert(calls.some(c=>c.a==='configure'&&c.d.nearby));assert.deepEqual(errors,[]);
 await ctx.close();
 // Anonymous invitation survives entering login/signup, not an automatic friendship.
 const anon=await browser.newContext(),p=await anon.newPage();await p.goto(base+'/amigo/'+'b'.repeat(64));await p.getByRole('button',{name:'Criar conta com convite'}).click();await p.getByPlaceholder('Mínimo de 6 caracteres').waitFor();assert.equal(JSON.parse(await p.evaluate(()=>localStorage.getItem('marcoujogou-pending-friend-invite'))).state.token,'b'.repeat(64));await anon.close();
 console.log('PASS: phone/email search, canonical request, selected contact matching without names, no duplicate profiles, manual WhatsApp/SMS invite, proximity, privacy controls, invitation resume and anonymous signup link persistence. No real accounts/messages/payments.');
}finally{await browser.close();}}run().catch(e=>{console.error(e);process.exitCode=1;});
