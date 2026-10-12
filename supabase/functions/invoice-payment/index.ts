import { createClient } from "npm:@supabase/supabase-js@2";
import { picPayToken, providerJson } from "../_shared/shopGateway.ts";
import {
  createInvoicePix,
  reconcileInvoice,
  recoverInvoicePix,
  refundInvoice,
  ShopDiscrepancy,
  recoverMercadoInvoice,
  invoiceTerminal,
} from "../_shared/invoiceGateway.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply({});
  if (req.method !== "POST") return reply({ error: "Método inválido." }, 405);
  const backend = Deno.env.get("SUPABASE_URL")!,
    service = createClient(
      backend,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    ),
    bearer = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!bearer) return reply({ error: "Entre na conta." }, 401);
  const { data: auth, error: authError } = await service.auth.getUser(bearer);
  if (authError || !auth.user) return reply({ error: "Sessão inválida." }, 401);
  let intentId: string | null = null;
  const call = async (action: string, data: Record<string, unknown>) => {
    const { data: r, error } = await service.rpc("credit_payment_service", {
      p_action: action,
      p_data: data,
    });
    if (error)
      throw new Error(
        error.message.includes("FATURA:")
          ? error.message.split("FATURA:")[1].trim()
          : "Não foi possível concluir. Consulte a fatura.",
      );
    return r;
  };
  try {
    const b = await req.json();
    await call("access", { actor: auth.user.id });
    if (b.action === "connect") {
      const owner = async (action: string, data: Record<string, unknown>) => {
        const { data: r, error } = await service.rpc(
          "credit_gateway_connection",
          {
            p_action: action,
            p_data: { actor: auth.user.id, venueId: b.venueId, ...data },
          },
        );
        if (error)
          throw new Error(
            error.message.includes("FATURA:")
              ? error.message.split("FATURA:")[1].trim()
              : "Não foi possível configurar o gateway.",
          );
        return r;
      };
      await owner("access", {});
      if (!b.confirmed)
        return reply(
          { error: "Confirme a configuração do webhook e a homologação." },
          400,
        );
      const c = b.credentials;
      if (
        !c ||
        JSON.stringify(c).length > 8000 ||
        typeof c.webhookSecret !== "string" ||
        c.webhookSecret.length < 16
      )
        return reply(
          { error: "Informe credenciais e segredo de webhook." },
          400,
        );
      let collectorId = "",
        label = "";
      if (b.provider === "mercado_pago") {
        if (
          typeof c.accessToken !== "string" ||
          c.accessToken.startsWith("TEST-")
        )
          return reply(
            {
              error:
                "Use credencial de produção autenticada. Homologação financeira usa outro projeto.",
            },
            400,
          );
        const merchant = await providerJson(
          "https://api.mercadopago.com/users/me",
          c.accessToken,
        );
        if (!merchant.id || merchant.tags?.includes("test_user"))
          return reply({ error: "Conta de produção necessária." }, 400);
        collectorId = String(merchant.id);
        label = "Mercado Pago · " + collectorId;
      } else if (b.provider === "picpay") {
        if (!c.clientId || !c.clientSecret)
          return reply(
            { error: "Informe Client ID e Client Secret PicPay." },
            400,
          );
        await picPayToken(c, "connect:" + crypto.randomUUID());
        collectorId = String(c.clientId);
        label = "PicPay · conta autenticada";
      } else return reply({ error: "Gateway não suportado." }, 400);
      const r = await owner("save", {
        provider: b.provider,
        credentials: c,
        collectorId,
        accountLabel: label,
        confirmed: true,
      });
      return reply({
        id: r.id,
        message:
          "Credenciais autenticadas e guardadas no Vault. Pix de faturas depende da liberação/homologação da plataforma; cartão e aproximação não foram habilitados automaticamente.",
        webhookUrl:
          b.provider === "picpay"
            ? `${backend}/functions/v1/invoice-webhook/gateway/${r.id}`
            : `${backend}/functions/v1/invoice-webhook/<ID-DA-COBRANCA>`,
      });
    }
    if (!["checkout", "reconcile", "refund", "recover"].includes(b.action))
      return reply({ error: "Ação inválida." }, 400);
    if (b.action === "checkout") {
      if (Deno.env.get("INVOICE_PAYMENTS_ENABLED") !== "true")
        return reply(
          {
            error:
              "Pix de faturas aguarda configuração e homologação do estabelecimento.",
          },
          409,
        );
      const claim = await call("prepare", {
        actor: auth.user.id,
        invoiceId: b.invoiceId,
        requestId: b.requestId,
        allowPicpay: Deno.env.get("INVOICE_PICPAY_ENABLED") === "true",
      });
      intentId = claim.id;
      let ctx = await call("context", { actor: auth.user.id, intentId });
      if (
        ctx.provider === "picpay" &&
        Deno.env.get("INVOICE_PICPAY_ENABLED") !== "true"
      )
        throw new Error(
          "PicPay de faturas aguarda homologação específica. Consulte a cobrança antes de repetir.",
        );
      if (claim.claimed) {
        const result = await createInvoicePix(ctx, backend);
        await call("checkout_save", { intentId, ...result });
        ctx = await call("context", { actor: auth.user.id, intentId });
      } else
        for (const receipt of await reconcileInvoice(ctx))
          await call("settle", { intentId, ...receipt });
      return reply({
        id: intentId,
        message:
          ctx.pix_code || ctx.checkout_url
            ? "Pix preparado. Só a confirmação do provedor baixa a fatura."
            : "Cobrança em reconciliação. Não faça outra baixa.",
      });
    }
    intentId = b.intentId;
    let ctx = await call("context", { actor: auth.user.id, intentId });
    if (b.action === "recover") {
      await call("recover_access", { actor: auth.user.id, intentId });
      const result = await recoverInvoicePix(ctx, b.externalId);
      await call("checkout_save", { intentId, ...result });
      ctx = await call("context", { actor: auth.user.id, intentId });
    }
    if (b.action === "refund") {
      if (!b.confirmed)
        return reply({ error: "Confirme a devolução integral." }, 400);
      const claim = await call("refund_claim", {
        actor: auth.user.id,
        intentId,
      });
      if (claim.claimed)
        for (const receipt of await refundInvoice(ctx))
          await call("settle", { intentId, ...receipt });
      else
        for (const receipt of await reconcileInvoice(ctx))
          await call("settle", { intentId, ...receipt });
      return reply({
        id: intentId,
        message:
          "Devolução solicitada/consultada; consulte o extrato para a confirmação. O clique não comprova devolução.",
      });
    }
    const recovered = await recoverMercadoInvoice(ctx);
    if (recovered) {
      await call("checkout_save", { intentId, ...recovered });
      ctx = await call("context", { actor: auth.user.id, intentId });
    }
    for (const receipt of await reconcileInvoice(ctx))
      await call("settle", { intentId, ...receipt });
    if (await invoiceTerminal(ctx)) await call("terminal", { intentId });
    return reply({
      id: intentId,
      message:
        "Provedor consultado. Somente pagamentos verificados foram baixados.",
    });
  } catch (e) {
    if (intentId)
      try {
        await call(e instanceof ShopDiscrepancy ? "review" : "uncertain", {
          intentId,
          code: "provider_mismatch",
        });
      } catch {}
    return reply(
      {
        error:
          e instanceof Error
            ? e.message
            : "Operação inconclusiva. Consulte a fatura.",
      },
      409,
    );
  }
});
