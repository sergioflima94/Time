import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { formatGameDateLong } from '@/lib/format';
import { checkInPayload } from '@/lib/pro';
import { useAppStore } from '@/store/useAppStore';
import { useProStore } from '@/store/useProStore';

export default function PlayerCheckInScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const playerId = useAppStore((state) => state.currentPlayerId);
  const game = useAppStore((state) => state.games.find((row) => row.id === gameId));
  const field = useAppStore((state) => state.fields.find((row) => row.id === game?.fieldId));
  const attendance = useAppStore((state) => state.attendances.find((row) => row.gameId === gameId && row.playerId === playerId));
  const pass = useProStore((state) => state.checkInPasses.find((row) => row.gameId === gameId && row.playerId === playerId));
  const issue = useProStore((state) => state.issueCheckInPass);

  if (!game) return <Screen><Text style={styles.empty}>Jogo não encontrado.</Text></Screen>;
  if (attendance?.status !== 'confirmed') return <Screen><Button label="Voltar" variant="ghost" onPress={() => router.back()} /><Card><Text style={styles.title}>Confirme presença primeiro</Text><Text style={styles.muted}>O ingresso digital aparece apenas para jogadores confirmados.</Text></Card></Screen>;

  const payload = pass ? checkInPayload(game.id, playerId, pass.token) : null;
  return (
    <Screen contentStyle={styles.screen}>
      <Button label="← Voltar" variant="ghost" onPress={() => router.back()} style={styles.back} />
      <View style={styles.hero}>
        <View style={styles.icon}><Ionicons name="qr-code" size={30} color={colors.bg} /></View>
        <Text style={styles.eyebrow}>INGRESSO DO JOGO</Text>
        <Text style={styles.title}>{formatGameDateLong(game.scheduledAt)}</Text>
        <Text style={styles.muted}>{field?.name ?? 'Local a definir'}</Text>
      </View>

      <Card style={styles.ticket}>
        {payload ? (
          <>
            <View style={styles.qr}><QRCode value={payload} size={210} backgroundColor="#FFFFFF" color="#11161A" /></View>
            <Text style={styles.code}>{pass?.token.slice(0, 4)} · {pass?.token.slice(4, 8)}</Text>
            <View style={[styles.status, attendance.checkedIn && styles.statusOk]}>
              <Ionicons name={attendance.checkedIn ? 'checkmark-circle' : 'time'} size={18} color={attendance.checkedIn ? colors.success : colors.warning} />
              <Text style={[styles.statusText, attendance.checkedIn && { color: colors.success }]}>{attendance.checkedIn ? 'Entrada confirmada' : 'Apresente este QR ao organizador'}</Text>
            </View>
          </>
        ) : (
          <>
            <Ionicons name="shield-checkmark" size={52} color={colors.primary} />
            <Text style={styles.ticketTitle}>Seu ingresso ainda não foi emitido</Text>
            <Text style={styles.muted}>O código é individual, vale apenas neste jogo e só pode ser usado uma vez.</Text>
            <Button label="Gerar meu QR Code" onPress={() => issue(game.id, playerId)} />
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg }, back: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  hero: { alignItems: 'center', gap: spacing.xs }, icon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, marginBottom: spacing.sm },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 }, title: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' }, muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  ticket: { alignItems: 'center', gap: spacing.md, borderStyle: 'dashed', borderColor: colors.primary }, qr: { padding: spacing.md, backgroundColor: '#FFFFFF', borderRadius: radius.md }, code: { color: colors.text, fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  ticketTitle: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' }, status: { width: '100%', flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(245,158,11,0.12)' }, statusOk: { backgroundColor: 'rgba(34,197,94,0.12)' }, statusText: { color: colors.warning, fontWeight: '800' }, empty: { color: colors.textMuted, textAlign: 'center' },
});
