// Pure provider adapters with synthetic responses: no network and no money.
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  ts = require("typescript"),
  Module = require("node:module"),
  path = require("node:path");
function source(name) {
  const file = path.resolve(__dirname, "../supabase/functions/_shared", name),
    m = new Module(file);
  m.filename = file;
  m.paths = module.paths;
  m._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
  return m.exports;
}
const g = source("shopGateway.ts"),
  { validSignature } = source("commercialSignature.ts");
const ctx = {
  id: "00000000-0000-4000-8000-000000000001",
  gateway: {
    id: "gateway-test",
    provider: "mercado_pago",
    collector_id: "123",
  },
  credentials: { accessToken: "SYNTHETIC-ONLY" },
  subtotal_cents: 10000,
  shipping_cents: 1000,
  total_cents: 11000,
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 1800000).toISOString(),
};
const p = {
  id: 101,
  collector_id: 123,
  live_mode: true,
  currency_id: "BRL",
  external_reference: "shop:" + ctx.id,
  transaction_amount: 110,
  status: "approved",
  date_last_updated: "2026-10-12T10:00:00Z",
  fee_details: [{ amount: 4.4 }],
};
const json = (d) =>
  new Response(JSON.stringify(d), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
async function run() {
  assert(g.validShopUrl("https://www.mercadopago.com.br/checkout/v1/test"));
  assert(g.validShopUrl("https://link.picpay.com/p/test"));
  assert(!g.validShopUrl("https://www.mercadopago.com.br.evil.test/checkout"));
  assert(!g.validShopUrl("http://link.picpay.com/p/test"));
  assert(!g.validShopUrl("https://link.picpay.com@evil.test/p/test"));
  assert.equal(g.mercadoReceipt(p, ctx).feeCents, 440);
  assert.equal(g.mercadoReceipt({ ...p, status: "pending" }, ctx), null);
  assert.equal(
    g.mercadoReceipt({ ...p, transaction_amount_refunded: 20 }, ctx).status,
    "partial_refund",
  );
  assert.equal(
    g.mercadoReceipt({ ...p, transaction_amount_refunded: 110 }, ctx).status,
    "refunded",
  );
  for (const patch of [
    { collector_id: 999 },
    { live_mode: false },
    { currency_id: "USD" },
    { transaction_amount: 1 },
    { external_reference: "shop:another" },
  ])
    assert.throws(
      () => g.mercadoReceipt({ ...p, ...patch }, ctx),
      g.ShopDiscrepancy,
    );
  let calls = [];
  const checkout = await g.createShopCheckout(
    ctx,
    "buyer@test.invalid",
    "https://app.test.invalid",
    "https://backend.test.invalid",
    async (url, options) => {
      calls.push({ url, options });
      return json({
        id: "preference",
        init_point: "https://www.mercadopago.com.br/checkout/test",
      });
    },
  );
  assert(checkout.url);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.items[0].unit_price, 110);
  assert.equal(body.items[0].quantity, 1);
  assert.equal(body.external_reference, "shop:" + ctx.id);
  assert.equal(calls[0].options.headers["X-Idempotency-Key"], ctx.id);
  assert(body.notification_url.endsWith("/shop-webhook/gateway-test"));
  await assert.rejects(
    g.createShopCheckout(
      ctx,
      undefined,
      "https://app.test.invalid",
      "https://backend.test.invalid",
      async () => json({ id: "x", init_point: "https://evil.test/checkout" }),
    ),
    /inválida/,
  );
  calls = [];
  const receipts = await g.refundShopPayment(
    ctx,
    "101",
    async (url, options) => {
      calls.push({ url, options });
      return options.method === "POST"
        ? json({ accepted: true })
        : json({ ...p, status: "approved" });
    },
  );
  assert.equal(receipts[0].status, "approved");
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].options.body).amount, 110);
  assert.equal(calls[1].options.method, "GET");
  const secret = "synthetic-key-for-test",
    requestId = "request-test",
    id = "101",
    stamp = String(Math.floor(Date.now() / 1000)),
    manifest = `id:${id};request-id:${requestId};ts:${stamp};`;
  const mac = require("node:crypto")
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");
  assert(await validSignature(`ts=${stamp},v1=${mac}`, requestId, id, secret));
  assert(
    !(await validSignature(`ts=${stamp},v1=${mac}`, requestId, "102", secret)),
  );
  assert(!(await validSignature(null, requestId, id, secret)));
  assert(await g.sameWebhookSecret(secret, secret));
  assert(!(await g.sameWebhookSecret(secret, secret + "x")));
  const pic = {
    ...ctx,
    gateway: { id: "pic-test", provider: "picpay", collector_id: "client" },
    credentials: {
      clientId: "SYNTHETIC-CLIENT",
      clientSecret: "SYNTHETIC-SECRET",
    },
    external_id: "pic-charge",
  };
  calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/oauth2/token"))
      return json({ access_token: "SYNTHETIC-TOKEN" });
    if (url.includes("/transactions"))
      return json({
        originId: "pic-charge",
        transactions: [
          {
            transactionId: "pic-payment",
            status: "PAYED",
            amount: 11000,
            updatedAt: "2026-10-12T10:00:00Z",
          },
        ],
        nextPage: null,
      });
    return json({
      amount: 11000,
      details: { orderNumber: ctx.id.slice(0, 15) },
    });
  };
  assert.equal(
    (await g.verifiedReceipts(pic, undefined, fetcher))[0].status,
    "approved",
  );
  assert.equal(
    (await g.verifiedReceipts(pic, undefined, fetcher))[0].paymentId,
    "pic-payment",
  );
  assert.equal(calls.filter((c) => c.url.endsWith("/oauth2/token")).length, 1);
  await assert.rejects(
    g.verifiedReceipts(pic, undefined, async (url, opt) =>
      url.includes("/transactions")
        ? json({ originId: "wrong-charge", transactions: [] })
        : fetcher(url, opt),
    ),
    g.ShopDiscrepancy,
  );
  const fresh = { ...pic, gateway: { ...pic.gateway, id: "pic-create-test" } };
  const created = await g.createShopCheckout(
    fresh,
    undefined,
    "https://app.test.invalid",
    "https://backend.test.invalid",
    async (url, opt) =>
      url.endsWith("/oauth2/token")
        ? json({ access_token: "SYNTHETIC-TOKEN" })
        : json({
            link: "https://link.picpay.com/p/pic-charge",
            brcode: "synthetic-only",
          }),
  );
  assert.equal(created.externalId, "pic-charge");
  console.log(
    "PASS: PSP recipients/currency/amount/reference, approved URLs, server checkout amounts and idempotency, API re-query after refunds, signed Mercado Pago callbacks, PicPay authorization, token cache, charge/transaction binding. Zero network/real charges.",
  );
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
