import { useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { Button } from './ui/Button';
import { colors } from '@/constants/theme';
import { nativeBillingConfigured, nativeStoreLabel, loadNativeOffer, purchaseNativePremium, restoreNativePremium, syncNativeSubscription, type NativeBillingStatus } from '@/lib/nativeBilling';
import { subscriptionManagementUrl } from '@/lib/billingPolicy';
import { useAuthStore } from '@/store/useAuthStore';
import { router } from 'expo-router';
import { PRIVACY_POLICY_URL } from '@/constants/publicWebsite';

export function NativeSubscriptionControls({ paymentSource }: { paymentSource?: string }) {
  const authId = useAuthStore(s => s.authUserId);
  const [pack, setPack] = useState<PurchasesPackage | null>(null);
  const [status, setStatus] = useState<NativeBillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const epoch = useRef(0);
  useEffect(() => { epoch.current++; setPack(null); setStatus(null); setNotice(''); setBusy(false); return () => { epoch.current++; }; }, [authId]);
  async function run(action: 'load' | 'purchase' | 'restore' | 'sync') {
    const request = ++epoch.current;
    setBusy(true); setNotice('');
    try {
      if (action === 'load') {
        const result = await loadNativeOffer();
        if (request === epoch.current) { setPack(result.package); setStatus(result.status); }
      } else {
        const result = action === 'restore' ? await restoreNativePremium() : action === 'purchase' && pack ? await purchaseNativePremium(pack) : await syncNativeSubscription();
        if (request === epoch.current) {
          setStatus(result);
          setNotice(result.active ? 'Premium confirmado pelo servidor.' : action === 'purchase' ? 'Compra enviada. Aguarde a confirmação e consulte novamente; não repita o pagamento.' : 'Nenhuma assinatura ativa confirmada para esta conta.');
        }
      }
    } catch (error) {
      if (request === epoch.current) setNotice((error as { userCancelled?: boolean })?.userCancelled ? 'Compra cancelada. Nenhum benefício foi ativado.' : error instanceof Error ? error.message : 'Não foi possível consultar a loja.');
    } finally { if (request === epoch.current) setBusy(false); }
  }
  const copy = { color: colors.textMuted, fontSize: 12, lineHeight: 18 };
  const manage = subscriptionManagementUrl(status?.source ?? paymentSource);
  // A free store release does not advertise an unfinished checkout.
  if (!nativeBillingConfigured && !manage) return <Text style={copy}>Quadras, aulas presenciais, comandas e produtos são pagos separadamente ao estabelecimento. Não há ofertas de assinatura digital disponíveis nesta versão.</Text>;
  return <View style={{ gap: 10 }}>
    <Text style={copy}>Premium do aplicativo: {nativeStoreLabel}. Quadras, aulas presenciais, comandas e produtos são pagos separadamente ao estabelecimento.</Text>
    {!nativeBillingConfigured ? <Text style={copy}>Assinatura pela loja em preparação. Nenhuma compra está disponível nesta versão.</Text> : <>
      {pack && <Text style={copy}>{pack.product.title} · {pack.product.priceString}/mês. Renovação automática até cancelar pela loja. O valor final aparece na confirmação da loja.</Text>}
      <Button small label={pack ? `Assinar por ${pack.product.priceString}/mês` : 'Consultar plano na loja'} loading={busy} disabled={busy || (!!pack && !status?.canPurchase)} onPress={() => void run(pack ? 'purchase' : 'load')} />
      <Button small variant="outline" label="Restaurar compras" disabled={busy} onPress={() => void run('restore')} />
      <Button small variant="ghost" label="Consultar confirmação" disabled={busy} onPress={() => void run('sync')} />
    </>}
    {manage && <Button small variant="outline" label="Gerenciar assinatura na loja de origem" onPress={() => void Linking.openURL(manage).catch(() => setNotice('Não foi possível abrir o gerenciamento da loja.'))} />}
    <Text style={copy}>Ao assinar, você concorda com os termos de uso e a política de privacidade.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <Button small variant="ghost" label="Termos de uso" onPress={() => router.push('/termos')} />
      <Button small variant="ghost" label="Privacidade" onPress={() => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => setNotice('Não foi possível abrir a política.'))} />
    </View>
    {!!notice && <Text accessibilityLiveRegion="polite" style={copy}>{notice}</Text>}
  </View>;
}
