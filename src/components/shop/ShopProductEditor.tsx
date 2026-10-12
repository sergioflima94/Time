import { useState } from "react";
import { Image, Switch, Text, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { AdaptiveSelect } from "@/components/ui/AdaptiveSelect";
import { shopAction, shopImageUrl, uploadShopPhoto } from "@/lib/shop";
import {
  SHOP_CATEGORIES,
  shopCents,
  type ShopProduct,
  type ShopVariant,
} from "@/types/shop";
import { shopStyles as st } from "./ShopUi";

type Draft = {
  id?: string;
  revision?: number;
  sku: string;
  size: string;
  color: string;
  price: string;
  cost: string;
  stock: string;
  active: boolean;
};
const draft = (v?: ShopVariant): Draft => ({
  id: v?.id,
  revision: v?.revision,
  sku: v?.sku || "",
  size: v?.size || "",
  color: v?.color || "",
  price: String((v?.price_cents || 0) / 100),
  cost: String((v?.cost_cents || 0) / 100),
  stock: String(v?.stock || 0),
  active: v?.active ?? true,
});
export function ShopProductEditor({
  sellerId,
  product,
  onSaved,
  onCancel,
}: {
  sellerId: string;
  product?: ShopProduct;
  onSaved: () => Promise<unknown>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(product?.name || ""),
    [description, setDescription] = useState(product?.description || ""),
    [category, setCategory] = useState(product?.category || "ball"),
    [active, setActive] = useState(product?.active || false);
  const [photos, setPhotos] = useState(product?.photos || []),
    [variants, setVariants] = useState<Draft[]>(
      product?.variants.map((v) => draft(v)) || [draft()],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function change(i: number, key: keyof Draft, value: string | boolean) {
    setVariants((old) =>
      old.map((v, n) => (n === i ? { ...v, [key]: value } : v)),
    );
  }
  async function photo() {
    setBusy(true);
    setError("");
    try {
      const key = await uploadShopPhoto();
      if (key) setPhotos((p) => [...p, key]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar foto.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const rows = variants.map((v) => {
        if (!/^\d+$/.test(v.stock) || Number(v.stock) > 1000000)
          throw new Error("Estoque deve ser inteiro entre zero e um milhão.");
        return {
          id: v.id,
          revision: v.revision,
          sku: v.sku.trim(),
          size: v.size.trim(),
          color: v.color.trim(),
          priceCents: shopCents(v.price),
          costCents: shopCents(v.cost),
          stock: Number(v.stock),
          active: v.active,
        };
      });
      await shopAction("product_save", {
        sellerId,
        id: product?.id,
        revision: product?.revision,
        name: name.trim(),
        description,
        category,
        photos,
        active,
        variants: rows,
      });
      await onSaved();
      onCancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={st.form}>
      <Text style={st.section}>
        {product ? "Editar produto" : "Novo produto"}
      </Text>
      <TextField
        label="Nome do produto"
        value={name}
        onChangeText={setName}
        maxLength={160}
        containerStyle={st.field}
      />
      <TextField
        label="Descrição, material e orientações"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={4000}
        containerStyle={st.field}
      />
      <AdaptiveSelect
        title="Categoria do produto"
        value={category}
        onChange={setCategory}
        options={SHOP_CATEGORIES}
      />
      <Text style={st.label}>Fotos ({photos.length}/5)</Text>
      <View style={st.row}>
        {photos.map((key, i) => (
          <View key={key} style={st.group}>
            <Image
              source={{ uri: shopImageUrl(key)! }}
              style={{ width: 80, height: 80, borderRadius: 12 }}
            />
            <Button
              small
              variant="ghost"
              label={`Remover foto ${i + 1}`}
              disabled={busy}
              onPress={() => setPhotos((old) => old.filter((k) => k !== key))}
            />
          </View>
        ))}
      </View>
      <Button
        small
        variant="outline"
        label="Adicionar foto da galeria"
        disabled={busy || photos.length >= 5}
        onPress={() => void photo()}
      />
      <Text style={st.copy}>
        JPG, PNG ou WebP até 5 MB. Não envie dados pessoais. Remover da ficha
        não apaga arquivos já usados em outro produto.
      </Text>
      {variants.map((v, i) => (
        <View key={v.id || i} style={st.divider}>
          <Text style={st.label}>Variação {i + 1}</Text>
          <TextField
            label={`Código SKU ${i + 1}`}
            value={v.sku}
            onChangeText={(s) => change(i, "sku", s)}
            maxLength={60}
            containerStyle={st.field}
          />
          <View style={st.row}>
            <View style={{ flex: 1, minWidth: 100 }}>
              <TextField
                label={`Tamanho ${i + 1}`}
                value={v.size}
                onChangeText={(s) => change(i, "size", s)}
                maxLength={60}
                containerStyle={st.field}
              />
            </View>
            <View style={{ flex: 1, minWidth: 100 }}>
              <TextField
                label={`Cor ${i + 1}`}
                value={v.color}
                onChangeText={(s) => change(i, "color", s)}
                maxLength={60}
                containerStyle={st.field}
              />
            </View>
          </View>
          <TextField
            label={`Preço em reais ${i + 1}`}
            value={v.price}
            keyboardType="decimal-pad"
            onChangeText={(s) => change(i, "price", s)}
            containerStyle={st.field}
          />
          <TextField
            label={`Custo unitário privado ${i + 1}`}
            value={v.cost}
            keyboardType="decimal-pad"
            onChangeText={(s) => change(i, "cost", s)}
            containerStyle={st.field}
          />
          <TextField
            label={`Estoque disponível ${i + 1}`}
            value={v.stock}
            keyboardType="number-pad"
            onChangeText={(s) => change(i, "stock", s)}
            containerStyle={st.field}
          />
          <View style={st.row}>
            <Switch
              accessibilityLabel={`Variação ${i + 1} ativa`}
              value={v.active}
              onValueChange={(s) => change(i, "active", s)}
            />
            <Text style={st.copy}>Variação disponível para venda</Text>
            <Button
              small
              variant="ghost"
              label={`Remover variação ${i + 1}`}
              disabled={busy || variants.length === 1}
              onPress={() =>
                setVariants((old) => old.filter((_, n) => n !== i))
              }
            />
          </View>
        </View>
      ))}
      <Button
        small
        variant="outline"
        label="Adicionar variação"
        disabled={busy || variants.length >= 30}
        onPress={() => setVariants((old) => [...old, draft()])}
      />
      <View style={st.row}>
        <Switch
          accessibilityLabel="Publicar produto"
          value={active}
          onValueChange={setActive}
        />
        <Text style={[st.copy, { flex: 1 }]}>
          Publicar produto (loja deve estar aprovada). Desativado fica como
          rascunho.
        </Text>
      </View>
      <Text style={st.copy}>
        O estoque informado é o disponível, sem as unidades já reservadas em
        pedidos. Se houver uma venda durante a edição, atualize antes de salvar.
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={st.error}>
          {error}
        </Text>
      )}
      <Button
        label="Salvar produto e estoque"
        loading={busy}
        disabled={
          busy || name.trim().length < 3 || variants.some((v) => !v.sku.trim())
        }
        onPress={() => void save()}
      />
      <Button
        small
        variant="ghost"
        label="Cancelar edição"
        disabled={busy}
        onPress={onCancel}
      />
    </Card>
  );
}
