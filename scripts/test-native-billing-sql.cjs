const { PGlite } = require('../.test-runtime/node_modules/@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const db=new PGlite(),q=async(s,a=[]) => (await db.query(s,a)).rows;
const users=[randomUUID(),randomUUID()];
async function who(id,role='authenticated') {await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id??'',role]);await db.exec(`set role ${role}`);}
async function run(){try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
    create function vault.create_secret(secret text) returns uuid language plpgsql as $$declare k uuid:=gen_random_uuid();begin insert into vault.decrypted_secrets values(k,secret);return k;end$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    grant usage on schema public,auth to authenticated,anon,service_role;grant execute on all functions in schema auth to authenticated,anon,service_role;`);
  for(const f of fs.readdirSync(path.resolve('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.resolve('supabase/migrations',f),'utf8').replace(/^create extension if not exists .*;\r?$/gm,''));
  for(const id of users)await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${id}@test.invalid`]);
  const p=(await q('select id from players where auth_user_id=$1',[users[0]]))[0].id;
  const plan=(await q("select id from commercial_plans where audience='player' limit 1"))[0].id;
  const finish=new Date(Date.now()+86400000).toISOString(),since=new Date(Date.now()-86400000).toISOString();
  let seq=Date.now()-10000;
  const apply=(active=true,renew=true,time=++seq)=>q('select apply_native_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9)',[users[0],plan,new Date(time).toISOString(),'play_store','premium.monthly',active?finish:new Date().toISOString(),since,renew,active]);
  await who(users[0]);
  await assert.rejects(q('select * from native_app_subscriptions'),/permission denied/);
  await assert.rejects(apply(),/permission denied/);
  let state=(await q('select native_subscription_status() s'))[0].s;assert.equal(state.canPurchase,true);assert.equal(state.active,false);
  await who(null,'service_role');await apply();await apply(true,true,seq); // same snapshot idempotent
  await db.exec('reset role');
  const agreement=(await q("insert into platform_commercial_agreements(audience,target_id,plan_id,kind,status,list_monthly_price,agreed_monthly_price,duration_months,expires_at,created_by) values('player',$1,$2,'price','accepted',14.90,9.90,3,now()+interval '1 day',$3) returning id",[p,plan,users[0]]))[0].id;
  await who(users[0]);state=(await q('select native_subscription_status() s'))[0].s;assert.equal(state.active,true);assert.equal(state.canPurchase,false);
  await assert.rejects(q("select prepare_commercial_checkout($1,'monthly-manual-v1')",[agreement]),/assinatura ativa na loja/);
  const access=(await q('select commercial_access_snapshot() s'))[0].s;
  assert.equal(access.licenses[0].paymentSource,'play_store');assert.equal(access.licenses[0].targetId,p);
  await who(users[1]);assert.equal((await q('select commercial_access_snapshot() s'))[0].s.licenses.length,0);assert.equal((await q('select native_subscription_status() s'))[0].s.active,false);
  await who(null,'service_role');await apply(true,false);await apply(false,false,seq-1000); // stale revocation ignored
  await who(users[0]);assert.equal((await q('select native_subscription_status() s'))[0].s.active,true);assert.equal((await q('select native_subscription_status() s'))[0].s.autoRenew,false);
  await who(null,'service_role');await apply(false,false);await apply(true,true,seq-1); // stale renewal cannot revive refund
  await who(users[0]);state=(await q('select native_subscription_status() s'))[0].s;assert.equal(state.active,false);assert.equal(state.canPurchase,true);
  assert.equal((await q('select commercial_access_snapshot() s'))[0].s.licenses.length,0);
  await db.exec('reset role');
  await q("insert into platform_commercial_agreements(audience,target_id,plan_id,kind,status,list_monthly_price,agreed_monthly_price,created_by) values('player',$1,$2,'license','granted',14.90,0,$3)",[p,plan,users[1]]);
  await who(users[0]);assert.equal((await q('select native_subscription_status() s'))[0].s.canPurchase,false,'Free administrative grant survives store revocation and blocks redundant purchase');
  await q("select prepare_commercial_checkout($1,'monthly-manual-v1')",[agreement]);
  assert.equal((await q('select native_subscription_status() s'))[0].s.canPurchase,false,'Pending web order blocks native purchase');
  await who(null,'service_role');
  for(let i=0;i<12;i++)assert.equal((await q('select claim_native_sync($1) ok',[users[0]]))[0].ok,true);
  assert.equal((await q('select claim_native_sync($1) ok',[users[0]]))[0].ok,false);
  await assert.rejects(q('select apply_native_subscription($1,$2,now(),null,null,null,null,true,true)',[users[0],plan]),/incompatível/);
  // No proof for a new account must not destroy unrelated data or create revenue.
  await q('select apply_native_subscription($1,$2,now(),null,null,null,null,false,false)',[users[1],plan]);
  assert.equal((await q('select count(*)::int n from native_app_subscriptions'))[0].n,1);
  await db.exec('reset role');
  assert.equal((await q('select count(*)::int n from commercial_subscriptions'))[0].n,0);
  assert.equal((await q('select count(*)::int n from sale_payments'))[0].n,0);
  assert.equal((await q('select count(*)::int n from venue_credit_payments'))[0].n,0);
  console.log('PASS: native subscription private storage/service-only writes, account scope, duplicate/stale proofs, cancel vs revoke, no invented venue revenue, rate limits.');
  await require('./whatsapp-settings-cases.cjs')(db,users);
}finally{await db.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
