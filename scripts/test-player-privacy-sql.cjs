// Disposable database only; no production customer records are read or printed.
const {PGlite}=require('../.test-runtime/node_modules/@electric-sql/pglite'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const db=new PGlite(),q=async(s,a=[]) => (await db.query(s,a)).rows,users=[randomUUID(),randomUUID()];
async function who(id,role='authenticated'){await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id??'',role]);await db.exec(`set role ${role}`);}
async function run(){try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
 create function vault.create_secret(secret text) returns uuid language plpgsql as $$declare k uuid:=gen_random_uuid();begin insert into vault.decrypted_secrets values(k,secret);return k;end$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 grant usage on schema public,auth to authenticated,anon,service_role;grant execute on all functions in schema auth to authenticated,anon,service_role;`);
 for(const f of fs.readdirSync(path.resolve('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync(path.resolve('supabase/migrations',f),'utf8').replace(/^create extension if not exists .*;\r?$/gm,''));
 // Hosted Supabase grants table privileges separately from RLS policies.
 await db.exec('grant select on public.players to authenticated,anon');
 for(const id of users)await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,id+'@test.invalid']);
 await q("update players set phone='5511999999999',location_lat=-23.567891,location_lng=-46.678912,free_agent_opt_in=false where auth_user_id=$1",[users[1]]);
 await who(users[0]);assert.equal((await q('select * from players')).length,1);assert.equal((await q('select phone from players where auth_user_id=$1',[users[1]])).length,0);
 let rows=(await q('select player_profiles_snapshot() profiles'))[0].profiles;
 const self=rows.find(p=>p.auth_user_id===users[0]),other=rows.find(p=>p.id!==self.id);assert(self&&other);assert.equal(other.auth_user_id,null);assert.equal(other.phone,null);assert.equal(other.location_lat,null);assert.equal(other.location_lng,null);
 await db.exec('reset role');await q('update players set free_agent_opt_in=true where auth_user_id=$1',[users[1]]);await who(users[0]);
 rows=(await q('select player_profiles_snapshot() profiles'))[0].profiles;const opted=rows.find(p=>p.id===other.id);assert.equal(opted.location_lat,-23.57);assert.equal(opted.location_lng,-46.68);assert.equal(opted.phone,null);
 await who(users[1]);const own=(await q('select player_profiles_snapshot() profiles'))[0].profiles.find(p=>p.auth_user_id===users[1]);assert.equal(own.phone,'5511999999999');assert.equal(own.location_lat,-23.567891);
 await who(null,'anon');await assert.rejects(q('select player_profiles_snapshot()'),/permission denied/);
 await db.exec('reset role');await q("insert into platform_account_controls(player_id,suspended,reason) values($1,true,'synthetic privacy test')",[other.id]);await who(users[1]);await assert.rejects(q('select player_profiles_snapshot()'),/conta ativa/);
 console.log('PASS: direct profiles self-only; explicit public cards/rosters; no other phone/auth ID/exact location; opted-in rounded location; own private fields retained; anonymous/suspended denied. No real customer data.');
}finally{await db.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
