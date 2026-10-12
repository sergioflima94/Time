import { createClient } from "npm:@supabase/supabase-js@2";
import {
  evolutionRequest,
  evolutionConfig,
} from "../_shared/whatsappProviders.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método inválido." }, 405);
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return reply({ error: "Entre na conta." }, 401);
  const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    ),
    { data: auth, error } = await db.auth.getUser(token);
  if (error || !auth.user) return reply({ error: "Sessão inválida." }, 401);
  try {
    const b = await req.json();
    if (!["status", "connect"].includes(b.action))
      return reply({ error: "Ação inválida." }, 400);
    const call = async (action: string, more: Record<string, unknown> = {}) => {
      const { data, error } = await db.rpc("whatsapp_instance_service", {
        p_action: action,
        p_data: { actor: auth.user!.id, venueId: b.venueId, ...more },
      });
      if (error)
        throw Error(
          error.message.includes("WHATSAPP:")
            ? error.message.split("WHATSAPP:")[1].trim()
            : "Acesso indisponível.",
        );
      return data;
    };
    const { error: limited } = await db.rpc("credit_payment_service", {
      p_action: "access",
      p_data: { actor: auth.user.id },
    });
    if (limited)
      return reply({ error: "Aguarde antes de consultar novamente." }, 429);
    const ctx = await call("context");
    if (!evolutionConfig())
      return reply({
        state: ctx.state,
        configured: false,
        message:
          "Configure EVOLUTION_API_URL e EVOLUTION_API_KEY no servidor; nenhuma chave é solicitada aqui.",
      });
    let state = await evolutionRequest(
      "/instance/connectionState/" + encodeURIComponent(ctx.instance),
    );
    if (b.action === "connect" && state.status === 404) {
      const webhookSecret = Deno.env.get("EVOLUTION_API_WEBHOOK_SECRET");
      const webhook = webhookSecret
        ? {
            enabled: true,
            url:
              Deno.env.get("SUPABASE_URL") +
              "/functions/v1/evolution-api-webhook",
            headers: { "x-webhook-secret": webhookSecret },
            events: ["MESSAGES_UPSERT"],
            webhookByEvents: false,
            webhookBase64: false,
          }
        : undefined;
      state = await evolutionRequest("/instance/create", {
        instanceName: ctx.instance,
        integration: "WHATSAPP-BAILEYS",
        qrcode: false,
        groupsIgnore: true,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
        webhook,
      });
      if (!state.ok)
        return reply(
          {
            error: "Criação inconclusiva; consulte o estado antes de repetir.",
          },
          409,
        );
    }
    if (!state.ok)
      return reply({ error: "Instância indisponível no provedor." }, 409);
    let payload = state.payload;
    const current =
      payload.instance?.state ?? payload.instance?.status ?? "unknown";
    if (b.action === "connect" && current !== "open") {
      const phone = String(b.phone ?? "").replace(/\D/g, "");
      if (phone && !/^55\d{10,11}$/.test(phone))
        return reply(
          { error: "Use DDI 55 + DDD + número para código de pareamento." },
          400,
        );
      const qr = await evolutionRequest(
        "/instance/connect/" +
          encodeURIComponent(ctx.instance) +
          (phone ? "?number=" + phone : ""),
      );
      if (!qr.ok)
        return reply(
          { error: "Conexão inconclusiva; consulte o estado." },
          409,
        );
      payload = qr.payload;
    }
    const safeState =
      current === "open"
        ? "open"
        : b.action === "connect"
          ? "connecting"
          : ["close", "connecting"].includes(current)
            ? current
            : "unknown";
    await call("save", { state: safeState });
    const qr = payload.qrcode ?? payload,
      base64 = qr.base64,
      code = qr.code,
      pairing = qr.pairingCode;
    return reply({
      configured: true,
      state: safeState,
      instance: ctx.instance,
      qr:
        typeof base64 === "string" &&
        /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(base64) &&
        base64.length < 300000
          ? base64
          : null,
      code: typeof code === "string" && code.length < 6000 ? code : null,
      pairingCode:
        typeof pairing === "string" && pairing.length < 30 ? pairing : null,
      message:
        safeState === "open"
          ? "WhatsApp conectado."
          : "No WhatsApp do número escolhido, abra Aparelhos conectados. QR/código são temporários e não ficam salvos no app.",
    });
  } catch {
    return reply(
      {
        error:
          "Não foi possível conectar. Confira acesso e configuração do servidor.",
      },
      409,
    );
  }
});
