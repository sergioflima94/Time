import {
  sendWhatsAppText,
  whatsAppConfigured,
  type MessagingProvider,
} from "./whatsappProviders.ts";
export async function sendVenueWhatsApp(
  db: any,
  venueId: string,
  phone: string,
  text: string,
  id: string,
) {
  const { data: c, error } = await db.rpc("whatsapp_instance_service", {
    p_action: "sending_context",
    p_data: { venueId },
  });
  if (error)
    throw Error("Não foi possível verificar o provedor do estabelecimento.");
  if (c.preference === "evolution_api" && !c.instance)
    return {
      ok: false,
      provider: "evolution_api" as MessagingProvider,
      messageId: null,
      fallbackFrom: null,
      error: "Conecte o número do proprietário atual.",
    };
  if (!whatsAppConfigured(c.instance))
    return {
      ok: false,
      provider: "evolution_api" as MessagingProvider,
      messageId: null,
      fallbackFrom: null,
      error: "WhatsApp não configurado.",
    };
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(phone + ":" + text),
      ),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const call = async (action: string, more: Record<string, unknown> = {}) => {
    const { data, error } = await db.rpc("whatsapp_dispatch_service", {
      p_action: action,
      p_data: { id, hash, venueId, ...more },
    });
    if (error) throw Error("Envio precisa de conferência.");
    return data;
  };
  const claim = await call("claim");
  if (!claim.claimed)
    return {
      ok: claim.status === "accepted",
      provider: (claim.provider ?? "evolution_api") as MessagingProvider,
      messageId: claim.provider_id ?? null,
      fallbackFrom: null,
      error:
        claim.status === "accepted"
          ? null
          : "Envio já iniciado; não foi repetido.",
      uncertain: claim.status !== "accepted",
    };
  const sent = await sendWhatsAppText(
    phone,
    text,
    id,
    (c.preference ?? "automatic") as "automatic" | MessagingProvider,
    c.instance,
  );
  await call("finish", {
    status: sent.ok ? "accepted" : sent.uncertain ? "uncertain" : "failed",
    provider: sent.provider,
    providerId: sent.messageId,
  });
  return sent;
}
