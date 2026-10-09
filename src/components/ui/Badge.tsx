import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

interface BadgeProps {
  label: string;
  color?: string;
  textColor?: string;
}

function readableText(background: string) {
  const value = background.replace('#', '');
  if (value.length !== 6) return colors.onPrimary;
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? colors.black : colors.white;
}

export function Badge({ label, color = colors.primary, textColor }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={[styles.text, { color: textColor ?? readableText(color) }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
