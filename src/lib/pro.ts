import * as Linking from 'expo-linking';

import type { Attendance } from '@/types';
import type { ReliabilityEvent, SeasonStanding } from '@/types/pro';

export function checkInPayload(gameId: string, playerId: string, token: string): string {
  return `pelada://checkin/${encodeURIComponent(gameId)}/${encodeURIComponent(playerId)}/${encodeURIComponent(token)}`;
}
export function parseCheckInPayload(value: string): { gameId: string; playerId: string; token: string } | null {
  try {
    const url = new URL(value);
    const parts = [url.hostname, ...url.pathname.split('/').filter(Boolean)];
    const offset = parts[0] === 'checkin' ? 1 : parts.findIndex((part) => part === 'checkin') + 1;
    if (offset <= 0 || parts.length < offset + 3) return null;
    return { gameId: decodeURIComponent(parts[offset]), playerId: decodeURIComponent(parts[offset + 1]), token: decodeURIComponent(parts[offset + 2]) };
  } catch {
    return null;
  }
}

export function reliabilityScore(entityId: string, events: ReliabilityEvent[], attendances: Attendance[] = []): number {
  const eventPoints = events.filter((event) => event.entityId === entityId).reduce((sum, event) => sum + event.points, 0);
  const playerRows = attendances.filter((attendance) => attendance.playerId === entityId && attendance.status === 'confirmed');
  const attendancePoints = playerRows.reduce((sum, attendance) => sum + (attendance.noShow ? -18 : attendance.checkedIn ? 3 : 0), 0);
  return Math.max(0, Math.min(100, 80 + eventPoints + attendancePoints));
}

export function reliabilityLabel(score: number): string {
  if (score >= 90) return 'Excelente';
  if (score >= 75) return 'Confiável';
  if (score >= 60) return 'Em observação';
  return 'Baixa confiabilidade';
}

export function orderedStandings(rows: SeasonStanding[]): SeasonStanding[] {
  return [...rows].sort((a, b) => b.points - a.points || b.wins - a.wins || b.scored - a.scored || b.fairPlay - a.fairPlay);
}

export function referralLink(code: string): string {
  return Linking.createURL(`/convite/${encodeURIComponent(code)}`);
}

export function occupancyRate(bookedMinutes: number, availableMinutes: number): number {
  return availableMinutes <= 0 ? 0 : Math.min(100, Math.round((bookedMinutes / availableMinutes) * 100));
}

export const PRO_DOMAIN_VERSION = 1 as const;
