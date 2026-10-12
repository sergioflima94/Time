import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Image, Linking, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { AdaptiveSelect } from "@/components/ui/AdaptiveSelect";
import { Badge } from "@/components/ui/Badge";
import { shopStyles as st } from "@/components/shop/ShopUi";
import { ShopOrderHistory } from "@/components/shop/ShopOrderHistory";
import { useShop } from "@/hooks/useShop";
import { useAuthStore } from "@/store/useAuthStore";
import { useShopCartStore } from "@/store/useShopCartStore";
import { shopCart, shopImageUrl } from "@/lib/shop";
import { phoneKey } from "@/lib/friendDiscoveryRules";
import {
  SHOP_CATEGORIES,
  shopMoney,
  type ShopProduct,
  type ShopSeller,
} from "@/types/shop";
import { ShopCheckoutForm } from "@/components/shop/ShopCheckoutForm";

export default function StoreScreen() {
  const { data, busy, error, refresh, hasMore } = useShop();
  const actor = useAuthStore((s) => s.authUserId),
    ready = useAuthStore((s) => s.authReady),
    logged = useAuthStore((s) => s.isLoggedIn);
  const cart = useShopCartStore((s) => s.items),
    cartActor = useShopCartStore((s) => s.actor);
  const [tab, setTab] = useState("products"),
    [query, setQuery] = useState(""),
    [seller, setSeller] = useState(""),
    [category, setCategory] = useState("all");
  const [cartProducts, setCartProducts] = useState<ShopProduct[]>([]),
    [cartError, setCartError] = useState("");
  useEffect(() => {
    if (!ready) return;
    const scope = () =>
      useShopCartStore.getState().scope(useAuthStore.getState().authUserId);
    if (useShopCartStore.persist.hasHydrated()) scope();
    return useShopCartStore.persist.onFinishHydration(scope);
  }, [actor, ready]);
  const safeCart = cartActor === actor ? cart : [];
  useEffect(() => {
    let live = true;
    setCartProducts([]);
    if (tab === "cart")
      void shopCart(safeCart.map((i) => i.variantId))
        .then((rows) => {
          if (live) {
            setCartProducts(rows);
            setCartError("");
          }
        })
        .catch((e) => {
          if (live) setCartError(e.message);
        });
    return () => {
      live = false;
    };
  }, [tab, cart, actor, cartActor]);
  const products = data.products.filter(
    (p) => category === "all" || p.category === category,
  );
  return (
    <Screen contentStyle={st.page}>
      <View style={st.row}>
        <Button
          small
          variant="ghost"
          label="Voltar"
          onPress={() => router.back()}
        />
        <Text style={[st.title, { flex: 1 }]}>Loja MarcouJogou</Text>
      </View>
      <Text style={st.copy}>
        Produtos físicos da loja oficial e de parceiros aprovados. Cada vendedor
        cuida da sua entrega, atendimento e recebimento.
      </Text>
      <Button
        small
        variant="outline"
        label={
          data.admin
            ? "Administrar loja e parceiros"
            : "Minha loja / Quero vender"
        }
        onPress={() =>
          router.push(logged ? "/loja/gerenciar" : "/(auth)/login")
        }
      />
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: "products", label: "Produtos" },
          {
            value: "cart",
            label: `Carrinho (${safeCart.reduce((n, i) => n + i.quantity, 0)})`,
          },
          { value: "orders", label: "Meus pedidos" },
        ]}
      />
      {!!error && (
        <Text accessibilityRole="alert" style={st.error}>
          {error}
        </Text>
      )}
      {tab === "products" && (
        <>
          <Card style={st.form}>
            <TextField
              label="Pesquisar produtos"
              value={query}
              onChangeText={setQuery}
              placeholder="Bola, uniforme, parceiro..."
              containerStyle={st.field}
            />
            <AdaptiveSelect
              title="Escolher vendedor da loja"
              value={seller}
              onChange={(id) => {
                setSeller(id);
                void refresh(query, id || null);
              }}
              options={[
                { value: "", label: "Todos os vendedores" },
                ...data.sellers.map((s) => ({
                  value: s.id,
                  label: s.name,
                  detail:
                    s.kind === "official"
                      ? "Loja oficial"
                      : "Parceiro aprovado",
                })),
              ]}
            />
            <SegmentedControl
              value={category}
              onChange={setCategory}
              options={[{ value: "all", label: "Todos" }, ...SHOP_CATEGORIES]}
            />
            <Button
              small
              variant="outline"
              label="Buscar produtos"
              loading={busy}
              onPress={() => void refresh(query, seller || null)}
            />
          </Card>
          {!busy && !products.length && (
            <Card>
              <Text style={st.label}>Nenhum produto neste filtro</Text>
              <Text style={st.copy}>
                Novos produtos aparecem quando o vendedor publica seu catálogo.
                Nenhuma compra é simulada nesta loja.
              </Text>
            </Card>
          )}
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              seller={data.sellers.find((s) => s.id === p.seller_id)}
            />
          ))}
          {hasMore && (
            <Button
              small
              label="Mais produtos"
              variant="outline"
              loading={busy}
              onPress={() =>
                void refresh(query, seller || null, data.offset + 40, true)
              }
            />
          )}
          <Button
            small
            variant="ghost"
            label="Consultar aluguel de equipamentos"
            onPress={() =>
              router.push({
                pathname: "/recursos/[slug]",
                params: { slug: "loja", rentals: "1" },
              })
            }
          />
        </>
      )}
      {tab === "cart" && (
        <>
          <Text style={st.copy}>
            Pedidos de vendedores diferentes são fechados separadamente. Preço,
            estoque e frete são revalidados no servidor antes do pagamento.
          </Text>
          {!!cartError && (
            <Text accessibilityRole="alert" style={st.error}>
              {cartError}
            </Text>
          )}
          {!safeCart.length && (
            <Card>
              <Text style={st.copy}>Seu carrinho está vazio.</Text>
            </Card>
          )}
          {[...new Set(safeCart.map((i) => i.sellerId))].map((id) => {
            const seller = data.sellers.find((s) => s.id === id),
              items = safeCart.filter((i) => i.sellerId === id);
            return (
              <Card key={id} style={st.form}>
                <Text style={st.section}>
                  {seller?.name || "Vendedor indisponível"}
                </Text>
                {items.map((item) => {
                  const product = cartProducts.find((p) =>
                      p.variants.some((v) => v.id === item.variantId),
                    ),
                    variant = product?.variants.find(
                      (v) => v.id === item.variantId,
                    );
                  return (
                    <View key={item.variantId} style={st.divider}>
                      <Text style={st.label}>
                        {product?.name || "Produto indisponível"}
                      </Text>
                      <Text style={st.copy}>
                        {variant
                          ? [
                              variant.size,
                              variant.color,
                              shopMoney(variant.price_cents),
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : "Remova o item ou atualize a loja."}
                      </Text>
                      <View style={st.row}>
                        <Button
                          small
                          variant="outline"
                          label="−"
                          accessibilityLabel={`Diminuir ${product?.name || "item"}`}
                          onPress={() =>
                            useShopCartStore
                              .getState()
                              .quantity(item.variantId, item.quantity - 1)
                          }
                        />
                        <Text style={st.label}>{item.quantity}</Text>
                        <Button
                          small
                          variant="outline"
                          label="+"
                          accessibilityLabel={`Aumentar ${product?.name || "item"}`}
                          disabled={
                            !variant ||
                            item.quantity >= variant.stock ||
                            item.quantity >= 99
                          }
                          onPress={() =>
                            useShopCartStore
                              .getState()
                              .quantity(item.variantId, item.quantity + 1)
                          }
                        />
                        <Button
                          small
                          variant="ghost"
                          label="Remover"
                          onPress={() =>
                            useShopCartStore
                              .getState()
                              .quantity(item.variantId, 0)
                          }
                        />
                      </View>
                    </View>
                  );
                })}
                {seller && (
                  <ShopCheckoutForm
                    seller={seller}
                    items={items}
                    subtotal={items.reduce(
                      (n, i) =>
                        n +
                        (cartProducts
                          .flatMap((p) => p.variants)
                          .find((v) => v.id === i.variantId)?.price_cents ||
                          0) *
                          i.quantity,
                      0,
                    )}
                    unavailable={items.some(
                      (i) =>
                        !cartProducts
                          .flatMap((p) => p.variants)
                          .some(
                            (v) =>
                              v.id === i.variantId && v.stock >= i.quantity,
                          ),
                    )}
                  />
                )}
              </Card>
            );
          })}
        </>
      )}
      {tab === "orders" && (
        <>
          {!logged ? (
            <Button
              label="Entrar para ver meus pedidos"
              onPress={() => router.push("/(auth)/login")}
            />
          ) : (
            <>
              <Text style={st.copy}>
                Seus pedidos, incluindo os mais antigos. Cada pedido mantém seu
                histórico de pagamento e entrega.
              </Text>
              <ShopOrderHistory />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
function ProductCard({
  product: p,
  seller,
}: {
  product: ShopProduct;
  seller?: ShopSeller;
}) {
  const [details, setDetails] = useState(false),
    [variantId, setVariant] = useState(p.variants[0]?.id || ""),
    [photo, setPhoto] = useState(0),
    [notice, setNotice] = useState("");
  const v = p.variants.find((v) => v.id === variantId),
    url = shopImageUrl(p.photos[photo] || "");
  return (
    <Card style={st.form}>
      <View style={st.row}>
        {url ? (
          <Image
            source={{ uri: url }}
            style={{ width: 88, height: 88, borderRadius: 12 }}
          />
        ) : (
          <View
            style={{
              width: 68,
              height: 68,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 30 }}>🏷️</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 120, gap: 6 }}>
          <Text style={st.section}>{p.name}</Text>
          <Text style={st.copy}>{p.seller_name}</Text>
          <Text style={st.price}>
            {v ? shopMoney(v.price_cents) : "Escolha uma variação"}
          </Text>
          <View style={st.row}>
            <Badge
              label={p.seller_kind === "official" ? "Loja oficial" : "Parceiro"}
            />
            {p.sponsored && <Badge label="Patrocinado" />}
          </View>
        </View>
      </View>
      {!!v && (
        <Text style={st.copy}>
          Selecionado: {[v.size, v.color, v.sku].filter(Boolean).join(" · ")}
        </Text>
      )}
      <Button
        small
        variant="ghost"
        label={details ? "Ocultar detalhes" : "Ver detalhes e variações"}
        onPress={() => setDetails(!details)}
      />
      {details && (
        <>
          <Text style={st.copy}>
            {p.description || "Sem descrição adicional."}
          </Text>
          {!!seller?.pickup_enabled && (
            <Text style={st.copy}>
              Retirada: {seller.pickup_address || "Combine com o vendedor"}
            </Text>
          )}
          {!!seller?.phone && !!phoneKey(seller.phone) && (
            <Button
              small
              variant="outline"
              label="Consultar vendedor pelo WhatsApp"
              onPress={() =>
                void Linking.openURL(
                  `https://wa.me/${phoneKey(seller.phone)}`,
                ).catch(() =>
                  setNotice(
                    "Não foi possível abrir o WhatsApp. Telefone comercial: " +
                      seller.phone,
                  ),
                )
              }
            />
          )}
          {p.photos.length > 1 && (
            <View style={st.row}>
              {p.photos.map((_, i) => (
                <Button
                  small
                  key={i}
                  variant={photo === i ? "primary" : "outline"}
                  label={`Foto ${i + 1}`}
                  onPress={() => setPhoto(i)}
                />
              ))}
            </View>
          )}
          <AdaptiveSelect
            title={`Escolher variação de ${p.name}`}
            value={variantId}
            onChange={setVariant}
            options={p.variants.map((v) => ({
              value: v.id,
              label: [v.size, v.color, v.sku].filter(Boolean).join(" · "),
              detail: shopMoney(v.price_cents),
              disabled: v.stock === 0,
            }))}
          />
          <Text style={st.copy}>
            {v?.stock || 0} disponíveis. Estoque confirmado somente ao fechar o
            pedido.
          </Text>
        </>
      )}
      <Button
        small
        label="Adicionar ao carrinho"
        disabled={!v || v.stock === 0}
        onPress={() => {
          if (!v) return;
          useShopCartStore.getState().add(v.id, p.seller_id, v.stock);
          setNotice(
            "Carrinho atualizado. Ainda não há cobrança nem reserva de estoque.",
          );
        }}
      />
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={st.notice}>
          {notice}
        </Text>
      )}
    </Card>
  );
}
