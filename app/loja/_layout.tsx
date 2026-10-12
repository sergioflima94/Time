import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuthStore } from "@/store/useAuthStore";
export default function ShopLayout() {
  const logged = useAuthStore((s) => s.isLoggedIn);
  const ready = useAuthStore((s) => s.authReady);
  if (!ready)
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator accessibilityLabel="Verificando sessão" />
      </View>
    );
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={logged}>
        <Stack.Screen name="gerenciar" />
        <Stack.Screen name="pedido/[id]" />
      </Stack.Protected>
    </Stack>
  );
}
