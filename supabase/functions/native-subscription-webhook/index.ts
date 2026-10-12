import { createClient } from 'npm:@supabase/supabase-js@2';
import { isBillingUser, nativeBillingConfig, reconcileNativeSubscription, verifyNativeWebhook } from '../_shared/nativeSubscriptions.ts';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Método inválido.' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 65_536) return json({ error: 'Evento muito grande.' }, 413);
    if (!await verifyNativeWebhook(raw, req.headers, Deno.env.get('REVENUECAT_WEBHOOK_SIGNING_SECRET') ?? '', Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '')) return json({ error: 'Evento não autenticado.' }, 401);
    const body = JSON.parse(raw);
    const event = body?.event;
    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') return json({ error: 'Evento inválido.' }, 400);
    if (event.type === 'TEST') return json({ ok: true, test: true });
    const ids = (value: unknown) => Array.isArray(value) ? value : [];
    const users = [...new Set([event.app_user_id, ...ids(event.aliases), ...ids(event.transferred_from), ...ids(event.transferred_to)].filter(isBillingUser))];
    if (!users.length || users.length > 10) return json({ error: 'Identidade da compra incompatível.' }, 400);
    const config = nativeBillingConfig();
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // Re-query current truth even for duplicate/out-of-order events. checked_at
    // prevents an older concurrent REST response overwriting a newer state.
    await Promise.all(users.map(async id => {
      const { data: account } = await service.auth.admin.getUserById(id);
      if (!account?.user) return; // Account deletion must not block retries.
      await reconcileNativeSubscription(service, id, config);
    }));
    return json({ ok: true });
  } catch { return json({ error: 'Não foi possível reconciliar o evento; tente novamente.' }, 503); }
});
