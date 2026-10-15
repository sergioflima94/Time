import { Children, PropsWithChildren } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors } from '@/constants/theme';
import { Card } from './Card';

type Icon = keyof typeof Ionicons.glyphMap;
export function WorkspaceHeader({ title, description, children }: PropsWithChildren<{ title: string; description: string }>) {
  return <View style={s.header}><View style={s.copy}><Text style={s.title}>{title}</Text><Text style={s.body}>{description}</Text></View>
    {!!children && <View testID="workspace-actions" style={s.actions}>{children}</View>}</View>;
}
export function WorkspaceEmpty({ icon, title, description, children }: PropsWithChildren<{ icon: Icon; title: string; description: string }>) {
  return <Card style={s.empty}><View style={s.icon}><Ionicons name={icon} size={23} color={colors.primaryDark} /></View>
    <Text style={s.heading}>{title}</Text><Text style={s.body}>{description}</Text>{children}</Card>;
}
export function WorkspaceSummary({ items }: { items: { label: string; value: string | number; icon: Icon }[] }) {
  return <View style={s.summary}>{items.map(item => <Card key={item.label} style={s.summaryItem}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6}}><Ionicons name={item.icon} size={18} color={colors.primaryDark} /><Text style={s.value}>{item.value}</Text></View><Text style={s.caption}>{item.label}</Text>
  </Card>)}</View>;
}
/** Render independent cards in a bounded grid, never stretch a form to a desktop row. */
export function WorkspaceGrid({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const columns = Platform.OS === 'web' && width >= 1180 ? (width >= 1600 ? 3 : 2) : 1;
  return <View style={s.grid}>{Children.toArray(children).map((child, i) => <View key={i}
    style={{ width: columns === 3 ? '32%' : columns === 2 ? '49%' : '100%', minWidth: 0 }}>{child}</View>)}</View>;
}
const s = StyleSheet.create({
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  copy: { flex: 1, flexBasis: 270, minWidth: 0, gap: 5 }, title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  heading: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: 13, lineHeight: 20 }, caption: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, maxWidth: '100%', minWidth: 0 },
  empty: { gap: 10, padding: 20 }, icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.selection, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryItem: { flex: 1, minWidth: 86, gap: 5 }, value: { color: colors.text, fontWeight: '700', fontSize: 21, lineHeight: 26 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
