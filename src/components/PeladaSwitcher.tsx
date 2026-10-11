import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { useCurrentPelada, useMyPeladas } from '@/hooks/useCurrentPelada';
import { useAppStore } from '@/store/useAppStore';
import { AdaptiveSelect } from './ui/AdaptiveSelect';
import { Button } from './ui/Button';

export function PeladaSwitcher() {
  const pelada = useCurrentPelada();
  const myPeladas = useMyPeladas();
  const setCurrentPelada = useAppStore((s) => s.setCurrentPelada);
  const [open, setOpen] = useState(false);
  const sport = getSport(pelada.sportId);

  if (myPeladas.length > 3) return <View style={{gap:spacing.xs}}>
    <AdaptiveSelect title="Trocar de time" value={pelada.id} onChange={setCurrentPelada}
      options={myPeladas.map(p=>({value:p.id,label:`${getSport(p.sportId).icon} ${p.name}`,detail:getSport(p.sportId).label}))}
      footer={close=><View style={{gap:spacing.xs}}><Button small variant="ghost" label="Entrar em outra pelada" onPress={()=>{close();router.push('/entrar-pelada');}} /><Button small variant="ghost" label="Criar uma pelada nova" onPress={()=>{close();router.push('/criar-pelada');}} /></View>} />
    <Text style={[styles.sportLabel,{color:sport.color}]}>{sport.label}</Text>
  </View>;

  return (
    <View>
      <Pressable style={styles.trigger} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.peladaName} numberOfLines={1}>
          {sport.icon} {pelada.name}
        </Text>
        {myPeladas.length > 1 && <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />}
      </Pressable>
      <Text style={[styles.sportLabel, { color: sport.color }]}>{sport.label}</Text>

      {open && (
        <View style={styles.dropdown}>
          {myPeladas.map((p) => {
            const pSport = getSport(p.sportId);
            return (
              <Pressable
                key={p.id}
                style={styles.option}
                onPress={() => {
                  setCurrentPelada(p.id);
                  setOpen(false);
                }}
              >
                {p.id === pelada.id ? (
                  <Ionicons name="checkmark" size={14} color={colors.primary} />
                ) : (
                  <View style={{ width: 14 }} />
                )}
                <Text style={[styles.optionText, p.id === pelada.id && styles.optionTextActive]}>
                  {pSport.icon} {p.name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            style={styles.option}
            onPress={() => {
              setOpen(false);
              router.push('/entrar-pelada');
            }}
          >
            <Ionicons name="add" size={14} color={colors.primary} />
            <Text style={styles.optionLink}>Entrar em outra pelada</Text>
          </Pressable>
          <Pressable
            style={styles.option}
            onPress={() => {
              setOpen(false);
              router.push('/criar-pelada');
            }}
          >
            <Ionicons name="add-circle" size={14} color={colors.primary} />
            <Text style={styles.optionLink}>Criar uma pelada nova</Text>
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
  peladaName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    flexShrink: 1,
  },
  sportLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
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
  },
  optionTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  optionLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
