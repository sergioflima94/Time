import type {
  Attendance,
  Championship,
  ChampionshipGoal,
  ChampionshipMatch,
  ChampionshipTeam,
  ChampionshipTeamPlayer,
  Establishment,
  Field,
  FieldBooking,
  Friendship,
  Game,
  Goal,
  MatchTurn,
  Payment,
  Pelada,
  PeladaMembership,
  Player,
  Punishment,
  Rating,
  Schedule,
  Team,
  TeamPlayer,
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
  { id: 'p1', authUserId: 'auth-1', name: 'Você', nickname: null, avatarUrl: null, cardBackgroundUrl: null, premiumSince: null, premiumUntil: null, premiumAutoRenew: false, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: MY_LOCATION, locationUpdatedAt: iso(now), createdAt: iso(now) },
  { id: 'p2', authUserId: null, name: 'Bruno Silva', nickname: 'Brunão', avatarUrl: demoPhoto(12), cardBackgroundUrl: null, premiumSince: iso(now), premiumUntil: demoPremiumActiveUntil, premiumAutoRenew: true, isGuest: false, phone: null, preferredPosition: 'line', favoriteSports: ['futebol', 'volei'], freeAgentOptIn: false, freeAgentRadiusKm: null, freeAgentAvailability: [], location: null, locationUpdatedAt: null, createdAt: iso(now) },
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
    accessCode: 'VILA-NOVA',
    createdAt: iso(now),
  },
];

export const MOCK_FIELDS: Field[] = [
  { id: 'f1', peladaId: 'pel1', name: 'Arena Society Central', address: 'Rua das Palmeiras, 123', notes: 'Grama sintética, tem estacionamento', establishmentId: 'est1', sportId: 'futebol', createdBy: 'p1' },
  // Campos próprios do Complexo Esportivo Vila Nova (est2, dono = p1) — um por esporte,
  // sem depender de nenhuma pelada.
  { id: 'f2', peladaId: null, name: 'Quadra 1 - Society', address: 'Av. Vila Nova, 500', notes: null, establishmentId: 'est2', sportId: 'futebol', createdBy: 'p1' },
  { id: 'f3', peladaId: null, name: 'Quadra 2 - Vôlei', address: 'Av. Vila Nova, 500', notes: null, establishmentId: 'est2', sportId: 'volei', createdBy: 'p1' },
  { id: 'f4', peladaId: null, name: 'Quadra 3 - Basquete', address: 'Av. Vila Nova, 500', notes: null, establishmentId: 'est2', sportId: 'basquete', createdBy: 'p1' },
  { id: 'f5', peladaId: null, name: 'Arena de Areia - Futevôlei', address: 'Av. Vila Nova, 500', notes: null, establishmentId: 'est2', sportId: 'futvolei', createdBy: 'p1' },
];

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
    drawMethod: 'rating',
    defaultFieldCost: 240,
    matchGoalLimit: 2,
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
    drawMethod: 'rating',
    rotationMode: 'teams',
    status: 'open',
    fieldCost: 240,
    matchGoalLimit: 2,
    createdBy: 'p1',
    createdAt: iso(now),
  },
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
