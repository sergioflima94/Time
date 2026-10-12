import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createShopCheckout,
  picPayToken,
  providerJson,
  refundShopPayment,
  verifiedReceipts,
  validShopUrl,
  ShopDiscrepancy,
} from "../_shared/shopGateway.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
serve(async (req) => {
  if (req.method === "OPTIONS") return json({});
  if (req.method !== "POST") return json({ error: "Método inválido" }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Entre na conta" }, 401);
    const backend = Deno.env.get("SUPABASE_URL")!,
      user = createClient(backend, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: auth } },
      }),
      service = createClient(
        backend,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
    const { data: session } = await user.auth.getUser();
    if (!session.user) return json({ error: "Sessão inválida" }, 401);
    const body = await req.json().catch(() => {
        throw new Error("Requisição inválida.");
      }),
      actor = session.user.id;
    const call = async (action: string, data: Record<string, unknown>) => {
      const { data: result, error } = await service.rpc("shop_service", {
        p_action: action,
        p_data: data,
      });
      if (error)
        throw new Error(
          error.message.includes("LOJA:")
            ? error.message.split("LOJA:")[1]
            : "Operação indisponível. Atualize e reconcilie o pedido.",
        );
      return result;
    };
    if (body.action === "connect") {
      await call("seller_access", { actor, sellerId: body.sellerId });
      if (Deno.env.get("SHOP_PAYMENTS_ENABLED") !== "true")
        return json(
          {
            error:
              "Pagamentos da loja ainda precisam de homologação e liberação da plataforma.",
          },
          409,
        );
      const credentials = body.credentials,
        provider = body.provider;
      if (
        !credentials ||
        !["mercado_pago", "picpay"].includes(provider) ||
        JSON.stringify(credentials).length > 8000
      )
        return json({ error: "Credenciais inválidas" }, 400);
      let collectorId = "";
      if (provider === "mercado_pago") {
        if (
          typeof credentials.accessToken !== "string" ||
          credentials.accessToken.startsWith("TEST-") ||
          typeof credentials.webhookSecret !== "string" ||
          credentials.webhookSecret.length < 16
        )
          return json(
            { error: "Informe credenciais de produção e segredo de webhook." },
            400,
          );
        const account = await providerJson(
          "https://api.mercadopago.com/users/me",
          credentials.accessToken,
        );
        if (!account.id || account.tags?.includes("test_user"))
          return json({ error: "Conta de produção necessária" }, 400);
        collectorId = String(account.id);
      } else {
        if (Deno.env.get("SHOP_PICPAY_ENABLED") !== "true")
          return json(
            { error: "PicPay da loja aguarda homologação específica." },
            409,
          );
        if (
          !credentials.clientId ||
          !credentials.clientSecret ||
          !credentials.webhookSecret ||
          credentials.webhookSecret.length < 16
        )
          return json(
            {
              error:
                "Informe Client ID, Client Secret e API Key do webhook PicPay.",
            },
            400,
          );
        await picPayToken(credentials, `connect:${crypto.randomUUID()}`);
        collectorId = String(credentials.clientId);
      }
      const result = await call("gateway_save", {
        actor,
        sellerId: body.sellerId,
        provider,
        collectorId,
        credentials,
      });
      return json({
        gatewayId: result.id,
        webhookUrl: `${backend}/functions/v1/shop-webhook/${result.id}`,
        message:
          "Credencial autenticada e armazenada no Vault, sem liberar vendas. Configure esta URL e solicite a homologação/liberação da plataforma.",
      });
    }
    const ctx = await call("context", { actor, orderId: body.orderId });
    const settle = async (work: () => Promise<any[]>) => {
      try {
        for (const receipt of await work()) await call("settle", receipt);
      } catch (e) {
        if (e instanceof ShopDiscrepancy)
          await call("review", { orderId: ctx.id });
        throw e;
      }
    };
    if (body.action === "checkout") {
      if (
        Deno.env.get("SHOP_PAYMENTS_ENABLED") !== "true" ||
        (ctx.gateway.provider === "picpay" &&
          Deno.env.get("SHOP_PICPAY_ENABLED") !== "true")
      )
        return json(
          { error: "Checkout ainda não homologado/liberado pela plataforma." },
          409,
        );
      if (
        ctx.status !== "pending" ||
        Date.parse(ctx.expires_at) < Date.now() ||
        !ctx.gateway.enabled
      )
        return json(
          {
            error:
              "Pedido expirado ou checkout indisponível. Confira seus pedidos.",
          },
          409,
        );
      if (ctx.checkout_url) return json({ url: ctx.checkout_url });
      const claim = await call("claim_checkout", { actor, orderId: ctx.id });
      if (!claim.claimed)
        return json(
          {
            error:
              "Checkout em preparação/reconciliação. Não crie outra cobrança.",
          },
          409,
        );
      const result = await createShopCheckout(
        ctx,
        session.user.email,
        "https://app.marcoujogou.com.br",
        backend,
      );
      await call("checkout_save", { orderId: ctx.id, ...result });
      return json({ url: result.url });
    }
    if (body.action === "reconcile") {
      // Recover an uncertain preference without generating a second charge.
      if (
        !ctx.external_id &&
        ctx.gateway.provider === "mercado_pago" &&
        ctx.checkout_state === "building"
      ) {
        const preferences = await providerJson(
          `https://api.mercadopago.com/checkout/preferences/search?external_reference=${encodeURIComponent("shop:" + ctx.id)}`,
          ctx.credentials.accessToken,
        );
        const candidates = (preferences.elements ?? []).filter(
          (p: any) => p.external_reference === `shop:${ctx.id}`,
        );
        if (candidates.length === 1) {
          const pref = await providerJson(
            `https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(candidates[0].id)}`,
            ctx.credentials.accessToken,
          );
          if (
            pref.external_reference === `shop:${ctx.id}` &&
            Number(pref.collector_id) === Number(ctx.gateway.collector_id) &&
            validShopUrl(pref.init_point)
          )
            await call("checkout_save", {
              orderId: ctx.id,
              externalId: String(pref.id),
              url: pref.init_point,
            });
        }
      }
      await settle(() => verifiedReceipts(ctx));
      return json({
        message:
          "Consulta concluída. O status vem do provedor, nunca do retorno do navegador.",
      });
    }
    if (body.action === "refund") {
      const claim = await call("claim_refund", {
        actor,
        orderId: ctx.id,
        paymentId: body.paymentId,
        reason: body.reason,
        restock: body.restock,
      });
      if (!claim.claimed)
        return json(
          { error: "Reembolso em processamento. Reconcilie antes de repetir." },
          409,
        );
      await settle(() => refundShopPayment(ctx, claim.paymentId));
      return json({
        message:
          "Solicitação processada. Confira o status confirmado no pedido.",
      });
    }
    return json({ error: "Ação inválida" }, 400);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível concluir. Consulte o pedido.",
      },
      409,
    );
  }
});
