import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { EstablishmentSwitcher } from '@/components/EstablishmentSwitcher';
import { FieldDirectoryEditor } from '@/components/FieldDirectoryEditor';
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
  const updateEstablishmentWhatsApp = useAppStore((s) => s.updateEstablishmentWhatsApp);
  const updateBookingPolicy = useAppStore((s) => s.updateEstablishmentBookingPolicy);

  const allFields = useAppStore((s) => s.fields);
  const fields = useAppStore(useShallow((s) => s.fields.filter((f) => f.establishmentId === id)));
  const bookings = useAppStore(useShallow((s) => s.fieldBookings.filter((b) => b.establishmentId === id)));
  const allChampionships = useAppStore((s) => s.championships);
  const championships = useAppStore(useShallow((s) => s.championships.filter((c) => c.establishmentId === id)));
  const games = useAppStore((s) => s.games);
  const attendances = useAppStore((s) => s.attendances);
  const payments = useAppStore((s) => s.payments);
  const championshipTeams = useAppStore((s) => s.championshipTeams);
  const serviceTabs = useAppStore(useShallow((s) => s.serviceTabs.filter((tab) => tab.establishmentId === id)));
  const classPrograms = useAppStore(useShallow((s) => s.classPrograms.filter((program) => program.establishmentId === id)));
  const gatewayConnection = useAppStore((s) => s.paymentGatewayConnections.find((row) => row.establishmentId === id && row.status === 'connected'));

  const [editing, setEditing] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [name, setName] = useState(establishment?.name ?? '');
  const [payoutMethod, setPayoutMethod] = useState<EstablishmentPayoutMethod>(establishment?.payoutMethod ?? 'pix');
  const [pixKey, setPixKey] = useState(establishment?.pixKey ?? '');
  const [whatsappPhone, setWhatsappPhone] = useState(establishment?.whatsappPhone ?? '');
  const [whatsappOptIn, setWhatsappOptIn] = useState(establishment?.whatsappOptIn ?? false);
  const [messagingProvider, setMessagingProvider] = useState<'automatic' | 'evolution_go' | 'meta_cloud'>(establishment?.messagingProvider ?? 'automatic');
  const [depositPercent, setDepositPercent] = useState(String(establishment?.reservationDepositPercent ?? 0));
  const [refundHours, setRefundHours] = useState(String(establishment?.cancellationRefundHours ?? 24));
  const [refundPercent, setRefundPercent] = useState(String(establishment?.cancellationRefundPercent ?? 100));

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
        message: `Cadastra o campo "${establishment!.name}" no seu time! No MarcouJogou, em Admin → Campos, use o código: ${establishment!.accessCode}`,
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
        <NavCard icon="link" label="Página pública" sub="Marcar jogo sem conta" onPress={() => router.push(`/estabelecimento/${establishment.id}/publico`)} />
        <NavCard icon="receipt" label="Comandas" sub={`${serviceTabs.filter((tab) => !['closed', 'cancelled'].includes(tab.status)).length} abertas`} onPress={() => router.push({ pathname: '/operacao/comandas', params: { establishmentId: establishment.id } })} />
        <NavCard icon="restaurant" label="Cozinha e bar" sub="Fila de produção" onPress={() => router.push({ pathname: '/operacao/cozinha', params: { establishmentId: establishment.id } })} />
        <NavCard icon="fast-food" label="Cardápio" sub="Produtos e estoque" onPress={() => router.push({ pathname: '/operacao/cardapio', params: { establishmentId: establishment.id } })} />
        <NavCard icon="school" label="Aulas" sub={`${classPrograms.length} programas`} onPress={() => router.push({ pathname: '/operacao/aulas', params: { establishmentId: establishment.id } })} />
        <NavCard icon="wallet" label="Caixa integrado" sub="Quadras, consumo e aulas" onPress={() => router.push({ pathname: '/operacao/caixa', params: { establishmentId: establishment.id } })} />
        <NavCard icon="card" label="Pagamentos" sub={gatewayConnection ? 'Gateway conectado' : 'Escolher gateway'} onPress={() => router.push(`/estabelecimento/${establishment.id}/pagamentos`)} />
        <NavCard icon="time" label="Horários de oportunidade" sub="Desconto real e pedidos" onPress={()=>router.push({pathname:'/bora',params:{establishmentId:establishment.id}})} />
        <NavCard icon="location" label="Aparecer nos campos próximos" sub="Ficha pública e contato" onPress={()=>setDirectoryOpen(!directoryOpen)} />
        <NavCard icon="megaphone" label="Divulgação" sub="Patrocínio e conversão" onPress={() => router.push(`/estabelecimento/${establishment.id}/promocoes`)} />
      </View>
      {directoryOpen && <FieldDirectoryEditor establishmentId={establishment.id} />}

      <Card style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Reservas por WhatsApp</Text>
            <Text style={styles.textMuted}>Receba pedidos automáticos quando um time atingir o mínimo de jogadores.</Text>
          </View>
          <Switch value={whatsappOptIn} onValueChange={setWhatsappOptIn} trackColor={{ true: '#25D366' }} />
        </View>
        <TextField label="WhatsApp comercial" value={whatsappPhone} onChangeText={setWhatsappPhone} placeholder="(11) 99999-9999" keyboardType="phone-pad" />
        <Button
          label="Salvar WhatsApp"
          variant="outline"
          onPress={() => {
            updateEstablishmentWhatsApp(establishment.id, whatsappPhone, whatsappOptIn);
            updateBookingPolicy(establishment.id, { depositPercent: Number(depositPercent) || 0, refundHours: Number(refundHours) || 0, refundPercent: Number(refundPercent) || 0, messagingProvider });
          }}
        />
        <SegmentedControl<'automatic' | 'evolution_go' | 'meta_cloud'>
          label="Provedor de mensagens"
          options={[{ value: 'automatic', label: 'Automático' }, { value: 'evolution_go', label: 'Evolution' }, { value: 'meta_cloud', label: 'Meta Cloud' }]}
          value={messagingProvider}
          onChange={setMessagingProvider}
        />
        <View style={styles.policyRow}>
          <View style={{ flex: 1 }}><TextField label="Sinal da reserva (%)" value={depositPercent} onChangeText={setDepositPercent} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><TextField label="Reembolso até (h)" value={refundHours} onChangeText={setRefundHours} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><TextField label="Reembolso (%)" value={refundPercent} onChangeText={setRefundPercent} keyboardType="number-pad" /></View>
        </View>
        <Text style={styles.textMuted}>Respostas aceitas: SIM CÓDIGO ou NÃO CÓDIGO. A chave da Evolution Go fica somente no backend.</Text>
        <Text style={styles.providerNotice}>Integração de mensageria fornecida por Evolution Go.</Text>
      </Card>

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
  textMuted: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  providerNotice: {
    color: colors.textFaint,
    fontSize: 10,
    textAlign: 'center',
  },
  policyRow: { flexDirection: 'row', gap: spacing.sm },
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
