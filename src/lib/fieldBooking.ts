import type { FieldBooking, FieldBookingRecurrence } from '@/types';

export interface FieldBookingCandidate {
  fieldId: string;
  recurrence: FieldBookingRecurrence;
  dayOfWeek: number | null;
  date: string | null;
  time: string;
  durationMinutes: number;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function weekdayOf(booking: FieldBookingCandidate): number | null {
  if (booking.recurrence === 'weekly') return booking.dayOfWeek;
  if (booking.date) return new Date(`${booking.date}T00:00:00`).getDay();
  return null;
}

function rangesOverlap(startA: number, durationA: number, startB: number, durationB: number): boolean {
  return startA < startB + durationB && startB < startA + durationA;
}

/**
 * Reservas existentes que conflitam com a candidata: mesmo campo, mesmo dia da
 * semana (direto ou por recorrência semanal) e horário sobreposto. Duas reservas
 * "single" só conflitam se forem exatamente na mesma data.
 */
export function findBookingConflicts(
  existing: FieldBooking[],
  candidate: FieldBookingCandidate,
  excludeId?: string,
): FieldBooking[] {
  const candWeekday = weekdayOf(candidate);
  if (candWeekday === null) return [];
  const candStart = timeToMinutes(candidate.time);

  return existing.filter((b) => {
    if (b.id === excludeId) return false;
    if (b.fieldId !== candidate.fieldId) return false;
    if (weekdayOf(b) !== candWeekday) return false;
    if (b.recurrence === 'single' && candidate.recurrence === 'single' && b.date !== candidate.date) return false;
    return rangesOverlap(candStart, candidate.durationMinutes, timeToMinutes(b.time), b.durationMinutes);
  });
}
