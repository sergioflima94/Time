import type { Championship, ChampionshipBudgetInput, ChampionshipFormat, ChampionshipGoal, ChampionshipMatch, ChampionshipTeam } from '@/types';

const uid = () => Math.random().toString(36).slice(2, 10);

export function estimateChampionshipMatchCount(format: ChampionshipFormat, teamCount: number): number {
  const teams = Math.max(2, Math.floor(teamCount));
  return format === 'round_robin' ? (teams * (teams - 1)) / 2 : teams - 1;
}

export interface ChampionshipPricingResult {
  matchCount: number;
  costPerMatch: number;
  variableCosts: number;
  fixedCosts: number;
  contingencyCost: number;
  operatingCost: number;
  breakEvenRevenue: number;
  breakEvenEntryFee: number;
  recommendedRevenue: number;
  recommendedEntryFee: number;
  projectedRevenue: number;
  projectedPaymentFees: number;
  projectedProfit: number;
  projectedMarginPercent: number;
}

const nonNegative = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);
const roundUpToFive = (value: number) => Math.ceil(value / 5) * 5;

export function normalizeChampionshipBudget(input: ChampionshipBudgetInput): ChampionshipBudgetInput {
  return {
    ...input,
    plannedTeams: Math.max(2, Math.floor(nonNegative(input.plannedTeams))),
    fieldCostPerMatch: nonNegative(input.fieldCostPerMatch),
    refereeCostPerMatch: nonNegative(input.refereeCostPerMatch),
    assistantRefereeCostPerMatch: nonNegative(input.assistantRefereeCostPerMatch),
    tableStaffCostPerMatch: nonNegative(input.tableStaffCostPerMatch),
    prizeCost: nonNegative(input.prizeCost),
    trophiesCost: nonNegative(input.trophiesCost),
    medicalCost: nonNegative(input.medicalCost),
    securityCost: nonNegative(input.securityCost),
    marketingCost: nonNegative(input.marketingCost),
    materialsCost: nonNegative(input.materialsCost),
    cleaningCost: nonNegative(input.cleaningCost),
    foodWaterCost: nonNegative(input.foodWaterCost),
    licensesCost: nonNegative(input.licensesCost),
    otherCost: nonNegative(input.otherCost),
    contingencyPercent: Math.min(100, nonNegative(input.contingencyPercent)),
    paymentFeePercent: Math.min(99, nonNegative(input.paymentFeePercent)),
    targetProfit: nonNegative(input.targetProfit),
  };
}

/** Calcula ponto de equilíbrio, inscrição sugerida e lucro para a taxa escolhida. */
export function calculateChampionshipPricing(
  format: ChampionshipFormat,
  budget: ChampionshipBudgetInput,
  entryFeePerTeam: number,
): ChampionshipPricingResult {
  budget = normalizeChampionshipBudget(budget);
  const teams = budget.plannedTeams;
  const matchCount = estimateChampionshipMatchCount(format, teams);
  const costPerMatch = [
    budget.fieldCostPerMatch,
    budget.refereeCostPerMatch,
    budget.assistantRefereeCostPerMatch,
    budget.tableStaffCostPerMatch,
  ].reduce((sum, value) => sum + nonNegative(value), 0);
  const variableCosts = costPerMatch * matchCount;
  const fixedCosts = [
    budget.prizeCost,
    budget.trophiesCost,
    budget.medicalCost,
    budget.securityCost,
    budget.marketingCost,
    budget.materialsCost,
    budget.cleaningCost,
    budget.foodWaterCost,
    budget.licensesCost,
    budget.otherCost,
  ].reduce((sum, value) => sum + nonNegative(value), 0);
  const subtotal = variableCosts + fixedCosts;
  const contingencyCost = subtotal * (nonNegative(budget.contingencyPercent) / 100);
  const operatingCost = subtotal + contingencyCost;
  const paymentRate = budget.paymentFeePercent / 100;
  const breakEvenRevenue = operatingCost / (1 - paymentRate);
  const recommendedRevenue = (operatingCost + nonNegative(budget.targetProfit)) / (1 - paymentRate);
  const projectedRevenue = nonNegative(entryFeePerTeam) * teams;
  const projectedPaymentFees = projectedRevenue * paymentRate;
  const projectedProfit = projectedRevenue - projectedPaymentFees - operatingCost;
  return {
    matchCount,
    costPerMatch,
    variableCosts,
    fixedCosts,
    contingencyCost,
    operatingCost,
    breakEvenRevenue,
    breakEvenEntryFee: roundUpToFive(breakEvenRevenue / teams),
    recommendedRevenue,
    recommendedEntryFee: roundUpToFive(recommendedRevenue / teams),
    projectedRevenue,
    projectedPaymentFees,
    projectedProfit,
    projectedMarginPercent: projectedRevenue > 0 ? (projectedProfit / projectedRevenue) * 100 : 0,
  };
}

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
