// Cria uma cobrança de consumo no gateway escolhido pelo dono do estabelecimento.
// Credenciais são JSON no Supabase Vault, nunca enviadas ao aplicativo:
// Mercado Pago: {"accessToken":"APP_USR-..."}
// PicPay:       {"accessToken":"..."}
// Sicoob/Inter: use um adaptador mTLS próprio após homologação da conta.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) return jsonResponse({ error: 'Não autenticado' }, 401);
    const { intentId } = await req.json();
    if (!intentId) return jsonResponse({ error: 'intentId é obrigatório' }, 400);

    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const serviceClient = createClient(url, serviceKey);
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return jsonResponse({ error: 'Sessão inválida' }, 401);

    const { data: intent, error: intentError } = await serviceClient
      .from('sale_payment_intents')
      .select('*, service_tabs!inner(establishment_id)')
      .eq('id', intentId)
      .eq('status', 'pending')
      .single();
    if (intentError || !intent) return jsonResponse({ error: 'Cobrança não encontrada' }, 404);

    const { data: connection } = await serviceClient
      .from('payment_gateway_connections')
      .select('*')
      .eq('establishment_id', intent.service_tabs.establishment_id)
      .eq('status', 'connected')
      .single();
    if (!connection) return jsonResponse({ error: 'Estabelecimento sem gateway conectado' }, 409);

    if (connection.provider === 'manual_pix') {
      return jsonResponse({ intentId, provider: 'manual_pix', requiresManualConfirmation: true });
    }

    const { data: credentialEnvelope, error: credentialError } = await serviceClient.rpc('get_gateway_credentials', { p_connection_id: connection.id });
    if (credentialError || !credentialEnvelope?.secret) return jsonResponse({ error: 'Credencial do gateway não configurada no Vault' }, 409);
    const credentials = JSON.parse(credentialEnvelope.secret);
    const amount = (intent.amount_cents / 100).toFixed(2);
    const webhookBase = Deno.env.get('PAYMENT_WEBHOOK_URL');

    // A captura NFC acontece no SDK SoftPOS certificado dentro do build nativo.
    // A Edge Function nunca tenta ler cartão nem devolve credenciais secretas ao app;
    // ela apenas autoriza o fluxo ligado a uma intenção já persistida. O resultado
    // financeiro continua sendo confirmado pelo webhook do PSP.
    if (intent.method === 'contactless') {
      if (!connection.contactless_enabled || !['mercado_pago', 'picpay'].includes(connection.provider)) {
        return jsonResponse({ error: 'Aproximação não habilitada para este gateway' }, 409);
      }
      return jsonResponse({
        intentId: intent.id,
        provider: connection.provider,
        nativeAction: connection.provider === 'mercado_pago' ? 'mercado_pago_point_tap' : 'picpay_tap_on_phone',
        requiresNativeCapture: true,
        amountCents: intent.amount_cents,
      });
    }

    let externalId: string | null = null;
    let pixCopyPaste: string | null = null;
    let checkoutUrl: string | null = null;

    if (connection.provider === 'mercado_pago') {
      if (intent.method === 'pix') {
        const response = await fetch('https://api.mercadopago.com/v1/orders', {
          method: 'POST',
          headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': intent.id },
          body: JSON.stringify({
            type: 'online',
            total_amount: amount,
            external_reference: intent.id,
            processing_mode: 'automatic',
            transactions: { payments: [{ amount, payment_method: { id: 'pix', type: 'bank_transfer' }, expiration_time: 'PT30M' }] },
            payer: { email: credentials.payerEmail ?? userData.user.email },
          }),
        });
        const payload = await response.json();
        if (!response.ok) return jsonResponse({ error: 'Mercado Pago recusou a cobrança', details: payload }, 502);
        const payment = payload.transactions?.payments?.[0];
        externalId = payload.id;
        pixCopyPaste = payment?.payment_method?.qr_code ?? null;
        checkoutUrl = payment?.payment_method?.ticket_url ?? null;
      } else {
        const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': intent.id },
          body: JSON.stringify({
            external_reference: intent.id,
            items: [{ id: intent.id, title: 'Consumo no estabelecimento', quantity: 1, currency_id: 'BRL', unit_price: Number(amount) }],
            payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }] },
            notification_url: webhookBase ? `${webhookBase}?provider=mercado_pago` : undefined,
          }),
        });
        const payload = await response.json();
        if (!response.ok) return jsonResponse({ error: 'Mercado Pago recusou o checkout', details: payload }, 502);
        externalId = payload.id;
        checkoutUrl = payload.init_point;
      }
    } else if (connection.provider === 'picpay') {
      const methods = intent.method === 'card' ? ['CREDIT_CARD'] : ['BRCODE'];
      const response = await fetch('https://ecommerce-api.svc.picpay.com/v1/paymentlink/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          charge: {
            name: 'Consumo no estabelecimento',
            description: `Comanda ${intent.tab_id}`,
            order_number: intent.id.slice(0, 15),
            redirect_url: credentials.redirectUrl,
            payment: { methods, brcode_arrangements: intent.method === 'pix' ? ['PICPAY', 'PIX'] : undefined },
            amounts: { product: intent.amount_cents, delivery: 0 },
          },
          options: { allow_create_pix_key: true, card_max_installment_number: intent.method === 'card' ? 3 : undefined },
        }),
      });
      const payload = await response.json();
      if (!response.ok) return jsonResponse({ error: 'PicPay recusou a cobrança', details: payload }, 502);
      externalId = payload.txid ?? payload.id ?? intent.id;
      pixCopyPaste = payload.brcode ?? null;
      checkoutUrl = payload.link ?? payload.deeplink ?? null;
    } else {
      return jsonResponse({ error: `${connection.provider} exige certificado mTLS e homologação individual; use o adaptador bancário configurado para esta conta.` }, 501);
    }

    const { error: updateError } = await serviceClient.from('sale_payment_intents').update({
      external_id: externalId,
      pix_copy_paste: pixCopyPaste,
      checkout_url: checkoutUrl,
    }).eq('id', intent.id);
    if (updateError) return jsonResponse({ error: 'Cobrança criada, mas não foi possível persistir o retorno' }, 500);
    return jsonResponse({ intentId: intent.id, provider: connection.provider, externalId, pixCopyPaste, checkoutUrl });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
});
