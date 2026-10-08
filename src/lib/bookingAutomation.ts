import { findBookingConflicts } from '@/lib/fieldBooking';
import { distanceKm } from '@/lib/geo';
import type {
  Field,
  FieldAvailability,
  FieldBooking,
  FieldPromotion,
  Game,
  GameBookingRequest,
  GeoPoint,
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

export interface FieldRecommendation {
  fieldId: string;
  score: number;
  distanceKm: number | null;
  price: number | null;
  rating: number | null;
  cancellationRate: number;
  reasons: string[];
}

export interface PromotionAnalytics {
  attempts: number;
  confirmations: number;
  conversionPercent: number;
  estimatedRevenue: number;
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

/** Ordena sugestões sem esconder publicidade: proximidade, preço, avaliação e confiabilidade. */
export function recommendFields(
  sportId: string,
  fields: Field[],
  availabilities: FieldAvailability[],
  origin: GeoPoint | null,
): FieldRecommendation[] {
  const compatible = fields.filter((field) => field.sportId === sportId && field.establishmentId);
  const prices = compatible.flatMap((field) => availabilities.filter((row) => row.fieldId === field.id && row.active && row.price !== null).map((row) => row.price as number));
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 1;
  return compatible.map((field) => {
    const priceRows = availabilities.filter((row) => row.fieldId === field.id && row.active && row.price !== null);
    const price = priceRows.length ? Math.min(...priceRows.map((row) => row.price as number)) : null;
    const km = origin && field.location ? distanceKm(origin, field.location) : null;
    const rating = field.averageRating ?? null;
    const cancellationRate = field.cancellationRate ?? 0;
    const distanceScore = km === null ? 50 : Math.max(0, 100 - km * 8);
    const priceScore = price === null ? 45 : maxPrice === minPrice ? 100 : 100 - ((price - minPrice) / (maxPrice - minPrice)) * 100;
    const ratingScore = rating === null ? 60 : rating / 5 * 100;
    const reliabilityScore = Math.max(0, 100 - cancellationRate * 400);
    const score = Math.round(distanceScore * 0.3 + priceScore * 0.3 + ratingScore * 0.25 + reliabilityScore * 0.15);
    const reasons: string[] = [];
    if (km !== null) reasons.push(`${km.toFixed(1)} km`);
    if (price !== null) reasons.push(`a partir de R$ ${price.toFixed(0)}`);
    if (rating !== null) reasons.push(`${rating.toFixed(1)} ★`);
    if (cancellationRate <= 0.03) reasons.push('baixa taxa de cancelamento');
    return { fieldId: field.id, score, distanceKm: km, price, rating, cancellationRate, reasons };
  }).sort((a, b) => b.score - a.score);
}

export function computePromotionAnalytics(promotion: FieldPromotion, requests: GameBookingRequest[]): PromotionAnalytics {
  const related = requests.filter((row) => row.fieldId === promotion.fieldId && row.source === 'sponsored');
  const confirmations = related.filter((row) => row.status === 'accepted').length;
  return {
    attempts: related.length,
    confirmations,
    conversionPercent: related.length ? Math.round(confirmations / related.length * 100) : 0,
    estimatedRevenue: confirmations * promotion.pricePerConfirmedBooking,
  };
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
