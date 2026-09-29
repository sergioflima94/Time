import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { calculateChampionshipPricing } from '@/lib/championship';
import { formatBRL } from '@/lib/payments';
import { useAppStore } from '@/store/useAppStore';
import type { ChampionshipBudget, ChampionshipBudgetInput } from '@/types';

type BudgetField = keyof ChampionshipBudgetInput;
type FormValues = Record<BudgetField | 'entryFee', string>;

const PER_MATCH_FIELDS: Array<{ key: BudgetField; label: string }> = [
  { key: 'fieldCostPerMatch', label: 'Quadra/operação por jogo' },
  { key: 'refereeCostPerMatch', label: 'Árbitro por jogo' },
  { key: 'assistantRefereeCostPerMatch', label: 'Auxiliar por jogo' },
  { key: 'tableStaffCostPerMatch', label: 'Mesário/apoio por jogo' },
];

const FIXED_FIELDS: Array<{ key: BudgetField; label: string }> = [
  { key: 'prizeCost', label: 'Premiação em dinheiro' },
  { key: 'trophiesCost', label: 'Troféus e medalhas' },
  { key: 'medicalCost', label: 'Atendimento médico' },
  { key: 'securityCost', label: 'Segurança' },
  { key: 'marketingCost', label: 'Divulgação e fotos' },
  { key: 'materialsCost', label: 'Bolas, redes e material' },
  { key: 'cleaningCost', label: 'Limpeza' },
  { key: 'foodWaterCost', label: 'Água e alimentação da equipe' },
  { key: 'licensesCost', label: 'Licenças e seguro' },
  { key: 'otherCost', label: 'Outros gastos' },
];

const defaultBudget = (teams: number): ChampionshipBudgetInput => ({
  plannedTeams: Math.max(2, teams),
  fieldCostPerMatch: 0,
  refereeCostPerMatch: 80,
  assistantRefereeCostPerMatch: 0,
  tableStaffCostPerMatch: 20,
  prizeCost: 500,
  trophiesCost: 180,
  medicalCost: 150,
  securityCost: 0,
  marketingCost: 100,
  materialsCost: 70,
  cleaningCost: 80,
  foodWaterCost: 100,
  licensesCost: 0,
  otherCost: 0,
  contingencyPercent: 10,
  paymentFeePercent: 2,
  targetProfit: 500,
});

const parseNumber = (value: string) => Math.max(0, Number(value.replace(',', '.')) || 0);

function makeForm(budget: ChampionshipBudgetInput, entryFee: number): FormValues {
  return { ...Object.fromEntries(Object.entries(budget).map(([key, value]) => [key, String(value)])), entryFee: String(entryFee || '') } as FormValues;
}

function savedToInput(saved: ChampionshipBudget): ChampionshipBudgetInput {
  const { id: _id, championshipId: _championshipId, updatedAt: _updatedAt, ...input } = saved;
  return input;
}

