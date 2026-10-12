import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, spacing } from '@/constants/theme';
import { ACCOUNT_DELETION_URL, PRIVACY_CONTACT_EMAIL, PRIVACY_POLICY_URL } from '@/constants/publicWebsite';
import { useAdsState } from '@/hooks/useAdsState';
import { refreshAdsPrivacyOptions, showAdsPrivacyOptions } from '@/lib/ads';

export function PrivacyLinks({ account = false }: { account?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const ads = useAdsState();
  useEffect(() => { if (account) void refreshAdsPrivacyOptions(); }, [account]);
  async function open(url: string) {
    setError(null);
    try { await Linking.openURL(url); }
    catch { setError(`Não foi possível abrir a página. Para atendimento, escreva para ${PRIVACY_CONTACT_EMAIL}.`); }
  }
  return (
    <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
      {account && <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Privacidade e conta</Text>}
      <Button label="Política de Privacidade" small variant="ghost" onPress={() => { void open(PRIVACY_POLICY_URL); }} />
      {account && <>
        {ads.privacyOptionsRequired && <Button label="Opções de privacidade dos anúncios" small variant="outline"
          loading={ads.busy} onPress={() => { void showAdsPrivacyOptions(); }} />}
        {ads.error && ads.privacyOptionsRequired && <Text accessibilityRole="alert" style={{ color: colors.textMuted, fontSize: 12 }}>{ads.error}</Text>}
        <Button label="Solicitar exclusão da conta" small variant="outline" onPress={() => { void open(ACCOUNT_DELETION_URL); }} />
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Abre a página pública de atendimento. O pedido exige envio por e-mail; este botão não exclui a conta imediatamente.</Text>
      </>}
      {error && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>}
    </View>
  );
}
