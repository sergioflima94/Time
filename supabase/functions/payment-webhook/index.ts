// Webhook único para Mercado Pago e PicPay. Nunca confia apenas no valor/status
// enviado pelo app. Mercado Pago é reconsultado; PicPay exige um token aleatório na
// URL cadastrada no painel: ?provider=picpay&connection=...&hook_token=...

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider');
    const connectionId = url.searchParams.get('connection');
    if (!provider || !connectionId) return response({ error: 'provider e connection são obrigatórios' }, 400);

    const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: envelope } = await serviceClient.rpc('get_gateway_credentials', { p_connection_id: connectionId });
    if (!envelope?.secret) return response({ error: 'Conexão não encontrada' }, 404);
    const credentials = JSON.parse(envelope.secret);
    const body = await req.json();
    let intentId: string | null = null;
    let paid = false;

    if (provider === 'mercado_pago') {
      const resourceId = String(body?.data?.id ?? body?.id ?? '');
      if (!resourceId) return response({ received: true });
      const isPayment = body?.type === 'payment' || body?.topic === 'payment';
      const endpoint = isPayment ? `https://api.mercadopago.com/v1/payments/${resourceId}` : `https://api.mercadopago.com/v1/orders/${resourceId}`;
      const providerResponse = await fetch(endpoint, { headers: { Authorization: `Bearer ${credentials.accessToken}` } });
      if (!providerResponse.ok) return response({ error: 'Não foi possível validar no Mercado Pago' }, 502);
      const payload = await providerResponse.json();
      intentId = payload.external_reference ?? null;
      const paymentStatus = payload.status ?? payload.transactions?.payments?.[0]?.status;
      paid = paymentStatus === 'approved' || paymentStatus === 'processed';
    } else if (provider === 'picpay') {
      const expectedToken = Deno.env.get('PAYMENT_WEBHOOK_TOKEN');
      if (!expectedToken || url.searchParams.get('hook_token') !== expectedToken) return response({ error: 'Assinatura inválida' }, 401);
      intentId = body?.merchantChargeId ?? body?.referenceId ?? body?.external_reference ?? null;
      const status = String(body?.status ?? body?.payment?.status ?? '').toUpperCase();
      paid = status === 'PAID' || status === 'APPROVED' || status === 'COMPLETED';
      if (!intentId && body?.txid) {
        const { data } = await serviceClient.from('sale_payment_intents').select('id').eq('external_id', body.txid).maybeSingle();
        intentId = data?.id ?? null;
        if (!intentId) {
          const { data: contribution } = await serviceClient.from('fundraising_contributions').select('id').eq('external_id', body.txid).maybeSingle();
          if (contribution?.id) intentId = `fundraising:${contribution.id}`;
        }
        if (!intentId) {
          const { data: deposit } = await serviceClient.from('booking_deposits').select('id').eq('external_id', body.txid).maybeSingle();
          if (deposit?.id) intentId = `booking_deposit:${deposit.id}`;
        }
      }
    } else {
      return response({ error: 'Provider não suportado neste webhook' }, 400);
    }

    if (!paid || !intentId) return response({ received: true, settled: false });
    if (intentId.startsWith('fundraising:')) {
      const contributionId = intentId.slice('fundraising:'.length);
      const paidAt = new Date().toISOString();
      const { data: contribution, error: contributionError } = await serviceClient.from('fundraising_contributions').update({ status: 'paid', paid_at: paidAt }).eq('id', contributionId).eq('status', 'pending').select('campaign_id').single();
      if (contributionError) return response({ error: 'Falha ao confirmar contribuição' }, 500);
      const { data: campaign } = await serviceClient.from('fundraising_campaigns').select('target_amount').eq('id', contribution.campaign_id).single();
      const { data: rows } = await serviceClient.from('fundraising_contributions').select('amount').eq('campaign_id', contribution.campaign_id).eq('status', 'paid');
      const raised = (rows ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
      if (campaign && raised >= Number(campaign.target_amount)) await serviceClient.from('fundraising_campaigns').update({ status: 'funded' }).eq('id', contribution.campaign_id).eq('status', 'active');
      return response({ received: true, settled: true, kind: 'fundraising', contributionId });
    }
    if (intentId.startsWith('booking_deposit:')) {
      const depositId = intentId.slice('booking_deposit:'.length);
      const { error: depositError } = await serviceClient.from('booking_deposits').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', depositId).eq('status', 'pending');
      if (depositError) return response({ error: 'Falha ao confirmar sinal' }, 500);
      return response({ received: true, settled: true, kind: 'booking_deposit', depositId });
    }
    const { data: paymentId, error } = await serviceClient.rpc('settle_sale_payment_intent', { p_intent_id: intentId });
    if (error) return response({ error: 'Falha ao liquidar cobrança' }, 500);
    return response({ received: true, settled: Boolean(paymentId), paymentId });
  } catch (error) {
    return response({ error: String(error) }, 500);
  }
});
