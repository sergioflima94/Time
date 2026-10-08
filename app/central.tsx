import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
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
        <View style={styles.heroIcon}><Ionicons name="rocket-outline" size={24} color={colors.bg} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>10 módulos prontos para demonstração</Text>
          <Text style={styles.heroText}>Os fluxos funcionam em modo local e possuem uma fronteira própria para a futura persistência no Supabase.</Text>
        </View>
      </Card>

      <View style={styles.grid}>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  feature: { width: '47.8%', minHeight: 190, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.lg, padding: spacing.md },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  featureTitle: { color: colors.text, fontSize: 14, fontWeight: '800', minHeight: 36 },
  featureDescription: { color: colors.textMuted, fontSize: 11, lineHeight: 16, flex: 1, marginTop: 4 },
  revenue: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 4, marginTop: spacing.sm },
  revenueText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
});
