export type ScoreUnit = 'goals' | 'points' | 'sets' | 'quarters';

export interface ScoreSegment {
  id: string;
  label: string;
  home: number;
  away: number;
  finished: boolean;
}

export interface MultiSportScoreboard {
  id: string;
  sportId: string;
  title: string;
  homeName: string;
  awayName: string;
  unit: ScoreUnit;
  segments: ScoreSegment[];
  targetPoints: number | null;
  winByTwo: boolean;
  segmentsToWin: number | null;
  maxSegments: number | null;
  status: 'scheduled' | 'live' | 'finished';
}

export type ChatContextType = 'team' | 'game' | 'championship' | 'captains' | 'service';
export interface ChatChannel {
  id: string;
  contextType: ChatContextType;
  contextId: string;
  title: string;
  participantIds: string[];
  adminOnlyPosting: boolean;
  unreadCount: number;
}
export interface ChatMessage {
  id: string;
  channelId: string;
  senderPlayerId: string;
  text: string;
  createdAt: string;
  system: boolean;
}

export type WalletEntryKind = 'credit' | 'debit' | 'cashback' | 'refund' | 'bonus';
export interface WalletEntry {
  id: string;
  playerId: string;
  establishmentId: string | null;
  kind: WalletEntryKind;
  amount: number;
  description: string;
  createdAt: string;
}

export interface LoyaltyPlan {
  id: string;
  establishmentId: string;
  name: string;
  price: number;
  credits: number;
  bonusCredits: number;
  benefits: string[];
  active: boolean;
}
export interface LoyaltySubscription {
  id: string;
  planId: string;
  playerId: string;
  remainingCredits: number;
  validUntil: string;
}

export type StaffRole = 'referee' | 'scorekeeper' | 'coach' | 'freelancer';
export interface SportsStaff {
  id: string;
  name: string;
  role: StaffRole;
  sports: string[];
  pricePerEvent: number;
  rating: number;
  available: boolean;
}
export interface StaffAssignment {
  id: string;
  staffId: string;
  establishmentId: string;
  eventLabel: string;
  startsAt: string;
  amount: number;
  status: 'invited' | 'accepted' | 'paid';
}

export interface OpenSlotOffer {
  id: string;
  establishmentId: string;
  fieldId: string;
  fieldName: string;
  sportId: string;
  startsAt: string;
  durationMinutes: number;
  originalPrice: number;
  offerPrice: number;
  sponsored: boolean;
  status: 'available' | 'reserved';
}

export interface DigitalWaiver {
  id: string;
  title: string;
  scope: 'team' | 'championship' | 'class';
  scopeId: string;
  required: boolean;
  acceptedPlayerIds: string[];
  updatedAt: string;
}

export interface SportHighlight {
  id: string;
  playerId: string;
  gameId: string | null;
  title: string;
  description: string;
  kind: 'record' | 'mvp' | 'streak' | 'moment';
  createdAt: string;
}

export interface CommerceListing {
  id: string;
  establishmentId: string;
  name: string;
  kind: 'sale' | 'rental';
  price: number;
  stock: number;
  category: 'ball' | 'uniform' | 'vest' | 'boots' | 'equipment';
  active: boolean;
}

export interface RentalOrder {
  id: string;
  listingId: string;
  playerId: string;
  quantity: number;
  total: number;
  pickupAt: string;
  status: 'reserved' | 'picked_up' | 'returned';
}
