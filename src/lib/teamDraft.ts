import type { DrawMethod } from '@/types';

export interface DraftPlayer {
  id: string;
  name: string;
  photoUrl?: string | null;
  overall: number; // 0-99, usado no método "por nota"
  isGoalkeeper: boolean;
  confirmedOrder?: number | null;
}

export interface DraftedTeam {
  players: DraftPlayer[];
  goalkeeper: DraftPlayer | null;
  totalOverall: number;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Sorteia os times a partir da lista de jogadores confirmados.
 *
 * - "arrival": os primeiros a confirmar presença formam o time 1, os seguintes o
 *   time 2, e assim por diante — quem sobra fica "de próximo" na fila de rodízio.
 * - "random": embaralha todo mundo e distribui em blocos.
 * - "rating": ordena por nota geral (desc) e distribui em zig-zag para equilibrar
 *   a soma de notas de cada time.
 *
 * Goleiros são distribuídos um por time antes dos jogadores de linha, sempre que houver.
 */
export function drawTeams(players: DraftPlayer[], teamSize: number, method: DrawMethod): DraftedTeam[] {
  if (players.length === 0) return [];
  const numTeams = Math.max(2, Math.ceil(players.length / teamSize));

  const goalkeepers = players.filter((p) => p.isGoalkeeper);
  const lines = players.filter((p) => !p.isGoalkeeper);

  const teams: DraftPlayer[][] = Array.from({ length: numTeams }, () => []);
  goalkeepers.forEach((gk, i) => {
    const teamIdx = i % numTeams;
    if (teams[teamIdx].length < teamSize) teams[teamIdx].push(gk);
  });

  const remainingCapacity = teams.map((t) => teamSize - t.length);
  let orderedLines: DraftPlayer[];
  if (method === 'random') {
    orderedLines = shuffle(lines);
  } else if (method === 'rating') {
    orderedLines = [...lines].sort((a, b) => b.overall - a.overall);
  } else {
    orderedLines = [...lines].sort((a, b) => (a.confirmedOrder ?? 0) - (b.confirmedOrder ?? 0));
  }

  const filledTeams = fillRespectingCapacity(
    teams,
    orderedLines,
    remainingCapacity,
    method === 'rating' ? 'rating' : 'chunk',
  );

  return filledTeams.map((teamPlayers) => ({
    players: teamPlayers,
    goalkeeper: teamPlayers.find((p) => p.isGoalkeeper) ?? null,
    totalOverall: teamPlayers.reduce((sum, p) => sum + p.overall, 0),
  }));
}

function fillRespectingCapacity(
  baseTeams: DraftPlayer[][],
  ordered: DraftPlayer[],
  capacity: number[],
  mode: 'chunk' | 'rating',
): DraftPlayer[][] {
  const teams = baseTeams.map((t) => [...t]);
  const cap = [...capacity];

  if (mode === 'chunk') {
    let teamIdx = 0;
    for (const player of ordered) {
      while (teamIdx < teams.length && cap[teamIdx] <= 0) teamIdx++;
      if (teamIdx >= teams.length) break;
      teams[teamIdx].push(player);
      cap[teamIdx]--;
      if (cap[teamIdx] <= 0) teamIdx++;
    }
    return teams;
  }

  // "rating": zig-zag respeitando capacidade restante de cada time
  let idx = 0;
  let direction = 1;
  for (const player of ordered) {
    let attempts = 0;
    while (cap[idx] <= 0 && attempts <= teams.length) {
      idx += direction;
      if (idx >= teams.length || idx < 0) {
        direction *= -1;
        idx += direction;
      }
      attempts++;
    }
    if (cap[idx] <= 0) break;
    teams[idx].push(player);
    cap[idx]--;
    idx += direction;
    if (idx >= teams.length || idx < 0) {
      direction *= -1;
      idx += direction;
    }
  }
  return teams;
}

export type MatchResult = 'teamA' | 'teamB' | 'draw';

/**
 * Fila de rodízio: index 0 e 1 jogam, os demais ficam "de próximo".
 * Regra padrão de pelada: quem ganha fica esperando o próximo desafiante, quem
 * perde vai para o fim da fila. Em empate, os dois times saem e os dois
 * próximos da fila entram.
 */
export function advanceQueue(queue: string[], result: MatchResult): string[] {
  if (queue.length < 2) return queue;
  const [teamA, teamB, ...waiting] = queue;
  if (queue.length < 3) return queue; // ninguém esperando, os dois times continuam se enfrentando

  if (result === 'draw') {
    return [...waiting, teamA, teamB];
  }
  const winner = result === 'teamA' ? teamA : teamB;
  const loser = result === 'teamA' ? teamB : teamA;
  return [winner, ...waiting, loser];
}

export const TEAM_COLORS = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#A855F7', '#14B8A6'];
export const TEAM_NAMES = ['Time A', 'Time B', 'Time C', 'Time D', 'Time E', 'Time F', 'Time G', 'Time H'];

export function teamName(index: number): string {
  return TEAM_NAMES[index] ?? `Time ${index + 1}`;
}

export function teamColor(index: number): string {
  return TEAM_COLORS[index % TEAM_COLORS.length];
}

export interface WaitingCandidate {
  playerId: string;
  /** Posição na ordenação do método escolhido na 1ª vez (0 = prioridade mais alta). Usado só como desempate. */
  tiebreakRank: number;
  isGoalkeeper: boolean;
}

export interface IndividualDraftResult {
  teamA: DraftedTeam;
  teamB: DraftedTeam;
  /** Todo mundo que sobrou vira bolsa de espera — ninguém mais fica em time fixo. */
  waiting: WaitingCandidate[];
}

function orderByMethod(list: DraftPlayer[], method: DrawMethod): DraftPlayer[] {
  if (method === 'random') return shuffle(list);
  if (method === 'rating') return [...list].sort((a, b) => b.overall - a.overall);
  return [...list].sort((a, b) => (a.confirmedOrder ?? 0) - (b.confirmedOrder ?? 0));
}

/**
 * Sorteia só o 1º confronto (times A e B) e deixa todo o resto como bolsa de
 * jogadores avulsos, ordenada pelo método escolhido — essa ordem vira o
 * critério de desempate de prioridade sempre que um novo desafiante for
 * puxado da bolsa (ver `pickNextChallenger`), depois de "quem esperou mais".
 */
export function drawFirstMatchIndividual(players: DraftPlayer[], teamSize: number, method: DrawMethod): IndividualDraftResult {
  const orderedGoalkeepers = orderByMethod(players.filter((p) => p.isGoalkeeper), method);
  const orderedLines = orderByMethod(players.filter((p) => !p.isGoalkeeper), method);

  const teamASeed: DraftPlayer[] = [];
  const teamBSeed: DraftPlayer[] = [];
  // 1 goleiro pra cada time primeiro, se houver
  orderedGoalkeepers.slice(0, 2).forEach((gk, i) => (i % 2 === 0 ? teamASeed : teamBSeed).push(gk));

  const remainingGoalkeepers = orderedGoalkeepers.slice(2);
  const pool = [...remainingGoalkeepers, ...orderedLines];
  // mesma lógica de preenchimento do drawTeams: zig-zag (snake) por nota equilibra
  // melhor a soma dos dois times do que "chunk" (primeira metade pra A, resto pra B).
  const [teamA, teamB] = fillRespectingCapacity(
    [teamASeed, teamBSeed],
    pool,
    [teamSize - teamASeed.length, teamSize - teamBSeed.length],
    method === 'rating' ? 'rating' : 'chunk',
  );

  const usedIds = new Set([...teamA, ...teamB].map((p) => p.id));
  const waitingOrdered = [...orderedGoalkeepers, ...orderedLines].filter((p) => !usedIds.has(p.id));
  const waiting: WaitingCandidate[] = waitingOrdered.map((p, i) => ({ playerId: p.id, tiebreakRank: i, isGoalkeeper: p.isGoalkeeper }));

  const toDrafted = (list: DraftPlayer[]): DraftedTeam => ({
    players: list,
    goalkeeper: list.find((p) => p.isGoalkeeper) ?? null,
    totalOverall: list.reduce((sum, p) => sum + p.overall, 0),
  });

  return { teamA: toDrafted(teamA), teamB: toDrafted(teamB), waiting };
}

export interface WaitingEntry extends WaitingCandidate {
  roundsWaited: number;
}

/**
 * Puxa o próximo desafiante da bolsa de espera: prioridade por quem já ficou
 * mais rodadas de fora (`roundsWaited` maior primeiro); empate é resolvido
 * pela ordem do sorteio original (`tiebreakRank` menor primeiro). Se ninguém
 * dos escolhidos for goleiro mas houver um disponível mais abaixo na fila, ele
 * entra no lugar de quem tinha menor prioridade (esportes sem goleiro nunca
 * têm ninguém com `isGoalkeeper: true` na bolsa, então isso nunca dispara).
 */
export function pickNextChallenger(
  waiting: WaitingEntry[],
  teamSize: number,
): { chosen: WaitingEntry[]; remaining: WaitingEntry[] } {
  const sorted = [...waiting].sort((a, b) => b.roundsWaited - a.roundsWaited || a.tiebreakRank - b.tiebreakRank);
  const chosen = sorted.slice(0, teamSize);
  let rest = sorted.slice(teamSize);

  if (chosen.length > 0 && !chosen.some((c) => c.isGoalkeeper)) {
    const gkIdx = rest.findIndex((c) => c.isGoalkeeper);
    if (gkIdx !== -1) {
      const [gk] = rest.splice(gkIdx, 1);
      const displaced = chosen.pop()!;
      chosen.push(gk);
      rest = [displaced, ...rest];
    }
  }

  const chosenIds = new Set(chosen.map((c) => c.playerId));
  const remaining = waiting.filter((w) => !chosenIds.has(w.playerId));
  return { chosen, remaining };
}
