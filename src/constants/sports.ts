import { create } from 'zustand';

export type SportId = string;

export interface SportRules {
  mode: 'total' | 'sets' | 'periods';
  periodMinutes: number;
  periods: number;
  targetPoints: number | null;
  winByTwo: boolean;
  setsToWin: number | null;
  scoreValues: number[];
}

export interface SportDefinition {
  id: SportId;
  label: string;
  icon: string;
  /** Cor de destaque do esporte — usada nos "acentos" das telas da pelada/campeonato. */
  color: string;
  scoreSingular: string;
  scorePlural: string;
  hasGoalkeeper: boolean;
  /** Sugestão de jogadores por time, pra pré-preencher o formulário de agenda/campeonato. */
  suggestedTeamSize: number;
  active?: boolean;
  revision?: number;
  rules?: SportRules;
}

export const SPORTS: SportDefinition[] = [
  { id: 'futebol', label: 'Futebol', icon: '⚽', color: '#22C55E', scoreSingular: 'gol', scorePlural: 'gols', hasGoalkeeper: true, suggestedTeamSize: 6 },
  { id: 'volei', label: 'Vôlei', icon: '🏐', color: '#EAB308', scoreSingular: 'ponto', scorePlural: 'pontos', hasGoalkeeper: false, suggestedTeamSize: 6 },
  { id: 'basquete', label: 'Basquete', icon: '🏀', color: '#F97316', scoreSingular: 'ponto', scorePlural: 'pontos', hasGoalkeeper: false, suggestedTeamSize: 5 },
  { id: 'handebol', label: 'Handebol', icon: '🤾', color: '#EF4444', scoreSingular: 'gol', scorePlural: 'gols', hasGoalkeeper: true, suggestedTeamSize: 7 },
  { id: 'futvolei', label: 'Futevôlei', icon: '🏖️', color: '#22D3EE', scoreSingular: 'ponto', scorePlural: 'pontos', hasGoalkeeper: false, suggestedTeamSize: 2 },
];

export function sportRules(sport: SportDefinition): SportRules {
  if (sport.rules) return sport.rules;
  if (sport.id === 'volei' || sport.id === 'futvolei') return { mode: 'sets', periodMinutes: 10, periods: 3, targetPoints: 21, winByTwo: true, setsToWin: 2, scoreValues: [1] };
  if (sport.id === 'basquete') return { mode: 'periods', periodMinutes: 10, periods: 4, targetPoints: null, winByTwo: false, setsToWin: null, scoreValues: [1, 2, 3] };
  return { mode: 'total', periodMinutes: 10, periods: 1, targetPoints: null, winByTwo: false, setsToWin: null, scoreValues: [1] };
}

export function validateSport(sport: SportDefinition): boolean {
  const r = sport.rules;
  return /^[a-z][a-z0-9_-]{1,39}$/.test(sport.id) && sport.label.trim().length >= 2 && sport.label.length <= 60
    && sport.icon.trim().length > 0 && sport.icon.length <= 16 && /^#[0-9a-f]{6}$/i.test(sport.color)
    && sport.scoreSingular.trim().length > 0 && sport.scoreSingular.length <= 30 && sport.scorePlural.trim().length > 0 && sport.scorePlural.length <= 30
    && typeof sport.active === 'boolean' && typeof sport.hasGoalkeeper === 'boolean'
    && Number.isInteger(sport.suggestedTeamSize) && sport.suggestedTeamSize >= 1 && sport.suggestedTeamSize <= 50
    && !!r && ['total', 'sets', 'periods'].includes(r.mode)
    && Number.isInteger(r.periodMinutes) && r.periodMinutes >= 1 && r.periodMinutes <= 240
    && Number.isInteger(r.periods) && r.periods >= 1 && r.periods <= 15
    && typeof r.winByTwo === 'boolean' && Array.isArray(r.scoreValues) && r.scoreValues.length >= 1 && r.scoreValues.length <= 5
    && new Set(r.scoreValues).size === r.scoreValues.length && r.scoreValues.includes(1) && r.scoreValues.every(v => Number.isInteger(v) && v >= 1 && v <= 10)
    && (r.mode === 'sets' ? Number.isInteger(r.targetPoints) && r.targetPoints! >= 1 && r.targetPoints! <= 200
      && Number.isInteger(r.setsToWin) && r.setsToWin! >= 1 && r.periods === 2 * r.setsToWin! - 1
      : r.targetPoints === null && r.setsToWin === null && !r.winByTwo && (r.mode !== 'total' || r.periods === 1));
}

/** Read-only client cache. Real writes always pass the platform-admin RPC. */
export const useSportCatalog = create<{ catalog: SportDefinition[] }>(() => ({
  catalog: SPORTS.map(s => ({ ...s, active: true, revision: 1, rules: sportRules(s) })),
}));
export function useSports(): SportDefinition[] {
  const catalog = useSportCatalog(s => s.catalog);
  return catalog.filter(s => s.active !== false);
}
export function setSportCatalog(catalog: SportDefinition[]) {
  if (!catalog.length || !catalog.every(validateSport)) throw new Error('Catálogo de esportes inválido.');
  useSportCatalog.setState({ catalog });
}

export function getSport(id: string | null | undefined): SportDefinition {
  return useSportCatalog.getState().catalog.find((s) => s.id === id) ?? SPORTS[0];
}

/** "gol"/"gols" no futebol e handebol, "ponto"/"pontos" nos demais — de acordo com o esporte. */
export function scoreLabel(sportId: string | null | undefined, count: number): string {
  const sport = getSport(sportId);
  return count === 1 ? sport.scoreSingular : sport.scorePlural;
}
