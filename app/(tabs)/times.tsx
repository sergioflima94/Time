import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { useMyPeladas } from '@/hooks/useCurrentPelada';
import { useAppStore } from '@/store/useAppStore';
import type { Pelada } from '@/types';

export default function TimesScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const myPeladas = useMyPeladas();
  const myMemberships = useAppStore(
    useShallow((s) => s.memberships.filter((m) => m.playerId === currentPlayerId && m.active)),
  );
  const allMemberships = useAppStore((s) => s.memberships);

  const roleOf = (peladaId: string) => myMemberships.find((m) => m.peladaId === peladaId)?.role;
  const owned = myPeladas.filter((p) => roleOf(p.id) === 'admin');
  const participating = myPeladas.filter((p) => roleOf(p.id) !== 'admin');

  function memberCount(peladaId: string) {
    return allMemberships.filter((m) => m.peladaId === peladaId && m.active).length;
  }

  return (
    <Screen>
      <Text style={styles.title}>Times</Text>
      <Text style={styles.subtitle}>Os times que você é dono e os que você participa.</Text>

      {owned.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Você é dono ({owned.length})</Text>
          {owned.map((p) => (
            <TeamRow key={p.id} pelada={p} memberCount={memberCount(p.id)} isOwner />
          ))}
        </View>
      )}

      {participating.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Você participa ({participating.length})</Text>
          {participating.map((p) => (
            <TeamRow key={p.id} pelada={p} memberCount={memberCount(p.id)} />
          ))}
        </View>
      )}

      {myPeladas.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="shirt-outline" size={32} color={colors.textFaint} />
          <Text style={styles.emptyText}>Você ainda não faz parte de nenhum time.</Text>
        </View>
      )}

      <View style={styles.actionsRow}>
        <Pressable style={styles.actionLink} onPress={() => router.push('/entrar-pelada')}>
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={styles.actionLinkText}>Entrar em outro time</Text>
        </Pressable>
        <Pressable style={styles.actionLink} onPress={() => router.push('/criar-pelada')}>
          <Ionicons name="add-circle" size={16} color={colors.primary} />
          <Text style={styles.actionLinkText}>Criar um time novo</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function TeamRow({ pelada, memberCount, isOwner }: { pelada: Pelada; memberCount: number; isOwner?: boolean }) {
  const sport = getSport(pelada.sportId);
  return (
    <Pressable onPress={() => router.push(`/time/${pelada.id}`)}>
      <Card style={styles.teamRow}>
        <View style={[styles.sportBadge, { backgroundColor: `${sport.color}26` }]}>
          <Text style={styles.sportBadgeIcon}>{sport.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.teamName} numberOfLines={1}>
            {pelada.name}
          </Text>
          <Text style={styles.teamSub}>
            {sport.label} · {memberCount} jogador{memberCount === 1 ? '' : 'es'}
            {isOwner ? ' · você é admin' : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  group: {
    marginBottom: spacing.lg,
  },
  groupTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  sportBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sportBadgeIcon: {
    fontSize: 18,
  },
  teamName: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  teamSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  actionsRow: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  actionLinkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
