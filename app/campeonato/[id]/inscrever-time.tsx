import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { useMyPeladas } from '@/hooks/useCurrentPelada';
import { pickProfilePhoto } from '@/lib/photo';
import { generateTeamLogo } from '@/lib/teamLogo';
import { useAppStore } from '@/store/useAppStore';

const TEAM_COLORS = ['#22C55E', '#3B82F6', '#EF4444', '#D4AF37', '#7C3AED', '#EC4899', '#22D3EE', '#F97316'];

export default function InscreverTimeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const championship = useAppStore((s) => s.championships.find((c) => c.id === id));
  const registerChampionshipTeam = useAppStore((s) => s.registerChampionshipTeam);
  const myPeladas = useMyPeladas();
  const players = useAppStore((s) => s.players);
  const memberships = useAppStore(useShallow((s) => s.memberships.filter((m) => m.active)));

  const [source, setSource] = useState<'pelada' | 'avulso'>('pelada');
  const [peladaId, setPeladaId] = useState<string | null>(myPeladas[0]?.id ?? null);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(
    () => new Set(memberships.filter((m) => m.peladaId === myPeladas[0]?.id).map((m) => m.playerId)),
  );
  const [name, setName] = useState(myPeladas[0]?.name ?? '');
  const [color, setColor] = useState(TEAM_COLORS[0]);
  const [guestNames, setGuestNames] = useState<string[]>([]);
  const [guestDraft, setGuestDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [pickingLogo, setPickingLogo] = useState(false);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatingLogo, setGeneratingLogo] = useState(false);
  const [logoIsDemo, setLogoIsDemo] = useState(false);

  const peladaMembers = peladaId
    ? memberships.filter((m) => m.peladaId === peladaId).map((m) => players.find((p) => p.id === m.playerId)).filter((p): p is NonNullable<typeof p> => !!p)
    : [];

  function pickPelada(pid: string) {
    setPeladaId(pid);
    const pelada = myPeladas.find((p) => p.id === pid);
    if (pelada && !name) setName(pelada.name);
    const ids = memberships.filter((m) => m.peladaId === pid).map((m) => m.playerId);
    setSelectedMembers(new Set(ids));
  }

  function toggleMember(playerId: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  function addGuestName() {
    if (!guestDraft.trim()) return;
    setGuestNames((prev) => [...prev, guestDraft.trim()]);
    setGuestDraft('');
  }

  function removeGuestName(idx: number) {
    setGuestNames((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handlePickLogo() {
    setPickingLogo(true);
    const uri = await pickProfilePhoto();
    if (uri) {
      setLogoUrl(uri);
      setLogoIsDemo(false);
    }
    setPickingLogo(false);
  }

  async function handleGenerateLogo() {
    if (!aiPrompt.trim()) return;
    setGeneratingLogo(true);
    const { url, isDemo } = await generateTeamLogo(aiPrompt.trim());
    setLogoUrl(url);
    setLogoIsDemo(isDemo);
    setGeneratingLogo(false);
  }

  function handleSubmit() {
    if (!championship || !name.trim()) return;
    const playerIds = source === 'pelada' ? [...selectedMembers] : [];
    if (source === 'pelada' && playerIds.length === 0) {
      setError('Selecione pelo menos um jogador.');
      return;
    }
    if (source === 'avulso' && guestNames.length === 0) {
      setError('Adicione pelo menos um jogador.');
      return;
    }
    const team = registerChampionshipTeam(championship.registrationCode, {
      name: name.trim(),
      color,
      logoUrl,
      peladaId: source === 'pelada' ? peladaId : null,
      registeredByPlayerId: currentPlayerId,
      playerIds,
      guestNames: source === 'avulso' ? guestNames : [],
    });
    if (!team) {
      setError('Não foi possível inscrever o time.');
      return;
    }
    router.replace(`/campeonato/${championship.id}`);
  }

  if (!championship) {
    return (
      <Screen>
        <Text style={styles.notFound}>Campeonato não encontrado.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{getSport(championship.sportId).icon} Inscrever time · {championship.name}</Text>
      </View>

      <SegmentedControl<'pelada' | 'avulso'>
        label="De onde vem o time?"
        options={[
          { value: 'pelada', label: 'Minha pelada' },
          { value: 'avulso', label: 'Time avulso' },
        ]}
        value={source}
        onChange={setSource}
      />

      {source === 'pelada' && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Qual pelada?</Text>
          {myPeladas.length === 0 && <Text style={styles.hint}>Você não faz parte de nenhuma pelada ainda.</Text>}
          {myPeladas.map((p) => (
            <Pressable key={p.id} style={styles.peladaRow} onPress={() => pickPelada(p.id)}>
              <Ionicons name={peladaId === p.id ? 'radio-button-on' : 'radio-button-off'} size={18} color={peladaId === p.id ? colors.primary : colors.textFaint} />
              <Text style={styles.peladaName}>{p.name}</Text>
            </Pressable>
          ))}

          {peladaId && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>Elenco pro campeonato</Text>
              {peladaMembers.map((member) => (
                <Pressable key={member.id} style={styles.memberRow} onPress={() => toggleMember(member.id)}>
                  <Ionicons name={selectedMembers.has(member.id) ? 'checkbox' : 'square-outline'} size={18} color={selectedMembers.has(member.id) ? colors.primary : colors.textFaint} />
                  <Avatar name={member.name} photoUrl={member.avatarUrl} size={28} />
                  <Text style={styles.memberName}>{member.name}</Text>
                </Pressable>
              ))}
            </>
          )}
        </Card>
      )}

      {source === 'avulso' && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Jogadores do time</Text>
          <Text style={styles.hint}>Digite o nome de cada jogador (não precisa ter conta no app).</Text>
          <View style={styles.guestForm}>
            <TextField label="" value={guestDraft} onChangeText={setGuestDraft} placeholder="Nome do jogador" style={{ flex: 1 }} />
            <Button label="+" small onPress={addGuestName} />
          </View>
          {guestNames.map((n, idx) => (
            <View key={idx} style={styles.guestChip}>
              <Text style={styles.guestChipText}>{n}</Text>
              <Pressable onPress={() => removeGuestName(idx)}>
                <Ionicons name="close" size={14} color={colors.textFaint} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Nome e cor do time</Text>
        <TextField label="Nome do time" value={name} onChangeText={setName} placeholder="Nome do time" />
        <View style={styles.colorRow}>
          {TEAM_COLORS.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchSelected]}>
              {color === c && <Ionicons name="checkmark" size={16} color={colors.white} />}
            </Pressable>
          ))}
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Emblema do time</Text>
        <View style={styles.logoRow}>
          <View style={[styles.logoPreview, { borderColor: color }]}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="cover" />
            ) : (
              <Ionicons name="shield-outline" size={28} color={colors.textFaint} />
            )}
          </View>
          <View style={styles.logoActions}>
            <Pressable onPress={handlePickLogo} disabled={pickingLogo} style={styles.logoActionBtn}>
              {pickingLogo ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="image" size={14} color={colors.primary} />}
              <Text style={styles.logoActionText}>Escolher da galeria</Text>
            </Pressable>
            <Pressable onPress={() => setAiPromptOpen((v) => !v)} style={styles.logoActionBtn}>
              <Ionicons name="sparkles" size={14} color={colors.secondary} />
              <Text style={[styles.logoActionText, { color: colors.secondary }]}>Gerar com IA</Text>
            </Pressable>
          </View>
        </View>

        {aiPromptOpen && (
          <View style={styles.aiForm}>
            <TextField
              label="Descreva o emblema"
              value={aiPrompt}
              onChangeText={setAiPrompt}
              placeholder="Ex: leão dourado com uma bola de futebol"
            />
            <Button
              label={generatingLogo ? 'Gerando...' : 'Gerar emblema'}
              small
              variant="secondary"
              onPress={handleGenerateLogo}
              disabled={!aiPrompt.trim() || generatingLogo}
              loading={generatingLogo}
            />
            {logoIsDemo && logoUrl && (
              <Text style={styles.hint}>
                ✨ Emblema de exemplo (gerador de IA real precisa da OpenAI configurada no backend — ver README).
              </Text>
            )}
          </View>
        )}
      </Card>

      {error && <Text style={styles.errorText}>{error}</Text>}
      <Button label="Inscrever time" onPress={handleSubmit} disabled={!name.trim()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  notFound: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  section: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
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
  peladaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  peladaName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 5,
  },
  memberName: {
    color: colors.text,
    fontSize: 13,
  },
  guestForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  guestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginTop: 4,
  },
  guestChipText: {
    color: colors.text,
    fontSize: 13,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: colors.text,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoPreview: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoActions: {
    gap: spacing.sm,
  },
  logoActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoActionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  aiForm: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: spacing.sm,
  },
});
