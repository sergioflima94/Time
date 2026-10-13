// Explicitly authorized store-review setup. Never run as a migration or app code.
// Secrets are kept only in the ignored local runtime folder, never printed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {createClient}=require('@supabase/supabase-js');
const project='oyhbmbstsiagwljatawq',url=`https://${project}.supabase.co`,email='revisao.lojas@marcoujogou.com.br';
const dest=path.resolve('.test-runtime/store-release/review-account.json');
let stage='credentials';
const id=label=>{const s=crypto.createHash('sha256').update(`marcoujogou:store-review:v1:${label}`).digest('hex').slice(0,32);return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;};
async function checked(result){const {data,error}=await result;if(error)throw new Error('Backend operation failed');return data;}
async function run(){
 const raw=cp.execFileSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',`npx supabase projects api-keys --project-ref ${project} --reveal --output json`],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
 const keys=JSON.parse(raw),secret=keys.find(k=>k.name==='service_role')?.api_key,pub=keys.find(k=>k.type==='publishable')?.api_key;
 assert(secret&&pub,'Project keys unavailable');
 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 const admin=createClient(url,secret,options);let account;
 stage='account-inspection';
 if(fs.existsSync(dest)){
  account=JSON.parse(fs.readFileSync(dest,'utf8'));assert.equal(account.email,email);assert.equal(account.project,project);
  const {data:{user},error}=await admin.auth.admin.getUserById(account.authUserId);assert(!error&&user?.email===email);
 }else{
  // Abort rather than change an existing account's password or permissions.
  for(let page=1;;page++){const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});assert(!error);assert(!data.users.some(u=>u.email?.toLowerCase()===email),'Existing review account needs its original local credential file');if(data.users.length<1000)break;}
  stage='create-review-account';const password=crypto.randomBytes(30).toString('base64url')+'!aA9';
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Revisão das Lojas',preferred_position:'line',favorite_sports:['futebol','volei']}});
  assert(!error&&data.user);account={project,email,password,authUserId:data.user.id,createdAt:new Date().toISOString()};
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(account,null,2),{mode:0o600,flag:'wx'});
 }
 stage='verify-no-platform-admin';
 const admins=await checked(admin.from('platform_admin_accounts').select('role').eq('auth_user_id',account.authUserId));assert.equal(admins.length,0);
 const player=await checked(admin.from('players').select('id').eq('auth_user_id',account.authUserId).single());
 const team=id('team'),venue=id('venue'),field=id('field:0'),game=id('game');
 async function insert(table,rows,onConflict='id'){await checked(admin.from(table).upsert(rows,{onConflict,ignoreDuplicates:true}));}
 stage='isolated-demo-resources';
 await insert('peladas',{id:team,name:'[REVISÃO] Time de Demonstração',description:'Dados fictícios exclusivos da revisão das lojas. Sem mensagens ou cobranças automáticas.',sport_id:'futebol',football_variant:'society',invite_code:'STORE'+crypto.createHash('sha256').update(team).digest('hex').slice(0,10).toUpperCase(),created_by:player.id,default_max_players:12});
 await insert('pelada_memberships',{pelada_id:team,player_id:player.id,role:'admin',active:true},'pelada_id,player_id');
 await insert('establishments',{id:venue,name:'[REVISÃO] Arena de Demonstração',owner_player_id:player.id,payout_method:'in_person',access_code:'STORE'+crypto.createHash('sha256').update(venue).digest('hex').slice(0,10).toUpperCase(),whatsapp_opt_in:false});
 const sports=['futebol','volei','basquete'];
 await insert('fields',sports.map((sport,n)=>({id:id('field:'+n),pelada_id:n===0?team:null,establishment_id:venue,name:'[REVISÃO] '+['Campo Society','Quadra de Vôlei','Quadra de Basquete'][n],sport_id:sport,sport_ids:[sport],address:'Demonstração fictícia — não visitar',notes:'Não publicado no diretório; nenhum agendamento ou pagamento real.',created_by:player.id})));
 const guests=Array.from({length:11},(_,i)=>({id:id('guest:'+i),name:'[REVISÃO] Jogador '+(i+1),is_guest:true,preferred_position:i<2?'goalkeeper':'line',favorite_sports:['futebol']}));
 await insert('players',guests);await insert('pelada_memberships',guests.map(g=>({pelada_id:team,player_id:g.id,role:'member',active:true})),'pelada_id,player_id');
 await insert('games',{id:game,pelada_id:team,field_id:field,scheduled_at:new Date(Date.now()+7*86400000).toISOString(),status:'open',max_players:12,players_per_team:6,match_minutes:10,duration_minutes:90,field_cost:0,created_by:player.id});
 await insert('attendances',[player,...guests].map((p,i)=>({id:id('attendance:'+i),game_id:game,player_id:p.id,status:'confirmed',confirmed_order:i+1,responded_at:new Date().toISOString()})));
 stage='test-review-login-and-permissions';
 const reviewer=createClient(url,pub,options);const login=await reviewer.auth.signInWithPassword({email,password:account.password});assert(!login.error&&login.data.user?.id===account.authUserId);
 const access=await checked(reviewer.rpc('commercial_access_snapshot'));assert.equal(access.role,null);
 const forbidden=await reviewer.rpc('platform_console_snapshot',{p_query:''});assert(forbidden.error,'Platform console must be denied');
 const memberships=await checked(reviewer.from('pelada_memberships').select('pelada_id').eq('player_id',player.id));assert(memberships.every(m=>m.pelada_id===team));
 const privateGames=await checked(reviewer.from('games').select('id'));assert(privateGames.some(g=>g.id===game));assert(privateGames.every(g=>g.id===game));
 const pay=await checked(reviewer.from('payments').select('id'));assert.equal(pay.length,0);
 const directory=await checked(admin.from('field_directory_entries').select('id').in('field_id',sports.map((_,i)=>id('field:'+i))));assert.equal(directory.length,0);
 await reviewer.auth.signOut({scope:'local'});
 account.playerId=player.id;account.teamId=team;account.establishmentId=venue;account.gameId=game;account.verifiedAt=new Date().toISOString();
 fs.writeFileSync(dest,JSON.stringify(account,null,2),{mode:0o600});
 console.log('PASS: restricted reviewer created/verified; confirmed-email password login; own demo team and 3 sports; no platform role, no other team games/payments, no directory publication, charges or messages. Credentials saved only in ignored runtime storage.');
}
run().catch(()=>{console.error('Review provisioning not confirmed at stage: '+stage+'. No credentials or backend error bodies were printed. Inspect before retry.');process.exitCode=1;});
