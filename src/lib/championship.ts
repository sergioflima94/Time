import type { Championship, ChampionshipGoal, ChampionshipMatch, ChampionshipTeam } from '@/types';

const uid = () => Math.random().toString(36).slice(2, 10);

type NewMatch = Omit<ChampionshipMatch, 'championshipId'>;

function baseMatch(round: number, roundLabel: string): NewMatch {
  return {
    id: uid(),
    round,
    roundLabel,
    teamAId: null,
    teamBId: null,
    feedsFromMatchAId: null,
    feedsFromMatchBId: null,
    fieldId: null,
    scheduledAt: null,
    startedAt: null,
    endedAt: null,
    status: 'scheduled',
    penaltyScoreA: null,
    penaltyScoreB: null,
    winnerTeamId: null,
  };
}

/**
 * Pontos corridos: todos contra todos, método do círculo. Cada time joga uma vez
 * contra cada outro. Times ímpares recebem uma folga ("bye") por rodada.
 */
export function generateRoundRobinFixtures(teams: ChampionshipTeam[]): NewMatch[] {
  const ids = teams.map((t) => t.id);
  if (ids.length < 2) return [];
  const hasBye = ids.length % 2 !== 0;
  const rotation: (string | null)[] = hasBye ? [...ids, null] : [...ids];
  const rounds = rotation.length - 1;
  const half = rotation.length / 2;
  const matches: NewMatch[] = [];

  let current = [...rotation];
  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < half; i++) {
      const a = current[i];
      const b = current[current.length - 1 - i];
      if (a && b) {
        const m = baseMatch(round, `Rodada ${round}`);
        m.teamAId = a;
        m.teamBId = b;
        matches.push(m);
      }
    }
    // gira todo mundo menos o primeiro (método do círculo)
    current = [current[0], current[current.length - 1], ...current.slice(1, -1)];
  }
  return matches;
}

const KNOCKOUT_ROUND_LABELS: Record<number, string> = {
  2: 'Final',
  4: 'Semifinal',
  8: 'Quartas de final',
  16: 'Oitavas de final',
  32: 'Décimas-sextas de final',
};

function knockoutLabel(teamsInRound: number): string {
  return KNOCKOUT_ROUND_LABELS[teamsInRound] ?? `Fase de ${teamsInRound}`;
}

/**
 * Mata-mata: monta a primeira fase com os times inscritos (completando com "bye" —
 * passagem direta — se não for potência de 2) e pré-cria as fases seguintes vazias,
 * já linkadas via feedsFromMatchAId/B pra avançar o vencedor automaticamente.
 */
export function generateKnockoutFixtures(teams: ChampionshipTeam[]): NewMatch[] {
  if (teams.length < 2) return [];
  let bracketSize = 2;
  while (bracketSize < teams.length) bracketSize *= 2;

  const ids: (string | null)[] = teams.map((t) => t.id);
  while (ids.length < bracketSize) ids.push(null); // byes

  const matches: NewMatch[] = [];
  let roundTeamsCount = bracketSize;
  let round = 1;

  const firstRound: NewMatch[] = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    const m = baseMatch(round, knockoutLabel(roundTeamsCount));
    m.teamAId = ids[i * 2];
    m.teamBId = ids[i * 2 + 1];
    // bye: já entra com vencedor definido (o único time real avança direto)
    if (m.teamAId && !m.teamBId) m.winnerTeamId = m.teamAId;
    if (!m.teamAId && m.teamBId) m.winnerTeamId = m.teamBId;
    if (m.winnerTeamId) m.status = 'finished';
    firstRound.push(m);
  }
  matches.push(...firstRound);

  let prevRoundMatches = firstRound;
  roundTeamsCount = roundTeamsCount / 2;
  round++;

  while (roundTeamsCount >= 2) {
    const thisRound: NewMatch[] = [];
    for (let i = 0; i < prevRoundMatches.length / 2; i++) {
      const m = baseMatch(round, knockoutLabel(roundTeamsCount));
      const feederA = prevRoundMatches[i * 2];
      const feederB = prevRoundMatches[i * 2 + 1];
      m.feedsFromMatchAId = feederA.id;
      m.feedsFromMatchBId = feederB.id;
      // se a fase anterior já tinha vencedor definido (bye), propaga de cara
      if (feederA.winnerTeamId) m.teamAId = feederA.winnerTeamId;
      if (feederB.winnerTeamId) m.teamBId = feederB.winnerTeamId;
      thisRound.push(m);
    }
    matches.push(...thisRound);
    prevRoundMatches = thisRound;
    roundTeamsCount = roundTeamsCount / 2;
    round++;
  }

  return matches;
}

export interface StandingRow {
  team: ChampionshipTeam;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

/** Classificação de pontos corridos: 3 pontos por vitória, 1 por empate. */
export function computeStandings(
  teams: ChampionshipTeam[],
  matches: ChampionshipMatch[],
  goals: ChampionshipGoal[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const team of teams) {
    rows.set(team.id, { team, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 });
  }

  for (const match of matches) {
    if (match.status !== 'finished' || !match.teamAId || !match.teamBId) continue;
    const rowA = rows.get(match.teamAId);
    const rowB = rows.get(match.teamBId);
    if (!rowA || !rowB) continue;

    const goalsA = goals.filter((g) => g.matchId === match.id && g.teamId === match.teamAId).length;
    const goalsB = goals.filter((g) => g.matchId === match.id && g.teamId === match.teamBId).length;

    rowA.played++; rowB.played++;
    rowA.goalsFor += goalsA; rowA.goalsAgainst += goalsB;
    rowB.goalsFor += goalsB; rowB.goalsAgainst += goalsA;

    if (goalsA > goalsB) { rowA.wins++; rowA.points += 3; rowB.losses++; }
    else if (goalsB > goalsA) { rowB.wins++; rowB.points += 3; rowA.losses++; }
    else { rowA.draws++; rowB.draws++; rowA.points++; rowB.points++; }
  }

  for (const row of rows.values()) row.goalDiff = row.goalsFor - row.goalsAgainst;

  return [...rows.values()].sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor);
}

export interface TopScorerRow {
  playerId: string;
  goals: number;
}

export function computeTopScorers(goals: ChampionshipGoal[]): TopScorerRow[] {
  const counts = new Map<string, number>();
  for (const g of goals) {
    if (!g.scorerPlayerId) continue;
    counts.set(g.scorerPlayerId, (counts.get(g.scorerPlayerId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([playerId, count]) => ({ playerId, goals: count }))
    .sort((a, b) => b.goals - a.goals);
}

/** Depois que uma partida de mata-mata termina, propaga o vencedor pras partidas que dependem dela. */
export function advanceWinner(matches: ChampionshipMatch[], finishedMatchId: string): ChampionshipMatch[] {
  const finished = matches.find((m) => m.id === finishedMatchId);
  if (!finished || !finished.winnerTeamId) return matches;
  return matches.map((m) => {
    if (m.feedsFromMatchAId === finishedMatchId) return { ...m, teamAId: finished.winnerTeamId };
    if (m.feedsFromMatchBId === finishedMatchId) return { ...m, teamBId: finished.winnerTeamId };
    return m;
  });
}

export function formatChampionshipStatus(status: Championship['status']): string {
  if (status === 'registration') return 'Inscrições abertas';
  if (status === 'in_progress') return 'Em andamento';
  return 'Encerrado';
}
