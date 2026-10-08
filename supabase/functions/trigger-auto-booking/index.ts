// Recebe um Database Webhook de INSERT/UPDATE em attendances.
// Header obrigatório: x-automation-secret = BOOKING_AUTOMATION_WEBHOOK_SECRET.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const digits = (value: string | null) => (value ?? '').replace(/\D/g, '');
const phone = (value: string | null) => { const clean = digits(value); return clean.startsWith('55') ? clean : `55${clean}`; };
const code = () => `BJ-${crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()}`;

serve(async (req) => {
  const expected = Deno.env.get('BOOKING_AUTOMATION_WEBHOOK_SECRET');
  if (!expected || req.headers.get('x-automation-secret') !== expected) return response({ error: 'unauthorized' }, 401);
  try {
    const payload = await req.json();
    const attendance = payload.record ?? payload.new_record ?? payload;
    if (attendance?.status !== 'confirmed' || !attendance?.game_id) return response({ ignored: true });
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: game } = await service.from('games').select('*').eq('id', attendance.game_id).single();
    if (!game?.schedule_id) return response({ ignored: true });
    const { data: schedule } = await service.from('schedules').select('*').eq('id', game.schedule_id).single();
    if (!schedule?.auto_booking_enabled) return response({ ignored: true });
    const { count } = await service.from('attendances').select('id', { count: 'exact', head: true }).eq('game_id', game.id).eq('status', 'confirmed');
    if ((count ?? 0) < schedule.booking_minimum_players) return response({ waiting: schedule.booking_minimum_players - (count ?? 0) });
    const { data: existing } = await service.from('game_booking_requests').select('id').eq('game_id', game.id).in('status', ['awaiting_owner', 'accepted']).maybeSingle();
    if (existing) return response({ deduplicated: true, requestId: existing.id });

    const { data: pelada } = await service.from('peladas').select('*').eq('id', game.pelada_id).single();
    const { data: preferences } = await service.from('schedule_field_preferences').select('*').eq('schedule_id', schedule.id).order('priority');
    const { data: promotions } = await service.from('field_promotions').select('*').eq('sport_id', pelada.sport_id).eq('active', true);
    const attempted = new Set((await service.from('game_booking_requests').select('field_id').eq('game_id', game.id)).data?.map((row) => row.field_id) ?? []);
    const candidates = [
      ...(preferences ?? []).map((row) => ({ fieldId: row.field_id, preferenceId: row.id, source: row.source })),
      ...(promotions ?? []).filter((row) => !(preferences ?? []).some((preference) => preference.field_id === row.field_id)).map((row) => ({ fieldId: row.field_id, preferenceId: null, source: 'sponsored' })),
    ];

    let chosen: any = null;
    for (const candidate of candidates) {
      if (attempted.has(candidate.fieldId)) continue;
      const { data: field } = await service.from('fields').select('*').eq('id', candidate.fieldId).eq('sport_id', pelada.sport_id).maybeSingle();
      if (!field?.establishment_id) continue;
      if (await isAvailable(service, candidate.fieldId, game.scheduled_at, game.duration_minutes)) { chosen = { ...candidate, field }; break; }
    }
    if (!chosen) return response({ noAvailableField: true });

    const requestCode = code();
    const expiresAt = new Date(Date.now() + schedule.booking_response_minutes * 60_000).toISOString();
    const { data: booking, error: insertError } = await service.from('game_booking_requests').insert({
      game_id: game.id, schedule_id: schedule.id, field_id: chosen.fieldId, preference_id: chosen.preferenceId,
      source: chosen.source, attempt: attempted.size + 1, code: requestCode, requested_start_at: game.scheduled_at,
      duration_minutes: game.duration_minutes, expires_at: expiresAt,
    }).select().single();
    if (insertError?.code === '23505') return response({ deduplicated: true });
    if (insertError) throw insertError;

    const { data: establishment } = await service.from('establishments').select('*').eq('id', chosen.field.establishment_id).single();
    if (!establishment?.whatsapp_opt_in || !establishment.whatsapp_phone) {
      await service.from('whatsapp_deliveries').insert({ booking_request_id: booking.id, to_player_id: establishment?.owner_player_id, phone: establishment?.whatsapp_phone, kind: 'field_request', status: 'skipped', preview: 'WhatsApp não autorizado pelo estabelecimento.' });
      return response({ created: true, sent: false, requestId: booking.id });
    }
    const text = `${pelada.name} solicita ${chosen.field.name} em ${new Date(game.scheduled_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} por ${game.duration_minutes} min.\n\nResponda SIM ${requestCode} ou NÃO ${requestCode}.`;
    const sent = await fetch(`${Deno.env.get('EVOLUTION_GO_URL')!.replace(/\/$/, '')}/send/text`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('EVOLUTION_GO_API_KEY')! },
      body: JSON.stringify({ number: phone(establishment.whatsapp_phone), text, id: `booking-${booking.id}`, delay: 500, formatJid: true }),
    });
    const body = await sent.json().catch(() => ({}));
    const messageId = body?.data?.Info?.ID ?? body?.data?.key?.id ?? `booking-${booking.id}`;
    await service.from('game_booking_requests').update({ sent_at: sent.ok ? new Date().toISOString() : null, provider_message_id: sent.ok ? messageId : null, failure_reason: sent.ok ? null : JSON.stringify(body) }).eq('id', booking.id);
    await service.from('whatsapp_deliveries').insert({ booking_request_id: booking.id, to_player_id: establishment.owner_player_id, phone: phone(establishment.whatsapp_phone), kind: 'field_request', status: sent.ok ? 'sent' : 'failed', preview: text, provider_message_id: sent.ok ? messageId : null, sent_at: sent.ok ? new Date().toISOString() : null });
    return response({ created: true, sent: sent.ok, requestId: booking.id });
  } catch (error) {
    console.error(error);
    return response({ error: String(error) }, 500);
  }
});

async function isAvailable(service: any, fieldId: string, startsAt: string, durationMinutes: number) {
  const date = new Date(startsAt);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const part = (type: string) => parts.find((row) => row.type === type)?.value ?? '';
  const dateText = `${part('year')}-${part('month')}-${part('day')}`;
  const timeText = `${part('hour')}:${part('minute')}`;
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[part('weekday')];
  const minutes = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
  const start = minutes(timeText);
  const { data: windows } = await service.from('field_availabilities').select('*').eq('field_id', fieldId).eq('day_of_week', day).eq('active', true);
  if (!(windows ?? []).some((window: any) => start >= minutes(window.start_time) && start + durationMinutes <= minutes(window.end_time))) return false;
  const { data: bookings } = await service.from('field_bookings').select('*').eq('field_id', fieldId);
  return !(bookings ?? []).some((booking: any) => {
    if (booking.recurrence === 'single' && booking.date !== dateText) return false;
    if (booking.recurrence === 'weekly' && booking.day_of_week !== day) return false;
    const bookingStart = minutes(booking.time);
    return start < bookingStart + booking.duration_minutes && bookingStart < start + durationMinutes;
  });
}

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
