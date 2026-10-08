import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { segmentCanFinish, walletBalance } from '@/lib/growth';
import { createUuid } from '@/lib/uuid';
import { useAppStore } from '@/store/useAppStore';
import type {
  ChatChannel,
  ChatMessage,
  CommerceListing,
  DigitalWaiver,
  LoyaltyPlan,
  LoyaltySubscription,
  MultiSportScoreboard,
  OpenSlotOffer,
  RentalOrder,
  SportsStaff,
  SportHighlight,
  StaffAssignment,
  WalletEntry,
} from '@/types/growth';

const uid = createUuid;
const nowIso = () => new Date().toISOString();
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

interface GrowthState {
  scoreboards: MultiSportScoreboard[];
  chatChannels: ChatChannel[];
  chatMessages: ChatMessage[];
  walletEntries: WalletEntry[];
  loyaltyPlans: LoyaltyPlan[];
  loyaltySubscriptions: LoyaltySubscription[];
  sportsStaff: SportsStaff[];
  staffAssignments: StaffAssignment[];
  openSlotOffers: OpenSlotOffer[];
  waivers: DigitalWaiver[];
  highlights: SportHighlight[];
  commerceListings: CommerceListing[];
  rentalOrders: RentalOrder[];
  notificationOptIn: boolean;
  pushToken: string | null;
  addScore: (scoreboardId: string, side: 'home' | 'away', amount?: number) => void;
  finishSegment: (scoreboardId: string) => boolean;
  sendMessage: (channelId: string, senderPlayerId: string, text: string) => void;
  addWalletCredit: (playerId: string, amount: number, description: string, kind?: WalletEntry['kind']) => void;
  buyLoyaltyPlan: (planId: string, playerId: string) => boolean;
  assignStaff: (staffId: string, eventLabel: string) => void;
  reserveOffer: (offerId: string, playerId: string) => boolean;
  acceptWaiver: (waiverId: string, playerId: string) => void;
  addHighlight: (playerId: string, title: string, description: string) => void;
  reserveListing: (listingId: string, playerId: string) => boolean;
  setPushRegistration: (enabled: boolean, token: string | null) => void;
}

