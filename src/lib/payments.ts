import type { Payment } from "@/types";

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Valor por pessoa no rateio, dividindo o custo da quadra pelos confirmados (mínimo 1 para evitar divisão por zero). */
export function getSplitAmount(
  fieldCost: number,
  confirmedCount: number,
): number {
  return fieldCost / Math.max(1, confirmedCount);
}

/** Quem já pagou o rateio de pelo menos um jogo também fica sem anúncios, igual assinante Premium. */
export function hasPaidAnyGame(playerId: string, payments: Payment[]): boolean {
  return payments.some(
    (p) =>
      p.playerId === playerId &&
      (p.status === "paid" || p.status === "invoice_paid"),
  );
}

export function isAdFree(
  isPremium: boolean,
  playerId: string,
  payments: Payment[],
): boolean {
  return isPremium || hasPaidAnyGame(playerId, payments);
}
