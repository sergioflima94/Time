import { PropsWithChildren } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, liveColors, spacing } from '@/constants/theme';
import { ThemeTone, ThemeToneProvider } from './ThemeTone';
import { AppBrandBar } from './AppBrandBar';
import { DesktopNavigation } from './DesktopNavigation';

interface ScreenProps extends PropsWithChildren {
  scroll?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  tone?: ThemeTone;
  brand?: boolean;
}

export function Screen({ children, scroll = true, style, contentStyle, tone = 'default', brand = tone !== 'live' }: ScreenProps) {
  const palette = tone === 'live' ? liveColors : colors;
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  return (
    <ThemeToneProvider tone={tone}>
      <SafeAreaView style={[styles.safe, { backgroundColor: brand ? colors.brand : palette.bg }, style]} edges={['top', 'left', 'right']}>
        <StatusBar style={brand || tone === 'live' ? 'light' : 'dark'} />
        {brand && <AppBrandBar />}
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: palette.bg }}>
        {desktop && brand && <DesktopNavigation />}
        <View style={{ flex: 1, minWidth: 0 }}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.content, desktop && styles.desktopContent, contentStyle]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, desktop && styles.desktopContent, { flex: 1 }, contentStyle]}>{children}</View>
        )}
        </View>
        </View>
      </SafeAreaView>
    </ThemeToneProvider>
  );
}

const styles = StyleSheet.create({
  desktopContent: { maxWidth: 1180, paddingHorizontal: 28, paddingTop: 24, gap: 16 },
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    // Keep ungrouped controls readable; screens with their own rhythm can override.
    gap: spacing.md,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: spacing.xxxl,
  },
});
