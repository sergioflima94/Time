import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validSignature } from "../_shared/commercialSignature.ts";
import {
  providerJson,
  verifiedReceipts,
  sameWebhookSecret,
  ShopDiscrepancy,
} from "../_shared/shopGateway.ts";
serve(async (req) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  try {
    const url = new URL(req.url),
      gatewayId = url.pathname.split("/").pop();
    if (!gatewayId || !/^[a-f0-9-]{36}$/.test(gatewayId))
      return new Response("Invalid gateway", { status: 400 });
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const call = async (action: string, data: unknown) => {
      const { data: r, error } = await service.rpc("shop_service", {
        p_action: action,
        p_data: data,
      });
      if (error) throw new Error("Retry");
      return r;
    };
    const gateway = await call("gateway_context", { gatewayId }),
      body = await req.json();
    let orderId: string | undefined, paymentId: string | undefined;
    if (gateway.provider === "mercado_pago") {
      paymentId = url.searchParams.get("data.id") ?? "";
      if (
        !/^\d+$/.test(paymentId) ||
        body.type !== "payment" ||
        String(body.data?.id) !== paymentId ||
        !(await validSignature(
          req.headers.get("x-signature"),
          req.headers.get("x-request-id"),
          paymentId,
          gateway.credentials.webhookSecret,
        ))
      )
        return new Response("Invalid signature", { status: 401 });
      const payment = await providerJson(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        gateway.credentials.accessToken,
      );
      if (!/^shop:[a-f0-9-]{36}$/.test(payment.external_reference ?? ""))
        return new Response("Ignored");
      orderId = payment.external_reference.slice(5);
    } else {
      const supplied = req.headers.get("authorization") ?? "",
        expected = gateway.credentials.webhookSecret;
      if (!(await sameWebhookSecret(supplied, expected)))
        return new Response("Invalid authorization", { status: 401 });
      const externalId = body?.data?.charge?.paymentLinkId;
      if (typeof externalId !== "string" || externalId.length > 120)
        return new Response("Invalid event", { status: 400 });
      const { data: order } = await service
        .from("shop_orders")
        .select("id")
        .eq("gateway_id", gatewayId)
        .eq("external_id", externalId)
        .maybeSingle();
      if (!order) return new Response("Unknown order", { status: 503 });
      orderId = order.id;
    }
    // Private tables are not client-readable; a webhook only queries the matching order.
    const { data: row } = await service
      .from("shop_orders")
      .select("*")
      .eq("id", orderId)
      .eq("gateway_id", gatewayId)
      .maybeSingle();
    if (!row) return new Response("Order mismatch", { status: 400 });
    const ctx = { ...row, gateway, credentials: gateway.credentials };
    try {
      for (const receipt of await verifiedReceipts(ctx, paymentId))
        await call("settle", receipt!);
    } catch (e) {
      if (e instanceof ShopDiscrepancy) await call("review", { orderId });
      throw e;
    }
    return new Response("ok");
  } catch {
    return new Response("Retry or financial review required", { status: 503 });
  }
});
