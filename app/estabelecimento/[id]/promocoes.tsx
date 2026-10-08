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
import { computePromotionAnalytics } from '@/lib/bookingAutomation';
import { formatBRL } from '@/lib/payments';
import { useAppStore } from '@/store/useAppStore';

export default function FieldPromotionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const establishment = useAppStore((state) => state.establishments.find((row) => row.id === id));
  const fields = useAppStore(useShallow((state) => state.fields.filter((row) => row.establishmentId === id)));
  const promotions = useAppStore(useShallow((state) => state.fieldPromotions.filter((promotion) => fields.some((field) => field.id === promotion.fieldId))));
  const requests = useAppStore((state) => state.gameBookingRequests);
  const createPromotion = useAppStore((state) => state.createFieldPromotion);
  const setActive = useAppStore((state) => state.setFieldPromotionActive);
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? '');
  const [label, setLabel] = useState('Primeira reserva com 10% de desconto');
  const [commission, setCommission] = useState('8');
  const [budget, setBudget] = useState('240');

  if (!establishment) return <Screen><Text style={styles.empty}>Estabelecimento não encontrado.</Text></Screen>;
  const totals = promotions.map((promotion) => computePromotionAnalytics(promotion, requests));
  const attempts = totals.reduce((sum, row) => sum + row.attempts, 0);
  const confirmations = totals.reduce((sum, row) => sum + row.confirmations, 0);
  const revenue = totals.reduce((sum, row) => sum + row.estimatedRevenue, 0);

  function submit() {
    const created = createPromotion(fieldId, { label, pricePerConfirmedBooking: Number(commission) || 0, campaignBudget: Number(budget) || null });
    if (created) setLabel('');
  }

  return (
    <Screen>
      <View style={styles.header}><Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable><View><Text style={styles.title}>Divulgação dos campos</Text><Text style={styles.hint}>{establishment.name}</Text></View></View>
      <View style={styles.metrics}>
        <Metric label="Tentativas" value={String(attempts)} />
        <Metric label="Reservas" value={String(confirmations)} />
        <Metric label="Conversão" value={`${attempts ? Math.round(confirmations / attempts * 100) : 0}%`} />
        <Metric label="Receita" value={formatBRL(revenue)} />
      </View>
      <Card style={styles.card}>
        <View style={styles.rowBetween}><Text style={styles.sectionTitle}>Nova campanha</Text><Badge label="Patrocinado" color={colors.gold} textColor="#111827" /></View>
        <Text style={styles.hint}>O anúncio aparece depois dos campos preferidos do time e sempre identificado. A cobrança estimada só ocorre por reserva confirmada.</Text>
        <Text style={styles.label}>Campo</Text>
        <View style={styles.chips}>{fields.map((field) => <Pressable key={field.id} onPress={() => setFieldId(field.id)} style={[styles.chip, fieldId === field.id && styles.chipActive]}><Text style={styles.chipText}>{field.name}</Text></Pressable>)}</View>
        <TextField label="Oferta" value={label} onChangeText={setLabel} placeholder="Ex.: 10% na primeira reserva" />
        <View style={styles.formRow}><View style={{ flex: 1 }}><TextField label="Por reserva (R$)" value={commission} onChangeText={setCommission} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><TextField label="Orçamento (R$)" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" /></View></View>
        <Button label="Publicar campanha" onPress={submit} disabled={!fieldId || !label.trim()} />
      </Card>
      {promotions.map((promotion) => {
        const field = fields.find((row) => row.id === promotion.fieldId);
        const analytics = computePromotionAnalytics(promotion, requests);
        const spend = analytics.estimatedRevenue;
        return <Card key={promotion.id} style={styles.card}><View style={styles.rowBetween}><View style={{ flex: 1 }}><Text style={styles.promotionTitle}>{field?.name}</Text><Text style={styles.gold}>{promotion.label}</Text></View><Switch value={promotion.active} onValueChange={(value) => setActive(promotion.id, value)} trackColor={{ true: colors.primary }} /></View><View style={styles.analyticsRow}><Text style={styles.hint}>{analytics.attempts} exibições qualificadas</Text><Text style={styles.hint}>{analytics.confirmations} reservas · {analytics.conversionPercent}%</Text></View><View style={styles.rowBetween}><Text style={styles.hint}>Investimento estimado</Text><Text style={styles.money}>{formatBRL(spend)} / {formatBRL(promotion.campaignBudget ?? 0)}</Text></View></Card>;
      })}
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }, title: { color: colors.text, fontSize: 21, fontWeight: '900' }, hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  metrics: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }, metric: { flex: 1, alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, padding: spacing.sm }, metricValue: { color: colors.primary, fontWeight: '900', fontSize: 15 }, metricLabel: { color: colors.textFaint, fontSize: 10 },
  card: { gap: spacing.md, marginBottom: spacing.md }, sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' }, rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }, label: { color: colors.textMuted, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, chip: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, chipActive: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.1)' }, chipText: { color: colors.text, fontSize: 12 }, formRow: { flexDirection: 'row', gap: spacing.sm },
  promotionTitle: { color: colors.text, fontWeight: '800' }, gold: { color: colors.gold, fontSize: 12 }, analyticsRow: { flexDirection: 'row', justifyContent: 'space-between' }, money: { color: colors.primary, fontWeight: '800' }, empty: { color: colors.textMuted, textAlign: 'center' },
});
