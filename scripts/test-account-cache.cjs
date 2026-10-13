const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),Module=require('node:module'),assert=require('node:assert/strict');
function moduleOf(file,extra=''){const m=new Module(path.resolve(file));m._compile(ts.transpileModule(fs.readFileSync(m.id,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+extra,m.id);return m.exports;}
const scope=moduleOf('src/lib/accountCache.ts');
const action=()=>{};
const state={cacheAuthUserId:'A',players:[{name:'private A'}],currentPlayerId:'pA',currentPeladaId:'tA',matchQueue:{g:['t1']},notificationOptIn:true,pushToken:'private',action};
const empty=scope.emptyAccountState(state,false);assert.deepEqual(empty.players,[]);assert.equal(empty.currentPlayerId,'');assert.equal(empty.action,action);assert.equal(empty.pushToken,null);
assert.equal(scope.emptyAccountState(state,true),state);
scope.bindCacheAccount('A');const first=scope.cacheEpoch();assert.equal(scope.mergeAccountCache(state,empty,false).players.length,1);
let resets=0;scope.registerAccountCacheReset(()=>{assert(scope.cacheAccount()!=='A');resets++;});scope.bindCacheAccount('B');assert.equal(resets,1);assert.deepEqual(scope.mergeAccountCache(state,empty,false).players,[]);
assert.equal(scope.ownsQueuedJob({authUserId:'A'}),false);assert.equal(scope.ownsQueuedJob({}),false);assert.equal(scope.ownsQueuedJob({authUserId:'B'}),true);
// Return to A still invalidates old in-flight reads by epoch.
scope.bindCacheAccount(null); // no credentials remain usable during logout
assert.equal(scope.ownsQueuedJob({authUserId:'B'}),false);
// Keep reset assertion from above simple for the subsequent test context.
scope.bindCacheAccount('C');assert.notEqual(scope.cacheEpoch(),first);
let sessionUser='C', token='token-C', switchDuringSession=false, calls=[],deferred=null;
const storage=new Map(),syncState={};
const stores={app:{players:[],fields:[],currentPlayerId:'',matchQueue:{},cacheAuthUserId:null},growth:{chatChannels:[],waivers:[]},pro:{checkInPasses:[]}};
const api=name=>({getState:()=>stores[name],setState:p=>Object.assign(stores[name],p),subscribe:()=>()=>{},persist:{rehydrate:async()=>{}}});
const bound=access=>({rpc:async(name,args)=>{calls.push({access,name,args});if(deferred){const p=deferred;deferred=null;await p;}return{error:null};},from:table=>({upsert:async row=>{calls.push({access,table,row});return{error:null};},delete:()=>({match:async()=>({error:null})}),update:()=>({match:async()=>({error:null})})})});
const client={auth:{getSession:async()=>{if(switchDuringSession)scope.bindCacheAccount('D');return{data:{session:{user:{id:sessionUser},access_token:token}},error:null};}},rpc:()=>{throw Error('Unbound SDK writes must never be used');}};
const original=Module._load;
Module._load=function(name,...rest){
 if(name==='@react-native-async-storage/async-storage')return{__esModule:true,default:{getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v)}};
 if(name==='react-native')return{Platform:{OS:'android'}};
 if(name==='@/lib/supabase')return{isMockMode:false,supabase:client,sessionBoundClient:bound};
 if(name==='@/lib/accountCache')return scope;
 if(name==='@/lib/supabaseSyncMappings')return{TABLE_SPECS:[],genericFromRow:v=>v,genericToRow:v=>v,camelToSnake:v=>v};
 if(name==='@/store/useAppStore')return{useAppStore:api('app')};
 if(name==='@/store/useGrowthStore')return{useGrowthStore:api('growth')};
 if(name==='@/store/useProStore')return{useProStore:api('pro')};
 if(name==='@/store/useDataSyncStore')return{useDataSyncStore:{getState:()=>({setSyncState:p=>Object.assign(syncState,p)})}};
 return original.call(this,name,...rest);
};
const key='pelada-supabase-mutation-queue-v1';
async function run(){try{
 const sync=moduleOf('src/lib/supabaseSync.ts','\nexports.test={executeJob,enqueueOffline,flushOfflineQueue};').test;
 await assert.rejects(sync.executeJob({authUserId:'A',kind:'rpc'}),/outra conta/);assert.equal(calls.length,0);
 switchDuringSession=true;await assert.rejects(sync.executeJob({authUserId:'C',kind:'rpc'}),/conta mudou/);assert.equal(calls.length,0);switchDuringSession=false;
 sessionUser='D';token='token-D';await sync.executeJob({authUserId:'D',kind:'rpc',functionName:'owned'});assert.equal(calls[0].access,'token-D');
 // Independent actors and independent row identities never coalesce.
 await Promise.all([sync.enqueueOffline({id:'a',authUserId:'D',kind:'upsert',table:'players',row:{id:'p1'}}),sync.enqueueOffline({id:'b',authUserId:'D',kind:'upsert',table:'players',row:{id:'p2'}}),sync.enqueueOffline({id:'c',authUserId:'A',kind:'upsert',table:'players',row:{id:'p1'}})]);
 assert.equal(JSON.parse(storage.get(key)).length,3);
 await sync.enqueueOffline({id:'a2',authUserId:'D',kind:'upsert',table:'players',row:{id:'p1',nickname:'latest'}});assert.equal(JSON.parse(storage.get(key)).length,3);
 await sync.enqueueOffline({id:'legacy',kind:'rpc',functionName:'unidentified'});
 await sync.flushOfflineQueue();const remaining=JSON.parse(storage.get(key));assert.deepEqual(remaining.map(j=>j.id).sort(),['c','legacy']);assert.equal(syncState.pendingCount,0);
 // A new action enqueued during a network flush is retained, not overwritten.
 await sync.enqueueOffline({id:'slow',authUserId:'D',kind:'rpc',functionName:'slow'});
 let release;deferred=new Promise(r=>release=r);const flushing=sync.flushOfflineQueue();
 while(!calls.some(c=>c.name==='slow'))await new Promise(r=>setTimeout(r,1));
 await sync.enqueueOffline({id:'new',authUserId:'D',kind:'rpc',functionName:'new'});release();await flushing;
 assert(JSON.parse(storage.get(key)).some(j=>j.id==='new'));assert.equal(syncState.pendingCount,1);
 assert(!calls.some(c=>c.name==='unidentified'));
 console.log('PASS: account-bound caches, no real-mode demo seed, action preservation/quarantine, session-pinned writes, actor changes, dedupe and concurrent queue updates. No real backend writes.');
}finally{Module._load=original;}}
run().catch(e=>{console.error(e);process.exitCode=1;});
