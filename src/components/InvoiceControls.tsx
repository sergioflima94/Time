import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { AdaptiveSelect } from "./ui/AdaptiveSelect";
import { colors } from "@/constants/theme";
import { parsePrice } from "@/lib/venueOperations";
export function Receipt({
  balance,
  full = false,
  busy,
  onSave,
}: {
  balance: number;
  full?: boolean;
  busy: boolean;
  onSave: (data: Record<string, unknown>) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState(""),
    [method, setMethod] = useState("cash"),
    [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  async function save() {
    try {
      const cents = full ? balance : parsePrice(amount);
      if (!cents || cents > balance)
        throw new Error("Informe um valor maior que zero e até o saldo.");
      if (method === "manual_pix" && reference.trim().length < 4)
        throw new Error("Informe a referência bancária do Pix conferido.");
      setError("");
      if (
        await onSave({
          amountCents: cents,
          method,
          reference: reference.trim(),
          confirmed,
        })
      ) {
        setAmount("");
        setConfirmed(false);
        setReference("");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <View style={s.line}>
      <Text style={s.heading}>
        {full ? "Receber agora" : "Registrar recebimento da fatura"}
      </Text>
      {!full && (
        <TextField
          label="Valor recebido (R$) · aceita parcial"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />
      )}
      <AdaptiveSelect
        label="Recebido por"
        value={method}
        onChange={setMethod}
        options={[
          { value: "cash", label: "Dinheiro" },
          { value: "manual_pix", label: "Pix conferido no banco" },
        ]}
      />
      {method === "manual_pix" && (
        <TextField
          label="Referência bancária (mínimo 4 caracteres)"
          value={reference}
          onChangeText={setReference}
        />
      )}
      <Consent
        value={confirmed}
        onChange={setConfirmed}
        label="Conferi o dinheiro ou o crédito no banco"
      />
      <Text style={s.meta}>
        Confirmação presencial pelo caixa, não por gateway. Não registre
        comprovante sem conferir o recebimento.
      </Text>
      {!!error && <Text style={s.message}>{error}</Text>}
      <Button
        label="Confirmar recebimento"
        disabled={busy || !confirmed}
        onPress={() => void save()}
      />
    </View>
  );
}
export function Consent({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <View style={s.row}>
      <Text style={[s.text, { flex: 1 }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
      />
    </View>
  );
}
const s = StyleSheet.create({
  heading: { fontSize: 15, fontWeight: "800", color: colors.text },
  text: { fontSize: 13, lineHeight: 20, color: colors.text },
  meta: { fontSize: 12, lineHeight: 19, color: colors.textMuted },
  message: { fontSize: 13, lineHeight: 20, color: colors.warning },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  line: {
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
});
