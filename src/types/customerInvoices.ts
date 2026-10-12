export interface CreditAccount {
  id: string;
  establishment_id: string;
  player_id: string;
  name: string;
  venue_name?: string;
  enabled?: boolean;
  cut_day: number;
  due_days?: number;
  limit_cents: number;
  balance_cents: number;
  overdue: boolean;
}
export interface CreditLine {
  id: string;
  invoice_id: string;
  kind: "food" | "rental" | "class" | "game";
  description: string;
  amount_cents: number;
  posted_at: string;
  tab_id?: string;
  acceptance: "app" | "counter";
}
export interface CreditPayment {
  id: string;
  amount_cents: number;
  method: "cash" | "manual_pix" | "online_pix";
  reference?: string;
  paid_at: string;
  confirmation?: "counter" | "gateway";
  reversal?: {
    id: string;
    reason: string;
    created_at: string;
    provider_confirmed: boolean;
  } | null;
}
export interface CreditInvoice {
  id: string;
  account_id: string;
  cut_date: string;
  due_date?: string;
  venue_id: string;
  venue_name: string;
  customer_name: string;
  player_id: string;
  total_cents: number;
  balance_cents: number;
  status: "open" | "overdue" | "zero_open" | "paid";
  lines: CreditLine[];
  payments: CreditPayment[];
  received_cents?: number;
  credits_cents?: number;
  notes?: {
    id: string;
    amount_cents: number;
    reason: string;
    created_at: string;
  }[];
  online?: { available: boolean; held: boolean; intents: CreditIntent[] };
}
export interface CreditIntent {
  id: string;
  state:
    | "building"
    | "pending"
    | "uncertain"
    | "paid"
    | "cancelled"
    | "refunded"
    | "review";
  provider: string;
  amount_cents: number;
  pix_code?: string | null;
  checkout_url?: string | null;
  created_at: string;
  expires_at: string;
  refund_requested_at?: string | null;
}
export interface CreditQuery {
  search?: string;
  status?: string;
  from?: string;
  to?: string;
  beforeCut?: string;
  beforeId?: string;
  limit?: number;
}
export interface CreditSource {
  id: string;
  kind: "class" | "game";
  account_id: string;
  player_id: string;
  customer_name: string;
  description: string;
  amount_cents: number;
  venue_id: string;
  scheduled_at?: string;
  competence?: string;
  plan?: string;
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
  has_transfers?: boolean;
  transferred_cents?: number;
  split_ready?: boolean;
  parts?: {
    id: string;
    player_id: string | null;
    name: string;
    consumed_cents: number;
    remaining_cents: number;
    invoice_id: string | null;
  }[];
  billed?: CreditLine & {
    cut_date: string;
    customer_name: string;
    invoice_balance_cents: number;
  };
  accounts?: CreditAccount[];
  invoices?: CreditInvoice[];
  rentals?: CreditRental[];
  customers?: { id: string; player_id: string; name: string }[];
  sources?: { classes: CreditSource[]; games: CreditSource[] };
  has_more?: boolean;
  next_cursor?: { beforeCut: string; beforeId: string } | null;
  summary?: { count: number; pending_cents: number; overdue_cents: number };
  preferences?: {
    account_id: string;
    in_app: boolean;
    email: boolean;
    whatsapp: boolean;
    email_verified: boolean;
    phone_verified: boolean;
  }[];
  reminders?: {
    id: string;
    invoice_id: string;
    channel: string;
    stage: string;
    status: string;
    updated_at: string;
  }[];
  reminders_scheduled?: boolean;
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
