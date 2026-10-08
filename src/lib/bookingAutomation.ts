import { findBookingConflicts } from '@/lib/fieldBooking';
import type {
  Field,
  FieldAvailability,
  FieldBooking,
  FieldPromotion,
  Game,
  ScheduleFieldPreference,
} from '@/types';

export interface BookingCandidate {
  fieldId: string;
  preferenceId: string | null;
  source: 'team' | 'sponsored';
  priority: number;
}

export interface AvailableBookingSlot {
  fieldId: string;
  startsAt: string;
  price: number | null;
}

export function normalizeWhatsAppPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function createBookingCode(seed = Math.random().toString(36).slice(2, 6)): string {
  return `BJ-${seed.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase().padEnd(4, 'X')}`;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function localDateParts(value: string): { date: string; dayOfWeek: number; time: string } {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return { date: `${year}-${month}-${day}`, dayOfWeek: date.getDay(), time: `${hours}:${minutes}` };
}

export function fieldIsAvailableAt(
  fieldId: string,
  startsAt: string,
  durationMinutes: number,
  availabilities: FieldAvailability[],
  bookings: FieldBooking[],
): boolean {
  const parts = localDateParts(startsAt);
  const start = timeToMinutes(parts.time);
  const end = start + durationMinutes;
  const insideWindow = availabilities.some(
    (slot) =>
      slot.fieldId === fieldId &&
      slot.active &&
      slot.dayOfWeek === parts.dayOfWeek &&
      start >= timeToMinutes(slot.startTime) &&
      end <= timeToMinutes(slot.endTime),
  );
  if (!insideWindow) return false;
  return findBookingConflicts(bookings, {
    fieldId,
    recurrence: 'single',
    dayOfWeek: null,
    date: parts.date,
    time: parts.time,
    durationMinutes,
  }).length === 0;
}

export function rankBookingCandidates(
  scheduleId: string,
  sportId: string,
  fields: Field[],
  preferences: ScheduleFieldPreference[],
  promotions: FieldPromotion[],
): BookingCandidate[] {
  const compatibleIds = new Set(fields.filter((field) => field.sportId === sportId).map((field) => field.id));
  const teamCandidates = preferences
    .filter((row) => row.scheduleId === scheduleId && compatibleIds.has(row.fieldId))
    .sort((a, b) => a.priority - b.priority)
    .map((row) => ({ fieldId: row.fieldId, preferenceId: row.id, source: row.source, priority: row.priority }));

  const used = new Set(teamCandidates.map((row) => row.fieldId));
  const sponsored = promotions
    .filter((promotion) => promotion.active && promotion.sportId === sportId && compatibleIds.has(promotion.fieldId) && !used.has(promotion.fieldId))
    .map((promotion, index) => ({
      fieldId: promotion.fieldId,
      preferenceId: null,
      source: 'sponsored' as const,
      priority: 10_000 + index,
    }));

  return [...teamCandidates, ...sponsored];
}

export function nextBookingCandidate(
  game: Game,
  sportId: string,
  fields: Field[],
  preferences: ScheduleFieldPreference[],
  promotions: FieldPromotion[],
  attemptedFieldIds: string[],
  availabilities: FieldAvailability[],
  bookings: FieldBooking[],
): BookingCandidate | null {
  if (!game.scheduleId) return null;
  const candidates = rankBookingCandidates(game.scheduleId, sportId, fields, preferences, promotions);
  return (
    candidates.find(
      (candidate) =>
        !attemptedFieldIds.includes(candidate.fieldId) &&
        fieldIsAvailableAt(candidate.fieldId, game.scheduledAt, game.durationMinutes ?? 90, availabilities, bookings),
    ) ?? null
  );
}

export function findAlternativeSlots(
  fieldIds: string[],
  fromDate: string,
  durationMinutes: number,
  availabilities: FieldAvailability[],
  bookings: FieldBooking[],
  limit = 4,
): AvailableBookingSlot[] {
  const result: AvailableBookingSlot[] = [];
  const startDate = new Date(fromDate);
  startDate.setSeconds(0, 0);

  for (let offset = 0; offset < 21 && result.length < limit; offset += 1) {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + offset);
    const weekday = day.getDay();
    for (const fieldId of fieldIds) {
      const windows = availabilities.filter((slot) => slot.fieldId === fieldId && slot.active && slot.dayOfWeek === weekday);
      for (const window of windows) {
        for (
          let minute = timeToMinutes(window.startTime);
          minute + durationMinutes <= timeToMinutes(window.endTime) && result.length < limit;
          minute += Math.max(30, window.slotMinutes)
        ) {
          const candidate = new Date(day);
          candidate.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
          if (candidate.getTime() <= Date.now()) continue;
          if (!fieldIsAvailableAt(fieldId, candidate.toISOString(), durationMinutes, availabilities, bookings)) continue;
          result.push({ fieldId, startsAt: candidate.toISOString(), price: window.price });
        }
      }
    }
  }
  return result;
}
