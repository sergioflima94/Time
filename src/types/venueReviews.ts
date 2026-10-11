export type ReviewTarget = 'field' | 'establishment';
export const REVIEW_CRITERIA = {
  field: { structure: 'Estrutura', lighting: 'Iluminação', cleanliness: 'Limpeza', maintenance: 'Conservação' },
  establishment: { service: 'Atendimento', organization: 'Organização', snack: 'Lanchonete' },
} as const;
export interface ReviewExperience {
  kind: 'game' | 'class' | 'visit'; id: string; fieldId: string; establishmentId: string; label: string; at: string;
}
export interface VenueReview {
  id: string; target: ReviewTarget; fieldId: string; fieldName: string; establishmentId: string; establishmentName: string;
  authorName: string; mine: boolean; score: number; criteria: Record<string, number>; comment: string; createdAt: string;
  reply: string | null; repliedAt: string | null; hidden: boolean; replyHidden: boolean;
  reported: boolean; replyReported: boolean; reports: Array<{ subject: 'review' | 'reply'; reason: string; details: string }>;
}
export interface ReviewSummary { count: number; average: number | null; criteria: Record<string, number> }
export interface NpsSummary { responses: number; value: number | null; promoters: number | null; passives: number | null; detractors: number | null }
export interface VisitCandidate { bookingId: string; date: string; playerId: string; playerName: string; label: string }
export interface ReviewSnapshot {
  title: string; target: ReviewTarget; establishmentId: string | null; fieldId: string | null;
  canReply: boolean; canModerate: boolean; summary: ReviewSummary; nps: NpsSummary | null;
  experiences: ReviewExperience[]; visitCandidates: VisitCandidate[]; reviews: VenueReview[]; hasMore: boolean;
  fields: Array<{ id: string; name: string }>;
}
