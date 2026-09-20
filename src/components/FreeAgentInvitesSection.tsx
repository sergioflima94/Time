import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import { formatGameDateLong } from '@/lib/format';
import { useAppStore } from '@/store/useAppStore';

export function FreeAgentInvitesSection({ playerId }: { playerId: string }) {
  const invites = useAppStore(
    useShallow((s) => s.freeAgentInvites.filter((i) => i.playerId === playerId && i.status === 'pending')),
  );
  const games = useAppStore((s) => s.games);
  const peladas = useAppStore((s) => s.peladas);
  const fields = useAppStore((s) => s.fields);
  const respondFreeAgentInvite = useAppStore((s) => s.respondFreeAgentInvite);

  if (invites.length === 0) return null;

  return (
    <Card style={styles.section}>
      <Text style={styles.sectionTitle}>Convites pra jogar</Text>
      <Text style={styles.hint}>Outras peladas perto de você estão chamando pra fechar o time.</Text>
      {invites.map((invite) => {
        const game = games.find((g) => g.id === invite.gameId);
        const pelada = peladas.find((p) => p.id === invite.peladaId);
        const field = fields.find((f) => f.id === game?.fieldId);
        if (!game || !pelada) return null;
        return (
          <View key={invite.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.peladaName}>{pelada.name}</Text>
              <Text style={styles.gameInfo}>
                {formatGameDateLong(game.scheduledAt)} · {field?.name ?? 'Local a definir'}
              </Text>
            </View>
            <View style={styles.actions}>
              <Button label="Topo" small onPress={() => respondFreeAgentInvite(invite.id, true)} />
              <Button label="Não vou" small variant="secondary" onPress={() => respondFreeAgentInvite(invite.id, false)} />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
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
    marginTop: -4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  peladaName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  gameInfo: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    gap: 6,
  },
});
