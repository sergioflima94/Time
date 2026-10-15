import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useState } from 'react';

import { AdBanner } from '@/components/AdBanner';
import { HomePlayHub } from '@/components/PlayHubPanels';
import { GameCard } from '@/components/GameCard';
import { Card } from '@/components/ui/Card';
import { TeamBadge } from '@/components/TeamBadge';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport, useSports, scoreLabel } from '@/constants/sports';
import { useMyPeladas } from '@/hooks/useCurrentPelada';
import { useIsAdFree } from '@/hooks/useIsAdFree';
import { computePlayerGoalStats } from '@/lib/goals';
import { computePlayerActivitySummary, computePlayerRecord, computeOverallTrend } from '@/lib/performance';
import { computePlayerOverall } from '@/lib/ratings';
import { homeGameAgenda, homeGameDistance } from '@/lib/home';
import { useAppStore } from '@/store/useAppStore';

export default function AgendaScreen() {
  const SPORTS = useSports();
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= 1180;
  const [sportFilter, setSportFilter] = useState('all');
  const currentPeladaId = useAppStore(s => s.currentPeladaId);
  const myPeladas = useMyPeladas();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const player = useAppStore((s) => s.players.find((p) => p.id === currentPlayerId));
  const allGames = useAppStore((s) => s.games);
  const attendances = useAppStore((s) => s.attendances);
  const ratings = useAppStore((s) => s.ratings);
  const teamPlayers = useAppStore((s) => s.teamPlayers);
  const matchTurns = useAppStore((s) => s.matchTurns);
  const goals = useAppStore((s) => s.goals);
  const adFree = useIsAdFree();

  const myTeamIds = new Set(myPeladas.map(p => p.id));
  const games = allGames.filter(g => myTeamIds.has(g.peladaId) && (sportFilter === 'all' || myPeladas.find(p => p.id === g.peladaId)?.sportId === sportFilter));
  const gameIds = new Set(games.map(g => g.id));
  const filteredTurns = matchTurns.filter(t => gameIds.has(t.gameId));
  const turnIds = new Set(filteredTurns.map(t => t.id));
  const sportRatings = ratings.filter(r => gameIds.has(r.gameId));
  const overall = computePlayerOverall(currentPlayerId, sportRatings);
  const trend = computeOverallTrend(currentPlayerId, sportRatings);
  const record = computePlayerRecord(currentPlayerId, teamPlayers, filteredTurns);
  const goalStats = computePlayerGoalStats(currentPlayerId, teamPlayers, filteredTurns, goals.filter(g => turnIds.has(g.matchTurnId)));
  const activity = computePlayerActivitySummary(currentPlayerId, games, attendances);
  const sport = getSport(sportFilter === 'all' ? player?.favoriteSports[0] : sportFilter);
  const { featured: nextGame, remaining, past } = homeGameAgenda(games);
  const hasRatings = overall.ratingsCount > 0;

  return (
    <Screen>
      <View style={styles.welcomeHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.welcomeTitle}>{greeting()}, {player?.nickname || player?.name?.split(' ')[0] || 'jogador'}</Text>
          <Text style={styles.welcomeSubtitle}>Seu jogo e sua turma, por aqui.</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {[{ id: 'all', label: 'Todos os esportes' }, ...SPORTS].map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: sportFilter === item.id }} onPress={() => setSportFilter(item.id)} style={[styles.filterPill, { borderColor: sportFilter === item.id ? colors.primary : colors.cardBorder, backgroundColor: sportFilter === item.id ? '#E7F7CF' : colors.card }]}><Text style={styles.datePillText}>{item.label}</Text></Pressable>)}
      </ScrollView>

      <View style={[styles.dashboard, wide && styles.dashboardWide]}><View style={[styles.mainColumn, wide && { flex: 1.35 }]}>
      {nextGame ? (
        <View style={styles.nextGameSection}>
          <GameCard game={nextGame} featured />
        </View>
      ) : (
        <Pressable accessibilityRole="button" style={styles.emptyAgenda} onPress={() => router.push('/descobrir')}>
          <Ionicons name="calendar-outline" size={22} color={colors.primaryDark} />
          <View style={{ flex: 1 }}>
            <Text style={styles.growthCentralTitle}>Sua próxima partida começa aqui</Text>
            <Text style={styles.quickActionDescription}>Sem jogos neste filtro. Encontre uma vaga para jogar.</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.primaryDark} />
        </Pressable>
      )}

      <Card style={styles.perfCard}>
        <View style={styles.performanceHero}>
          <View style={styles.performanceCopy}>
            <View style={styles.perfHeaderRow}>
              <Text style={styles.performanceTitle}>Seu desempenho</Text>
              <TrendBadge trend={trend} />
            </View>
            <Text style={styles.performanceMessage}>{hasRatings ? `Nota ${overall.overall} · ${performanceMessage(trend, activity)}` : 'Seu histórico de jogos, mesmo sem avaliações.'}</Text>
          </View>
        </View>
        <View style={styles.perfStatsRow}>
          <PerfStat label="Jogos" value={String(activity.gamesPlayed)} />
          <PerfStat label="Rodadas vencidas" value={String(record.wins)} />
          <PerfStat label={sportFilter === 'all' ? 'Rodadas jogadas' : scoreLabel(sport.id, goalStats.scored)} value={String(sportFilter === 'all' ? record.played : goalStats.scored)} />
        </View>
        {record.played > 0 && (
          <Text style={styles.perfRecordText}>
            {record.wins}V · {record.draws}E · {record.losses}D
            {sportFilter !== 'all' ? `  ·  saldo ${goalStats.balance > 0 ? '+' : ''}${goalStats.balance}` : '  ·  resultados por rodada'}
          </Text>
        )}
        <View style={styles.performanceLinks}><Pressable accessibilityRole="button" style={styles.perfLink} onPress={() => router.push('/(tabs)/perfil')}>
          <Text style={styles.perfLinkText}>Ver evolução</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Meu histórico" style={styles.perfLink} onPress={()=>router.push('/historico')}>
          <Text style={styles.perfLinkText}>Meu histórico</Text><Ionicons name="time-outline" size={14} color={colors.primary} />
        </Pressable></View>
      </Card>
      </View><View style={[styles.mainColumn, wide && { flex: 1 }]}>
      {myPeladas.length > 0 && (
        <View style={styles.shortcutsSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Seus times</Text>
            <Pressable style={styles.viewAllButton} onPress={() => router.push('/(tabs)/times')}>
              <Text style={styles.viewAllText}>Ver todos</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primaryDark} />
            </Pressable>
          </View>
          <Card style={{ gap: 0, paddingVertical: 0 }}>
            {myPeladas.slice(0, 3).map((p) => (
              <TeamShortcut key={p.id} peladaId={p.id} name={p.name} sportId={p.sportId} active={p.id === currentPeladaId} />
            ))}
          </Card><Pressable accessibilityRole="button" style={styles.addTeamShortcut} onPress={() => router.push('/criar-pelada')}>
              <Ionicons name="add" size={20} color={colors.primary} />
              <Text style={styles.addTeamShortcutText}>Novo time</Text>
            </Pressable>
        </View>
      )}
      {myPeladas.length === 0 && <View style={styles.shortcutsSection}>
        <Text style={styles.sectionTitle}>Seus times</Text>
        <Text style={styles.performanceMessage}>Entre com o convite da galera ou organize seu time.</Text>
        <View style={styles.quickActions}>
          <QuickAction icon="people-outline" label="Entrar em um time" onPress={() => router.push('/entrar-pelada')} />
          <QuickAction icon="add-circle-outline" label="Criar meu time" onPress={() => router.push('/criar-pelada')} />
        </View>
      </View>}

      <View style={styles.exploreSection}>
        <Text style={styles.sectionTitle}>Acesso rápido</Text>
        <View style={styles.quickActions}>
          <QuickAction icon="location-outline" label="Campos próximos" onPress={() => router.push('/campos')} />
          <QuickAction icon="football-outline" label="Encontrar um jogo" onPress={() => router.push('/descobrir')} />
          <QuickAction icon="videocam-outline" label="Meus lances" onPress={() => router.push('/lances')} />
          <QuickAction icon="time-outline" label="Horários e desafios" onPress={() => router.push('/bora')} />
          <QuickAction icon="school-outline" label="Aulas esportivas" onPress={() => router.push('/aulas')} />
          <QuickAction icon="document-text-outline" label="Minhas faturas" onPress={() => router.push('/faturas')} />
          <QuickAction icon="business-outline" label="Meu acesso nos campos" onPress={() => router.push('/operacao')} />
          <QuickAction icon="bag-outline" label="Loja esportiva" onPress={() => router.push('/loja')} />
        </View>
      </View>
      </View></View>
      <HomePlayHub />

      {remaining.length > 0 ? (
        <View>
          <Text style={[styles.sectionTitle, { marginBottom: spacing.sm }]}>Também na sua agenda</Text>
          {remaining.slice(0, 3).map((game) => <GameCard key={game.id} game={game} compact />)}
        </View>
      ) : null}

      {past.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Jogos anteriores</Text>
          {past.slice(0, 3).map((game) => (
            <GameCard key={game.id} game={game} compact />
          ))}
        </>
      )}
      {!adFree && <AdBanner />}
    </Screen>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} style={styles.quickAction} onPress={onPress}>
    <Ionicons name={icon} size={18} color={colors.primaryDark} />
    <Text style={styles.quickActionLabel}>{label}</Text><Ionicons name="chevron-forward" size={13} color={colors.textFaint} />
  </Pressable>;
}

