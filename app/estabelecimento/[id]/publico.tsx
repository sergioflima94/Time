import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';

export default function EstablishmentPublicPageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const establishmentId = id ?? '';
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const establishment = useAppStore((s) => s.establishments.find((e) => e.id === establishmentId));
  const fields = useAppStore(useShallow((s) => s.fields.filter((f) => f.establishmentId === establishmentId)));
  const bookings = useAppStore(useShallow((s) => s.fieldBookings.filter((b) => b.establishmentId === establishmentId)));
  const publicBookings = bookings.filter((b) => !b.peladaId);

  if (!establishment) {
    return (
      <Screen>
        <Text style={styles.hint}>Estabelecimento não encontrado.</Text>
      </Screen>
    );
  }

  if (establishment.ownerPlayerId !== currentPlayerId) {
    return (
      <Screen>
        <Text style={styles.hint}>Você não é dono deste estabelecimento.</Text>
      </Screen>
    );
  }

  async function handleShare() {
    try {
      await Share.share({
        message: `Marque um jogo na "${establishment!.name}" direto por aqui, sem precisar já ter conta: pelada://estabelecimento/publico/${establishment!.id}`,
      });
    } catch {
      /* usuário cancelou */
    }
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.push(`/estabelecimento/${establishmentId}`)} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>🔗 Página pública</Text>
      </View>
      <Text style={styles.subtitle}>{establishment.name}</Text>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Link pra marcar jogo sem conta</Text>
        <Text style={styles.hint}>
          Qualquer pessoa com o link marca um jogo direto num dos seus campos — sem precisar já
          ter conta no app nem fazer parte de nenhuma pelada. O próprio formulário já cria o
          perfil dela.
        </Text>
        {fields.length === 0 && (
          <Text style={styles.warnText}>Cadastre um campo em "Campos" antes de compartilhar — a página fica vazia sem isso.</Text>
        )}
        <View style={styles.actionsRow}>
          <Button
            label="Abrir página pública"
            small
            variant="secondary"
            onPress={() => router.push(`/estabelecimento/publico/${establishment.id}`)}
          />
          <Button label="Compartilhar link" small onPress={handleShare} />
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Reservas vindas da página pública ({publicBookings.length})</Text>
        {publicBookings.map((b) => {
          const field = fields.find((f) => f.id === b.fieldId);
          return (
            <View key={b.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{b.teamName}</Text>
                <Text style={styles.hint}>
                  {field?.name ?? '?'} · {b.date} · {b.time} ({b.durationMinutes} min)
                </Text>
                {b.notes && <Text style={styles.hint}>{b.notes}</Text>}
              </View>
            </View>
          );
        })}
        {publicBookings.length === 0 && <Text style={styles.hint}>Nenhuma reserva pela página pública ainda.</Text>}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
    marginBottom: spacing.lg,
    marginLeft: 34,
  },
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
    color: colors.textFaint,
    fontSize: 12,
  },
  warnText: {
    color: colors.warning,
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    marginTop: spacing.xs,
  },
  rowName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
