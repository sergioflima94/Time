export type ShopStatus =
  | "pending"
  | "paid"
  | "ready"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refund_pending"
  | "refunded"
  | "payment_review";
export const SHOP_SELLER_STATUS={pending:'Aguardando aprovação',active:'Aprovada',suspended:'Vendas suspensas',declined:'Parceria recusada'};
export interface ShopSeller {
  id: string;
  name: string;
  kind: "official" | "partner";
  status: "pending" | "active" | "suspended" | "declined";
  phone: string;
  pickup_address: string;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  delivery_fee_cents: number;
  cep_prefixes: string[];
  commission_bps: number | null;
  revision: number;
  can_manage: boolean;
  gateway: {
    id?: string | null;
    provider: "mercado_pago" | "picpay";
    enabled: boolean;
  } | null;
}
export interface ShopVariant {
  id: string;
  sku: string;
  size: string;
  color: string;
  price_cents: number;
  stock: number;
  active: boolean;
  revision: number;
  cost_cents: number | null;
}
export interface ShopProduct {
  id: string;
  seller_id: string;
  seller_name: string;
  seller_kind: "official" | "partner";
  name: string;
  description: string;
  category: string;
  photos: string[];
  active: boolean;
  revision: number;
  sponsored: boolean;
  variants: ShopVariant[];
}
export interface ShopLine {
  variant_id: string;
  product_name: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  unit_cents: number;
  cost_cents?: number;
}
export interface ShopAddress {
  cep: string;
  street: string;
  number: string;
  complement: string;
  city: string;
  state: string;
}
export interface ShopReceipt {
  payment_id: string;
  status: "approved" | "refunded" | "partial_refund" | "charged_back";
  amount_cents: number;
}
export interface ShopOrder {
  buyer_id: string;
  id: string;
  seller_id: string;
  seller_name: string;
  seller_phone: string;
  buyer_name: string;
  status: ShopStatus;
  fulfillment: "pickup" | "delivery";
  address: ShopAddress | null;
  customer_phone: string;
  pickup_address: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  commission_cents?: number;
  commission_state?: "pending" | "owed" | "received" | "reversed";
  commission_reference?: string | null;
  provider_fee_cents?: number | null;
  payment_id: string | null;
  provider: string;
  checkout_url: string | null;
  pix_code: string | null;
  stock_released: boolean;
  refund_reason: string | null;
  refund_requested_at: string | null;
  tracking: string | null;
  carrier: string | null;
  created_at: string;
  expires_at: string;
  can_manage: boolean;
  lines: ShopLine[];
  events: { action: string; detail: string; created_at: string }[];
  receipts?: ShopReceipt[];
}
export interface ShopSnapshot {
  admin: boolean;
  sellers: ShopSeller[];
  products: ShopProduct[];
  orders: ShopOrder[];
  offset: number;
}
export const SHOP_STATUS: Record<ShopStatus, string> = {
  pending: "Aguardando pagamento",
  paid: "Pagamento confirmado",
  ready: "Pronto para entrega/retirada",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refund_pending: "Reembolso em processamento",
  refunded: "Reembolsado",
  payment_review: "Pagamento em revisão",
};
export const SHOP_CATEGORIES = [
  { value: "ball", label: "Bolas" },
  { value: "uniform", label: "Uniformes" },
  { value: "vest", label: "Coletes" },
  { value: "boots", label: "Calçados" },
  { value: "equipment", label: "Equipamentos" },
  { value: "other", label: "Outros" },
];
export const SHOP_EVENTS: Record<string, string> = {
  pending: "Pedido criado",
  paid: "Pagamento confirmado",
  cancelled: "Reserva expirada",
  cancel: "Pedido cancelado",
  fulfill: "Entrega atualizada",
  refund_request: "Reembolso solicitado",
  refund_approved: "Reembolso autorizado",
  refund_decline: "Resposta do vendedor",
  refunded: "Reembolso confirmado",
  restock_return: "Devolução recebida",
  payment_review: "Revisão financeira",
  commission_received: "Comissão recebida",
};
export const shopMoney = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export function shopCents(value: string) {
  const cleaned = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned))
    throw new Error("Informe valor positivo com até duas casas decimais.");
  const cents = Math.round(Number(cleaned) * 100);
  if (!Number.isSafeInteger(cents) || cents > 100000000)
    throw new Error("Valor fora do limite.");
  return cents;
}
