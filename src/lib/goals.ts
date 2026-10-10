import type { Game, Goal, MatchTurn, TeamPlayer } from '@/types';

export interface PlayerGoalStats {
  scored: number;
  /** Saldo de gols: soma, em cada rodada que o time do jogador disputou, de (gols do time - gols sofridos). */
  balance: number;
}

export function computePlayerGoalStats(
  playerId: string,
  teamPlayers: TeamPlayer[],
  turns: MatchTurn[],
  goals: Goal[],
): PlayerGoalStats {
  const scored = goals.filter((g) => g.scorerPlayerId === playerId).length;

  const myTeamIds = new Set(teamPlayers.filter((tp) => tp.playerId === playerId).map((tp) => tp.teamId));
  let balance = 0;
  for (const turn of turns) {
    if(turn.rosterSnapshot){
      const intervals=turn.rosterSnapshot.filter(r=>r.playerId===playerId);
      for(const goal of goals.filter(g=>g.matchTurnId===turn.id)){
        const entry=intervals.find(r=>Date.parse(goal.scoredAt)>=Date.parse(r.joinedAt)&&(!r.leftAt||Date.parse(goal.scoredAt)<Date.parse(r.leftAt)));
        if(entry)balance+=goal.teamId===entry.teamId?1:-1;
      }
      continue;
    }
    let myTeamId: string | null = null;
    let oppTeamId: string | null = null;
    if (myTeamIds.has(turn.teamAId)) {
      myTeamId = turn.teamAId;
      oppTeamId = turn.teamBId;
    } else if (myTeamIds.has(turn.teamBId)) {
      myTeamId = turn.teamBId;
      oppTeamId = turn.teamAId;
    }
    if (!myTeamId) continue;
    const myGoals = goals.filter((g) => g.matchTurnId === turn.id && g.teamId === myTeamId).length;
    const oppGoals = goals.filter((g) => g.matchTurnId === turn.id && g.teamId === oppTeamId).length;
    balance += myGoals - oppGoals;
  }

  return { scored, balance };
}

export function computeAllGoalStats(
  playerIds: string[],
  teamPlayers: TeamPlayer[],
  turns: MatchTurn[],
  goals: Goal[],
): Record<string, PlayerGoalStats> {
  return Object.fromEntries(playerIds.map((id) => [id, computePlayerGoalStats(id, teamPlayers, turns, goals)]));
}

export interface GoalStatsByGroup {
  peladaId: string;
  peladaName: string;
  stats: PlayerGoalStats;
}

/** Gols do jogador separados por pelada (grupo), além do geral (computePlayerGoalStats com tudo junto). */
export function computePlayerGoalStatsByGroup(
  playerId: string,
  teamPlayers: TeamPlayer[],
  turns: MatchTurn[],
  goals: Goal[],
  games: Game[],
  peladas: { id: string; name: string }[],
): GoalStatsByGroup[] {
  return peladas.map((pelada) => {
    const peladaTurns = turns.filter((t) => games.find((g) => g.id === t.gameId)?.peladaId === pelada.id);
    const turnIds = new Set(peladaTurns.map((t) => t.id));
    const peladaGoals = goals.filter((g) => turnIds.has(g.matchTurnId));
    return {
      peladaId: pelada.id,
      peladaName: pelada.name,
      stats: computePlayerGoalStats(playerId, teamPlayers, peladaTurns, peladaGoals),
    };
  });
}
