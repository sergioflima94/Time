// Envia uma solicitação já criada no banco para o WhatsApp do estabelecimento.
// Segredos necessários:
//   EVOLUTION_GO_URL, EVOLUTION_GO_API_KEY, EVOLUTION_GO_INSTANCE (opcional)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const digits = (value: string | null) => (value ?? '').replace(/\D/g, '');
const normalizePhone = (value: string | null) => {
  const cleaned = digits(value);
  return cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) return json({ error: 'Não autenticado' }, 401);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const service = createClient(supabaseUrl, serviceKey);
    const { data: auth } = await userClient.auth.getUser();
    if (!auth.user) return json({ error: 'Sessão inválida' }, 401);

    const { bookingRequestId } = await req.json();
    const { data: booking, error } = await service.from('game_booking_requests').select('*').eq('id', bookingRequestId).single();
    if (error || !booking) return json({ error: 'Solicitação não encontrada' }, 404);
    const { data: game } = await service.from('games').select('*').eq('id', booking.game_id).single();
    const { data: player } = await service.from('players').select('id').eq('auth_user_id', auth.user.id).single();
    const { data: membership } = await service.from('pelada_memberships').select('role').eq('pelada_id', game.pelada_id).eq('player_id', player?.id).eq('active', true).single();
    if (membership?.role !== 'admin') return json({ error: 'Apenas um admin do time pode enviar a solicitação' }, 403);

    const { data: field } = await service.from('fields').select('*').eq('id', booking.field_id).single();
    const { data: establishment } = await service.from('establishments').select('*').eq('id', field.establishment_id).single();
    const { data: pelada } = await service.from('peladas').select('name').eq('id', game.pelada_id).single();
    if (!establishment?.whatsapp_opt_in || !establishment.whatsapp_phone) return json({ error: 'Estabelecimento não autorizou o WhatsApp' }, 409);

    const evolutionUrl = Deno.env.get('EVOLUTION_GO_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_GO_API_KEY');
    if (!evolutionUrl || !evolutionKey) return json({ error: 'Evolution Go não configurada' }, 500);
    const text = `${pelada.name} solicita ${field.name} em ${new Date(booking.requested_start_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} por ${booking.duration_minutes} min.\n\nResponda SIM ${booking.code} para confirmar ou NÃO ${booking.code} para recusar.`;
    const response = await fetch(`${evolutionUrl.replace(/\/$/, '')}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
      body: JSON.stringify({ number: normalizePhone(establishment.whatsapp_phone), text, id: `booking-${booking.id}`, delay: 500, formatJid: true }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: 'Falha ao enviar WhatsApp', details: payload }, 502);
    const providerMessageId = payload?.data?.Info?.ID ?? payload?.data?.key?.id ?? `booking-${booking.id}`;
    await service.from('game_booking_requests').update({ sent_at: new Date().toISOString(), provider_message_id: providerMessageId }).eq('id', booking.id);
    await service.from('whatsapp_deliveries').insert({
      booking_request_id: booking.id, to_player_id: establishment.owner_player_id, phone: normalizePhone(establishment.whatsapp_phone),
      kind: 'field_request', status: 'sent', preview: text, provider_message_id: providerMessageId, sent_at: new Date().toISOString(),
    });
    return json({ ok: true, providerMessageId });
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
