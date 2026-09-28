import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { formatMoney } from '@/lib/establishmentOperations';
import { useAppStore } from '@/store/useAppStore';
import type { PreparationStation } from '@/types';

export default function MenuScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const { establishmentId } = useLocalSearchParams<{ establishmentId?: string }>();
  const establishment = useAppStore((s) => s.establishments.find((e) => e.id === establishmentId && e.ownerPlayerId === currentPlayerId) ?? s.establishments.find((e) => e.ownerPlayerId === currentPlayerId));
  const categories = useAppStore(useShallow((s) => s.productCategories.filter((c) => c.establishmentId === establishment?.id)));
  const products = useAppStore(useShallow((s) => s.products.filter((p) => p.establishmentId === establishment?.id)));
  const addProductCategory = useAppStore((s) => s.addProductCategory);
  const addProduct = useAppStore((s) => s.addProduct);
  const updateProduct = useAppStore((s) => s.updateProduct);
  const [categoryName, setCategoryName] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [station, setStation] = useState<PreparationStation>('kitchen');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');

  function handleCategory() {
    if (!establishment || !categoryName.trim()) return;
    const category = addProductCategory(establishment.id, categoryName);
    setCategoryId(category.id);
    setCategoryName('');
  }

  function handleProduct() {
    if (!establishment || !name.trim() || !categoryId) return;
    addProduct(establishment.id, { categoryId, name, description: description.trim() || null, price: Number(price.replace(',', '.')) || 0, station, stockQuantity: stock.trim() ? Number(stock) : null });
    setName(''); setDescription(''); setPrice(''); setStock('');
  }

  return (
    <Screen>
      <View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable><View><Text style={styles.title}>Cardápio</Text><Text style={styles.meta}>Produtos, estoque e estação de preparo</Text></View></View>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Nova categoria</Text>
        <View style={styles.inline}><View style={{ flex: 1 }}><TextField label="Nome" value={categoryName} onChangeText={setCategoryName} placeholder="Porções" /></View><Button label="Criar" small onPress={handleCategory} disabled={!categoryName.trim()} /></View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Novo produto</Text>
        <Text style={styles.label}>Categoria</Text>
        <View style={styles.chips}>{categories.map((category) => <Pressable key={category.id} onPress={() => setCategoryId(category.id)} style={[styles.chip, categoryId === category.id && styles.chipActive]}><Text style={[styles.chipText, categoryId === category.id && styles.chipTextActive]}>{category.name}</Text></Pressable>)}</View>
        <TextField label="Nome" value={name} onChangeText={setName} placeholder="Espetinho de linguiça" />
        <TextField label="Descrição" value={description} onChangeText={setDescription} placeholder="Acompanhamentos e observações" />
        <View style={styles.inline}><View style={{ flex: 1 }}><TextField label="Preço (R$)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><TextField label="Estoque (vazio = ilimitado)" value={stock} onChangeText={setStock} keyboardType="number-pad" /></View></View>
        <SegmentedControl<PreparationStation> label="Vai para" value={station} onChange={setStation} options={[{ value: 'kitchen', label: 'Cozinha' }, { value: 'bar', label: 'Bar' }, { value: 'counter', label: 'Balcão' }]} />
        <Button label="Adicionar ao cardápio" onPress={handleProduct} disabled={!name.trim() || !categoryId || !price.trim()} />
      </Card>

      {categories.map((category) => (
        <View key={category.id} style={styles.group}>
          <Text style={styles.groupTitle}>{category.name}</Text>
          {products.filter((product) => product.categoryId === category.id).map((product) => (
            <Card key={product.id} style={styles.productCard}>
              <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.productName}>{product.name}</Text><Text style={styles.meta}>{formatMoney(product.price)} · {product.station}{product.stockQuantity !== null ? ` · ${product.stockQuantity} un.` : ''}</Text></View><Badge label={product.active ? 'Disponível' : 'Pausado'} color={product.active ? colors.success : colors.textFaint} /></View>
              <Button label={product.active ? 'Pausar venda' : 'Reativar'} variant="ghost" small onPress={() => updateProduct(product.id, { active: !product.active })} />
            </Card>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }, title: { color: colors.text, fontSize: 22, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 12 },
  section: { marginBottom: spacing.lg }, sectionTitle: { color: colors.text, fontWeight: '800', marginBottom: spacing.md }, inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, label: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }, chip: { borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 16 }, chipActive: { borderColor: colors.primary }, chipText: { color: colors.textMuted }, chipTextActive: { color: colors.primary, fontWeight: '700' },
  group: { marginBottom: spacing.lg }, groupTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: spacing.sm }, productCard: { marginBottom: spacing.sm }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, productName: { color: colors.text, fontWeight: '700' },
});
