// Cria Pix/cartão para vaquinha ou sinal da reserva usando a conta conectada do recebedor.
// A liquidação final continua exclusiva do payment-webhook.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) return json({ error: 'Não autenticado' }, 401);
    const { kind, id } = await req.json();
    if (!['fundraising', 'booking_deposit'].includes(kind) || !id) return json({ error: 'kind/id inválidos' }, 400);
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: auth } = await userClient.auth.getUser();
    if (!auth.user) return json({ error: 'Sessão inválida' }, 401);
    const { data: player } = await service.from('players').select('id').eq('auth_user_id', auth.user.id).single();

    let amountCents = 0; let method = 'pix'; let establishmentId: string | null = null; let title = 'MarcouJogou';
    if (kind === 'fundraising') {
      const { data: contribution } = await service.from('fundraising_contributions').select('*, fundraising_campaigns(*)').eq('id', id).eq('status', 'pending').single();
      if (!contribution || contribution.paid_by_player_id !== player?.id) return json({ error: 'Contribuição não encontrada' }, 404);
      amountCents = Math.round(Number(contribution.amount) * 100); method = contribution.method; title = contribution.fundraising_campaigns.title;
      const { data: recipient } = await service.from('establishments').select('id').eq('owner_player_id', contribution.fundraising_campaigns.payout_player_id).limit(1).maybeSingle();
      establishmentId = recipient?.id ?? null;
    } else {
      const { data: deposit } = await service.from('booking_deposits').select('*, game_booking_requests(field_id, fields(establishment_id))').eq('id', id).eq('status', 'pending').single();
      if (!deposit || deposit.payer_player_id !== player?.id) return json({ error: 'Sinal não encontrado' }, 404);
      amountCents = deposit.amount_cents; method = deposit.method; title = 'Sinal da reserva'; establishmentId = deposit.game_booking_requests?.fields?.establishment_id ?? null;
    }
    if (!establishmentId) return json({ error: 'Recebedor sem conta de estabelecimento conectada' }, 409);
    const { data: connection } = await service.from('payment_gateway_connections').select('*').eq('establishment_id', establishmentId).eq('status', 'connected').single();
    if (!connection) return json({ error: 'Gateway não conectado' }, 409);
    if (connection.provider === 'manual_pix') return json({ provider: 'manual_pix', requiresManualConfirmation: true });
    const { data: envelope } = await service.rpc('get_gateway_credentials', { p_connection_id: connection.id });
    if (!envelope?.secret) return json({ error: 'Credencial ausente no Vault' }, 409);
    const credentials = JSON.parse(envelope.secret);
    const reference = `${kind}:${id}`;
    const amount = (amountCents / 100).toFixed(2);
    let externalId: string | null = null; let pixCopyPaste: string | null = null; let checkoutUrl: string | null = null;
    if (connection.provider === 'mercado_pago') {
      const response = await fetch(method === 'pix' ? 'https://api.mercadopago.com/v1/orders' : 'https://api.mercadopago.com/checkout/preferences', {
        method: 'POST', headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': reference },
        body: JSON.stringify(method === 'pix' ? {
          type: 'online', total_amount: amount, external_reference: reference, processing_mode: 'automatic',
          transactions: { payments: [{ amount, payment_method: { id: 'pix', type: 'bank_transfer' }, expiration_time: 'PT30M' }] }, payer: { email: auth.user.email },
        } : { external_reference: reference, items: [{ id, title, quantity: 1, currency_id: 'BRL', unit_price: Number(amount) }] }),
      });
      const payload = await response.json(); if (!response.ok) return json({ error: 'Mercado Pago recusou a cobrança', details: payload }, 502);
      externalId = payload.id; pixCopyPaste = payload.transactions?.payments?.[0]?.payment_method?.qr_code ?? null; checkoutUrl = payload.init_point ?? payload.transactions?.payments?.[0]?.payment_method?.ticket_url ?? null;
    } else if (connection.provider === 'picpay') {
      const response = await fetch('https://ecommerce-api.svc.picpay.com/v1/paymentlink/create', {
        method: 'POST', headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ charge: { name: title, description: reference, order_number: id.slice(0, 15), referenceId: reference, payment: { methods: method === 'card' ? ['CREDIT_CARD'] : ['BRCODE'], brcode_arrangements: method === 'pix' ? ['PICPAY', 'PIX'] : undefined }, amounts: { product: amountCents, delivery: 0 } }, options: { allow_create_pix_key: true } }),
      });
      const payload = await response.json(); if (!response.ok) return json({ error: 'PicPay recusou a cobrança', details: payload }, 502);
      externalId = payload.txid ?? payload.id; pixCopyPaste = payload.brcode ?? null; checkoutUrl = payload.link ?? payload.deeplink ?? null;
    } else return json({ error: 'Sicoob/Inter exigem o adaptador mTLS homologado da conta.' }, 501);
    const table = kind === 'fundraising' ? 'fundraising_contributions' : 'booking_deposits';
    await service.from(table).update({ external_id: externalId, pix_copy_paste: pixCopyPaste, checkout_url: checkoutUrl }).eq('id', id);
    return json({ provider: connection.provider, externalId, pixCopyPaste, checkoutUrl, reference });
  } catch (error) { return json({ error: String(error) }, 500); }
});
