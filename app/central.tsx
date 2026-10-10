import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { GROWTH_FEATURES } from '@/constants/growthFeatures';
import { colors, radius, spacing } from '@/constants/theme';

export default function GrowthCentralScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Central do esporte</Text>
          <Text style={styles.subtitle}>Operação, comunidade e novas receitas em um só lugar</Text>
        </View>
      </View>

      <Card style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="rocket-outline" size={24} color={colors.onPrimary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>10 módulos prontos para demonstração</Text>
          <Text style={styles.heroText}>Os fluxos funcionam em modo local e possuem uma fronteira própria para a futura persistência no Supabase.</Text>
        </View>
      </Card>

      <Pressable style={styles.proBanner} onPress={() => router.push('/operacao-pro')}>
        <View style={styles.proIcon}><Ionicons name="shield-checkmark" size={24} color={colors.white} /></View>
        <View style={{ flex: 1 }}><Text style={styles.proTitle}>Operação Pro</Text><Text style={styles.proText}>Check-in, reputação, temporadas, inteligência, indicações, planos, segurança e sincronização.</Text></View>
        <Ionicons name="chevron-forward" size={18} color={colors.special} />
      </Pressable>

      <View style={styles.grid}>
        <Button small variant="outline" label="Campos perto de você" onPress={()=>router.push('/campos')} />
        {GROWTH_FEATURES.map((feature) => (
          <Pressable key={feature.id} style={styles.feature} onPress={() => router.push(`/recursos/${feature.id}`)}>
            <View style={[styles.icon, { backgroundColor: `${feature.color}22` }]}>
              <Ionicons name={feature.icon} size={22} color={feature.color} />
            </View>
            <Text style={styles.featureTitle}>{feature.title}</Text>
            <Text style={styles.featureDescription}>{feature.description}</Text>
            <View style={[styles.revenue, { borderColor: `${feature.color}66` }]}>
              <Text style={[styles.revenueText, { color: feature.color }]}>{feature.revenue}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg, borderColor: colors.primary },
  heroIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  heroText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  proBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.special, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg },
  proIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.special, alignItems: 'center', justifyContent: 'center' },
  proTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  proText: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  feature: { width: '47.8%', minHeight: 190, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.lg, padding: spacing.md },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  featureTitle: { color: colors.text, fontSize: 14, fontWeight: '800', minHeight: 36 },
  featureDescription: { color: colors.textMuted, fontSize: 11, lineHeight: 16, flex: 1, marginTop: 4 },
  revenue: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 4, marginTop: spacing.sm },
  revenueText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
});
