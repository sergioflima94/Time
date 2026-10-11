const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module'),ts=require('typescript');
const memory=new Map(),listeners=new Set(),hubListeners=new Set(),auth={isLoggedIn:true,authUserId:null};
const app={currentPlayerId:'p1',players:[{id:'p1',name:'Ana'},{id:'p2',name:'Bia'},{id:'p3',name:'Caio'},{id:'p4',name:'Dono'}],peladas:[{id:'team',name:'Time'}],memberships:[{peladaId:'team',playerId:'p1',active:true,role:'admin'},{peladaId:'team',playerId:'p2',active:true,role:'member'}],establishments:[{id:'venue',ownerPlayerId:'p4'}],fields:[{id:'field',establishmentId:'venue'}],establishmentStaff:[],games:[{id:'game',peladaId:'team',fieldId:'field',status:'open',scheduledAt:'2099-01-01T20:00:00Z'}],payments:[{id:'pay',gameId:'game',playerId:'p1',paidByPlayerId:'p3',status:'pending'}],fieldBookings:[{id:'booking',fieldId:'field',establishmentId:'venue',peladaId:'team',createdBy:'p1',time:'19:00',teamName:'Time'}],serviceTabs:[{id:'tab',establishmentId:'venue',customerPlayerId:'p2',label:'Refrigerante',status:'open'}],tabParticipants:[{id:'person',tabId:'tab',playerId:'p3'}],serviceOrders:[],serviceOrderItems:[],orderItemShares:[],salePayments:[],salePaymentIntents:[],classPrograms:[],classEnrollments:[]};
const backend={isMockMode:true,supabase:null};
const mocks=new Map([[path.resolve('src/lib/supabase.ts'),backend],
 [path.resolve('src/store/useAppStore.ts'),{useAppStore:{getState:()=>app,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},persist:{hasHydrated:()=>true}}}],
 [path.resolve('src/store/useAuthStore.ts'),{useAuthStore:{getState:()=>auth}}],
 [path.resolve('src/store/usePlayHubStore.ts'),{usePlayHubStore:{getState:()=>({data:{slots:[],requests:[]}}),subscribe:fn=>{hubListeners.add(fn);return()=>hubListeners.delete(fn);}}}]]);
