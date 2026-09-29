import type {
  OrderItemShare,
  PaymentGatewayConnection,
  PaymentGatewayProvider,
  SalePaymentAllocation,
  ServiceOrder,
  ServiceOrderItem,
} from '@/types';

export interface GatewayDefinition {
  id: PaymentGatewayProvider;
  label: string;
  shortDescription: string;
  pix: boolean;
  card: boolean;
  connectionHint: string;
}

export const PAYMENT_GATEWAYS: GatewayDefinition[] = [
  {
    id: 'sicoob',
    label: 'Sicoob API Pix',
    shortDescription: 'Pix de baixo custo com conciliação por txid.',
    pix: true,
    card: false,
    connectionHint: 'Conta PJ, aplicação Pix e certificado configurados no backend.',
  },
  {
    id: 'inter',
    label: 'Banco Inter API Pix',
    shortDescription: 'Pix direto na conta Inter Empresas.',
    pix: true,
    card: false,
    connectionHint: 'Conta Inter Empresas, Client ID/Secret e certificado.',
  },
  {
    id: 'mercado_pago',
    label: 'Mercado Pago',
    shortDescription: 'Pix e cartão com checkout conhecido pelo público.',
    pix: true,
    card: true,
    connectionHint: 'Conexão segura por OAuth; o dono não compartilha a senha.',
  },
  {
    id: 'picpay',
    label: 'PicPay',
    shortDescription: 'Pix, carteira PicPay e cartão por link de pagamento.',
    pix: true,
    card: true,
    connectionHint: 'Conta PicPay Empresas e credencial guardada no backend.',
  },
  {
    id: 'manual_pix',
    label: 'Pix manual',
    shortDescription: 'Sem automação: mostra a chave e o caixa confirma o recebimento.',
    pix: true,
    card: false,
    connectionHint: 'Usa a chave Pix já cadastrada no estabelecimento.',
  },
];

export function getGateway(provider: PaymentGatewayProvider | null | undefined): GatewayDefinition {
  return PAYMENT_GATEWAYS.find((gateway) => gateway.id === provider) ?? PAYMENT_GATEWAYS[0];
}

/** Divide centavos de forma determinística: os primeiros recebem o resto de 1 centavo. */
export function splitAmountCents(totalCents: number, participantIds: string[]): Array<{ participantId: string; amountCents: number }> {
  if (participantIds.length === 0 || totalCents <= 0) return [];
  const base = Math.floor(totalCents / participantIds.length);
  const remainder = totalCents % participantIds.length;
  return participantIds.map((participantId, index) => ({
    participantId,
    amountCents: base + (index < remainder ? 1 : 0),
  }));
}

export function tabItemIds(tabId: string, orders: ServiceOrder[], items: ServiceOrderItem[]): Set<string> {
  const orderIds = new Set(orders.filter((order) => order.tabId === tabId).map((order) => order.id));
  return new Set(items.filter((item) => orderIds.has(item.orderId) && item.status !== 'cancelled').map((item) => item.id));
}

export function outstandingByParticipant(
  tabId: string,
  orders: ServiceOrder[],
  items: ServiceOrderItem[],
  shares: OrderItemShare[],
  allocations: SalePaymentAllocation[],
): Record<string, number> {
  const itemIds = tabItemIds(tabId, orders, items);
  const allocatedByShare = new Map<string, number>();
  for (const allocation of allocations) {
    allocatedByShare.set(allocation.itemShareId, (allocatedByShare.get(allocation.itemShareId) ?? 0) + allocation.amountCents);
  }
  const result: Record<string, number> = {};
  for (const share of shares) {
    if (!itemIds.has(share.itemId)) continue;
    const pending = Math.max(0, share.amountCents - (allocatedByShare.get(share.id) ?? 0));
    result[share.participantId] = (result[share.participantId] ?? 0) + pending;
  }
  return result;
}

export function connectedGateway(
  establishmentId: string,
  connections: PaymentGatewayConnection[],
): PaymentGatewayConnection | null {
  return connections.find((connection) => connection.establishmentId === establishmentId && connection.status === 'connected') ?? null;
}

export function demoPixCode(provider: PaymentGatewayProvider, intentId: string, amountCents: number): string {
  return `00020126${provider.toUpperCase()}-${intentId}-BRL-${amountCents}6304DEMO`;
}
