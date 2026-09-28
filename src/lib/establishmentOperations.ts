import type { SalePayment, ServiceOrder, ServiceOrderItem } from '@/types';

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function tabTotals(
  tabId: string,
  orders: ServiceOrder[],
  items: ServiceOrderItem[],
  payments: SalePayment[],
) {
  const orderIds = new Set(orders.filter((order) => order.tabId === tabId).map((order) => order.id));
  const gross = items
    .filter((item) => orderIds.has(item.orderId) && item.status !== 'cancelled')
    .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const paid = payments
    .filter((payment) => payment.tabId === tabId && !payment.reversedAt)
    .reduce((sum, payment) => sum + payment.amount, 0);
  return { gross, paid, balance: Math.max(0, gross - paid) };
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function tabStatusLabel(status: string): string {
  return ({
    open: 'Aberta',
    awaiting_payment: 'Aguardando pagamento',
    partially_paid: 'Parcialmente paga',
    paid: 'Paga',
    closed: 'Fechada',
    cancelled: 'Cancelada',
  } as Record<string, string>)[status] ?? status;
}

export function orderStatusLabel(status: string): string {
  return ({
    draft: 'Rascunho',
    submitted: 'Recebido',
    preparing: 'Em preparo',
    ready: 'Pronto',
    delivered: 'Entregue',
    cancelled: 'Cancelado',
  } as Record<string, string>)[status] ?? status;
}

