import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { EstablishmentSwitcher } from '@/components/EstablishmentSwitcher';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { computeEstablishmentFinancials } from '@/lib/establishmentFinance';
import { formatBRL } from '@/lib/payments';
import { useAppStore } from '@/store/useAppStore';
import type { EstablishmentPayoutMethod } from '@/types';

export default function EstablishmentDashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const establishment = useAppStore((s) => s.establishments.find((e) => e.id === id));
  const myEstablishments = useAppStore(
    useShallow((s) => s.establishments.filter((e) => e.ownerPlayerId === currentPlayerId)),
  );
  const updateEstablishment = useAppStore((s) => s.updateEstablishment);

  const allFields = useAppStore((s) => s.fields);
  const fields = useAppStore(useShallow((s) => s.fields.filter((f) => f.establishmentId === id)));
  const bookings = useAppStore(useShallow((s) => s.fieldBookings.filter((b) => b.establishmentId === id)));
  const allChampionships = useAppStore((s) => s.championships);
  const championships = useAppStore(useShallow((s) => s.championships.filter((c) => c.establishmentId === id)));
  const games = useAppStore((s) => s.games);
  const attendances = useAppStore((s) => s.attendances);
  const payments = useAppStore((s) => s.payments);
  const championshipTeams = useAppStore((s) => s.championshipTeams);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(establishment?.name ?? '');
  const [payoutMethod, setPayoutMethod] = useState<EstablishmentPayoutMethod>(establishment?.payoutMethod ?? 'pix');
  const [pixKey, setPixKey] = useState(establishment?.pixKey ?? '');

  if (!establishment) {
    return (
      <Screen>
        <Text style={styles.text}>Estabelecimento não encontrado.</Text>
      </Screen>
    );
  }

  if (establishment.ownerPlayerId !== currentPlayerId) {
    return (
      <Screen>
        <Text style={styles.text}>Você não é dono deste estabelecimento.</Text>
      </Screen>
    );
  }

  const { summary } = computeEstablishmentFinancials({
    establishmentId: establishment.id,
    fields: allFields,
    games,
    attendances,
    payments,
    championships: allChampionships,
    championshipTeams,
  });

  function handleSave() {
    if (!name.trim() || !establishment) return;
    updateEstablishment(establishment.id, {
      name: name.trim(),
      payoutMethod,
      pixKey: payoutMethod === 'pix' ? pixKey.trim() || null : null,
    });
    setEditing(false);
  }

  async function handleShare() {
    try {
      await Share.share({
        message: `Cadastra o campo "${establishment!.name}" na sua pelada! No app Pelada, em Admin → Campos, use o código: ${establishment!.accessCode}`,
      });
    } catch {
      /* usuário cancelou */
    }
  }

  async function handleSharePublicPage() {
    try {
      await Share.share({
        message: `Marque um jogo na "${establishment!.name}" direto por aqui, sem precisar já ter conta: pelada://estabelecimento/publico/${establishment!.id}`,
      });
    } catch {
      /* usuário cancelou */
    }
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.push('/estabelecimento')} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <EstablishmentSwitcher current={establishment} all={myEstablishments} />
        </View>
      </View>

      <View style={styles.statsRow}>
        <Stat label="Campos" value={String(fields.length)} />
        <Stat label="Agendados" value={String(bookings.length)} />
        <Stat label="Campeonatos" value={String(championships.length)} />
        <Stat label="Recebido" value={formatBRL(summary.total)} highlight />
      </View>

      <View style={styles.navGrid}>
        <NavCard icon="football" label="Campos" sub={`${fields.length} cadastrados`} onPress={() => router.push(`/estabelecimento/${establishment.id}/campos`)} />
        <NavCard icon="calendar" label="Agendamento" sub={`${bookings.length} reservas`} onPress={() => router.push(`/estabelecimento/${establishment.id}/agendamento`)} />
        <NavCard icon="trophy" label="Campeonatos" sub={`${championships.length} criados`} onPress={() => router.push(`/estabelecimento/${establishment.id}/campeonatos`)} />
        <NavCard icon="stats-chart" label="Financeiro" sub={formatBRL(summary.total)} onPress={() => router.push(`/estabelecimento/${establishment.id}/financeiro`)} />
      </View>

      <Card style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Dados do estabelecimento</Text>
          {!editing && (
            <Pressable onPress={() => setEditing(true)}>
              <Text style={styles.editLink}>Editar</Text>
            </Pressable>
          )}
        </View>

        {editing ? (
          <>
            <TextField label="Nome" value={name} onChangeText={setName} placeholder="Arena Society Central" />
            <SegmentedControl<EstablishmentPayoutMethod>
              label="Como você quer receber o rateio"
              options={[
                { value: 'pix', label: 'Pix' },
                { value: 'in_person', label: 'Combinar na hora' },
              ]}
              value={payoutMethod}
              onChange={setPayoutMethod}
            />
            {payoutMethod === 'pix' && (
              <TextField label="Chave Pix" value={pixKey} onChangeText={setPixKey} placeholder="seu@pix.com ou CPF/telefone" />
            )}
            <View style={styles.editActions}>
              <Button label="Salvar" small onPress={handleSave} disabled={!name.trim()} />
              <Button label="Cancelar" small variant="ghost" onPress={() => setEditing(false)} />
            </View>
          </>
        ) : (
          establishment.payoutMethod === 'pix' && (
            <Badge label={`Recebe via Pix · ${establishment.pixKey}`} color={colors.primary} />
          )
        )}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Página pública</Text>
        <Text style={styles.hint}>
          Qualquer pessoa com o link marca um jogo direto num dos seus campos — sem precisar já
          ter conta no app nem fazer parte de nenhuma pelada. O próprio formulário já cria o
          perfil dela.
        </Text>
        <View style={styles.editActions}>
          <Button
            label="Abrir página pública"
            small
            variant="secondary"
            onPress={() => router.push(`/estabelecimento/publico/${establishment.id}`)}
          />
          <Button label="Compartilhar link" small onPress={handleSharePublicPage} />
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Vincular campos de uma pelada</Text>
        <Text style={styles.hint}>
          Compartilhe esse código com o admin de uma pelada — ele usa em Admin → Campos pra
          vincular o campo de lá a este estabelecimento.
        </Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeText}>{establishment.accessCode}</Text>
        </View>
        <Button label="Compartilhar código" variant="secondary" onPress={handleShare} />
      </Card>
    </Screen>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, highlight && { color: colors.special }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function NavCard({
  icon,
  label,
  sub,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.navCard} onPress={onPress}>
      <Ionicons name={icon} size={22} color={colors.special} />
      <Text style={styles.navCardLabel}>{label}</Text>
      <Text style={styles.navCardSub} numberOfLines={1}>
        {sub}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  stat: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  navGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  navCard: {
    width: '47%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  navCardLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  navCardSub: {
    color: colors.textMuted,
    fontSize: 12,
  },
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editLink: {
    color: colors.special,
    fontSize: 13,
    fontWeight: '700',
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
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
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
