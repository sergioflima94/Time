import type { FieldBooking, FieldBookingRecurrence, ClassSession, ClassProgram } from '@/types';

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

function rangesOverlap(startA: number, durationA: number, startB: number, durationB: number): boolean {
  return startA < startB + durationB && startB < startA + durationA;
}

/**
 * Reservas existentes que conflitam com a candidata: mesmo campo, mesmo dia da
 * semana (direto ou por recorrência semanal) e intervalo sobreposto, inclusive
 * quando uma reserva começa na véspera e termina após meia-noite.
 */
export function findBookingConflicts(
  existing: FieldBooking[],
  candidate: FieldBookingCandidate,
  excludeId?: string,
): FieldBooking[] {
  return existing.filter((b) => {
    if (b.id === excludeId) return false;
    if (b.fieldId !== candidate.fieldId) return false;
    const anchor = candidate.date ?? b.date ?? '2026-01-04';
    const dates = (row: FieldBookingCandidate) => row.recurrence === 'single' ? (row.date ? [new Date(`${row.date}T00:00:00`)] : [])
      : Array.from({ length: 15 }, (_, i) => { const d = new Date(`${anchor}T00:00:00`); d.setDate(d.getDate() + i - 7); return d; }).filter(d => d.getDay() === row.dayOfWeek);
    return dates(candidate).some(a => dates(b).some(c => {
      const startA = a.getTime() + timeToMinutes(candidate.time) * 60000;
      const startB = c.getTime() + timeToMinutes(b.time) * 60000;
      return rangesOverlap(startA, candidate.durationMinutes * 60000, startB, b.durationMinutes * 60000);
    }));
  });
}

/** Classes also occupy the entire physical space, regardless of sport. */
export function findClassBookingConflicts(sessions: ClassSession[], programs: ClassProgram[], candidate: FieldBookingCandidate): ClassSession[] {
  return sessions.filter(s => {
    if (s.status === 'cancelled' || !programs.some(p => p.id === s.programId && p.fieldId === candidate.fieldId)) return false;
    const anchor = new Date(s.startsAt);
    const dates = candidate.recurrence === 'single' ? [new Date(`${candidate.date}T00:00:00`)]
      : [-1, 0, 1].map(delta => { const d = new Date(anchor); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + delta); return d; }).filter(d => d.getDay() === candidate.dayOfWeek);
    return dates.some(d => { const a = d.getTime() + timeToMinutes(candidate.time) * 60000; return a < Date.parse(s.endsAt) && a + candidate.durationMinutes * 60000 > Date.parse(s.startsAt); });
  });
}
