export type VenueCapability =
  | "pdv"
  | "live"
  | "reservations"
  | "cash"
  | "classes"
  | "own_classes"
  | "class_prices"
  | "reports"
  | "kitchen";
export const VENUE_CAPABILITIES: { value: VenueCapability; label: string }[] = [
  { value: "pdv", label: "Comandas e pedidos" },
  { value: "live", label: "Painel ao vivo e ocorrências" },
  { value: "reservations", label: "Iniciar / encerrar locação" },
  { value: "cash", label: "Receber em dinheiro e caixa" },
  { value: "classes", label: "Administrar todas as turmas" },
  { value: "own_classes", label: "Somente suas aulas" },
  { value: "class_prices", label: "Precificar aulas autorizadas" },
  { value: "reports", label: "Consultar receitas" },
  { value: "kitchen", label: "Cozinha" },
];
export interface VenueSnapshot {
  venues?: { id: string; name: string; owner: boolean }[];
  id?: string;
  me?: string;
  name?: string;
  owner?: boolean;
  server_time?: string;
  capabilities?: VenueCapability[];
  fields?: { id: string; name: string; sport_ids?: string[] }[];
  coaches?: { id: string; name: string; player_id: string }[];
  staff?: {
    player_id: string;
    name: string;
    active: boolean;
    roles: string[];
    capabilities: VenueCapability[];
  }[];
  teams?: {
    id: string;
    name: string;
    players: { id: string; name: string; avatar_url: string | null }[];
  }[];
  invites?: { id: string; name: string; status: string; created_at: string }[];
  occupancy?: {
    id: string;
    field_id: string;
    label: string;
    starts_at: string;
    ends_at: string;
    ended_at: string | null;
  }[];
  bookings?: {
    id: string;
    field_id: string;
    team_name: string;
    time: string;
    duration_minutes: number;
  }[];
  incidents?: {
    id: string;
    title: string;
    severity: string;
    created_at: string;
    resolved_at: string | null;
  }[];
  open_tabs?: number;
  kitchen_orders?: number;
  food_received_cents?: number;
  classes_cash_cents?: number;
  invoice_pending_cents?: number;
  credit_received_cents?: number;
  shifts?: {
    id: string;
    status: string;
    opening_amount: number;
    closing_amount: number | null;
    expected_amount: number | null;
    difference: number | null;
    opened_at: string;
    closed_at: string | null;
  }[];
  audit?: { action: string; created_at: string; target_id: string | null }[];
  kitchen?: {
    id: string;
    status: string;
    name: string;
    quantity: number;
    notes: string | null;
    station: string;
    tab_label: string;
    table_label: string | null;
  }[];
}
export interface AcademySession {
  id: string;
  program_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  occupied: number;
}
export interface AcademyProgram {
  id: string;
  establishment_id: string;
  name: string;
  sport_id: string;
  format: string;
  field_id: string;
  coach_id: string;
  level: string;
  capacity: number;
  duration_minutes: number;
  active: boolean;
  monthly_cents: number | null;
  drop_in_cents: number | null;
  swaps_enabled: boolean;
  makeups_enabled: boolean;
  cutoff_hours: number;
  makeup_days: number;
  can_manage: boolean;
  can_price: boolean;
  venue_name: string;
  coach_name: string;
  sessions: AcademySession[];
}
export interface AcademySeat {
  id: string;
  bill_id: string;
  session_id: string;
  program_id: string;
  player_id: string;
  name: string;
  active: boolean;
  revision: number;
  starts_at: string;
  ends_at: string;
  attendance: string | null;
}
export interface AcademyBill {
  id: string;
  program_id: string;
  player_id: string;
  plan: string;
  competence: string | null;
  amount_cents: number;
  status: string;
  name: string;
  paid_at: string | null;
}
export interface AcademySnapshot {
  programs: AcademyProgram[];
  seats: AcademySeat[];
  bills: AcademyBill[];
  swaps: {
    id: string;
    source_seat_id: string;
    source_session_id: string;
    target_session_id: string;
    program_id: string;
  }[];
  credits: {
    id: string;
    program_id: string;
    source_seat_id: string;
    expires_at: string;
    used_at: string | null;
  }[];
  notices: {
    id: string;
    title: string;
    body: string;
    created_at: string;
    read_at: string | null;
  }[];
}
