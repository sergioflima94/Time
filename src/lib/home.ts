import type { Game } from '@/types';

/** A partida ao vivo não some da Home quando seu horário de início passa. */
export function homeGameAgenda(games: Game[], now = Date.now()) {
  const byDate = (a: Game, b: Game) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt);
  const live = games.filter(game => game.status === 'in_progress').sort(byDate);
  const upcoming = games.filter(game => !['in_progress', 'finished', 'cancelled'].includes(game.status)
    && Date.parse(game.scheduledAt) >= now).sort(byDate);
  const featured = live[0] ?? upcoming[0];
  return {
    featured,
    remaining: [...live, ...upcoming].filter(game => game.id !== featured?.id),
    past: games.filter(game => game.status === 'finished').sort((a, b) => byDate(b, a)),
  };
}

export function homeGameDistance(date: string, now = new Date()) {
  const target = new Date(date);
  const days = Math.round((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
    - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  return `Em ${days} dias`;
}
