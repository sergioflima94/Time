// Actual UI, isolated browser and synthetic backend. No real accounts or messages.
const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.TEST_URL||'http://127.0.0.1:19052',id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const uid=id(1),pid=id(2),venue=id(3),other=id(4),field=id(5),now=new Date().toISOString();
const user={id:uid,aud:'authenticated',role:'authenticated',email:'owner-ui@test.invalid',user_metadata:{name:'Sérgio'},app_metadata:{},identities:[],created_at:now};
const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
const session={access_token:token,refresh_token:'fixture-only',token_type:'bearer',expires_in:3600,user};
const player={id:pid,auth_user_id:uid,name:'Sérgio',favorite_sports:['volei'],is_guest:false,created_at:now};
const venues=[{id:venue,name:'Arena da Vila',owner_player_id:pid,payout_method:'in_person',pix_key:null,access_code:'VILA123',created_at:now},
 {id:other,name:'Espaço de outro cliente',owner_player_id:id(9),payout_method:'in_person',access_code:'OUTRO',created_at:now}];
let populated=false,denied=false,platformOwner=true,ownVenues=true,remote=0,writes=0;
const program={id:id(6),establishment_id:venue,name:'Vôlei depois do trabalho',sport_id:'volei',format:'group',field_id:field,coach_id:id(7),level:'Iniciante',capacity:12,duration_minutes:60,active:true,monthly_cents:18000,drop_in_cents:3500,swaps_enabled:true,makeups_enabled:true,cutoff_hours:12,makeup_days:30,can_manage:false,can_price:false,venue_name:'Arena da Vila',coach_name:'Professora Ana',sessions:[{id:id(8),program_id:id(6),starts_at:new Date(Date.now()+86400000*3).toISOString(),ends_at:new Date(Date.now()+86400000*3+3600000).toISOString(),status:'open',occupied:5}]};
const empty=()=>({programs:[],seats:[],bills:[],swaps:[],credits:[],notices:[]});
async function run(){const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});let page;try{
 const ctx=await browser.newContext({viewport:{width:390,height:844}});await ctx.routeWebSocket('**/*',ws=>ws.close());
 await ctx.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.hostname==='127.0.0.1')return route.continue();
  if(!url.hostname.endsWith('.supabase.co')){remote++;return route.abort();}
  const fn=url.pathname.split('/').pop(),body=req.postData()?req.postDataJSON():{};let json=[];
  if(!url.pathname.includes('/rpc/')&&url.pathname.startsWith('/rest/v1/')&&req.method()!=='GET')writes++;
  if(fn==='token')json=session;else if(fn==='user')json=user;
  else if(fn==='players')json=url.searchParams.has('auth_user_id')?player:[player];
  else if(fn==='player_profiles_snapshot')json=[player];
  else if(fn==='platform_configuration')json={settings:{discoveryEnabled:true,sponsoredEnabled:false}};
  else if(fn==='commercial_access_snapshot')json={role:platformOwner?'owner':null,licenses:[],agreements:[]};
  else if(fn==='establishments')json=ownVenues?venues:[venues[1]];
  else if(fn==='fields')json=[{id:field,name:'Quadra poliesportiva',establishment_id:venue,sport_id:'volei',sport_ids:['volei','futvolei'],hourly_price:100}];
  else if(fn==='growth_snapshot')json={venues:[],buddies:[],slots:[],windows:[],requests:[]};
  else if(fn==='academy_snapshot'){
   if(denied)return route.fulfill({status:403,json:{message:'OPERAÇÃO: Sem acesso.'}});
   json=populated?{...empty(),programs:[program],bills:[{id:id(30),program_id:program.id,player_id:pid,plan:'monthly',competence:'2026-10-01',amount_cents:18000,status:'pending',name:'Sérgio',paid_at:null}]}:empty();
  }else if(fn==='venue_snapshot')json=body.p_venue?{id:venue,name:'Arena da Vila',owner:true,capabilities:['pdv','live','reservations','cash','classes','class_prices','reports','kitchen'],fields:[{id:field,name:'Quadra poliesportiva'}],coaches:[],occupancy:[],bookings:[],incidents:[],server_time:now,open_tabs:0,kitchen_orders:0,food_received_cents:0,classes_cash_cents:0}:{venues:ownVenues?[{id:venue,name:'Arena da Vila',owner:true}]:[]};
  return route.fulfill({json});
 });
 page=await ctx.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/login');await page.getByPlaceholder('voce@email.com').fill(user.email);await page.getByPlaceholder('••••••••').fill('fixture-password');await page.getByRole('button',{name:'Entrar',exact:true}).click();await require('./ui-test-consent.cjs')(page);
 const out='.test-runtime/owner-workspace-prints';fs.mkdirSync(out,{recursive:true});
 for(const width of [320,390,768,1024,1366,1920]){
  await page.setViewportSize({width,height:width>=1024?900:844});
  for(const [route,label,slug]of [['/aulas','Aulas esportivas','aulas'],['/estabelecimento','Meus estabelecimentos','estabelecimentos'],['/operacao','Seus espaços de trabalho','acessos'],[`/estabelecimento/${venue}`,'Painel do estabelecimento','painel'],[`/operacao/ao-vivo?establishmentId=${venue}`,'Operação ao vivo','operacao']]){
   await page.goto(base+route,{waitUntil:'networkidle'});await page.getByText(label,{exact:true}).last().waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' overflow '+width);
   if(width<600)for(const button of await page.getByTestId('workspace-actions').getByRole('button').all()){
    const box=await button.boundingBox();assert(box&&box.x>=18&&box.x+box.width<=width-18,'Header action crosses the mobile content gutter: '+route+' at '+width);
   }
   if([390,1366].includes(width))await page.screenshot({path:`${out}/${slug}-${width}.png`});
   if(route==='/aulas'){
    await page.getByText('Novas turmas vão aparecer aqui',{exact:true}).waitFor();
    await page.getByRole('radio',{name:'Minhas aulas',exact:true}).click();await page.getByText('Você ainda não reservou uma aula',{exact:true}).waitFor();
    await page.getByRole('radio',{name:'Trocas e reposições',exact:true}).click();await page.getByText('Nenhuma troca pendente',{exact:true}).waitFor();
    await page.getByRole('radio',{name:'Pagamentos',exact:true}).click();await page.getByText('Nenhuma cobrança nesta consulta',{exact:true}).waitFor();
   }
  }
 }
 await page.setViewportSize({width:390,height:844});populated=true;
 await page.goto(base+'/aulas');await page.getByText(program.name,{exact:true}).waitFor();
 await page.getByPlaceholder('Nome, espaço ou nível').fill('futebol');await page.getByText('Nenhuma turma encontrada',{exact:true}).waitFor();await page.getByRole('button',{name:'Limpar busca'}).click();await page.getByText(program.name,{exact:true}).waitFor();
 await page.screenshot({path:out+'/aulas-turma-390.png',fullPage:true});
 await page.getByRole('radio',{name:'Pagamentos',exact:true}).click();await page.getByText('R$ 180,00 · Mensal 2026-10',{exact:true}).waitFor();
 denied=true;await page.getByRole('button',{name:'Atualizar aulas',exact:true}).click();await page.getByText('Sem acesso.',{exact:true}).waitFor();assert.equal(await page.getByText('R$ 180,00 · Mensal 2026-10',{exact:true}).count(),0);denied=false;
 // Platform owner: commercial benefits, own operation, no implicit customer ownership.
 await page.goto(base+'/admin');await page.getByText('Gestão de campos e quadras',{exact:true}).waitFor();
 await page.getByText('Gestão de campos e quadras',{exact:true}).locator('..').getByRole('button',{name:'Meus estabelecimentos',exact:true}).click();
 await page.getByText('Acesso completo da sua conta',{exact:true}).waitFor();assert.equal(await page.getByText('Espaço de outro cliente',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Gerenciar espaço',exact:true}).click();await page.getByText('Painel do estabelecimento',{exact:true}).waitFor();
 await page.goto(base+`/estabelecimento/${other}`);await page.getByText('Você não é dono deste estabelecimento.',{exact:true}).waitFor();assert.equal(await page.getByText('Dados do estabelecimento',{exact:true}).count(),0);
 ownVenues=false;await page.goto(base+'/estabelecimento');await page.getByRole('button',{name:'Cadastrar meu espaço',exact:true}).click();await page.getByText('Cadastrar estabelecimento',{exact:true}).first().waitFor();
 await page.getByText('Nome',{exact:true}).locator('..').locator('input').fill('Meu novo espaço');await page.getByRole('radio',{name:'Combinar na hora',exact:true}).click();assert(await page.getByRole('button',{name:'Cadastrar estabelecimento',exact:true}).isEnabled());
 platformOwner=false;await page.reload();await page.getByText('Seu primeiro espaço começa aqui',{exact:true}).waitFor();assert.equal(await page.getByText('Acesso completo da sua conta',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert.equal(remote,0);assert.equal(writes,0);
 console.log('PASS: 5 workspace routes × 6 widths, four academy tabs/empty/search/error states, payments, owner entry without a team, own-venue navigation, customer isolation, signup available and no false free benefit for ordinary users. No real traffic or writes.');
}catch(e){if(page){await page.screenshot({path:'.test-runtime/owner-workspace-prints/failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-2200));}throw e;}finally{await browser.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
