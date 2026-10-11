import { ReactNode, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing } from '@/constants/theme';
import { Button } from './Button';
import { useUiPalette } from './ThemeTone';

export interface SelectOption { value: string; label: string; detail?: string; disabled?: boolean }
export const selectionSearchKey = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
interface Props {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  title: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  footer?: (close: () => void) => ReactNode;
}

/** Small lists stay inline. Large lists use a local, explicit-confirmation picker. */
export function AdaptiveSelect({ options, value, onChange, title, label, placeholder = 'Selecione uma opção', disabled = false, footer }: Props) {
  const palette = useUiPalette();
  const list = useRef<FlatList<SelectOption>>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [draft, setDraft] = useState(value);
  const selected = options.find(o => o.value === value);
  const chosen = options.find(o => o.value === draft && !o.disabled);
  const tokens = selectionSearchKey(query).split(/\s+/).filter(Boolean);
  const filtered = options.filter(o => tokens.every(t => selectionSearchKey(`${o.label} ${o.detail || ''}`).includes(t)));
  const validDraft = chosen && filtered.some(o => o.value === draft);
  function show() { setQuery(''); setDraft(value); setOpen(true); }
  function close() { setOpen(false); setQuery(''); }
  function confirm() { if (disabled || !chosen || !validDraft) return; close(); onChange(chosen.value); }
  return <View style={styles.wrap}>
    {!!label && <Text style={[styles.label, { color: palette.text }]}>{label}</Text>}
    {!options.length ? <Text style={[styles.copy, { color: palette.textMuted }]}>Nenhuma opção disponível.</Text> : options.length <= 3 ?
      <View style={styles.chips}>{options.map(o => <Button key={o.value} small variant={value === o.value ? 'primary' : 'outline'} label={o.label} disabled={disabled || o.disabled} onPress={() => onChange(o.value)} />)}</View> :
      <Pressable accessibilityRole="button" accessibilityLabel={`${selected ? 'Trocar' : 'Selecionar'}: ${title}`} disabled={disabled} onPress={show}
        style={[styles.trigger, { backgroundColor: palette.card, borderColor: palette.cardBorder }, disabled && { opacity: 0.5 }]}>
        <View style={styles.selection}><Text style={[styles.label, { color: palette.text }]}>{selected?.label || placeholder}</Text>
          {!!selected?.detail && <Text style={[styles.copy, { color: palette.textMuted }]}>{selected.detail}</Text>}
        </View><Text style={[styles.change, { color: palette.primaryDark }]}>{selected ? 'Trocar' : 'Selecionar'}⌄</Text>
      </Pressable>}
    <Modal visible={open} transparent animationType="fade" accessibilityLabel={title} onRequestClose={close}>
      <SafeAreaView style={[styles.overlay, { backgroundColor: palette.overlay }]}>
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View accessibilityViewIsModal onAccessibilityEscape={close} style={[styles.surface, { backgroundColor: palette.card, borderColor: palette.cardBorder }]}>
            <View style={styles.header}><Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>{title}</Text>
              <Button label="Cancelar" small variant="ghost" onPress={close} />
            </View>
            <TextInput accessibilityLabel={`Pesquisar: ${title}`} placeholder="Pesquisar por nome" placeholderTextColor={palette.textFaint}
              value={query} onChangeText={text=>{setQuery(text);list.current?.scrollToOffset({offset:0,animated:false});}} autoCapitalize="none" autoCorrect={false} maxLength={160}
              style={[styles.input, { color: palette.text, borderColor: palette.cardBorder, backgroundColor: palette.bg }]} />
            <Text accessibilityLiveRegion="polite" style={[styles.copy, { color: palette.textMuted }]}>{filtered.length} {filtered.length === 1 ? 'opção' : 'opções'} · escolha e confirme</Text>
            <FlatList ref={list} style={styles.list} data={filtered} keyExtractor={o => o.value} keyboardShouldPersistTaps="handled" extraData={draft}
              ListEmptyComponent={<Text style={[styles.empty, { color: palette.textMuted }]}>Nenhum resultado. Tente outro nome ou limpe a busca.</Text>}
              renderItem={({ item: o }) => <Pressable accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{ checked: draft === o.value, disabled: !!o.disabled || disabled }}
                disabled={disabled || o.disabled} onPress={() => setDraft(o.value)}
                style={[styles.option, { borderColor: draft === o.value ? palette.primary : palette.cardBorder, backgroundColor: draft === o.value ? palette.bgElevated : palette.card }, o.disabled && { opacity: 0.5 }]}>
                <View style={styles.selection}><Text style={[styles.label, { color: palette.text }]}>{o.label}</Text>{!!o.detail && <Text style={[styles.copy, { color: palette.textMuted }]}>{o.detail}</Text>}</View>
                <Text style={{ color: palette.primary }} aria-hidden>{draft === o.value ? '●' : '○'}</Text>
              </Pressable>} />
            <Button label="Confirmar seleção" disabled={disabled || !validDraft} onPress={confirm} />
            {footer?.(close)}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  label: { fontSize: 13, lineHeight: 19, fontWeight: '700', flexShrink: 1 }, copy: { fontSize: 12, lineHeight: 18 },
  trigger: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selection: { flex: 1, minWidth: 0, gap: spacing.xs }, change: { fontSize: 12, fontWeight: '700' },
  overlay: { flex: 1 }, keyboard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  surface: { width: '100%', maxWidth: 560, height: '80%', maxHeight: 620, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, title: { flex: 1, fontSize: 18, fontWeight: '800' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 15 },
  list: { flex: 1, minHeight: 48 }, option: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  empty: { fontSize: 13, lineHeight: 20, paddingVertical: spacing.md },
});
