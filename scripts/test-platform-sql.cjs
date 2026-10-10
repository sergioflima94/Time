// Local PostgreSQL (PGlite). No project secrets or production database are used.
// npm install --prefix .test-runtime --no-audit --no-fund @electric-sql/pglite
// node scripts/test-platform-sql.cjs
const { PGlite } = require('../.test-runtime/node_modules/@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const support = '00000000-0000-4000-8000-000000000003';
async function identity(id) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec('set role authenticated');
}
async function fails(query, args, expression) {
  await assert.rejects(() => db.query(query, args),expression);
}
async function run() {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema vault;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text $$;
    grant usage on schema public,auth to authenticated,anon,service_role;
    grant execute on all functions in schema auth to authenticated,anon,service_role;`);
  const schema = process.argv[2];
  const sources = schema ? [path.resolve(schema)] : fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(n=>n.endsWith('.sql')).sort().map(n=>path.join(__dirname,'../supabase/migrations',n));
  for (const source of sources) {
    const sql = fs.readFileSync(source,'utf8')
      .replace(/^create extension if not exists .*;\r?$/gm,'');
    await db.exec(sql);
    console.log(`SQL OK: ${path.basename(source)}`);
  }
  // Supabase normally supplies these baseline grants, then RLS restricts them.
  await db.exec('grant select,insert,update,delete on all tables in schema public to authenticated');
  await db.exec('revoke all on platform_admin_accounts,platform_account_controls,platform_admin_audit,public_game_listings,public_game_join_requests from authenticated');
  await db.exec('revoke insert,update,delete on sport_catalog from authenticated');
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)',[owner,'owner@test.invalid',member,'member@test.invalid',support,'support@test.invalid']);
  await db.query("insert into platform_admin_accounts(auth_user_id,role) values($1,'owner'),($2,'support')",[owner,support]);
  await identity(member);
  await fails('select platform_console_snapshot()',[],/exclusivo/);
  await fails("insert into platform_admin_accounts(auth_user_id,role) values($1,'owner')",[member],/permission denied/);
  await identity(support);
  await fails("select platform_console_action('account',$1,'{}'::jsonb,'teste de acesso')",[member],/Suporte/);
  await identity(owner);
  const snapshot = (await db.query('select platform_console_snapshot() as s')).rows[0].s;
  assert.equal(snapshot.role,'owner');
  await db.exec('reset role');
  const ownerPlayer = (await db.query('select id from players where auth_user_id=$1',[owner])).rows[0].id;
  const memberPlayer = (await db.query('select id from players where auth_user_id=$1',[member])).rows[0].id;
  const supportPlayer = (await db.query('select id from players where auth_user_id=$1',[support])).rows[0].id;
  const teamId = (await db.query("insert into peladas(name,invite_code,created_by) values('Time privado','PRIVATE',$1) returning id",[ownerPlayer])).rows[0].id;
  await db.query("insert into pelada_memberships(pelada_id,player_id,role) values($1,$2,'admin')",[teamId,ownerPlayer]);
  const fieldId = (await db.query("insert into fields(name,address,pelada_id,created_by) values('Arena','Centro',$1,$2) returning id",[teamId,ownerPlayer])).rows[0].id;
  const gameId = (await db.query("insert into games(pelada_id,field_id,created_by,scheduled_at,max_players) values($1,$2,$3,now()+interval '1 day',1) returning id",[teamId,fieldId,ownerPlayer])).rows[0].id;
  await identity(member);
  assert.equal((await db.query('select list_open_games() as games')).rows[0].games.length,0);
  await fails("select publish_open_game($1,true,'all','Teste')",[gameId],/administrador/);
  await identity(owner);
  await db.query("select publish_open_game($1,true,'all','Novos jogadores são bem-vindos')",[gameId]);
  await identity(member);
  const listed = (await db.query('select list_open_games() as games')).rows[0].games;
  assert.equal(listed.length,1); assert.equal(listed[0].teamName,'Time privado'); assert(!('players' in listed[0]));
  assert.equal((await db.query('select request_open_game($1) as status',[gameId])).rows[0].status,'pending');
  await db.query('select request_open_game($1)',[gameId]);
  await identity(support);
  await db.query('select request_open_game($1)',[gameId]);
  await identity(owner);
  const requests = (await db.query('select open_game_admin_data($1) as d',[gameId])).rows[0].d.requests;
  assert.equal(requests.length,2);
  const first = requests.find(r=>r.playerId===memberPlayer); const second = requests.find(r=>r.playerId===supportPlayer);
  await fails('select respond_open_game_request($1,null)',[first.id],/inválida/);
  assert.equal((await db.query('select respond_open_game_request($1,true) as status',[first.id])).rows[0].status,'confirmed');
  assert.equal((await db.query('select respond_open_game_request($1,true) as status',[second.id])).rows[0].status,'waitlist');
  await db.query('select respond_open_game_request($1,true)',[first.id]);
  assert.equal((await db.query("select count(*)::int as n from attendances where game_id=$1 and status='confirmed'",[gameId])).rows[0].n,1);
  await identity(member);
  await fails('select open_game_admin_data($1)',[gameId],/Sem permissão/);
  await identity(owner);
  await fails("select platform_console_action('admin',$1,$2::jsonb,'revogar proprietario')",[owner,JSON.stringify({role:'owner',active:false})],/proprietário ativo/);
  await fails("select platform_console_action('settings',null,'{}'::jsonb,'configurar produto')",[],/Configuração mudou/);
  await fails("select platform_console_action('settings',null,'{\"revision\":1,\"settings\":null}'::jsonb,'configurar produto')",[],/Configuração inválida/);
  const definition = {id:'beach-tennis',label:'Beach Tennis',icon:'🎾',color:'#3366CC',scoreSingular:'ponto',scorePlural:'pontos',hasGoalkeeper:false,suggestedTeamSize:2,active:true,
    rules:{mode:'sets',periodMinutes:15,periods:3,targetPoints:6,winByTwo:true,setsToWin:2,scoreValues:[1]}};
  await db.query('select save_platform_sport($1::jsonb,0,$2)',[JSON.stringify(definition),'Adicionar modalidade de teste']);
  await fails('select save_platform_sport($1::jsonb,0,$2)',[JSON.stringify(definition),'Modificar regra antiga'],/Esporte alterado/);
  await fails('select save_platform_sport($1::jsonb,1,$2)',[JSON.stringify({...definition,rules:{...definition.rules,targetPoints:null}}),'Regras invalidas'],/Alvo/);
  await fails('select save_platform_sport($1::jsonb,1,$2)',[JSON.stringify({...definition,color:'#fff'}),'Cor invalida'],/inválida/);
  const sport = (await db.query('select definition from sport_catalog where id=$1',[definition.id])).rows[0].definition;
  assert.equal(sport.rules.setsToWin,2);
  await identity(member);
  assert.equal((await db.query('select definition from sport_catalog where id=$1',[definition.id])).rows.length,1);
  await fails('select save_platform_sport($1::jsonb,1,$2)',[JSON.stringify(definition),'Jogador alterando esporte'],/Somente/);
  await identity(owner);
  await db.exec('reset role');
  const player = (await db.query('select id from players where auth_user_id=$1',[member])).rows[0].id;
  await identity(owner);
  await db.query("select platform_console_action('account',$1,$2::jsonb,'Suspender conta de teste')",[player,JSON.stringify({suspended:true})]);
  await identity(member);
  assert.equal((await db.query('select platform_account_allowed() as allowed')).rows[0].allowed,false);
  assert.equal((await db.query('select * from players')).rows.length,0);
  await identity(owner);
  await fails('delete from platform_admin_audit',[],/permission denied/);
  const audit = (await db.query('select platform_console_snapshot() as s')).rows[0].s.audit;
  assert(audit.some(a=>a.action==='sport'&&a.targetId==='beach-tennis'));
  console.log('PASS: permissions, NULL validation, last owner, sport revisions, discovery opt-in, approval capacity/idempotency, public read, suspension and immutable audit.');
  await db.close();
}
run().catch(error=>{ console.error(error.message); process.exitCode=1; });
