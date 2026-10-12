type Row = Record<string, any>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isBillingUser(value: unknown): value is string { return typeof value === 'string' && uuid.test(value); }
function date(value: unknown) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null; }

/** Only canonical REST responses are passed here, never app-supplied receipts. */
export function nativeSubscriptionProof(data: Row, user: string, products: string[], entitlement: string, allowSandbox = false, now = Date.now()) {
  const checked = data?.request_date_ms;
  const subscriber = data?.subscriber;
  if (!isBillingUser(user) || !Number.isSafeInteger(checked) || Math.abs(checked - now) > 300_000 || !subscriber || !subscriber.entitlements || !subscriber.subscriptions || typeof subscriber.original_app_user_id !== 'string') throw new Error('Resposta de assinatura inválida.');
  const empty = { checkedAt: new Date(checked).toISOString(), active: false, source: null, product: null, expiresAt: null, since: null, autoRenew: false };
  // Keep-original ownership is required in RevenueCat. No anonymous/family aliases.
  if (subscriber.original_app_user_id !== user) return empty;
  const ent = subscriber.entitlements[entitlement];
  if (!ent) return empty;
  const product = ent.product_identifier;
  const sub = subscriber.subscriptions[product];
  if (!products.includes(product) || !sub || !['app_store','play_store'].includes(sub.store) || sub.ownership_type === 'FAMILY_SHARED') throw new Error('Produto/loja incompatível com Premium.');
  if (typeof sub.is_sandbox !== 'boolean' || (sub.is_sandbox && !allowSandbox)) throw new Error('Compra de teste não habilita Premium em produção.');
  const end = date(ent.expires_date), purchased = date(ent.purchase_date);
  if (end === null || purchased === null || purchased > now + 300_000) throw new Error('Período da assinatura inválido.');
  const grace = date(ent.grace_period_expires_date);
  const effectiveEnd = Math.max(end, grace ?? end);
  const active = effectiveEnd > now && !sub.refunded_at;
  return { ...empty, active, source: sub.store, product, expiresAt: new Date(active ? effectiveEnd : Math.min(end, now)).toISOString(),
    since: new Date(purchased).toISOString(), autoRenew: active && !sub.unsubscribe_detected_at && !sub.billing_issues_detected_at };
}

export function nativeBillingConfig() {
  const key = Deno.env.get('REVENUECAT_SECRET_KEY');
  const plan = Deno.env.get('REVENUECAT_PREMIUM_PLAN_ID');
  const products = (Deno.env.get('REVENUECAT_PREMIUM_PRODUCTS') ?? '').split(',').map(v => v.trim()).filter(Boolean);
  if (Deno.env.get('NATIVE_BILLING_ENABLED') !== 'true' || !key || !isBillingUser(plan) || !products.length) throw new Error('Assinatura pela loja ainda não configurada/homologada.');
  return { key, plan, products, entitlement: Deno.env.get('REVENUECAT_ENTITLEMENT') ?? 'premium', allowSandbox: Deno.env.get('NATIVE_BILLING_ALLOW_SANDBOX') === 'true' };
}
export async function reconcileNativeSubscription(service: any, user: string, config: ReturnType<typeof nativeBillingConfig>, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user)}`, {
    headers: { Authorization: `Bearer ${config.key}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error('Confirmação da loja temporariamente indisponível. Não repita a compra.');
  const proof = nativeSubscriptionProof(await response.json(), user, config.products, config.entitlement, config.allowSandbox);
  const { error } = await service.rpc('apply_native_subscription', { p_user: user, p_plan: config.plan, p_checked_at: proof.checkedAt,
    p_source: proof.source, p_product: proof.product, p_expires: proof.expiresAt, p_since: proof.since, p_auto_renew: proof.autoRenew, p_active: proof.active });
  if (error) throw new Error('Não foi possível registrar a confirmação da assinatura. Consulte novamente; não repita a compra.');
}
export async function verifyNativeWebhook(raw: string, headers: Headers, secret: string, auth: string, now = Date.now()) {
  // Both dashboard Authorization and HMAC must be configured.
  const encoder = new TextEncoder();
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  const left = await digest(headers.get('Authorization') ?? ''), right = await digest(auth);
  let difference = 0; for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  if (!auth || difference !== 0) return false;
  const signature = headers.get('X-RevenueCat-Webhook-Signature') ?? '';
  const match = /^t=(\d+),v1=([a-f0-9]{64})$/i.exec(signature);
  if (!secret || !match || Math.abs(now / 1000 - Number(match[1])) > 300) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = new Uint8Array(match[2].match(/../g)!.map(v => parseInt(v, 16)));
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(`${match[1]}.${raw}`));
}
