import { createClient } from 'npm:@supabase/supabase-js@2';
import { assertPublicWhatsAppUrl, managedWhatsAppFetch } from '../_shared/whatsappSettings.ts';
const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods':'POST,OPTIONS' };
const reply = (body: unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const random = () => crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,'');
type Context = {provider:string;url:string;key:string;globalKey?:string;webhookSecret:string;instance:string;revision:number;provisionState:string};
async function request(c: Context,path: string,body?: unknown,global=false) {
  const response = await managedWhatsAppFetch(c.url+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',apikey:global?c.globalKey!:c.key},signal:AbortSignal.timeout(12000),...(body===undefined?{}:{body:JSON.stringify(body)})});
  const payload = await response.json().catch(()=>null);
  return {ok:response.ok&&payload!==null&&!payload.error,status:response.status,payload};
}
function stateOf(c:Context,p:any) {
  const d=p?.data??p;
  if(c.provider==='evolution_go' && d?.connected===true && d?.loggedIn===true)return 'open';
  if(c.provider==='evolution_go' && d?.connected===true && d?.loggedIn===false)return 'connecting';
  const state=d?.instance?.state??d?.state??d?.status;
  return ['open','close','connecting'].includes(state)?state:'unknown';
}
function safeQr(p:any,paired=false) {
  const d=p?.data??p?.qrcode??p;
  const base=d?.base64??d?.code;
  return {
    qr:typeof base==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(base)&&base.length<300000?base:null,
    code:!paired&&typeof(d?.qrcode??d?.code)==='string'&&!(d?.qrcode??d?.code).startsWith('data:')&&(d?.qrcode??d?.code).length<6000?(d?.qrcode??d?.code):null,
    pairingCode:typeof(d?.pairingCode??(paired?d?.code:null))==='string'&&(d?.pairingCode??d?.code).length<=30?(d?.pairingCode??d?.code):null,
  };
}
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return reply({error:'Método inválido.'},405);
  const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(!token)return reply({error:'Entre na sua conta.'},401);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:auth,error}=await db.auth.getUser(token);
  if(error||!auth.user)return reply({error:'Sessão inválida.'},401);
  const call=async(action:string,data:Record<string,unknown>={})=>{
    const r=await db.rpc('platform_whatsapp_service',{p_action:action,p_data:{...data,actor:auth.user!.id}});
    if(r.error)throw Error(r.error.message?.includes('WHATSAPP:')?r.error.message.split('WHATSAPP:')[1].trim():'Não foi possível acessar a configuração.');
    return r.data;
  };
  try {
    // Authenticate admin before DNS, provider access or credential processing.
    await call('metadata');
    const b=await req.json();
    if(!['metadata','save','enable','test','connect','status'].includes(b.action))return reply({error:'Ação inválida.'},400);
    if(b.action==='metadata')return reply({integrations:await call('metadata')});
    if(!['evolution_api','evolution_go'].includes(b.provider))return reply({error:'Provedor inválido.'},400);
    const {error:limited}=await db.rpc('credit_payment_service',{p_action:'access',p_data:{actor:auth.user.id}});
    if(limited)return reply({error:'Aguarde antes de consultar novamente.'},429);
    const scoped={provider:b.provider,revision:b.revision,reason:b.reason};
    if(b.action==='save'){
      const url=await assertPublicWhatsAppUrl(String(b.url??''));
      const key=b.newGoInstance===true&&b.provider==='evolution_go'?random():String(b.token??'');
      if(b.newGoInstance===true&&!b.globalKey)return reply({error:'Informe a chave global do Go para criar uma instância.'},400);
      await call('save',{...scoped,url,key,globalKey:String(b.globalKey??''),webhookSecret:String(b.webhookSecret??'')});
      return reply({integrations:await call('metadata'),message:'Configuração salva. Teste o acesso e ative o provedor; tokens não serão exibidos.'});
    }
    if(b.action==='enable'){
      await call('enable',{...scoped,enabled:b.enabled});
      return reply({integrations:await call('metadata'),message:b.enabled?'Provedor ativado. Conexão não comprova entrega.':'Provedor desativado para novos envios.'});
    }
    const c:Context=await call('context',{provider:b.provider});
    if(c.revision!==b.revision)return reply({error:'Configuração mudou. Atualize antes de repetir.'},409);
    const phone=String(b.phone??'').replace(/\D/g,'');
    if(phone&&!/^55\d{10,11}$/.test(phone))return reply({error:'Informe 55 + DDD + número.'},400);
    const api=c.provider==='evolution_api';
    let status=await request(c,api?'/instance/connectionState/'+encodeURIComponent(c.instance):'/instance/status');
    if(b.action==='test'){
      const check=api?await request(c,'/instance/fetchInstances'):c.globalKey?await request(c,'/instance/all',undefined,true):status;
      await call('probe',{...scoped,ok:check.ok,state:stateOf(c,status.payload)});
      return reply({integrations:await call('metadata'),message:check.ok?'Host e autenticação responderam. Conecte o número para enviar; nenhuma mensagem de teste foi enviada.':'Teste falhou. Confira host, token e versão do servidor.'});
    }
    if(b.action==='connect'&&!status.ok){
      if(api&&status.status!==404)return reply({error:'Instância indisponível. Confira o teste de acesso antes de criar.'},409);
      if(!api&&!c.globalKey)return reply({error:'Token Go não identifica uma instância. Informe o token da instância existente ou uma chave global para criar uma nova.'},409);
      await call('claim_create',scoped);
      let created;
      try{
        const webhookUrl=Deno.env.get('SUPABASE_URL')+'/functions/v1/'+(api?'evolution-api-webhook':'evolution-go-webhook')+'?secret='+encodeURIComponent(c.webhookSecret);
        created=await request(c,'/instance/create',api?{instanceName:c.instance,integration:'WHATSAPP-BAILEYS',qrcode:false,groupsIgnore:true,readMessages:false,readStatus:false,syncFullHistory:false,webhook:{enabled:true,url:webhookUrl,events:['MESSAGES_UPSERT'],webhookByEvents:false,webhookBase64:false}}:{name:c.instance,token:c.key,webhook:webhookUrl,webhookEvents:['messages.upsert','connection.update']},!api);
      }catch{
        await call('finish_create',{...scoped,status:'uncertain'});
        return reply({error:'Criação inconclusiva. Consulte a conexão; não houve repetição automática.'},409);
      }
      await call('finish_create',{...scoped,status:created.ok?'created':'uncertain'});
      if(!created.ok)return reply({error:'Criação não confirmada. Confira no provedor antes de repetir.'},409);
      status=await request(c,api?'/instance/connectionState/'+encodeURIComponent(c.instance):'/instance/status');
    }
    let qr={qr:null,code:null,pairingCode:null} as ReturnType<typeof safeQr>,state=stateOf(c,status.payload);
    if(b.action==='connect'&&state!=='open'){
      let pair;
      if(api)pair=await request(c,'/instance/connect/'+encodeURIComponent(c.instance)+(phone?'?number='+phone:''));
      else {
        // Go token API (/send/text profile), not Evolution v2 routes.
        const connected=await request(c,'/instance/connect',{webhookUrl:Deno.env.get('SUPABASE_URL')+'/functions/v1/evolution-go-webhook?secret='+encodeURIComponent(c.webhookSecret),subscribe:['messages.upsert','connection.update']});
        if(!connected.ok)return reply({error:'Go não iniciou a conexão. Confira o perfil de API do servidor.'},409);
        pair=phone?await request(c,'/instance/pair',{phone}):await request(c,'/instance/qr');
      }
      if(!pair.ok)return reply({error:'QR/código ainda indisponível. Consulte a conexão antes de tentar novamente.'},409);
      qr=safeQr(pair.payload,!api&&!!phone);state='connecting';
    }
    await call('probe',{...scoped,ok:status.ok,state,provisioned:status.ok});
    return reply({integrations:await call('metadata'),...qr,message:state==='open'?'WhatsApp conectado. Nenhuma mensagem foi enviada nesta consulta.':'Abra Aparelhos conectados no WhatsApp. O QR/código será removido da tela após 60 segundos.'});
  }catch(cause){
    const safe=cause instanceof Error&&/^(Acesso exclusivo|Configuração mudou|Informe motivo|Novo host exige|Teste o acesso|Conecte o número|Criação já iniciada|Salve a configuração)/.test(cause.message)?cause.message:'Não foi possível configurar o WhatsApp. Confira permissões, host, credenciais e versão do servidor.';
    return reply({error:safe},safe.startsWith('Acesso exclusivo')?403:409);
  }
});