function performanceMessage(
  trend: ReturnType<typeof computeOverallTrend>,
  activity: ReturnType<typeof computePlayerActivitySummary>,
) {
  if (activity.noShows > 0) return `${activity.noShows} falta${activity.noShows > 1 ? 's' : ''} registrada${activity.noShows > 1 ? 's' : ''}. Recupere sua sequência.`;
  if (trend.direction === 'up' && trend.delta !== null) return `Você subiu ${trend.delta} ponto${trend.delta === 1 ? '' : 's'} nas avaliações recentes.`;
  if (activity.confirmedUpcoming > 0) return `Presença confirmada em ${activity.confirmedUpcoming} próximo${activity.confirmedUpcoming > 1 ? 's' : ''} jogo${activity.confirmedUpcoming > 1 ? 's' : ''}.`;
  return 'Seu histórico reúne os jogos e resultados dos seus times.';
}

function PerfStat({ label, value, icon }: { label: string; value: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.perfStat}>
      {icon && <Ionicons name={icon} size={15} color={colors.secondary} />}
      <Text style={styles.perfStatValue}>{value}</Text>
      <Text style={styles.perfStatLabel}>{label}</Text>
    </View>
  );
}

function TrendBadge({ trend }: { trend: ReturnType<typeof computeOverallTrend> }) {
  if (trend.direction === 'new' || trend.delta === null) return null;
  const isUp = trend.direction === 'up';
  const isStable = trend.direction === 'stable';
  const color = isStable ? colors.textMuted : isUp ? colors.success : colors.danger;
  const icon = isStable ? 'remove' : isUp ? 'trending-up' : 'trending-down';
  return (
    <View style={[styles.trendBadge, { backgroundColor: `${color}22` }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.trendBadgeText, { color }]}>
        {isStable ? 'estável' : `${trend.delta > 0 ? '+' : ''}${trend.delta}`}
      </Text>
    </View>
  );
}

