import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  columns?: 2 | 4;
  label?: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ label, options, value, onChange, columns }: SegmentedControlProps<T>) {
  return (
    <View style={styles.wrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        {options.map((opt) => (
          <Pressable
            key={opt.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === opt.value }}
            onPress={() => onChange(opt.value)}
            style={[styles.option, columns && { width: columns === 2 ? '49%' : '24%' }, value === opt.value && styles.optionActive]}
          >
            <Text style={[styles.optionText, value === opt.value && styles.optionTextActive]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  option: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  optionActive: {
    borderColor: colors.text,
    backgroundColor: colors.text,
  },
  optionText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  optionTextActive: {
    color: colors.white,
  },
});
