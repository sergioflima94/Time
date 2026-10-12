import { router } from "expo-router";
import { Text } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useVenueOperations } from "@/hooks/useVenueOperations";
import { colors } from "@/constants/theme";
export default function Operations() {
  const { data, error, busy, refresh } = useVenueOperations(null);
  return (
    <Screen>
      <Button
        small
        variant="ghost"
        label="Voltar"
        onPress={() => router.back()}
      />
      <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text }}>
        Meus acessos no estabelecimento
      </Text>
      <Text style={{ color: colors.textMuted }}>
        Dono, professor, funcionário ou sócio: cada acesso respeita as
        permissões concedidas.
      </Text>
      <Button
        variant="outline"
        label="Atualizar acessos"
        loading={busy}
        onPress={() => void refresh()}
      />
      {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {(data.venues ?? []).map((v) => (
        <Card key={v.id} style={{ gap: 10 }}>
          <Text style={{ fontWeight: "700", color: colors.text }}>
            {v.name}
          </Text>
          <Button
            label="Abrir operação"
            onPress={() =>
              router.push({
                pathname: "/operacao/ao-vivo",
                params: { establishmentId: v.id },
              })
            }
          />
        </Card>
      ))}
      {!busy && !data.venues?.length && (
        <Text style={{ color: colors.textMuted }}>
          Sem acessos. O dono pode cadastrar seu e-mail confirmado em Equipe e
          permissões.
        </Text>
      )}
    </Screen>
  );
}
