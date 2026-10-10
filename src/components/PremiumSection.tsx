import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, radius, spacing } from '@/constants/theme';
import { daysUntilExpiry, isPremiumActive } from '@/lib/premium';
import { isMockMode } from '@/lib/supabase';
import { useProStore } from '@/store/useProStore';
import { useOwnerBenefits } from '@/hooks/useOwnerBenefits';
import { useCommercialAccess } from '@/hooks/useCommercialAccess';
import { useAppStore } from '@/store/useAppStore';

const BENEFITS = [
  'Sem anúncios em nenhuma tela',
  'Estilos e fundo com foto exclusivos na sua carta',
  'Apoia o desenvolvimento do app',
];

// URLs oficiais de gerenciamento de assinatura de cada loja.
const MANAGE_SUBSCRIPTION_URL = Platform.select({
  ios: 'itms-apps://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
  default: 'https://play.google.com/store/account/subscriptions',
});

interface PremiumSectionProps {
  premiumSince: string | null;
  premiumUntil: string | null;
  autoRenew: boolean;
  onSubscribe: () => void;
  onCancelAutoRenew: () => void;
}

export function PremiumSection({ premiumSince, premiumUntil, autoRenew, onSubscribe, onCancelAutoRenew }: PremiumSectionProps) {
  const ownerBenefits = useOwnerBenefits();
  const playerId = useAppStore(s=>s.currentPlayerId);
  const { license } = useCommercialAccess('player',playerId);
  const offer = useProStore(s => s.plans.find(p => p.audience === 'player' && p.active));
  const price = offer?.monthlyPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const active = isPremiumActive({ premiumUntil });

  function handleConfirm() {
    if (!isMockMode) return;
    setLoading(true);
    // Checkout simulado (modo demonstração): em produção isso abre a tela nativa de
    // assinatura da App Store / Google Play — a cobrança e a renovação mensal ficam
    // inteiramente por conta delas, não do nosso app.
    setTimeout(() => {
      onSubscribe();
      setLoading(false);
      setCheckoutOpen(false);
    }, 700);
  }

  async function handleManageSubscription() {
    if (MANAGE_SUBSCRIPTION_URL) {
      Linking.openURL(MANAGE_SUBSCRIPTION_URL).catch(() => {});
    }
    if (isMockMode) onCancelAutoRenew();
  }

  if (ownerBenefits) {
    return <Card style={[styles.card, styles.cardActive]}>
      <View style={styles.headerRow}>
        <Ionicons name="shield-checkmark" size={18} color={colors.gold} />
        <Text style={styles.titleActive}>Acesso completo do proprietário</Text>
      </View>
      <Text style={styles.subText}>Premium sem anúncios e benefícios Pro liberados, sem assinatura ou cobrança mensal, enquanto seu papel de proprietário estiver ativo.</Text>
      <Text style={styles.subText}>Consumo, reservas e serviços externos continuam sendo pagos normalmente.</Text>
    </Card>;
  }

  if (license) {
    return <Card style={[styles.card,styles.cardActive]}>
      <Text style={styles.titleActive}>Premium por licença concedida</Text>
      <Text style={styles.subText}>{license.expiresAt?`Benefícios gratuitos até ${new Date(license.expiresAt).toLocaleDateString('pt-BR')}.`:'Benefícios gratuitos sem prazo definido, enquanto a licença estiver ativa.'}</Text>
      <Text style={styles.subText}>Sem anúncios e fundo da carta liberados. A licença pode ser revogada e não concede acesso administrativo.</Text>
      {active && <><Text style={styles.subText}>Você já tem uma assinatura paga. Esta licença não cancela a renovação nem gera reembolso automaticamente.</Text><Pressable onPress={handleManageSubscription}><Text style={styles.manageLink}>Gerenciar assinatura existente</Text></Pressable></>}
    </Card>;
  }

  if (active) {
    return (
      <Card style={[styles.card, styles.cardActive]}>
        <View style={styles.headerRow}>
          <Ionicons name="star" size={18} color={colors.gold} />
          <Text style={styles.titleActive}>Você é Premium</Text>
        </View>
        {premiumSince && (
          <Text style={styles.subText}>Assinante desde {new Date(premiumSince).toLocaleDateString('pt-BR')}</Text>
        )}
        <Text style={styles.subText}>
          {autoRenew
            ? `Renova automaticamente em ${new Date(premiumUntil!).toLocaleDateString('pt-BR')} (${daysUntilExpiry(premiumUntil)} dias)`
            : `Sem renovação automática — vence em ${new Date(premiumUntil!).toLocaleDateString('pt-BR')} (${daysUntilExpiry(premiumUntil)} dias) e o benefício cai`}
        </Text>
        <Pressable onPress={handleManageSubscription}>
          <Text style={styles.manageLink}>Gerenciar assinatura (App Store / Google Play)</Text>
        </Pressable>
      </Card>
    );
  }

  const expired = !!premiumSince && !active;

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="star-outline" size={18} color={colors.gold} />
        <Text style={styles.title}>BoraJogo Premium</Text>
      </View>
      {expired && (
        <Text style={styles.expiredNotice}>
          Sua assinatura venceu em {new Date(premiumUntil!).toLocaleDateString('pt-BR')} e o benefício caiu. Assine de
          novo para voltar a aproveitar.
        </Text>
      )}
      {BENEFITS.map((b) => (
        <View key={b} style={styles.benefitRow}>
          <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
          <Text style={styles.benefitText}>{b}</Text>
        </View>
      ))}

      {!checkoutOpen ? (
        <Button
          label={!isMockMode ? 'Assinatura em preparação' : `Simular Premium — ${price ?? 'Oferta indisponível'}/mês`}
          disabled={!isMockMode || !offer}
          onPress={() => setCheckoutOpen(true)}
          style={{ marginTop: spacing.sm }}
        />
      ) : (
        <View style={styles.checkout}>
          <Text style={styles.checkoutTitle}>Confirmar assinatura</Text>
          <Text style={styles.checkoutText}>
            Assinatura mensal (renova automaticamente todo mês até você cancelar) gerenciada pela App Store / Google
            Play — não guardamos seu cartão. Modo demonstração: nenhum pagamento real será cobrado agora.
          </Text>
          <View style={styles.checkoutActions}>
            <Button label="Voltar" variant="ghost" small onPress={() => setCheckoutOpen(false)} disabled={loading} />
            <Button
              label={loading ? 'Processando...' : 'Confirmar (demo)'}
              small
              onPress={handleConfirm}
              disabled={loading}
              style={{ flex: 1 }}
            />
          </View>
          {loading && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: spacing.xs }} />}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    gap: spacing.xs,
    borderColor: 'rgba(212,175,55,0.4)',
  },
  cardActive: {
    backgroundColor: 'rgba(212,175,55,0.08)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  titleActive: {
    color: colors.gold,
    fontSize: 15,
    fontWeight: '800',
  },
  subText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  expiredNotice: {
    color: colors.danger,
    fontSize: 12,
    marginBottom: spacing.xs,
    lineHeight: 16,
  },
  manageLink: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  benefitText: {
    color: colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
  checkout: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
  },
  checkoutTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  checkoutText: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginBottom: spacing.sm,
  },
  checkoutActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
