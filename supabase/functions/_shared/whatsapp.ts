export type MessagingProvider = 'evolution_go' | 'meta_cloud';

export interface WhatsAppSendResult {
  ok: boolean;
  provider: MessagingProvider;
  messageId: string | null;
  fallbackFrom: MessagingProvider | null;
  error: string | null;
}

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
};

/** Evolution Go primeiro; Meta Cloud API assume automaticamente em caso de falha. */
export async function sendWhatsAppText(
  number: string,
  text: string,
  idempotencyId: string,
  preference: 'automatic' | MessagingProvider = 'automatic',
): Promise<WhatsAppSendResult> {
  const order: MessagingProvider[] = preference === 'meta_cloud'
    ? ['meta_cloud', 'evolution_go']
    : ['evolution_go', 'meta_cloud'];
  let firstFailure: MessagingProvider | null = null;
  let lastError = 'Nenhum provedor configurado.';
  for (const provider of order) {
    const result = provider === 'evolution_go'
      ? await sendEvolution(number, text, idempotencyId)
      : await sendMetaCloud(number, text);
    if (result.skipped) continue;
    if (result.ok) return { ok: true, provider, messageId: result.messageId, fallbackFrom: firstFailure, error: null };
    firstFailure ??= provider;
    lastError = result.error ?? lastError;
  }
  return { ok: false, provider: order[0], messageId: null, fallbackFrom: firstFailure, error: lastError };
}

async function sendEvolution(number: string, text: string, id: string) {
  const baseUrl = Deno.env.get('EVOLUTION_GO_URL');
  const apiKey = Deno.env.get('EVOLUTION_GO_API_KEY');
  if (!baseUrl || !apiKey) return { ok: false, skipped: true, messageId: null, error: 'Evolution Go não configurada.' };
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/send/text`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: normalizePhone(number), text, id, delay: 500, formatJid: true }),
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, skipped: false, messageId: payload?.data?.Info?.ID ?? payload?.data?.key?.id ?? (response.ok ? id : null), error: response.ok ? null : JSON.stringify(payload) };
  } catch (error) { return { ok: false, skipped: false, messageId: null, error: String(error) }; }
}

async function sendMetaCloud(number: string, text: string) {
  const phoneNumberId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
  const token = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
  const graphVersion = Deno.env.get('META_GRAPH_VERSION') ?? 'v23.0';
  if (!phoneNumberId || !token) return { ok: false, skipped: true, messageId: null, error: 'Meta Cloud API não configurada.' };
  try {
    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: normalizePhone(number), type: 'text', text: { preview_url: false, body: text } }),
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, skipped: false, messageId: payload?.messages?.[0]?.id ?? null, error: response.ok ? null : JSON.stringify(payload) };
  } catch (error) { return { ok: false, skipped: false, messageId: null, error: String(error) }; }
}
