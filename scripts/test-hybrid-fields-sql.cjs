// Isolated PostgreSQL fixtures only: no production users, reservations or payments.
const {PGlite}=require('../.test-runtime/node_modules/@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const db=new PGlite(),users=[1,2,3,4].map(i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function identity(id){await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec('set role authenticated');}
const act=async(action,data)=>(await q('select growth_action($1,$2::jsonb) data',[action,JSON.stringify(data)]))[0].data;
async function run(){try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_user::text$$;
 grant usage on schema public,auth to authenticated,anon,service_role;grant execute on all functions in schema auth to authenticated,anon,service_role;`);
 for(const n of fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',n),'utf8').replace(/^create extension if not exists .*;\r?$/gm,''));
 for(const [i,u] of users.entries())await q('insert into auth.users(id,email) values($1,$2)',[u,`hybrid${i}@test.invalid`]);
 const ps=await q('select id,auth_user_id from players'),player=u=>ps.find(p=>p.auth_user_id===u).id;
 await q("insert into platform_admin_accounts(auth_user_id,role) values($1,'owner')",[users[0]]);
 const venue=(await q("insert into establishments(owner_player_id,name,payout_method,access_code) values($1,'Arena híbrida','in_person','HYBRID') returning id",[player(users[1])]))[0].id;
 const field=(await q("insert into fields(establishment_id,name,sport_id,sport_ids,created_by) values($1,'Quadra de areia','volei',array['volei','futvolei'],$2) returning id",[venue,player(users[1])]))[0].id;
 const legacy=(await q("insert into fields(establishment_id,name,sport_id,created_by) values($1,'Quadra antiga','volei',$2) returning *",[venue,player(users[1])]))[0];assert.deepEqual(legacy.sport_ids,['volei']);
 await assert.rejects(q('update fields set sport_ids=$1 where id=$2',[[],field]),/esportes ativos/);
 await assert.rejects(q('update fields set sport_ids=$1 where id=$2',[['volei','volei'],field]),/esportes ativos/);
 await assert.rejects(q('update fields set sport_ids=$1 where id=$2',[['no-such-sport'],field]),/esportes ativos/);
 const teams=[];for(const [i,sport] of ['volei','futvolei','futebol'].entries()){
  const t=(await q('insert into peladas(name,invite_code,sport_id,created_by) values($1,$2,$3,$4) returning id',[sport,`HYBRID${i}`,sport,player(users[2])]))[0].id;teams.push(t);
  await q("insert into pelada_memberships(pelada_id,player_id,role,active) values($1,$2,'admin',true)",[t,player(users[2])]);
 }
 await db.exec('grant select,insert,update on fields,field_bookings to authenticated');
 await db.exec('grant select on establishments,players,pelada_memberships to authenticated');
 await identity(users[3]);assert.equal((await q("update fields set sport_ids=array['futebol'] where id=$1 returning id",[field])).length,0);
 await db.exec('reset role');
 const linked=(await q("insert into fields(establishment_id,pelada_id,name,sport_id,created_by) values($1,$2,'Campo vinculado','volei',$3) returning id",[venue,teams[0],player(users[2])]))[0].id;
 await identity(users[1]);assert.equal((await q("update fields set sport_ids=array['volei','futvolei'] where id=$1 returning id",[linked])).length,1);
 await identity(users[0]);const input={fieldId:field,name:'Quadra de areia',address:'Rua Centro, 123',sportId:'volei',phone:'11999991111',whatsapp:true,latitude:-23.59,longitude:-46.65,online:true,active:true};
 await q('select save_field_directory(null,0,$1::jsonb,$2)',[JSON.stringify(input),'Publicar contato autorizado']);
 for(const sport of ['volei','futvolei']){const result=(await q('select search_field_directory(null,null,20,\'\',$1) data',[sport]))[0].data;assert.equal(result.total,1);assert.deepEqual(result.entries[0].sportIds,['volei','futvolei']);}
 assert.equal((await q("select search_field_directory(null,null,20,'','futebol') data"))[0].data.total,0);
 // Contacts without accounts also support several sports, but never online booking.
 await q('select save_field_directory(null,0,$1::jsonb,$2)',[JSON.stringify({...input,fieldId:null,name:'Contato híbrido',online:false,sportIds:['volei','futvolei']}),'Publicar contato autorizado']);
 assert.equal((await q("select search_field_directory(null,null,20,'','futvolei') data"))[0].data.total,2);
 await identity(users[1]);const slot=await act('slot_create',{fieldId:field,startsAt:'2099-01-03T22:00:00Z',durationMinutes:60,regularPrice:200,offerPrice:150});
 const snapshot=(await q('select growth_snapshot() data'))[0].data;assert.deepEqual(snapshot.slots[0].sport_ids,['volei','futvolei']);
 await identity(users[2]);await act('slot_request',{slotId:slot.id,teamId:teams[0]});await act('slot_request',{slotId:slot.id,teamId:teams[1]});
 await assert.rejects(act('slot_request',{slotId:slot.id,teamId:teams[2]}),/indisponível/);
 await db.exec('reset role');const requests=await q('select id,pelada_id from opportunity_requests');
 await identity(users[1]);await act('slot_respond',{id:requests.find(r=>r.pelada_id===teams[1]).id,accept:true});
 await db.exec('reset role');const b=(await q('select * from field_bookings where field_id=$1',[field]))[0];assert.equal(b.sport_id,'futvolei');
 assert.equal((await q('select growth_slot_free($1,$2,60) free',[field,'2099-01-03T22:00:00Z']))[0].free,false);
 await assert.rejects(q("insert into field_bookings(field_id,establishment_id,pelada_id,team_name,recurrence,date,time,duration_minutes,created_by) values($1,$2,$3,'Vôlei','single','2099-01-03','19:00',60,$4)",[field,venue,teams[0],player(users[1])]),/ocupado/);
 await assert.rejects(q("update fields set sport_ids=array['volei'] where id=$1",[field]),/usando esse esporte/);
 // Ordinary bookings derive the team's sport rather than the field's first sport.
 await q("insert into field_bookings(field_id,establishment_id,pelada_id,team_name,recurrence,date,time,duration_minutes,created_by) values($1,$2,$3,'Futevôlei','single','2099-01-03','20:00',60,$4)",[field,venue,teams[1],player(users[1])]);
 await assert.rejects(q("insert into field_bookings(field_id,establishment_id,pelada_id,team_name,recurrence,date,time,created_by) values($1,$2,$3,'Futebol','single','2099-01-04','19:00',$4)",[field,venue,teams[2],player(users[1])]),/incompatível/);
 const coach=(await q('insert into coaches(establishment_id,player_id) values($1,$2) returning id',[venue,player(users[1])]))[0].id;
 const program=(await q("insert into class_programs(establishment_id,name,sport_id,format,coach_id,field_id,level,capacity,duration_minutes,price,billing_type) values($1,'Aula','volei','group',$2,$3,'all',10,60,50,'drop_in') returning id",[venue,coach,field]))[0].id;
 await assert.rejects(q("insert into class_programs(establishment_id,name,sport_id,format,coach_id,field_id,level,capacity,duration_minutes,price,billing_type) values($1,'Aula','futebol','group',$2,$3,'all',10,60,50,'drop_in')",[venue,coach,field]),/incompatível/);
 await assert.rejects(q('insert into class_sessions(program_id,starts_at,ends_at) values($1,$2,$3)',[program,'2099-01-03T22:00:00Z','2099-01-03T23:00:00Z']),/conflict/);
 const session=(await q('insert into class_sessions(program_id,starts_at,ends_at) values($1,$2,$3) returning id',[program,'2099-01-04T22:00:00Z','2099-01-04T23:00:00Z']))[0].id;
 assert.equal((await q('select growth_slot_free($1,$2,60) free',[field,'2099-01-04T22:00:00Z']))[0].free,false);
 await assert.rejects(q("insert into field_bookings(field_id,establishment_id,team_name,sport_id,recurrence,date,time,created_by) values($1,$2,'Futevôlei','futvolei','single','2099-01-04','19:00',$3)",[field,venue,player(users[1])]),/aula/);
 await q("update class_sessions set status='cancelled' where id=$1",[session]);assert.equal((await q('select growth_slot_free($1,$2,60) free',[field,'2099-01-04T22:00:00Z']))[0].free,true);
 assert.equal(Number((await q('select count(*) from fields where id=$1',[field]))[0].count),1);
 console.log('PASS: server sports validation + legacy inserts, owner RLS, one public listing in both sports, opportunities accepted by secondary sport, bookings block other sports, class/reservation conflicts both ways, cancellation releases space.');
 }finally{await db.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
