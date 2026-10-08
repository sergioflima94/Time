import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { formatBRL } from '@/lib/payments';
import { useAppStore } from '@/store/useAppStore';
import type { FundraisingCategory } from '@/types';

const CATEGORIES: { id: FundraisingCategory; label: string; icon: string }[] = [
  { id: 'equipment', label: 'Material', icon: '⚽' },
  { id: 'event', label: 'Evento', icon: '🍖' },
  { id: 'uniform', label: 'Uniforme', icon: '👕' },
  { id: 'travel', label: 'Viagem', icon: '🚌' },
  { id: 'prize', label: 'Premiação', icon: '🏆' },
  { id: 'other', label: 'Outro', icon: '✨' },
];

export default function TeamFundraisingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlayerId = useAppStore((state) => state.currentPlayerId);
  const pelada = useAppStore((state) => state.peladas.find((row) => row.id === id));
  const isAdmin = useAppStore((state) => id ? state.isAdmin(currentPlayerId, id) : false);
  const campaigns = useAppStore(useShallow((state) => state.fundraisingCampaigns.filter((row) => row.peladaId === id)));
  const contributions = useAppStore((state) => state.fundraisingContributions);
  const createCampaign = useAppStore((state) => state.createFundraisingCampaign);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<FundraisingCategory>('equipment');
  const [target, setTarget] = useState('');
  const [suggested, setSuggested] = useState('');
  const [deadline, setDeadline] = useState('');
  const [allowAnonymous, setAllowAnonymous] = useState(true);

  function submit() {
    if (!id || !title.trim() || Number(target) <= 0) return;
    createCampaign(id, {
      title: title.trim(), description: description.trim() || null, category,
      targetAmount: Number(target), suggestedAmount: Number(suggested) || null,
      deadline: deadline.trim() ? new Date(`${deadline.trim()}T23:59:00`).toISOString() : null,
      payoutPlayerId: currentPlayerId, allowAnonymous,
    });
    setTitle(''); setDescription(''); setTarget(''); setSuggested(''); setDeadline(''); setShowForm(false);
  }

  if (!pelada) return <Screen><Text style={styles.empty}>Time não encontrado.</Text></Screen>;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.title}>Vaquinhas do time</Text><Text style={styles.subtitle}>{pelada.name}</Text></View>
        {isAdmin && <Pressable onPress={() => setShowForm((value) => !value)}><Ionicons name={showForm ? 'close' : 'add-circle'} size={28} color={colors.primary} /></Pressable>}
      </View>

      <Card style={styles.infoCard}>
        <Text style={styles.infoTitle}>Transparência do começo ao fim</Text>
        <Text style={styles.hint}>A vaquinha é separada do rateio da quadra. O dinheiro vai direto à conta conectada pelo responsável; o BoraJogo não guarda o saldo.</Text>
      </Card>

      {showForm && (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Nova vaquinha</Text>
          <TextField label="Título" value={title} onChangeText={setTitle} placeholder="Ex.: Bola nova para o time" />
          <TextField label="Descrição" value={description} onChangeText={setDescription} multiline placeholder="Explique o objetivo e o que será comprado" />
          <Text style={styles.fieldLabel}>Categoria</Text>
          <View style={styles.chips}>{CATEGORIES.map((item) => <Pressable key={item.id} onPress={() => setCategory(item.id)} style={[styles.chip, category === item.id && styles.chipActive]}><Text style={styles.chipText}>{item.icon} {item.label}</Text></Pressable>)}</View>
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}><TextField label="Meta (R$)" value={target} onChangeText={setTarget} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><TextField label="Sugestão (R$)" value={suggested} onChangeText={setSuggested} keyboardType="decimal-pad" /></View>
          </View>
          <TextField label="Prazo (AAAA-MM-DD)" value={deadline} onChangeText={setDeadline} placeholder="Opcional" />
          <View style={styles.rowBetween}><View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Permitir contribuição anônima</Text><Text style={styles.hint}>O admin continua vendo o pagamento para prestar contas.</Text></View><Switch value={allowAnonymous} onValueChange={setAllowAnonymous} trackColor={{ true: colors.primary }} /></View>
          <Button label="Publicar vaquinha" onPress={submit} disabled={!title.trim() || Number(target) <= 0} />
        </Card>
      )}

      {campaigns.map((campaign) => {
        const paid = contributions.filter((row) => row.campaignId === campaign.id && row.status === 'paid');
        const raised = paid.reduce((sum, row) => sum + row.amount, 0);
        const progress = Math.min(100, raised / campaign.targetAmount * 100);
        const categoryInfo = CATEGORIES.find((row) => row.id === campaign.category);
        return (
          <Pressable key={campaign.id} onPress={() => router.push(`/vaquinha/${campaign.id}`)}>
            <Card style={styles.card}>
              <View style={styles.rowBetween}><Text style={styles.campaignTitle}>{categoryInfo?.icon} {campaign.title}</Text><Badge label={campaign.status === 'active' ? 'Ativa' : campaign.status === 'funded' ? 'Meta atingida' : 'Encerrada'} color={campaign.status === 'funded' ? colors.gold : campaign.status === 'active' ? colors.primary : colors.textFaint} /></View>
              {campaign.description && <Text style={styles.hint}>{campaign.description}</Text>}
              <View style={styles.progress}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
              <View style={styles.rowBetween}><Text style={styles.raised}>{formatBRL(raised)} arrecadados</Text><Text style={styles.goal}>meta {formatBRL(campaign.targetAmount)}</Text></View>
              <Text style={styles.hint}>{paid.length} contribuiç{paid.length === 1 ? 'ão' : 'ões'} · toque para contribuir e ver a prestação de contas</Text>
            </Card>
          </Pressable>
        );
      })}
      {campaigns.length === 0 && <Card><Text style={styles.empty}>Nenhuma vaquinha criada ainda.</Text></Card>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 12 },
  infoCard: { marginBottom: spacing.lg, backgroundColor: 'rgba(34,197,94,0.08)', gap: 5 },
  infoTitle: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  card: { gap: spacing.md, marginBottom: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  campaignTitle: { color: colors.text, fontSize: 15, fontWeight: '800', flex: 1 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  fieldLabel: { color: colors.textMuted, fontSize: 13 },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { borderColor: colors.primary, backgroundColor: 'rgba(34,197,94,0.12)' },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  progress: { height: 9, backgroundColor: colors.bgElevated, borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: 9, backgroundColor: colors.primary, borderRadius: 99 },
  raised: { color: colors.primary, fontWeight: '900', fontSize: 14 },
  goal: { color: colors.textMuted, fontSize: 12 },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
});
