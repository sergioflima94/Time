import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'Método inválido'},405);
  try{
    const token=Deno.env.get('PLATFORM_MP_ACCESS_TOKEN');const enabled=Deno.env.get('COMMERCIAL_CHECKOUT_ENABLED')==='true';const base=Deno.env.get('APP_WEB_URL');
    if(!enabled||!token||!base||!base.startsWith('https://'))return json({error:'Checkout comercial ainda não homologado/configurado pela plataforma.'},409);
    const auth=req.headers.get('Authorization');if(!auth)return json({error:'Entre no app'},401);
    const url=Deno.env.get('SUPABASE_URL')!;const user=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
    const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);const {data:session}=await user.auth.getUser();if(!session.user)return json({error:'Sessão inválida'},401);
    const {agreementId,termsVersion}=await req.json();
    const {data:order,error}=await user.rpc('prepare_commercial_checkout',{p_agreement:agreementId,p_terms:termsVersion});if(error)return json({error:error.message},400);
    if(order.checkout_url&&Date.parse(order.expires_at)>Date.now())return json({url:order.checkout_url,orderId:order.id});
    const {data:claimed,error:claimError}=await service.rpc('claim_commercial_preference',{p_order:order.id});
    if(claimError||!claimed)return json({error:'Checkout em preparação ou aguardando reconciliação. Não crie outra cobrança; consulte o suporte se persistir.'},409);
    // Valor e destinatário vêm exclusivamente do RPC, nunca do aparelho.
    const response=await fetch('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Idempotency-Key':`${order.id}:${order.expires_at}`},body:JSON.stringify({
      items:[{id:order.id,title:`${order.title} · mensalidade ${order.cycle}`,quantity:1,currency_id:'BRL',unit_price:Number(order.amount)}],
      payer:{email:session.user.email},external_reference:`commercial:${order.id}`,binary_mode:true,
      expires:true,expiration_date_from:order.created_at,expiration_date_to:order.expires_at,
      payment_methods:{excluded_payment_types:[{id:'ticket'}],installments:1},
      notification_url:`${url}/functions/v1/commercial-payment-webhook`,back_urls:{success:`${base}/pro/planos`,pending:`${base}/pro/planos`,failure:`${base}/pro/planos`},
    }),signal:AbortSignal.timeout(12000)});
    if(!response.ok)return json({error:'O provedor não criou o checkout. Tente novamente.'},502);
    const preference=await response.json();const checkout=preference.init_point;
    if(typeof checkout!=='string'||!/^https:\/\/(www\.)?mercadopago\.com\.br\//.test(checkout))return json({error:'URL de checkout inválida'},502);
    const {error:saveError}=await service.from('commercial_checkout_orders').update({checkout_url:checkout,preference_id:String(preference.id),building:false}).eq('id',order.id).eq('status','pending');
    if(saveError)return json({error:'Checkout criado, mas persistência falhou. Tente novamente.'},503);
    return json({url:checkout,orderId:order.id});
  }catch{return json({error:'Não foi possível preparar o pagamento. Nenhum benefício foi ativado.'},500);}
});
