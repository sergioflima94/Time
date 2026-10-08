// Agende a cada 5 minutos com Supabase Cron. Expira solicitações sem resposta e avisa admins.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const normalizePhone = (value: string) => { const clean = value.replace(/\D/g, ''); return clean.startsWith('55') ? clean : `55${clean}`; };

serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('BOOKING_AUTOMATION_CRON_SECRET')) return new Response('unauthorized', { status: 401 });
  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: expired, error } = await service.from('game_booking_requests').update({ status: 'expired', responded_at: new Date().toISOString(), failure_reason: 'Prazo de resposta encerrado.' }).eq('status', 'awaiting_owner').lt('expires_at', new Date().toISOString()).select('*');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const baseUrl = Deno.env.get('EVOLUTION_GO_URL')!;
  const apiKey = Deno.env.get('EVOLUTION_GO_API_KEY')!;
  for (const booking of expired ?? []) {
    const { data: game } = await service.from('games').select('pelada_id').eq('id', booking.game_id).single();
    const { data: field } = await service.from('fields').select('name').eq('id', booking.field_id).single();
    const { data: admins } = await service.from('pelada_memberships').select('player_id, players(phone, whatsapp_opt_in)').eq('pelada_id', game.pelada_id).eq('role', 'admin').eq('active', true);
    await Promise.all((admins ?? []).map(async (admin: any) => {
      if (!admin.players?.phone || !admin.players?.whatsapp_opt_in) return;
      const text = `${field?.name ?? 'O campo'} não respondeu à solicitação ${booking.code}. Abra o BoraJogo para tentar o próximo campo ou criar uma enquete de horários.`;
      await fetch(`${baseUrl.replace(/\/$/, '')}/send/text`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: apiKey }, body: JSON.stringify({ number: normalizePhone(admin.players.phone), text, id: `expired-${booking.id}-${admin.player_id}`, formatJid: true }) });
    }));
  }
  return new Response(JSON.stringify({ expired: expired?.length ?? 0 }), { headers: { 'Content-Type': 'application/json' } });
});
