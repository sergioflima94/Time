import type { AvailabilitySlot, GeoPoint, Player } from '@/types';

const EARTH_RADIUS_KM = 6371;

/** Distância aproximada em km entre dois pontos (fórmula de Haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Formata a distância pra exibição — nunca mostra a localização exata, só a distância arredondada. */
export function formatDistance(km: number): string {
  if (km < 1) return 'menos de 1 km';
  return `~${Math.round(km)} km`;
}

/** Um jogador tem alguma janela de disponibilidade que cobre o horário do jogo? */
export function isAvailableAt(availability: AvailabilitySlot[], dateIso: string): boolean {
  if (availability.length === 0) return true; // sem restrição cadastrada = topa qualquer horário
  const date = new Date(dateIso);
  const weekday = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();
  return availability.some((slot) => {
    if (slot.weekday !== weekday) return false;
    const [startH, startM] = slot.startTime.split(':').map(Number);
    const [endH, endM] = slot.endTime.split(':').map(Number);
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;
    return minutes >= start && minutes <= end;
  });
}

export interface FreeAgentMatch {
  player: Player;
  distanceKm: number;
  availableAtGameTime: boolean;
}

/**
 * Jogadores livres (opt-in) perto de uma origem, que ainda não são membros da
 * pelada nem já foram convidados/estão nesse jogo. Ordenado por distância.
 */
export function findNearbyFreeAgents(params: {
  players: Player[];
  origin: GeoPoint;
  excludePlayerIds: Set<string>;
  gameScheduledAt: string;
  position?: 'goalkeeper' | 'line';
}): FreeAgentMatch[] {
  const { players, origin, excludePlayerIds, gameScheduledAt, position } = params;
  return players
    .filter((p) => p.freeAgentOptIn && p.location && !excludePlayerIds.has(p.id))
    .filter((p) => !position || p.preferredPosition === position)
    .map((p) => ({
      player: p,
      distanceKm: distanceKm(origin, p.location as GeoPoint),
      availableAtGameTime: isAvailableAt(p.freeAgentAvailability, gameScheduledAt),
    }))
    .filter((m) => m.distanceKm <= (m.player.freeAgentRadiusKm ?? 0))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
