import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { parseCheckInPayload } from '@/lib/pro';
import { useAppStore } from '@/store/useAppStore';
import { useProStore } from '@/store/useProStore';

export default function GameCheckInScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlayerId = useAppStore((state) => state.currentPlayerId);
  const game = useAppStore((state) => state.games.find((row) => row.id === id));
  const players = useAppStore((state) => state.players);
  const attendances = useAppStore(useShallow((state) => state.attendances.filter((row) => row.gameId === id && row.status === 'confirmed')));
  const isAdmin = useAppStore((state) => game ? state.isAdmin(currentPlayerId, game.peladaId) : false);
  const setPlayerCheckIn = useAppStore((state) => state.setPlayerCheckIn);
  const redeem = useProStore((state) => state.redeemCheckInPass);
  const recordReliability = useProStore((state) => state.recordReliability);
  const enqueueSync = useProStore((state) => state.enqueueSync);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!game || !isAdmin) return <Screen><Text style={styles.empty}>Somente o administrador deste jogo pode validar entradas.</Text></Screen>;

  function validate(raw: string) {
    const parsed = parseCheckInPayload(raw);
    if (!parsed || parsed.gameId !== game!.id) { setFeedback('QR Code inválido ou de outro jogo.'); setLocked(false); return; }
    const result = redeem(parsed.gameId, parsed.playerId, parsed.token, currentPlayerId);
    setFeedback(result.message);
    if (result.ok) setPlayerCheckIn(parsed.gameId, parsed.playerId, true);
    setCameraOpen(false);
    setLocked(false);
  }

  function manualCheckIn(playerId: string) {
    setPlayerCheckIn(game!.id, playerId, true);
    recordReliability({ entityType: 'player', entityId: playerId, gameId: game!.id, kind: 'checked_in', points: 2, note: 'Check-in confirmado manualmente pelo organizador' });
    enqueueSync('game_checkin', `${game!.id}:${playerId}`, 'manual_checkin', { gameId: game!.id, playerId, redeemedBy: currentPlayerId });
  }

  const checked = attendances.filter((row) => row.checkedIn).length;
  return (
    <Screen scroll={!cameraOpen} contentStyle={styles.screen}>
      <Button label="← Dia do jogo" variant="ghost" onPress={() => router.back()} style={styles.back} />
      <View style={styles.header}><View><Text style={styles.eyebrow}>PORTARIA DIGITAL</Text><Text style={styles.title}>Check-in</Text></View><View style={styles.counter}><Text style={styles.counterValue}>{checked}/{attendances.length}</Text><Text style={styles.counterLabel}>presentes</Text></View></View>

      {cameraOpen ? (
        <View style={styles.cameraWrap}>
          {permission?.granted ? (
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={locked ? undefined : ({ data }) => { setLocked(true); validate(data); }}
            />
          ) : (
            <Card style={styles.permission}><Ionicons name="camera" size={34} color={colors.primary} /><Text style={styles.sectionTitle}>Permitir acesso à câmera</Text><Text style={styles.muted}>A câmera é usada somente para ler o QR do ingresso.</Text><Button label="Permitir câmera" onPress={requestPermission} /></Card>
          )}
          <Button label="Fechar câmera" variant="secondary" onPress={() => setCameraOpen(false)} />
        </View>
      ) : (
        <>
          <Button label="Ler QR Code" onPress={() => setCameraOpen(true)} />
          <Card style={styles.manual}><Text style={styles.sectionTitle}>Código ou link manual</Text><TextField label="" value={manualCode} onChangeText={setManualCode} placeholder="Cole o conteúdo do ingresso" /><Button label="Validar" small variant="outline" onPress={() => validate(manualCode.trim())} disabled={!manualCode.trim()} /></Card>
          {feedback && <View style={styles.feedback}><Ionicons name="information-circle" size={18} color={colors.secondary} /><Text style={styles.feedbackText}>{feedback}</Text></View>}
          <Card style={styles.list}><Text style={styles.sectionTitle}>Lista de entrada</Text>{attendances.map((attendance) => { const player = players.find((row) => row.id === attendance.playerId); return <View key={attendance.id} style={styles.playerRow}><Avatar name={player?.name ?? 'Jogador'} photoUrl={player?.avatarUrl ?? null} size={34} /><View style={{ flex: 1 }}><Text style={styles.playerName}>{player?.name ?? 'Jogador'}</Text><Text style={styles.mutedLeft}>{attendance.checkedIn ? 'Entrada registrada' : 'Aguardando'}</Text></View>{attendance.checkedIn ? <Badge label="PRESENTE" color={colors.success} /> : <Pressable onPress={() => manualCheckIn(attendance.playerId)}><Text style={styles.link}>Marcar</Text></Pressable>}</View>; })}</Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg }, back: { alignSelf: 'flex-start', paddingHorizontal: 0 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, title: { color: colors.text, fontSize: 28, fontWeight: '900' }, counter: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }, counterValue: { color: colors.primary, fontSize: 20, fontWeight: '900' }, counterLabel: { color: colors.textMuted, fontSize: 10 },
  cameraWrap: { flex: 1, gap: spacing.md }, camera: { flex: 1, minHeight: 440, borderRadius: radius.lg, overflow: 'hidden' }, permission: { alignItems: 'center', gap: spacing.md }, manual: { gap: spacing.sm }, sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' }, muted: { color: colors.textMuted, textAlign: 'center' }, feedback: { flexDirection: 'row', gap: spacing.sm, backgroundColor: 'rgba(59,130,246,0.12)', borderRadius: radius.md, padding: spacing.md }, feedbackText: { color: colors.secondary, flex: 1, fontWeight: '700' }, list: { gap: spacing.sm }, playerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.cardBorder }, playerName: { color: colors.text, fontWeight: '700' }, mutedLeft: { color: colors.textMuted, fontSize: 11 }, link: { color: colors.primary, fontWeight: '800' }, empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
});
