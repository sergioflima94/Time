import type { Attendance, Game, MatchTurn, Rating, TeamPlayer } from '@/types';

export interface PlayerRecord {
  played: number;
  wins: number;
  draws: number;
  losses: number;
}

/** Vitórias/empates/derrotas do jogador, contando cada rodada (MatchTurn) que ele disputou. */
export function computePlayerRecord(playerId: string, teamPlayers: TeamPlayer[], turns: MatchTurn[]): PlayerRecord {
  const myTeamIds = new Set(teamPlayers.filter((tp) => tp.playerId === playerId).map((tp) => tp.teamId));
  const record: PlayerRecord = { played: 0, wins: 0, draws: 0, losses: 0 };

  for (const turn of turns) {
    if (!turn.endedAt) continue;
    const myTeamId = myTeamIds.has(turn.teamAId) ? turn.teamAId : myTeamIds.has(turn.teamBId) ? turn.teamBId : null;
    if (!myTeamId) continue;
    record.played += 1;
    if (turn.winnerTeamId === null) record.draws += 1;
    else if (turn.winnerTeamId === myTeamId) record.wins += 1;
    else record.losses += 1;
  }

  return record;
}

export interface OveralTrend {
  recentAvg: number | null;
  previousAvg: number | null;
  delta: number | null;
  direction: 'up' | 'down' | 'stable' | 'new';
}

/**
 * Compara a nota geral (0-99) das últimas `windowSize` avaliações recebidas com as
 * `windowSize` anteriores, para mostrar se o jogador está melhorando ou piorando.
 */
export function computeOverallTrend(playerId: string, ratings: Rating[], windowSize = 5): OveralTrend {
  const received = ratings
    .filter((r) => r.ratedPlayerId === playerId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (received.length === 0) {
    return { recentAvg: null, previousAvg: null, delta: null, direction: 'new' };
  }

  const to99 = (stars: number) => Math.round((stars * 99) / 5);
  const avgOf = (list: Rating[]) => to99(list.reduce((sum, r) => sum + r.overall, 0) / list.length);

  const recent = received.slice(-windowSize);
  const previous = received.slice(-windowSize * 2, -windowSize);

  const recentAvg = avgOf(recent);
  if (previous.length === 0) {
    return { recentAvg, previousAvg: null, delta: null, direction: 'new' };
  }

  const previousAvg = avgOf(previous);
  const delta = recentAvg - previousAvg;
  const direction = delta > 1 ? 'up' : delta < -1 ? 'down' : 'stable';
  return { recentAvg, previousAvg, delta, direction };
}

export interface PlayerActivitySummary {
  gamesPlayed: number;
  confirmedUpcoming: number;
  noShows: number;
}

export function computePlayerActivitySummary(
  playerId: string,
  games: Game[],
  attendances: Attendance[],
): PlayerActivitySummary {
  const now = Date.now();
  const mine = attendances.filter((a) => a.playerId === playerId);

  const gamesPlayed = mine.filter((a) => {
    if (a.status !== 'confirmed' || a.noShow) return false;
    const game = games.find((g) => g.id === a.gameId);
    return game?.status === 'finished';
  }).length;

  const confirmedUpcoming = mine.filter((a) => {
    if (a.status !== 'confirmed') return false;
    const game = games.find((g) => g.id === a.gameId);
    return !!game && new Date(game.scheduledAt).getTime() >= now && game.status !== 'cancelled';
  }).length;

  const noShows = mine.filter((a) => a.noShow).length;

  return { gamesPlayed, confirmedUpcoming, noShows };
}
