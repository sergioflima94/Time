// Real installed Realtime SDK, but no transport/network or production account.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require('typescript'),assert=require('node:assert/strict');
const {RealtimeClient}=require('@supabase/supabase-js');
function load(file){const m=new Module(path.resolve(file),module);m.filename=path.resolve(file);m.paths=module.paths;m._compile(ts.transpileModule(fs.readFileSync(m.filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,m.filename);return m.exports;}
const original=Module._load;
Module._load=function(name,...args){if(name==='./uuid')return load('src/lib/uuid.ts');return original.call(this,name,...args);};
const {createScopedRealtimeChannel}=load('src/lib/realtimeChannel.ts');Module._load=original;
const client=new RealtimeClient('wss://fixture.invalid/realtime/v1',{params:{apikey:'sb_publishable_fixture_only'}});
// Subscribe sets joinedOnce synchronously. Prevent all socket creation while
// retaining the real SDK topic cache and its post-subscribe listener guard.
client.connect=()=>{};
const listen=channel=>channel.on('postgres_changes',{event:'*',schema:'public',table:'venue_live_pings'},()=>{}).subscribe();
async function run(){try{
 const old=listen(client.channel('old-same-venue'));
 assert.equal(client.channel('old-same-venue'),old);
 assert.throws(()=>listen(client.channel('old-same-venue')),/cannot add.*postgres_changes.*after.*subscribe/);
 await client.removeChannel(old);
 const scopes=['venue-ops:venue:arena:reviewer','credit:reviewer:arena','community-chat:reviewer:inbox','app-sync-reviewer'];
 for(const scope of scopes){
   const first=listen(createScopedRealtimeChannel(client,scope));
   const second=listen(createScopedRealtimeChannel(client,scope));
   assert.notEqual(first,second);assert.notEqual(first.topic,second.topic);
   const cleanup=client.removeChannel(first);
   const remounted=listen(createScopedRealtimeChannel(client,scope));
   await cleanup;
   assert(client.getChannels().includes(second),'Previous-screen cleanup must not remove another screen subscription');
   assert(client.getChannels().includes(remounted),'Late cleanup must not remove the remounted subscription');
   await client.removeChannel(second);await client.removeChannel(remounted);
 }
 assert.equal(client.getChannels().length,0);
 // No direct fixed-topic creation may silently reintroduce this native crash.
 for(const file of ['src/hooks/useVenueOperations.ts','src/hooks/useCustomerInvoices.ts','app/conversas.tsx','src/lib/supabaseSync.ts']){
   const source=fs.readFileSync(file,'utf8');assert(source.includes('createScopedRealtimeChannel('),file);assert(!/\.channel\s*\(/.test(source),file);
 }
 console.log('PASS: original SDK collision reproduced; concurrent screens, pending cleanup/remount, individual cleanup and all four subscription sites are safe. No sockets or backend writes.');
}finally{await client.removeAllChannels();client.disconnect();}}
run().catch(e=>{console.error(e);process.exitCode=1;});
