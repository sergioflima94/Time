import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import type { EstablishmentPayoutMethod } from '@/types';

export default function EstablishmentScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const establishment = useAppStore((s) => s.establishments.find((e) => e.ownerPlayerId === currentPlayerId));
  const createEstablishment = useAppStore((s) => s.createEstablishment);
  const updateEstablishment = useAppStore((s) => s.updateEstablishment);

  const [name, setName] = useState(establishment?.name ?? '');
  const [payoutMethod, setPayoutMethod] = useState<EstablishmentPayoutMethod>(establishment?.payoutMethod ?? 'pix');
  const [pixKey, setPixKey] = useState(establishment?.pixKey ?? '');

  function handleSave() {
    if (!name.trim()) return;
    const input = { name: name.trim(), payoutMethod, pixKey: payoutMethod === 'pix' ? pixKey.trim() || null : null };
    if (establishment) {
      updateEstablishment(establishment.id, input);
    } else {
      createEstablishment(currentPlayerId, input);
    }
  }

  async function handleShare() {
    if (!establishment) return;
    try {
      await Share.share({
        message: `Cadastra o campo "${establishment.name}" na sua pelada! No app Pelada, em Admin → Campos, use o código: ${establishment.accessCode}`,
      });
    } catch {
      /* usuário cancelou */
    }
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Área do dono de campo</Text>
      </View>

      <Text style={styles.intro}>
        Cadastre seu estabelecimento pra receber o rateio das partidas diretamente, em vez de
        combinar por fora. Depois é só compartilhar o código com os admins das peladas que jogam no
        seu campo.
      </Text>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>{establishment ? 'Meu estabelecimento' : 'Cadastrar estabelecimento'}</Text>

        <TextField label="Nome" value={name} onChangeText={setName} placeholder="Arena Society Central" />

        <SegmentedControl<EstablishmentPayoutMethod>
          label="Como você quer receber o rateio"
          options={[
            { value: 'pix', label: 'Pix' },
            { value: 'in_person', label: 'Combinar na hora' },
          ]}
          value={payoutMethod}
          onChange={setPayoutMethod}
        />

        {payoutMethod === 'pix' && (
          <TextField label="Chave Pix" value={pixKey} onChangeText={setPixKey} placeholder="seu@pix.com ou CPF/telefone" />
        )}

        <Button
          label={establishment ? 'Salvar alterações' : 'Cadastrar estabelecimento'}
          onPress={handleSave}
          disabled={!name.trim() || (payoutMethod === 'pix' && !pixKey.trim())}
        />
      </Card>

      {establishment && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Vincular campos</Text>
          <Text style={styles.hint}>
            Compartilhe esse código com o admin de uma pelada — ele usa em Admin → Campos pra
            vincular o campo de lá ao seu estabelecimento.
          </Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{establishment.accessCode}</Text>
          </View>
          <Button label="Compartilhar código" variant="secondary" onPress={handleShare} />
          {establishment.payoutMethod === 'pix' && (
            <Badge label={`Recebe via Pix · ${establishment.pixKey}`} color={colors.primary} />
          )}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  intro: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.lg,
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
    marginBottom: spacing.xs,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
  },
  codeBox: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  codeText: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
