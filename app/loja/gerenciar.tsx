import { PageHeading } from '@/components/ui/PageHeading';
import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Switch, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { AdaptiveSelect } from "@/components/ui/AdaptiveSelect";
import { shopStyles as st } from "@/components/shop/ShopUi";
import { ShopOrderHistory } from "@/components/shop/ShopOrderHistory";
import { ShopProductEditor } from "@/components/shop/ShopProductEditor";
import { ShopSellerEditor } from "@/components/shop/ShopSellerEditor";
import { useShop } from "@/hooks/useShop";
import { useAuthStore } from "@/store/useAuthStore";
import { shopAction } from "@/lib/shop";
import {
  SHOP_SELLER_STATUS,
  shopCents,
  shopMoney,
  type ShopProduct,
  type ShopOrder,
} from "@/types/shop";

export default function ShopManager() {
  const { data, busy, error, refresh, hasMore } = useShop("manage");
  const actor = useAuthStore((s) => s.authUserId);
  const [sellerId, setSeller] = useState(""),
    [tab, setTab] = useState("products"),
    [creating, setCreating] = useState(false),
    [edit, setEdit] = useState<ShopProduct | null | undefined>(),
    [working, setWorking] = useState(false),
    [notice, setNotice] = useState("");
  const seller = data.sellers.find((s) => s.id === sellerId) || data.sellers[0];
  const reload = useCallback(
    () => refresh("", seller?.id || null),
    [refresh, seller?.id],
  );
  useEffect(() => {
    if (seller?.id) void reload();
  }, [reload]);
  const products = data.products.filter((p) => p.seller_id === seller?.id),
    orders = data.orders.filter((o) => o.seller_id === seller?.id);
  async function run(fn: () => Promise<unknown>) {
    setWorking(true);
    setNotice("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setWorking(false);
    }
  }
  async function saved() {
    await reload();
    setNotice("Alteração salva e registrada.");
  }
  return (
    <Screen contentStyle={st.page}>
      <Button
        small
        variant="ghost"
        label="Voltar à loja"
        onPress={() => router.replace("/loja")}
      />
      <PageHeading><Text style={st.title}>
        {data.admin ? "Gestão da loja e parceiros" : "Minha loja"}
      </Text>
      <Text style={st.copy}>
        Catálogo, estoque e pedidos separados das comandas. Sem acesso aos dados
        de outros vendedores, exceto administradores autorizados da plataforma.
      </Text></PageHeading>
      {!!error && (
        <Text accessibilityRole="alert" style={st.error}>
          {error}
        </Text>
      )}
      {!!notice && (
        <Text accessibilityRole="alert" style={st.notice}>
          {notice}
        </Text>
      )}
      <View style={st.row}>
        <Button
          small
          variant="outline"
          label="Atualizar gestão"
          loading={busy}
          onPress={() => void reload()}
        />
        <Button
          small
          label={creating ? "Ocultar nova loja" : "Cadastrar loja / parceria"}
          onPress={() => setCreating(!creating)}
        />
      </View>
      {creating && (
        <NewSeller
          key={actor}
          admin={data.admin}
          onSaved={async () => {
            await reload();
            setCreating(false);
          }}
        />
      )}
      {!busy && !data.sellers.length && !creating && (
        <Card>
          <Text style={st.label}>Comece seu catálogo</Text>
          <Text style={st.copy}>
            Cadastre os dados comerciais e aceite os termos de vendedor.
            Parceiros aguardam aprovação da plataforma antes de aparecer na
            vitrine.
          </Text>
        </Card>
      )}
      {!!seller && (
        <>
          <AdaptiveSelect
            label="Loja que você administra"
            title="Escolher loja para administrar"
            value={seller.id}
            onChange={(id) => {
              setSeller(id);
              setEdit(undefined);
              setTab("products");
            }}
            options={data.sellers.map((s) => ({
              value: s.id,
              label: s.name,
              detail: `${s.kind === "official" ? "Oficial" : "Parceiro"} · ${SHOP_SELLER_STATUS[s.status]}`,
            }))}
          />
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "products", label: "Produtos" },
              { value: "orders", label: "Pedidos" },
              { value: "settings", label: "Configurar" },
              { value: "finance", label: "Financeiro" },
            ]}
          />
          {tab === "products" && (
            <>
              <Text style={st.copy}>
                Produtos de loja pendente ficam privados. Desativar não apaga o
                histórico de vendas.
              </Text>
              <Button
                small
                label="Novo produto"
                onPress={() => setEdit(null)}
              />
              {edit !== undefined && (
                <ShopProductEditor
                  key={`${seller.id}:${edit?.id || "new"}:${actor}`}
                  sellerId={seller.id}
                  product={edit || undefined}
                  onSaved={reload}
                  onCancel={() => setEdit(undefined)}
                />
              )}
              {products.map((p) => (
                <Card key={p.id}>
                  <Text style={st.section}>{p.name}</Text>
                  <Text style={st.copy}>
                    {p.active ? "Publicado" : "Rascunho/arquivado"} ·{" "}
                    {p.variants.length} variações ·{" "}
                    {p.variants.reduce((n, v) => n + v.stock, 0)} disponíveis
                    {p.sponsored ? " · Patrocinado" : ""}
                  </Text>
                  <View style={st.row}>
                    <Button
                      small
                      variant="outline"
                      label={`Editar ${p.name}`}
                      onPress={() => setEdit(p)}
                    />
                    <Button
                      small
                      variant="ghost"
                      label="Arquivar produto"
                      disabled={working || !p.active}
                      onPress={() =>
                        void run(() =>
                          shopAction("product_archive", { id: p.id }),
                        )
                      }
                    />
                  </View>
                  {data.admin && (
                    <ShopSponsorship product={p} onSaved={reload} />
                  )}
                </Card>
              ))}
              {hasMore && (
                <Button
                  small
                  variant="outline"
                  label="Mais produtos da gestão"
                  loading={busy}
                  onPress={() =>
                    void refresh("", seller.id, data.offset + 40, true)
                  }
                />
              )}
            </>
          )}
          {tab === "orders" && (
            <>
              <Text style={st.copy}>
                Histórico desta loja. Abra um pedido para conferir pagamento,
                entrega e devolução; carregue pedidos antigos ao final da lista.
              </Text>
              <ShopOrderHistory sellerId={seller.id} mode="manage" />
            </>
          )}
          {tab === "settings" && (
            <ShopSellerEditor
              key={`${seller.id}:${seller.revision}:${actor}`}
              seller={seller}
              admin={data.admin}
              onSaved={saved}
            />
          )}
          {tab === "finance" && (
            <ShopFinance orders={orders} admin={data.admin} onSaved={reload} />
          )}
        </>
      )}
    </Screen>
  );
}
function NewSeller({
  admin,
  onSaved,
}: {
  admin: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [address, setAddress] = useState(""),
    [kind, setKind] = useState("partner"),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await shopAction("seller_create", {
        name,
        phone,
        pickupAddress: address,
        kind,
        consent,
        termsVersion: "shop-v1",
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao cadastrar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={st.form}>
      <Text style={st.section}>Cadastrar vendedor</Text>
      <TextField
        label="Nome comercial da loja"
        value={name}
        onChangeText={setName}
        maxLength={120}
        containerStyle={st.field}
      />
      <TextField
        label="Telefone comercial de atendimento"
        value={phone}
        onChangeText={setPhone}
        maxLength={30}
        keyboardType="phone-pad"
        containerStyle={st.field}
      />
      <TextField
        label="Endereço comercial de retirada"
        value={address}
        onChangeText={setAddress}
        maxLength={500}
        containerStyle={st.field}
      />
      {admin && (
        <AdaptiveSelect
          title="Tipo de loja"
          value={kind}
          onChange={setKind}
          options={[
            { value: "partner", label: "Parceiro" },
            { value: "official", label: "Loja oficial do app" },
          ]}
        />
      )}
      <Text style={st.copy}>
        Termos de vendedor shop-v1: você é responsável pela origem e descrição
        dos produtos, preços, estoque, documentos fiscais, atendimento, entrega
        e direitos de devolução do cliente. Dados comerciais informados serão
        públicos após aprovação. Comissões e destaques exigem acordo com a
        plataforma; nenhum repasse automático é prometido.
      </Text>
      <View style={st.row}>
        <Switch
          accessibilityLabel="Aceitar termos de vendedor"
          value={consent}
          onValueChange={setConsent}
        />
        <Text style={[st.copy, { flex: 1 }]}>
          Li e aceito os termos de vendedor e a publicação dos dados comerciais.
        </Text>
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={st.error}>
          {error}
        </Text>
      )}
      <Button
        label="Enviar cadastro da loja"
        loading={busy}
        disabled={busy || !consent || name.trim().length < 3}
        onPress={() => void save()}
      />
    </Card>
  );
}
function ShopSponsorship({
  product: p,
  onSaved,
}: {
  product: ShopProduct;
  onSaved: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false),
    [until, setUntil] = useState(""),
    [amount, setAmount] = useState("0"),
    [reference, setReference] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(until))
        throw new Error("Use data AAAA-MM-DD.");
      const date = new Date(until + "T23:59:59-03:00");
      if (!Number.isFinite(date.getTime())) throw new Error("Data inválida.");
      await shopAction("sponsor", {
        id: p.id,
        until: date.toISOString(),
        amountCents: shopCents(amount),
        reference,
        reason,
      });
      await onSaved();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no destaque.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={st.group}>
      <Button
        small
        variant="ghost"
        label={open ? "Ocultar destaque" : "Configurar destaque patrocinado"}
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <Text style={st.copy}>
            Registro de acordo comercial, sem cobrança automática. Use uma data
            passada para encerrar. O catálogo sinaliza “Patrocinado”.
          </Text>
          <TextField
            label="Destaque até (AAAA-MM-DD)"
            value={until}
            onChangeText={setUntil}
            containerStyle={st.field}
          />
          <TextField
            label="Valor acordado em reais"
            value={amount}
            onChangeText={setAmount}
            containerStyle={st.field}
          />
          <TextField
            label="Referência do acordo"
            value={reference}
            onChangeText={setReference}
            maxLength={160}
            containerStyle={st.field}
          />
          <TextField
            label="Motivo do destaque"
            value={reason}
            onChangeText={setReason}
            maxLength={500}
            containerStyle={st.field}
          />
          {!!error && <Text style={st.error}>{error}</Text>}
          <Button
            small
            label="Registrar acordo de destaque"
            loading={busy}
            disabled={busy || reason.trim().length < 8 || reference.length < 3}
            onPress={() => void save()}
          />
        </>
      )}
    </View>
  );
}
function ShopFinance({
  orders,
  admin,
  onSaved,
}: {
  orders: ShopOrder[];
  admin: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const valid = orders.filter((o) =>
      ["paid", "ready", "shipped", "delivered"].includes(o.status),
    ),
    gross = valid.reduce((n, o) => n + o.subtotal_cents, 0),
    cost = valid.reduce(
      (n, o) =>
        n + o.lines.reduce((k, l) => k + (l.cost_cents || 0) * l.quantity, 0),
      0,
    ),
    owed = orders
      .filter((o) => o.commission_state === "owed")
      .reduce((n, o) => n + (o.commission_cents || 0), 0);
  return (
    <>
      <Card>
        <Text style={st.section}>Resumo dos pedidos carregados</Text>
        <Text style={st.label}>Produtos pagos: {shopMoney(gross)}</Text>
        <Text style={st.copy}>
          Custo dos produtos vendidos: {shopMoney(cost)}
        </Text>
        <Text style={st.copy}>
          Margem bruta antes de comissões, taxas, frete e impostos:{" "}
          {shopMoney(gross - cost)}
        </Text>
        <Text style={st.label}>Comissões a repassar: {shopMoney(owed)}</Text>
        <Text style={st.copy}>
          Comissões recebidas:{" "}
          {shopMoney(
            orders
              .filter((o) => o.commission_state === "received")
              .reduce((n, o) => n + (o.commission_cents || 0), 0),
          )}
        </Text>
        <Text style={st.copy}>
          Taxas de gateway conhecidas:{" "}
          {shopMoney(
            valid.reduce((n, o) => n + (o.provider_fee_cents || 0), 0),
          )}
          . Taxa não informada em{" "}
          {valid.filter((o) => o.provider_fee_cents == null).length} pedidos;
          não significa taxa zero. Até 100 pedidos recentes, não é balanço
          contábil ou lucro líquido.
        </Text>
      </Card>
      {admin &&
        orders
          .filter(
            (o) =>
              o.commission_state === "owed" && (o.commission_cents || 0) > 0,
          )
          .map((o) => (
            <CommissionReceipt key={o.id} order={o} onSaved={onSaved} />
          ))}
    </>
  );
}
function CommissionReceipt({
  order: o,
  onSaved,
}: {
  order: ShopOrder;
  onSaved: () => Promise<unknown>;
}) {
  const [reference, setReference] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function save() {
    setBusy(true);
    setNotice("");
    try {
      await shopAction("commission_received", { id: o.id, reference, reason });
      await onSaved();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha ao registrar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={st.form}>
      <Text style={st.label}>
        Comissão {o.id.slice(0, 8)} · {shopMoney(o.commission_cents || 0)}
      </Text>
      <Text style={st.copy}>
        Confirme somente após receber efetivamente do parceiro. Este botão não
        transfere dinheiro.
      </Text>
      <TextField
        label="Referência do recebimento da comissão"
        value={reference}
        onChangeText={setReference}
        maxLength={160}
        containerStyle={st.field}
      />
      <TextField
        label="Motivo e comprovação do recebimento"
        value={reason}
        onChangeText={setReason}
        maxLength={500}
        containerStyle={st.field}
      />
      {!!notice && <Text style={st.error}>{notice}</Text>}
      <Button
        small
        label="Confirmar comissão recebida"
        loading={busy}
        disabled={
          busy || reason.trim().length < 8 || reference.trim().length < 3
        }
        onPress={() => void save()}
      />
    </Card>
  );
}
