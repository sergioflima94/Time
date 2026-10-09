import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { getGateway, PAYMENT_GATEWAYS } from '@/lib/paymentGateways';
import { isMockMode } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { PaymentGatewayProvider } from '@/types';

export default function PaymentGatewaysScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const establishment = useAppStore((s) => s.establishments.find((row) => row.id === id));
  const connection = useAppStore((s) => s.paymentGatewayConnections.find((row) => row.establishmentId === id));
  const setGateway = useAppStore((s) => s.setEstablishmentGateway);

  if (!establishment || establishment.ownerPlayerId !== currentPlayerId) {
    return <Screen><Text style={styles.empty}>Estabelecimento não encontrado ou sem permissão.</Text></Screen>;
  }

  function connect(provider: PaymentGatewayProvider) {
    setGateway(establishment!.id, provider);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.title}>Pagamentos</Text><Text style={styles.subtitle}>{establishment.name}</Text></View>
      </View>

      <Card style={styles.summary}>
        <View style={styles.summaryIcon}><Ionicons name="shield-checkmark" size={24} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{connection ? getGateway(connection.provider).label : 'Nenhum gateway conectado'}</Text>
          <Text style={styles.meta}>{connection?.accountLabel ?? 'Escolha onde o estabelecimento quer receber.'}</Text>
        </View>
        {connection && <Badge label="CONECTADO" color={colors.success} />}
      </Card>

      {isMockMode && <View style={styles.demoBanner}><Ionicons name="flask" size={18} color={colors.warning} /><Text style={styles.demoText}>Modo demonstração: conectar é instantâneo. Em produção, OAuth, tokens e certificados passam pelas Edge Functions e pelo Vault.</Text></View>}

      <Text style={styles.heading}>Escolha do dono do campo</Text>
      <Text style={styles.description}>O dinheiro entra diretamente na conta escolhida. O app registra a cobrança, recebe o webhook e dá baixa nas pessoas certas da comanda.</Text>

      {PAYMENT_GATEWAYS.map((gateway) => {
        const active = connection?.provider === gateway.id && connection.status === 'connected';
        return (
          <Card key={gateway.id} style={[styles.gatewayCard, active && styles.gatewayCardActive]}>
            <View style={styles.gatewayHeader}>
              <View style={[styles.providerIcon, active && { backgroundColor: 'rgba(157,235,34,0.15)' }]}><Ionicons name={gateway.id === 'manual_pix' ? 'qr-code' : 'card'} size={22} color={active ? colors.primary : colors.textMuted} /></View>
              <View style={{ flex: 1 }}><Text style={styles.gatewayName}>{gateway.label}</Text><Text style={styles.meta}>{gateway.shortDescription}</Text></View>
              {active && <Ionicons name="checkmark-circle" size={24} color={colors.primary} />}
            </View>
            <View style={styles.capabilities}>
              {gateway.pix && <Badge label="PIX" color={colors.primary} />}
              {gateway.card && <Badge label="CARTÃO" color={colors.secondary} />}
              {gateway.contactless && <Badge label="APROXIMAÇÃO" color={colors.warning} />}
            </View>
            <Text style={styles.hint}>{gateway.connectionHint}</Text>
            <Button label={active ? 'Gateway em uso' : gateway.id === 'manual_pix' ? 'Usar Pix manual' : 'Conectar conta'} variant={active ? 'secondary' : 'outline'} onPress={() => connect(gateway.id)} disabled={active} />
          </Card>
        );
      })}

      <Card style={styles.securityCard}>
        <Text style={styles.sectionTitle}>Segurança e conciliação</Text>
        <Text style={styles.hint}>• O aplicativo nunca salva senha bancária.</Text>
        <Text style={styles.hint}>• Cada cobrança usa uma chave de idempotência.</Text>
        <Text style={styles.hint}>• Somente webhooks validados confirmam pagamentos reais.</Text>
        <Text style={styles.hint}>• Aproximação exige aparelho com NFC e build nativo homologado; não funciona no Expo Go.</Text>
        <Text style={styles.hint}>• O caixa ainda pode registrar dinheiro ou confirmar Pix manual.</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 12 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  summaryIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(157,235,34,0.12)', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  demoBanner: { flexDirection: 'row', gap: spacing.sm, borderRadius: radius.md, padding: spacing.md, backgroundColor: 'rgba(245,158,11,0.1)', marginBottom: spacing.lg },
  demoText: { color: colors.warning, fontSize: 12, lineHeight: 17, flex: 1 },
  heading: { color: colors.text, fontSize: 17, fontWeight: '800' },
  description: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: spacing.md },
  gatewayCard: { marginBottom: spacing.md, gap: spacing.sm },
  gatewayCardActive: { borderColor: colors.primary },
  gatewayHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  providerIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  gatewayName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  capabilities: { flexDirection: 'row', gap: spacing.xs },
  hint: { color: colors.textFaint, fontSize: 12, lineHeight: 17 },
  securityCard: { marginTop: spacing.sm, marginBottom: spacing.xl, gap: spacing.xs },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
});