export const useGrowthStore = create<GrowthState>()(
  persist(
    (set) => ({
      scoreboards: [
        {
          id: 'score-volei', sportId: 'volei', title: 'Vôlei da Empresa', homeName: 'Time Azul', awayName: 'Time Laranja',
          unit: 'sets', segments: [{ id: 'set-1', label: '1º set', home: 21, away: 18, finished: false }],
          targetPoints: 21, winByTwo: true, segmentsToWin: 2, maxSegments: 3, status: 'live',
        },
        {
          id: 'score-basquete', sportId: 'basquete', title: 'Basquete de Quarta', homeName: 'Lobos', awayName: 'Falcões',
          unit: 'quarters', segments: [{ id: 'q1', label: '1º quarto', home: 18, away: 16, finished: true }, { id: 'q2', label: '2º quarto', home: 7, away: 9, finished: false }],
          targetPoints: null, winByTwo: false, segmentsToWin: null, maxSegments: 4, status: 'live',
        },
      ],
      chatChannels: [
        { id: 'chat-team', contextType: 'team', contextId: 'pel1', title: 'Pelada dos Amigos', participantIds: ['p1', 'p2', 'p3'], adminOnlyPosting: false, unreadCount: 2 },
        { id: 'chat-captains', contextType: 'captains', contextId: 'champ1', title: 'Capitães · Copa Arena', participantIds: ['p1', 'p2'], adminOnlyPosting: false, unreadCount: 1 },
        { id: 'chat-service', contextType: 'service', contextId: 'est2', title: 'Atendimento Arena do Sérgio', participantIds: ['p1', 'p5'], adminOnlyPosting: false, unreadCount: 0 },
      ],
      chatMessages: [
        { id: 'msg1', channelId: 'chat-team', senderPlayerId: 'p2', text: 'Quem leva a bola amanhã?', createdAt: nowIso(), system: false },
        { id: 'msg2', channelId: 'chat-captains', senderPlayerId: 'p1', text: 'Jogo confirmado às 20h na quadra 1.', createdAt: nowIso(), system: false },
      ],
      walletEntries: [
        { id: 'wallet1', playerId: 'p1', establishmentId: 'est2', kind: 'credit', amount: 600, description: 'Recarga de créditos', createdAt: nowIso() },
        { id: 'wallet2', playerId: 'p1', establishmentId: 'est2', kind: 'cashback', amount: 8, description: 'Cashback da reserva', createdAt: nowIso() },
        { id: 'wallet3', playerId: 'p1', establishmentId: 'est2', kind: 'debit', amount: 24, description: 'Rateio da quadra', createdAt: nowIso() },
      ],
      loyaltyPlans: [
        { id: 'plan1', establishmentId: 'est2', name: 'Mensalista Ouro', price: 180, credits: 4, bonusCredits: 1, benefits: ['5 reservas pelo preço de 4', '10% na lanchonete', 'Prioridade no horário fixo'], active: true },
        { id: 'plan2', establishmentId: 'est2', name: 'Passe Aula', price: 120, credits: 4, bonusCredits: 0, benefits: ['4 aulas coletivas', 'Reposição em até 7 dias'], active: true },
      ],
      loyaltySubscriptions: [],
      sportsStaff: [
        { id: 'staff1', name: 'Rafael Mendes', role: 'referee', sports: ['futebol', 'futsal'], pricePerEvent: 120, rating: 4.9, available: true },
        { id: 'staff2', name: 'Juliana Alves', role: 'scorekeeper', sports: ['volei', 'basquete'], pricePerEvent: 90, rating: 4.8, available: true },
        { id: 'staff3', name: 'Caio Lima', role: 'coach', sports: ['futebol'], pricePerEvent: 150, rating: 4.7, available: false },
      ],
      staffAssignments: [],
      openSlotOffers: [
        { id: 'offer1', establishmentId: 'est2', fieldId: 'f2', fieldName: 'Quadra Society 1', sportId: 'futebol', startsAt: inDays(1), durationMinutes: 90, originalPrice: 260, offerPrice: 210, sponsored: true, status: 'available' },
        { id: 'offer2', establishmentId: 'est1', fieldId: 'f3', fieldName: 'Quadra de Vôlei', sportId: 'volei', startsAt: inDays(2), durationMinutes: 60, originalPrice: 160, offerPrice: 130, sponsored: false, status: 'available' },
      ],
      waivers: [
        { id: 'waiver1', title: 'Termo de participação e uso de imagem', scope: 'team', scopeId: 'pel1', required: true, acceptedPlayerIds: ['p2', 'p3'], updatedAt: nowIso() },
        { id: 'waiver2', title: 'Regulamento da Copa Arena', scope: 'championship', scopeId: 'champ1', required: true, acceptedPlayerIds: [], updatedAt: nowIso() },
      ],
      highlights: [
        { id: 'highlight1', playerId: 'p1', gameId: 'g0', title: 'Sequência positiva', description: '3 jogos sem perder pela Pelada dos Amigos.', kind: 'streak', createdAt: nowIso() },
        { id: 'highlight2', playerId: 'p2', gameId: 'g0', title: 'Craque da rodada', description: 'Maior nota técnica da última partida.', kind: 'mvp', createdAt: nowIso() },
      ],
      commerceListings: [
        { id: 'listing1', establishmentId: 'est2', name: 'Bola society oficial', kind: 'sale', price: 149.9, stock: 8, category: 'ball', active: true },
        { id: 'listing2', establishmentId: 'est2', name: 'Kit 12 coletes', kind: 'rental', price: 30, stock: 4, category: 'vest', active: true },
        { id: 'listing3', establishmentId: 'est2', name: 'Chuteira society', kind: 'sale', price: 229.9, stock: 6, category: 'boots', active: true },
        { id: 'listing4', establishmentId: 'est2', name: 'Bola de vôlei', kind: 'rental', price: 18, stock: 5, category: 'ball', active: true },
      ],
      rentalOrders: [],
      notificationOptIn: false,
      pushToken: null,

      addScore: (scoreboardId, side, amount = 1) => set((state) => ({
        scoreboards: state.scoreboards.map((board) => {
          if (board.id !== scoreboardId || board.status !== 'live') return board;
          const last = board.segments.at(-1)!;
          return { ...board, segments: board.segments.map((segment) => segment.id === last.id ? { ...segment, [side]: segment[side] + amount } : segment) };
        }),
      })),
      finishSegment: (scoreboardId) => {
        let finished = false;
        set((state) => ({
          scoreboards: state.scoreboards.map((board) => {
            if (board.id !== scoreboardId || board.status !== 'live') return board;
            const current = board.segments.at(-1)!;
            if (!segmentCanFinish(current, board.targetPoints, board.winByTwo)) return board;
            finished = true;
            const finishedSegments = [...board.segments.slice(0, -1), { ...current, finished: true }];
            const setWins = finishedSegments.reduce((score, segment) => {
              if (segment.home > segment.away) score.home += 1;
              if (segment.away > segment.home) score.away += 1;
              return score;
            }, { home: 0, away: 0 });
            const matchFinished = Boolean(
              (board.segmentsToWin && Math.max(setWins.home, setWins.away) >= board.segmentsToWin)
              || (board.maxSegments && finishedSegments.length >= board.maxSegments),
            );
            if (matchFinished) return { ...board, segments: finishedSegments, status: 'finished' };
            const nextNumber = finishedSegments.length + 1;
            return {
              ...board,
              segments: [
                ...finishedSegments,
                { id: uid(), label: board.unit === 'sets' ? `${nextNumber}º set` : `${nextNumber}º período`, home: 0, away: 0, finished: false },
              ],
            };
          }),
        }));
        return finished;
      },
      sendMessage: (channelId, senderPlayerId, text) => {
        const clean = text.trim();
        if (!clean) return;
        set((state) => ({ chatMessages: [...state.chatMessages, { id: uid(), channelId, senderPlayerId, text: clean, createdAt: nowIso(), system: false }] }));
      },
      addWalletCredit: (playerId, amount, description, kind = 'credit') => {
        if (amount <= 0) return;
        const app = useAppStore.getState();
        const establishmentId = app.establishments.find((row) => row.ownerPlayerId === app.currentPlayerId)?.id ?? null;
        set((state) => ({ walletEntries: [...state.walletEntries, { id: uid(), playerId, establishmentId, kind, amount, description, createdAt: nowIso() }] }));
      },
      buyLoyaltyPlan: (planId, playerId) => {
        let completed = false;
        set((state) => {
          const plan = state.loyaltyPlans.find((row) => row.id === planId);
          if (!plan || walletBalance(playerId, state.walletEntries) < plan.price) return {};
          completed = true;
          return {
            loyaltySubscriptions: [...state.loyaltySubscriptions.filter((row) => !(row.planId === planId && row.playerId === playerId)), { id: uid(), planId, playerId, remainingCredits: plan.credits + plan.bonusCredits, validUntil: inDays(30) }],
            walletEntries: [...state.walletEntries, { id: uid(), playerId, establishmentId: plan.establishmentId, kind: 'debit', amount: plan.price, description: `Plano ${plan.name}`, createdAt: nowIso() }],
          };
        });
        return completed;
      },
      assignStaff: (staffId, eventLabel) => set((state) => {
        const staff = state.sportsStaff.find((row) => row.id === staffId);
        const app = useAppStore.getState();
        const establishment = app.establishments.find((row) => row.ownerPlayerId === app.currentPlayerId);
        if (!staff?.available || !establishment) return {};
        return { staffAssignments: [...state.staffAssignments, { id: uid(), staffId, establishmentId: establishment.id, eventLabel, startsAt: inDays(3), amount: staff.pricePerEvent, status: 'invited' }] };
      }),
      reserveOffer: (offerId, playerId) => {
        let completed = false;
        set((state) => {
          const offer = state.openSlotOffers.find((row) => row.id === offerId);
          if (!offer || offer.status !== 'available' || walletBalance(playerId, state.walletEntries) < offer.offerPrice) return {};
          completed = true;
          return {
            openSlotOffers: state.openSlotOffers.map((row) => row.id === offerId ? { ...row, status: 'reserved' } : row),
            walletEntries: [...state.walletEntries, { id: uid(), playerId, establishmentId: offer.establishmentId, kind: 'debit', amount: offer.offerPrice, description: `Reserva ${offer.fieldName}`, createdAt: nowIso() }],
          };
        });
        return completed;
      },
      acceptWaiver: (waiverId, playerId) => set((state) => ({
        waivers: state.waivers.map((waiver) => waiver.id === waiverId && !waiver.acceptedPlayerIds.includes(playerId) ? { ...waiver, acceptedPlayerIds: [...waiver.acceptedPlayerIds, playerId] } : waiver),
      })),
      addHighlight: (playerId, title, description) => set((state) => ({
        highlights: [...state.highlights, { id: uid(), playerId, gameId: null, title, description, kind: 'moment', createdAt: nowIso() }],
      })),
      reserveListing: (listingId, playerId) => {
        let completed = false;
        set((state) => {
          const listing = state.commerceListings.find((row) => row.id === listingId);
          if (!listing || listing.stock <= 0 || walletBalance(playerId, state.walletEntries) < listing.price) return {};
          completed = true;
          return {
            commerceListings: state.commerceListings.map((row) => row.id === listingId ? { ...row, stock: row.stock - 1 } : row),
            rentalOrders: listing.kind === 'rental' ? [...state.rentalOrders, { id: uid(), listingId, playerId, quantity: 1, total: listing.price, pickupAt: inDays(1), status: 'reserved' }] : state.rentalOrders,
            walletEntries: [...state.walletEntries, { id: uid(), playerId, establishmentId: listing.establishmentId, kind: 'debit', amount: listing.price, description: `${listing.kind === 'rental' ? 'Aluguel' : 'Compra'}: ${listing.name}`, createdAt: nowIso() }],
          };
        });
        return completed;
      },
      setPushRegistration: (notificationOptIn, pushToken) => set({ notificationOptIn, pushToken }),
    }),
    { name: 'pelada-growth-storage', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
