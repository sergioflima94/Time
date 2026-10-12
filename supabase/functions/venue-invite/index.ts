import { createClient } from "npm:@supabase/supabase-js@2";
import {
  evolutionConfig,
  whatsAppConfigured,
} from "../_shared/whatsappProviders.ts";
import { sendVenueWhatsApp } from "../_shared/venueWhatsApp.ts";
import { loadWhatsAppSettings } from '../_shared/whatsappSettings.ts';
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método inválido." }, 405);
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer "))
    return reply({ error: "Entre na sua conta." }, 401);
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: user, error } = await client.auth.getUser(auth.slice(7));
  if (error || !user.user) return reply({ error: "Entre na sua conta." }, 401);
  let id: string;
  try {
    const body = await req.json();
    id = body.inviteId;
    if (!/^[a-f0-9-]{36}$/.test(id)) throw Error();
  } catch {
    return reply({ error: "Convite inválido." }, 400);
  }
  const rpc = async (action: string, provider: string | null = null) => {
    const { data, error } = await client.rpc("venue_invite_service", {
      p_id: id,
      p_actor: user.user!.id,
      p_action: action,
      p_provider_id: provider,
    });
    if (error) throw new Error("Acesso ao convite não autorizado.");
    return data;
  };
  let claimed = false;
  try {
    const peek = await rpc("peek");
    if (peek.status === "expired")
      return reply({
        status: "expired",
        message:
          "Convite expirou. Peça nova autorização ao cliente antes de criar outro convite.",
      });
    if (peek.status !== "queued")
      return reply({
        status: peek.status,
        message:
          peek.status === "accepted"
            ? "Convite aceito pelo provedor; entrega não confirmada."
            : "Envio já iniciado. Confira o provedor antes de tentar outro convite.",
      });
    if (Deno.env.get("VENUE_MESSAGES_ENABLED") !== "true")
      return reply({
        status: "queued",
        message: "Convite salvo; envio automático ainda não habilitado.",
      });
    const email = peek.channel === "email",
      url = Deno.env.get("EVOLUTION_GO_URL")?.replace(/\/$/, ""),
      key = Deno.env.get("EVOLUTION_GO_API_KEY"),
      resend = Deno.env.get("RESEND_API_KEY"),
      from = Deno.env.get("VENUE_INVITE_FROM");
    const settings = email ? {} : await loadWhatsAppSettings(client);
    if (email ? !resend || !from : !whatsAppConfigured(undefined,settings) && !evolutionConfig(settings))
      return reply({
        status: "queued",
        message: "Convite salvo; configure o provedor deste canal.",
      });
    const lead = await rpc("claim");
    if (lead.status !== "sending" || !lead.channel)
      return reply({ status: lead.status, message: "Convite já processado." });
    claimed = true;
    // Generic sign-up invitation: never attaches a bill or auto-verifies the contact.
    const text = `Olá, ${lead.name}! ${lead.venue_name} convidou você para conhecer o Marcou Jogou. Crie sua própria conta: https://app.marcoujogou.com.br\nEste convite não cria cobrança nem confirma cadastro. Se não pediu o convite, ignore esta mensagem.`;
    if (!email) {
      const sent = await sendVenueWhatsApp(
        client,
        lead.venue_id,
        lead.phone,
        text,
        id,
      );
      await rpc(
        sent.ok ? "accepted" : sent.uncertain ? "uncertain" : "failed",
        sent.messageId,
      );
      return reply({
        status: sent.ok ? "accepted" : sent.uncertain ? "uncertain" : "failed",
        message: sent.ok
          ? "Convite aceito pelo provedor; entrega e cadastro não comprovados."
          : sent.error,
      });
    }
    const response = await fetch(
      email ? "https://api.resend.com/emails" : `${url}/send/text`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: email
          ? {
              Authorization: `Bearer ${resend}`,
              "Content-Type": "application/json",
              "Idempotency-Key": `venue-invite/${id}`,
            }
          : { apikey: key!, "Content-Type": "application/json" },
        body: JSON.stringify(
          email
            ? {
                from,
                to: [lead.email],
                subject: "Seu convite ao Marcou Jogou",
                text,
              }
            : {
                number:
                  lead.phone.length >= 12 && lead.phone.startsWith("55")
                    ? lead.phone
                    : `55${lead.phone}`,
                text,
                id,
                delay: 500,
                formatJid: true,
              },
        ),
      },
    );
    if (!response.ok) {
      await rpc(response.status >= 500 ? "uncertain" : "failed");
      return reply({
        status: "failed",
        message:
          "Comanda salva. Provedor não confirmou o convite; confira antes de reenviar.",
      });
    }
    const result = await response.json();
    const providerId = email
      ? result.id
      : (result.id ?? result.key?.id ?? result.messageId);
    if (!providerId) {
      await rpc("uncertain");
      return reply({
        status: "uncertain",
        message:
          "Comanda salva. Resposta de envio inconclusiva; confira no provedor.",
      });
    }
    await rpc("accepted", String(providerId));
    return reply({
      status: "accepted",
      message:
        "Convite aceito pelo provedor; isso não confirma entrega nem cadastro.",
    });
  } catch {
    if (claimed)
      try {
        await rpc("uncertain");
      } catch {}
    return reply(
      {
        status: claimed ? "uncertain" : "queued",
        message: claimed
          ? "Comanda salva. Envio inconclusivo: confira o provedor antes de repetir."
          : "Comanda salva. Convite pendente de verificação.",
      },
      claimed ? 200 : 403,
    );
  }
});
