// Disposable in-memory database only. Never deletes a production account.
const { PGlite } = require('../.test-runtime/node_modules/@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const db=new PGlite(), q=async(s,a=[]) => (await db.query(s,a)).rows;
const users=[randomUUID(),randomUUID(),randomUUID()];
async function who(id,role='authenticated') {await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id??'',role]);await db.exec(`set role ${role}`);}
async function run(){try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
 create function vault.create_secret(secret text) returns uuid language plpgsql as $$declare k uuid:=gen_random_uuid();begin insert into vault.decrypted_secrets values(k,secret);return k;end$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 grant usage on schema public,auth to authenticated,anon,service_role;grant execute on all functions in schema auth to authenticated,anon,service_role;`);
 for(const f of fs.readdirSync(path.resolve('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync(path.resolve('supabase/migrations',f),'utf8').replace(/^create extension if not exists .*;\r?$/gm,''));
 for(const id of users) await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,id+'@test.invalid']);
 await q("insert into platform_admin_accounts(auth_user_id,role) values($1,'support')",[users[2]]);
 await who(users[0]);
 const call=a=>q('select account_deletion_self($1) value',[a]).then(r=>r[0].value);
 assert.equal(await call('status'),null);
 const requested=await call('request');assert.equal(requested.status,'requested');
 assert.equal((await call('request')).id,requested.id,'Retry must reuse the original request and deadline');
 assert.ok(new Date(requested.expectedBy).getTime()>Date.now());
 await assert.rejects(q('select * from account_deletion_requests'),/permission denied/);
 await assert.rejects(q("select account_deletion_admin(null,'list')"),/Acesso restrito/);
 await who(users[1]);assert.equal(await call('status'),null,'Another account cannot read the receipt');
 await who(users[0]);assert.equal((await call('cancel')).status,'cancelled');
 const second=await call('request');assert.notEqual(second.id,requested.id);
 await who(users[2]);
 const items=(await q("select account_deletion_admin(null,'list') value"))[0].value;assert.equal(items.length,1);
 await q("select account_deletion_admin($1,'process')",[second.id]);
 await assert.rejects(q("select account_deletion_admin($1,'completed')",[second.id]),/Ação inválida/);
 await who(users[0]);assert.equal((await call('status')).status,'processing');
 await assert.rejects(call('cancel'),/processamento já começou/);
 await assert.rejects(call('completed'),/Ação inválida/);
 await db.exec('reset role');
 assert.equal((await q('select count(*)::int n from auth.users'))[0].n,3,'Requesting deletion does not delete any user');
 assert.equal((await q("select count(*)::int n from platform_admin_audit where action='account_deletion_processing'"))[0].n,1);
 // Even suspended accounts retain access to their privacy request.
 const p=(await q('select id from players where auth_user_id=$1',[users[0]]))[0].id;
 await q("insert into platform_account_controls(player_id,suspended,reason) values($1,true,'fixture suspension')",[p]);
 await who(users[0]);assert.equal((await call('status')).status,'processing');
 await who(null,'anon');await assert.rejects(call('request'),/permission denied/);
 console.log('PASS: private in-app deletion receipts, idempotent requests, cancellation, audited support queue, suspended-user access, no false completion or real erasure.');
}finally{await db.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
