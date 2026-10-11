// PostgreSQL isolado; nenhuma conta, reserva ou avaliação real é criada.
const {PGlite}=require('../.test-runtime/node_modules/@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const db=new PGlite(),users=Array.from({length:8},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function identity(id,role='authenticated'){await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec(`set role ${role}`);}
const act=async(action,data)=>(await q('select venue_review_action($1,$2::jsonb) data',[action,JSON.stringify(data)]))[0].data;
const snap=async(venue,field=null,before=null,moderation=false)=>(await q('select venue_review_snapshot($1,$2,$3,$4) data',[venue,field,before,moderation]))[0].data;
async function run(){try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_user::text$$;
 grant usage on schema public,auth to authenticated,anon,service_role;grant execute on all functions in schema auth to authenticated,anon,service_role;`);
 for(const n of fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',n),'utf8').replace(/^create extension if not exists .*;\r?$/gm,''));
 for(const [i,u] of users.entries())await q('insert into auth.users(id,email) values($1,$2)',[u,`reviews${i}@test.invalid`]);
 const ps=await q('select id,auth_user_id from players'),player=u=>ps.find(p=>p.auth_user_id===u).id;
 await q("insert into platform_admin_accounts(auth_user_id,role) values($1,'owner')",[users[0]]);
 const venue=(await q("insert into establishments(owner_player_id,name,payout_method,access_code) values($1,'Arena avaliações','in_person','REVIEWS') returning id",[player(users[1])]))[0].id;
 const field=(await q("insert into fields(establishment_id,name,created_by) values($1,'Quadra teste',$2) returning id",[venue,player(users[1])]))[0].id;
 const other=(await q("insert into fields(establishment_id,name,created_by) values($1,'Outra quadra',$2) returning id",[venue,player(users[1])]))[0].id;
 const team=(await q("insert into peladas(name,invite_code,created_by) values('Time teste','REVTEAM',$1) returning id",[player(users[2])]))[0].id;
 await q("insert into pelada_memberships(pelada_id,player_id,role,active,joined_at) select $1,id,'member',true,now()-interval '10 days' from players",[team]);
 await q("update pelada_memberships set role='admin' where pelada_id=$1 and player_id=$2",[team,player(users[2])]);
 const game=(await q("insert into games(pelada_id,field_id,scheduled_at,status,created_by) values($1,$2,now()-interval '2 days','finished',$3) returning id",[team,field,player(users[2])]))[0].id;
 await q("insert into attendances(game_id,player_id,status,checked_in) select $1,id,'confirmed',true from players",[game]);
 const base={kind:'game',experienceId:game,target:'establishment',score:4,criteria:{service:4,organization:5},comment:'Atendimento bom, melhorar a iluminação.',nps:9};
 await identity(users[2]);const before=await snap(venue);assert.equal(before.experiences.length,1);assert.equal(before.summary.average,null);
 await assert.rejects(act('create',{...base,criteria:{service:4}}),/critérios/);
 await assert.rejects(act('create',{...base,score:2.5}),/Nota/);
 await assert.rejects(act('create',{...base,nps:11}),/Recomendação/);
 const review=(await act('create',base)).id;await assert.rejects(act('create',base),/já avaliou/);
 await act('create',{...base,target:'field',nps:null,criteria:{structure:4,lighting:3,cleanliness:5,maintenance:4}});
 await assert.rejects(act('create',{...base,target:'field'}),/Critérios|Recomendação/);
 assert.equal((await snap(venue)).reviews.length,1);assert.equal((await snap(venue,field)).reviews.length,1);assert.equal((await snap(venue,other)).reviews.length,0);
 const publicRow=(await snap(venue)).reviews[0];assert.equal(publicRow.mine,true);assert.equal('recommendation_score' in publicRow,false);assert.equal('nps' in publicRow,false);
 await assert.rejects(q('select * from venue_reviews'),/permission denied/);
 await assert.rejects(q('update venue_reviews set hidden=true where id=$1',[review]),/permission denied/);
 await assert.rejects(q('select * from venue_review_experiences($1)',[player(users[3])]),/permission denied/);
 await assert.rejects(act('reply',{reviewId:review,text:'Resposta forjada'}),/proprietário/);
 await identity(users[1]);await assert.rejects(act('create',base),/proprietário/);assert.equal((await snap(venue)).nps.value,null);
 await act('reply',{reviewId:review,text:'Obrigado! Vamos melhorar a iluminação.'});assert.match((await snap(venue)).reviews[0].reply,/Obrigado/);
 await assert.rejects(act('moderate',{reviewId:review,subject:'review',hidden:true,reason:'Apagar crítica'}),/administração/);
 // NPS agregado só para dono, mínimo 5 respostas, não média de estrelas.
 for(const [i,score] of [9,7,6,0].entries()){await identity(users[3+i]);await act('create',{...base,nps:score});}
 await identity(users[1]);const owner=await snap(venue);assert.equal(owner.nps.responses,5);assert.equal(owner.nps.value,0);assert.equal(owner.summary.average,4);
 assert.equal(owner.nps.promoters,2);assert.equal(owner.nps.detractors,2);
 await identity(null,'anon');const pub=await snap(venue);assert.equal(pub.nps,null);assert.equal(pub.experiences.length,0);assert.equal(pub.canReply,false);
 await assert.rejects(snap(null,null,null,true),/administração/);await assert.rejects(act('create',base),/permission denied/);
 await identity(users[2]);const report=(await act('report',{reviewId:review,subject:'reply',reason:'other',details:'Conferir resposta'})).id;
 assert.equal((await act('report',{reviewId:review,subject:'reply',reason:'other',details:'Repetir'})).id,report);
 assert.equal((await snap(venue)).reviews.length,5); // Denunciar não apaga críticas.
 await identity(users[1]);await assert.rejects(act('reply',{reviewId:review,text:'Apagar prova'}),/em análise/);
 await identity(users[0]);assert.equal((await snap(null,null,null,true)).reviews.length,1);
 await act('moderate',{reviewId:review,subject:'reply',hidden:true,reason:'Resposta inadequada, ocultada após análise.'});
 await identity(users[2]);assert.equal((await snap(venue)).reviews.find(r=>r.id===review).reply,null);
 await identity(users[0]);await act('moderate',{reviewId:review,subject:'review',hidden:true,reason:'Conteúdo ocultado após análise independente.'});
 await identity(users[1]);const moderated=await snap(venue);assert.equal(moderated.summary.count,4);assert.equal(moderated.nps.value,null);
 await identity(users[0]);await act('moderate',{reviewId:review,subject:'review',hidden:false,reason:'Crítica legítima, publicação restaurada.'});
 await act('moderate',{reviewId:review,subject:'reply',hidden:false,reason:'Resposta reavaliada e restaurada.'});
 await identity(users[1]);await act('reply',{reviewId:review,text:'Resposta atualizada após análise.'});
 await identity(users[2]);assert.equal((await snap(venue)).reviews.find(r=>r.id===review).replyReported,false);
 await act('report',{reviewId:review,subject:'reply',reason:'other',details:'Nova versão precisa de análise'});
 await identity(users[0]);assert.equal((await snap(null,null,null,true)).reviews.length,1);
 await db.exec('reset role');const evidence=await q("select details from moderation_reports where details like $1 order by created_at",[`Avaliação ${review}%`]);assert.equal(evidence.length,2);assert.match(evidence[0].details,/Obrigado/);assert.match(evidence[1].details,/atualizada/);
 await identity(null,'postgres');await q("update attendances set no_show=true where game_id=$1 and player_id=$2",[game,player(users[7])]);
 await identity(users[7]);await assert.rejects(act('create',base),/presença/);
 await identity(null,'postgres');await q("update attendances set no_show=false,checked_in=false where game_id=$1 and player_id=$2",[game,player(users[7])]);
 await identity(users[7]);assert.equal((await snap(venue)).experiences.length,0);
 await db.exec('reset role');await db.exec('grant select,update on attendances to authenticated;grant select on players,games,pelada_memberships to authenticated;');
 await identity(users[7]);await assert.rejects(q('update attendances set checked_in=true where game_id=$1 and player_id=$2',[game,player(users[7])]),/administração do time/);
 await assert.rejects(q('update attendances set player_id=$1 where game_id=$2 and player_id=$3',[player(users[6]),game,player(users[7])]),/transferida/);
 await q("update attendances set status='declined' where game_id=$1 and player_id=$2",[game,player(users[7])]); // RSVP continua permitido.
 await identity(users[2]);await q('update attendances set checked_in=true where game_id=$1 and player_id=$2',[game,player(users[7])]);
 await identity(null,'postgres');await q('update attendances set checked_in=false where game_id=$1 and player_id=$2',[game,player(users[7])]);
 await db.exec('reset role');await q("update attendances set status='confirmed' where game_id=$1 and player_id=$2",[game,player(users[7])]);
 await identity(null,'postgres');await q("update games set status='cancelled' where id=$1",[game]);await q("update attendances set checked_in=true where game_id=$1 and player_id=$2",[game,player(users[7])]);
 await identity(users[7]);await assert.rejects(act('create',base),/presença/);
 await db.exec('reset role');await q("update games set status='finished' where id=$1",[game]);
 // Reserva avulsa: passagem de tempo não prova presença. Dono confirma cliente cadastrado.
 const booking=(await q("insert into field_bookings(field_id,establishment_id,team_name,recurrence,date,time,created_by,created_at) values($1,$2,'Avulso','single',current_date-3,'18:00',$3,now()-interval '10 days') returning id",[field,venue,player(users[7])]))[0].id;
 await identity(users[7]);await assert.rejects(act('visit',{establishmentId:venue,bookingId:booking,date:new Date(Date.now()-3*86400000).toISOString().slice(0,10),playerId:player(users[7])}),/gestão/);
 await identity(users[1]);const candidate=(await snap(venue)).visitCandidates.find(c=>c.bookingId===booking);assert.ok(candidate);
 await act('visit',{establishmentId:venue,...candidate});await identity(users[7]);const experience=(await snap(venue)).experiences.find(x=>x.kind==='visit');assert.ok(experience);
 await act('create',{...base,kind:'visit',experienceId:experience.id});
 // Aulas exigem chamada presencial e encerramento, não somente inscrição/pagamento.
 await db.exec('reset role');
 const coach=(await q('insert into coaches(establishment_id,player_id) values($1,$2) returning id',[venue,player(users[1])]))[0].id;
 const program=(await q("insert into class_programs(establishment_id,name,sport_id,format,coach_id,field_id,level,capacity,duration_minutes,price,billing_type) values($1,'Turma teste','futebol','group',$2,$3,'all',10,60,50,'drop_in') returning id",[venue,coach,other]))[0].id;
 const session=(await q("insert into class_sessions(program_id,starts_at,ends_at,status) values($1,now()-interval '1 day',now()-interval '23 hours','completed') returning id",[program]))[0].id;
 await q("insert into class_attendances(session_id,player_id,status) values($1,$2,'present')",[session,player(users[7])]);
 await identity(users[7]);assert.ok((await snap(venue)).experiences.some(e=>e.kind==='class'));await act('create',{...base,kind:'class',experienceId:session});
 await db.exec('reset role');await q("update class_attendances set status='absent' where session_id=$1",[session]);
 await identity(users[6]);await assert.rejects(act('create',{...base,kind:'class',experienceId:session}),/presença/);
 // Semanal: quando a ocorrência de hoje ainda não terminou, ofereça a semana anterior.
 await db.exec('reset role');
 const weekly=(await q("insert into field_bookings(field_id,establishment_id,team_name,recurrence,day_of_week,time,created_by,created_at) values($1,$2,'Semanal','weekly',extract(dow from now() at time zone 'America/Sao_Paulo'),'23:59',$3,now()-interval '10 days') returning id",[other,venue,player(users[7])]))[0].id;
 await identity(users[1]);const previous=(await snap(venue)).visitCandidates.find(c=>c.bookingId===weekly);assert.ok(previous);assert.equal(previous.date,(await q("select ((now() at time zone 'America/Sao_Paulo')::date-7)::text d"))[0].d);
 // Timeline paginada preserva ordenação, anonimato e estatísticas globais.
 await db.exec('reset role');
 for(let i=0;i<53;i++)await q("insert into venue_reviews(player_id,experience_kind,experience_id,target,establishment_id,field_id,score,criteria,comment,created_at) values($1,'game',gen_random_uuid(),'field',$2,$3,3,'{}'::jsonb,$4,now()-interval '4 days'+$5*interval '1 minute')",[player(users[2]),venue,field,`Histórico ${i}`,i]);
 await identity(null,'anon');const page=await snap(venue,field);assert.equal(page.reviews.length,50);assert.equal(page.hasMore,true);assert.equal(page.summary.count,54);
 const older=await snap(venue,field,page.reviews.at(-1).id);assert.equal(older.reviews.length,4);assert.equal(older.hasMore,false);assert.equal(new Set([...page.reviews,...older.reviews].map(r=>r.id)).size,54);
 await assert.rejects(snap(venue,other,page.reviews[0].id),/Página inválida/);
 await identity(users[0]);await q('select save_field_directory(null,0,$1::jsonb,$2)',[JSON.stringify({fieldId:field,name:'Quadra teste',address:'Rua Centro, 123',sportId:'futebol',phone:'11999991111',whatsapp:false,latitude:-23.59,longitude:-46.65,online:false,active:true}),'Publicação autorizada de teste']);
 const directory=(await q("select search_field_directory(null,null,20,'','futebol') data"))[0].data;assert.equal(directory.entries[0].reviewCount,54);assert.equal(directory.entries[0].reviewAverage,3);assert.equal('nps' in directory.entries[0],false);
 await db.exec('reset role');
 await db.exec('reset role');await q("insert into platform_account_controls(player_id,suspended,reason) values($1,true,'Teste isolado')",[player(users[7])]);
 await identity(users[7]);await assert.rejects(act('report',{reviewId:review,subject:'review',reason:'spam'}),/conta ativa/);
 await db.exec('reset role');assert.ok(Number((await q('select count(*) n from venue_review_audit'))[0].n)>10);
 console.log('PASS: presença real, dono não se avalia/apaga, critérios e NPS privado >=5, comentários/respostas/denúncias/moderação auditada, reservas avulsas verificadas e conta suspensa.');
 }finally{await db.close();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
