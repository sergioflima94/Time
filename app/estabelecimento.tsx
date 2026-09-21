import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { SPORTS } from '@/constants/sports';
import { formatChampionshipStatus } from '@/lib/championship';
import { useAppStore } from '@/store/useAppStore';
import type { ChampionshipFormat, EstablishmentPayoutMethod } from '@/types';

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

      {establishment && <ChampionshipsSection establishmentId={establishment.id} />}
    </Screen>
  );
}

function ChampionshipsSection({ establishmentId }: { establishmentId: string }) {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const fields = useAppStore(useShallow((s) => s.fields.filter((f) => f.establishmentId === establishmentId)));
  const championships = useAppStore(useShallow((s) => s.championships.filter((c) => c.establishmentId === establishmentId)));
  const createChampionship = useAppStore((s) => s.createChampionship);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sportId, setSportId] = useState('futebol');
  const [format, setFormat] = useState<ChampionshipFormat>('round_robin');
  const [maxTeams, setMaxTeams] = useState('8');
  const [entryFee, setEntryFee] = useState('');
  const [matchMinutes, setMatchMinutes] = useState('10');

  function handleCreate() {
    if (!name.trim()) return;
    const championship = createChampionship(establishmentId, currentPlayerId, {
      name: name.trim(),
      sportId,
      format,
      fieldId: fields[0]?.id ?? null,
      maxTeams: maxTeams.trim() ? Number(maxTeams) : null,
      entryFee: entryFee.trim() ? Number(entryFee.replace(',', '.')) : null,
      matchMinutes: Number(matchMinutes) || 10,
    });
    setName('');
    setEntryFee('');
    setOpen(false);
    router.push(`/campeonato/${championship.id}`);
  }

  return (
    <Card style={styles.section}>
      <View style={styles.headerRow2}>
        <Text style={styles.sectionTitle}>Campeonatos</Text>
        <Pressable onPress={() => setOpen((v) => !v)}>
          <Ionicons name={open ? 'close' : 'add-circle'} size={22} color={colors.primary} />
        </Pressable>
      </View>

      {championships.map((c) => {
        const sport = SPORTS.find((s) => s.id === c.sportId) ?? SPORTS[0];
        return (
          <Pressable key={c.id} style={styles.champRow} onPress={() => router.push(`/campeonato/${c.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.champName}>{sport.icon} {c.name}</Text>
              <Text style={styles.hint}>{sport.label} · {c.format === 'round_robin' ? 'Pontos corridos' : 'Mata-mata'}</Text>
            </View>
            <Badge label={formatChampionshipStatus(c.status)} color={c.status === 'registration' ? colors.secondary : colors.primary} />
          </Pressable>
        );
      })}
      {championships.length === 0 && !open && <Text style={styles.hint}>Nenhum campeonato criado ainda.</Text>}

      {open && (
        <View style={styles.form}>
          <TextField label="Nome do campeonato" value={name} onChangeText={setName} placeholder="Copa Arena Society Central" />
          <Text style={styles.hint}>Esporte</Text>
          <View style={styles.sportsGrid}>
            {SPORTS.map((sport) => {
              const active = sportId === sport.id;
              return (
                <Pressable
                  key={sport.id}
                  onPress={() => setSportId(sport.id)}
                  style={[styles.sportChip, active && { borderColor: sport.color, backgroundColor: `${sport.color}26` }]}
                >
                  <Text style={styles.sportChipIcon}>{sport.icon}</Text>
                  <Text style={[styles.sportChipText, active && { color: sport.color }]}>{sport.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <SegmentedControl<ChampionshipFormat>
            label="Formato"
            options={[
              { value: 'round_robin', label: 'Pontos corridos' },
              { value: 'knockout', label: 'Mata-mata' },
            ]}
            value={format}
            onChange={setFormat}
          />
          <View style={styles.row3}>
            <View style={styles.thirdInput}>
              <TextField label="Máx. times" value={maxTeams} onChangeText={setMaxTeams} keyboardType="number-pad" />
            </View>
            <View style={styles.thirdInput}>
              <TextField label="Duração (min)" value={matchMinutes} onChangeText={setMatchMinutes} keyboardType="number-pad" />
            </View>
            <View style={styles.thirdInput}>
              <TextField label="Taxa (R$)" value={entryFee} onChangeText={setEntryFee} keyboardType="decimal-pad" />
            </View>
          </View>
          <Button label="Criar campeonato" onPress={handleCreate} disabled={!name.trim()} />
        </View>
      )}
    </Card>
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
  headerRow2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  champRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    marginTop: spacing.xs,
  },
  champName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  sportsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sportChip: {
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
  sportChipIcon: {
    fontSize: 15,
  },
  sportChipText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  form: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: spacing.sm,
  },
  row3: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  thirdInput: {
    flex: 1,
  },
});
