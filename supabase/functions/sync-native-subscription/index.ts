import { createClient } from 'npm:@supabase/supabase-js@2';
import { nativeBillingConfig, reconcileNativeSubscription } from '../_shared/nativeSubscriptions.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método inválido.' }, 405);
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Entre na sua conta.' }, 401);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data, error } = await user.auth.getUser();
    if (error || !data.user) return json({ error: 'Sessão inválida.' }, 401);
    const { error: accessError } = await user.rpc('native_subscription_status');
    if (accessError) return json({ error: 'Conta/perfil indisponível.' }, 403);
    // User ID, receipts, price and entitlement in the request body are ignored.
    let config; try { config = nativeBillingConfig(); } catch { return json({ error: 'Assinatura pela loja ainda não configurada/homologada.' }, 409); }
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: claimed, error: limited } = await service.rpc('claim_native_sync', { p_user: data.user.id });
    if (limited || !claimed) return json({ error: 'Aguarde um minuto antes de consultar novamente.' }, 429);
    await reconcileNativeSubscription(service, data.user.id, config);
    const { data: state, error: stateError } = await user.rpc('native_subscription_status');
    if (stateError) throw stateError;
    return json({ ...state, allowedProducts: config.products });
  } catch { return json({ error: 'Confirmação temporariamente indisponível. Consulte novamente; não repita a compra.' }, 503); }
});
