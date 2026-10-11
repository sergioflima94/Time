/** One physical field, many compatible sports; never use a sport as a booking key. */
export interface SportSpace { sportId: string; sportIds?: string[] }

export function fieldSportIds(space: SportSpace): string[] {
  return [...new Set(space.sportIds?.length ? space.sportIds : [space.sportId])];
}

export function fieldSupportsSport(space: SportSpace, sportId: string | null | undefined): boolean {
  return !!sportId && fieldSportIds(space).includes(sportId);
}

export function toggleFieldSport(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter(s => s !== id) : [...ids, id];
}

export function validateFieldSports(ids: string[], catalog: Array<{ id: string; active?: boolean }>): void {
  if (!ids.length || ids.length > 40 || new Set(ids).size !== ids.length
    || ids.some(id => !catalog.some(s => s.id === id && s.active !== false))) {
    throw new Error('Selecione de 1 a 40 esportes ativos, sem repetições.');
  }
}
