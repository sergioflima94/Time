import { router } from "expo-router";
import { Text } from "react-native";
import { useAcademy } from "@/hooks/useVenueOperations";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { colors } from "@/constants/theme";
export function AcademyNotices() {
  const feed = useAcademy(null);
  if (!feed.data.notices.length) return null;
  return (
    <Card style={{ gap: 10 }}>
      <Text style={{ color: colors.text, fontWeight: "700" }}>
        Avisos de aulas
      </Text>
      {feed.data.notices.slice(0, 5).map((n) => (
        <Text key={n.id} style={{ color: colors.textMuted }}>
          {n.title} · {n.body}
        </Text>
      ))}
      <Button
        small
        variant="outline"
        label="Abrir minhas aulas e trocas"
        onPress={() => router.push("/aulas")}
      />
    </Card>
  );
}
