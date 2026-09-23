import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import type { EstablishmentPayoutMethod } from '@/types';

export default function MyEstablishmentsScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const myEstablishments = useAppStore(
    useShallow((s) => s.establishments.filter((e) => e.ownerPlayerId === currentPlayerId)),
  );
  const fields = useAppStore((s) => s.fields);
  const createEstablishment = useAppStore((s) => s.createEstablishment);

  const [creating, setCreating] = useState(myEstablishments.length === 0);
  const [name, setName] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<EstablishmentPayoutMethod>('pix');
  const [pixKey, setPixKey] = useState('');

  function handleCreate() {
    if (!name.trim()) return;
    const establishment = createEstablishment(currentPlayerId, {
      name: name.trim(),
      payoutMethod,
      pixKey: payoutMethod === 'pix' ? pixKey.trim() || null : null,
    });
    setName('');
    setPixKey('');
    setCreating(false);
    router.push(`/estabelecimento/${establishment.id}`);
  }

  function fieldCount(establishmentId: string) {
    return fields.filter((f) => f.establishmentId === establishmentId).length;
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>🏟️ Meus estabelecimentos</Text>
      </View>

      <Text style={styles.intro}>
        Cadastre seu campo/quadra pra receber o rateio das partidas diretamente, organizar
        agendamento e campeonatos — e acompanhar quanto entrou. Você pode ter mais de um
        estabelecimento.
      </Text>

      {myEstablishments.map((e) => (
        <Pressable key={e.id} onPress={() => router.push(`/estabelecimento/${e.id}`)}>
          <Card style={styles.estRow}>
            <View style={styles.estIcon}>
              <Text style={styles.estIconText}>🏟️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.estName} numberOfLines={1}>
                {e.name}
              </Text>
              <Text style={styles.estSub}>{fieldCount(e.id)} campo{fieldCount(e.id) === 1 ? '' : 's'}</Text>
            </View>
            <Badge label={e.payoutMethod === 'pix' ? 'Pix' : 'Na hora'} color={colors.special} />
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Card>
        </Pressable>
      ))}

      {!creating && (
        <Button label="+ Cadastrar novo estabelecimento" variant="secondary" onPress={() => setCreating(true)} />
      )}

      {creating && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Cadastrar estabelecimento</Text>

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
            label="Cadastrar estabelecimento"
            onPress={handleCreate}
            disabled={!name.trim() || (payoutMethod === 'pix' && !pixKey.trim())}
          />
          {myEstablishments.length > 0 && (
            <Button label="Cancelar" variant="ghost" small onPress={() => setCreating(false)} />
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
  estRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  estIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(124,58,237,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  estIconText: {
    fontSize: 18,
  },
  estName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  estSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  section: {
    marginTop: spacing.lg,
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
});
