import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { useProStore } from '@/store/useProStore';

export default function ReferralInviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const playerId = useAppStore((state) => state.currentPlayerId);
  const redeem = useProStore((state) => state.redeemReferral);
  const [feedback, setFeedback] = useState<string | null>(null);
  return <Screen contentStyle={styles.screen}><Text style={styles.eyebrow}>CONVITE</Text><Text style={styles.title}>Você foi convidado para jogar</Text><Text style={styles.subtitle}>Código {code}. O bônus só é liberado após o primeiro jogo pago, protegendo o programa contra fraude.</Text><Card style={styles.card}><Text style={styles.code}>{code}</Text><Button label="Aceitar indicação" onPress={() => { const result = redeem(code, playerId); setFeedback(result.message); }} />{feedback && <Text style={styles.feedback}>{feedback}</Text>}</Card><Button label="Ir para o aplicativo" variant="outline" onPress={() => router.replace('/(tabs)')} /></Screen>;
}
const styles = StyleSheet.create({ screen: { gap: spacing.lg, justifyContent: 'center' }, eyebrow: { color: colors.primary, textAlign: 'center', fontWeight: '900', letterSpacing: 2 }, title: { color: colors.text, fontSize: 28, fontWeight: '900', textAlign: 'center' }, subtitle: { color: colors.textMuted, lineHeight: 20, textAlign: 'center' }, card: { alignItems: 'center', gap: spacing.lg }, code: { color: colors.gold, fontSize: 25, fontWeight: '900', letterSpacing: 2 }, feedback: { color: colors.primary, textAlign: 'center', fontWeight: '700' } });