const resolve=Module._resolveFilename,load=Module._load;
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.resolve('src',name.slice(2)):name,parent,...rest);};
Module._load=function(name,parent,...rest){if(name==='@react-native-async-storage/async-storage')return {__esModule:true,default:{getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>memory.set(k,v)}};const file=Module._resolveFilename(name,parent);return mocks.has(file)?mocks.get(file):load.call(this,name,parent,...rest);};
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {startDemoHistory,readHistory}=require('../src/lib/history.ts'),rules=require('../src/lib/historyRules.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve)),change=()=>{for(const fn of listeners)fn();};
async function run(){
 const hub={data:{slots:[{id:'slot',field_id:'field'}],requests:[{id:'opportunity',slot_id:'slot',pelada_id:'team',status:'pending',price:100}]}};
 memory.set('borajogo-play-hub-demo-v1',JSON.stringify(hub));
 const stop=startDemoHistory();await tick();
 let page=await readHistory({scope:'mine'});assert.ok(page.entries.length>0);assert.ok(page.entries.every(e=>e.operation==='baseline'));assert.ok(page.entries.every(e=>!('subjects' in e)&&!('private' in e)));
 app.games=app.games.map(g=>({...g,status:'in_progress'}));change();await tick();
 page=await readHistory({scope:'context',kind:'game',contextId:'game'});assert.equal(page.entries[0].before.status,'open');assert.equal(page.entries[0].after.status,'in_progress');assert.equal(page.entries[0].actorName,'Você');
 const count=page.entries.length;change();assert.equal((await readHistory({scope:'context',kind:'game',contextId:'game'})).entries.length,count);
 hub.data.requests[0].status='confirmed';memory.set('borajogo-play-hub-demo-v1',JSON.stringify(hub));for(const fn of hubListeners)fn();await tick();
 const opportunity=await readHistory({scope:'context',kind:'booking',contextId:'opportunity'});assert.equal(opportunity.entries[0].operation,'UPDATE');assert.equal(opportunity.entries[0].after.status,'confirmed');assert.equal(opportunity.entries[0].venueId,'venue');
 for(const fn of hubListeners)fn();await tick();assert.equal((await readHistory({scope:'context',kind:'booking',contextId:'opportunity'})).entries.length,opportunity.entries.length);
 app.currentPlayerId='p2';assert.equal((await readHistory({scope:'mine'})).entries.some(e=>e.source==='payments'),false);await assert.rejects(readHistory({scope:'venue',venueId:'venue'}),/permissão/);
 app.currentPlayerId='p3';assert.equal((await readHistory({scope:'mine'})).entries.some(e=>e.source==='payments'),true);assert.ok((await readHistory({scope:'context',kind:'tab',contextId:'tab'})).entries.length);
 app.currentPlayerId='p4';assert.ok((await readHistory({scope:'venue',venueId:'venue'})).entries.some(e=>e.source==='games'));
 app.fieldBookings=[];change();await tick();assert.equal((await readHistory({scope:'context',kind:'booking',contextId:'booking'})).entries[0].operation,'DELETE');
 app.currentPlayerId='p2';app.memberships=app.memberships.map(m=>m.playerId==='p2'?{...m,active:false}:m);change();assert.equal((await readHistory({scope:'context',kind:'game',contextId:'game'})).entries.length,0);
 app.currentPlayerId='p1';for(let i=0;i<55;i++){app.games=app.games.map(g=>({...g,matchMinutes:i+1}));change();}
 page=await readHistory({scope:'context',kind:'game',contextId:'game'});assert.equal(page.entries.length,50);assert.equal(page.hasMore,true);const next=await readHistory({scope:'context',kind:'game',contextId:'game',before:page.entries.at(-1).id});assert.equal(next.hasMore,false);assert.equal(new Set([...page.entries,...next.entries].map(e=>e.id)).size,page.entries.length+next.entries.length);
 assert.equal((await readHistory({scope:'mine',from:'2100-01-01T00:00:00Z'})).entries.length,0);
 assert.deepEqual(rules.historySnapshot('sale_payment_intents',{status:'paid',pix_copy_paste:'secret',checkout_url:'private'}),{status:'paid'});
 assert.equal(rules.historyValue('amount_cents',1001).replace(/\s/g,''),'R$10,01');
 assert.equal(rules.historyChanges({...page.entries[0],before:{status:'open',match_minutes:10},after:{status:'open',match_minutes:15}}).length,1);
 assert.throws(()=>rules.historyPeriod('2026-02-30',''),/Data inválida/);assert.throws(()=>rules.historyPeriod('2026-10-10','2026-10-09'),/posterior/);assert.throws(()=>rules.historyPeriod('10/10/2026',''),/formato/);
 const period=rules.historyPeriod('2026-10-10','2026-10-10');assert.equal(new Date(period.to)-new Date(period.from),86400000);
 // SQL and demo use exactly the same allowlist.
 const sql=fs.readFileSync('supabase/migrations/20261011020000_activity_history.sql','utf8');for(const [source,fields] of Object.entries(rules.HISTORY_FIELDS)){const match=sql.match(new RegExp(`when '${source}' then array\\[([^\\]]+)\\]`));assert.ok(match,source);assert.deepEqual(match[1].split(',').map(x=>x.trim().replaceAll("'",'')),fields,source);}
 auth.isLoggedIn=false;await assert.rejects(readHistory({scope:'mine'}),/Entre/);stop();await tick();assert.ok(memory.has('marcoujogou-history-demo-v1'));
 auth.isLoggedIn=true;auth.authUserId='auth-a';backend.isMockMode=false;let resolveRpc;backend.supabase={rpc:()=>new Promise(resolve=>resolveRpc=resolve)};const pending=readHistory({scope:'mine'});auth.authUserId='auth-b';resolveRpc({data:{entries:[],hasMore:false},error:null});await assert.rejects(pending,/conta mudou/);
 console.log('PASS: demo baseline/transitions/deletion, no-op dedup, permissions, immutable payload sanitization, pagination/filter, locale money/date validation, SQL allowlist parity, logout and stale-account response rejection.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
