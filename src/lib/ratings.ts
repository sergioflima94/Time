import type { Attendance, Game, PlayerOverall, Rating } from '@/types';

const STARS_TO_99 = 99 / 5;

/** Converte a média de estrelas (1-5) para a escala 0-99 estilo carta de FIFA. */
export function starsTo99(stars: number): number {
  return Math.round(stars * STARS_TO_99);
}

export function computePlayerOverall(playerId: string, ratings: Rating[]): PlayerOverall {
  const received = ratings.filter((r) => r.ratedPlayerId === playerId);
  if (received.length === 0) {
    return { playerId, overall: 60, attack: 60, defense: 60, pace: 60, ratingsCount: 0 };
  }
  const avg = (pick: (r: Rating) => number) => received.reduce((sum, r) => sum + pick(r), 0) / received.length;
  return {
    playerId,
    overall: starsTo99(avg((r) => r.overall)),
    attack: starsTo99(avg((r) => r.attack)),
    defense: starsTo99(avg((r) => r.defense)),
    pace: starsTo99(avg((r) => r.pace)),
    ratingsCount: received.length,
  };
}

export function computeAllOveralls(playerIds: string[], ratings: Rating[]): Record<string, PlayerOverall> {
  return Object.fromEntries(playerIds.map((id) => [id, computePlayerOverall(id, ratings)]));
}

/**
 * Jogos finalizados em que o jogador participou e ainda não avaliou todos os
 * outros companheiros que também confirmaram presença.
 */
export function getPendingRatingGames(
  games: Game[],
  attendances: Attendance[],
  ratings: Rating[],
  playerId: string,
): Game[] {
  return games.filter((game) => {
    if (game.status !== 'finished') return false;
    const myAttendance = attendances.find((a) => a.gameId === game.id && a.playerId === playerId);
    if (!myAttendance || myAttendance.status !== 'confirmed' || myAttendance.noShow) return false;

    const others = attendances.filter(
      (a) => a.gameId === game.id && a.status === 'confirmed' && a.playerId !== playerId && !a.noShow,
    );
    const alreadyRated = new Set(
      ratings.filter((r) => r.gameId === game.id && r.raterPlayerId === playerId).map((r) => r.ratedPlayerId),
    );
    return others.some((o) => !alreadyRated.has(o.playerId));
  });
}

/** Faixa de cor da carta, igual aos games de futebol: bronze/prata/ouro/especial. */
export function overallTier(overall: number): { label: string; color: string; gradient: [string, string, string] } {
  if (overall >= 85) return { label: 'Especial', color: '#A855F7', gradient: ['#C026D3', '#7C3AED', '#1E1B4B'] };
  if (overall >= 75) return { label: 'Ouro', color: '#F0C64C', gradient: ['#FDE68A', '#D4AF37', '#78350F'] };
  if (overall >= 65) return { label: 'Prata', color: '#D6DBE2', gradient: ['#F1F5F9', '#9CA3AF', '#334155'] };
  return { label: 'Bronze', color: '#D69A63', gradient: ['#E8B27E', '#B08D57', '#4A2E12'] };
}
