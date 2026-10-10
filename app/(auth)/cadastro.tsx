import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing } from '@/constants/theme';
import { useSports } from '@/constants/sports';
import { pickProfilePhoto } from '@/lib/photo';
import { isMockMode } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { PlayerPosition } from '@/types';

export default function CadastroScreen() {
  const SPORTS = useSports();
  const register = useAuthStore((s) => s.register);
  const authLoading = useAuthStore((s) => s.loading);
  const authError = useAuthStore((s) => s.error);
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const updateProfile = useAppStore((s) => s.updateCurrentPlayerProfile);
  const setPlayerPhoto = useAppStore((s) => s.setPlayerPhoto);

  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [position, setPosition] = useState<PlayerPosition>('line');
  const [favoriteSports, setFavoriteSports] = useState<string[]>(['futebol']);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [pickingPhoto, setPickingPhoto] = useState(false);

  async function handlePickPhoto() {
    setPickingPhoto(true);
    const uri = await pickProfilePhoto();
    if (uri) setPhotoUri(uri);
    setPickingPhoto(false);
  }

  function toggleFavoriteSport(sportId: string) {
    setFavoriteSports((current) => {
      if (current.includes(sportId)) {
        const next = current.filter((id) => id !== sportId);
        return next.length > 0 ? next : current;
      }
      return [...current, sportId];
    });
  }

  async function handleSubmit() {
    const ok = await register(isMockMode ? email || 'demo@pelada.app' : email, isMockMode ? password || 'demonstracao' : password, {
      name: name.trim() || 'Novo Jogador', phone: phone.trim() || null, preferredPosition: position, favoriteSports,
    });
    if (!ok) return;
    setPassword('');
    if (!useAuthStore.getState().isLoggedIn) { router.replace('/(auth)/confirmar-email'); return; }
    // No modo real, o perfil é criado pelo trigger e carregado pela sincronização.
    // Não sobrescreve o jogador em cache antes de receber o ID da nova conta.
    if (isMockMode) updateProfile({
      name: name.trim() || 'Novo Jogador',
      nickname: nickname.trim() || null,
      phone: phone.trim() || null,
      preferredPosition: position,
      favoriteSports,
    });
    if (isMockMode && photoUri) setPlayerPhoto(currentPlayerId, photoUri);
    router.replace('/(tabs)');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.containerContent}>
      <Text style={styles.title}>Criar conta</Text>
      <Text style={styles.subtitle}>Cadastre seu perfil de jogador para entrar nas peladas</Text>

      <Pressable style={styles.photoPicker} onPress={handlePickPhoto} disabled={pickingPhoto}>
        <Avatar name={name || '?'} photoUrl={photoUri} size={72} />
        <View style={styles.photoPickerBadge}>
          {pickingPhoto ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Ionicons name="camera" size={14} color={colors.onPrimary} />}
        </View>
      </Pressable>
      <Text style={styles.photoPickerLabel}>{pickingPhoto ? 'Abrindo galeria...' : 'Toque para adicionar uma foto'}</Text>

      <Text style={styles.label}>Nome completo</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Seu nome" placeholderTextColor={colors.textFaint} style={styles.input} />

      <Text style={styles.label}>Apelido (opcional)</Text>
      <TextInput value={nickname} onChangeText={setNickname} placeholder="Como te chamam na quadra" placeholderTextColor={colors.textFaint} style={styles.input} />

      <Text style={styles.label}>Telefone (opcional)</Text>
      <TextInput value={phone} onChangeText={setPhone} placeholder="(11) 99999-9999" placeholderTextColor={colors.textFaint} keyboardType="phone-pad" style={styles.input} />

      <Text style={styles.label}>E-mail</Text>
      <TextInput value={email} onChangeText={setEmail} placeholder="voce@email.com" placeholderTextColor={colors.textFaint} autoCapitalize="none" keyboardType="email-address" style={styles.input} />

      <Text style={styles.label}>Senha</Text>
      <TextInput value={password} onChangeText={setPassword} placeholder="Mínimo de 6 caracteres" placeholderTextColor={colors.textFaint} secureTextEntry style={styles.input} />

      <Text style={styles.label}>Posição preferida</Text>
      <View style={styles.positionRow}>
        <Pressable
          onPress={() => setPosition('line')}
          style={[styles.positionOption, position === 'line' && styles.positionOptionActive]}
        >
          <Text style={[styles.positionText, position === 'line' && styles.positionTextActive]}>Linha</Text>
        </Pressable>
        <Pressable
          onPress={() => setPosition('goalkeeper')}
          style={[styles.positionOption, position === 'goalkeeper' && styles.positionOptionActive]}
        >
          <Text style={[styles.positionText, position === 'goalkeeper' && styles.positionTextActive]}>Goleiro</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Esportes favoritos</Text>
      <Text style={styles.sportsHint}>Pode escolher mais de um — você é multi-esporte</Text>
      <View style={styles.sportsGrid}>
        {SPORTS.map((sport) => {
          const active = favoriteSports.includes(sport.id);
          return (
            <Pressable
              key={sport.id}
              onPress={() => toggleFavoriteSport(sport.id)}
              style={[styles.sportChip, active && { borderColor: sport.color, backgroundColor: `${sport.color}26` }]}
            >
              <Text style={styles.sportChipIcon}>{sport.icon}</Text>
              <Text style={[styles.sportChipText, active && { color: sport.color }]}>{sport.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {authError && <Text style={{ color: colors.danger, marginTop: spacing.sm }}>{authError}</Text>}
      <Button label="Criar conta" onPress={handleSubmit} loading={authLoading} disabled={!name.trim() || (!isMockMode && (!email.includes('@') || password.length < 6))} style={{ marginTop: spacing.xl }} />
      <Button label="Voltar" onPress={() => router.back()} variant="ghost" style={{ marginTop: spacing.sm }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  containerContent: {
    padding: spacing.xl,
    flexGrow: 1,
    justifyContent: 'center',
  },
  photoPicker: {
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  photoPickerBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  photoPickerLabel: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  positionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  positionOption: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  positionOptionActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(157,235,34,0.15)',
  },
  positionText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  positionTextActive: {
    color: colors.primary,
  },
  sportsHint: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
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
    borderRadius: radius.md,
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
});
