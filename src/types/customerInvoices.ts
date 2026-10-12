export interface CreditAccount {
  id: string;
  establishment_id: string;
  player_id: string;
  name: string;
  venue_name?: string;
  enabled?: boolean;
  cut_day: number;
  limit_cents: number;
  balance_cents: number;
  overdue: boolean;
}
export interface CreditLine {
  id: string;
  invoice_id: string;
  kind: "food" | "rental";
  description: string;
  amount_cents: number;
  posted_at: string;
  tab_id?: string;
  acceptance: "app" | "counter";
}
export interface CreditPayment {
  id: string;
  amount_cents: number;
  method: "cash" | "manual_pix";
  reference?: string;
  paid_at: string;
  confirmation?: "counter";
}
export interface CreditInvoice {
  id: string;
  account_id: string;
  cut_date: string;
  venue_id: string;
  venue_name: string;
  customer_name: string;
  player_id: string;
  total_cents: number;
  balance_cents: number;
  status: "open" | "overdue" | "zero_open" | "paid";
  lines: CreditLine[];
  payments: CreditPayment[];
}
export interface CreditRental {
  id: string;
  account_id: string;
  booking_id: string;
  service_date: string;
  description: string;
  amount_cents: number;
  status: "pending" | "billed" | "paid" | "cancelled";
  customer_name: string;
  venue_name: string;
  venue_id: string;
  payment?: CreditPayment;
}
export interface CreditSnapshot {
  me?: string;
  owner?: boolean;
  can_record?: boolean;
  can_offer?: boolean;
  venue_id?: string;
  tab_id?: string;
  balance_cents?: number;
  gross_cents?: number;
  paid_cents?: number;
  payment_started?: boolean;
  can_bill?: boolean;
  billed?: CreditLine & {
    cut_date: string;
    customer_name: string;
    invoice_balance_cents: number;
  };
  accounts?: CreditAccount[];
  invoices?: CreditInvoice[];
  rentals?: CreditRental[];
  customers?: { id: string; player_id: string; name: string }[];
  bookings?: {
    id: string;
    team_name: string;
    date: string | null;
    recurrence: string;
    day_of_week: number;
    time: string;
    duration_minutes: number;
  }[];
}
