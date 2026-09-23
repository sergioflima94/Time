import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport, scoreLabel } from '@/constants/sports';
import { computeStandings, computeTopScorers, formatChampionshipStatus } from '@/lib/championship';
import { formatBRL } from '@/lib/payments';
import { useAppStore } from '@/store/useAppStore';
import type { ChampionshipMatch } from '@/types';

export default function ChampionshipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const championship = useAppStore((s) => s.championships.find((c) => c.id === id));
  const establishment = useAppStore((s) => s.establishments.find((e) => e.id === championship?.establishmentId));
  const isAdmin = useAppStore((s) => s.isAdmin);
  const teams = useAppStore(useShallow((s) => s.championshipTeams.filter((t) => t.championshipId === id && t.status === 'confirmed')));
  const teamPlayers = useAppStore(useShallow((s) => s.championshipTeamPlayers.filter((tp) => teams.some((t) => t.id === tp.championshipTeamId))));
  const matches = useAppStore(useShallow((s) => s.championshipMatches.filter((m) => m.championshipId === id)));
  const goals = useAppStore(useShallow((s) => s.championshipGoals.filter((g) => matches.some((m) => m.id === g.matchId))));
  const players = useAppStore((s) => s.players);
  const generateChampionshipFixtures = useAppStore((s) => s.generateChampionshipFixtures);

  if (!championship) {
    return (
      <Screen>
        <Text style={styles.notFound}>Campeonato não encontrado.</Text>
      </Screen>
    );
  }

  const sport = getSport(championship.sportId);
  const isOrganizer = championship.establishmentId
    ? establishment?.ownerPlayerId === currentPlayerId
    : championship.organizerPeladaId
      ? isAdmin(currentPlayerId, championship.organizerPeladaId)
      : false;
  const teamName = (teamId: string | null) => teams.find((t) => t.id === teamId)?.name ?? '?';
  const teamColor = (teamId: string | null) => teams.find((t) => t.id === teamId)?.color ?? colors.textFaint;
  const rosterCount = (teamId: string) => teamPlayers.filter((tp) => tp.championshipTeamId === teamId).length;

  const standings = championship.format === 'round_robin' ? computeStandings(teams, matches, goals) : [];
  const topScorers = computeTopScorers(goals).slice(0, 3);
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);

  async function handleShare() {
    try {
      await Share.share({
        message: `Inscreva seu time na "${championship!.name}"! No app Pelada, use o código: ${championship!.registrationCode}`,
      });
    } catch {
      /* cancelou */
    }
  }

  function matchScore(match: ChampionshipMatch) {
    if (match.status !== 'finished') return null;
    const goalsA = goals.filter((g) => g.matchId === match.id && g.teamId === match.teamAId).length;
    const goalsB = goals.filter((g) => g.matchId === match.id && g.teamId === match.teamBId).length;
    return `${goalsA} x ${goalsB}`;
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{sport.icon} {championship.name}</Text>
          <Text style={styles.subtitle}>{sport.label} · {championship.format === 'round_robin' ? 'Pontos corridos' : 'Mata-mata'}</Text>
        </View>
        <Badge label={formatChampionshipStatus(championship.status)} color={championship.status === 'registration' ? colors.secondary : colors.primary} />
      </View>

      {championship.entryFee && (
        <Text style={styles.entryFee}>Taxa de inscrição: {formatBRL(championship.entryFee)} por time</Text>
      )}

      {championship.status === 'registration' && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Inscrições abertas</Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{championship.registrationCode}</Text>
          </View>
          <View style={styles.rowGap}>
            {isOrganizer && <Button label="Compartilhar código" variant="secondary" small onPress={handleShare} />}
            <Button label="Inscrever um time" small onPress={() => router.push(`/campeonato/${championship.id}/inscrever-time`)} />
          </View>
          {isOrganizer && teams.length >= 2 && (
            <Button label={`Gerar tabela de jogos (${teams.length} times)`} onPress={() => generateChampionshipFixtures(championship.id)} />
          )}
          {isOrganizer && teams.length < 2 && (
            <Text style={styles.hint}>Precisa de pelo menos 2 times inscritos pra gerar os jogos.</Text>
          )}
        </Card>
      )}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Times ({teams.length})</Text>
        {teams.map((t) => (
          <View key={t.id} style={styles.teamRow}>
            {t.logoUrl ? (
              <Image source={{ uri: t.logoUrl }} style={styles.teamLogo} contentFit="cover" />
            ) : (
              <View style={[styles.teamDot, { backgroundColor: t.color }]} />
            )}
            <Text style={styles.teamRowName}>{t.name}</Text>
            <Text style={styles.hint}>{rosterCount(t.id)} jogadores</Text>
            {!t.peladaId && <Badge label="Avulso" color={colors.textFaint} textColor={colors.text} />}
          </View>
        ))}
        {teams.length === 0 && <Text style={styles.hint}>Nenhum time inscrito ainda.</Text>}
      </Card>

      {standings.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Classificação</Text>
          <View style={styles.standingsHeader}>
            <Text style={[styles.standingsCell, styles.standingsTeamCol]}>Time</Text>
            <Text style={styles.standingsCell}>P</Text>
            <Text style={styles.standingsCell}>J</Text>
            <Text style={styles.standingsCell}>V</Text>
            <Text style={styles.standingsCell}>E</Text>
            <Text style={styles.standingsCell}>D</Text>
            <Text style={styles.standingsCell}>{sport.hasGoalkeeper ? 'SG' : 'SP'}</Text>
          </View>
          {standings.map((row, idx) => (
            <View key={row.team.id} style={styles.standingsRow}>
              <Text style={[styles.standingsCell, styles.standingsTeamCol, styles.standingsTeamName]} numberOfLines={1}>
                {idx + 1}. {row.team.name}
              </Text>
              <Text style={[styles.standingsCell, styles.standingsPoints]}>{row.points}</Text>
              <Text style={styles.standingsCell}>{row.played}</Text>
              <Text style={styles.standingsCell}>{row.wins}</Text>
              <Text style={styles.standingsCell}>{row.draws}</Text>
              <Text style={styles.standingsCell}>{row.losses}</Text>
              <Text style={styles.standingsCell}>{row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}</Text>
            </View>
          ))}
        </Card>
      )}

      {topScorers.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>{sport.hasGoalkeeper ? 'Artilharia' : 'Maiores pontuadores'}</Text>
          {topScorers.map((row, idx) => {
            const player = players.find((p) => p.id === row.playerId);
            return (
              <View key={row.playerId} style={styles.scorerRow}>
                <Avatar name={player?.name ?? '?'} photoUrl={player?.avatarUrl} size={28} />
                <Text style={styles.scorerName}>{idx + 1}. {player?.name}</Text>
                <Text style={styles.hint}>{sport.icon} {row.goals} {scoreLabel(sport.id, row.goals)}</Text>
              </View>
            );
          })}
        </Card>
      )}

      {rounds.map((round) => {
        const roundMatches = matches.filter((m) => m.round === round);
        return (
          <Card key={round} style={styles.section}>
            <Text style={styles.sectionTitle}>{roundMatches[0]?.roundLabel ?? `Rodada ${round}`}</Text>
            {roundMatches.map((m) => {
              const score = matchScore(m);
              const clickable = m.teamAId && m.teamBId && m.status !== 'finished';
              return (
                <Pressable
                  key={m.id}
                  style={styles.matchRow}
                  disabled={!clickable}
                  onPress={() => router.push(`/campeonato/${championship.id}/partida/${m.id}`)}
                >
                  <Text style={[styles.matchTeam, { color: m.teamAId ? teamColor(m.teamAId) : colors.textFaint }]} numberOfLines={1}>
                    {m.teamAId ? teamName(m.teamAId) : 'A definir'}
                  </Text>
                  <Text style={styles.matchScore}>{score ?? (clickable ? '▶' : 'vs')}</Text>
                  <Text style={[styles.matchTeam, styles.matchTeamRight, { color: m.teamBId ? teamColor(m.teamBId) : colors.textFaint }]} numberOfLines={1}>
                    {m.teamBId ? teamName(m.teamBId) : 'A definir'}
                  </Text>
                </Pressable>
              );
            })}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notFound: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  entryFee: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
  },
  codeBox: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  codeText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  rowGap: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  teamDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  teamLogo: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
  },
  teamRowName: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  standingsHeader: {
    flexDirection: 'row',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  standingsRow: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  standingsCell: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  standingsTeamCol: {
    flex: 3,
    textAlign: 'left',
  },
  standingsTeamName: {
    color: colors.text,
    fontWeight: '600',
  },
  standingsPoints: {
    color: colors.primary,
    fontWeight: '800',
  },
  scorerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  scorerName: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  matchTeam: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  matchTeamRight: {
    textAlign: 'right',
  },
  matchScore: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: spacing.sm,
  },
});
