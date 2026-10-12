import { managedWhatsAppFetch, type WhatsAppSettings } from './whatsappSettings.ts';
export type MessagingProvider = "evolution_go" | "evolution_api" | "meta_cloud";
export interface WhatsAppSendResult {
  ok: boolean;
  provider: MessagingProvider;
  messageId: string | null;
  fallbackFrom: MessagingProvider | null;
  error: string | null;
  uncertain?: boolean;
}
export function evolutionConfig(settings?: WhatsAppSettings) {
  const managed = settings?.evolution_api;
  if (managed && !managed.enabled) return null;
  const raw = managed ? managed.url : Deno.env.get("EVOLUTION_API_URL"),
    key = managed ? managed.key : Deno.env.get("EVOLUTION_API_KEY");
  if (!raw || !key) return null;
  try {
    const u = new URL(raw);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      return null;
    return { url: raw.replace(/\/$/, ""), key };
  } catch {
    return null;
  }
}
export function goConfig(settings?: WhatsAppSettings) {
  const managed = settings?.evolution_go;
  if (managed && !managed.enabled) return null;
  const url = managed ? managed.url : Deno.env.get('EVOLUTION_GO_URL');
  const key = managed ? managed.key : Deno.env.get('EVOLUTION_GO_API_KEY');
  if (!url?.startsWith('https://') || !key) return null;
  return {url:url.replace(/\/$/,''),key};
}
export function apiInstance(settings?: WhatsAppSettings) { return settings?.evolution_api ? settings.evolution_api.instance : Deno.env.get('EVOLUTION_API_INSTANCE'); }
export function whatsAppConfigured(instance?: string | null, settings?: WhatsAppSettings) {
  return (
    !!(
      evolutionConfig(settings) &&
      (instance || apiInstance(settings))
    ) ||
    !!goConfig(settings) ||
    !!(
      Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID") &&
      Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")
    )
  );
}
export async function evolutionRequest(
  path: string,
  body?: unknown,
  fetcher: typeof fetch = fetch,
  settings?: WhatsAppSettings,
) {
  const c = evolutionConfig(settings);
  if (!c) throw Error("Evolution API não configurada no servidor.");
  const request = settings?.evolution_api && fetcher === fetch ? managedWhatsAppFetch : fetcher;
  const r = await request(c.url + path, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { apikey: c.key, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok && !payload.error, payload };
}
export async function sendWhatsAppText(
  number: string,
  text: string,
  id: string,
  preference: "automatic" | MessagingProvider = "automatic",
  instance?: string | null,
  fetcher: typeof fetch = fetch,
  settings?: WhatsAppSettings,
): Promise<WhatsAppSendResult> {
  const digits = number.replace(/\D/g, ""),
    phone =
      digits.length === 10 || digits.length === 11 ? "55" + digits : digits;
  const order: MessagingProvider[] =
    preference === "automatic"
      ? ["evolution_api", "evolution_go", "meta_cloud"]
      : [preference];
  if (!/^55\d{10,11}$/.test(phone))
    return {
      ok: false,
      provider: order[0],
      messageId: null,
      fallbackFrom: null,
      error: "Número brasileiro inválido.",
    };
  let first: MessagingProvider | null = null;
  for (const provider of order) {
    const api = evolutionConfig(settings),
      name = instance || apiInstance(settings),
      go = goConfig(settings),
      meta = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID"),
      metaKey = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN");
    if (
      (provider === "evolution_api" && (!api || !name)) ||
      (provider === "evolution_go" &&
        !go) ||
      (provider === "meta_cloud" && (!meta || !metaKey))
    )
      continue;
    try {
      const url =
        provider === "evolution_api"
          ? `${api!.url}/message/sendText/${encodeURIComponent(name!)}`
          : provider === "evolution_go"
            ? `${go!.url}/send/text`
            : `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") ?? "v23.0"}/${meta}/messages`;
      const body =
        provider === "evolution_api"
          ? { number: phone, text, delay: 500, linkPreview: false }
          : provider === "evolution_go"
            ? { number: phone, text, id, delay: 500, formatJid: true }
            : {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: phone,
                type: "text",
                text: { preview_url: false, body: text },
              };
      const request = provider !== 'meta_cloud' && settings?.[provider] && fetcher === fetch ? managedWhatsAppFetch : fetcher;
      const r = await request(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          "Content-Type": "application/json",
          ...(provider === "meta_cloud"
            ? { Authorization: `Bearer ${metaKey}` }
            : { apikey: provider === "evolution_api" ? api!.key : go!.key }),
        },
        body: JSON.stringify(body),
      });
      const p = await r.json().catch(() => ({})),
        messageId =
          p.key?.id ??
          p.data?.key?.id ??
          p.data?.Info?.ID ??
          p.messages?.[0]?.id ??
          p.messageId ??
          p.data?.messageId ??
          p.id;
      if (r.ok && typeof messageId === "string" && messageId)
        return {
          ok: true,
          provider,
          messageId,
          fallbackFrom: first,
          error: null,
        };
      const uncertain = r.ok || r.status >= 500 || r.status === 408;
      if (uncertain)
        return {
          ok: false,
          provider,
          messageId: null,
          fallbackFrom: first,
          error: "Envio inconclusivo. Confira o provedor antes de reenviar.",
          uncertain: true,
        };
      first ??= provider;
    } catch {
      return {
        ok: false,
        provider,
        messageId: null,
        fallbackFrom: first,
        error: "Envio inconclusivo. Não houve repetição automática.",
        uncertain: true,
      };
    }
  }
  return {
    ok: false,
    provider: order[0],
    messageId: null,
    fallbackFrom: first,
    error: "Provedor indisponível ou não configurado.",
  };
}
