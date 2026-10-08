import type {
  Attendance,
  CashShift,
  ClassAttendance,
  ClassEnrollment,
  ClassProgram,
  ClassSession,
  Coach,
  Championship,
  ChampionshipBudget,
  ChampionshipGoal,
  ChampionshipMatch,
  ChampionshipTeam,
  ChampionshipTeamPlayer,
  Establishment,
  EstablishmentStaff,
  Field,
  FieldAvailability,
  FieldBooking,
  FieldPromotion,
  BookingDeposit,
  Friendship,
  FundraisingCampaign,
  FundraisingContribution,
  FundraisingExpense,
  Game,
  GameBookingRequest,
  Goal,
  MatchTurn,
  Payment,
  PaymentGatewayConnection,
  Pelada,
  PeladaMembership,
  Player,
  Product,
  ProductCategory,
  PlayerDuel,
  Punishment,
  Rating,
  Schedule,
  ScheduleFieldPreference,
  SalePayment,
  SalePaymentAllocation,
  SalePaymentIntent,
  ServiceOrder,
  ServiceOrderItem,
  OrderItemShare,
  ServiceTab,
  TabParticipant,
  Team,
  TeamAvailabilityPoll,
  TeamAvailabilityPollOption,
  TeamAvailabilityPollVote,
  TeamPlayer,
  WhatsAppDelivery,
} from '@/types';

const now = new Date();
const iso = (d: Date) => d.toISOString();
const nextWeekday = (dayOfWeek: number, hour: number, minute: number) => {
  const d = new Date(now);
  const diff = (dayOfWeek - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  d.setHours(hour, minute, 0, 0);
  return d;
};

/** Fotos de exemplo (serviço público de avatares aleatórios) só para o modo demonstração. */
const demoPhoto = (seed: number) => `https://i.pravatar.cc/300?img=${seed}`;

const demoPremiumActiveUntil = iso(new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000));
// assinatura vencida de propósito, pra já mostrar no demo o estado "perdeu o benefício, precisa renovar"
const demoPremiumExpired = iso(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000));

/** Localização de exemplo de "Você" (região do Ibirapuera, SP), só pra demo da busca de jogadores livres. */
const MY_LOCATION = { latitude: -23.588, longitude: -46.6577 };
/** Próxima quinta-feira às 19h-23h — cobre o horário do jogo semanal da pel1 (quinta 20h). */
const THURSDAY_NIGHT = [{ weekday: 4, startTime: '19:00', endTime: '23:00' }];

