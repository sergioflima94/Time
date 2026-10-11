// Exercises the real demo repository and rules, with stores/storage isolated from production.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const memory=new Map(),auth={isLoggedIn:true,authUserId:null};
const app={currentPlayerId:'p1',players:['p1','p2','p3','p4'].map(id=>({id,name:id,isGuest:false})),
  memberships:[{playerId:'p1',peladaId:'team',active:true,role:'admin'},{playerId:'p2',peladaId:'team',active:true,role:'member'}],peladas:[{id:'team',name:'Nosso time'}],
  friendships:[{requesterId:'p1',addresseeId:'p2',status:'accepted'}],establishments:[{id:'venue',ownerPlayerId:'p4'}],
  fieldBookings:[{id:'booking',peladaId:'team',establishmentId:'venue',createdBy:'p1',teamName:'Nosso time'}],gameBookingRequests:[],games:[],fields:[],
  isAdmin:(me,id)=>app.memberships.some(m=>m.playerId===me&&m.peladaId===id&&m.active&&m.role==='admin')};
const reports={moderationReports:[]};
const mocks=new Map([
 [path.resolve('src/lib/supabase.ts'),{isMockMode:true,supabase:null}],
 [path.resolve('src/store/useAppStore.ts'),{useAppStore:{getState:()=>app}}],
 [path.resolve('src/store/useAuthStore.ts'),{useAuthStore:{getState:()=>auth}}],
 [path.resolve('src/store/useProStore.ts'),{useProStore:{setState:fn=>Object.assign(reports,fn(reports))}}],
 [path.resolve('src/store/usePlayHubStore.ts'),{usePlayHubStore:{getState:()=>({data:{requests:[],slots:[]}})}}],
]);
const resolve=Module._resolveFilename,load=Module._load;
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.resolve('src',name.slice(2)):name,parent,...rest);};
Module._load=function(name,parent,...rest){if(name==='@react-native-async-storage/async-storage')return {__esModule:true,default:{getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>memory.set(k,v)}};const file=Module._resolveFilename(name,parent);return mocks.has(file)?mocks.get(file):load.call(this,name,parent,...rest);};
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {conversationAction:act,conversationSnapshot:snapshot}=require('../src/lib/conversations.ts');
const {conversationUuid:uuid,validateWhatsAppGroup}=require('../src/lib/conversationRules.ts');
const open=(kind,contextId,bookingKind)=>act('open',{kind,contextId,bookingKind});
const send=(roomId,text,nonce=uuid())=>act('send',{roomId,text,nonce});
async function run(){
 assert.equal(validateWhatsAppGroup('https://chat.whatsapp.com/abcdefghijklmnop'), 'https://chat.whatsapp.com/abcdefghijklmnop');
 for(const url of ['http://chat.whatsapp.com/abcdefghijklmnop','https://chat.whatsapp.com.evil/abcdefghijklmnop','https://evil@chat.whatsapp.com/abcdefghijklmnop','https://chat.whatsapp.com/abcdefghijklmnop?x=1','javascript:alert(1)'])assert.throws(()=>validateWhatsAppGroup(url));
 const team=(await open('team','team')).id;assert.equal((await open('team','team')).id,team);
 const firstNonce=uuid();await send(team,'Quem leva a bola?',firstNonce);await send(team,'Quem leva a bola?',firstNonce);assert.equal((await snapshot(team)).messages.length,1);
 await assert.rejects(send(team,'Alterado',firstNonce),/Identificador/);
 app.currentPlayerId='p2';assert.equal((await snapshot(team)).room.unread,1);await act('read',{roomId:team});assert.equal((await snapshot(team)).room.unread,0);
 await assert.rejects(act('team_config',{teamId:'team',config:{mode:'internal',whatsappUrl:null,adminOnly:true}}),/administrador/);
 app.currentPlayerId='p1';await act('team_config',{teamId:'team',config:{mode:'both',whatsappUrl:'https://chat.whatsapp.com/abcdefghijklmnop',adminOnly:true}});
 app.currentPlayerId='p2';assert.equal((await snapshot(team)).canPost,false);await assert.rejects(send(team,'Bloqueado'),/permitido/);
 app.memberships.find(m=>m.playerId==='p2').active=false;await assert.rejects(snapshot(team),/indisponível/);app.memberships.find(m=>m.playerId==='p2').active=true;
 app.currentPlayerId='p1';const friend=(await open('direct','p2')).id;assert.equal((await snapshot(friend)).room.status,'accepted');await send(friend,'Bora jogar?');
 const stranger=(await open('direct','p3')).id;assert.equal((await snapshot(stranger)).room.status,'pending');await assert.rejects(send(stranger,'Não pode'),/aceite/);await assert.rejects(act('respond',{roomId:stranger,accept:true}),/indisponível/);
 app.currentPlayerId='p3';assert.equal((await snapshot(stranger)).messages.length,0);await act('respond',{roomId:stranger,accept:true});assert.equal((await open('direct','p1')).id,stranger);
 await send(stranger,'Podemos conversar');const message=(await snapshot(stranger)).messages[0];
 app.currentPlayerId='p1';const report=await act('report',{roomId:stranger,messageId:message.id,reason:'spam'});assert.equal((await act('report',{roomId:stranger,messageId:message.id,reason:'spam'})).id,report.id);assert.equal(reports.moderationReports.length,1);assert.match(reports.moderationReports[0].details,/Podemos conversar/);
 await act('block',{playerId:'p3'});assert.equal((await snapshot(stranger)).messages.length,0);await assert.rejects(send(stranger,'Não pode'),/bloqueio/);
 app.currentPlayerId='p3';await assert.rejects(open('direct','p1'),/indisponível/);await assert.rejects(send(stranger,'Não pode'),/bloqueio/);
 app.currentPlayerId='p1';await act('unblock',{playerId:'p3'});await send(stranger,'Contato restaurado');
 app.currentPlayerId='p4';await act('settings',{friendsOnly:true});app.currentPlayerId='p1';await assert.rejects(open('direct','p4'),/apenas de amigos/);
 app.currentPlayerId='p4';await act('settings',{friendsOnly:false});app.currentPlayerId='p1';const refused=(await open('direct','p4')).id;app.currentPlayerId='p4';await act('respond',{roomId:refused,accept:false});app.currentPlayerId='p1';assert.equal((await open('direct','p4')).id,refused);assert.equal((await snapshot(refused)).room.status,'declined');
 const booking=(await open('booking','booking','field')).id;await send(booking,'Qual o portão de entrada?');app.currentPlayerId='p4';assert.equal((await snapshot(booking)).messages.length,1);await send(booking,'Portão principal.');
 app.currentPlayerId='p3';await assert.rejects(snapshot(booking),/indisponível/);await assert.rejects(open('booking','booking','field'),/permissão|indisponível/);
 assert.equal(app.fieldBookings.length,1);assert.equal(app.fieldBookings[0].id,'booking');
 auth.isLoggedIn=false;await assert.rejects(snapshot(team),/Entre/);
 auth.isLoggedIn=true;auth.authUserId='auth-a';
 const backend=mocks.get(path.resolve('src/lib/supabase.ts'));backend.isMockMode=false;
 let release;backend.supabase={rpc:async(name,args)=>{assert.equal(name,'community_chat_snapshot');assert.equal(args.p_room,'server-room');return new Promise(resolve=>{release=resolve;});}};
 const pending=snapshot('server-room');auth.authUserId='auth-b';release({data:{rooms:[],messages:[]},error:null});await assert.rejects(pending,/conta mudou/);
 backend.supabase={rpc:async(name,args)=>{assert.equal(name,'community_chat_action');assert.equal(args.p_action,'send');return {data:null,error:{message:'CHAT:Aguarde o aceite'}};}};
 await assert.rejects(send('server-room','Sem aceite'),/Aguarde o aceite/);
 console.log('PASS: validated WhatsApp links, unique rooms, nonce retry, unread/read, team admin-only/current membership, friends, outsider consent, refusal, two-way blocks, friends-only, verified report evidence, private booking participants, no booking mutations, logout.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
