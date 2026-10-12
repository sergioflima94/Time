import {
  picPayToken,
  providerJson,
  verifiedReceipts,
  validShopUrl,
  refundShopPayment,
  ShopDiscrepancy,
} from "./shopGateway.ts";
export { verifiedReceipts, ShopDiscrepancy };
type Context = Record<string, any>;
export async function createInvoicePix(
  ctx: Context,
  backend: string,
  fetcher: typeof fetch = fetch,
) {
  if (ctx.gateway.provider === "mercado_pago") {
    const token = ctx.credentials.accessToken,
      merchant = await providerJson(
        "https://api.mercadopago.com/users/me",
        token,
        undefined,
        fetcher,
      );
    if (
      !merchant.id ||
      merchant.tags?.includes("test_user") ||
      token?.startsWith("TEST-")
    )
      throw new Error(
        "Configure conta de produção homologada; testes financeiros usam outro projeto.",
      );
    const response = await fetcher("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": ctx.id,
      },
      body: JSON.stringify({
        transaction_amount: ctx.total_cents / 100,
        description: "Fatura MarcouJogou",
        payment_method_id: "pix",
        external_reference: ctx.reference,
        date_of_expiration: ctx.expires_at,
        payer: { email: ctx.customer.email },
        notification_url: `${backend}/functions/v1/invoice-webhook/${ctx.id}`,
      }),
    });
    if (!response.ok)
      throw new Error(
        "Não foi possível confirmar a criação do Pix. Reconcilie antes de repetir.",
      );
    const data = await response.json();
    if (
      !data.id ||
      data.external_reference !== ctx.reference ||
      Math.round(Number(data.transaction_amount) * 100) !== ctx.total_cents ||
      String(data.collector_id) !== String(merchant.id) ||
      data.currency_id !== "BRL" ||
      data.live_mode !== true
    )
      throw new ShopDiscrepancy(
        "Pix devolveu recebedor, valor ou referência divergente.",
      );
    const code = data.point_of_interaction?.transaction_data?.qr_code,
      url = data.point_of_interaction?.transaction_data?.ticket_url;
    if (typeof code !== "string" || code.length < 10)
      throw new Error("Pix inconclusivo: consulte novamente.");
    return {
      externalId: String(data.id),
      pixCode: code,
      url: validShopUrl(url) ? url : null,
      collectorId: String(merchant.id),
    };
  }
  const token = await picPayToken(ctx.credentials, ctx.gateway.id, fetcher);
  const data = await providerJson(
    "https://ecommerce-api.svc.picpay.com/v1/paymentlink/create",
    token,
    {
      charge: {
        name: "Fatura MarcouJogou",
        description: ctx.id,
        order_number: ctx.id.slice(0, 15),
        redirect_url: "https://app.marcoujogou.com.br/faturas",
        payment: { methods: ["BRCODE"], brcode_arrangements: ["PIX"] },
        amounts: { product: ctx.total_cents, delivery: 0 },
      },
      options: {
        allow_create_pix_key: false,
        expired_at: new Date(ctx.expires_at).toISOString().slice(0, 10),
      },
    },
    fetcher,
  );
  if (!validShopUrl(data.link))
    throw new Error("Link Pix inconclusivo. Não crie outra cobrança.");
  const externalId = String(
    data.paymentLinkId ??
      data.id ??
      new URL(data.link).pathname.split("/").pop(),
  );
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(externalId))
    throw new Error("Resposta do provedor inválida.");
  return {
    externalId,
    url: data.link,
    pixCode: data.brcode ?? null,
    collectorId: String(ctx.credentials.clientId),
  };
}
export async function reconcileInvoice(
  ctx: Context,
  fetcher: typeof fetch = fetch,
) {
  if (ctx.gateway.provider === "mercado_pago" && !ctx.gateway.collector_id) {
    const m = await providerJson(
      "https://api.mercadopago.com/users/me",
      ctx.credentials.accessToken,
      undefined,
      fetcher,
    );
    if (!m.id || m.tags?.includes("test_user"))
      throw new ShopDiscrepancy("Recebedor não homologado.");
    ctx = { ...ctx, gateway: { ...ctx.gateway, collector_id: String(m.id) } };
  }
  return verifiedReceipts(
    ctx,
    ctx.gateway.provider === "mercado_pago" && ctx.external_id
      ? ctx.external_id
      : undefined,
    fetcher,
  );
}
export async function recoverInvoicePix(
  ctx: Context,
  externalId: string,
  fetcher: typeof fetch = fetch,
) {
  if (
    ctx.gateway.provider !== "picpay" ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(externalId)
  )
    throw new Error("Recuperação disponível para link PicPay.");
  const token = await picPayToken(ctx.credentials, ctx.gateway.id, fetcher),
    data = await providerJson(
      `https://ecommerce-api.svc.picpay.com/v1/paymentlink/${encodeURIComponent(externalId)}`,
      token,
      undefined,
      fetcher,
    );
  if (
    Number(data.amount) !== ctx.total_cents ||
    data.details?.orderNumber !== ctx.id.slice(0, 15)
  )
    throw new ShopDiscrepancy("Link não corresponde à fatura.");
  // A verified merchant resource is recoverable even when its create response was lost.
  const candidate = data.link ?? `https://link.picpay.com/p/${externalId}`;
  if (!validShopUrl(candidate)) throw new Error("Link inválido.");
  return {
    externalId,
    url: candidate,
    pixCode: data.brcode ?? null,
    collectorId: String(ctx.credentials.clientId),
  };
}
export async function refundInvoice(
  ctx: Context,
  fetcher: typeof fetch = fetch,
) {
  if (ctx.refund_request_id && ctx.gateway.provider === "mercado_pago") {
    const amount = ctx.refund_amount_cents;
    if (!Number.isInteger(amount) || amount <= 0 || amount > ctx.total_cents)
      throw Error("Valor de devolução inválido.");
    const response = await fetcher(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(ctx.provider_payment_id)}/refunds`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(12000),
        headers: {
          Authorization: `Bearer ${ctx.credentials.accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": ctx.refund_request_id,
        },
        body: JSON.stringify({ amount: amount / 100 }),
      },
    );
    if (!response.ok)
      throw Error(
        "Devolução inconclusiva. Consulte o provedor antes de outra solicitação.",
      );
    return reconcileInvoice(ctx, fetcher);
  }
  if (!ctx.provider_payment_id)
    throw new Error("Consulte o recebimento antes de devolver.");
  return refundShopPayment(ctx, ctx.provider_payment_id, fetcher);
}
export async function recoverMercadoInvoice(
  ctx: Context,
  fetcher: typeof fetch = fetch,
) {
  if (ctx.gateway.provider !== "mercado_pago" || ctx.external_id) return null;
  const merchant = await providerJson(
    "https://api.mercadopago.com/users/me",
    ctx.credentials.accessToken,
    undefined,
    fetcher,
  );
  const data = await providerJson(
    `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(ctx.reference)}&sort=date_created&criteria=desc&limit=50`,
    ctx.credentials.accessToken,
    undefined,
    fetcher,
  );
  if (!Array.isArray(data.results))
    throw new Error("Consulta do provedor inconclusiva.");
  if (data.results.length > 1)
    throw new ShopDiscrepancy("Mais de uma cobrança no provedor.");
  if (!data.results.length) return null;
  const p = data.results[0];
  if (
    !merchant.id ||
    String(p.collector_id) !== String(merchant.id) ||
    p.external_reference !== ctx.reference ||
    p.currency_id !== "BRL" ||
    p.live_mode !== true ||
    p.payment_method_id !== "pix" ||
    Math.round(Number(p.transaction_amount) * 100) !== ctx.total_cents
  )
    throw new ShopDiscrepancy("Cobrança recuperada divergente.");
  return {
    externalId: String(p.id),
    collectorId: String(merchant.id),
    pixCode: p.point_of_interaction?.transaction_data?.qr_code ?? null,
    url: validShopUrl(p.point_of_interaction?.transaction_data?.ticket_url)
      ? p.point_of_interaction.transaction_data.ticket_url
      : null,
  };
}
export async function invoiceTerminal(
  ctx: Context,
  fetcher: typeof fetch = fetch,
) {
  if (ctx.gateway.provider !== "mercado_pago" || !ctx.external_id) return false;
  const p = await providerJson(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(ctx.external_id)}`,
    ctx.credentials.accessToken,
    undefined,
    fetcher,
  );
  if (
    String(p.collector_id) !== ctx.gateway.collector_id ||
    p.external_reference !== ctx.reference ||
    p.currency_id !== "BRL" ||
    p.live_mode !== true ||
    Math.round(Number(p.transaction_amount) * 100) !== ctx.total_cents ||
    p.payment_method_id !== "pix"
  )
    throw new ShopDiscrepancy("Cobrança divergente.");
  return ["cancelled", "rejected"].includes(p.status);
}
