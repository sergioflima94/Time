import { useEffect, useRef, useState } from "react";
import { Image, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { colors } from "@/constants/theme";
type Connection = {
  state: string;
  configured: boolean;
  message: string;
  qr?: string | null;
  code?: string | null;
  pairingCode?: string | null;
};
export function WhatsAppConnection({ venue }: { venue: string }) {
  const actor = useAuthStore((s) => s.authUserId);
  return <Connection key={`${actor}:${venue}`} venue={venue} />;
}
function Connection({ venue }: { venue: string }) {
  const [data, setData] = useState<Connection | null>(null),
    [phone, setPhone] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const live = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (!data?.qr && !data?.code && !data?.pairingCode) return;
    const t = setTimeout(
      () =>
        setData((d) =>
          d
            ? {
                ...d,
                qr: null,
                code: null,
                pairingCode: null,
                message:
                  "QR/código removido após 60 segundos. Consulte a conexão ou gere outro.",
              }
            : null,
        ),
      60000,
    );
    return () => clearTimeout(t);
  }, [data]);
  async function run(action: "connect" | "status") {
    if (lock.current || !supabase) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setData(null);
    const actor = useAuthStore.getState().authUserId;
    try {
      const digits = phone.replace(/\D/g, ""),
        number =
          digits.length === 10 || digits.length === 11 ? "55" + digits : digits;
      const { data, error } = await supabase.functions.invoke(
        "whatsapp-instance",
        {
          body: {
            action,
            venueId: venue,
            phone: action === "connect" ? number : undefined,
          },
        },
      );
      if (!live.current || actor !== useAuthStore.getState().authUserId) return;
      if (error) {
        let message =
          "Não foi possível conectar. Confira a configuração do servidor.";
        try {
          const b = await error.context?.json();
          if (b?.error) message = b.error;
        } catch {}
        throw Error(message);
      }
      setData(data);
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 12, marginBottom: 16 }}>
      <Text style={{ color: colors.text, fontWeight: "800" }}>
        Conectar número · Evolution API
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19 }}>
        Uma instância exclusiva deste estabelecimento. Use QR em outro aparelho
        ou informe o número para solicitar código de pareamento. A chave fica
        somente no servidor. Conexão não comprova entrega de mensagens nem
        verifica o contato dos clientes.
      </Text>
      <TextField
        label="Número para pareamento (opcional)"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="55 + DDD + número"
      />
      <Button
        label="Conectar WhatsApp pela Evolution API"
        loading={busy}
        onPress={() => void run("connect")}
      />
      <Button
        small
        variant="outline"
        label="Consultar conexão do WhatsApp"
        disabled={busy}
        onPress={() => void run("status")}
      />
      {data && (
        <>
          <Text style={{ color: colors.text }}>
            Estado:{" "}
            {data.state === "open"
              ? "Conectado"
              : data.state === "connecting"
                ? "Aguardando pareamento"
                : data.configured
                  ? "Desconectado"
                  : "Servidor não configurado"}
          </Text>
          <Text
            style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19 }}
          >
            {data.message}
          </Text>
          {data.qr ? (
            <Image
              source={{ uri: data.qr }}
              style={{ width: 220, height: 220, alignSelf: "center" }}
              accessibilityLabel="QR temporário para conectar WhatsApp"
            />
          ) : data.code ? (
            <View
              style={{
                padding: 12,
                backgroundColor: "white",
                alignSelf: "center",
              }}
            >
              <QRCode value={data.code} size={200} />
            </View>
          ) : null}
          {data.pairingCode && (
            <Text
              selectable
              style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}
            >
              Código: {data.pairingCode}
            </Text>
          )}
        </>
      )}
      {!!error && <Text style={{ color: colors.warning }}>{error}</Text>}
    </Card>
  );
}
