import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { formatBRL } from '@/lib/payments';
import { useAppStore } from '@/store/useAppStore';
import type { PaymentMethod } from '@/types';

export default function FundraisingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlayerId = useAppStore((state) => state.currentPlayerId);
  const campaign = useAppStore((state) => state.fundraisingCampaigns.find((row) => row.id === id));
  const pelada = useAppStore((state) => state.peladas.find((row) => row.id === campaign?.peladaId));
  const players = useAppStore((state) => state.players);
  const memberships = useAppStore((state) => state.memberships);
  const contributions = useAppStore(useShallow((state) => state.fundraisingContributions.filter((row) => row.campaignId === id)));
  const expenses = useAppStore(useShallow((state) => state.fundraisingExpenses.filter((row) => row.campaignId === id)));
  const createContribution = useAppStore((state) => state.createFundraisingContribution);
  const confirmContribution = useAppStore((state) => state.confirmFundraisingContribution);
  const addExpense = useAppStore((state) => state.addFundraisingExpense);
  const closeCampaign = useAppStore((state) => state.closeFundraisingCampaign);
  const isAdmin = useAppStore((state) => campaign ? state.isAdmin(currentPlayerId, campaign.peladaId) : false);

  const [amount, setAmount] = useState(String(campaign?.suggestedAmount ?? ''));
  const [creditedPlayerId, setCreditedPlayerId] = useState(currentPlayerId);
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');

  if (!campaign || !pelada) return <Screen><Text style={styles.empty}>Vaquinha não encontrada.</Text></Screen>;

  const memberPlayers = memberships.filter((row) => row.peladaId === campaign.peladaId && row.active).map((row) => players.find((player) => player.id === row.playerId)).filter(Boolean);
  const paid = contributions.filter((row) => row.status === 'paid');
  const raised = paid.reduce((sum, row) => sum + row.amount, 0);
  const spent = expenses.reduce((sum, row) => sum + row.amount, 0);
  const pending = contributions.find((row) => row.id === pendingId);
  const progress = Math.min(100, raised / campaign.targetAmount * 100);

  function contribute() {
    if (!campaign) return;
    const contribution = createContribution(campaign.id, {
      paidByPlayerId: currentPlayerId, creditedPlayerId, amount: Number(amount), method,
      anonymous: campaign.allowAnonymous && anonymous, message: message.trim() || null,
    });
    if (contribution) {
      setPendingId(contribution.id);
      if (contribution.status === 'paid') { setAmount(String(campaign.suggestedAmount ?? '')); setMessage(''); }
    }
  }

  function confirmPending() {
    if (!pendingId || !campaign) return;
    confirmContribution(pendingId);
    setPendingId(null); setMessage(''); setAmount(String(campaign.suggestedAmount ?? ''));
  }

  function saveExpense() {
    if (!campaign) return;
    if (addExpense(campaign.id, expenseTitle, Number(expenseAmount), currentPlayerId)) { setExpenseTitle(''); setExpenseAmount(''); }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.title}>{campaign.title}</Text><Text style={styles.subtitle}>{pelada.name}</Text></View>
        <Badge label={campaign.status === 'active' ? 'Ativa' : campaign.status === 'funded' ? 'Meta atingida' : 'Encerrada'} color={campaign.status === 'funded' ? colors.gold : campaign.status === 'active' ? colors.primary : colors.textFaint} />
      </View>

      <Card style={styles.hero}>
        <Text style={styles.description}>{campaign.description ?? 'Objetivo coletivo do time.'}</Text>
        <View style={styles.progress}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
        <View style={styles.rowBetween}><View><Text style={styles.raised}>{formatBRL(raised)}</Text><Text style={styles.hint}>arrecadados</Text></View><View style={styles.alignRight}><Text style={styles.goal}>{formatBRL(campaign.targetAmount)}</Text><Text style={styles.hint}>meta</Text></View></View>
        <View style={styles.balance}><Text style={styles.balanceLabel}>Saldo após despesas</Text><Text style={styles.balanceValue}>{formatBRL(raised - spent)}</Text></View>
      </Card>

      {['active', 'funded'].includes(campaign.status) && (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Contribuir</Text>
          <TextField label="Valor (R$)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <Text style={styles.label}>Crédito da contribuição</Text>
          <Text style={styles.hint}>Você pode pagar por você ou registrar a contribuição em nome de outra pessoa.</Text>
          <View style={styles.people}>{memberPlayers.map((player) => player && <Pressable key={player.id} onPress={() => setCreditedPlayerId(player.id)} style={[styles.person, creditedPlayerId === player.id && styles.personActive]}><Avatar name={player.name} photoUrl={player.avatarUrl} size={28} /><Text style={styles.personText}>{player.id === currentPlayerId ? 'Eu' : player.name.split(' ')[0]}</Text></Pressable>)}</View>
          <Text style={styles.label}>Forma de pagamento</Text>
          <View style={styles.chips}>{(['pix', 'card', 'cash'] as PaymentMethod[]).map((item) => <Pressable key={item} onPress={() => setMethod(item)} style={[styles.chip, method === item && styles.chipActive]}><Text style={styles.chipText}>{item === 'pix' ? 'Pix' : item === 'card' ? 'Cartão' : 'Dinheiro'}</Text></Pressable>)}</View>
          <TextField label="Mensagem (opcional)" value={message} onChangeText={setMessage} placeholder="Ex.: vamos comprar uma bola boa!" />
          {campaign.allowAnonymous && <View style={styles.rowBetween}><Text style={styles.label}>Mostrar como anônimo</Text><Switch value={anonymous} onValueChange={setAnonymous} trackColor={{ true: colors.primary }} /></View>}
          <Button label={method === 'cash' ? 'Registrar contribuição' : 'Gerar cobrança'} onPress={contribute} disabled={Number(amount) <= 0} />
          {pending && (
            <View style={styles.paymentBox}>
              <Text style={styles.paymentTitle}>Cobrança criada · {formatBRL(pending.amount)}</Text>
              <Text style={styles.code}>{pending.pixCopyPaste ?? pending.checkoutUrl}</Text>
              <Text style={styles.hint}>Na produção, o webhook do gateway confirma o pagamento. O botão abaixo existe só na demonstração.</Text>
              <Button label="Simular pagamento aprovado" small onPress={confirmPending} />
            </View>
          )}
        </Card>
      )}

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Quem contribuiu</Text>
        {paid.map((row) => {
          const player = players.find((item) => item.id === row.creditedPlayerId);
          return <View key={row.id} style={styles.listRow}><Avatar name={player?.name ?? 'Anônimo'} photoUrl={row.anonymous ? null : player?.avatarUrl} size={36} /><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{row.anonymous ? 'Anônimo' : player?.name}</Text><Text style={styles.hint}>{row.message ?? (row.paidByPlayerId !== row.creditedPlayerId ? 'Pago por outra pessoa' : 'Contribuição confirmada')}</Text></View><Text style={styles.money}>{formatBRL(row.amount)}</Text></View>;
        })}
        {paid.length === 0 && <Text style={styles.empty}>Seja a primeira pessoa a contribuir.</Text>}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Prestação de contas</Text>
        {expenses.map((row) => <View key={row.id} style={styles.listRow}><Ionicons name="receipt-outline" size={20} color={colors.textMuted} /><Text style={[styles.rowTitle, { flex: 1 }]}>{row.title}</Text><Text style={styles.expense}>− {formatBRL(row.amount)}</Text></View>)}
        {expenses.length === 0 && <Text style={styles.hint}>Nenhuma despesa registrada.</Text>}
        {isAdmin && (
          <View style={styles.expenseForm}>
            <TextField label="Despesa" value={expenseTitle} onChangeText={setExpenseTitle} placeholder="Ex.: Bola Penalty" />
            <TextField label="Valor (R$)" value={expenseAmount} onChangeText={setExpenseAmount} keyboardType="decimal-pad" />
            <Button label="Adicionar comprovante/despesa" small variant="outline" onPress={saveExpense} disabled={!expenseTitle.trim() || Number(expenseAmount) <= 0} />
          </View>
        )}
      </Card>

      {isAdmin && campaign.status !== 'closed' && <Button label="Encerrar vaquinha" variant="danger" onPress={() => closeCampaign(campaign.id)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' }, subtitle: { color: colors.textMuted, fontSize: 12 },
  hero: { gap: spacing.md, marginBottom: spacing.lg }, description: { color: colors.text, fontSize: 14, lineHeight: 20 },
  progress: { height: 12, backgroundColor: colors.bgElevated, borderRadius: 99, overflow: 'hidden' }, progressFill: { height: 12, backgroundColor: colors.primary },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }, alignRight: { alignItems: 'flex-end' },
  raised: { color: colors.primary, fontSize: 24, fontWeight: '900' }, goal: { color: colors.text, fontSize: 18, fontWeight: '800' }, hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  balance: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.bgElevated, padding: spacing.md, borderRadius: 12 }, balanceLabel: { color: colors.textMuted, fontWeight: '700' }, balanceValue: { color: colors.gold, fontWeight: '900' },
  card: { gap: spacing.md, marginBottom: spacing.lg }, sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' }, label: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, person: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 999, padding: 4, paddingRight: 10 }, personActive: { borderColor: colors.primary, backgroundColor: 'rgba(157,235,34,0.1)' }, personText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: spacing.sm }, chip: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 999, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }, chipActive: { borderColor: colors.primary, backgroundColor: 'rgba(157,235,34,0.1)' }, chipText: { color: colors.text, fontWeight: '700' },
  paymentBox: { gap: spacing.sm, backgroundColor: 'rgba(157,235,34,0.08)', borderRadius: 12, padding: spacing.md }, paymentTitle: { color: colors.primary, fontWeight: '900' }, code: { color: colors.text, fontSize: 11 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: spacing.md }, rowTitle: { color: colors.text, fontSize: 13, fontWeight: '700' }, money: { color: colors.primary, fontWeight: '900' }, expense: { color: colors.danger, fontWeight: '800' }, expenseForm: { borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: spacing.md },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },
});
