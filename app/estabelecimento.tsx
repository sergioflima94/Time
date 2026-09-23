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
import { WEEKDAY_LABELS } from '@/lib/format';
import { useAppStore } from '@/store/useAppStore';
import type { ChampionshipFormat, EstablishmentPayoutMethod, FieldBookingRecurrence } from '@/types';

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

      {establishment && <MyFieldsSection establishmentId={establishment.id} />}
      {establishment && <BookingsSection establishmentId={establishment.id} />}
      {establishment && <ChampionshipsSection establishmentId={establishment.id} />}
    </Screen>
  );
}

function MyFieldsSection({ establishmentId }: { establishmentId: string }) {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const myFields = useAppStore(
    useShallow((s) => s.fields.filter((f) => f.establishmentId === establishmentId && f.peladaId === null)),
  );
  const addEstablishmentField = useAppStore((s) => s.addEstablishmentField);
  const removeEstablishmentField = useAppStore((s) => s.removeEstablishmentField);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [sportId, setSportId] = useState('futebol');

  function handleAdd() {
    if (!name.trim()) return;
    addEstablishmentField(establishmentId, currentPlayerId, { name: name.trim(), address: address.trim(), sportId });
    setName('');
    setAddress('');
    setOpen(false);
  }

  return (
    <Card style={styles.section}>
      <View style={styles.headerRow2}>
        <Text style={styles.sectionTitle}>Meus campos</Text>
        <Pressable onPress={() => setOpen((v) => !v)}>
          <Ionicons name={open ? 'close' : 'add-circle'} size={22} color={colors.primary} />
        </Pressable>
      </View>
      <Text style={styles.hint}>
        Campos que você mesmo cadastra, um por esporte — não dependem de nenhuma pelada.
      </Text>

      {myFields.map((f) => {
        const sport = SPORTS.find((s) => s.id === f.sportId) ?? SPORTS[0];
        return (
          <View key={f.id} style={styles.champRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.champName}>{sport.icon} {f.name}</Text>
              <Text style={styles.hint}>{sport.label}{f.address ? ` · ${f.address}` : ''}</Text>
            </View>
            <Pressable onPress={() => removeEstablishmentField(f.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          </View>
        );
      })}
      {myFields.length === 0 && !open && <Text style={styles.hint}>Nenhum campo cadastrado ainda.</Text>}

      {open && (
        <View style={styles.form}>
          <TextField label="Nome do campo" value={name} onChangeText={setName} placeholder="Quadra 1 - Vôlei" />
          <TextField label="Endereço (opcional)" value={address} onChangeText={setAddress} placeholder="Rua Exemplo, 123" />
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
          <Button label="Adicionar campo" onPress={handleAdd} disabled={!name.trim()} />
        </View>
      )}
    </Card>
  );
}

function BookingsSection({ establishmentId }: { establishmentId: string }) {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const fields = useAppStore(useShallow((s) => s.fields.filter((f) => f.establishmentId === establishmentId)));
  const bookings = useAppStore(useShallow((s) => s.fieldBookings.filter((b) => b.establishmentId === establishmentId)));
  const peladas = useAppStore((s) => s.peladas);
  const addFieldBooking = useAppStore((s) => s.addFieldBooking);
  const removeFieldBooking = useAppStore((s) => s.removeFieldBooking);

  const [open, setOpen] = useState(false);
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? '');
  const [teamMode, setTeamMode] = useState<'pelada' | 'avulso'>('avulso');
  const [peladaId, setPeladaId] = useState(peladas[0]?.id ?? '');
  const [teamName, setTeamName] = useState('');
  const [recurrence, setRecurrence] = useState<FieldBookingRecurrence>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(6);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fieldOf = (id: string) => fields.find((f) => f.id === id);
  const sportOf = (sportId: string) => SPORTS.find((s) => s.id === sportId) ?? SPORTS[0];

  function handleAdd() {
    const finalFieldId = fieldId || fields[0]?.id;
    if (!finalFieldId) return;
    const finalTeamName = teamMode === 'pelada' ? peladas.find((p) => p.id === peladaId)?.name ?? '' : teamName.trim();
    if (!finalTeamName) return;
    if (recurrence === 'single' && !date.trim()) return;

    const result = addFieldBooking(establishmentId, currentPlayerId, {
      fieldId: finalFieldId,
      peladaId: teamMode === 'pelada' ? peladaId : null,
      teamName: finalTeamName,
      recurrence,
      dayOfWeek: recurrence === 'weekly' ? dayOfWeek : null,
      date: recurrence === 'single' ? date.trim() : null,
      time,
      durationMinutes: Number(durationMinutes) || 60,
      notes: notes.trim() || null,
    });

    if (result.conflicts.length > 0) {
      const c = result.conflicts[0];
      setError(`Conflito de horário: "${c.teamName}" já está reservado nesse campo e horário.`);
      return;
    }
    setError(null);
    setTeamName('');
    setNotes('');
    setOpen(false);
  }

  return (
    <Card style={styles.section}>
      <View style={styles.headerRow2}>
        <Text style={styles.sectionTitle}>Agendamento</Text>
        <Pressable onPress={() => setOpen((v) => !v)}>
          <Ionicons name={open ? 'close' : 'add-circle'} size={22} color={colors.primary} />
        </Pressable>
      </View>
      <Text style={styles.hint}>
        Reserve um campo pra um time — cadastrado (de uma pelada) ou avulso — de uma vez só ou fixo toda semana.
      </Text>

      {bookings.map((b) => {
        const field = fieldOf(b.fieldId);
        const fieldSport = field ? sportOf(field.sportId) : null;
        return (
          <View key={b.id} style={styles.champRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.champName}>
                {fieldSport?.icon} {b.teamName}
                {!b.peladaId && ' (avulso)'}
              </Text>
              <Text style={styles.hint}>
                {field?.name ?? '?'} ·{' '}
                {b.recurrence === 'weekly' ? `Fixo · ${WEEKDAY_LABELS[b.dayOfWeek ?? 0]}` : b.date} · {b.time} (
                {b.durationMinutes} min)
              </Text>
              {b.notes && <Text style={styles.hint}>{b.notes}</Text>}
            </View>
            <Pressable onPress={() => removeFieldBooking(b.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          </View>
        );
      })}
      {bookings.length === 0 && !open && <Text style={styles.hint}>Nenhum agendamento ainda.</Text>}

      {fields.length === 0 && open && (
        <Text style={styles.hint}>Cadastre um campo em "Meus campos" antes de agendar.</Text>
      )}

      {open && fields.length > 0 && (
        <View style={styles.form}>
          <Text style={styles.hint}>Campo</Text>
          <View style={styles.sportsGrid}>
            {fields.map((f) => {
              const active = fieldId === f.id;
              const sport = sportOf(f.sportId);
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFieldId(f.id)}
                  style={[styles.sportChip, active && { borderColor: sport.color, backgroundColor: `${sport.color}26` }]}
                >
                  <Text style={styles.sportChipIcon}>{sport.icon}</Text>
                  <Text style={[styles.sportChipText, active && { color: sport.color }]}>{f.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <SegmentedControl<'pelada' | 'avulso'>
            label="Time"
            options={[
              { value: 'avulso', label: 'Avulso' },
              { value: 'pelada', label: 'Cadastrado (pelada)' },
            ]}
            value={teamMode}
            onChange={setTeamMode}
          />
          {teamMode === 'avulso' ? (
            <TextField label="Nome do time" value={teamName} onChangeText={setTeamName} placeholder="Galera da rua" />
          ) : (
            <View style={styles.sportsGrid}>
              {peladas.map((p) => {
                const active = peladaId === p.id;
                const sport = sportOf(p.sportId);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setPeladaId(p.id)}
                    style={[styles.sportChip, active && { borderColor: sport.color, backgroundColor: `${sport.color}26` }]}
                  >
                    <Text style={styles.sportChipIcon}>{sport.icon}</Text>
                    <Text style={[styles.sportChipText, active && { color: sport.color }]}>{p.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <SegmentedControl<FieldBookingRecurrence>
            label="Recorrência"
            options={[
              { value: 'weekly', label: 'Fixo (toda semana)' },
              { value: 'single', label: 'Só uma vez' },
            ]}
            value={recurrence}
            onChange={setRecurrence}
          />

          {recurrence === 'weekly' ? (
            <>
              <Text style={styles.hint}>Dia da semana</Text>
              <View style={styles.sportsGrid}>
                {WEEKDAY_LABELS.map((label, idx) => {
                  const active = dayOfWeek === idx;
                  return (
                    <Pressable
                      key={label}
                      onPress={() => setDayOfWeek(idx)}
                      style={[styles.sportChip, active && { borderColor: colors.primary, backgroundColor: 'rgba(34,197,94,0.15)' }]}
                    >
                      <Text style={[styles.sportChipText, active && { color: colors.primary }]}>{label.slice(0, 3)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <TextField label="Data" value={date} onChangeText={setDate} placeholder="2026-09-25" />
          )}

          <View style={styles.row3}>
            <View style={styles.thirdInput}>
              <TextField label="Horário" value={time} onChangeText={setTime} placeholder="19:00" />
            </View>
            <View style={styles.thirdInput}>
              <TextField label="Duração (min)" value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="number-pad" />
            </View>
          </View>
          <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} placeholder="Mensalista, já pago" />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Button
            label="Reservar"
            onPress={handleAdd}
            disabled={(teamMode === 'avulso' && !teamName.trim()) || (recurrence === 'single' && !date.trim())}
          />
        </View>
      )}
    </Card>
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
    const matchingField = fields.find((f) => f.sportId === sportId) ?? fields[0];
    const championship = createChampionship(establishmentId, currentPlayerId, {
      name: name.trim(),
      sportId,
      format,
      fieldId: matchingField?.id ?? null,
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
  errorText: {
    color: colors.danger,
    fontSize: 12,
  },
});
