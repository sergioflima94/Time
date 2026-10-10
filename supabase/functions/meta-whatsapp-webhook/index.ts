// Webhook oficial da Meta Cloud API. GET valida a assinatura; POST trata SIM/NÃO BJ-XXXX.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { sendWhatsAppText } from '../_shared/whatsapp.ts';

const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');

serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const valid = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === Deno.env.get('META_WHATSAPP_VERIFY_TOKEN');
    return new Response(valid ? url.searchParams.get('hub.challenge') ?? '' : 'forbidden', { status: valid ? 200 : 403 });
  }
  try {
    const payload = await req.json();
    const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message?.id || !message?.from) return ok();
    const text = message?.text?.body ?? '';
    const match = String(text).trim().toUpperCase().match(/^(SIM|NAO|NÃO)\s+(BJ-[A-Z0-9]{4})\b/);
    if (!match) return ok();
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: request } = await service.from('game_booking_requests').select('*').eq('code', match[2]).single();
    if (!request) return ok();
    const { data: field } = await service.from('fields').select('*').eq('id', request.field_id).single();
    const { data: establishment } = await service.from('establishments').select('*').eq('id', field.establishment_id).single();
    if (digits(message.from) !== digits(establishment.whatsapp_phone)) return ok();
    const { data: result, error } = await service.rpc('respond_game_booking_request', {
      p_request_id: request.id, p_accepted: match[1] === 'SIM', p_response_message_id: message.id,
    });
    if (error) throw error;
    const { data: game } = await service.from('games').select('*').eq('id', request.game_id).single();
    const { data: pelada } = await service.from('peladas').select('*').eq('id', game.pelada_id).single();
    const targetRole = result === 'accepted' ? null : 'admin';
    let query = service.from('pelada_memberships').select('player_id, players(phone, whatsapp_opt_in)').eq('pelada_id', pelada.id).eq('active', true);
    if (targetRole) query = query.eq('role', targetRole);
    const { data: recipients } = await query;
    const notification = result === 'accepted'
      ? `Jogo confirmado! ${pelada.name} joga em ${field.name}, ${new Date(request.requested_start_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`
      : `${field.name} recusou ${request.code}. Abra o MarcouJogou para tentar outro campo ou criar uma enquete.`;
    await Promise.all((recipients ?? []).map((row: any) => row.players?.phone && row.players?.whatsapp_opt_in
      ? sendWhatsAppText(row.players.phone, notification, `meta-response-${request.id}-${row.player_id}`, establishment.messaging_provider ?? 'automatic')
      : Promise.resolve()));
    return ok();
  } catch (error) { console.error(error); return new Response('error', { status: 500 }); }
});

function ok() { return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } }); }