function TeamShortcut({
  peladaId,
  name,
  sportId,
  active,
}: {
  peladaId: string;
  name: string;
  sportId: string;
  active: boolean;
}) {
  const sport = getSport(sportId);
  const pelada = useAppStore(s => s.peladas.find(p => p.id === peladaId));
  const isAdmin = useAppStore(s => s.memberships.some(m => m.peladaId === peladaId && m.playerId === s.currentPlayerId && m.active && m.role === 'admin'));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Abrir time ${name}`} style={[styles.teamShortcut, active && styles.teamShortcutActive]} onPress={() => router.push(`/time/${peladaId}`)}>
      <TeamBadge name={name} logoUrl={pelada?.logoUrl} size={40} />
      <View style={{ flex: 1, gap: 3 }}><Text style={styles.teamShortcutName} numberOfLines={2}>
        {name}
      </Text><Text style={styles.performanceMessage}>{sport.label} · {isAdmin ? 'Você administra' : 'Você participa'}</Text></View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dashboard: { gap: 12 }, dashboardWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 22 },
  mainColumn: { gap: 12, minWidth: 0 },
  welcomeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: 0,
  },
  welcomeTitle: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.4 },
  welcomeSubtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 3 },
  profileButton: { padding: 2, borderRadius: radius.full, borderWidth: 2, borderColor: colors.primary },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.full, backgroundColor: '#E7F7CF' },
  datePillText: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' },
  filterPill: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.full, borderWidth: 1 },
  emptyAgenda: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.card },
  perfCard: {
    marginBottom: 0,
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    padding: 14,
  },
  performanceHero: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  overallBlock: { width: 56, minHeight: 56, borderRadius: radius.md, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  overallValue: { color: colors.white, fontSize: 27, lineHeight: 29, fontWeight: '900', letterSpacing: -0.8 },
  overallLabel: { color: '#D7E7FF', fontSize: 7, fontWeight: '900', letterSpacing: 0.6 },
  performanceCopy: { flex: 1, gap: 5 },
  performanceTitle: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  performanceMessage: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  performanceLinks: { flexDirection: 'row', gap: 12 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  quickAction: { flexDirection: 'row', alignItems: 'center', gap: 8, flexBasis: '47%', flexGrow: 1, minHeight: 58, padding: 12, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, backgroundColor: colors.card },
  quickActionLabel: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' },
  nextGameSection: { marginBottom: 0 },
  exploreSection: { marginBottom: spacing.md },
  growthCentralTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  quickActionDescription: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  perfHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -spacing.xs,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  trendBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  perfStatsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  perfStat: {
    alignItems: 'center',
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderRightWidth: 1,
    borderRightColor: colors.cardBorder,
  },
  perfStatValue: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '900',
  },
  perfStatLabel: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  perfRecordText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  perfLink: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  perfLinkText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '600',
  },
  shortcutsSection: {
    marginBottom: 0,
  },
  viewAllButton: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingLeft: 10 },
  viewAllText: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
  shortcutsRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  teamShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 70,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  teamShortcutActive: {
    backgroundColor: colors.card,
  },
  teamShortcutBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamShortcutIcon: {
    fontSize: 16,
  },
  teamShortcutName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  addTeamShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 108,
    minHeight: 52,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    gap: spacing.xs,
  },
  addTeamShortcutText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
});
