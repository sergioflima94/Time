// Official APIs. Never accepts an amount or recipient supplied by the browser.
export const validShopUrl = (url: unknown) =>
  typeof url === "string" &&
  /^https:\/\/(?:(?:www\.)?mercadopago\.com\.br\/|(?:link|cobranca)\.(?:picpay\.com|ppay\.me)\/p\/)/.test(
    url,
  );
type Context = Record<string, any>;
export class ShopDiscrepancy extends Error {}
export async function sameWebhookSecret(supplied: string, expected: string) {
  if (!expected) return false;
  const encoded = new TextEncoder(),
    [a, b] = await Promise.all([
      crypto.subtle.digest("SHA-256", encoded.encode(supplied)),
      crypto.subtle.digest("SHA-256", encoded.encode(expected)),
    ]);
  const aa = new Uint8Array(a),
    bb = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
}
const picTokens = new Map<string, { value: string; until: number }>(),
  picPending = new Map<string, Promise<string>>();
async function providerBody(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new Error(
      "Resposta do provedor inválida. Consulte o pedido antes de repetir a operação.",
    );
  }
}
export async function providerJson(
  url: string,
  token: string,
  body?: unknown,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw new Error(
      "Provedor indisponível ou recusou a operação. Reconcilie antes de criar outra cobrança.",
    );
  return providerBody(response);
}
export async function picPayToken(
  credentials: Context,
  key: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const cached = picTokens.get(key);
  if (cached && cached.until > Date.now()) return cached.value;
  const pending = picPending.get(key);
  if (pending) return pending;
  const work = (async () => {
    const res = await fetcher(
      "https://ecommerce-api.svc.picpay.com/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) throw new Error("PicPay não autorizou estas credenciais.");
    const data = await providerBody(res);
    if (!data.access_token) throw new Error("Autorização PicPay inválida.");
    picTokens.set(key, {
      value: data.access_token,
      until: Date.now() + 240000,
    });
    return data.access_token;
  })();
  picPending.set(key, work);
  try {
    return await work;
  } finally {
    picPending.delete(key);
  }
}
export async function createShopCheckout(
  ctx: Context,
  email: string | undefined,
  base: string,
  backend: string,
  fetcher: typeof fetch = fetch,
) {
  if (ctx.gateway.provider === "mercado_pago") {
    const response = await fetcher(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.credentials.accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": ctx.id,
        },
        body: JSON.stringify({
          external_reference: `shop:${ctx.id}`,
          items: [
            {
              id: ctx.id,
              title: `MarcouJogou · pedido ${ctx.id.slice(0, 8)}`,
              quantity: 1,
              currency_id: "BRL",
              unit_price: ctx.total_cents / 100,
            },
          ],
          payer: { email },
          binary_mode: true,
          expires: true,
          expiration_date_from: ctx.created_at,
          expiration_date_to: ctx.expires_at,
          payment_methods: {
            excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
            installments: 1,
          },
          notification_url: `${backend}/functions/v1/shop-webhook/${ctx.gateway.id}`,
          back_urls: {
            success: `${base}/loja/pedido/${ctx.id}`,
            pending: `${base}/loja/pedido/${ctx.id}`,
            failure: `${base}/loja/pedido/${ctx.id}`,
          },
        }),
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!response.ok)
      throw new Error(
        "Checkout não confirmado pelo Mercado Pago. Use a reconciliação antes de tentar novamente.",
      );
    const data = await providerBody(response);
    if (!validShopUrl(data.init_point) || !data.id)
      throw new Error("Resposta de checkout inválida.");
    return { externalId: String(data.id), url: data.init_point, pixCode: null };
  }
  const token = await picPayToken(ctx.credentials, ctx.gateway.id, fetcher);
  const data = await providerJson(
    "https://ecommerce-api.svc.picpay.com/v1/paymentlink/create",
    token,
    {
      charge: {
        name: "Pedido MarcouJogou",
        description: ctx.id,
        order_number: ctx.id.slice(0, 15),
        redirect_url: `${base}/loja/pedido/${ctx.id}`,
        payment: {
          methods: ["BRCODE", "CREDIT_CARD"],
          brcode_arrangements: ["PICPAY", "PIX"],
        },
        amounts: { product: ctx.subtotal_cents, delivery: ctx.shipping_cents },
      },
      options: {
        allow_create_pix_key: false,
        card_max_installment_number: 1,
        expired_at: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      },
    },
    fetcher,
  );
  if (!validShopUrl(data.link)) throw new Error("Link PicPay inválido.");
  const externalId = String(
    data.paymentLinkId ??
      data.id ??
      new URL(data.link).pathname.split("/").pop(),
  );
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(externalId))
    throw new Error("Identificador PicPay inválido.");
  return { externalId, url: data.link, pixCode: data.brcode ?? null };
}
function cents(n: unknown) {
  const value = Number(n),
    result = Math.round(value * 100);
  if (
    !Number.isFinite(value) ||
    !Number.isSafeInteger(result) ||
    Math.abs(value * 100 - result) > 0.00001
  )
    throw new Error("Valor do provedor inválido.");
  return result;
}
export function mercadoReceipt(payment: Context, ctx: Context) {
  if (
    String(payment.collector_id) !== ctx.gateway.collector_id ||
    payment.live_mode !== true ||
    payment.currency_id !== "BRL" ||
    payment.external_reference !== (ctx.reference ?? `shop:${ctx.id}`) ||
    (ctx.required_method && payment.payment_method_id !== ctx.required_method) ||
    cents(payment.transaction_amount) !== ctx.total_cents
  )
    throw new ShopDiscrepancy(
      "Divergência no valor, moeda, referência ou recebedor do pagamento.",
    );
  const refunded = cents(payment.transaction_amount_refunded ?? 0);
  const status =
    refunded >= ctx.total_cents || payment.status === "refunded"
      ? "refunded"
      : refunded > 0
        ? "partial_refund"
        : payment.status;
  if (
    !["approved", "refunded", "partial_refund", "charged_back"].includes(status)
  )
    return null;
  return {
    orderId: ctx.id,
    gatewayId: ctx.gateway.id,
    paymentId: String(payment.id),
    amountCents: ctx.total_cents,
    currency: "BRL",
    status,
    updatedAt: payment.date_last_updated,
    feeCents: Array.isArray(payment.fee_details)
      ? payment.fee_details.reduce(
          (n: number, r: Context) => n + cents(r.amount),
          0,
        )
      : null,
    refundedCents: refunded,
    netCents: payment.transaction_details?.net_received_amount == null ? null : cents(payment.transaction_details.net_received_amount),
  };
}
export async function verifiedReceipts(
  ctx: Context,
  paymentId?: string,
  fetcher: typeof fetch = fetch,
) {
  if (ctx.gateway.provider === "mercado_pago") {
    const token = ctx.credentials.accessToken;
    const rows = paymentId
      ? [
          await providerJson(
            `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
            token,
            undefined,
            fetcher,
          ),
        ]
      : (
          await providerJson(
            `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(ctx.reference ?? "shop:" + ctx.id)}&sort=date_created&criteria=desc&limit=50`,
            token,
            undefined,
            fetcher,
          )
        ).results;
    if (!Array.isArray(rows))
      throw new Error("Consulta Mercado Pago inválida.");
    return rows.map((p) => mercadoReceipt(p, ctx)).filter(Boolean);
  }
  if (!ctx.external_id) return [];
  const token = await picPayToken(ctx.credentials, ctx.gateway.id, fetcher),
    id = encodeURIComponent(ctx.external_id);
  const charge = await providerJson(
    `https://ecommerce-api.svc.picpay.com/v1/paymentlink/${id}`,
    token,
    undefined,
    fetcher,
  );
  if (
    Number(charge.amount) !== ctx.total_cents ||
    charge.details?.orderNumber !== ctx.id.slice(0, 15)
  )
    throw new ShopDiscrepancy("Cobrança PicPay divergente.");
  const rows: Context[] = [];
  let page = 1;
  while (page <= 10) {
    const data = await providerJson(
      `https://ecommerce-api.svc.picpay.com/v1/paymentlink/${id}/transactions?page=${page}&perPage=50`,
      token,
      undefined,
      fetcher,
    );
    if (data.originId !== ctx.external_id || !Array.isArray(data.transactions))
      throw new ShopDiscrepancy("Transações PicPay divergentes.");
    rows.push(...data.transactions);
    if (!data.nextPage) break;
    page++;
    if (page > 10)
      throw new Error("Muitas transações; revisão manual necessária.");
  }
  return rows.flatMap((p) => {
    if (!["PAYED", "REFUNDED", "PARTREFUNDED"].includes(p.status)) return [];
    const status =
      p.status === "PAYED"
        ? "approved"
        : p.status === "REFUNDED"
          ? "refunded"
          : "partial_refund";
    if (status === "approved" && Number(p.amount) !== ctx.total_cents)
      throw new ShopDiscrepancy("Valor da transação PicPay divergente.");
    const stamp = String(p.updatedAt).includes("T")
      ? new Date(p.updatedAt).toISOString()
      : new Date(String(p.updatedAt).replace(" ", "T") + "Z").toISOString();
    return [
      {
        orderId: ctx.id,
        gatewayId: ctx.gateway.id,
        paymentId: String(p.originalTransactionId ?? p.transactionId ?? p.id),
        amountCents: ctx.total_cents,
        currency: "BRL",
        status,
        updatedAt: stamp,
        feeCents: null,
      },
    ];
  });
}
export async function refundShopPayment(
  ctx: Context,
  paymentId: string,
  fetcher: typeof fetch = fetch,
) {
  if (ctx.gateway.provider === "mercado_pago") {
    const response = await fetcher(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}/refunds`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.credentials.accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `${ctx.id}:${paymentId}:full`,
        },
        body: JSON.stringify({ amount: ctx.total_cents / 100 }),
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!response.ok)
      throw new Error(
        "Reembolso não confirmado. Reconcilie no provedor; não repita uma operação incerta.",
      );
  } else {
    const token = await picPayToken(ctx.credentials, ctx.gateway.id, fetcher);
    await providerJson(
      `https://ecommerce-api.svc.picpay.com/v1/paymentlink/transaction/${encodeURIComponent(paymentId)}/refund`,
      token,
      {},
      fetcher,
    );
  }
  // A successful POST is not proof of settlement. Always re-query.
  return verifiedReceipts(
    ctx,
    ctx.gateway.provider === "mercado_pago" ? paymentId : undefined,
    fetcher,
  );
}
