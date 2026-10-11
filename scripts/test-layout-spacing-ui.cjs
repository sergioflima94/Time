// Production bundle, mocked backend only: no real accounts, reservations or payments.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.TEST_URL||'http://localhost:19019';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const uid=id(1),pid=id(2),team=id(3),venue=id(4),field=id(5),slot=id(6);
const created='2026-10-01T10:00:00Z';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'layout@test.invalid',app_metadata:{},user_metadata:{name:'Validação visual'},identities:[],created_at:created};
const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test-signature`;
const player={id:pid,auth_user_id:uid,name:'Validação visual',nickname:null,phone:null,avatar_url:null,card_background_url:null,preferred_position:'line',favorite_sports:['futebol'],premium_since:null,premium_until:null,premium_auto_renew:false,free_agent_opt_in:false,free_agent_availability:[],is_guest:false,created_at:created};
const session={access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user};
const opportunity={id:slot,field_id:field,field_name:'Arena de teste',establishment_id:venue,address:'Bairro Centro',sport_id:'futebol',sport_ids:['futebol','volei'],starts_at:'2099-12-20T21:00:00Z',duration_minutes:60,regular_price:200,offer_price:150,active:true};
const window={id:id(7),pelada_id:id(8),team_name:'Time visitante de teste',sport_id:'futebol',starts_at:'2099-12-20T20:00:00Z',ends_at:'2099-12-20T23:00:00Z',level:'all',active:true};
async function run(){
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await ctx.newPage();page.setDefaultTimeout(12000);
  const errors=[],actions=[];let populated=false,optionCount=2;
  const teamIds=()=>Array.from({length:optionCount},(_,i)=>i===0?team:id(10+i));
  const teamName=t=>t===team?'Time de teste':t===id(11)?'Turma dos amigos do futebol de sábado à tarde no bairro Centro':t===id(14)?'Atlético Olímpia':`Time ${t.slice(-2)}`;
  page.on('pageerror',e=>errors.push({route:page.url(),message:e.message,stack:e.stack}));
  await ctx.routeWebSocket(/supabase\.co/,ws=>ws.close());
  await ctx.route('https://*.supabase.co/**',async route=>{
   const url=new URL(route.request().url()),headers={'content-type':'application/json','access-control-allow-origin':'*','x-supabase-api-version':'2024-01-01'};
   let json=[];
   if(url.pathname.endsWith('/token'))json=session;
   else if(url.pathname.endsWith('/user'))json=user;
   else if(url.pathname.endsWith('/players'))json=url.searchParams.has('auth_user_id')?player:[player];
   else if(url.pathname.endsWith('/peladas'))json=teamIds().map(t=>({id:t,name:teamName(t),description:null,sport_id:'futebol',football_variant:'society',default_match_minutes:10,default_max_players:12,default_players_per_team:6,default_draw_method:'rating',invite_code:t===team?'TESTTEAM':`TEST${t}`,created_by:pid,created_at:created}));
   else if(url.pathname.endsWith('/pelada_memberships'))json=teamIds().map(t=>({pelada_id:t,player_id:pid,role:'admin',active:true,joined_at:created}));
   else if(url.pathname.endsWith('/establishments'))json=Array.from({length:optionCount>3?optionCount:1},(_,i)=>({id:i===0?venue:id(70+i),owner_player_id:pid,name:i===0?'Arena de teste':`Estabelecimento ${i+1}`,payout_method:'in_person',access_code:`TESTARENA${i}`,created_at:created}));
   else if(url.pathname.endsWith('/fields'))json=Array.from({length:optionCount>3?optionCount:1},(_,i)=>({id:i===0?field:id(50+i),establishment_id:venue,pelada_id:team,name:i===0?'Arena de teste':`Quadra ${i+1}`,sport_id:'futebol',sport_ids:['futebol','volei'],address:'Bairro Centro',created_at:created}));
   else if(url.pathname.endsWith('/platform_configuration'))json={settings:{discoveryEnabled:true,referralsEnabled:true,sponsoredEnabled:false,bookingCommissionPercent:0,whatsappMonthlyAllowance:100,trialDays:14}};
   else if(url.pathname.endsWith('/commercial_access_snapshot'))json={role:null,licenses:[],agreements:[]};
   else if(url.pathname.endsWith('/growth_snapshot'))json={venues:[],buddies:[],slots:populated?[opportunity]:[],windows:populated?[window]:[],requests:populated?[{id:id(9),slot_id:slot,pelada_id:team,team_name:'Time de teste',opponent_pelada_id:null,opponent_name:null,opponent_accepted:false,status:'pending',price:150,commission_percent:5,field_name:'Arena de teste',starts_at:opportunity.starts_at,match_id:null}]:[],onboarding:{persona:'team',completed:true,suggestions_enabled:false}};
   else if(url.pathname.endsWith('/growth_action')){actions.push(route.request().postDataJSON());json={};}
   else if(url.pathname.endsWith('/friend_discovery'))json={byPhone:false,byEmail:false,nearby:false,locationFresh:false};
   else if(url.pathname.endsWith('/list_open_games'))json=[{gameId:id(10),teamName:'Time aberto de teste',sportId:'futebol',fieldName:'Arena de teste',address:'Bairro Centro',scheduledAt:opportunity.starts_at,durationMinutes:60,maxPlayers:12,fieldCost:150,confirmedCount:8,level:'all',description:'Uma partida para conhecer a turma.',requestStatus:null}];
   else if(url.pathname.endsWith('/read_activity_history'))json={entries:[],hasMore:false};
   else if(url.pathname.endsWith('/search_field_directory'))json={entries:[],total:0};
   await route.fulfill({status:200,headers,json});
  });
  const out=path.resolve('.test-runtime/layout-spacing');fs.mkdirSync(out,{recursive:true});
  async function shot(name){await page.evaluate(()=>{document.querySelectorAll('*').forEach(el=>{if(el.scrollHeight>el.clientHeight&&/auto|scroll/.test(getComputedStyle(el).overflowY))el.scrollTop=0;});});await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true});}
  async function fits(){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');}
  async function gap(locator,min){assert(await locator.evaluate((el,n)=>parseFloat(getComputedStyle(el).rowGap)>=n,min),'missing vertical gap');}
  await page.goto(base+'/login');await page.getByPlaceholder('voce@email.com').fill(user.email);await page.getByPlaceholder('••••••••').fill('test-password');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(base+'/');
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:width===1280?900:844});
   await page.goto(base+'/bora?teamId='+team);await page.getByText('Ainda não há horários publicados',{exact:true}).waitFor();
   await gap(page.getByText('Horários e desafios',{exact:true}).locator('..'),8);
   await gap(page.getByText('Encontre um horário',{exact:true}).locator('..'),12);
   const chip=await page.getByRole('button',{name:'Time de teste',exact:true}).boundingBox(),label=await page.getByText('Campo ou bairro',{exact:true}).boundingBox();
   assert(label.y-chip.y-chip.height>=11,'team selector touches search label');
   const longChip=await page.getByRole('button',{name:'Turma dos amigos do futebol de sábado à tarde no bairro Centro',exact:true}).boundingBox();assert(longChip.x+longChip.width<=width-18,'long team name overflows');
   await fits();await shot(`horarios-vazio-${width}`);
  }
  await page.setViewportSize({width:390,height:844});populated=true;
  await page.getByRole('button',{name:'Atualizar horários',exact:true}).click();await page.getByText('Horários disponíveis (1)',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Time de teste',exact:true}).click();await page.getByRole('button',{name:'Pedir reserva para meu time',exact:true}).click();
  assert(actions.some(a=>a.p_action==='slot_request'&&a.p_data.teamId===team&&a.p_data.slotId===slot));
  await page.getByPlaceholder('Nome da arena ou região').fill('não existe');await page.getByText('Nenhum horário neste filtro',{exact:true}).waitFor();
  await page.getByPlaceholder('Nome da arena ou região').fill('');await shot('horarios-oferta-390');
  await page.getByRole('button',{name:'Publicar',exact:true}).click();await page.getByText('Meu campo tem horário vago',{exact:true}).waitFor();
  await page.getByPlaceholder('2026-10-20').fill('2099-12-21');await page.getByRole('button',{name:'Publicar janela do time',exact:true}).click();
  assert(actions.some(a=>a.p_action==='window_create'&&a.p_data.teamId===team));
  await fits();await shot('horarios-publicar-390');
  await page.getByRole('button',{name:'Meus pedidos',exact:true}).click();await page.getByRole('button',{name:'Confirmar horário',exact:true}).waitFor();await fits();await shot('horarios-pedidos-390');
  for(const width of [320,390]){await page.setViewportSize({width,height:844});
  for(const [route,heading] of [['/comecar','Como você quer começar?'],['/descobrir','Bora jogar?'],['/central','Central do esporte'],['/times','Times'],['/amigos','Encontre sua turma'],['/campos','Campos perto de você'],['/admin','Administração'],['/estabelecimento','🏟️ Meus estabelecimentos'],['/operacao/cardapio','Cardápio']]){
   await page.goto(base+route);await page.getByText(heading,{exact:true}).first().waitFor();await fits();await shot(route.slice(1).replaceAll('/','-')+'-'+width);
   if(route==='/descobrir')await gap(page.getByRole('button',{name:'Quero participar',exact:true}).locator('..'),8);
   if(route==='/admin'){const longName=await page.getByText('⚽ Turma dos amigos do futebol de sábado à tarde no bairro Centro',{exact:true}).boundingBox();assert(longName.x+longName.width<=width-18,'admin name clipped');}
   if(route==='/operacao/cardapio'){
    const label=await page.getByText('Nome',{exact:true}).nth(1).boundingBox(),input=await page.getByPlaceholder('Espetinho de linguiça').boundingBox();assert(input.y-label.y-label.height>=3,'label touches input');
   }
  }}
  // The same controls switch to a searchable modal with larger local datasets.
  optionCount=3;await page.goto(base+'/bora?teamId='+team);
  await page.getByRole('button',{name:'Time de teste',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Trocar: Escolher time solicitante',exact:true}).count(),0);
  optionCount=4;await page.goto(base+'/bora?teamId='+team);await page.getByRole('button',{name:'Trocar: Escolher time solicitante',exact:true}).waitFor();
  optionCount=20;
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:width===1280?900:844});
   await page.goto(base+'/bora?teamId='+team);await page.getByRole('button',{name:'Trocar: Escolher time solicitante',exact:true}).waitFor();
   await page.getByPlaceholder('Nome da arena ou região').fill('Centro');
   await page.getByRole('button',{name:'Trocar: Escolher time solicitante',exact:true}).click();
   const dialog=page.getByRole('dialog');await dialog.waitFor();
   const search=page.getByLabel('Pesquisar: Escolher time solicitante',{exact:true});
   await search.fill('nada encontrado');await page.getByText('Nenhum resultado. Tente outro nome ou limpe a busca.',{exact:true}).waitFor();
   assert(await page.getByRole('button',{name:'Confirmar seleção',exact:true}).isDisabled());
   await search.fill('atletico olimpia');await page.getByRole('radio',{name:'Atlético Olímpia',exact:true}).click();
   await shot(`selecao-time-modal-${width}`);await fits();
   await page.getByRole('button',{name:'Cancelar',exact:true}).click();await dialog.waitFor({state:'hidden'});
   assert.equal(await page.getByPlaceholder('Nome da arena ou região').inputValue(),'Centro');
   await page.getByText('Time de teste',{exact:true}).first().waitFor();
   await page.getByRole('button',{name:'Trocar: Escolher time solicitante',exact:true}).click();
   await search.fill('olimpia');await page.getByRole('radio',{name:'Atlético Olímpia',exact:true}).click();
   await page.getByRole('button',{name:'Confirmar seleção',exact:true}).click();await dialog.waitFor({state:'hidden'});
   await page.getByRole('button',{name:'Trocar: Escolher time solicitante',exact:true}).getByText('Atlético Olímpia',{exact:true}).waitFor();assert.equal(await page.getByPlaceholder('Nome da arena ou região').inputValue(),'Centro');
   await page.getByRole('button',{name:'Trocar: Escolher time solicitante',exact:true}).click();await dialog.waitFor();
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   await shot(`selecao-time-fechada-${width}`);
  }
  await page.getByRole('button',{name:'Publicar',exact:true}).click();
  await page.getByRole('button',{name:'Trocar: Escolher campo da oportunidade',exact:true}).click();
  await page.getByLabel('Pesquisar: Escolher campo da oportunidade',{exact:true}).fill('Quadra 8');
  await page.getByRole('radio',{name:'Quadra 8',exact:true}).click();await page.getByRole('button',{name:'Confirmar seleção',exact:true}).click();await page.getByRole('button',{name:'Trocar: Escolher campo da oportunidade',exact:true}).getByText('Quadra 8',{exact:true}).waitFor();
  await page.goto(base+'/admin');await page.getByRole('button',{name:'Trocar: Escolher time para administrar',exact:true}).click();
  await page.getByLabel('Pesquisar: Escolher time para administrar',{exact:true}).fill('olimpia');await page.getByRole('radio',{name:'⚽ Atlético Olímpia',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar seleção',exact:true}).click();assert.equal(await page.getByPlaceholder('Ex: Pelada dos Amigos - Quintas').inputValue(),'Atlético Olímpia');
  await page.goto(base+'/estabelecimento/'+venue);await page.getByRole('button',{name:'Trocar: Trocar de estabelecimento',exact:true}).click();
  await page.getByRole('button',{name:'Ver todos / cadastrar novo',exact:true}).waitFor();
  await page.getByLabel('Pesquisar: Trocar de estabelecimento',{exact:true}).fill('Estabelecimento 8');
  await page.getByRole('radio',{name:'Estabelecimento 8',exact:true}).click();await page.getByRole('button',{name:'Confirmar seleção',exact:true}).click();
  await page.waitForURL(base+'/estabelecimento/'+id(77));
  assert.deepEqual(errors,[]);console.log('PASS: responsive spacing, inline small lists, searchable modal with 20 teams/fields, accent-insensitive search, no results, cancel/Escape, explicit confirmation, unchanged filters; reservation/admin/owner selections. Backend intercepted.');
 }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
