import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * Página pública do estabelecimento — não exige estar logado nem ser dono/membro de
 * nenhuma pelada. Qualquer pessoa com o link marca um jogo direto num campo daqui; se
 * ainda não tem conta no app, o próprio formulário já cria o perfil de jogador (ver
 * handleBook) e loga, sem precisar passar pela tela de cadastro separada.
 */
export default function PublicEstablishmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const establishmentId = id ?? '';
  const establishment = useAppStore((s) => s.establishments.find((e) => e.id === establishmentId));
  const fields = useAppStore(useShallow((s) => s.fields.filter((f) => f.establishmentId === establishmentId)));
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const addFieldBooking = useAppStore((s) => s.addFieldBooking);
  const updateCurrentPlayerProfile = useAppStore((s) => s.updateCurrentPlayerProfile);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const login = useAuthStore((s) => s.login);

  const [fieldId, setFieldId] = useState(fields[0]?.id ?? '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [teamName, setTeamName] = useState('');
  const [notes, setNotes] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ date: string; time: string } | null>(null);

  const fieldOf = (fid: string) => fields.find((f) => f.id === fid);

  function handleBook() {
    const finalFieldId = fieldId || fields[0]?.id;
    if (!finalFieldId || !date.trim() || !teamName.trim()) return;
    if (!isLoggedIn && !signupName.trim()) {
      setError('Digite seu nome pra criar seu perfil.');
      return;
    }

    if (!isLoggedIn) {
      updateCurrentPlayerProfile({
        name: signupName.trim(),
        nickname: null,
        phone: signupPhone.trim() || null,
        preferredPosition: 'line',
        favoriteSports: [fieldOf(finalFieldId)?.sportId ?? 'futebol'],
      });
      login();
    }

    const result = addFieldBooking(establishmentId, currentPlayerId, {
      fieldId: finalFieldId,
      peladaId: null,
      teamName: teamName.trim(),
      recurrence: 'single',
      dayOfWeek: null,
      date: date.trim(),
      time,
      durationMinutes: Number(durationMinutes) || 60,
      notes: notes.trim() || null,
    });

    if (result.conflicts.length > 0) {
      setError(`Esse horário já está reservado: "${result.conflicts[0].teamName}".`);
      return;
    }
    setError(null);
    setDone({ date: date.trim(), time });
  }

  if (!establishment) {
    return (
      <Screen>
        <Text style={styles.hint}>Estabelecimento não encontrado.</Text>
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <View style={styles.doneWrap}>
          <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
          <Text style={styles.doneTitle}>Jogo marcado!</Text>
          <Text style={styles.hint}>
            {establishment.name} · {done.date} às {done.time}
          </Text>
          <Button label="Ir pro app" onPress={() => router.replace('/(tabs)')} style={{ marginTop: spacing.lg }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>⚽ {establishment.name}</Text>
        <Text style={styles.subtitle}>Marque um jogo direto por aqui — sem precisar já ter conta no app.</Text>
      </View>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Campos</Text>
        {fields.map((f) => {
          const sport = getSport(f.sportId);
          return (
            <View key={f.id} style={styles.fieldRow}>
              <Text style={styles.fieldRowIcon}>{sport.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldRowName}>{f.name}</Text>
                {f.address && <Text style={styles.hint}>{f.address}</Text>}
              </View>
            </View>
          );
        })}
        {fields.length === 0 && <Text style={styles.hint}>Nenhum campo cadastrado ainda.</Text>}
      </Card>

      {fields.length > 0 && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Marcar um jogo</Text>

          <Text style={styles.hint}>Campo</Text>
          <View style={styles.chipsRow}>
            {fields.map((f) => {
              const active = fieldId === f.id;
              const sport = getSport(f.sportId);
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFieldId(f.id)}
                  style={[styles.chip, active && { borderColor: sport.color, backgroundColor: `${sport.color}26` }]}
                >
                  <Text style={styles.chipIcon}>{sport.icon}</Text>
                  <Text style={[styles.chipText, active && { color: sport.color }]}>{f.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextField label="Data" value={date} onChangeText={setDate} placeholder="2026-10-05" />
          <View style={styles.row3}>
            <View style={styles.thirdInput}>
              <TextField label="Horário" value={time} onChangeText={setTime} placeholder="19:00" />
            </View>
            <View style={styles.thirdInput}>
              <TextField label="Duração (min)" value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="number-pad" />
            </View>
          </View>
          <TextField label="Nome do time/grupo" value={teamName} onChangeText={setTeamName} placeholder="Galera da rua" />
          <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} placeholder="Somos 10, precisa de coletes" />

          {!isLoggedIn && (
            <View style={styles.signupBox}>
              <Text style={styles.signupTitle}>Pra confirmar, crie seu perfil rapidinho</Text>
              <TextField label="Seu nome" value={signupName} onChangeText={setSignupName} placeholder="Seu nome" />
              <TextField label="Telefone (opcional)" value={signupPhone} onChangeText={setSignupPhone} placeholder="(11) 99999-9999" keyboardType="phone-pad" />
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Button
            label="Marcar jogo"
            onPress={handleBook}
            disabled={!date.trim() || !teamName.trim() || (!isLoggedIn && !signupName.trim())}
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: colors.textFaint,
    fontSize: 12,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
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
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    marginTop: spacing.xs,
  },
  fieldRowIcon: {
    fontSize: 18,
  },
  fieldRowName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  chipIcon: {
    fontSize: 15,
  },
  chipText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  row3: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  thirdInput: {
    flex: 1,
  },
  signupBox: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: spacing.sm,
  },
  signupTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
  },
  doneWrap: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: 4,
  },
  doneTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
});
