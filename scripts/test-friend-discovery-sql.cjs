// Isolated PostgreSQL. No real contacts/accounts/messages are processed.
const {PGlite}=require('../.test-runtime/node_modules/@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const db=new PGlite(),ids=[1,2,3,4].map(i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function who(i,role='authenticated'){await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[i===null?'':ids[i]]);await db.exec(`set role ${role}`);}
const act=async(a,d={})=>(await q('select friend_discovery($1,$2::jsonb) as data',[a,JSON.stringify(d)]))[0].data;
async function run(){try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_user::text$$;
 grant usage on schema public,auth to authenticated,anon,service_role;grant execute on all functions in schema auth to authenticated,anon,service_role;`);
 for(const file of fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8').replace(/^create extension if not exists .*;\r?$/gm,''));
 await db.exec('grant select,insert,update,delete on public.friendships to authenticated;'); // Supabase default table grants; RLS/trigger still apply.
 await db.exec('grant select on public.players to authenticated;');
 for(let i=0;i<4;i++)await q('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',[ids[i],`friend${i}@test.invalid`,JSON.stringify({name:`Pessoa ${i}`,phone:i===1?'(11) 99999-1234':null})]);
 const ps=await q('select id,auth_user_id from players'),p=i=>ps.find(x=>x.auth_user_id===ids[i]).id;
 await who(0);assert.deepEqual(await act('preferences'),{byPhone:false,byEmail:false,nearby:false,locationFresh:false});
 assert.equal((await act('search',{query:'Pessoa'})).length,3);
 assert.deepEqual(await act('search',{query:'friend1@test.invalid'}),[]);assert.deepEqual(await act('search',{query:'11999991234'}),[]);
 await who(1);await act('configure',{byPhone:true,byEmail:true});
 await who(0);let rows=await act('match',{identifiers:[{kind:'phone',value:'+55 (11) 99999-1234'},{kind:'email',value:' FRIEND1@Test.Invalid '},{kind:'email',value:'nobody@test.invalid'}]});
 assert.equal(rows.length,2);assert.equal(rows[0].index,0);assert.equal(rows[1].player.id,p(1));assert(!JSON.stringify(rows).includes('phone'));assert(!JSON.stringify(rows).includes('email'));assert(!JSON.stringify(rows).includes('authUserId'));
 await assert.rejects(act('match',{identifiers:Array.from({length:51},()=>({kind:'phone',value:'11999991234'}))}),/até 50/);
 await db.exec('reset role');await q('update auth.users set email_confirmed_at=null where id=$1',[ids[1]]);await who(0);assert.deepEqual(await act('search',{query:'friend1@test.invalid'}),[]);
 await who(2);await act('configure',{byPhone:true});await db.exec('reset role');await q('update players set phone=$1 where id=$2',['+5511999991234',p(2)]);await who(0);assert.deepEqual(await act('search',{query:'11999991234'}),[]);
 await who(2);await act('configure',{byPhone:false});
 await who(1);await act('configure',{nearby:true,latitude:-16.68,longitude:-49.25});
 await who(0);await assert.rejects(act('nearby'),/Atualize/);await act('configure',{nearby:true,latitude:-16.681,longitude:-49.251});
 rows=await act('nearby',{radiusKm:5});assert.equal(rows.length,1);assert.equal(rows[0].distanceKm,1);assert(!JSON.stringify(rows).includes('latitude'));
 await assert.rejects(act('configure',{nearby:true,latitude:91,longitude:0}),/constraint/);await assert.rejects(act('configure',{nearby:true}),/localização/);
 await act('configure',{nearby:false});await db.exec('reset role');const cleared=(await q('select latitude,longitude,located_at from friend_discovery_preferences where player_id=$1',[p(0)]))[0];assert.deepEqual(cleared,{latitude:null,longitude:null,located_at:null});
 await q("update friend_discovery_preferences set located_at=now()-interval '3 hours' where player_id=$1",[p(1)]);
 await who(0);await act('preferences');await db.exec('reset role');
 assert.deepEqual((await q('select nearby,latitude,longitude,located_at from friend_discovery_preferences where player_id=$1',[p(1)]))[0],{nearby:false,latitude:null,longitude:null,located_at:null});
 await who(0);let person=await act('request',{playerId:p(1)});const fid=person.friendship.id;assert.equal(person.friendship.status,'pending');assert.equal((await act('request',{playerId:p(1)})).friendship.id,fid);
 await assert.rejects(act('respond',{friendshipId:fid,accept:true}),/Pedido indisponível/);
 await assert.rejects(q("update friendships set status='accepted',responded_at=now() where id=$1",[fid]),/quem recebeu/);
 await assert.rejects(q('update friendships set addressee_id=$1 where id=$2',[p(2),fid]),/imutáveis/);
 await who(1);assert.equal((await act('respond',{friendshipId:fid,accept:true})).friendship.status,'accepted');
 await who(0);const invitation=await act('invite_create');assert.match(invitation.token,/^[a-f0-9]{64}$/);await who(2);assert.equal((await act('invite_preview',{token:invitation.token})).id,p(0));
 assert.equal((await act('invite_claim',{token:invitation.token})).friendship.status,'pending');assert.equal((await act('invite_claim',{token:invitation.token})).friendship.status,'pending');
 await who(3);await assert.rejects(act('invite_claim',{token:invitation.token}),/indisponível/);await assert.rejects(act('invite_preview',{token:'wrong'}),/inválido/);
 await who(0);const expiredInvite=await act('invite_create');await db.exec('reset role');await q("update friend_join_invites set expires_at=now()-interval '1 minute' where token_hash=md5($1)",[expiredInvite.token]);
 await who(3);await assert.rejects(act('invite_preview',{token:expiredInvite.token}),/expirado/);
 await who(0);await act('preferences');await db.exec('reset role');assert.equal((await q('select count(*)::int as n from friend_join_invites where token_hash=md5($1)',[expiredInvite.token]))[0].n,0);
 await who(1);await q("select community_chat_action('block',$1::jsonb)",[JSON.stringify({playerId:p(0)})]).catch(async()=>{await db.exec('reset role');await q('insert into community_chat_blocks values($1,$2)',[p(1),p(0)]);});
 await who(0);assert.deepEqual(await act('search',{query:'11999991234'}),[]);await assert.rejects(act('request',{playerId:p(1)}),/indisponível/);
 await assert.rejects(q('select * from friend_join_invites'),/permission denied/);await assert.rejects(q('select * from friend_discovery_preferences'),/permission denied/);await assert.rejects(q('select friend_public_row($1,$2)',[p(0),p(1)]),/permission denied/);await assert.rejects(q("select friend_discovery_core('preferences','{}')"),/permission denied/);
 await db.exec('reset role');const stored=(await q('select token_hash from friend_join_invites'))[0];assert.notEqual(stored.token_hash,invitation.token);
 await q('insert into friend_discovery_limits values($1,date_trunc(\'minute\',clock_timestamp()),200) on conflict(player_id,window_at) do update set units=200',[p(0)]);await who(0);await assert.rejects(act('search',{query:'Pessoa'}),/Aguarde/);
 await who(null,'anon');await assert.rejects(act('search',{query:'Pessoa'}),/permission denied/);
 console.log('PASS: opt-in, exact phone/verified email, no identifiers/coordinates exposed, ambiguity, selected contacts cap, proximity/erase, recipient-only acceptance, immutable participants, blocked users, one-recipient replay-safe invite, private tables/helpers and rate limits.');
}finally{await db.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
