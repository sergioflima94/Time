import { PropsWithChildren } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, liveColors, spacing } from '@/constants/theme';
import { ThemeTone, ThemeToneProvider } from './ThemeTone';

interface ScreenProps extends PropsWithChildren {
  scroll?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  tone?: ThemeTone;
}

export function Screen({ children, scroll = true, style, contentStyle, tone = 'default' }: ScreenProps) {
  const palette = tone === 'live' ? liveColors : colors;
  return (
    <ThemeToneProvider tone={tone}>
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }, style]} edges={['top', 'left', 'right']}>
        {tone === 'live' && <StatusBar style="light" />}
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.content, contentStyle]}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, { flex: 1 }, contentStyle]}>{children}</View>
        )}
      </SafeAreaView>
    </ThemeToneProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
});
