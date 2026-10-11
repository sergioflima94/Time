import { REVIEW_CRITERIA, type ReviewTarget, type NpsSummary, type ReviewSummary } from '@/types/venueReviews';

export function reviewText(value: unknown, required = false, max = 1500): string {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new Error(`Escreva ${required ? 'de 1 a' : 'até'} ${max} caracteres.`);
  return value.trim();
}
export function validateReview(target: ReviewTarget, score: unknown, criteria: unknown, nps: unknown) {
  const star = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
  if (!['field', 'establishment'].includes(target) || !star(score)) throw new Error('Escolha uma nota de 1 a 5 estrelas.');
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) throw new Error('Avalie os critérios do local.');
  const values = criteria as Record<string, unknown>, keys = Object.keys(REVIEW_CRITERIA[target]);
  if (Object.entries(values).some(([k, v]) => !keys.includes(k) || !star(v)) || keys.some(k => k !== 'snack' && !star(values[k]))) throw new Error('Preencha os critérios de 1 a 5. Lanchonete é opcional.');
  if (nps !== null && nps !== undefined && (target !== 'establishment' || typeof nps !== 'number' || !Number.isInteger(nps) || nps < 0 || nps > 10)) throw new Error('A recomendação deve ser de 0 a 10, somente para o estabelecimento.');
}
export function summarizeReviews(rows: Array<{ score: number; criteria: Record<string, number>; hidden: boolean }>): ReviewSummary {
  const visible = rows.filter(r => !r.hidden), criteria: Record<string, number> = {};
  const rounded = (n: number) => Math.round(n * 10) / 10;
  for (const key of new Set(visible.flatMap(r => Object.keys(r.criteria)))) {
    const values = visible.flatMap(r => r.criteria[key] === undefined ? [] : [r.criteria[key]]);
    criteria[key] = rounded(values.reduce((a, b) => a + b, 0) / values.length);
  }
  return { count: visible.length, average: visible.length ? rounded(visible.reduce((a, r) => a + r.score, 0) / visible.length) : null, criteria };
}
export function summarizeNps(scores: number[]): NpsSummary {
  const responses = scores.length;
  if (responses < 5) return { responses, value: null, promoters: null, passives: null, detractors: null };
  const promoters = scores.filter(n => n >= 9).length, detractors = scores.filter(n => n <= 6).length;
  return { responses, value: Math.round(100 * (promoters - detractors) / responses), promoters, passives: responses - promoters - detractors, detractors };
}
