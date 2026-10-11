export type ConversationKind = 'team' | 'direct' | 'booking';
export type BookingChatKind = 'opportunity' | 'automatic' | 'field';
export type TeamChatMode = 'internal' | 'whatsapp' | 'both';
export interface TeamChatConfig { mode: TeamChatMode; whatsappUrl: string | null; adminOnly: boolean }
export interface Conversation {
  id: string; kind: ConversationKind; contextId: string; bookingKind: BookingChatKind | null;
  title: string; status: 'pending' | 'accepted' | 'declined'; requesterId: string | null;
  otherId: string | null; blocked: boolean; unread: number; lastText: string | null; lastAt: string;
}
export interface ConversationMessage { id: string; senderId: string; senderName: string; text: string; createdAt: string }
export interface ConversationSnapshot {
  rooms: Conversation[]; messages: ConversationMessage[]; room: Conversation | null;
  settings: { friendsOnly: boolean }; blocks: Array<{ id: string; name: string }>;
  teamConfig: TeamChatConfig | null; canPost: boolean; canManage: boolean;
  hasOlder: boolean;
}
export const emptyConversations = (): ConversationSnapshot => ({rooms:[],messages:[],room:null,settings:{friendsOnly:false},blocks:[],teamConfig:null,canPost:false,canManage:false,hasOlder:false});
