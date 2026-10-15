import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';

/** Real emblem when available; neutral initials, never a fabricated team logo. */
export function TeamBadge({ name, logoUrl, size = 44 }: { name: string; logoUrl?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logoUrl]);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'MJ';
  return <View accessible accessibilityLabel={`Emblema de ${name}`} style={[styles.badge, { width: size, height: size }]}>
    {logoUrl && !failed ? <Image source={{ uri: logoUrl }} contentFit="contain" style={{ width: size - 6, height: size - 6 }} onError={() => setFailed(true)} />
      : <Text style={{ color: colors.text, fontSize: Math.round(size * .3), fontWeight: '800' }}>{initials}</Text>}
  </View>;
}
const styles = StyleSheet.create({ badge: { alignItems: 'center', justifyContent: 'center', borderRadius: 10,
  backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.cardBorder, overflow: 'hidden' } });
