export type SportId = 'futebol' | 'volei' | 'basquete' | 'handebol' | 'futvolei';

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
}

export const SPORTS: SportDefinition[] = [
  { id: 'futebol', label: 'Futebol', icon: '⚽', color: '#22C55E', scoreSingular: 'gol', scorePlural: 'gols', hasGoalkeeper: true, suggestedTeamSize: 6 },
  { id: 'volei', label: 'Vôlei', icon: '🏐', color: '#EAB308', scoreSingular: 'ponto', scorePlural: 'pontos', hasGoalkeeper: false, suggestedTeamSize: 6 },
  { id: 'basquete', label: 'Basquete', icon: '🏀', color: '#F97316', scoreSingular: 'ponto', scorePlural: 'pontos', hasGoalkeeper: false, suggestedTeamSize: 5 },
  { id: 'handebol', label: 'Handebol', icon: '🤾', color: '#EF4444', scoreSingular: 'gol', scorePlural: 'gols', hasGoalkeeper: true, suggestedTeamSize: 7 },
  { id: 'futvolei', label: 'Futevôlei', icon: '🏖️', color: '#22D3EE', scoreSingular: 'ponto', scorePlural: 'pontos', hasGoalkeeper: false, suggestedTeamSize: 2 },
];

export function getSport(id: string | null | undefined): SportDefinition {
  return SPORTS.find((s) => s.id === id) ?? SPORTS[0];
}

/** "gol"/"gols" no futebol e handebol, "ponto"/"pontos" nos demais — de acordo com o esporte. */
export function scoreLabel(sportId: string | null | undefined, count: number): string {
  const sport = getSport(sportId);
  return count === 1 ? sport.scoreSingular : sport.scorePlural;
}
