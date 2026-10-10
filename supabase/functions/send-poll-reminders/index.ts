// Supabase Cron (ex.: a cada 15 min): lembra somente quem ainda não votou.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWhatsAppText } from '../_shared/whatsapp.ts';

serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('BOOKING_AUTOMATION_CRON_SECRET')) return new Response('unauthorized', { status: 401 });
  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: polls } = await service.from('team_availability_polls').select('*').eq('status', 'open').is('reminder_sent_at', null);
  let sentCount = 0;
  for (const poll of polls ?? []) {
    const { data: game } = await service.from('games').select('schedule_id').eq('id', poll.game_id).single();
    const { data: schedule } = await service.from('schedules').select('poll_reminder_minutes').eq('id', game?.schedule_id).single();
    if (Date.now() < new Date(poll.created_at).getTime() + (schedule?.poll_reminder_minutes ?? 120) * 60_000) continue;
    const { data: votes } = await service.from('team_availability_poll_votes').select('player_id').eq('poll_id', poll.id);
    const voters = new Set((votes ?? []).map((row) => row.player_id));
    const { data: members } = await service.from('pelada_memberships').select('player_id, players(phone, whatsapp_opt_in)').eq('pelada_id', poll.pelada_id).eq('active', true);
    for (const member of members ?? []) {
      const player: any = member.players;
      if (voters.has(member.player_id) || !player?.phone || !player?.whatsapp_opt_in) continue;
      const text = 'Lembrete do MarcouJogou: ainda falta seu voto na enquete de horário do time.';
      const sent = await sendWhatsAppText(player.phone, text, `poll-${poll.id}-${member.player_id}`, 'automatic');
      await service.from('whatsapp_deliveries').insert({ poll_id: poll.id, to_player_id: member.player_id, phone: player.phone, whatsapp_opt_in: true, kind: 'poll_reminder', status: sent.ok ? 'sent' : 'failed', preview: text, provider_message_id: sent.messageId, provider: sent.provider, fallback_from_provider: sent.fallbackFrom, sent_at: sent.ok ? new Date().toISOString() : null });
      if (sent.ok) sentCount += 1;
    }
    await service.from('team_availability_polls').update({ reminder_sent_at: new Date().toISOString() }).eq('id', poll.id);
  }
  return new Response(JSON.stringify({ sent: sentCount }), { headers: { 'Content-Type': 'application/json' } });
});
