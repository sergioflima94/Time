// Synthetic tests only: no store accounts, provider calls, charges or messages.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript'), assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const { nativeSubscriptionProof: proof, verifyNativeWebhook, reconcileNativeSubscription } = require('../supabase/functions/_shared/nativeSubscriptions.ts');
const { billingChannel } = require('../src/lib/billingPolicy.ts');
const id='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002', now=Date.now();
const info=()=>({request_date_ms:now,subscriber:{original_app_user_id:id,entitlements:{premium:{product_identifier:'premium.monthly',purchase_date:new Date(now-1000).toISOString(),expires_date:new Date(now+86400000).toISOString()}},subscriptions:{'premium.monthly':{store:'play_store',is_sandbox:false,ownership_type:'PURCHASED',refunded_at:null,unsubscribe_detected_at:null,billing_issues_detected_at:null}}}});
async function run() {
  for(const p of ['android','ios','web']) for(const purpose of ['booking','in_person_class','food','physical_product','venue_invoice']) assert.equal(billingChannel(purpose,p),'venue_gateway');
  assert.equal(billingChannel('premium','android'),'play_store'); assert.equal(billingChannel('premium','ios'),'app_store'); assert.equal(billingChannel('premium','web'),'platform_web');
  assert.equal(billingChannel('venue_software','android'),'existing_access_only');assert.equal(billingChannel('team_software','ios'),'existing_access_only');
  const get=x=>proof(x,id,['premium.monthly'],'premium',false,now);
  assert.equal(get(info()).active,true); assert.equal(get(info()).autoRenew,true);
  let x=info();x.subscriber.subscriptions['premium.monthly'].unsubscribe_detected_at=new Date(now).toISOString();assert.equal(get(x).active,true);assert.equal(get(x).autoRenew,false);
  x=info();x.subscriber.subscriptions['premium.monthly'].refunded_at=new Date(now).toISOString();assert.equal(get(x).active,false);
  x=info();x.subscriber.entitlements.premium.expires_date=new Date(now-100).toISOString();assert.equal(get(x).active,false);
  x.subscriber.entitlements.premium.grace_period_expires_date=new Date(now+60000).toISOString();assert.equal(get(x).active,true);
  x=info();x.subscriber.original_app_user_id=other;assert.equal(get(x).active,false);
  x=info();x.subscriber.subscriptions['premium.monthly'].is_sandbox=true;assert.throws(()=>get(x),/teste/);
  x=info();x.subscriber.subscriptions['premium.monthly'].store='promotional';assert.throws(()=>get(x),/incompatível/);
  x=info();x.subscriber.subscriptions['premium.monthly'].ownership_type='FAMILY_SHARED';assert.throws(()=>get(x),/incompatível/);
  x=info();x.request_date_ms=now-600000;assert.throws(()=>get(x),/inválida/);
  x=info();x.subscriber.entitlements.premium.expires_date=null;assert.throws(()=>get(x),/inválido/);
  const raw=JSON.stringify({event:{id:'event-only',app_user_id:id,type:'RENEWAL'}}),t=Math.floor(now/1000),secret='synthetic-signing-only',auth='Bearer synthetic-auth-only';
  const signature=`t=${t},v1=${createHmac('sha256',secret).update(`${t}.${raw}`).digest('hex')}`;
  const headers=new Headers({authorization:auth,'X-RevenueCat-Webhook-Signature':signature});
  assert.equal(await verifyNativeWebhook(raw,headers,secret,auth,now),true);
  assert.equal(await verifyNativeWebhook(`${raw} `,headers,secret,auth,now),false);
  assert.equal(await verifyNativeWebhook(raw,headers,secret,'wrong',now),false);
  assert.equal(await verifyNativeWebhook(raw,headers,secret,auth,now+360000),false);
  const calls=[];const service={rpc:async(fn,args)=>{calls.push([fn,args]);return{error:null};}};
  const config={key:'synthetic-provider-only',plan:other,products:['premium.monthly'],entitlement:'premium',allowSandbox:false};
  await reconcileNativeSubscription(service,id,config,async(url,opts)=>{assert.equal(url,`https://api.revenuecat.com/v1/subscribers/${id}`);assert.equal(opts.redirect,'error');return new Response(JSON.stringify(info()));});
  assert.equal(calls[0][0],'apply_native_subscription');assert.equal(calls[0][1].p_user,id);
  await assert.rejects(reconcileNativeSubscription(service,id,config,async()=>new Response('{}',{status:503})),/Não repita/);assert.equal(calls.length,1);
  // Handler authorization: body cannot select another user or invent a receipt.
  let handler;const load=Module._load, originalDeno=global.Deno, originalFetch=global.fetch;
  const env={SUPABASE_URL:'https://synthetic.test.invalid',SUPABASE_ANON_KEY:'synthetic-public',SUPABASE_SERVICE_ROLE_KEY:'synthetic-private',NATIVE_BILLING_ENABLED:'true',REVENUECAT_SECRET_KEY:config.key,REVENUECAT_PREMIUM_PLAN_ID:other,REVENUECAT_PREMIUM_PRODUCTS:'premium.monthly'};
  const db={auth:{getUser:async()=>({data:{user:{id}},error:null}),admin:{getUserById:async()=>({data:{user:{id}}})}},rpc:async(fn,args)=>{calls.push([fn,args]);return{data:fn==='claim_native_sync'?true:{active:true},error:null};}};
  Module._load=function(name,...rest){return name==='npm:@supabase/supabase-js@2'?{createClient:()=>db}:load.call(this,name,...rest);};
  global.Deno={serve:h=>{handler=h;},env:{get:k=>env[k]}};global.fetch=async()=>new Response(JSON.stringify(info()));
  try{
    require('../supabase/functions/sync-native-subscription/index.ts');
    const request=auth=>new Request('https://synthetic.test.invalid/sync-native-subscription',{method:'POST',headers:auth?{authorization:'Bearer synthetic'}:{},body:JSON.stringify({userId:other,active:true,expiresAt:'2099-01-01'})});
    assert.equal((await handler(request(false))).status,401);
    assert.equal((await handler(request(true))).status,200);assert.equal(calls.filter(([fn])=>fn==='apply_native_subscription').at(-1)[1].p_user,id);
    env.NATIVE_BILLING_ENABLED='false';assert.equal((await handler(request(true))).status,409);
    require('../supabase/functions/native-subscription-webhook/index.ts');
    assert.equal((await handler(new Request('https://synthetic.test.invalid/webhook',{method:'POST',body:raw}))).status,401);
  }finally{Module._load=load;global.Deno=originalDeno;global.fetch=originalFetch;}
  console.log('PASS: physical/digital routing, identity, expiry/grace/refund/cancellation, sandbox rejection, REST proof, HMAC/replay, authenticated sync and disabled configuration.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
