// Synthetic HTTP fixtures only; never connects to a provider or sends money.
const fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript"),
  assert = require("node:assert/strict");
const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
const g = require("../supabase/functions/_shared/invoiceGateway.ts");
const ctx = {
  id: "00000000-0000-4000-8000-000000000001",
  reference: "invoice:00000000-0000-4000-8000-000000000001",
  gateway: {
    id: "synthetic-gateway",
    provider: "mercado_pago",
    collector_id: "123",
  },
  credentials: {
    accessToken: "SYNTHETIC-ONLY",
    webhookSecret: "synthetic-not-a-secret",
  },
  total_cents: 1200,
  expires_at: new Date(Date.now() + 1800000).toISOString(),
  customer: { name: "Pessoa sintética", email: "synthetic@test.invalid" },
  required_method: "pix",
};
const payment = {
  id: 101,
  collector_id: 123,
  live_mode: true,
  currency_id: "BRL",
  external_reference: ctx.reference,
  transaction_amount: 12,
  payment_method_id: "pix",
  status: "approved",
  date_last_updated: "2026-10-12T10:00:00Z",
  point_of_interaction: {
    transaction_data: {
      qr_code: "000201-SYNTHETIC-ONLY",
      ticket_url: "https://www.mercadopago.com.br/payments/101/ticket",
    },
  },
};
const json = (d) =>
  new Response(JSON.stringify(d), {
    headers: { "content-type": "application/json" },
  });
