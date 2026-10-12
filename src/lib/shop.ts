import { useAuthStore } from "@/store/useAuthStore";
import { isMockMode, supabase, supabaseProjectUrl } from "./supabase";
import type { Json } from "@/types/supabase.generated";
import type { ShopOrder, ShopProduct, ShopSnapshot } from "@/types/shop";
import { pickProfilePhoto } from "./photo";
import { createUuid } from "./uuid";
export const shopImageUrl = (key: string) =>
  /^[-a-f0-9]{36}\/[-a-f0-9]{36}\.(jpg|png|webp)$/.test(key)
    ? `${supabaseProjectUrl}/storage/v1/object/public/shop-media/${key}`
    : null;
export const shopCheckoutUrl = (url: string) =>
  /^https:\/\/(?:(?:www\.)?mercadopago\.com\.br\/|(?:link|cobranca)\.(?:picpay\.com|ppay\.me)\/p\/)/.test(
    url,
  );
function fail(error: { message: string }) {
  throw new Error(
    error.message.includes("LOJA:")
      ? error.message.split("LOJA:")[1]
      : "Não foi possível concluir na loja. Atualize e tente novamente.",
  );
}
function same(actor: string | null) {
  if (actor !== useAuthStore.getState().authUserId)
    throw new Error("A conta mudou. Repita a operação.");
}
export async function shopSnapshot(
  mode = "catalog",
  query = "",
  sellerId: string | null = null,
  offset = 0,
): Promise<ShopSnapshot> {
  if (!supabase)
    return { admin: false, sellers: [], products: [], orders: [], offset: 0 };
  const actor = useAuthStore.getState().authUserId;
  const { data, error } = await supabase.rpc("shop_snapshot", {
    p_mode: mode,
    p_query: query,
    p_seller: sellerId!,
    p_offset: offset,
  });
  same(actor);
  if (error) fail(error);
  return data as unknown as ShopSnapshot;
}
export async function shopAction<T = Record<string, string>>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase || isMockMode)
    throw new Error(
      "A loja exige Supabase. Demonstração não cria compras ou pagamentos.",
    );
  const actor = useAuthStore.getState().authUserId;
  const { data: result, error } = await supabase.rpc("shop_action", {
    p_action: action,
    p_data: data as Json,
  });
  same(actor);
  if (error) fail(error);
  return result as T;
}
export async function shopOrder(id: string) {
  if (!supabase) throw new Error("Pedido indisponível em demonstração.");
  const actor = useAuthStore.getState().authUserId;
  const { data, error } = await supabase.rpc("shop_order", { p_order: id });
  same(actor);
  if (error) fail(error);
  return data as unknown as ShopOrder;
}
export async function shopOrdersPage(
  mode: "buyer" | "manage",
  sellerId: string | null,
  before?: ShopOrder,
): Promise<{ orders: ShopOrder[]; hasMore: boolean }> {
  if (!supabase) throw new Error("Histórico da loja exige Supabase.");
  const actor = useAuthStore.getState().authUserId;
  const { data, error } = await supabase.rpc("shop_orders_page", {
    p_mode: mode,
    p_seller: sellerId!,
    p_before: before?.created_at!,
    p_before_id: before?.id!,
  });
  same(actor);
  if (error) fail(error);
  return data as unknown as { orders: ShopOrder[]; hasMore: boolean };
}
export async function shopCart(ids: string[]) {
  if (!supabase) return [];
  const actor = useAuthStore.getState().authUserId;
  const { data, error } = await supabase.rpc("shop_cart", { p_variants: ids });
  same(actor);
  if (error) fail(error);
  return data as unknown as ShopProduct[];
}
export async function shopPayment(
  action: string,
  data: Record<string, unknown>,
) {
  if (!supabase) throw new Error("Pagamentos não disponíveis na demonstração.");
  const actor = useAuthStore.getState().authUserId;
  const { data: result, error } = await supabase.functions.invoke(
    "shop-payment",
    { body: { action, ...data } },
  );
  same(actor);
  if (error) {
    let message =
      "Não foi possível concluir. Consulte o pedido antes de tentar outra cobrança.";
    try {
      const body = await error.context?.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  if (result?.error) throw new Error(result.error);
  return result as {
    url?: string;
    gatewayId?: string;
    webhookUrl?: string;
    message?: string;
  };
}
export async function uploadShopPhoto() {
  if (!supabase) throw new Error("Fotos da loja exigem Supabase.");
  const actor = useAuthStore.getState().authUserId;
  if (!actor) throw new Error("Entre na conta do vendedor.");
  const uri = await pickProfilePhoto();
  if (!uri) return null;
  const response = await fetch(uri);
  const blob = await response.blob();
  if (blob.size > 5242880) throw new Error("A foto deve ter até 5 MB.");
  const type = blob.type || "image/jpeg";
  if (!["image/jpeg", "image/png", "image/webp"].includes(type))
    throw new Error("Use foto JPG, PNG ou WebP.");
  const key = `${actor}/${createUuid()}.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`;
  const { error } = await supabase.storage
    .from("shop-media")
    .upload(key, await blob.arrayBuffer(), {
      contentType: type,
      upsert: false,
    });
  same(actor);
  if (error)
    throw new Error(
      "Não foi possível enviar a foto. Confira sua loja e conexão.",
    );
  return key;
}