export default function ChampionshipBudgetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const championship = useAppStore((s) => s.championships.find((row) => row.id === id));
  const establishment = useAppStore((s) => s.establishments.find((row) => row.id === championship?.establishmentId));
  const savedBudget = useAppStore((s) => s.championshipBudgets.find((row) => row.championshipId === id));
  const confirmedTeams = useAppStore((s) => s.championshipTeams.filter((row) => row.championshipId === id && row.status === 'confirmed').length);
  const saveBudget = useAppStore((s) => s.saveChampionshipBudget);
  const seed = savedBudget ? savedToInput(savedBudget) : defaultBudget(championship?.maxTeams ?? Math.max(confirmedTeams, 4));
  const [values, setValues] = useState<FormValues>(() => makeForm(seed, championship?.entryFee ?? 0));

  const budget = useMemo(() => Object.fromEntries(
    (Object.keys(seed) as BudgetField[]).map((key) => [key, parseNumber(values[key])]),
  ) as ChampionshipBudgetInput, [seed, values]);
  const result = useMemo(() => championship
    ? calculateChampionshipPricing(championship.format, budget, parseNumber(values.entryFee))
    : null, [championship, budget, values.entryFee]);

  if (!championship || !result) return <Screen><Text style={styles.empty}>Campeonato não encontrado.</Text></Screen>;
  const isOrganizer = Boolean(championship.establishmentId && establishment?.ownerPlayerId === currentPlayerId);
  if (!isOrganizer) return <Screen><Text style={styles.empty}>Somente o organizador pode editar este orçamento.</Text></Screen>;

  const setField = (key: keyof FormValues, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const useRecommendation = () => setField('entryFee', String(result.recommendedEntryFee));
  const handleSave = () => {
    saveBudget(championship.id, budget, parseNumber(values.entryFee));
    Alert.alert('Orçamento salvo', 'A taxa de inscrição do campeonato também foi atualizada.');
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.title}>Precificar inscrição</Text><Text style={styles.hint}>{championship.name}</Text></View>
      </View>

      <Card style={styles.hero}>
        <Text style={styles.eyebrow}>INSCRIÇÃO SUGERIDA POR TIME</Text>
        <Text style={styles.heroValue}>{formatBRL(result.recommendedEntryFee)}</Text>
        <Text style={styles.hint}>{budget.plannedTeams} times · {result.matchCount} partidas · lucro desejado {formatBRL(budget.targetProfit)}</Text>
        <Button label="Usar valor sugerido" small onPress={useRecommendation} />
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Cenário</Text>
        <View style={styles.grid}>
          <Field label="Times previstos" field="plannedTeams" values={values} onChange={setField} keyboard="number-pad" />
          <Field label="Taxa escolhida/time" field="entryFee" values={values} onChange={setField} />
          <Field label="Reserva imprevistos (%)" field="contingencyPercent" values={values} onChange={setField} />
          <Field label="Taxa pagamento (%)" field="paymentFeePercent" values={values} onChange={setField} />
        </View>
        <TextField label="Lucro desejado total (R$)" value={values.targetProfit} onChangeText={(value) => setField('targetProfit', value)} keyboardType="decimal-pad" />
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Custos por partida</Text>
        <Text style={styles.hint}>Multiplicados automaticamente pelas {result.matchCount} partidas estimadas.</Text>
        <View style={styles.grid}>{PER_MATCH_FIELDS.map((field) => <Field key={field.key} label={field.label} field={field.key} values={values} onChange={setField} />)}</View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Custos fixos do evento</Text>
        <View style={styles.grid}>{FIXED_FIELDS.map((field) => <Field key={field.key} label={field.label} field={field.key} values={values} onChange={setField} />)}</View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Resultado projetado</Text>
        <Line label={`Operação por jogo (${result.matchCount}×)`} value={result.variableCosts} />
        <Line label="Custos fixos" value={result.fixedCosts} />
        <Line label="Reserva para imprevistos" value={result.contingencyCost} />
        <Line label="Custo total do campeonato" value={result.operatingCost} strong />
        <View style={styles.separator} />
        <Line label="Receita com inscrições" value={result.projectedRevenue} />
        <Line label="Taxas estimadas do pagamento" value={-result.projectedPaymentFees} />
        <Line label="Lucro final projetado" value={result.projectedProfit} strong color={result.projectedProfit >= 0 ? colors.success : colors.danger} />
        <Text style={[styles.margin, { color: result.projectedProfit >= 0 ? colors.success : colors.danger }]}>
          Margem {result.projectedMarginPercent.toFixed(1).replace('.', ',')}%
        </Text>
        <View style={styles.breakEven}><Ionicons name="shield-checkmark-outline" size={20} color={colors.secondary} /><Text style={styles.breakEvenText}>Ponto de equilíbrio: {formatBRL(result.breakEvenEntryFee)} por time</Text></View>
      </Card>

      <Button label="Salvar orçamento e taxa" onPress={handleSave} />
      <Text style={styles.footerNote}>Estimativa gerencial. Valores reais podem mudar conforme número de times, fornecedores e forma de pagamento.</Text>
    </Screen>
  );
}

function Field({ label, field, values, onChange, keyboard = 'decimal-pad' }: { label: string; field: keyof FormValues; values: FormValues; onChange: (field: keyof FormValues, value: string) => void; keyboard?: 'decimal-pad' | 'number-pad' }) {
  return <View style={styles.half}><TextField label={label} value={values[field]} onChangeText={(value) => onChange(field, value)} keyboardType={keyboard} /></View>;
}

function Line({ label, value, strong, color }: { label: string; value: number; strong?: boolean; color?: string }) {
  return <View style={styles.line}><Text style={[styles.lineLabel, strong && styles.strong]}>{label}</Text><Text style={[styles.lineValue, strong && styles.strong, color ? { color } : null]}>{value < 0 ? `− ${formatBRL(Math.abs(value))}` : formatBRL(value)}</Text></View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 21, fontWeight: '900' }, hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 }, empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
  hero: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg, borderColor: colors.primary }, eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 }, heroValue: { color: colors.primary, fontSize: 34, fontWeight: '900' },
  section: { marginBottom: spacing.lg, gap: spacing.sm }, sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, half: { width: '48%', flexGrow: 1 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 5 }, lineLabel: { color: colors.textMuted, fontSize: 13, flex: 1 }, lineValue: { color: colors.text, fontSize: 13, fontWeight: '700' }, strong: { color: colors.text, fontWeight: '900' }, separator: { height: 1, backgroundColor: colors.cardBorder, marginVertical: spacing.xs }, margin: { textAlign: 'right', fontWeight: '800', fontSize: 12 },
  breakEven: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm }, breakEvenText: { color: colors.secondary, fontWeight: '800', fontSize: 12, flex: 1 }, footerNote: { color: colors.textFaint, fontSize: 11, lineHeight: 16, textAlign: 'center', marginVertical: spacing.lg },
});
