import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { radius, spacing } from '@/constants/theme';
import { useUiPalette } from './ThemeTone';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  small?: boolean;
  accessibilityLabel?: string;
}

export function Button({ label, onPress, variant = 'primary', disabled, loading, style, small, accessibilityLabel }: ButtonProps) {
  const palette = useUiPalette();
  const variantStyle = {
    primary: { backgroundColor: palette.action },
    secondary: { backgroundColor: palette.bgElevated, borderWidth: 1, borderColor: palette.cardBorder },
    outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: palette.primary },
    danger: { backgroundColor: palette.danger },
    ghost: { backgroundColor: 'transparent' },
  }[variant] as ViewStyle;
  const labelColor = {
    primary: palette.onAction,
    secondary: palette.text,
    outline: palette.primary,
    danger: palette.white,
    ghost: palette.primary,
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        variantStyle,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' || variant === 'ghost' ? palette.primary : palette.onAction} />
      ) : (
        <Text style={[styles.label, small && styles.smallLabel, { color: labelColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    minHeight: 38,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  label: {
    fontSize: 15,
    fontWeight: '800',
  },
  smallLabel: {
    fontSize: 13,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
