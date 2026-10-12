import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AppState, Linking, Share, Switch, Text, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { AdaptiveSelect } from "@/components/ui/AdaptiveSelect";
import { shopStyles as st } from "@/components/shop/ShopUi";
import {
  shopAction,
  shopCheckoutUrl,
  shopOrder,
  shopPayment,
} from "@/lib/shop";
import { phoneKey } from "@/lib/friendDiscoveryRules";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppStore } from "@/store/useAppStore";
import {
  SHOP_EVENTS,
  SHOP_STATUS,
  shopMoney,
  type ShopOrder,
} from "@/types/shop";
export default function ShopOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    actor = useAuthStore((s) => s.authUserId);
  const playerId = useAppStore((s) => s.currentPlayerId),
    epoch = useRef(0);
  const [order, setOrder] = useState<ShopOrder | null>(null),
    [forActor, setForActor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [reason, setReason] = useState(""),
    [tracking, setTracking] = useState(""),
    [carrier, setCarrier] = useState(""),
    [restock, setRestock] = useState(false),
    [payment, setPayment] = useState("");
  const refresh = useCallback(async () => {
    const n = ++epoch.current;
    try {
      const result = await shopOrder(id);
      if (n === epoch.current) {
        setOrder(result);
        setForActor(actor);
      }
    } catch (e) {
      if (n === epoch.current)
        setNotice(e instanceof Error ? e.message : "Pedido indisponível.");
    }
  }, [id, actor]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      const timer = setInterval(() => {
        if (AppState.currentState === "active") void refresh();
      }, 20000);
      return () => {
        clearInterval(timer);
        epoch.current++;
      };
    }, [refresh]),
  );
  useEffect(() => {
    setReason("");
    setPayment("");
    setRestock(false);
  }, [id, actor]);
  const o = actor === forActor && order?.id === id ? order : null;
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setNotice("");
    try {
      const result = await fn();
      if (result && typeof result === "object" && "message" in result)
        setNotice(String(result.message));
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Operação indisponível.");
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    const result = await shopPayment("checkout", { orderId: id });
    if (!result.url || !shopCheckoutUrl(result.url))
      throw new Error("Link de pagamento inválido.");
    await Linking.openURL(result.url);
  }
  return (
    <Screen contentStyle={st.page}>
      <Button
        small
        variant="ghost"
        label="Voltar à loja"
        onPress={() => router.replace("/loja")}
      />
      <Text style={st.title}>Pedido {id?.slice(0, 8)}</Text>
      {!!notice && (
        <Text accessibilityRole="alert" style={st.notice}>
          {notice}
        </Text>
      )}
      {!o ? (
        <Card>
          <Text style={st.copy}>Consultando seu pedido...</Text>
          <Button
            small
            variant="outline"
            label="Consultar novamente"
            onPress={() => void refresh()}
          />
        </Card>
      ) : (
        <>
          <Card>
            <Text style={st.section}>{o.seller_name}</Text>
            <Text style={st.label}>{SHOP_STATUS[o.status]}</Text>
            <Text style={st.price}>{shopMoney(o.total_cents)}</Text>
            <Text style={st.copy}>
              Produtos {shopMoney(o.subtotal_cents)} · Frete{" "}
              {shopMoney(o.shipping_cents)} ·{" "}
              {o.provider === "mercado_pago" ? "Mercado Pago" : "PicPay"}
            </Text>
            <Text style={st.copy}>
              Pagamento vai ao vendedor. Abrir o checkout ou voltar do navegador
              não confirma pagamento.
            </Text>
            {o.status === "pending" && (
              <>
                <Text style={st.copy}>
                  Reserva de estoque até{" "}
                  {new Date(o.expires_at).toLocaleString("pt-BR")}. Após esse
                  prazo, não pague um link antigo.
                </Text>
                {o.buyer_id === playerId && (
                  <Button
                    label="Pagar com Pix ou cartão"
                    disabled={busy || Date.parse(o.expires_at) <= Date.now()}
                    loading={busy}
                    onPress={() => void run(pay)}
                  />
                )}
                <Button
                  small
                  variant="outline"
                  label="Cancelar pedido não pago"
                  disabled={busy}
                  onPress={() => void run(() => shopAction("cancel", { id }))}
                />
              </>
            )}
            <Button
              small
              variant="outline"
              label="Conferir pagamento no provedor"
              loading={busy}
              onPress={() =>
                void run(() => shopPayment("reconcile", { orderId: id }))
              }
            />
            {o.pix_code && o.status === "pending" && (
              <Button
                small
                variant="ghost"
                label="Compartilhar código Pix"
                disabled={Date.parse(o.expires_at) <= Date.now()}
                onPress={() => void Share.share({ message: o.pix_code! })}
              />
            )}
            {o.status === "payment_review" && (
              <Text style={st.copy}>
                O pagamento requer revisão (ex.: atraso, duplicidade ou estorno
                parcial). A entrega não está liberada. Contate o vendedor.
              </Text>
            )}
          </Card>
          <Card>
            <Text style={st.section}>Itens do pedido</Text>
            {o.lines.map((l) => (
              <View key={l.variant_id} style={st.group}>
                <Text style={st.label}>
                  {l.quantity}× {l.product_name}
                </Text>
                <Text style={st.copy}>
                  {[l.size, l.color, l.sku].filter(Boolean).join(" · ")} ·{" "}
                  {shopMoney(l.unit_cents)} por unidade
                </Text>
              </View>
            ))}
          </Card>
          <Card>
            <Text style={st.section}>
              {o.fulfillment === "pickup" ? "Retirada" : "Entrega"}
            </Text>
            <Text style={st.copy}>
              {o.fulfillment === "pickup"
                ? o.pickup_address
                : o.address
                  ? `${o.address.street}, ${o.address.number} ${o.address.complement || ""} · ${o.address.city}/${o.address.state} · CEP ${o.address.cep}`
                  : "Endereço indisponível"}
            </Text>
            <Text style={st.copy}>
              Contato deste pedido: {o.customer_phone}
            </Text>
            {!!o.tracking && (
              <Text selectable style={st.copy}>
                {o.carrier || "Transportadora"} · Rastreio: {o.tracking}
              </Text>
            )}
            {!!phoneKey(o.seller_phone) && (
              <Button
                small
                variant="outline"
                label="Falar com o vendedor pelo WhatsApp"
                onPress={() =>
                  void run(() =>
                    Linking.openURL(
                      `https://wa.me/${phoneKey(o.seller_phone)}`,
                    ),
                  )
                }
              />
            )}
          </Card>
          {[
            "paid",
            "ready",
            "shipped",
            "delivered",
            "payment_review",
            "refund_pending",
          ].includes(o.status) && (
            <Card style={st.form}>
              <Text style={st.section}>Cancelamento e devolução</Text>
              <Text style={st.copy}>
                Descreva o motivo. O vendedor analisa a solicitação; só
                mostramos reembolso concluído após confirmação no provedor. Não
                envie dados de cartão.
              </Text>
              <TextField
                label="Motivo ou orientação ao cliente"
                value={reason}
                onChangeText={setReason}
                multiline
                maxLength={500}
                containerStyle={st.field}
              />
              {!!o.refund_reason && (
                <Text style={st.copy}>
                  Última solicitação/resposta: {o.refund_reason}
                </Text>
              )}
              {o.buyer_id === playerId && o.status !== "refund_pending" && (
                <Button
                  small
                  variant="outline"
                  label="Solicitar reembolso"
                  disabled={busy || reason.trim().length < 8}
                  onPress={() =>
                    void run(() => shopAction("refund_request", { id, reason }))
                  }
                />
              )}
              {o.can_manage && (
                <>
                  <AdaptiveSelect
                    title="Pagamento a reembolsar"
                    value={payment || o.payment_id || ""}
                    onChange={setPayment}
                    options={(o.receipts || [])
                      .filter((r) => r.status === "approved")
                      .map((r) => ({
                        value: r.payment_id,
                        label: `${r.payment_id} · ${shopMoney(r.amount_cents)}`,
                      }))}
                  />
                  <View style={st.row}>
                    <Switch
                      accessibilityLabel="Itens devolvidos e recebidos fisicamente"
                      value={restock}
                      onValueChange={setRestock}
                    />
                    <Text style={[st.copy, { flex: 1 }]}>
                      Recebi fisicamente os itens e autorizo repor estoque após
                      reembolso integral confirmado.
                    </Text>
                  </View>
                  <Button
                    small
                    variant="danger"
                    label="Aprovar reembolso integral no gateway"
                    disabled={
                      busy ||
                      reason.trim().length < 8 ||
                      !(o.receipts || []).some((r) => r.status === "approved")
                    }
                    onPress={() =>
                      void run(() =>
                        shopPayment("refund", {
                          orderId: id,
                          paymentId: payment || o.payment_id,
                          reason,
                          restock,
                        }),
                      )
                    }
                  />
                  {o.refund_requested_at && o.status !== "refund_pending" && (
                    <Button
                      small
                      variant="outline"
                      label="Registrar resposta sem aprovar reembolso"
                      disabled={busy || reason.trim().length < 8}
                      onPress={() =>
                        void run(() =>
                          shopAction("refund_decline", { id, reason }),
                        )
                      }
                    />
                  )}
                </>
              )}
            </Card>
          )}
          {o.can_manage && ["paid", "ready", "shipped"].includes(o.status) && (
            <Card style={st.form}>
              <Text style={st.section}>Preparar e entregar</Text>
              {o.fulfillment === "delivery" && (
                <>
                  <TextField
                    label="Transportadora"
                    value={carrier}
                    onChangeText={setCarrier}
                    maxLength={80}
                    containerStyle={st.field}
                  />
                  <TextField
                    label="Código de rastreio"
                    value={tracking}
                    onChangeText={setTracking}
                    maxLength={160}
                    containerStyle={st.field}
                  />
                </>
              )}
              <View style={st.row}>
                {o.status === "paid" && (
                  <Button
                    small
                    label="Marcar pronto"
                    disabled={busy}
                    onPress={() =>
                      void run(() =>
                        shopAction("fulfill", { id, status: "ready" }),
                      )
                    }
                  />
                )}
                {o.fulfillment === "delivery" && o.status !== "shipped" && (
                  <Button
                    small
                    variant="outline"
                    label="Registrar envio"
                    disabled={busy}
                    onPress={() =>
                      void run(() =>
                        shopAction("fulfill", {
                          id,
                          status: "shipped",
                          tracking,
                          carrier,
                        }),
                      )
                    }
                  />
                )}
                <Button
                  small
                  variant="outline"
                  label={
                    o.fulfillment === "pickup"
                      ? "Confirmar retirada entregue"
                      : "Confirmar entrega"
                  }
                  disabled={busy}
                  onPress={() =>
                    void run(() =>
                      shopAction("fulfill", {
                        id,
                        status: "delivered",
                        tracking,
                        carrier,
                      }),
                    )
                  }
                />
              </View>
            </Card>
          )}
          {o.can_manage && o.status === "refunded" && !o.stock_released && (
            <Card>
              <Text style={st.copy}>
                O reembolso não significa que a mercadoria voltou. Reponha o
                estoque só após recebê-la.
              </Text>
              <TextField
                label="Motivo da reposição"
                value={reason}
                onChangeText={setReason}
              />
              <Button
                small
                variant="outline"
                label="Recebi a devolução: repor estoque"
                disabled={busy || reason.trim().length < 8}
                onPress={() =>
                  void run(() =>
                    shopAction("restock_return", {
                      id,
                      reason,
                      received: true,
                    }),
                  )
                }
              />
            </Card>
          )}
          <Card>
            <Text style={st.section}>Histórico</Text>
            {o.events.map((e, i) => (
              <View key={i} style={st.group}>
                <Text style={st.label}>
                  {new Date(e.created_at).toLocaleString("pt-BR")} ·{" "}
                  {SHOP_EVENTS[e.action] || "Atualização do pedido"}
                </Text>
                <Text style={st.copy}>{e.detail}</Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
