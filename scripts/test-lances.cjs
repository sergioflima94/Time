const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file){const m=new Module(path.resolve(file),module);m.paths=module.paths;m._compile(ts.transpileModule(fs.readFileSync(m.id,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,m.id);return m.exports;}
const rules=load('src/lib/lanceRules.ts');
rules.validateLanceVideo(1,30,'video/mp4');
for(const args of [[0,30,'video/mp4'],[62914561,30,'video/mp4'],[1024,91,'video/mp4'],[1024,NaN,'video/mp4'],[1024,30,'text/html']])assert.throws(()=>rules.validateLanceVideo(...args));
assert.throws(()=>rules.lancePublicLink('../../private'));assert.equal(rules.lancePublicLink('00000000-0000-4000-8000-000000000001'),'https://app.marcoujogou.com.br/lances/00000000-0000-4000-8000-000000000001');
let actor='account-a',calls=[],cancelled=false,uploadFails=false,changeAccount=false,shared=[];
const platform={OS:'web'},asset={file:{size:1024,type:'video/mp4',arrayBuffer:async()=>new ArrayBuffer(1024)},duration:30000,mimeType:'video/mp4',fileName:'jogada.mp4'};
const client={auth:{getSession:async()=>({data:{session:{user:{id:actor},access_token:'fixture-token'}}})},
rpc:async(name,args)=>{calls.push([name,args]);return {data:args.p_action==='create'?{id:'draft',mediaKey:'player/draft.mp4'}:{id:'draft'}};},
storage:{from:bucket=>{assert.equal(bucket,'lances');return {upload:async(key,bytes,options)=>{calls.push(['upload',{key,bytes:bytes.byteLength,options}]);if(changeAccount)actor='account-b';return {error:uploadFails?{message:'offline'}:null};},createSignedUrl:async(key,ttl)=>{assert.equal(ttl,120);return{data:{signedUrl:'https://fixture.invalid/signed?token=not-shared'}};}};}}};
const original=Module._load;
Module._load=function(name,...rest){
 if(name==='react-native')return{Platform:platform,Share:{share:async data=>{shared.push(data);}}};
 if(name==='expo-image-picker')return{launchImageLibraryAsync:async options=>{assert.deepEqual(options.mediaTypes,['videos']);return cancelled?{canceled:true}:{canceled:false,assets:[asset]};}};
 if(name==='expo-file-system')return{File:class{get size(){return 1024;}async arrayBuffer(){return new ArrayBuffer(1024);}}};
 if(name==='./supabase')return{supabase:client,sessionBoundClient:token=>{assert.equal(token,'fixture-token');return client;}};
 if(name==='@/store/useAuthStore')return{useAuthStore:{getState:()=>({authUserId:actor})}};
 if(name==='./uuid')return{createUuid:()=> '00000000-0000-4000-8000-000000000001'};
 if(name==='./lanceRules')return rules;
 return original.call(this,name,...rest);
};
const api=load('src/lib/lances.ts');Module._load=original;
async function run(){
 cancelled=true;assert.equal(await api.chooseLanceVideo(),null);assert.equal(calls.length,0);cancelled=false;
 const video=await api.chooseLanceVideo();assert.equal(video.seconds,30);
 await api.uploadLance('game','Meu gol',video);assert.deepEqual(calls.map(c=>c[0]),['lance_action','upload','lance_action']);assert.equal(calls[0][1].p_action,'create');assert.equal(calls[2][1].p_action,'finish_upload');assert.equal(calls[1][1].options.upsert,false);
 calls=[];uploadFails=true;await assert.rejects(api.uploadLance('game','Meu gol',video),/não foi confirmado/);assert.equal(calls.some(c=>c[1].p_action==='finish_upload'),false);
 calls=[];uploadFails=false;changeAccount=true;await assert.rejects(api.uploadLance('game','Meu gol',video),/conta mudou/);assert.equal(calls.some(c=>c[1].p_action==='finish_upload'),false);changeAccount=false;
 platform.OS='android';const clip={id:'00000000-0000-4000-8000-000000000001',title:'Meu gol',teamName:'Time teste',publishedAt:'2026-10-14',visibility:'team'};
 await assert.rejects(api.shareLance(clip),/externo/);assert.equal(shared.length,0);await api.shareLance({...clip,visibility:'public'});assert.equal(shared.length,1);assert(!shared[0].message.includes('token='));assert(shared[0].message.includes('https://app.marcoujogou.com.br/lances/'));
 assert.equal(await api.lanceVideoUrl('key'),'https://fixture.invalid/signed?token=not-shared');
 console.log('PASS: validation, real chosen-video upload/finalization, cancellation/failure/account-switch safety, 120-second media URLs and public-only canonical sharing. Fixture backend, no real uploads.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