async function run() {
  try {
    const calls = [],
      fetcher = async (url, options) => {
        calls.push({ url, options });
        return json(
          url.endsWith("/users/me") ? { id: 123, tags: [] } : payment,
        );
      };
    const created = await g.createInvoicePix(
      ctx,
      "https://backend.test.invalid",
      fetcher,
    );
    assert.equal(created.externalId, "101");
    const request = JSON.parse(calls[1].options.body);
    assert.equal(request.transaction_amount, 12);
    assert.equal(request.external_reference, ctx.reference);
    assert.equal(request.payment_method_id, "pix");
    assert.equal(calls[1].options.headers["X-Idempotency-Key"], ctx.id);
    assert.equal(
      request.notification_url,
      "https://backend.test.invalid/functions/v1/invoice-webhook/" + ctx.id,
    );
    const ready = { ...ctx, external_id: "101", provider_payment_id: "101" };
    const receipts = await g.reconcileInvoice(ready, async () => json(payment));
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].amountCents, 1200);
    for (const bad of [
      { collector_id: 999 },
      { transaction_amount: 13 },
      { currency_id: "USD" },
      { live_mode: false },
      { external_reference: "other" },
      { payment_method_id: "credit_card" },
    ])
      await assert.rejects(
        g.reconcileInvoice(ready, async () => json({ ...payment, ...bad })),
        /Divergência/,
      );
    assert.equal(
      await g.invoiceTerminal(ready, async () =>
        json({ ...payment, status: "pending" }),
      ),
      false,
    );
    assert.equal(
      await g.invoiceTerminal(ready, async () =>
        json({ ...payment, status: "cancelled" }),
      ),
      true,
    );
    let recovered = await g.recoverMercadoInvoice(ctx, async (u) =>
      json(
        u.endsWith("/users/me")
          ? { id: 123, tags: [] }
          : { results: [payment] },
      ),
    );
    assert.equal(recovered.externalId, "101");
    await assert.rejects(
      g.recoverMercadoInvoice(ctx, async (u) =>
        json(
          u.endsWith("/users/me")
            ? { id: 123, tags: [] }
            : { results: [payment, payment] },
        ),
      ),
      /Mais de uma/,
    );
    let refundCalls = [];
    const refundFetcher = async (u, o) => {
      refundCalls.push({ u, o });
      return json(
        o.method === "POST"
          ? {}
          : { ...payment, status: "refunded", transaction_amount_refunded: 12 },
      );
    };
    const refund = await g.refundInvoice(ready, refundFetcher);
    assert.equal(refund[0].status, "refunded");
    assert.equal(refundCalls.length, 2);
    assert.equal(refundCalls[1].o.method, "GET");
    const pic = {
      ...ctx,
      gateway: { id: "synthetic-picpay", provider: "picpay" },
      credentials: { clientId: "synthetic", clientSecret: "synthetic" },
      external_id: "link-synthetic",
    };
    const picCalls = [],
      pf = async (u, o) => {
        picCalls.push({ u, o });
        if (u.endsWith("/oauth2/token"))
          return json({ access_token: "synthetic-token" });
        if (u.endsWith("/create"))
          return json({
            paymentLinkId: "link-synthetic",
            link: "https://link.picpay.com/p/link-synthetic",
          });
        if (u.includes("/transactions"))
          return json({
            originId: "link-synthetic",
            transactions: [
              {
                transactionId: "pic-synthetic",
                status: "PAYED",
                amount: 1200,
                updatedAt: "2026-10-12T10:00:00Z",
              },
            ],
            nextPage: false,
          });
        return json({
          amount: 1200,
          details: { orderNumber: ctx.id.slice(0, 15) },
        });
      };
    const pc = await g.createInvoicePix(
      pic,
      "https://backend.test.invalid",
      pf,
    );
    assert.equal(pc.externalId, "link-synthetic");
    const pp = JSON.parse(picCalls.find((c) => c.u.endsWith("/create")).o.body);
    assert.deepEqual(pp.charge.payment.methods, ["BRCODE"]);
    assert.deepEqual(pp.charge.payment.brcode_arrangements, ["PIX"]);
    assert.equal(pp.charge.amounts.product, 1200);
    assert.equal((await g.reconcileInvoice(pic, pf))[0].amountCents, 1200);
    await assert.rejects(
      g.recoverInvoicePix(pic, "link-synthetic", async (u) =>
        u.endsWith("/oauth2/token")
          ? json({ access_token: "synthetic-token" })
          : json({
              amount: 1201,
              details: { orderNumber: ctx.id.slice(0, 15) },
            }),
      ),
      /não corresponde/,
    );
    const { invoiceCsv, receiptText } = (() => {
      const f = path.resolve("src/lib/invoiceExports.ts"),
        m = new Module(f);
      const load = m.require.bind(m);
      m.require = (n) =>
        n === "react-native"
          ? {}
          : n === "expo-file-system"
            ? {}
            : n === "expo-sharing"
              ? {}
              : n === "./venueOperations"
                ? { moneyCents: (c) => String(c / 100) }
                : load(n);
      m._compile(
        ts.transpileModule(fs.readFileSync(f, "utf8"), {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
        f,
      );
      return m.exports;
    })();
    const inv = {
      id: "invoice-synthetic",
      venue_name: '=HYPERLINK("bad")',
      customer_name: "Cliente; sintético",
      cut_date: "2026-10-12",
      due_date: "2026-10-17",
      balance_cents: 1200,
      status: "open",
      lines: [],
      payments: [],
      notes: [],
    };
    const csv = invoiceCsv([inv]);
    assert(csv.includes("'=HYPERLINK"));
    assert(csv.includes('"Cliente; sintético"'));
    assert(csv.startsWith("\ufeff"));
    assert(
      receiptText(inv, {
        id: "synthetic-receipt",
        amount_cents: 1200,
        method: "online_pix",
        paid_at: "2026-10-12T10:00:00Z",
      }).includes("não fiscal"),
    );
    console.log(
      "PASS: invoice Pix MP/PicPay creation, server amount/reference/merchant/currency/method, recovery, terminal proof, verified refund, CSV formula escaping and non-fiscal receipts. Zero real network or money.",
    );
  } finally {
    if (previous) Module._extensions[".ts"] = previous;
    else delete Module._extensions[".ts"];
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
