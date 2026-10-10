import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validSignature } from '../_shared/commercialSignature.ts';
serve(async req=>{
  if(req.method!=='POST')return new Response('Method not allowed',{status:405});
  try{
    const secret=Deno.env.get('PLATFORM_MP_WEBHOOK_SECRET');const token=Deno.env.get('PLATFORM_MP_ACCESS_TOKEN');const collector=Deno.env.get('PLATFORM_MP_COLLECTOR_ID');
    if(!secret||!token||!collector||Deno.env.get('COMMERCIAL_CHECKOUT_ENABLED')!=='true')return new Response('Not configured',{status:503});
    const url=new URL(req.url);const id=url.searchParams.get('data.id');
    if(!id||!/^\d+$/.test(id)||!await validSignature(req.headers.get('x-signature'),req.headers.get('x-request-id'),id,secret))return new Response('Invalid signature',{status:401});
    const body=await req.json();if(body.type!=='payment'||String(body.data?.id)!==id)return new Response('Invalid event',{status:400});
    const res=await fetch(`https://api.mercadopago.com/v1/payments/${id}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
    if(!res.ok)return new Response('Provider unavailable',{status:503});const payment=await res.json();
    if(String(payment.collector_id)!==collector||payment.live_mode!==true||payment.currency_id!=='BRL'||!/^commercial:[0-9a-f-]{36}$/.test(payment.external_reference??''))return new Response('Payment mismatch',{status:400});
    const order=payment.external_reference.slice('commercial:'.length);
    const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // Qualquer estorno parcial suspende este período para revisão, sem criar crédito fictício.
    const status=Number(payment.transaction_amount_refunded??0)>0?'refunded':payment.status;
    const {error}=await service.rpc('settle_commercial_checkout',{p_order:order,p_payment:String(payment.id),p_amount:payment.transaction_amount,p_currency:payment.currency_id,p_status:status,p_approved_at:payment.date_approved,p_updated_at:payment.date_last_updated});
    if(error)return new Response('Settlement requires retry/review',{status:503});
    return new Response('ok');
  }catch{return new Response('Retry later',{status:503});}
});
