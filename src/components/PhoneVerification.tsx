import { useState, useRef, useEffect } from "react";
import { Text } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { colors } from "@/constants/theme";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { Consent } from "./InvoiceControls";
export function PhoneVerification({
  refresh,
}: {
  refresh: () => Promise<void>;
}) {
  const actor = useAuthStore((s) => s.authUserId);
  return <Verify key={actor} refresh={refresh} />;
}
function Verify({ refresh }: { refresh: () => Promise<void> }) {
  const [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [id, setId] = useState(""),
    [consent, setConsent] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [next, setNext] = useState(0);
  const live = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  async function run(action: "send" | "verify") {
    if (!supabase || lock.current) return;
    if (action === "send" && Date.now() < next) {
      setMessage("Aguarde um minuto antes de novo código.");
      return;
    }
    lock.current = true;
    setBusy(true);
    const actor = useAuthStore.getState().authUserId;
    try {
      const digits = phone.replace(/\D/g, ""),
        number =
          digits.length === 10 || digits.length === 11 ? "55" + digits : digits;
      const { data, error } = await supabase.functions.invoke(
        "verify-customer-phone",
        { body: { action, phone: number, consent, code, id } },
      );
      if (!live.current || actor !== useAuthStore.getState().authUserId) return;
      if (error) {
        let text = "Não foi possível verificar o telefone.";
        try {
          const b = await error.context?.json();
          if (b?.error) text = b.error;
        } catch {}
        throw Error(text);
      }
      setMessage(data.message);
      if (action === "send") {
        setId(data.id);
        setNext(Date.now() + 60000);
      } else {
        setId("");
        setCode("");
        await refresh();
      }
    } catch (e) {
      if (live.current) setMessage((e as Error).message);
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  return (
    <Card style={{ gap: 12, marginBottom: 8 }}>
      <Text style={{ color: colors.text, fontWeight: "800" }}>
        Confirmar meu celular
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 19 }}>
        Receba um código no seu WhatsApp. Confirma o contato da sua conta, não
        ativa lembretes automaticamente. Nunca compartilhe o código.
      </Text>
      <TextField
        label="Meu celular com DDD"
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          setId("");
          setConsent(false);
        }}
        keyboardType="phone-pad"
      />
      <Consent
        label="Autorizo receber o código de verificação neste WhatsApp"
        value={consent}
        onChange={setConsent}
      />
      <Button
        label="Enviar código para meu WhatsApp"
        disabled={busy || !consent}
        onPress={() => void run("send")}
      />
      {!!id && (
        <>
          <TextField
            label="Código de seis dígitos"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Button
            label="Confirmar meu telefone"
            disabled={busy || !/^\d{6}$/.test(code)}
            onPress={() => void run("verify")}
          />
        </>
      )}
      {!!message && <Text style={{ color: colors.warning }}>{message}</Text>}
    </Card>
  );
}
