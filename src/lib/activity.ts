import type { Game, Goal, Pelada, PeladaMembership } from '@/types';

export interface ActivityItem {
  id: string;
  playerId: string;
  createdAt: string;
  type: 'goal' | 'joined_pelada';
  peladaName: string;
  sportId: string | null;
  /** Só para type === 'goal': quantos gols/pontos ele fez naquele jogo (agrupado). */
  goalCount?: number;
}

/**
 * Feed de atividades (estilo rede social) gerado a partir de dados que já existem —
 * gols marcados (agrupados por jogo, pra não poluir com um item por gol) e peladas
 * que os jogadores entraram — sem precisar de uma tabela de "posts" separada.
 */
export function computeActivityFeed(
  playerIds: string[],
  goals: Goal[],
  games: Game[],
  memberships: PeladaMembership[],
  peladas: Pelada[],
): ActivityItem[] {
  const idSet = new Set(playerIds);
  const peladaById = new Map(peladas.map((p) => [p.id, p]));
  const gameById = new Map(games.map((g) => [g.id, g]));

  const goalGroups = new Map<string, { playerId: string; gameId: string; count: number }>();
  for (const goal of goals) {
    if (!goal.scorerPlayerId || !idSet.has(goal.scorerPlayerId)) continue;
    const key = `${goal.scorerPlayerId}:${goal.gameId}`;
    const existing = goalGroups.get(key);
    if (existing) existing.count += 1;
    else goalGroups.set(key, { playerId: goal.scorerPlayerId, gameId: goal.gameId, count: 1 });
  }

  const items: ActivityItem[] = [];

  for (const { playerId, gameId, count } of goalGroups.values()) {
    const game = gameById.get(gameId);
    const pelada = game ? peladaById.get(game.peladaId) : null;
    if (!game || !pelada) continue;
    items.push({
      id: `goal:${playerId}:${gameId}`,
      playerId,
      createdAt: game.scheduledAt,
      type: 'goal',
      peladaName: pelada.name,
      sportId: pelada.sportId,
      goalCount: count,
    });
  }

  for (const m of memberships) {
    if (!m.active || !idSet.has(m.playerId)) continue;
    const pelada = peladaById.get(m.peladaId);
    if (!pelada) continue;
    items.push({
      id: `joined:${m.playerId}:${m.peladaId}`,
      playerId: m.playerId,
      createdAt: m.joinedAt,
      type: 'joined_pelada',
      peladaName: pelada.name,
      sportId: pelada.sportId,
    });
  }

  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
