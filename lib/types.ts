// Hand-written types matching the live quorum-nexus-prod Supabase schema
// (project ref: maepogxihlydpstkefyk). Trimmed to the columns the app uses.

export interface Bank {
  id: number;
  bank_code: string;
  bank_name: string;
  icon_url: string | null;
  website: string | null;
  is_active: boolean | null;
}

export interface CreditCard {
  id: number;
  card_code: string;
  bank_id: number;
  card_name: string;
  card_tier: string | null;
  annual_fee: number | null;
  annual_fee_reversal_spend: number | null;
  foreign_fee_markup: number | null;
  lounge_access: number | null;
  primary_benefit_category: string | null;
  is_active: boolean | null;
  icon_url: string | null;
  official_url: string | null;
  /** Issuer reward currency this card earns (e.g. "axis_edge"). */
  reward_currency_code: string | null;
  /**
   * Co-branded cards earn a single airline/hotel currency directly and
   * have no transfer choice, so they're excluded from the transfer explorer.
   */
  is_cobranded: boolean | null;
  cobrand_program_code: string | null;
}

export interface LoyaltyProgram {
  id: number;
  program_code: string;
  program_name: string;
  program_type: string | null;
  category: string | null;
  points_name: string | null;
  logo_url: string | null;
  website: string | null;
  is_active: boolean | null;
}

export interface TransferRoute {
  id: number;
  from_card_id: number;
  to_program_id: number;
  transfer_ratio: number;
  bonus_percent: number | null;
  processing_time_days: number | null;
  minimum_transfer_points: number | null;
  annual_cap: number | null;
  is_active: boolean | null;
  effective_date: string | null;
  expiry_date: string | null;
  health_score: number | null;
  devaluation_risk: string | null;
  sweet_spot_min_points: number | null;
  sweet_spot_max_points: number | null;
  notes: string | null;
  source_type: string | null;
  source_link: string | null;
}

export interface UserRow {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  avatar_url: string | null;
  tier: string | null;
  subscription_status: string | null;
  credit_balance: number | null;
  is_verified: boolean | null;
}

export interface UserCard {
  id: number;
  user_id: string;
  credit_card_id: number;
  added_at: string | null;
  is_primary: boolean | null;
  notes: string | null;
}

export interface UserPoints {
  id: number;
  user_id: string;
  program_id: number;
  total_points: number | null;
  expiry_date: string | null;
  last_updated: string | null;
}

export interface UserWishlist {
  id: number;
  user_id: string;
  destination: string;
  departure_airport: string | null;
  arrival_airport: string | null;
  class_of_travel: string | null;
  target_date: string | null;
  programs_interested: number[] | null;
  estimated_points_needed: number | null;
  current_best_route: number | null;
  priority: number | null;
  is_achieved: boolean | null;
}

export interface VoucherPartner {
  id: number;
  partner_code: string;
  partner_name: string;
  logo_url: string | null;
  website: string | null;
  is_active: boolean | null;
  voucher_denominations: number[] | null;
  fulfillment_latency_minutes: number | null;
}

export interface VoucherOrder {
  id: number;
  user_id: string;
  partner_id: number;
  denomination: number;
  purchase_price: number;
  status: string | null;
  voucher_code: string | null;
  delivered_at: string | null;
  created_at: string | null;
}

// Minimal Database generic so supabase-js's generic client type-checks.
// (Full `generate_typescript_types` output can replace this later.)
export type Database = any;
