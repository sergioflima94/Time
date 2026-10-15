export type LanceKind = 'goal' | 'point' | 'save' | 'play';
export interface Lance {
  id: string; gameId: string; teamId: string; teamName: string; sportId: string;
  authorId: string; authorName: string; title: string; caption: string; kind: LanceKind;
  scorerId: string | null; scorerName: string | null; assistId: string | null; assistName: string | null;
  scorerConfirmed: boolean; assistConfirmed: boolean; mediaKey: string | null; durationSeconds: number;
  status: 'uploading' | 'ready'; visibility: 'team' | 'public'; publishedAt: string | null;
  source: 'upload' | 'camera'; createdAt: string; revision: number; canManage: boolean;
  hidden: boolean; canModerate: boolean; likes: number; liked: boolean; commentCount: number;
}
export interface LanceSnapshot {
  items: Lance[]; participants: Array<{ id: string; name: string }>;
  comments: Array<{ id: string; playerId: string; name: string; body: string; createdAt: string }>;
  me: string | null;
}
export interface LanceQuery { gameId?: string; teamId?: string; id?: string; before?: string; beforeId?: string }
