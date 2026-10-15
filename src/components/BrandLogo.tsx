import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

/** Approved multi-sport wordmark; identical lettering on web and native. */
export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="MarcouJogou" style={[styles.lockup, compact && styles.compact]}>
      <Image
        source={require('../../assets/branding/marcoujogou-wordmark.png')}
        contentFit="contain"
        accessibilityIgnoresInvertColors
        style={styles.image}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: { width: 220, height: 112, padding: 12, borderRadius: 14, backgroundColor: '#171A1D' },
  compact: { width: 104, height: 54, padding: 6, borderRadius: 8 },
  image: { width: '100%', height: '100%' },
});
