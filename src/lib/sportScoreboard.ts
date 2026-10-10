import { sportRules, type SportDefinition } from '@/constants/sports';
import type { MultiSportScoreboard } from '@/types/growth';

/** Snapshot das regras. Uma edição posterior no catálogo não modifica o jogo. */
export function buildSportScoreboard(sport: SportDefinition, input: { id: string; createdBy: string; title: string; homeName: string; awayName: string; segmentId: string }): MultiSportScoreboard {
  const r = sportRules(sport);
  return { id: input.id, sportId: sport.id, createdBy: input.createdBy, title: input.title.trim(), homeName: input.homeName.trim(), awayName: input.awayName.trim(),
    unit: r.mode === 'sets' ? 'sets' : r.mode === 'periods' ? 'quarters' : sport.scoreSingular === 'gol' ? 'goals' : 'points',
    targetPoints: r.targetPoints, winByTwo: r.winByTwo, segmentsToWin: r.setsToWin, maxSegments: r.periods,
    scoreValues: [...r.scoreValues], periodMinutes: r.periodMinutes, status: 'live',
    segments: [{ id: input.segmentId, label: r.mode === 'sets' ? '1º set' : r.mode === 'periods' ? '1º período' : 'Partida', home: 0, away: 0, finished: false }],
  };
}
