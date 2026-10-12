import { supabase } from "./supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { createUuid } from "./uuid";
import type {
  CreditSnapshot,
  CreditQuery,
  CreditInvoice,
} from "@/types/customerInvoices";
import type { Database, Json } from "@/types/supabase.generated";
type CreditFunction =
  "credit_action" | "credit_snapshot" | "credit_search" | "credit_export";
async function call<T>(
  fn: CreditFunction,
  args: Database["public"]["Functions"][CreditFunction]["Args"],
): Promise<T> {
  if (!supabase)
    throw new Error("Faturas exigem uma conta conectada ao Supabase.");
  const actor = useAuthStore.getState().authUserId;
  if (!actor) throw new Error("Entre na sua conta.");
  const { data, error } = await supabase.rpc(fn, args);
  if (actor !== useAuthStore.getState().authUserId)
    throw new Error("A conta mudou. Atualize antes de continuar.");
  if (error)
    throw new Error(
      error.message?.includes("FATURA:")
        ? error.message.split("FATURA:")[1].trim()
        : "Não foi possível concluir. Atualize e tente novamente.",
    );
  return data as unknown as T;
}
export const creditSnapshot = (
  venue: string | null,
  tab: string | null,
  mode: string,
) =>
  call<CreditSnapshot>("credit_snapshot", {
    p_venue: venue ?? undefined,
    p_tab: tab ?? undefined,
    p_mode: mode,
  });
export const creditAction = <T = { id: string }>(
  action: string,
  data: Record<string, unknown>,
  requestId = createUuid(),
) =>
  call<T>("credit_action", {
    p_action: action,
    p_data: { ...data, requestId } as Json,
  });
export const creditSearch = (venue: string | null, query: CreditQuery) =>
  call<CreditSnapshot>("credit_search", {
    p_venue: venue ?? undefined,
    p_query: query as Json,
  });
export const creditExport = (venue: string | null, query: CreditQuery) =>
  call<{
    invoices: CreditInvoice[];
    truncated: boolean;
    generated_at: string;
  }>("credit_export", { p_venue: venue ?? undefined, p_query: query as Json });
export async function invoicePayment(
  action: "checkout" | "reconcile" | "refund" | "recover",
  data: Record<string, unknown>,
) {
  if (!supabase) throw new Error("Pagamento exige uma conta conectada.");
  const actor = useAuthStore.getState().authUserId;
  const { data: result, error } = await supabase.functions.invoke(
    "invoice-payment",
    { body: { action, ...data } },
  );
  if (actor !== useAuthStore.getState().authUserId)
    throw new Error("A conta mudou. Atualize.");
  if (error) {
    let message =
      "Não foi possível concluir. Consulte a fatura antes de tentar outro pagamento.";
    try {
      const body = await error.context?.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {}
    throw new Error(message);
  }
  return result as { id: string; message: string };
}
