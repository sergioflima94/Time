import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { AdBanner } from '@/components/AdBanner';
import { GameCard } from '@/components/GameCard';
import { PeladaSwitcher } from '@/components/PeladaSwitcher';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport, useSports, scoreLabel } from '@/constants/sports';
import { useMyPeladas } from '@/hooks/useCurrentPelada';
import { useIsAdFree } from '@/hooks/useIsAdFree';
import { computePlayerGoalStats } from '@/lib/goals';
import { computePlayerActivitySummary, computePlayerRecord, computeOverallTrend } from '@/lib/performance';
import { computePlayerOverall } from '@/lib/ratings';
import { useAppStore } from '@/store/useAppStore';

export default function AgendaScreen() {
  const SPORTS = useSports();
  const [sportFilter, setSportFilter] = useState('all');
  const pelada = useAppStore(s => s.peladas.find(p => p.id === s.currentPeladaId) ?? s.peladas[0]);
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
  const sport = getSport(sportFilter === 'all' ? pelada?.sportId ?? player?.favoriteSports[0] : sportFilter);

  const now = Date.now();
  const upcoming = games
    .filter((g) => new Date(g.scheduledAt).getTime() >= now && !['cancelled', 'finished'].includes(g.status))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const past = games
    .filter((g) => g.status === 'finished')
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  const nextGame = upcoming[0];

  return (
    <Screen>
      <View style={styles.welcomeHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandEyebrow}>BORAJOGO</Text>
          <Text style={styles.welcomeTitle}>{greeting()}, {player?.nickname || player?.name?.split(' ')[0] || 'jogador'}</Text>
          <Text style={styles.welcomeSubtitle}>Disciplina hoje, resenha amanhã.</Text>
        </View>
        <Pressable style={styles.profileButton} onPress={() => router.push('/(tabs)/perfil')}>
          <Avatar name={player?.name ?? 'Jogador'} photoUrl={player?.avatarUrl} size={42} />
        </Pressable>
      </View>

      <View style={[styles.peladaHeader, { borderLeftColor: sport.color }]}>
        {pelada ? <PeladaSwitcher /> : <Text style={styles.welcomeSubtitle}>Entre em um time ou descubra um jogo para começar.</Text>}
        {pelada?.description && <Text style={styles.peladaDescription}>{pelada.description}</Text>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
        {[{ id: 'all', label: 'Todos os esportes' }, ...SPORTS].map(item => <Pressable key={item.id} onPress={() => setSportFilter(item.id)} style={[styles.datePill, { borderWidth: 1, borderColor: sportFilter === item.id ? colors.primary : colors.cardBorder, backgroundColor: sportFilter === item.id ? colors.bgElevated : colors.card }]}><Text style={styles.datePillText}>{item.label}</Text></Pressable>)}
      </ScrollView>

      {nextGame && (
        <View style={styles.nextGameSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Seu próximo jogo</Text>
            <View style={styles.datePill}>
              <Ionicons name="time-outline" size={13} color={colors.primaryDark} />
              <Text style={styles.datePillText}>{distanceToGame(nextGame.scheduledAt)}</Text>
            </View>
          </View>
          <GameCard game={nextGame} compact />
        </View>
      )}

      <Card style={styles.perfCard}>
        <View style={styles.performanceHero}>
          <View style={styles.overallBlock}>
            <Text style={styles.overallValue}>{overall.overall}</Text>
            <Text style={styles.overallLabel}>NOTA GERAL</Text>
          </View>
          <View style={styles.performanceCopy}>
            <View style={styles.perfHeaderRow}>
              <Text style={styles.performanceTitle}>Seu momento</Text>
              <TrendBadge trend={trend} />
            </View>
            <Text style={styles.performanceMessage}>{performanceMessage(trend, activity)}</Text>
          </View>
        </View>
        <View style={styles.perfStatsRow}>
          <PerfStat icon="football-outline" label="Jogos" value={String(activity.gamesPlayed)} />
          <PerfStat label="Rodadas vencidas" value={String(record.wins)} />
          <PerfStat icon="flame-outline" label={sportFilter === 'all' ? 'Rodadas jogadas' : scoreLabel(sport.id, goalStats.scored)} value={String(sportFilter === 'all' ? record.played : goalStats.scored)} />
        </View>
        {record.played > 0 && (
          <Text style={styles.perfRecordText}>
            {record.wins}V · {record.draws}E · {record.losses}D
            {sportFilter !== 'all' ? `  ·  saldo ${goalStats.balance > 0 ? '+' : ''}${goalStats.balance}` : '  ·  resultados por rodada'}
          </Text>
        )}
        <Pressable style={styles.perfLink} onPress={() => router.push('/(tabs)/perfil')}>
          <Text style={styles.perfLinkText}>Ver perfil completo</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      </Card>

      {myPeladas.length > 0 && (
        <View style={styles.shortcutsSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Seus times</Text>
            <Pressable style={styles.viewAllButton} onPress={() => router.push('/(tabs)/times')}>
              <Text style={styles.viewAllText}>Ver todos</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primaryDark} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcutsRow}>
            {myPeladas.map((p) => (
              <TeamShortcut key={p.id} peladaId={p.id} name={p.name} sportId={p.sportId} active={p.id === pelada?.id} />
            ))}
            <Pressable style={styles.addTeamShortcut} onPress={() => router.push('/criar-pelada')}>
              <Ionicons name="add" size={20} color={colors.primary} />
              <Text style={styles.addTeamShortcutText}>Novo time</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      <View style={styles.exploreSection}>
        <Text style={styles.sectionTitle}>Bora jogar mais?</Text>
        <View style={styles.quickActions}>
          <Pressable style={styles.growthCentral} onPress={() => router.push('/descobrir')}>
            <View style={styles.growthCentralIcon}><Ionicons name="rocket-outline" size={20} color={colors.onAction} /></View>
            <View style={styles.quickActionCopy}>
              <Text style={styles.growthCentralTitle}>Encontrar um jogo</Text>
              <Text style={styles.quickActionDescription}>Vagas abertas para conhecer gente</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={colors.primaryDark} />
          </Pressable>
          <Pressable style={styles.proCentral} onPress={() => router.push('/aulas')}>
            <View style={styles.proCentralIcon}><Ionicons name="shield-checkmark" size={19} color={colors.white} /></View>
            <View style={styles.quickActionCopy}>
              <Text style={styles.growthCentralTitle}>Aulas esportivas</Text>
              <Text style={styles.quickActionDescription}>Aprender e evoluir no seu ritmo</Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={colors.special} />
          </Pressable>
        </View>
      </View>

      {upcoming.length === 0 ? (
        <>
          <Text style={styles.sectionTitle}>Próximos jogos</Text>
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhum jogo agendado nos seus times para este filtro. Encontre um jogo aberto ou organize o próximo encontro.</Text>
          </View>
        </>
      ) : upcoming.length > 1 ? (
        <View>
          <Text style={styles.sectionTitle}>Depois desse</Text>
          {upcoming.slice(1, 5).map((game) => <GameCard key={game.id} game={game} compact />)}
        </View>
      ) : null}

      {past.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Jogos anteriores</Text>
          {past.slice(0, 5).map((game) => (
            <GameCard key={game.id} game={game} />
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

function distanceToGame(date: string) {
  const diff = new Date(date).getTime() - Date.now();
  const days = Math.ceil(diff / 86_400_000);
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  return `Em ${days} dias`;
}

function performanceMessage(
  trend: ReturnType<typeof computeOverallTrend>,
  activity: ReturnType<typeof computePlayerActivitySummary>,
) {
  if (activity.noShows > 0) return `${activity.noShows} falta${activity.noShows > 1 ? 's' : ''} registrada${activity.noShows > 1 ? 's' : ''}. Recupere sua sequência.`;
  if (trend.direction === 'up' && trend.delta !== null) return `Você subiu ${trend.delta} ponto${trend.delta === 1 ? '' : 's'} nas avaliações recentes.`;
  if (activity.confirmedUpcoming > 0) return `Presença confirmada em ${activity.confirmedUpcoming} próximo${activity.confirmedUpcoming > 1 ? 's' : ''} jogo${activity.confirmedUpcoming > 1 ? 's' : ''}.`;
  return 'Entre em campo e receba avaliações para acompanhar sua evolução.';
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
  return (
    <Pressable style={[styles.teamShortcut, active && styles.teamShortcutActive]} onPress={() => router.push(`/time/${peladaId}`)}>
      <View style={[styles.teamShortcutBadge, { backgroundColor: `${sport.color}26` }]}>
        <Text style={styles.teamShortcutIcon}>{sport.icon}</Text>
      </View>
      <Text style={styles.teamShortcutName} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  welcomeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  brandEyebrow: { color: colors.primaryDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  welcomeTitle: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
  welcomeSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  profileButton: { padding: 2, borderRadius: radius.full, borderWidth: 2, borderColor: colors.primary },
  peladaHeader: {
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  peladaDescription: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.25,
  },
  sectionEyebrow: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 2 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.full, backgroundColor: '#E7F7CF' },
  datePillText: { color: colors.primaryDark, fontSize: 11, fontWeight: '900' },
  empty: {
    padding: spacing.lg,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  perfCard: {
    marginBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.infoSoft,
    borderColor: '#C8DAF7',
    padding: spacing.md,
  },
  performanceHero: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  overallBlock: { width: 66, minHeight: 66, borderRadius: radius.md, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  overallValue: { color: colors.white, fontSize: 27, lineHeight: 29, fontWeight: '900', letterSpacing: -0.8 },
  overallLabel: { color: '#D7E7FF', fontSize: 7, fontWeight: '900', letterSpacing: 0.6 },
  performanceCopy: { flex: 1, gap: 5 },
  performanceTitle: { color: colors.text, fontSize: 16, fontWeight: '900', letterSpacing: -0.2 },
  performanceMessage: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  quickActions: { gap: spacing.sm, marginTop: spacing.sm },
  nextGameSection: { marginBottom: 0 },
  exploreSection: { marginBottom: spacing.xl },
  growthCentral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
  },
  growthCentralIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.action,
  },
  quickActionCopy: { flex: 1 },
  growthCentralTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  quickActionDescription: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  proCentral: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.lg },
  proCentralIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.special },
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
    minHeight: 52,
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.64)',
  },
  perfStatValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  perfStatLabel: {
    color: colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
  },
  perfRecordText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  perfLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  perfLinkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  shortcutsSection: {
    marginBottom: spacing.md,
  },
  viewAllButton: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingLeft: 10 },
  viewAllText: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
  shortcutsRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  teamShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 150,
    minHeight: 58,
    padding: spacing.sm,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  teamShortcutActive: {
    borderColor: colors.primaryDark,
    backgroundColor: '#F6FFE8',
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
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  addTeamShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 108,
    minHeight: 58,
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
