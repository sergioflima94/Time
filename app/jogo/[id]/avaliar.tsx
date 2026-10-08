import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { StarRating } from '@/components/ui/StarRating';
import { colors, spacing } from '@/constants/theme';
import { BANTER_BADGES } from '@/lib/banter';
import { useAppStore } from '@/store/useAppStore';
import type { BanterBadgeType } from '@/types';

interface DraftScore {
  attack: number;
  defense: number;
  pace: number;
}

export default function AvaliarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const players = useAppStore((s) => s.players);
  const attendances = useAppStore(useShallow((s) => s.attendances.filter((a) => a.gameId === id)));
  const ratings = useAppStore(
    useShallow((s) => s.ratings.filter((r) => r.gameId === id && r.raterPlayerId === currentPlayerId)),
  );
  const submitRating = useAppStore((s) => s.submitRating);
  const banterVotes = useAppStore(
    useShallow((s) => s.banterVotes.filter((vote) => vote.gameId === id && vote.voterPlayerId === currentPlayerId)),
  );
  const setBanterVotesForTarget = useAppStore((s) => s.setBanterVotesForTarget);

  const toRate = attendances.filter(
    (a) => a.status === 'confirmed' && !a.noShow && a.playerId !== currentPlayerId,
  );

  const [scores, setScores] = useState<Record<string, DraftScore>>(() =>
    Object.fromEntries(
      toRate.map((a) => {
        const existing = ratings.find((r) => r.ratedPlayerId === a.playerId);
        return [a.playerId, { attack: existing?.attack ?? 3, defense: existing?.defense ?? 3, pace: existing?.pace ?? 3 }];
      }),
    ),
  );
  const [banter, setBanter] = useState<Record<string, BanterBadgeType[]>>(() =>
    Object.fromEntries(
      toRate.map((attendance) => [
        attendance.playerId,
        banterVotes.filter((vote) => vote.targetPlayerId === attendance.playerId).map((vote) => vote.badge),
      ]),
    ),
  );

  function updateScore(playerId: string, key: keyof DraftScore, value: number) {
    setScores((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [key]: value } }));
  }

  function toggleBanter(playerId: string, badge: BanterBadgeType) {
    setBanter((previous) => {
      const selected = previous[playerId] ?? [];
      return {
        ...previous,
        [playerId]: selected.includes(badge) ? selected.filter((value) => value !== badge) : [...selected, badge],
      };
    });
  }

  function handleSubmit() {
    if (!id) return;
    for (const playerId of Object.keys(scores)) {
      const s = scores[playerId];
      submitRating({ gameId: id, raterPlayerId: currentPlayerId, ratedPlayerId: playerId, ...s });
      const target = players.find((player) => player.id === playerId);
      if (target?.banterOptIn) setBanterVotesForTarget(id, currentPlayerId, playerId, banter[playerId] ?? []);
    }
    router.back();
  }

  if (toRate.length === 0) {
    return (
      <Screen>
        <Text style={styles.empty}>Não há jogadores para avaliar neste jogo.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.subtitle}>Dê uma nota de 1 a 5 em cada critério para quem jogou com você.</Text>
      <Card style={styles.banterIntro}>
        <Text style={styles.banterIntroTitle}>😄 Modo Resenha</Text>
        <Text style={styles.banterIntroText}>Opcional e anônimo: os selos duram 30 dias, só aparecem para colegas de time e nunca alteram a nota geral.</Text>
      </Card>
      {toRate.map((a) => {
        const player = players.find((p) => p.id === a.playerId)!;
        const s = scores[a.playerId];
        return (
          <Card key={a.playerId} style={styles.card}>
            <View style={styles.header}>
              <Avatar name={player.name} photoUrl={player.avatarUrl} size={36} />
              <Text style={styles.name}>{player.nickname || player.name}</Text>
            </View>
            <StarRating label="Ataque" value={s.attack} onChange={(v) => updateScore(a.playerId, 'attack', v)} />
            <StarRating label="Defesa" value={s.defense} onChange={(v) => updateScore(a.playerId, 'defense', v)} />
            <StarRating label="Velocidade" value={s.pace} onChange={(v) => updateScore(a.playerId, 'pace', v)} />
            {player.banterOptIn ? (
              <View style={styles.banterSection}>
                <Text style={styles.banterLabel}>Resenha do jogo (opcional)</Text>
                <View style={styles.banterChips}>
                  {BANTER_BADGES.map((badge) => {
                    const active = (banter[a.playerId] ?? []).includes(badge.id);
                    return (
                      <Pressable
                        key={badge.id}
                        onPress={() => toggleBanter(a.playerId, badge.id)}
                        style={[styles.banterChip, active && { borderColor: badge.color, backgroundColor: `${badge.color}22` }]}
                      >
                        <Text style={styles.banterChipText}>{badge.icon} {badge.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <Text style={styles.banterOff}>Modo Resenha desativado por este jogador.</Text>
            )}
          </Card>
        );
      })}
      <Button label="Salvar avaliações" onPress={handleSubmit} style={{ marginTop: spacing.sm }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.lg,
  },
  card: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  banterIntro: { marginBottom: spacing.md, borderColor: '#F59E0B' },
  banterIntroTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  banterIntroText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  banterSection: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.cardBorder, gap: spacing.xs },
  banterLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  banterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  banterChip: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 9, backgroundColor: colors.bgElevated },
  banterChipText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  banterOff: { color: colors.textFaint, fontSize: 11, marginTop: spacing.sm, fontStyle: 'italic' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  name: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
