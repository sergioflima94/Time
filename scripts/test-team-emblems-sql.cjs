// Local PostgreSQL only. Synthetic identities; no real uploads, accounts or AI calls.
const { PGlite }=require('../.test-runtime/node_modules/@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const db=new PGlite(),users=[randomUUID(),randomUUID(),randomUUID()];
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
async function who(i,role='authenticated'){await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[i===null?'':users[i]]);await db.exec('set role '+role);}
async function run(){try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
 create function vault.create_secret(secret text) returns uuid language plpgsql as $$declare k uuid:=gen_random_uuid();begin insert into vault.decrypted_secrets values(k,secret);return k;end$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_user::text$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql as $$select string_to_array(name,'/')$$;
 grant usage on schema public,auth,storage to authenticated,anon,service_role;
 grant execute on all functions in schema auth to authenticated,anon,service_role;
 grant select,insert on storage.objects to authenticated,anon,service_role;`);
 for(const f of fs.readdirSync(path.resolve('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync(path.resolve('supabase/migrations',f),'utf8').replace(/^create extension if not exists .*;\r?$/gm,''));
 await db.exec('grant select on public.peladas to authenticated,anon;grant update on public.peladas to authenticated;');
 const migration=fs.readFileSync('supabase/migrations/20261015020000_team_emblems.sql','utf8').replace(/\r/g,'').trim();
 assert(fs.readFileSync('supabase/schema.sql','utf8').replace(/\r/g,'').trim().endsWith(migration));
 for(let i=0;i<3;i++)await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[users[i],`emblem${i}@test.invalid`]);
 const profiles=await q('select id,auth_user_id from players'),p=i=>profiles.find(x=>x.auth_user_id===users[i]).id;
 const team=(await q("insert into peladas(name,invite_code,created_by) values('Time emblema','EMBLEMTEST',$1) returning id",[p(0)]))[0].id;
 const other=(await q("insert into peladas(name,invite_code,created_by) values('Outro time','OTHEREMBLEM',$1) returning id",[p(2)]))[0].id;
 await q("insert into pelada_memberships(pelada_id,player_id,role) values($1,$2,'admin'),($1,$3,'member'),($4,$5,'admin')",[team,p(0),p(1),other,p(2)]);
 const key=`${team}/${users[0]}/${randomUUID()}.png`, missing=`${team}/${users[0]}/${randomUUID()}.png`;
 const set=(key,id=team)=>q('select set_team_emblem($1,$2)',[id,key]);
 await who(0);await assert.rejects(set(missing),/indisponível/);
 await q("insert into storage.objects(bucket_id,name,metadata) values('team-logos',$1,$2)",[key,JSON.stringify({size:100,mimetype:'image/png'})]);
 await set(key);assert.equal((await q('select logo_key from peladas where id=$1',[team]))[0].logo_key,key);
 await assert.rejects(set(key,other),/administradores/);
 await assert.rejects(set('https://evil.invalid/logo.svg'),/inválido/);
 await assert.rejects(q("insert into storage.objects(bucket_id,name,metadata) values('team-logos',$1,'{}')",[`${team}/${users[0]}/${randomUUID()}.svg`]),/row-level security/);
 await who(1);await assert.rejects(set(null),/administradores/);
 await assert.rejects(q("insert into storage.objects(bucket_id,name,metadata) values('team-logos',$1,'{}')",[`${team}/${users[1]}/${randomUUID()}.png`]),/row-level security/);
 assert.equal((await q('update peladas set logo_key=null where id=$1 returning id',[team])).length,0);
 await who(null,'anon');assert.equal((await q("select name from storage.objects where bucket_id='team-logos'")).length,1);
 await assert.rejects(set(key),/permission denied/);
 await who(0);await set(null);assert.equal((await q('select logo_key from peladas where id=$1',[team]))[0].logo_key,null);
 const forged=`${team}/${users[0]}/${randomUUID()}.webp`;
 await assert.rejects(q('update peladas set logo_key=$2 where id=$1',[team,forged]),/indisponível/);
 console.log('PASS: all migrations, canonical schema, admin-only uploaded emblem, member/outsider/anon denials, cross-team/object/URI forgery blocked, public read and safe unlink. No real backend writes.');
}finally{await db.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
