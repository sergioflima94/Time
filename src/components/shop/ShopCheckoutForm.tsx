import { useState } from "react";
import { router } from "expo-router";
import { Switch, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useAuthStore } from "@/store/useAuthStore";
import { useShopCartStore } from "@/store/useShopCartStore";
import { shopAction } from "@/lib/shop";
import {
  shopMoney,
  type ShopSeller,
  type ShopOrder,
  type ShopAddress,
} from "@/types/shop";
import { shopStyles as st } from "./ShopUi";
export function ShopCheckoutForm({
  seller: s,
  items,
  subtotal,
  unavailable,
}: {
  seller: ShopSeller;
  items: { variantId: string; quantity: number }[];
  subtotal: number;
  unavailable: boolean;
}) {
  const logged = useAuthStore((s) => s.isLoggedIn);
  const [mode, setMode] = useState(s.pickup_enabled ? "pickup" : "delivery"),
    [phone, setPhone] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [address, setAddress] = useState<ShopAddress>({
    cep: "",
    street: "",
    number: "",
    complement: "",
    city: "",
    state: "",
  });
  const shipping = mode === "delivery" ? s.delivery_fee_cents : 0;
  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const order = await shopAction<ShopOrder>("prepare_order", {
        sellerId: s.id,
        nonce: useShopCartStore.getState().nonce(s.id),
        items,
        fulfillment: mode,
        address,
        phone,
        termsVersion: "shop-buy-v1",
        consent,
      });
      useShopCartStore.getState().clearSeller(s.id);
      router.push({ pathname: "/loja/pedido/[id]", params: { id: order.id } });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível criar o pedido.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={st.divider}>
      <SegmentedControl
        label="Recebimento"
        value={mode}
        onChange={setMode}
        options={[
          ...(s.pickup_enabled ? [{ value: "pickup", label: "Retirada" }] : []),
          ...(s.delivery_enabled
            ? [{ value: "delivery", label: "Entrega" }]
            : []),
        ]}
      />
      {mode === "pickup" ? (
        <Text style={st.copy}>
          Retirada:{" "}
          {s.pickup_address || "Endereço ainda não configurado pelo vendedor."}
        </Text>
      ) : (
        <>
          <Text style={st.copy}>
            Frete fixo informado pelo vendedor: {shopMoney(shipping)}.{" "}
            {s.cep_prefixes.length
              ? `Atende CEPs iniciados por ${s.cep_prefixes.join(", ")}.`
              : "Consulte o prazo com o vendedor; o envio é organizado por ele."}
          </Text>
          {(
            [
              ["cep", "CEP (8 dígitos)"],
              ["street", "Rua"],
              ["number", "Número"],
              ["complement", "Complemento (opcional)"],
              ["city", "Cidade"],
              ["state", "UF"],
            ] as const
          ).map(([key, label]) => (
            <TextField
              key={key}
              label={label}
              value={address[key]}
              containerStyle={st.field}
              maxLength={key === "cep" ? 9 : key === "state" ? 2 : 120}
              keyboardType={key === "cep" ? "number-pad" : "default"}
              onChangeText={(text) =>
                setAddress((a) => ({
                  ...a,
                  [key]:
                    key === "cep"
                      ? text.replace(/\D/g, "")
                      : key === "state"
                        ? text.toUpperCase()
                        : text,
                }))
              }
            />
          ))}
        </>
      )}
      <TextField
        label="Telefone para este pedido"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={30}
        containerStyle={st.field}
      />
      <Text style={st.price}>Total: {shopMoney(subtotal + shipping)}</Text>
      <Text style={st.copy}>
        Produtos: {shopMoney(subtotal)} · Frete: {shopMoney(shipping)}. O
        servidor revalida os valores. A comissão da plataforma não é adicionada
        ao total do comprador.
      </Text>
      <View style={st.row}>
        <Switch
          accessibilityLabel="Concordo com itens, vendedor e entrega"
          value={consent}
          onValueChange={setConsent}
        />
        <Text style={[st.copy, { flex: 1 }]}>
          Conferi itens, vendedor e entrega. Meus dados do pedido serão
          compartilhados com o vendedor para atendimento.
        </Text>
      </View>
      {!s.gateway?.enabled && (
        <Text style={st.copy}>
          Este vendedor ainda precisa habilitar pagamentos homologados.
        </Text>
      )}
      {!logged ? (
        <Button
          label="Entrar para fechar pedido"
          onPress={() => router.push("/(auth)/login")}
        />
      ) : (
        <Button
          label="Criar pedido e conferir pagamento"
          disabled={
            !consent ||
            !phone.trim() ||
            unavailable ||
            !s.gateway?.enabled ||
            busy
          }
          loading={busy}
          onPress={() => void checkout()}
        />
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={st.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
