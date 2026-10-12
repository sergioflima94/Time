// Fake SDK/server: no real purchase or credentials.
const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
let user='00000000-0000-4000-8000-000000000001',logged=true,paid=false,canPurchase=true,purchased=0,restored=0,switched=0,applied=0,failSync=false,switchInSync=false;
const state={players:[{id:'p1',authUserId:user,premiumUntil:null}]};
const pack={identifier:'monthly',product:{identifier:'premium.monthly',title:'Premium',priceString:'R$ 9,90',subscriptionPeriod:'P1M'}};
const fakeSdk={configure:({appUserID})=>assert.equal(appUserID,user),logIn:async()=>{switched++;},getOfferings:async()=>({all:{premium:{monthly:pack}}}),purchasePackage:async p=>{assert.equal(p,pack);purchased++;return{customerInfo:{entitlements:{active:{premium:{expirationDate:'2099-01-01'}}}}};},restorePurchases:async()=>{restored++;}};
const db={functions:{invoke:async()=>{if(switchInSync)user='00000000-0000-4000-8000-000000000002';return failSync?{error:{context:{json:async()=>({error:'Não repita a compra'})}}}:{data:{active:paid,canPurchase,source:paid?'play_store':null,expiresAt:paid?'2099-01-01':null,autoRenew:paid,since:null,playerId:'p1',allowedProducts:['premium.monthly']}};}}};
process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY='goog_synthetic_only';
const load=Module._load;
Module._load=function(name,...rest){
 if(name==='react-native')return{Platform:{OS:'android'}};
 if(name==='expo-constants')return{__esModule:true,default:{executionEnvironment:'standalone'},ExecutionEnvironment:{StoreClient:'storeClient'}};
 if(name==='react-native-purchases')return{__esModule:true,default:fakeSdk};
 if(name==='./supabase')return{supabase:db,isMockMode:false};
 if(name==='./supabaseSync')return{applyFriendCache:p=>{applied++;Object.assign(state,p);}};
 if(name==='@/store/useAuthStore')return{useAuthStore:{getState:()=>({authReady:true,isLoggedIn:logged,authUserId:user})}};
 if(name==='@/store/useAppStore')return{useAppStore:{getState:()=>state}};
 if(name==='@/store/usePlatformAccessStore')return{usePlatformAccessStore:{getState:()=>({refresh:async()=>{}})}};
 return load.call(this,name,...rest);
};
async function run(){try{
 const billing=require('../src/lib/nativeBilling.ts');assert.equal(billing.nativeBillingConfigured,true);
 const offer=await billing.loadNativeOffer();assert.equal(offer.package.product.priceString,'R$ 9,90');
 await billing.purchaseNativePremium(pack);assert.equal(purchased,1);assert.equal(state.players[0].premiumUntil,null,'SDK-only fake active entitlement must not grant access');
 await assert.rejects(billing.purchaseNativePremium({...pack,product:{...pack.product,identifier:'wrong.product'}}),/não homologado/);assert.equal(purchased,1);
 canPurchase=false;await assert.rejects(billing.purchaseNativePremium(pack),/acesso ativo/);assert.equal(purchased,1);
 await billing.restoreNativePremium();assert.equal(restored,1);assert.equal(state.players[0].premiumUntil,null);
 paid=true;await billing.syncNativeSubscription();assert.equal(state.players[0].premiumUntil,'2099-01-01');
 const before=applied;switchInSync=true;await assert.rejects(billing.syncNativeSubscription(),/conta mudou/);assert.equal(applied,before);
 switchInSync=false;state.players=[{id:'p1',authUserId:user,premiumUntil:null}];await billing.restoreNativePremium();assert.equal(switched,1);
 failSync=true;await assert.rejects(billing.syncNativeSubscription(),/Não repita/);
 logged=false;assert.throws(()=>billing.syncNativeSubscription(),/Entre/);
 console.log('PASS: native public-key configuration, actual store price, no SDK-only grant, duplicate guard, restore, account switches and server failures.');
}finally{Module._load=load;delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;}}
run().catch(e=>{console.error(e);process.exitCode=1;});