export const MOCK_PLAYERS: Player[] = [
  { id: 'p1', authUserId: 'auth-1', name: 'Você', nickname: null, avatarUrl: null, cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: '11988880001', whatsappOptIn: true, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: MY_LOCATION, locationUpdatedAt: iso(now), createdAt: iso(now) },
  { id: 'p2', authUserId: null, name: 'Bruno Silva', nickname: 'Brunão', avatarUrl: demoPhoto(12), cardBackgroundUrl: null, premiumSince: iso(now), premiumUntil: demoPremiumActiveUntil, premiumAutoRenew: true, isGuest: false, phone: '11988880002', whatsappOptIn: true, preferredPosition: 'line', favoriteSports: ['futebol', 'volei'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  { id: 'p3', authUserId: null, name: 'Carlos Eduardo', nickname: 'Cadu', avatarUrl: demoPhoto(13), cardBackgroundUrl: null, premiumSince: iso(now), premiumUntil: demoPremiumExpired, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'goalkeeper', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  { id: 'p4', authUserId: null, name: 'Diego Alves', nickname: null, avatarUrl: demoPhoto(14), cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  { id: 'p5', authUserId: null, name: 'Eduardo Santos', nickname: 'Duda', avatarUrl: demoPhoto(15), cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  { id: 'p6', authUserId: null, name: 'Fábio Costa', nickname: null, avatarUrl: demoPhoto(17), cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  { id: 'p7', authUserId: null, name: 'Gabriel Souza', nickname: 'Gabigol', avatarUrl: demoPhoto(18), cardBackgroundUrl: null, premiumSince: iso(now), premiumUntil: demoPremiumActiveUntil, premiumAutoRenew: true, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  { id: 'p8', authUserId: null, name: 'Henrique Lima', nickname: null, avatarUrl: demoPhoto(19), cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'goalkeeper', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  { id: 'p9', authUserId: null, name: 'Igor Martins', nickname: null, avatarUrl: demoPhoto(20), cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  { id: 'p10', authUserId: null, name: 'João Pedro', nickname: 'JP', avatarUrl: demoPhoto(21), cardBackgroundUrl: 'https://picsum.photos/seed/pelada-jp/400/540', premiumSince: iso(now), premiumUntil: demoPremiumActiveUntil, premiumAutoRenew: true, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  { id: 'p11', authUserId: null, name: 'Lucas Ferreira', nickname: null, avatarUrl: demoPhoto(22), cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  { id: 'p12', authUserId: null, name: 'Marcelo Rocha', nickname: null, avatarUrl: demoPhoto(23), cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  { id: 'p13', authUserId: null, name: 'Nathan Oliveira', nickname: null, avatarUrl: demoPhoto(24), cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  { id: 'p14', authUserId: null, name: 'Otávio Ramos', nickname: null, avatarUrl: demoPhoto(25), cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  { id: 'p15', authUserId: null, name: 'Paulo Vitor', nickname: 'PV', avatarUrl: demoPhoto(26), cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  { id: 'p16', authUserId: null, name: 'Rafael Almeida', nickname: null, avatarUrl: demoPhoto(27), cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
  // Jogadores livres (opt-in), de fora de qualquer pelada — pra demonstrar a busca por proximidade.
  { id: 'p17', authUserId: null, name: 'Rodrigo Mendes', nickname: null, avatarUrl: demoPhoto(31), cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'goalkeeper', favoriteSports: ['futebol'], freeAgentOptIn: true, freeAgentRadiusKm: 15, freeAgentAvailability: THURSDAY_NIGHT, location: { latitude: -23.5955, longitude: -46.6485 }, locationUpdatedAt: iso(now), createdAt: iso(now) },
  { id: 'p18', authUserId: null, name: 'Thiago Batista', nickname: null, avatarUrl: demoPhoto(32), cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: true, freeAgentRadiusKm: 10, freeAgentAvailability: THURSDAY_NIGHT, location: { latitude: -23.573, longitude: -46.625 }, locationUpdatedAt: iso(now), createdAt: iso(now) },
  { id: 'p19', authUserId: null, name: 'Vinícius Prado', nickname: null, avatarUrl: demoPhoto(33), cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: true, freeAgentRadiusKm: 5, freeAgentAvailability: THURSDAY_NIGHT, location: { latitude: -23.15, longitude: -46.05 }, locationUpdatedAt: iso(now), createdAt: iso(now) },
];

export const CURRENT_PLAYER_ID = 'p1';

export const MOCK_PELADA: Pelada = {
  id: 'pel1',
  name: 'Pelada dos Amigos - Quintas',
  description: 'Society toda quinta às 20h',
  sportId: 'futebol',
  footballVariant: 'society',
  defaultMaxPlayers: 16,
  defaultMatchMinutes: 10,
  inviteCode: 'AMIGOS-QUI',
  memberInvitePermissions: { canInviteFreeAgents: false, canInviteNewMembers: false },
  createdBy: 'p1',
  createdAt: iso(now),
};

/** Segunda pelada de exemplo, pra mostrar que um jogador pode fazer parte de mais de um grupo. */
export const MOCK_PELADA_2: Pelada = {
  id: 'pel2',
  name: 'Vôlei da Empresa - Sábados',
  description: 'Vôlei na quadra do bairro, sábado de manhã',
  sportId: 'volei',
  footballVariant: 'society',
  defaultMaxPlayers: 12,
  defaultMatchMinutes: 8,
  inviteCode: 'EMPRESA-SAB',
  // aqui qualquer membro (não só admin) já pode convidar jogador livre e gente nova — pra
  // testar o fluxo de permissão liberada sem precisar mexer no toggle primeiro.
  memberInvitePermissions: { canInviteFreeAgents: true, canInviteNewMembers: true },
  createdBy: 'p2',
  createdAt: iso(now),
};

export const MOCK_PELADAS: Pelada[] = [MOCK_PELADA, MOCK_PELADA_2];

export const MOCK_MEMBERSHIPS: PeladaMembership[] = [
  { peladaId: 'pel1', playerId: 'p1', role: 'admin', active: true, joinedAt: iso(now) },
  { peladaId: 'pel1', playerId: 'p2', role: 'admin', active: true, joinedAt: iso(now) },
  ...MOCK_PLAYERS.slice(2, 16).map((p) => ({ peladaId: 'pel1', playerId: p.id, role: 'member' as const, active: true, joinedAt: iso(now) })),
  // "Você" ainda não faz parte dessa aqui — dá pra testar o fluxo de convite/entrar com o código EMPRESA-SAB
  { peladaId: 'pel2', playerId: 'p2', role: 'admin', active: true, joinedAt: iso(now) },
  { peladaId: 'pel2', playerId: 'p5', role: 'member', active: true, joinedAt: iso(now) },
  { peladaId: 'pel2', playerId: 'p9', role: 'member', active: true, joinedAt: iso(now) },
];

export const MOCK_ESTABLISHMENTS: Establishment[] = [
  {
    id: 'est1',
    ownerPlayerId: 'p2',
    name: 'Arena Society Central',
    payoutMethod: 'pix',
    pixKey: 'arena.central@pix.com.br',
    whatsappPhone: '5511988880002',
    whatsappOptIn: true,
    messagingProvider: 'automatic',
    reservationDepositPercent: 20,
    cancellationRefundHours: 12,
    cancellationRefundPercent: 100,
    accessCode: 'ARENA-CENTRAL',
    createdAt: iso(now),
  },
  // Estabelecimento próprio de "Você" (p1) — dono de campos de vários esportes diferentes,
  // pra testar o fluxo de dono de campo já pronto, sem precisar cadastrar nada na mão.
  {
    id: 'est2',
    ownerPlayerId: 'p1',
    name: 'Complexo Esportivo Vila Nova',
    payoutMethod: 'pix',
    pixKey: 'vilanova.esportes@pix.com.br',
    whatsappPhone: '5511988880001',
    whatsappOptIn: true,
    messagingProvider: 'automatic',
    reservationDepositPercent: 25,
    cancellationRefundHours: 24,
    cancellationRefundPercent: 100,
    accessCode: 'VILA-NOVA',
    createdAt: iso(now),
  },
];

export const MOCK_FIELDS: Field[] = [
  { id: 'f1', peladaId: 'pel1', name: 'Arena Society Central', address: 'Rua das Palmeiras, 123', notes: 'Grama sintética, tem estacionamento', establishmentId: 'est1', sportId: 'futebol', location: { latitude: -23.5889, longitude: -46.651 }, averageRating: 4.8, cancellationRate: 0.02, createdBy: 'p1' },
  // Campos próprios do Complexo Esportivo Vila Nova (est2, dono = p1) — um por esporte,
  // sem depender de nenhuma pelada.
  { id: 'f2', peladaId: null, name: 'Quadra 1 - Society', address: 'Av. Vila Nova, 500', notes: null, establishmentId: 'est2', sportId: 'futebol', location: { latitude: -23.596, longitude: -46.645 }, averageRating: 4.6, cancellationRate: 0.01, createdBy: 'p1' },
  { id: 'f3', peladaId: null, name: 'Quadra 2 - Vôlei', address: 'Av. Vila Nova, 500', notes: null, establishmentId: 'est2', sportId: 'volei', createdBy: 'p1' },
  { id: 'f4', peladaId: null, name: 'Quadra 3 - Basquete', address: 'Av. Vila Nova, 500', notes: null, establishmentId: 'est2', sportId: 'basquete', createdBy: 'p1' },
  { id: 'f5', peladaId: null, name: 'Arena de Areia - Futevôlei', address: 'Av. Vila Nova, 500', notes: null, establishmentId: 'est2', sportId: 'futvolei', createdBy: 'p1' },
  { id: 'f6', peladaId: null, name: 'Quadra 4 - Futsal', address: 'Av. Vila Nova, 500', notes: 'Vestiário e estacionamento inclusos', establishmentId: 'est2', sportId: 'futebol', location: { latitude: -23.596, longitude: -46.645 }, averageRating: 4.7, cancellationRate: 0.01, createdBy: 'p1' },
];

export const MOCK_FIELD_AVAILABILITIES: FieldAvailability[] = [
  { id: 'fa1', fieldId: 'f1', dayOfWeek: 4, startTime: '19:00', endTime: '23:00', slotMinutes: 60, price: 240, active: true },
  { id: 'fa2', fieldId: 'f1', dayOfWeek: 5, startTime: '18:00', endTime: '22:00', slotMinutes: 60, price: 240, active: true },
  { id: 'fa3', fieldId: 'f2', dayOfWeek: 4, startTime: '18:00', endTime: '23:00', slotMinutes: 60, price: 220, active: true },
  { id: 'fa4', fieldId: 'f6', dayOfWeek: 3, startTime: '19:00', endTime: '23:00', slotMinutes: 60, price: 180, active: true },
  { id: 'fa5', fieldId: 'f6', dayOfWeek: 4, startTime: '20:00', endTime: '23:00', slotMinutes: 60, price: 200, active: true },
  { id: 'fa6', fieldId: 'f3', dayOfWeek: 6, startTime: '08:00', endTime: '16:00', slotMinutes: 90, price: 160, active: true },
];

export const MOCK_FIELD_PROMOTIONS: FieldPromotion[] = [
  { id: 'fp1', fieldId: 'f6', sportId: 'futebol', label: 'Patrocinado · primeira reserva com 10% de desconto', pricePerConfirmedBooking: 8, active: true, startsAt: iso(now), endsAt: null, campaignBudget: 240 },
];

export const MOCK_BOOKING_DEPOSITS: BookingDeposit[] = [];

// Horário fixo de exemplo: toda semana, sábado 08h, o time da "Vôlei da Empresa" já
// está reservado na Quadra 2 do Complexo Esportivo Vila Nova.
export const MOCK_FIELD_BOOKINGS: FieldBooking[] = [
  {
    id: 'fb1',
    fieldId: 'f3',
    establishmentId: 'est2',
    peladaId: 'pel2',
    teamName: 'Vôlei da Empresa - Sábados',
    recurrence: 'weekly',
    dayOfWeek: 6,
    date: null,
    time: '08:00',
    durationMinutes: 90,
    notes: 'Mensalista — já pago o mês todo',
    createdBy: 'p1',
    createdAt: iso(now),
  },
];

export const MOCK_ESTABLISHMENT_STAFF: EstablishmentStaff[] = [
  { id: 'staff1', establishmentId: 'est2', playerId: 'p1', roles: ['manager'], active: true, createdAt: iso(now) },
  { id: 'staff2', establishmentId: 'est2', playerId: 'p2', roles: ['cashier', 'coach'], active: true, createdAt: iso(now) },
  { id: 'staff3', establishmentId: 'est2', playerId: 'p3', roles: ['kitchen'], active: true, createdAt: iso(now) },
];

export const MOCK_PRODUCT_CATEGORIES: ProductCategory[] = [
  { id: 'pc1', establishmentId: 'est2', name: 'Bebidas', sortOrder: 1, active: true },
  { id: 'pc2', establishmentId: 'est2', name: 'Espetinhos', sortOrder: 2, active: true },
  { id: 'pc3', establishmentId: 'est2', name: 'Jantinhas', sortOrder: 3, active: true },
];

export const MOCK_PRODUCTS: Product[] = [
  { id: 'prod1', establishmentId: 'est2', categoryId: 'pc1', name: 'Água mineral', description: 'Garrafa 500 ml', price: 4, station: 'bar', active: true, stockQuantity: 40 },
  { id: 'prod2', establishmentId: 'est2', categoryId: 'pc1', name: 'Coca-Cola 2L', description: 'Garrafa para compartilhar', price: 12, station: 'bar', active: true, stockQuantity: 24 },
  { id: 'prod3', establishmentId: 'est2', categoryId: 'pc2', name: 'Espetinho de carne', description: 'Com farofa e vinagrete', price: 12, station: 'kitchen', active: true, stockQuantity: 30 },
  { id: 'prod4', establishmentId: 'est2', categoryId: 'pc2', name: 'Espetinho de frango', description: 'Com farofa e vinagrete', price: 10, station: 'kitchen', active: true, stockQuantity: 25 },
  { id: 'prod5', establishmentId: 'est2', categoryId: 'pc3', name: 'Jantinha completa', description: 'Arroz, feijão tropeiro, salada e espetinho', price: 24, station: 'kitchen', active: true, stockQuantity: null },
];

export const MOCK_SERVICE_TABS: ServiceTab[] = [
  { id: 'tab1', establishmentId: 'est2', label: 'Comanda 01', customerPlayerId: 'p1', customerName: 'Você', tableLabel: 'Mesa 4', gameId: null, status: 'open', openedByPlayerId: 'p1', openedAt: iso(now), closedAt: null },
  { id: 'tab2', establishmentId: 'est2', label: 'Comanda 02', customerPlayerId: 'p5', customerName: 'Eduardo Santos', tableLabel: 'Quadra 1', gameId: 'g1', status: 'partially_paid', openedByPlayerId: 'p1', openedAt: iso(now), closedAt: null },
];

export const MOCK_TAB_PARTICIPANTS: TabParticipant[] = [
  { id: 'tp1', tabId: 'tab1', playerId: 'p1', name: 'Você' },
  { id: 'tp4', tabId: 'tab1', playerId: 'p2', name: 'Bruno Silva' },
  { id: 'tp5', tabId: 'tab1', playerId: 'p3', name: 'Carlos Eduardo' },
  { id: 'tp6', tabId: 'tab1', playerId: 'p5', name: 'Eduardo Santos' },
  { id: 'tp2', tabId: 'tab2', playerId: 'p5', name: 'Eduardo Santos' },
  { id: 'tp3', tabId: 'tab2', playerId: 'p6', name: 'Fábio Costa' },
];

export const MOCK_SERVICE_ORDERS: ServiceOrder[] = [
  { id: 'ord1', tabId: 'tab1', status: 'preparing', notes: 'Sem cebola', createdByPlayerId: 'p1', createdAt: iso(now), submittedAt: iso(now), completedAt: null },
  { id: 'ord2', tabId: 'tab2', status: 'delivered', notes: null, createdByPlayerId: 'p1', createdAt: iso(now), submittedAt: iso(now), completedAt: iso(now) },
];

export const MOCK_SERVICE_ORDER_ITEMS: ServiceOrderItem[] = [
  { id: 'oi1', orderId: 'ord1', productId: 'prod3', participantId: 'tp1', quantity: 2, unitPrice: 12, notes: 'Sem cebola', status: 'preparing', cancellationReason: null },
  { id: 'oi2', orderId: 'ord1', productId: 'prod2', participantId: null, quantity: 1, unitPrice: 12, notes: null, status: 'ready', cancellationReason: null },
  { id: 'oi3', orderId: 'ord2', productId: 'prod5', participantId: 'tp2', quantity: 1, unitPrice: 24, notes: null, status: 'delivered', cancellationReason: null },
  { id: 'oi4', orderId: 'ord2', productId: 'prod1', participantId: 'tp3', quantity: 2, unitPrice: 4, notes: null, status: 'delivered', cancellationReason: null },
];

export const MOCK_ORDER_ITEM_SHARES: OrderItemShare[] = [
  { id: 'ois1', itemId: 'oi1', participantId: 'tp1', amountCents: 2400 },
  { id: 'ois2', itemId: 'oi2', participantId: 'tp1', amountCents: 300 },
  { id: 'ois3', itemId: 'oi2', participantId: 'tp4', amountCents: 300 },
  { id: 'ois4', itemId: 'oi2', participantId: 'tp5', amountCents: 300 },
  { id: 'ois5', itemId: 'oi2', participantId: 'tp6', amountCents: 300 },
  { id: 'ois6', itemId: 'oi3', participantId: 'tp2', amountCents: 2400 },
  { id: 'ois7', itemId: 'oi4', participantId: 'tp3', amountCents: 800 },
];

export const MOCK_SALE_PAYMENTS: SalePayment[] = [
  { id: 'sp1', tabId: 'tab2', payerPlayerId: 'p5', payerName: 'Eduardo Santos', amount: 20, method: 'pix', paidAt: iso(now), reversedAt: null },
];

export const MOCK_SALE_PAYMENT_ALLOCATIONS: SalePaymentAllocation[] = [
  { id: 'spa1', paymentId: 'sp1', itemShareId: 'ois6', amountCents: 2000 },
];

export const MOCK_PAYMENT_GATEWAY_CONNECTIONS: PaymentGatewayConnection[] = [
  { id: 'pgc1', establishmentId: 'est2', provider: 'sicoob', status: 'connected', accountLabel: 'Sicoob · conta final 4821', pixEnabled: true, cardEnabled: false, contactlessEnabled: false, connectedAt: iso(now), updatedAt: iso(now) },
];

export const MOCK_SALE_PAYMENT_INTENTS: SalePaymentIntent[] = [];

export const MOCK_CASH_SHIFTS: CashShift[] = [
  { id: 'cash1', establishmentId: 'est2', openedByPlayerId: 'p1', openingAmount: 100, closingAmount: null, expectedAmount: null, difference: null, status: 'open', openedAt: iso(now), closedAt: null },
];

export const MOCK_COACHES: Coach[] = [
  { id: 'coach1', establishmentId: 'est2', playerId: 'p2', sportIds: ['futebol', 'futvolei'], bio: 'Professor e treinador para iniciantes e intermediários.', active: true },
];

export const MOCK_CLASS_PROGRAMS: ClassProgram[] = [
  { id: 'cp1', establishmentId: 'est2', name: 'Escolinha de futebol', sportId: 'futebol', format: 'group', coachId: 'coach1', fieldId: 'f2', level: 'Iniciante', capacity: 12, durationMinutes: 60, price: 120, billingType: 'monthly', active: true, createdAt: iso(now) },
  { id: 'cp2', establishmentId: 'est2', name: 'Futevôlei particular', sportId: 'futvolei', format: 'private', coachId: 'coach1', fieldId: 'f5', level: 'Todos os níveis', capacity: 1, durationMinutes: 50, price: 80, billingType: 'drop_in', active: true, createdAt: iso(now) },
];

const classStartA = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
classStartA.setHours(18, 0, 0, 0);
const classStartB = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
classStartB.setHours(9, 0, 0, 0);

export const MOCK_CLASS_SESSIONS: ClassSession[] = [
  { id: 'cs1', programId: 'cp1', startsAt: iso(classStartA), endsAt: iso(new Date(classStartA.getTime() + 60 * 60 * 1000)), status: 'open', cancellationReason: null },
  { id: 'cs2', programId: 'cp2', startsAt: iso(classStartB), endsAt: iso(new Date(classStartB.getTime() + 50 * 60 * 1000)), status: 'open', cancellationReason: null },
];

export const MOCK_CLASS_ENROLLMENTS: ClassEnrollment[] = [
  { id: 'ce1', sessionId: 'cs1', playerId: 'p5', status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'pix', amount: 120, isTrial: false, waitlistPosition: null, enrolledAt: iso(now), paidAt: iso(now) },
  { id: 'ce2', sessionId: 'cs1', playerId: 'p6', status: 'confirmed', paymentStatus: 'pending', paymentMethod: null, amount: 120, isTrial: true, waitlistPosition: null, enrolledAt: iso(now), paidAt: null },
];

export const MOCK_CLASS_ATTENDANCES: ClassAttendance[] = [];

export const MOCK_SCHEDULES: Schedule[] = [
  {
    id: 's1',
    peladaId: 'pel1',
    fieldId: 'f1',
    recurrence: 'weekly',
    dayOfWeek: 4, // quinta-feira
    time: '20:00',
    startDate: iso(now).slice(0, 10),
    endDate: null,
    maxPlayers: 16,
    matchMinutes: 10,
    bookingDurationMinutes: 90,
    drawMethod: 'rating',
    defaultFieldCost: 240,
    matchGoalLimit: 2,
    autoBookingEnabled: true,
    bookingMinimumPlayers: 15,
    bookingResponseMinutes: 30,
    pollQuorumPercent: 50,
    pollReminderMinutes: 120,
    active: true,
    createdBy: 'p1',
  },
];

const nextGameDate = nextWeekday(4, 20, 0);

export const MOCK_GAMES: Game[] = [
  {
    id: 'g1',
    peladaId: 'pel1',
    scheduleId: 's1',
    fieldId: 'f1',
    scheduledAt: iso(nextGameDate),
    maxPlayers: 16,
    playersPerTeam: 6,
    matchMinutes: 10,
    durationMinutes: 90,
    drawMethod: 'rating',
    rotationMode: 'teams',
    status: 'open',
    fieldCost: 240,
    matchGoalLimit: 2,
    createdBy: 'p1',
    createdAt: iso(now),
  },
];

export const MOCK_GAME_BOOKING_REQUESTS: GameBookingRequest[] = [
  {
    id: 'gbr1', gameId: 'g1', scheduleId: 's1', fieldId: 'f1', preferenceId: 'sfp1', source: 'team', attempt: 1,
    code: 'BJ-7F2K', requestedAt: iso(now), requestedStartAt: iso(nextGameDate), durationMinutes: 90,
    status: 'awaiting_owner', sentAt: iso(now), respondedAt: null,
    expiresAt: iso(new Date(now.getTime() + 30 * 60_000)), providerMessageId: 'demo-evolution-001', responseMessageId: null, failureReason: null,
  },
];

export const MOCK_TEAM_AVAILABILITY_POLLS: TeamAvailabilityPoll[] = [];
export const MOCK_TEAM_AVAILABILITY_POLL_OPTIONS: TeamAvailabilityPollOption[] = [];
export const MOCK_TEAM_AVAILABILITY_POLL_VOTES: TeamAvailabilityPollVote[] = [];

export const MOCK_WHATSAPP_DELIVERIES: WhatsAppDelivery[] = [
  {
    id: 'wad1', bookingRequestId: 'gbr1', pollId: null, toPlayerId: 'p2', phone: '5511988880002', kind: 'field_request', status: 'sent',
    preview: `Pelada dos Amigos solicita Arena Society Central em ${nextGameDate.toLocaleString('pt-BR')}. Responda SIM BJ-7F2K ou NÃO BJ-7F2K.`,
    providerMessageId: 'demo-evolution-001', createdAt: iso(now), sentAt: iso(now), provider: 'evolution_go', fallbackFromProvider: null,
  },
];

export const MOCK_FUNDRAISING_CAMPAIGNS: FundraisingCampaign[] = [
  {
    id: 'fund1', peladaId: 'pel1', title: 'Bola nova para o time',
    description: 'Uma bola society resistente para os jogos de quinta.', category: 'equipment',
    targetAmount: 350, suggestedAmount: 25, deadline: iso(new Date(now.getTime() + 20 * 24 * 60 * 60_000)),
    imageUrl: null, status: 'active', allowAnonymous: true, payoutPlayerId: 'p1', createdBy: 'p1', createdAt: iso(now), closedAt: null,
  },
  {
    id: 'fund2', peladaId: 'pel1', title: 'Churrasco de sábado',
    description: 'Carne, carvão, bebidas e gelo para a confraternização.', category: 'event',
    targetAmount: 600, suggestedAmount: 40, deadline: iso(new Date(now.getTime() + 12 * 24 * 60 * 60_000)),
    imageUrl: null, status: 'active', allowAnonymous: true, payoutPlayerId: 'p1', createdBy: 'p1', createdAt: iso(now), closedAt: null,
  },
];

export const MOCK_FUNDRAISING_CONTRIBUTIONS: FundraisingContribution[] = [
  { id: 'fc1', campaignId: 'fund1', paidByPlayerId: 'p2', creditedPlayerId: 'p2', amount: 50, method: 'pix', provider: 'manual_pix', status: 'paid', anonymous: false, message: 'Vamos estrear a bola!', externalId: 'demo-fc1', pixCopyPaste: null, checkoutUrl: null, createdAt: iso(now), paidAt: iso(now) },
  { id: 'fc2', campaignId: 'fund1', paidByPlayerId: 'p3', creditedPlayerId: 'p3', amount: 25, method: 'pix', provider: 'manual_pix', status: 'paid', anonymous: false, message: null, externalId: 'demo-fc2', pixCopyPaste: null, checkoutUrl: null, createdAt: iso(now), paidAt: iso(now) },
  { id: 'fc3', campaignId: 'fund2', paidByPlayerId: 'p5', creditedPlayerId: 'p5', amount: 80, method: 'pix', provider: 'manual_pix', status: 'paid', anonymous: false, message: 'Eu levo o gelo.', externalId: 'demo-fc3', pixCopyPaste: null, checkoutUrl: null, createdAt: iso(now), paidAt: iso(now) },
];

export const MOCK_FUNDRAISING_EXPENSES: FundraisingExpense[] = [
  { id: 'fe1', campaignId: 'fund2', title: 'Reserva do carvão', amount: 45, receiptUrl: null, recordedBy: 'p1', createdAt: iso(now) },
];

// 15 confirmados como no exemplo do usuário: 14 amigos + você.
const confirmedIds = MOCK_PLAYERS.slice(0, 15).map((p) => p.id);

export const MOCK_ATTENDANCES: Attendance[] = MOCK_PLAYERS.slice(0, 16).map((p, idx) => {
  const isConfirmed = confirmedIds.includes(p.id);
  return {
    id: `att-${p.id}`,
    gameId: 'g1',
    playerId: p.id,
    status: isConfirmed ? 'confirmed' : 'pending',
    confirmedOrder: isConfirmed ? idx + 1 : null,
    respondedAt: isConfirmed ? iso(now) : null,
    noShow: false,
    checkedIn: false,
  } satisfies Attendance;
});

// Rateio do jogo g1: os 5 primeiros confirmados já pagaram, o resto está pendente.
export const MOCK_PAYMENTS: Payment[] = confirmedIds.map((playerId, idx) => {
  const paid = idx < 5;
  return {
    id: `pay-${playerId}`,
    gameId: 'g1',
    playerId,
    status: paid ? 'paid' : 'pending',
    method: paid ? 'pix' : null,
    paidAt: paid ? iso(now) : null,
    paidByPlayerId: null,
  } satisfies Payment;
});

export const MOCK_TEAMS: Team[] = [];
export const MOCK_TEAM_PLAYERS: TeamPlayer[] = [];
export const MOCK_MATCH_TURNS: MatchTurn[] = [];
export const MOCK_GOALS: Goal[] = [];

// ---------------------------------------------------------------------
// Campeonato de exemplo, organizado pelo dono do estabelecimento (est1):
// 4 times (1 vindo da pelada pel1, 3 avulsos), pontos corridos, 1ª rodada
// já jogada pra mostrar a classificação funcionando.
// ---------------------------------------------------------------------
export const MOCK_CHAMPIONSHIPS: Championship[] = [
  {
    id: 'champ1',
    establishmentId: 'est1',
    organizerPeladaId: null,
    name: 'Copa Arena Society Central',
    sportId: 'futebol',
    format: 'round_robin',
    fieldId: 'f1',
    maxTeams: 4,
    entryFee: 50,
    registrationCode: 'COPA-ARENA',
    registrationDeadline: null,
    matchMinutes: 10,
    status: 'in_progress',
    createdBy: 'p2',
    createdAt: iso(now),
  },
];

export const MOCK_SCHEDULE_FIELD_PREFERENCES: ScheduleFieldPreference[] = [
  { id: 'sfp1', scheduleId: 's1', fieldId: 'f1', priority: 1, source: 'team', createdAt: iso(now) },
  { id: 'sfp2', scheduleId: 's1', fieldId: 'f2', priority: 2, source: 'team', createdAt: iso(now) },
];

export const MOCK_CHAMPIONSHIP_BUDGETS: ChampionshipBudget[] = [
  {
    id: 'cb1', championshipId: 'champ1', plannedTeams: 4,
    fieldCostPerMatch: 60, refereeCostPerMatch: 80, assistantRefereeCostPerMatch: 0, tableStaffCostPerMatch: 20,
    prizeCost: 500, trophiesCost: 180, medicalCost: 150, securityCost: 0, marketingCost: 100,
    materialsCost: 70, cleaningCost: 80, foodWaterCost: 100, licensesCost: 0, otherCost: 0,
    contingencyPercent: 10, paymentFeePercent: 2, targetProfit: 500, updatedAt: iso(now),
  },
];

export const MOCK_CHAMPIONSHIP_TEAMS: ChampionshipTeam[] = [
  { id: 'ct1', championshipId: 'champ1', name: 'Time do João', color: '#22C55E', logoUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=Time%20do%20Jo%C3%A3o', peladaId: 'pel1', registeredByPlayerId: 'p1', status: 'confirmed', createdAt: iso(now) },
  { id: 'ct2', championshipId: 'champ1', name: 'Galera do Bairro', color: '#3B82F6', logoUrl: null, peladaId: null, registeredByPlayerId: 'p7', status: 'confirmed', createdAt: iso(now) },
  { id: 'ct3', championshipId: 'champ1', name: 'Amigos da Vila', color: '#D4AF37', logoUrl: null, peladaId: null, registeredByPlayerId: 'p13', status: 'confirmed', createdAt: iso(now) },
  { id: 'ct4', championshipId: 'champ1', name: 'FC Independente', color: '#7C3AED', logoUrl: null, peladaId: null, registeredByPlayerId: 'p19', status: 'confirmed', createdAt: iso(now) },
];

export const MOCK_CHAMPIONSHIP_TEAM_PLAYERS: ChampionshipTeamPlayer[] = [
  ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((playerId) => ({ championshipTeamId: 'ct1', playerId, isGoalkeeper: playerId === 'p3' })),
  ...['p7', 'p8', 'p9', 'p10', 'p11', 'p12'].map((playerId) => ({ championshipTeamId: 'ct2', playerId, isGoalkeeper: playerId === 'p8' })),
  ...['p13', 'p14', 'p15', 'p16', 'p17', 'p18'].map((playerId) => ({ championshipTeamId: 'ct3', playerId, isGoalkeeper: playerId === 'p17' })),
  ...['p19', 'p2', 'p5', 'p9', 'p13'].map((playerId) => ({ championshipTeamId: 'ct4', playerId, isGoalkeeper: false })),
];

export const MOCK_CHAMPIONSHIP_MATCHES: ChampionshipMatch[] = [
  { id: 'cm1', championshipId: 'champ1', round: 1, roundLabel: 'Rodada 1', teamAId: 'ct1', teamBId: 'ct2', feedsFromMatchAId: null, feedsFromMatchBId: null, fieldId: 'f1', scheduledAt: iso(now), startedAt: iso(now), endedAt: iso(now), status: 'finished', penaltyScoreA: null, penaltyScoreB: null, winnerTeamId: 'ct1' },
  { id: 'cm2', championshipId: 'champ1', round: 1, roundLabel: 'Rodada 1', teamAId: 'ct3', teamBId: 'ct4', feedsFromMatchAId: null, feedsFromMatchBId: null, fieldId: 'f1', scheduledAt: iso(now), startedAt: iso(now), endedAt: iso(now), status: 'finished', penaltyScoreA: null, penaltyScoreB: null, winnerTeamId: null },
  { id: 'cm3', championshipId: 'champ1', round: 2, roundLabel: 'Rodada 2', teamAId: 'ct1', teamBId: 'ct3', feedsFromMatchAId: null, feedsFromMatchBId: null, fieldId: 'f1', scheduledAt: nextWeekday(4, 20, 0).toISOString(), startedAt: null, endedAt: null, status: 'scheduled', penaltyScoreA: null, penaltyScoreB: null, winnerTeamId: null },
  { id: 'cm4', championshipId: 'champ1', round: 2, roundLabel: 'Rodada 2', teamAId: 'ct2', teamBId: 'ct4', feedsFromMatchAId: null, feedsFromMatchBId: null, fieldId: 'f1', scheduledAt: nextWeekday(4, 20, 0).toISOString(), startedAt: null, endedAt: null, status: 'scheduled', penaltyScoreA: null, penaltyScoreB: null, winnerTeamId: null },
  { id: 'cm5', championshipId: 'champ1', round: 3, roundLabel: 'Rodada 3', teamAId: 'ct1', teamBId: 'ct4', feedsFromMatchAId: null, feedsFromMatchBId: null, fieldId: 'f1', scheduledAt: nextWeekday(4, 20, 0).toISOString(), startedAt: null, endedAt: null, status: 'scheduled', penaltyScoreA: null, penaltyScoreB: null, winnerTeamId: null },
  { id: 'cm6', championshipId: 'champ1', round: 3, roundLabel: 'Rodada 3', teamAId: 'ct2', teamBId: 'ct3', feedsFromMatchAId: null, feedsFromMatchBId: null, fieldId: 'f1', scheduledAt: nextWeekday(4, 20, 0).toISOString(), startedAt: null, endedAt: null, status: 'scheduled', penaltyScoreA: null, penaltyScoreB: null, winnerTeamId: null },
];

export const MOCK_CHAMPIONSHIP_GOALS: ChampionshipGoal[] = [
  { id: 'cg1', matchId: 'cm1', teamId: 'ct1', scorerPlayerId: 'p1', scoredAt: iso(now) },
  { id: 'cg2', matchId: 'cm1', teamId: 'ct1', scorerPlayerId: 'p1', scoredAt: iso(now) },
  { id: 'cg3', matchId: 'cm1', teamId: 'ct1', scorerPlayerId: 'p2', scoredAt: iso(now) },
  { id: 'cg4', matchId: 'cm1', teamId: 'ct2', scorerPlayerId: 'p7', scoredAt: iso(now) },
  { id: 'cg5', matchId: 'cm2', teamId: 'ct3', scorerPlayerId: 'p13', scoredAt: iso(now) },
  { id: 'cg6', matchId: 'cm2', teamId: 'ct3', scorerPlayerId: 'p14', scoredAt: iso(now) },
  { id: 'cg7', matchId: 'cm2', teamId: 'ct4', scorerPlayerId: 'p19', scoredAt: iso(now) },
  { id: 'cg8', matchId: 'cm2', teamId: 'ct4', scorerPlayerId: 'p19', scoredAt: iso(now) },
];

export const MOCK_RATINGS: Rating[] = [
  { id: 'r1', gameId: 'g0', raterPlayerId: 'p2', ratedPlayerId: 'p1', attack: 4, defense: 3, pace: 5, overall: 4, createdAt: iso(now) },
  { id: 'r2', gameId: 'g0', raterPlayerId: 'p3', ratedPlayerId: 'p1', attack: 5, defense: 4, pace: 4, overall: 4.33, createdAt: iso(now) },
  { id: 'r3', gameId: 'g0', raterPlayerId: 'p4', ratedPlayerId: 'p1', attack: 3, defense: 3, pace: 4, overall: 3.33, createdAt: iso(now) },
  { id: 'r4', gameId: 'g0', raterPlayerId: 'p1', ratedPlayerId: 'p2', attack: 4, defense: 4, pace: 3, overall: 3.67, createdAt: iso(now) },
  { id: 'r5', gameId: 'g0', raterPlayerId: 'p3', ratedPlayerId: 'p8', attack: 2, defense: 5, pace: 3, overall: 3.33, createdAt: iso(now) },
];

export const MOCK_FRIENDSHIPS: Friendship[] = [
  { id: 'fr1', requesterId: 'p1', addresseeId: 'p2', status: 'accepted', createdAt: iso(now), respondedAt: iso(now) },
  { id: 'fr2', requesterId: 'p3', addresseeId: 'p1', status: 'accepted', createdAt: iso(now), respondedAt: iso(now) },
  { id: 'fr3', requesterId: 'p1', addresseeId: 'p7', status: 'accepted', createdAt: iso(now), respondedAt: iso(now) },
  // pedido pendente recebido por "Você" — pra demonstrar a tela de solicitações.
  { id: 'fr4', requesterId: 'p10', addresseeId: 'p1', status: 'pending', createdAt: iso(now), respondedAt: null },
  // pedido pendente enviado por "Você", ainda sem resposta.
  { id: 'fr5', requesterId: 'p1', addresseeId: 'p4', status: 'pending', createdAt: iso(now), respondedAt: null },
];

// Confronto direto de exemplo entre "Você" (p1) e o Cadu (p3) — já com resultado registrado,
// pra mostrar o retrospecto na tela de perfil sem precisar desafiar ninguém na mão.
export const MOCK_PLAYER_DUELS: PlayerDuel[] = [
  {
    id: 'pd1',
    challengerId: 'p1',
    challengedId: 'p3',
    message: 'Bora ver quem é melhor de bico?',
    status: 'accepted',
    winnerId: 'p1',
    resultNote: null,
    createdBy: 'p1',
    createdAt: iso(now),
    respondedAt: iso(now),
    resultRecordedAt: iso(now),
  },
];

export const MOCK_PUNISHMENTS: Punishment[] = [
  {
    id: 'pun1',
    peladaId: 'pel1',
    playerId: 'p9',
    gameId: 'g0',
    type: 'no_show',
    strikeLevel: 1,
    suspendedUntilGameCount: 0,
    notes: 'Confirmou e não avisou',
    createdAt: iso(now),
  },
];
