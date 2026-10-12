// Synthetic providers only, never real hosts, numbers, messages or keys.
const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
let handler,calls=[],provider='evolution_api',exists=false,deny=false,revision=1;
const env={SUPABASE_URL:'https://synthetic.test.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-private',EVOLUTION_API_URL:'https://legacy.invalid',EVOLUTION_API_KEY:'legacy-synthetic',EVOLUTION_GO_URL:'https://legacy-go.invalid',EVOLUTION_GO_API_KEY:'legacy-go-synthetic'};
const context=()=>({provider,url:'https://wa.example.com',key:'synthetic-instance-key',globalKey:'synthetic-global-key',webhookSecret:'synthetic-webhook-only',instance:'mj-platform-synthetic',revision,enabled:false,provisionState:'none'});
const db={auth:{getUser:async()=>({data:{user:{id:'synthetic-actor'}},error:null})},rpc:async(fn,args)=>{calls.push([fn,args]);if(fn==='platform_whatsapp_service'&&deny)return{error:{message:'WHATSAPP: Acesso exclusivo de administradores da plataforma'}};return{data:fn==='platform_whatsapp_service'?(args.p_action==='context'?context():args.p_action==='metadata'?[{provider,url:'https://wa.example.com',revision}]:{}):{},error:null};}};
const load=Module._load,oldFetch=global.fetch,oldDeno=global.Deno;
Module._load=function(n,...rest){return n==='npm:@supabase/supabase-js@2'?{createClient:()=>db}:load.call(this,n,...rest);};
global.Deno={env:{get:k=>env[k]},serve:h=>{handler=h;},resolveDns:async()=>['8.8.8.8']};
const http=[];
global.fetch=async(url,opts)=>{http.push([url,opts]);assert.equal(opts.redirect,'error');if(url.includes('connectionState'))return Response.json(exists?{instance:{state:'close'}}:{error:'missing'},{status:exists?200:404});if(url.endsWith('/instance/status'))return Response.json(exists?{data:{connected:false,loggedIn:false}}:{error:'unknown token'},{status:exists?200:401});if(url.endsWith('/instance/create')){if(provider==='evolution_go'){assert.equal(opts.headers.apikey,'synthetic-global-key');assert.equal(JSON.parse(opts.body).token,'synthetic-instance-key');}exists=true;return Response.json({instance:{state:'close'}});}if(url.includes('/instance/connect/'))return Response.json({code:'synthetic-qr-only'});if(url.endsWith('/instance/pair'))return Response.json({data:{code:'12345678'}});return Response.json([]);};
async function run(){try{
 const path=require('node:path');
 function syntax(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())syntax(file);else if(file.endsWith('.ts')){const tree=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);assert.equal(tree.parseDiagnostics.length,0,`Edge syntax: ${file}`);}}}syntax('supabase/functions');
 const {publicWhatsAppUrl,publicAddress,assertPublicWhatsAppUrl}=require('../supabase/functions/_shared/whatsappSettings.ts');
 for(const host of ['http://wa.example.com','https://127.0.0.1','https://localhost','https://user:pass@wa.example.com','https://wa.example.com/?token=secret','https://[::1]'])assert.throws(()=>publicWhatsAppUrl(host));
 for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','192.168.0.1','100.64.0.1','172.16.0.1','::1','fc00::1','2001:db8::1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8.8.8.8'),true);await assert.rejects(assertPublicWhatsAppUrl('https://wa.example.com',async()=>['10.0.0.1']),/públicos/);
 const {sendWhatsAppText}=require('../supabase/functions/_shared/whatsappProviders.ts');
 let sent=await sendWhatsAppText('11999998877','Synthetic only','synthetic','evolution_api',null,async()=>{throw Error('must not fetch');},{evolution_api:{...context(),enabled:false}});assert.equal(sent.ok,false,'Managed disabled configuration must not fall back to legacy env');
 sent=await sendWhatsAppText('11999998877','Synthetic only','synthetic','evolution_go',null,async(url,opts)=>{assert.equal(url,'https://go.example.com/send/text');assert.equal(opts.headers.apikey,'managed-go-token');return Response.json({data:{messageId:'synthetic-id'}});},{evolution_go:{...context(),url:'https://go.example.com',key:'managed-go-token',enabled:true}});assert.equal(sent.ok,true);
 require('../supabase/functions/platform-whatsapp/index.ts');
 const req=(b,auth=true)=>new Request('https://synthetic.test.invalid/platform-whatsapp',{method:'POST',headers:auth?{authorization:'Bearer synthetic'}:{},body:JSON.stringify(b)});
 assert.equal((await handler(req({action:'metadata'},false))).status,401);
 deny=true;assert.equal((await handler(req({action:'save',provider,revision:0,url:'https://wa.example.com',token:'synthetic'}))).status,403);assert.equal(http.length,0);deny=false;
 const saved=await handler(req({action:'save',provider,revision:0,url:'https://wa.example.com',token:'synthetic-token',reason:'Configurar servidor novo'}));assert.equal(saved.status,200);assert(!(await saved.text()).includes('synthetic-token'));
 let result=await handler(req({action:'test',provider,revision:1}));assert.equal(result.status,200);assert(!http.some(([url])=>url.includes('/send/')));
 result=await handler(req({action:'connect',provider,revision:1,reason:'Parear número de teste'}));assert.equal(result.status,200);assert.equal((await result.json()).code,'synthetic-qr-only');assert(http.some(([url])=>url.endsWith('/instance/create')));
 provider='evolution_go';exists=false;result=await handler(req({action:'connect',provider,revision:1,phone:'5511999998877'}));assert.equal(result.status,200);assert.equal((await result.json()).pairingCode,'12345678');
 result=await handler(req({action:'status',provider,revision:0}));assert.equal(result.status,409);
 assert(!http.some(([url])=>url.includes('/send/')));
 console.log('PASS: managed config precedence/disable, public DNS and host guards, admin auth before network, safe metadata, API creation/QR, Go token pairing, no message tests and revision checks.');
}finally{Module._load=load;global.fetch=oldFetch;global.Deno=oldDeno;}}
run().catch(e=>{console.error(e);process.exitCode=1;});
