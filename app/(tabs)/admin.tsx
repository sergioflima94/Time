import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { InvitePeladaSection } from '@/components/InvitePeladaSection';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { SPORTS } from '@/constants/sports';
import { useCurrentPelada } from '@/hooks/useCurrentPelada';
import { drawMethodLabel, formatGameDateShort, recurrenceLabel, WEEKDAY_LABELS } from '@/lib/format';
import { formatBRL } from '@/lib/payments';
import { computeNextOccurrence } from '@/lib/schedule';
import { useAppStore } from '@/store/useAppStore';
import type { DrawMethod, RecurrenceType } from '@/types';

export default function AdminScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const pelada = useCurrentPelada();
  const isAdmin = useAppStore((s) => s.isAdmin(currentPlayerId, pelada.id));

  if (!isAdmin) {
    return (
      <Screen>
        <View style={styles.notAdmin}>
          <Ionicons name="lock-closed" size={32} color={colors.textFaint} />
          <Text style={styles.notAdminText}>Você não é administrador desta pelada.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Administração</Text>
      <PeladaInfoSection />
      <InviteSection />
      <MemberPermissionsSection />
      <AdminsSection />
      <FieldsSection />
      <SchedulesSection />
      <PunishmentsSection />
    </Screen>
  );
}

function PeladaInfoSection() {
  const pelada = useCurrentPelada();
  const updatePeladaInfo = useAppStore((s) => s.updatePeladaInfo);

  const [name, setName] = useState(pelada.name);
  const [description, setDescription] = useState(pelada.description ?? '');
  const [sportId, setSportId] = useState(pelada.sportId);

  const dirty = name.trim() !== pelada.name || description.trim() !== (pelada.description ?? '') || sportId !== pelada.sportId;

  function handleSave() {
    if (!name.trim()) return;
    updatePeladaInfo(pelada.id, { name: name.trim(), description: description.trim() || null, sportId });
  }

  return (
    <Card style={styles.section}>
      <Text style={styles.sectionTitle}>Sobre a pelada</Text>
      <TextField label="Nome do grupo" value={name} onChangeText={setName} placeholder="Ex: Pelada dos Amigos - Quintas" />
      <TextField
        label="Descrição"
        value={description}
        onChangeText={setDescription}
        placeholder="Ex: Society toda quinta às 20h, time completo"
        multiline
      />
      <Text style={styles.sportLabel}>Esporte</Text>
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
      <Button label="Salvar" small onPress={handleSave} disabled={!dirty || !name.trim()} />
    </Card>
  );
}

function InviteSection() {
  const pelada = useCurrentPelada();
  return <InvitePeladaSection pelada={pelada} />;
}

function MemberPermissionsSection() {
  const pelada = useCurrentPelada();
  const updatePeladaInvitePermissions = useAppStore((s) => s.updatePeladaInvitePermissions);
  const perms = pelada.memberInvitePermissions;

  function toggle(key: keyof typeof perms, value: boolean) {
    updatePeladaInvitePermissions(pelada.id, { ...perms, [key]: value });
  }

  return (
    <Card style={styles.section}>
      <Text style={styles.sectionTitle}>Permissões dos membros</Text>
      <Text style={styles.rowSub}>Por padrão, só admin convida gente. Libere pra qualquer membro se quiser.</Text>

      <View style={styles.permissionRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.permissionLabel}>Convidar jogador livre pro próximo jogo</Text>
          <Text style={styles.rowSub}>Qualquer membro (não só admin) pode chamar alguém de fora pra completar o jogo.</Text>
        </View>
        <Switch
          value={perms.canInviteFreeAgents}
          onValueChange={(v) => toggle('canInviteFreeAgents', v)}
          trackColor={{ false: colors.cardBorder, true: colors.primary }}
          thumbColor={colors.white}
        />
      </View>

      <View style={styles.permissionRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.permissionLabel}>Convidar gente pra entrar na pelada</Text>
          <Text style={styles.rowSub}>Qualquer membro vê e compartilha o código de convite, não só admin.</Text>
        </View>
        <Switch
          value={perms.canInviteNewMembers}
          onValueChange={(v) => toggle('canInviteNewMembers', v)}
          trackColor={{ false: colors.cardBorder, true: colors.primary }}
          thumbColor={colors.white}
        />
      </View>
    </Card>
  );
}

