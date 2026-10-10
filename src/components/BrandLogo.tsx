import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';

/** Same mark on login, home and native splash. Text stays crisp at any scale. */
export function BrandLogo({ compact = false }: { compact?: boolean }) {
  const markSize = compact ? 24 : 72;
  return (
    <View accessible accessibilityLabel="MarcouJogou" style={[styles.lockup, !compact && styles.stacked]}>
      <View style={{ width: markSize, height: markSize, overflow: 'hidden' }}>
        <Image
          source={require('../../assets/branding/marcoujogou-mark.png')}
          contentFit="contain"
          accessibilityIgnoresInvertColors
          style={{ width: markSize * 1.65, height: markSize * 1.65, marginLeft: -markSize * 0.325, marginTop: -markSize * 0.325 }}
        />
      </View>
      <Text style={[styles.wordmark, compact && styles.compact]}>
        Marcou<Text style={styles.jogou}>Jogou</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stacked: { flexDirection: 'column', gap: 12 },
  wordmark: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  jogou: { color: '#148454' },
  compact: { fontSize: 15, letterSpacing: -0.5 },
});
