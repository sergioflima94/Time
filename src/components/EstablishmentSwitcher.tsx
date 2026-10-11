import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import type { Establishment } from '@/types';
import { AdaptiveSelect } from './ui/AdaptiveSelect';
import { Button } from './ui/Button';

/** Troca rápida entre os estabelecimentos que o jogador é dono — mesmo padrão do PeladaSwitcher. */
export function EstablishmentSwitcher({ current, all }: { current: Establishment; all: Establishment[] }) {
  const [open, setOpen] = useState(false);

  if (all.length > 3) return <View style={{gap:spacing.xs}}>
    <AdaptiveSelect title="Trocar de estabelecimento" value={current.id} onChange={id=>{if(id!==current.id)router.replace(`/estabelecimento/${id}`);}}
      options={all.map(e=>({value:e.id,label:e.name}))}
      footer={close=><View style={{gap:spacing.xs}}><Button small variant="ghost" label="Ver todos / cadastrar novo" onPress={()=>{close();router.push('/estabelecimento');}} /><Button small variant="ghost" label="Voltar ao modo jogador" onPress={()=>{close();router.push('/(tabs)/perfil');}} /></View>} />
    <Text style={styles.modeLabel}>Modo dono de campo</Text>
  </View>;

  return (
    <View>
      <Pressable style={styles.trigger} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.name} numberOfLines={1}>
          🏟️ {current.name}
        </Text>
        {all.length > 1 && <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />}
      </Pressable>
      <Text style={styles.modeLabel}>Modo dono de campo</Text>

      {open && (
        <View style={styles.dropdown}>
          {all.map((e) => (
            <Pressable
              key={e.id}
              style={styles.option}
              onPress={() => {
                setOpen(false);
                if (e.id !== current.id) router.replace(`/estabelecimento/${e.id}`);
              }}
            >
              {e.id === current.id ? (
                <Ionicons name="checkmark" size={14} color={colors.special} />
              ) : (
                <View style={{ width: 14 }} />
              )}
              <Text style={[styles.optionText, e.id === current.id && styles.optionTextActive]} numberOfLines={1}>
                {e.name}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={styles.option}
            onPress={() => {
              setOpen(false);
              router.push('/estabelecimento');
            }}
          >
            <Ionicons name="add-circle" size={14} color={colors.special} />
            <Text style={styles.optionLink}>Ver todos / cadastrar novo</Text>
          </Pressable>
          <Pressable
            style={styles.option}
            onPress={() => {
              setOpen(false);
              router.push('/(tabs)/perfil');
            }}
          >
            <Ionicons name="person-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.optionTextMuted}>Voltar ao modo jogador</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    flexShrink: 1,
  },
  modeLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    color: colors.special,
  },
  dropdown: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  optionText: {
    color: colors.textMuted,
    fontSize: 14,
    flexShrink: 1,
  },
  optionTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  optionTextMuted: {
    color: colors.textFaint,
    fontSize: 13,
  },
  optionLink: {
    color: colors.special,
    fontSize: 14,
    fontWeight: '600',
  },
});
