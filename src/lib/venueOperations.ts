import { supabase } from "./supabase";
import { useAuthStore } from "@/store/useAuthStore";
import type {
  AcademyProgram,
  AcademySnapshot,
  VenueSnapshot,
} from "@/types/venueOperations";
import type { Json } from "@/types/supabase.generated";
export const emptyAcademy = (): AcademySnapshot => ({
  programs: [],
  seats: [],
  bills: [],
  swaps: [],
  credits: [],
  notices: [],
});
export const moneyCents = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    c / 100,
  );
export function compatiblePrograms(
  a: AcademyProgram,
  b: AcademyProgram,
  makeup = false,
) {
  return (
    a.active &&
    b.active &&
    a.establishment_id === b.establishment_id &&
    a.sport_id === b.sport_id &&
    a.level.trim().toLowerCase() === b.level.trim().toLowerCase() &&
    a.format === b.format &&
    a.duration_minutes === b.duration_minutes &&
    a.coach_id === b.coach_id &&
    a.monthly_cents === b.monthly_cents &&
    a.drop_in_cents === b.drop_in_cents &&
    (makeup
      ? a.makeups_enabled && b.makeups_enabled
      : a.swaps_enabled && b.swaps_enabled)
  );
}
export function parsePrice(value: string): number | null {
  if (!value.trim()) return null;
  const clean = value.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(clean))
    throw new Error("Use um preço válido com até duas casas decimais.");
  const cents = Math.round(Number(clean) * 100);
  if (cents > 10000000) throw new Error("Preço máximo: R$ 100.000.");
  return cents;
}
async function call<T>(
  fn: "venue_snapshot" | "academy_snapshot" | "venue_action" | "academy_action",
  args: Record<string, Json | undefined>,
): Promise<T> {
  if (!supabase)
    throw new Error("Esta operação exige uma conta conectada ao Supabase.");
  const actor = useAuthStore.getState().authUserId;
  // Generated signatures are refreshed after the migration is applied.
  const { data, error } = await (supabase.rpc as Function)(fn, args);
  if (actor !== useAuthStore.getState().authUserId)
    throw new Error("A conta mudou. Atualize antes de continuar.");
  if (error?.message.includes("field_schedule_conflict"))
    throw new Error(
      "A quadra já está ocupada nesse horário. A publicação não foi aplicada.",
    );
  if (error?.message.includes("Quadra incompatível"))
    throw new Error("Escolha uma quadra que suporte o esporte desta aula.");
  if (error)
    throw new Error(
      error.message.includes("OPERAÇÃO:")
        ? error.message.split("OPERAÇÃO:")[1].trim()
        : "Não foi possível concluir. Atualize e tente novamente.",
    );
  return data as T;
}
export const venueSnapshot = (venue: string | null) =>
  call<VenueSnapshot>("venue_snapshot", { p_venue: venue });
export const academySnapshot = (venue: string | null) =>
  call<AcademySnapshot>("academy_snapshot", { p_venue: venue });
export const venueAction = <T = { id: string }>(
  action: string,
  data: Record<string, unknown>,
) => call<T>("venue_action", { p_action: action, p_data: data as Json });
export const academyAction = (action: string, data: Record<string, unknown>) =>
  call<{ id: string; count: number }>("academy_action", {
    p_action: action,
    p_data: data as Json,
  });
export async function sendVenueInvite(inviteId: string) {
  if (!supabase) throw new Error("Convite indisponível.");
  const { data, error } = await supabase.functions.invoke("venue-invite", {
    body: { inviteId },
  });
  if (error)
    throw new Error(
      "Comanda salva. Convite pendente: verifique a configuração de envio.",
    );
  return data as { message: string; status: string };
}
