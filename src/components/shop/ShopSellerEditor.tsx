import { useState } from "react";
import { Share, Switch, Text, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { AdaptiveSelect } from "@/components/ui/AdaptiveSelect";
import { shopAction, shopPayment } from "@/lib/shop";
import { SHOP_SELLER_STATUS, shopCents, type ShopSeller } from "@/types/shop";
import { shopStyles as st } from "./ShopUi";

export function ShopSellerEditor({
  seller: s,
  admin,
  onSaved,
}: {
  seller: ShopSeller;
  admin: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [name, setName] = useState(s.name),
    [phone, setPhone] = useState(s.phone),
    [address, setAddress] = useState(s.pickup_address),
    [pickup, setPickup] = useState(s.pickup_enabled),
    [delivery, setDelivery] = useState(s.delivery_enabled),
    [fee, setFee] = useState(String(s.delivery_fee_cents / 100)),
    [ceps, setCeps] = useState(s.cep_prefixes.join(", "));
  const [reason, setReason] = useState(""),
    [commission, setCommission] = useState(
      String((s.commission_bps || 0) / 100),
    ),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      await onSaved();
      setNotice("Configuração salva.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Card style={st.form}>
        <Text style={st.section}>Entrega e atendimento</Text>
        <Text style={st.copy}>
          Situação: {SHOP_SELLER_STATUS[s.status]} · Comissão acordada:{" "}
          {((s.commission_bps || 0) / 100).toFixed(2)}%. Telefone e endereço
          comercial de retirada aparecem no catálogo.
        </Text>
        <TextField
          label="Nome comercial"
          value={name}
          onChangeText={setName}
          maxLength={120}
          containerStyle={st.field}
        />
        <TextField
          label="Telefone comercial"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={30}
          containerStyle={st.field}
        />
        <TextField
          label="Endereço comercial de retirada"
          value={address}
          onChangeText={setAddress}
          maxLength={500}
          containerStyle={st.field}
        />
        <View style={st.row}>
          <Switch
            accessibilityLabel="Permitir retirada"
            value={pickup}
            onValueChange={setPickup}
          />
          <Text style={st.copy}>Retirada no estabelecimento</Text>
        </View>
        <View style={st.row}>
          <Switch
            accessibilityLabel="Permitir entrega"
            value={delivery}
            onValueChange={setDelivery}
          />
          <Text style={st.copy}>Entrega pelo vendedor</Text>
        </View>
        {delivery && (
          <>
            <TextField
              label="Frete fixo em reais"
              value={fee}
              onChangeText={setFee}
              keyboardType="decimal-pad"
              containerStyle={st.field}
            />
            <TextField
              label="Prefixos de CEP atendidos, separados por vírgula"
              value={ceps}
              onChangeText={setCeps}
              placeholder="Ex.: 740, 741"
              containerStyle={st.field}
            />
            <Text style={st.copy}>
              De 3 a 8 dígitos por prefixo. Vazio aceita qualquer CEP válido.
              Não é cotação automática de transportadora: combine prazos e
              cobertura com o cliente.
            </Text>
          </>
        )}
        <Button
          label="Salvar loja e entrega"
          loading={busy}
          disabled={busy || (!pickup && !delivery)}
          onPress={() =>
            void run(() =>
              shopAction("seller_save", {
                id: s.id,
                revision: s.revision,
                name,
                phone,
                pickupAddress: address,
                pickupEnabled: pickup,
                deliveryEnabled: delivery,
                deliveryFeeCents: shopCents(fee),
                cepPrefixes: ceps
                  .split(",")
                  .map((c) => c.trim())
                  .filter(Boolean),
              }),
            )
          }
        />
        {admin && (
          <>
            <Text style={st.section}>Aprovação e parceria</Text>
            <TextField
              label="Comissão percentual (0 a 30)"
              value={commission}
              onChangeText={setCommission}
              keyboardType="decimal-pad"
              containerStyle={st.field}
            />
            <TextField
              label="Motivo da aprovação, suspensão ou recusa"
              value={reason}
              onChangeText={setReason}
              maxLength={500}
              containerStyle={st.field}
            />
            <View style={st.row}>
              {[
                { value: "active", label: "Aprovar parceiro" },
                { value: "suspended", label: "Suspender vendas" },
                { value: "declined", label: "Recusar parceria" },
              ].map((o) => (
                <Button
                  key={o.value}
                  label={o.label}
                  small
                  variant="outline"
                  disabled={busy || reason.trim().length < 8}
                  onPress={() =>
                    void run(() =>
                      shopAction("seller_review", {
                        id: s.id,
                        revision: s.revision,
                        status: o.value,
                        commissionBps: shopCents(commission),
                        reason,
                      }),
                    )
                  }
                />
              ))}
            </View>
            <Text style={st.copy}>
              A comissão fica registrada por pedido. Os gateways recebem na
              conta do vendedor; não há split automático homologado. Negocie o
              repasse e dê baixa somente após recebê-lo.
            </Text>
          </>
        )}
        {!!notice && (
          <Text accessibilityRole="alert" style={st.notice}>
            {notice}
          </Text>
        )}
      </Card>
      <ShopGatewayEditor seller={s} admin={admin} onSaved={onSaved} />
    </>
  );
}
function ShopGatewayEditor({
  seller: s,
  admin,
  onSaved,
}: {
  seller: ShopSeller;
  admin: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [provider, setProvider] = useState<string>(
      s.gateway?.provider || "mercado_pago",
    ),
    [token, setToken] = useState(""),
    [client, setClient] = useState(""),
    [secret, setSecret] = useState(""),
    [webhook, setWebhook] = useState(""),
    [reason, setReason] = useState(""),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function connect() {
    setBusy(true);
    setNotice("");
    try {
      const result = await shopPayment("connect", {
        sellerId: s.id,
        provider,
        credentials:
          provider === "mercado_pago"
            ? { accessToken: token, webhookSecret: webhook }
            : {
                clientId: client,
                clientSecret: secret,
                webhookSecret: webhook,
              },
      });
      setUrl(result.webhookUrl || "");
      setNotice(result.message || "Conta conectada.");
      await onSaved();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Não foi possível conectar.");
    } finally {
      setToken("");
      setClient("");
      setSecret("");
      setWebhook("");
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setNotice("");
    try {
      await shopAction("gateway_disconnect", { sellerId: s.id, reason });
      await onSaved();
      setNotice(
        "Novos checkouts desativados. Pedidos antigos continuam conciliáveis.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha ao desativar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={st.form}>
      <Text style={st.section}>Receber pagamentos</Text>
      <Text style={st.copy}>
        Atual:{" "}
        {s.gateway?.enabled
          ? s.gateway.provider
          : s.gateway?.id
            ? "conectado, aguardando homologação/liberação"
            : "não conectado"}
        . Credenciais ficam criptografadas no Vault, nunca no carrinho ou
        armazenamento do celular. A plataforma precisa homologar/liberar cada
        integração antes das vendas reais.
      </Text>
      <AdaptiveSelect
        title="Gateway da loja"
        value={provider}
        onChange={(p) => {
          setProvider(p);
          setToken("");
          setClient("");
          setSecret("");
          setWebhook("");
        }}
        options={[
          { value: "mercado_pago", label: "Mercado Pago" },
          { value: "picpay", label: "PicPay Empresas" },
        ]}
      />
      {provider === "mercado_pago" ? (
        <TextField
          label="Access Token de produção Mercado Pago"
          value={token}
          onChangeText={setToken}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={st.field}
        />
      ) : (
        <>
          <TextField
            label="Client ID PicPay"
            value={client}
            onChangeText={setClient}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            containerStyle={st.field}
          />
          <TextField
            label="Client Secret PicPay"
            value={secret}
            onChangeText={setSecret}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            containerStyle={st.field}
          />
        </>
      )}
      <TextField
        label={
          provider === "mercado_pago"
            ? "Segredo de assinatura do webhook"
            : "API Key do webhook PicPay"
        }
        value={webhook}
        onChangeText={setWebhook}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        containerStyle={st.field}
      />
      <Button
        label="Validar e conectar conta do vendedor"
        disabled={
          busy ||
          s.status !== "active" ||
          webhook.length < 16 ||
          (provider === "mercado_pago" ? !token : !client || !secret)
        }
        loading={busy}
        onPress={() => void connect()}
      />
      {!!url && (
        <>
          <Text selectable style={st.copy}>
            Webhook: {url}
          </Text>
          <Button
            small
            variant="outline"
            label="Compartilhar URL do webhook"
            onPress={() => void Share.share({ message: url })}
          />
        </>
      )}
      {admin && s.gateway?.id && !s.gateway.enabled && (
        <ShopGatewayApproval seller={s} onSaved={onSaved} />
      )}
      {s.gateway?.enabled && (
        <>
          <TextField
            label="Motivo para desativar novos pagamentos"
            value={reason}
            onChangeText={setReason}
            containerStyle={st.field}
          />
          <Button
            small
            variant="outline"
            label="Desativar gateway da loja"
            disabled={busy || reason.trim().length < 8}
            onPress={() => void disconnect()}
          />
        </>
      )}
      {!!notice && (
        <Text accessibilityRole="alert" style={st.notice}>
          {notice}
        </Text>
      )}
    </Card>
  );
}
function ShopGatewayApproval({
  seller,
  onSaved,
}: {
  seller: ShopSeller;
  onSaved: () => Promise<unknown>;
}) {
  const [verified, setVerified] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function enable() {
    setBusy(true);
    setNotice("");
    try {
      await shopAction("gateway_enable", {
        id: seller.gateway?.id,
        verified,
        reason,
      });
      await onSaved();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha ao liberar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={st.form}>
      <Text style={st.label}>Liberação administrativa por vendedor</Text>
      <Text style={st.copy}>
        Antes de liberar, valide recebedor, checkout, webhook autenticado,
        pagamento e reembolso com o PSP. Esta confirmação registra sua
        homologação, não executa testes ou pagamentos.
      </Text>
      <View style={st.row}>
        <Switch
          accessibilityLabel="Homologação do gateway concluída"
          value={verified}
          onValueChange={setVerified}
        />
        <Text style={[st.copy, { flex: 1 }]}>
          Concluí a homologação desta conta.
        </Text>
      </View>
      <TextField
        label="Referência da homologação e motivo"
        value={reason}
        onChangeText={setReason}
        maxLength={500}
        containerStyle={st.field}
      />
      <Button
        small
        label="Liberar gateway homologado desta loja"
        disabled={busy || !verified || reason.trim().length < 8}
        onPress={() => void enable()}
      />
      {!!notice && <Text style={st.error}>{notice}</Text>}
    </View>
  );
}
