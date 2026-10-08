import type { BanterBadgeType, BanterVote } from '@/types';

export interface BanterBadgeDefinition {
  id: BanterBadgeType;
  icon: string;
  label: string;
  description: string;
  color: string;
}

export interface BanterBadgeSummary extends BanterBadgeDefinition {
  count: number;
}

export const BANTER_BADGES: BanterBadgeDefinition[] = [
  { id: 'drama_king', icon: '😭', label: 'Rei do Drama', description: 'Fez cada lance virar uma novela.', color: '#60A5FA' },
  { id: 'human_var', icon: '📢', label: 'VAR Humano', description: 'Contestou até o lateral no meio-campo.', color: '#FACC15' },
  { id: 'hot_blooded', icon: '🔥', label: 'Sangue Quente', description: 'Jogou com a temperatura lá em cima.', color: '#FB7185' },
];

export function activeBanterSummary(playerId: string, votes: BanterVote[], at = new Date()): BanterBadgeSummary[] {
  const counts = new Map<BanterBadgeType, number>();
  for (const vote of votes) {
    if (vote.targetPlayerId !== playerId || new Date(vote.expiresAt).getTime() <= at.getTime()) continue;
    counts.set(vote.badge, (counts.get(vote.badge) ?? 0) + 1);
  }
  return BANTER_BADGES.map((badge) => ({ ...badge, count: counts.get(badge.id) ?? 0 }))
    .filter((badge) => badge.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function banterExpiresAt(createdAt = new Date()): string {
  return new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
}
