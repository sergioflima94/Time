import { useLocalSearchParams } from "expo-router";
import { CustomerInvoicesScreen } from "@/components/CustomerInvoicesScreen";
export default function Faturas() {
  const { establishmentId } = useLocalSearchParams<{
    establishmentId?: string;
  }>();
  return <CustomerInvoicesScreen venue={establishmentId ?? null} />;
}
