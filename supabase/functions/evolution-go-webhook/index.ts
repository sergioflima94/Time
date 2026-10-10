// Webhook de entrada da Evolution Go. Configure a URL com um segredo aleatório:
// https://PROJECT.supabase.co/functions/v1/evolution-go-webhook?secret=SEU_SEGREDO

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { sendWhatsAppText } from '../_shared/whatsapp.ts';

const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');
const normalizePhone = (value: string | null | undefined) => {
  const cleaned = digits(value).replace(/@swhatsappnet$/, '');
  return cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
};

serve(async (req) => {
  const expectedSecret = Deno.env.get('EVOLUTION_GO_WEBHOOK_SECRET');
  const suppliedSecret = new URL(req.url).searchParams.get('secret') ?? req.headers.get('x-webhook-secret');
  if (!expectedSecret || suppliedSecret !== expectedSecret) return new Response('unauthorized', { status: 401 });
  try {
    const payload = await req.json();
    const data = payload.data ?? payload;
    if (data?.key?.fromMe) return ok();
    const providerMessageId = data?.key?.id ?? payload.id;
    const remoteJid = data?.key?.remoteJid ?? payload.key?.remoteJid;
    const text = data?.message?.conversation ?? data?.message?.extendedTextMessage?.text ?? payload.message?.conversation ?? '';
    const match = String(text).trim().toUpperCase().match(/^(SIM|NAO|NÃO)\s+(BJ-[A-Z0-9]{4})\b/);
    if (!match || !providerMessageId || !remoteJid) return ok();

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: request } = await service.from('game_booking_requests').select('*').eq('code', match[2]).single();
    if (!request) return ok();
    const { data: field } = await service.from('fields').select('*').eq('id', request.field_id).single();
    const { data: establishment } = await service.from('establishments').select('*').eq('id', field.establishment_id).single();
    if (normalizePhone(remoteJid) !== normalizePhone(establishment.whatsapp_phone)) return ok();

    const accepted = match[1] === 'SIM';
    const { data: result, error } = await service.rpc('respond_game_booking_request', {
      p_request_id: request.id,
      p_accepted: accepted,
      p_response_message_id: providerMessageId,
    });
    if (error) throw error;

    const { data: game } = await service.from('games').select('*').eq('id', request.game_id).single();
    const { data: pelada } = await service.from('peladas').select('*').eq('id', game.pelada_id).single();
    if (result === 'accepted') {
      const { data: members } = await service.from('pelada_memberships').select('player_id, players(phone, whatsapp_opt_in)').eq('pelada_id', pelada.id).eq('active', true);
      await Promise.all((members ?? []).map(async (member: any) => {
        const phone = member.players?.phone;
        if (!phone || !member.players?.whatsapp_opt_in) return;
        const message = `Jogo confirmado! ${pelada.name} joga em ${field.name}, ${new Date(request.requested_start_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`;
        await sendWhatsAppText(normalizePhone(phone), message, `confirmed-${request.id}-${member.player_id}`, establishment.messaging_provider ?? 'automatic');
      }));
    } else if (result === 'declined') {
      const { data: admins } = await service.from('pelada_memberships').select('player_id, players(phone, whatsapp_opt_in)').eq('pelada_id', pelada.id).eq('role', 'admin').eq('active', true);
      await Promise.all((admins ?? []).map((admin: any) => admin.players?.phone && admin.players?.whatsapp_opt_in ? sendWhatsAppText(
        normalizePhone(admin.players.phone),
        `${field.name} recusou ${request.code}. Abra o MarcouJogou para tentar outro horário, o próximo campo ou criar uma enquete com o time.`,
        `declined-${request.id}-${admin.player_id}`,
        establishment.messaging_provider ?? 'automatic',
      ) : Promise.resolve()));
    }
    return ok();
  } catch (error) {
    console.error(error);
    return new Response('error', { status: 500 });
  }
});

function ok() { return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } }); }
