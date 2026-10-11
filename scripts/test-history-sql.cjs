// PostgreSQL tests use only isolated local users and fixtures, never production writes.
const {PGlite}=require('../.test-runtime/node_modules/@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const db=new PGlite(),users=[1,2,3,4,5].map(i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function identity(id,role='authenticated'){await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec(`set role ${role}`);}
async function history(scope='mine',venue=null,kind=null,context=null,before=null,from=null,to=null,team=null,field=null){return (await q('select activity_history_read($1,$2,$3,$4,$5,$6,$7,$8,$9) as data',[scope,venue,kind,context,before,from,to,team,field]))[0].data;}
async function run(){try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_user::text$$;
 grant usage on schema public,auth to authenticated,anon,service_role;grant execute on all functions in schema auth to authenticated,anon,service_role;`);
 const migrations=fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(n=>n.endsWith('.sql')).sort();
 const migrate=async n=>db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',n),'utf8').replace(/^create extension if not exists .*;\r?$/gm,''));
 for(const n of migrations.filter(n=>!n.endsWith('_activity_history.sql')))await migrate(n);
 for(const [i,u] of users.entries())await q('insert into auth.users(id,email) values($1,$2)',[u,`history${i}@test.invalid`]);
 const ps=await q('select id,auth_user_id from players'),player=u=>ps.find(p=>p.auth_user_id===u).id;
 const team=(await q("insert into peladas(name,invite_code,created_by) values('Time histórico','HISTORYTEST',$1) returning id",[player(users[0])]))[0].id;
 await q("insert into pelada_memberships(pelada_id,player_id,role,active) values($1,$2,'admin',true),($1,$3,'member',true)",[team,player(users[0]),player(users[1])]);
 const venue=(await q("insert into establishments(owner_player_id,name,payout_method,access_code) values($1,'Arena histórica','in_person','HISTORYVENUE') returning id",[player(users[3])]))[0].id;
 const field=(await q("insert into fields(establishment_id,name,created_by) values($1,'Quadra histórica',$2) returning id",[venue,player(users[3])]))[0].id;
 const game=(await q("insert into games(pelada_id,field_id,scheduled_at,max_players,players_per_team,created_by) values($1,$2,'2099-01-11 19:00:00-03',10,5,$3) returning id",[team,field,player(users[0])]))[0].id;
 await migrate(migrations.find(n=>n.endsWith('_activity_history.sql')));
 // Supabase default table grants are not part of a plain PGlite database.
 await db.exec('grant select,update on public.games to authenticated');
 await identity(users[0]);let page=await history('context',null,'game',game);
 assert.equal(page.entries.length,1);assert.equal(page.entries[0].operation,'baseline');assert.equal(page.entries[0].before,null);assert.match(page.entries[0].actorName,/não registrado/);
 await q("update games set status='in_progress' where id=$1",[game]);
 page=await history('context',null,'game',game);assert.equal(page.entries[0].before.status,'open');assert.equal(page.entries[0].after.status,'in_progress');assert.equal(page.entries[0].actorName,'Você');
 await q("update games set status='in_progress' where id=$1",[game]);assert.equal((await history('context',null,'game',game)).entries.length,2); // idempotent upsert does not invent a change
 await identity(users[1]);assert.equal((await history('context',null,'game',game)).entries.length,2);
 await db.exec('reset role');
 const payment=(await q("insert into payments(game_id,player_id,status,paid_by_player_id) values($1,$2,'pending',$3) returning id",[game,player(users[0]),player(users[2])]))[0].id;
 await q("update payments set status='paid',paid_at=now() where id=$1",[payment]);
 await identity(users[1]);assert.equal((await history()).entries.some(e=>e.source==='payments'),false);
 await identity(users[2]);assert.equal((await history()).entries.filter(e=>e.source==='payments').length,2);assert.equal((await history('context',null,'game',game)).entries.length,2);
 await assert.rejects(history('venue',venue),/Sem permissão/);
 await identity(users[3]);assert.equal((await history('venue',venue)).entries.filter(e=>e.source==='payments').length,2);
 await db.exec('reset role');
 const booking=(await q("insert into field_bookings(field_id,establishment_id,pelada_id,team_name,recurrence,date,time,created_by) values($1,$2,$3,'Time histórico','single','2099-01-10','18:00',$4) returning id",[field,venue,team,player(users[0])]))[0].id;
 const tab=(await q("insert into service_tabs(establishment_id,label,customer_player_id,customer_name,opened_by_player_id) values($1,'Churrasco',$2,'Pessoa teste',$3) returning id",[venue,player(users[1]),player(users[3])]))[0].id;
 const participant=(await q("insert into tab_participants(tab_id,player_id,name) values($1,$2,'Convidado') returning id",[tab,player(users[2])]))[0].id;
 const category=(await q("insert into product_categories(establishment_id,name) values($1,'Bebidas') returning id",[venue]))[0].id;
 const product=(await q("insert into products(establishment_id,category_id,name,price,station) values($1,$2,'Refrigerante',12,'bar') returning id",[venue,category]))[0].id;
 const order=(await q("insert into service_orders(tab_id,created_by_player_id,status) values($1,$2,'submitted') returning id",[tab,player(users[3])]))[0].id;
 const item=(await q("insert into service_order_items(order_id,product_id,quantity,unit_price,status) values($1,$2,1,12,'submitted') returning id",[order,product]))[0].id;
 await q("update service_order_items set status='cancelled',cancellation_reason='Pedido duplicado' where id=$1",[item]);
 await q("insert into order_item_shares(item_id,participant_id,amount_cents) values($1,$2,600)",[item,participant]);
 await q("insert into sale_payments(tab_id,payer_player_id,payer_name,amount,method) values($1,$2,'Pessoa teste',6,'pix')",[tab,player(users[1])]);
 await identity(users[3]);let venueHistory=await history('venue',venue);assert.ok(venueHistory.entries.some(e=>e.source==='service_order_items'&&e.operation==='UPDATE'&&e.after.cancellation_reason==='Pedido duplicado'));
 await identity(users[2]);assert.equal((await history('context',null,'tab',tab)).entries.length,6);assert.ok((await history()).entries.some(e=>e.kind==='tab'));
 await identity(users[4]);assert.equal((await history('context',null,'tab',tab)).entries.length,0);assert.equal((await history()).entries.length,0);await assert.rejects(history('venue',venue),/Sem permissão/);
 await assert.rejects(q("insert into activity_history(source,source_id,kind,context_id,title,operation) values('games',$1,'game',$1,'Forjado','INSERT')",[game]),/permission denied/);
 await assert.rejects(q('delete from activity_history'),/permission denied/);await assert.rejects(q('update activity_history set title=\'Forjado\''),/permission denied/);
 await assert.rejects(q("select activity_history_record('games','{}',null,'INSERT')"),/permission denied/);
 await db.exec('reset role');await q('delete from field_bookings where id=$1',[booking]);
 await identity(users[0]);let deleted=await history('context',null,'booking',booking);assert.equal(deleted.entries[0].operation,'DELETE');assert.equal(deleted.entries[0].before.time,'18:00');assert.equal(deleted.entries[0].after,null);
 await db.exec('reset role');const count=(await q('select count(*)::int n from activity_history'))[0].n;
 await db.exec('begin');await q("update games set status='finished' where id=$1",[game]);await db.exec('rollback');assert.equal((await q('select count(*)::int n from activity_history'))[0].n,count);
 // Safe snapshots strip secret payload fields even if a payment row contains them.
 await q("insert into sale_payment_intents(tab_id,payer_participant_id,covered_participant_ids,provider,method,amount_cents,pix_copy_paste,checkout_url) values($1,$2,array[$2]::uuid[],'manual_pix','pix',600,'SECRET PIX','https://secret.invalid')",[tab,participant]);
 const raw=JSON.stringify((await q("select after_value from activity_history where source='sale_payment_intents'"))[0]);assert.doesNotMatch(raw,/SECRET|secret.invalid/);
 const schedule=(await q("insert into schedules(pelada_id,field_id,recurrence,day_of_week,time,start_date,created_by) values($1,$2,'weekly',1,'19:00','2099-01-01',$3) returning id",[team,field,player(users[0])]))[0].id;
 const automatic=(await q("insert into game_booking_requests(game_id,schedule_id,field_id,code,requested_start_at,duration_minutes,expires_at) values($1,$2,$3,'HISTORY-AUTO','2099-01-11 19:00:00-03',60,'2099-01-11 18:00:00-03') returning id",[game,schedule,field]))[0].id;
 await q("insert into booking_deposits(booking_request_id,payer_player_id,amount_cents,provider,method,due_at) values($1,$2,2500,'manual_pix','pix','2099-01-10')",[automatic,player(users[0])]);
 const slot=(await q("insert into opportunity_slots(field_id,starts_at,duration_minutes,regular_price,offer_price) values($1,'2099-01-12 19:00:00-03',60,150,100) returning id",[field]))[0].id;
 await q("insert into opportunity_requests(slot_id,pelada_id,price,commission_percent) values($1,$2,100,0)",[slot,team]);
 await q("insert into team_availability_polls(game_id,pelada_id,question,created_by,closes_at) values($1,$2,'Outro horário?',$3,'2099-01-10')",[game,team,player(users[0])]);
 await q("insert into attendances(game_id,player_id,status) values($1,$2,'confirmed')",[game,player(users[1])]);
 await q("insert into player_fatigue(game_id,player_id,status,matches_remaining) values($1,$2,'resting',2)",[game,player(users[1])]);
 const teams=(await q("insert into teams(game_id,name) values($1,'Azul'),($1,'Branco') returning id",[game]));
 const turn=(await q("insert into match_turns(game_id,team_a_id,team_b_id,started_at) values($1,$2,$3,now()) returning id",[game,teams[0].id,teams[1].id]))[0].id;
 await q("insert into goals(game_id,match_turn_id,team_id,scorer_player_id) values($1,$2,$3,$4)",[game,turn,teams[0].id,player(users[1])]);
 const campaign=(await q("insert into fundraising_campaigns(pelada_id,title,category,target_amount,payout_player_id,created_by) values($1,'Bola nova','equipment',100,$2,$2) returning id",[team,player(users[0])]))[0].id;
 await q("insert into fundraising_contributions(campaign_id,paid_by_player_id,credited_player_id,amount,method,provider,anonymous,status) values($1,$2,$3,10,'pix','manual_pix',true,'paid')",[campaign,player(users[0]),player(users[2])]);
 await q("insert into fundraising_expenses(campaign_id,title,amount,recorded_by) values($1,'Bola',50,$2)",[campaign,player(users[0])]);
 const coach=(await q("insert into coaches(establishment_id,player_id) values($1,$2) returning id",[venue,player(users[3])]))[0].id;
 const program=(await q("insert into class_programs(establishment_id,name,sport_id,format,coach_id,field_id,level,capacity,duration_minutes,price,billing_type) values($1,'Treino vôlei','volei','group',$2,$3,'beginner',10,60,20,'drop_in') returning id",[venue,coach,field]))[0].id;
 const session=(await q("insert into class_sessions(program_id,starts_at,ends_at) values($1,'2099-01-12 19:00:00-03','2099-01-12 20:00:00-03') returning id",[program]))[0].id;
 await q("insert into class_enrollments(session_id,player_id,status,payment_status,amount) values($1,$2,'confirmed','pending',20)",[session,player(users[1])]);
 const sources=(await q('select distinct source from activity_history')).map(e=>e.source);
 for(const name of ['games','attendances','match_turns','goals','player_fatigue','payments','field_bookings','game_booking_requests','opportunity_requests','booking_deposits','service_tabs','service_orders','service_order_items','order_item_shares','sale_payments','sale_payment_intents','team_availability_polls','fundraising_campaigns','fundraising_contributions','fundraising_expenses','class_sessions','class_enrollments'])assert.ok(sources.includes(name),`Missing coverage ${name}`);
 await identity(users[1]);assert.equal((await history('context',null,'campaign',campaign)).entries.some(e=>e.source==='fundraising_contributions'),false);assert.equal((await history('context',null,'class',session)).entries.length,2);
 await identity(users[2]);assert.equal((await history('context',null,'class',session)).entries.length,0);assert.equal((await history('context',null,'campaign',campaign)).entries.length,1);
 await db.exec('reset role');
 // Dynamic ownership and staff roles, no blanket platform-owner private access.
 await q("insert into establishment_staff(establishment_id,player_id,roles,active) values($1,$2,array['kitchen'],true)",[venue,player(users[4])]);
 await identity(users[4]);await assert.rejects(history('venue',venue),/Sem permissão/);
 await db.exec('reset role');await q("update establishment_staff set roles=array['cashier'] where player_id=$1",[player(users[4])]);
 await identity(users[4]);assert.ok((await history('venue',venue)).entries.length>0);
 await db.exec('reset role');await q('update establishment_staff set active=false where player_id=$1',[player(users[4])]);
 await q("insert into platform_admin_accounts(auth_user_id,role,active) values($1,'owner',true)",[users[4]]);
 await identity(users[4]);await assert.rejects(history('venue',venue),/Sem permissão/);assert.equal((await history('context',null,'tab',tab)).entries.length,0);
 await db.exec('reset role');await q('update pelada_memberships set active=false where player_id=$1',[player(users[1])]);
 await identity(users[1]);assert.deepEqual((await history('context',null,'game',game)).entries.map(e=>e.source).sort(),['attendances','player_fatigue']); // Own records remain; former members cannot inspect others or the team's game changes.
 await db.exec('reset role');for(let i=0;i<56;i++)await q("update games set match_minutes=$2 where id=$1",[game,i+20]);
 await identity(users[0]);page=await history('context',null,'game',game);assert.equal(page.entries.length,50);assert.equal(page.hasMore,true);const next=await history('context',null,'game',game,page.entries.at(-1).id);assert.equal(next.hasMore,false);assert.equal(new Set([...page.entries,...next.entries].map(e=>e.id)).size,page.entries.length+next.entries.length);
 assert.equal((await history('mine',null,'game',null,null,'2100-01-01')).entries.length,0);
 assert.ok((await history('mine',null,'game',null,null,null,null,team,field)).entries.length>0);
 await db.exec('reset role');await q("insert into platform_account_controls(player_id,suspended,reason) values($1,true,'Teste de acesso')",[player(users[0])]);
 await identity(users[0]);await assert.rejects(history(),/Entre/);await identity(null,'anon');await assert.rejects(history(),/permission denied/);
 console.log('PASS: SQL history baseline, transitions, no-op dedup, actor, transactional rollback, immutable client access, finance privacy, secret stripping, deleted bookings retained, current ownership/membership/staff, no platform private bypass, filters, keyset pagination, suspension and anonymous denial.');
}finally{await db.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
