import { useState } from "react";
import { Text } from "react-native";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { AdaptiveSelect } from "./ui/AdaptiveSelect";
import { Consent } from "./InvoiceControls";
import { useVenueOperations } from "@/hooks/useVenueOperations";
import { useAuthStore } from "@/store/useAuthStore";
import { supabase } from "@/lib/supabase";
import { colors } from "@/constants/theme";
export function InvoiceGatewayConnect({ venue }: { venue: string }) {
  const actor = useAuthStore((s) => s.authUserId);
  return <Connect key={`${actor}:${venue}`} venue={venue} />;
}
function Connect({ venue }: { venue: string }) {
  const access = useVenueOperations(venue),
    [open, setOpen] = useState(false),
    [provider, setProvider] = useState("mercado_pago"),
    [token, setToken] = useState(""),
    [client, setClient] = useState(""),
    [secret, setSecret] = useState(""),
    [webhook, setWebhook] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  if (!access.data.owner || !supabase) return null;
  async function save() {
    if (busy || !supabase) return;
    setBusy(true);
    setMessage("");
    const actor = useAuthStore.getState().authUserId;
    try {
      const credentials =
        provider === "mercado_pago"
          ? { accessToken: token, webhookSecret: webhook }
          : { clientId: client, clientSecret: secret, webhookSecret: webhook };
      const { data, error } = await supabase.functions.invoke(
        "invoice-payment",
        {
          body: {
            action: "connect",
            venueId: venue,
            provider,
            credentials,
            confirmed,
          },
        },
      );
      if (actor !== useAuthStore.getState().authUserId) return;
      if (error) {
        let text =
          "Não foi possível conectar. Atualize e confira as credenciais.";
        try {
          const body = await error.context?.json();
          if (body?.error) text = body.error;
        } catch {}
        throw new Error(text);
      }
      setMessage(data.message + "\nWebhook: " + data.webhookUrl);
      setOpen(false);
      await access.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setToken("");
      setClient("");
      setSecret("");
      setWebhook("");
      setConfirmed(false);
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 12, marginBottom: 16 }}>
      <Text style={{ color: colors.text, fontWeight: "800" }}>
        Configurar Pix das faturas
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19 }}>
        Credenciais seguem por HTTPS para o backend, são conferidas no provedor
        e ficam no Vault. Nunca informe senha bancária. Cobranças de faturas em
        andamento preservam a credencial original.
      </Text>
      <Button
        small
        variant="outline"
        label={
          open ? "Fechar configuração" : "Configurar Mercado Pago ou PicPay"
        }
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <AdaptiveSelect
            label="Gateway para receber"
            value={provider}
            onChange={(p) => {
              setProvider(p);
              setToken("");
              setClient("");
              setSecret("");
              setWebhook("");
              setConfirmed(false);
            }}
            options={[
              { value: "mercado_pago", label: "Mercado Pago" },
              { value: "picpay", label: "PicPay" },
            ]}
          />
          {provider === "mercado_pago" ? (
            <TextField
              label="Access Token de produção"
              value={token}
              onChangeText={setToken}
              secureTextEntry
              autoCapitalize="none"
            />
          ) : (
            <>
              <TextField
                label="Client ID PicPay"
                value={client}
                onChangeText={setClient}
                autoCapitalize="none"
              />
              <TextField
                label="Client Secret PicPay"
                value={secret}
                onChangeText={setSecret}
                secureTextEntry
                autoCapitalize="none"
              />
            </>
          )}
          <TextField
            label="Segredo de webhook do provedor (mínimo 16 caracteres)"
            value={webhook}
            onChangeText={setWebhook}
            secureTextEntry
            autoCapitalize="none"
          />
          <Text selectable style={{ color: colors.textMuted, fontSize: 12 }}>
            Mercado Pago recebe a URL ao gerar o Pix. Após salvar, copie a URL
            exibida para o PicPay e configure o Authorization com o segredo
            informado. O README detalha homologação e roteamento.
          </Text>
          <Consent
            value={confirmed}
            onChange={setConfirmed}
            label="Configurei o webhook e conferi a conta recebedora"
          />
          <Button
            label="Verificar credenciais e salvar"
            loading={busy}
            disabled={
              !confirmed ||
              webhook.length < 16 ||
              (provider === "mercado_pago" && !token) ||
              (provider === "picpay" && (!client || !secret))
            }
            onPress={() => void save()}
          />
        </>
      )}
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.warning, fontSize: 12, lineHeight: 19 }}
        >
          {message}
        </Text>
      )}
    </Card>
  );
}
