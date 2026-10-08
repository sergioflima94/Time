import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';

const MODULES = [
  { id: 'reputacao', icon: 'shield-checkmark', color: colors.primary, title: 'Confiabilidade', text: 'No-show, check-in, cancelamento e fair play.' },
  { id: 'temporadas', icon: 'trophy', color: colors.gold, title: 'Temporadas', text: 'Ranking contínuo por time e esporte.' },
  { id: 'inteligencia', icon: 'analytics', color: colors.secondary, title: 'Inteligência', text: 'Ocupação, receita, estoque e oportunidades.' },
  { id: 'indicacoes', icon: 'share-social', color: '#22D3EE', title: 'Indicações', text: 'Links rastreáveis e bônus após conversão.' },
  { id: 'planos', icon: 'diamond', color: colors.special, title: 'Planos comerciais', text: 'Jogador, Time e Estabelecimento Pro.' },
  { id: 'seguranca', icon: 'lock-closed', color: colors.danger, title: 'Segurança', text: 'Denúncias, moderação e auditoria.' },
  { id: 'sincronizacao', icon: 'cloud-upload', color: colors.textMuted, title: 'Sincronização', text: 'Fila offline e entrega idempotente ao Supabase.' },
] as const;

export default function ProOperationsScreen() {
  return (
    <Screen contentStyle={styles.screen}>
      <Button label="← Voltar" variant="ghost" onPress={() => router.back()} style={styles.back} />
      <View style={styles.hero}><Text style={styles.eyebrow}>CAMADA DE PRODUÇÃO</Text><Text style={styles.title}>Operação Pro</Text><Text style={styles.subtitle}>Confiabilidade, monetização e dados que transformam recursos isolados em um negócio operável.</Text></View>
      <View style={styles.grid}>{MODULES.map((module) => <Pressable key={module.id} style={styles.module} onPress={() => router.push(`/pro/${module.id}`)}><View style={[styles.icon, { backgroundColor: `${module.color}22` }]}><Ionicons name={module.icon} size={24} color={module.color} /></View><Text style={styles.moduleTitle}>{module.title}</Text><Text style={styles.moduleText}>{module.text}</Text><View style={styles.open}><Text style={[styles.openText, { color: module.color }]}>Abrir</Text><Ionicons name="arrow-forward" size={14} color={module.color} /></View></Pressable>)}</View>
      <Card style={styles.banner}><Ionicons name="information-circle" size={22} color={colors.secondary} /><View style={{ flex: 1 }}><Text style={styles.bannerTitle}>Modo demonstração seguro</Text><Text style={styles.bannerText}>As ações funcionam localmente e entram na fila de sincronização. Com Supabase configurado, a mesma fila é enviada ao backend.</Text></View></Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg }, back: { alignSelf: 'flex-start', paddingHorizontal: 0 }, hero: { gap: spacing.xs }, eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, title: { color: colors.text, fontSize: 30, fontWeight: '900' }, subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, module: { width: '47%', minHeight: 190, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing.md }, icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }, moduleTitle: { color: colors.text, fontSize: 15, fontWeight: '900' }, moduleText: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4, flex: 1 }, open: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.md }, openText: { fontWeight: '800', fontSize: 12 }, banner: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }, bannerTitle: { color: colors.text, fontWeight: '800' }, bannerText: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
});
