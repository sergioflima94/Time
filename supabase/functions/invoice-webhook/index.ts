import { createClient } from "npm:@supabase/supabase-js@2";
import { validSignature } from "../_shared/commercialSignature.ts";
import { sameWebhookSecret } from "../_shared/shopGateway.ts";
import {
  reconcileInvoice,
  ShopDiscrepancy,
} from "../_shared/invoiceGateway.ts";
Deno.serve(async (req) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  let id = new URL(req.url).pathname.split("/").pop();
  if (!id || !/^[a-f0-9-]{36}$/.test(id))
    return new Response("Invalid intent", { status: 400 });
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const call = async (action: string, data: Record<string, unknown>) => {
    const { data: r, error } = await service.rpc("credit_payment_service", {
      p_action: action,
      p_data: data,
    });
    if (error) throw new Error("Reconciliation needed");
    return r;
  };
  try {
    const body = await req.json(),
      url = new URL(req.url);
    if (url.pathname.includes("/gateway/")) {
      const externalId = body?.data?.charge?.paymentLinkId;
      if (typeof externalId !== "string" || externalId.length > 120)
        return new Response("Invalid event", { status: 400 });
      const { data: row, error } = await service
        .from("venue_credit_intents")
        .select("id")
        .eq("gateway_id", id)
        .eq("external_id", externalId)
        .maybeSingle();
      if (error || !row)
        return new Response("Awaiting reconciliation", { status: 503 });
      id = row.id;
    }
    const ctx = await call("webhook_context", { intentId: id });
    if (ctx.provider === "mercado_pago") {
      const resource =
        url.searchParams.get("data.id") ?? String(body?.data?.id ?? "");
      if (
        !/^\d+$/.test(resource) ||
        body.type !== "payment" ||
        String(body.data?.id) !== resource ||
        !(await validSignature(
          req.headers.get("x-signature"),
          req.headers.get("x-request-id"),
          resource,
          ctx.credentials.webhookSecret,
        ))
      )
        return new Response("Invalid signature", { status: 401 });
      // Fetch the exact signed resource, then verify merchant/reference/currency/value.
      ctx.external_id = resource;
    } else if (
      !(await sameWebhookSecret(
        req.headers.get("authorization") ?? "",
        ctx.credentials.webhookSecret,
      ))
    )
      return new Response("Invalid authorization", { status: 401 });
    try {
      for (const receipt of await reconcileInvoice(ctx))
        await call("settle", { intentId: id, ...receipt });
    } catch (e) {
      await call("review", {
        intentId: id,
        code:
          e instanceof ShopDiscrepancy
            ? "provider_mismatch"
            : "settlement_review",
      });
      return new Response("Review recorded", { status: 503 });
    }
    return new Response("OK");
  } catch {
    return new Response("Unable to reconcile", { status: 503 });
  }
});
