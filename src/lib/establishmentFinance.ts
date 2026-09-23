import { getSplitAmount } from '@/lib/payments';
import type { Attendance, Championship, ChampionshipTeam, Field, Game, Payment } from '@/types';

export type FinancialEntryType = 'game_split' | 'championship_fee';

export interface FinancialEntry {
  id: string;
  type: FinancialEntryType;
  label: string;
  sourceName: string;
  amount: number;
  date: string;
}

export interface FieldRevenue {
  fieldId: string;
  fieldName: string;
  amount: number;
}

export interface EstablishmentFinancialSummary {
  total: number;
  gamesRevenue: number;
  gamesPaidCount: number;
  championshipsRevenue: number;
  championshipTeamsCount: number;
  byField: FieldRevenue[];
}

/**
 * Relatório financeiro do estabelecimento, a partir do que já é rastreado no app:
 * rateio de jogos pago (`payments` com status "paid", valor = custo da quadra dividido
 * pelos confirmados no momento) e taxas de inscrição de campeonato (times confirmados ×
 * `entryFee`). Não inventa nenhuma fonte de receita nova.
 */
export function computeEstablishmentFinancials(params: {
  establishmentId: string;
  fields: Field[];
  games: Game[];
  attendances: Attendance[];
  payments: Payment[];
  championships: Championship[];
  championshipTeams: ChampionshipTeam[];
}): { summary: EstablishmentFinancialSummary; entries: FinancialEntry[] } {
  const { establishmentId, fields, games, attendances, payments, championships, championshipTeams } = params;

  const myFields = fields.filter((f) => f.establishmentId === establishmentId);
  const myFieldIds = new Set(myFields.map((f) => f.id));
  const fieldName = (fieldId: string) => myFields.find((f) => f.id === fieldId)?.name ?? '?';

  const entries: FinancialEntry[] = [];
  const byFieldMap = new Map<string, number>();

  const myGames = games.filter((g) => myFieldIds.has(g.fieldId));
  for (const game of myGames) {
    const confirmedCount = attendances.filter((a) => a.gameId === game.id && a.status === 'confirmed').length;
    const splitAmount = getSplitAmount(game.fieldCost ?? 0, confirmedCount);
    if (splitAmount <= 0) continue;
    const gamePayments = payments.filter((p) => p.gameId === game.id && p.status === 'paid');
    for (const payment of gamePayments) {
      entries.push({
        id: `payment-${payment.id}`,
        type: 'game_split',
        label: 'Rateio de jogo',
        sourceName: fieldName(game.fieldId),
        amount: splitAmount,
        date: payment.paidAt ?? game.scheduledAt,
      });
      byFieldMap.set(game.fieldId, (byFieldMap.get(game.fieldId) ?? 0) + splitAmount);
    }
  }

  const myChampionships = championships.filter((c) => c.establishmentId === establishmentId && !!c.entryFee);
  for (const champ of myChampionships) {
    const confirmedTeams = championshipTeams.filter((t) => t.championshipId === champ.id && t.status === 'confirmed');
    for (const team of confirmedTeams) {
      entries.push({
        id: `champ-team-${team.id}`,
        type: 'championship_fee',
        label: `Inscrição · ${team.name}`,
        sourceName: champ.name,
        amount: champ.entryFee ?? 0,
        date: team.createdAt,
      });
    }
  }

  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const gameEntries = entries.filter((e) => e.type === 'game_split');
  const championshipEntries = entries.filter((e) => e.type === 'championship_fee');
  const gamesRevenue = gameEntries.reduce((sum, e) => sum + e.amount, 0);
  const championshipsRevenue = championshipEntries.reduce((sum, e) => sum + e.amount, 0);

  const byField = myFields
    .map((f) => ({ fieldId: f.id, fieldName: f.name, amount: byFieldMap.get(f.id) ?? 0 }))
    .filter((f) => f.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return {
    summary: {
      total: gamesRevenue + championshipsRevenue,
      gamesRevenue,
      gamesPaidCount: gameEntries.length,
      championshipsRevenue,
      championshipTeamsCount: championshipEntries.length,
      byField,
    },
    entries,
  };
}
