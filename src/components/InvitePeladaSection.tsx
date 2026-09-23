import { Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, radius, spacing } from '@/constants/theme';
import type { Pelada } from '@/types';

export function InvitePeladaSection({ pelada }: { pelada: Pelada }) {
  async function handleShare() {
    try {
      await Share.share({
        message: `Bora jogar? Entra na pelada "${pelada.name}" comigo!\n\nBaixe o app Pelada, toque em "Entrar em uma pelada" e use o código: ${pelada.inviteCode}`,
      });
    } catch {
      // usuário cancelou o compartilhamento, nada a fazer
    }
  }

  return (
    <Card style={styles.section}>
      <Text style={styles.sectionTitle}>Convidar jogadores</Text>
      <Text style={styles.hint}>
        Compartilhe o código abaixo com quem você quer chamar pra pelada — inclusive quem ainda não tem o app.
      </Text>
      <View style={styles.inviteCodeBox}>
        <Text style={styles.inviteCodeText}>{pelada.inviteCode}</Text>
      </View>
      <Button label="Compartilhar convite" onPress={handleShare} />
    </Card>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  inviteCodeBox: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  inviteCodeText: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
