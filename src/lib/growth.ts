import type { MultiSportScoreboard, ScoreSegment, WalletEntry } from '@/types/growth';

export function walletBalance(playerId: string, entries: WalletEntry[]): number {
  return entries
    .filter((entry) => entry.playerId === playerId)
    .reduce((total, entry) => total + (entry.kind === 'debit' ? -entry.amount : entry.amount), 0);
}

export function scoreboardTotal(scoreboard: MultiSportScoreboard): { home: number; away: number } {
  if (scoreboard.unit === 'sets') {
    return scoreboard.segments.reduce(
      (total, segment) => {
        if (!segment.finished || segment.home === segment.away) return total;
        return segment.home > segment.away
          ? { ...total, home: total.home + 1 }
          : { ...total, away: total.away + 1 };
      },
      { home: 0, away: 0 },
    );
  }
  return scoreboard.segments.reduce(
    (total, segment) => ({ home: total.home + segment.home, away: total.away + segment.away }),
    { home: 0, away: 0 },
  );
}

export function segmentCanFinish(segment: ScoreSegment, targetPoints: number | null, winByTwo: boolean): boolean {
  if (!targetPoints) return true;
  const high = Math.max(segment.home, segment.away);
  const difference = Math.abs(segment.home - segment.away);
  return high >= targetPoints && (!winByTwo || difference >= 2);
}

export function currency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function percentage(value: number, total: number): number {
  return total <= 0 ? 0 : Math.round((value / total) * 100);
}