function AdminsSection() {
  const pelada = useCurrentPelada();
  const players = useAppStore((s) => s.players);
  const memberships = useAppStore(useShallow((s) => s.memberships.filter((m) => m.peladaId === pelada.id)));
  const addAdmin = useAppStore((s) => s.addAdmin);
  const removeAdmin = useAppStore((s) => s.removeAdmin);

  return (
    <Card style={styles.section}>
      <Text style={styles.sectionTitle}>Administradores</Text>
      {memberships.map((m) => {
        const player = players.find((p) => p.id === m.playerId);
        if (!player) return null;
        return (
          <View key={m.playerId} style={styles.row}>
            <View style={styles.rowWithAvatar}>
              <Avatar name={player.name} photoUrl={player.avatarUrl} size={28} />
              <Text style={styles.rowText}>{player.name}</Text>
            </View>
            {m.role === 'admin' ? (
              <View style={styles.rowActions}>
                <Badge label="Admin" color={colors.primary} />
                <Pressable onPress={() => removeAdmin(pelada.id, m.playerId)}>
                  <Text style={styles.linkDanger}>remover</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => addAdmin(pelada.id, m.playerId)}>
                <Text style={styles.link}>tornar admin</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </Card>
  );
}

function FieldsSection() {
  const pelada = useCurrentPelada();
  const fields = useAppStore(useShallow((s) => s.fields.filter((f) => f.peladaId === pelada.id)));
  const establishments = useAppStore((s) => s.establishments);
  const addField = useAppStore((s) => s.addField);
  const linkFieldToEstablishment = useAppStore((s) => s.linkFieldToEstablishment);
  const unlinkFieldEstablishment = useAppStore((s) => s.unlinkFieldEstablishment);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [linkingFieldId, setLinkingFieldId] = useState<string | null>(null);
  const [codeDraft, setCodeDraft] = useState('');
  const [linkError, setLinkError] = useState(false);

  function handleAdd() {
    if (!name.trim()) return;
    addField(pelada.id, name.trim(), address.trim(), '');
    setName('');
    setAddress('');
    setOpen(false);
  }

  function handleLink(fieldId: string) {
    if (!codeDraft.trim()) return;
    const ok = linkFieldToEstablishment(fieldId, codeDraft.trim());
    if (!ok) {
      setLinkError(true);
      return;
    }
    setLinkingFieldId(null);
    setCodeDraft('');
    setLinkError(false);
  }

  return (
    <Card style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Campos</Text>
        <Pressable onPress={() => setOpen((v) => !v)}>
          <Ionicons name={open ? 'close' : 'add-circle'} size={22} color={colors.primary} />
        </Pressable>
      </View>
      {fields.map((f) => {
        const establishment = establishments.find((e) => e.id === f.establishmentId);
        return (
          <View key={f.id} style={styles.fieldBlock}>
            <View style={styles.row}>
              <View>
                <Text style={styles.rowText}>{f.name}</Text>
                {f.address && <Text style={styles.rowSub}>{f.address}</Text>}
                {establishment ? (
                  <Text style={styles.establishmentLinked}>
                    🏟️ Dono cadastrado · recebe{' '}
                    {establishment.payoutMethod === 'pix' ? `via Pix (${establishment.pixKey})` : 'na hora'}
                  </Text>
                ) : (
                  <Text style={styles.rowSub}>Sem dono cadastrado — o rateio fica combinado por fora</Text>
                )}
              </View>
              {establishment ? (
                <Pressable onPress={() => unlinkFieldEstablishment(f.id)}>
                  <Text style={styles.linkDanger}>desvincular</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => { setLinkingFieldId(f.id); setLinkError(false); }}>
                  <Text style={styles.link}>vincular dono</Text>
                </Pressable>
              )}
            </View>
            {linkingFieldId === f.id && (
              <View style={styles.linkForm}>
                <TextField
                  label=""
                  value={codeDraft}
                  onChangeText={(v) => { setCodeDraft(v); setLinkError(false); }}
                  placeholder="Código do estabelecimento"
                  autoCapitalize="characters"
                  style={{ flex: 1 }}
                />
                <Button label="Vincular" small onPress={() => handleLink(f.id)} />
              </View>
            )}
            {linkingFieldId === f.id && linkError && (
              <Text style={styles.linkErrorText}>Código não encontrado.</Text>
            )}
          </View>
        );
      })}
      {open && (
        <View style={styles.form}>
          <TextField label="Nome do campo" value={name} onChangeText={setName} placeholder="Arena Society Central" />
          <TextField label="Endereço" value={address} onChangeText={setAddress} placeholder="Rua, número, bairro" />
          <Button label="Adicionar campo" onPress={handleAdd} disabled={!name.trim()} />
        </View>
      )}
    </Card>
  );
}

function SchedulesSection() {
  const pelada = useCurrentPelada();
  const fields = useAppStore(useShallow((s) => s.fields.filter((f) => f.peladaId === pelada.id)));
  const schedules = useAppStore(useShallow((s) => s.schedules.filter((sc) => sc.peladaId === pelada.id)));
  const games = useAppStore(useShallow((s) => s.games.filter((g) => g.peladaId === pelada.id)));
  const addSchedule = useAppStore((s) => s.addSchedule);
  const addGameFromSchedule = useAppStore((s) => s.addGameFromSchedule);

  const [open, setOpen] = useState(false);
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? '');
  const [recurrence, setRecurrence] = useState<RecurrenceType>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(4);
  const [time, setTime] = useState('20:00');
  const [maxPlayers, setMaxPlayers] = useState(String(pelada.defaultMaxPlayers));
  const [drawMethod, setDrawMethod] = useState<DrawMethod>('rating');
  const [fieldCost, setFieldCost] = useState('');
  const [goalLimit, setGoalLimit] = useState('');

  function handleAdd() {
    if (!fieldId) return;
    addSchedule({
      peladaId: pelada.id,
      fieldId,
      recurrence,
      dayOfWeek: recurrence === 'single' ? null : dayOfWeek,
      time,
      startDate: new Date().toISOString().slice(0, 10),
      maxPlayers: Number(maxPlayers) || pelada.defaultMaxPlayers,
      matchMinutes: pelada.defaultMatchMinutes,
      drawMethod,
      defaultFieldCost: fieldCost.trim() ? Number(fieldCost.replace(',', '.')) : null,
      matchGoalLimit: goalLimit.trim() ? Number(goalLimit) : null,
    });
    setOpen(false);
  }

  return (
    <Card style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Agenda</Text>
        <Pressable onPress={() => setOpen((v) => !v)}>
          <Ionicons name={open ? 'close' : 'add-circle'} size={22} color={colors.primary} />
        </Pressable>
      </View>

      {schedules.map((s) => {
        const field = fields.find((f) => f.id === s.fieldId);
        const next = computeNextOccurrence(s, games);
        return (
          <View key={s.id} style={styles.scheduleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowText}>
                {recurrenceLabel(s.recurrence)} {s.recurrence !== 'single' && `· ${WEEKDAY_LABELS[s.dayOfWeek ?? 0]}`} · {s.time}
              </Text>
              <Text style={styles.rowSub}>
                {field?.name} · até {s.maxPlayers} vagas · {drawMethodLabel(s.drawMethod)} · {s.matchMinutes} min
                {s.matchGoalLimit ? ` ou ${s.matchGoalLimit} gols` : ''}
                {s.defaultFieldCost ? ` · ${formatBRL(s.defaultFieldCost)}` : ''}
              </Text>
              <Text style={styles.rowSub}>Próximo: {formatGameDateShort(next.toISOString())}</Text>
            </View>
            <Button
              label="Gerar jogo"
              small
              variant="secondary"
              onPress={() => addGameFromSchedule(s.id, next.toISOString())}
            />
          </View>
        );
      })}

      {open && (
        <View style={styles.form}>
          <SegmentedControl
            label="Recorrência"
            value={recurrence}
            onChange={setRecurrence}
            options={[
              { value: 'single', label: 'Único' },
              { value: 'weekly', label: 'Semanal' },
              { value: 'biweekly', label: 'Quinzenal' },
            ]}
          />
          {recurrence !== 'single' && (
            <SegmentedControl
              label="Dia da semana"
              value={String(dayOfWeek)}
              onChange={(v) => setDayOfWeek(Number(v))}
              options={WEEKDAY_LABELS.map((label, idx) => ({ value: String(idx), label: label.slice(0, 3) }))}
            />
          )}
          <TextField label="Horário (HH:mm)" value={time} onChangeText={setTime} placeholder="20:00" />
          <SegmentedControl
            label="Campo"
            value={fieldId}
            onChange={setFieldId}
            options={fields.map((f) => ({ value: f.id, label: f.name }))}
          />
          <TextField label="Limite de vagas" value={maxPlayers} onChangeText={setMaxPlayers} keyboardType="number-pad" />
          <TextField
            label="Custo da quadra (opcional, para rateio)"
            value={fieldCost}
            onChangeText={setFieldCost}
            placeholder="Ex: 240"
            keyboardType="decimal-pad"
          />
          <TextField
            label="Limite de gols por rodada (opcional)"
            value={goalLimit}
            onChangeText={setGoalLimit}
            placeholder="Ex: 2 — vale o que vier primeiro, gols ou tempo"
            keyboardType="number-pad"
          />
          <SegmentedControl
            label="Método de sorteio padrão"
            value={drawMethod}
            onChange={setDrawMethod}
            options={[
              { value: 'arrival', label: 'Chegada' },
              { value: 'random', label: 'Aleatório' },
              { value: 'rating', label: 'Por nota' },
            ]}
          />
          <Button label="Criar agenda" onPress={handleAdd} disabled={!fieldId} />
        </View>
      )}
    </Card>
  );
}

function PunishmentsSection() {
  const pelada = useCurrentPelada();
  const players = useAppStore((s) => s.players);
  const punishments = useAppStore(useShallow((s) => s.punishments.filter((p) => p.peladaId === pelada.id)));

  return (
    <Card style={styles.section}>
      <Text style={styles.sectionTitle}>Punições registradas</Text>
      {punishments.length === 0 ? (
        <Text style={styles.rowSub}>Nenhuma falta registrada até agora.</Text>
      ) : (
        punishments
          .slice()
          .reverse()
          .map((p) => {
            const player = players.find((pl) => pl.id === p.playerId);
            return (
              <View key={p.id} style={styles.row}>
                <View style={styles.rowWithAvatar}>
                  {player && <Avatar name={player.name} photoUrl={player.avatarUrl} size={28} />}
                  <Text style={styles.rowText}>{player?.name}</Text>
                </View>
                <Badge
                  label={p.suspendedUntilGameCount > 0 ? `Suspenso ${p.suspendedUntilGameCount} jogo(s)` : `Aviso (nível ${p.strikeLevel})`}
                  color={p.suspendedUntilGameCount > 0 ? colors.danger : colors.warning}
                />
              </View>
            );
          })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing.lg,
  },
  inviteCodeBox: {
    backgroundColor: colors.bgElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderStyle: 'dashed',
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  inviteCodeText: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
  },
  notAdmin: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
    gap: spacing.md,
  },
  notAdminText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sportLabel: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sportsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  rowWithAvatar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  rowSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  permissionLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  link: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  linkDanger: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  form: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  fieldBlock: {
    paddingVertical: spacing.xs,
  },
  establishmentLinked: {
    color: colors.primary,
    fontSize: 11,
    marginTop: 2,
  },
  linkForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  linkErrorText: {
    color: colors.danger,
    fontSize: 11,
    marginTop: 2,
  },
});
