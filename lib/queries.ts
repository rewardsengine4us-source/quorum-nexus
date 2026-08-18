import { supabase, DEMO_USER_ID } from "./supabaseClient";
import type {
  Bank,
  CreditCard,
  LoyaltyProgram,
  TransferRoute,
  UserCard,
  UserPoints,
  UserWishlist,
  VoucherPartner,
  VoucherOrder,
} from "./types";

// ---------- Banks & Credit Cards (catalog) ----------

export async function getBanks() {
  const { data, error } = await supabase
    .from("banks")
    .select("*")
    .eq("is_active", true)
    .order("bank_name");
  if (error) throw error;
  return data as Bank[];
}

export async function getCreditCards() {
  const { data, error } = await supabase
    .from("credit_cards")
    .select("*")
    .eq("is_active", true)
    .order("card_name");
  if (error) throw error;
  return data as CreditCard[];
}

// ---------- Linked cards ----------

export async function getUserCards(): Promise<UserCard[]> {
  const { data, error } = await supabase
    .from("user_cards")
    .select("*")
    .eq("user_id", DEMO_USER_ID)
    .order("added_at", { ascending: false });
  if (error) throw error;
  return data as UserCard[];
}

export async function addUserCard(creditCardId: number) {
  const { data, error } = await supabase
    .from("user_cards")
    .insert({ user_id: DEMO_USER_ID, credit_card_id: creditCardId })
    .select()
    .single();
  if (error) throw error;
  return data as UserCard;
}

export async function removeUserCard(id: number) {
  const { error } = await supabase
    .from("user_cards")
    .delete()
    .eq("id", id)
    .eq("user_id", DEMO_USER_ID);
  if (error) throw error;
}

// ---------- Points balances ----------

export async function getUserPoints(): Promise<UserPoints[]> {
  const { data, error } = await supabase
    .from("user_points")
    .select("*")
    .eq("user_id", DEMO_USER_ID);
  if (error) throw error;
  return data as UserPoints[];
}

export async function upsertUserPoints(programId: number, totalPoints: number) {
  const { data, error } = await supabase
    .from("user_points")
    .upsert(
      {
        user_id: DEMO_USER_ID,
        program_id: programId,
        total_points: totalPoints,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "user_id,program_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data as UserPoints;
}

// ---------- Loyalty programs reachable from linked cards ----------

export async function getLoyaltyPrograms() {
  const { data, error } = await supabase
    .from("loyalty_programs")
    .select("*")
    .eq("is_active", true)
    .order("program_name");
  if (error) throw error;
  return data as LoyaltyProgram[];
}

// ---------- Transfer routes ----------

export async function getTransferRoutes(fromCardIds?: number[]) {
  let query = supabase
    .from("transfer_routes")
    .select("*")
    .eq("is_active", true)
    .order("health_score", { ascending: false });

  if (fromCardIds && fromCardIds.length > 0) {
    query = query.in("from_card_id", fromCardIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as TransferRoute[];
}

// ---------- Wishlist ----------

export async function getWishlist(): Promise<UserWishlist[]> {
  const { data, error } = await supabase
    .from("user_wishlists")
    .select("*")
    .eq("user_id", DEMO_USER_ID)
    .order("priority", { ascending: false });
  if (error) throw error;
  return data as UserWishlist[];
}

export async function addWishlistItem(item: {
  destination: string;
  class_of_travel?: string;
  target_date?: string | null;
  estimated_points_needed?: number | null;
  priority?: number;
}) {
  const { data, error } = await supabase
    .from("user_wishlists")
    .insert({ user_id: DEMO_USER_ID, ...item })
    .select()
    .single();
  if (error) throw error;
  return data as UserWishlist;
}

export async function deleteWishlistItem(id: number) {
  const { error } = await supabase
    .from("user_wishlists")
    .delete()
    .eq("id", id)
    .eq("user_id", DEMO_USER_ID);
  if (error) throw error;
}

// ---------- Voucher redemption ----------

export async function getVoucherPartners() {
  const { data, error } = await supabase
    .from("voucher_partners")
    .select("*")
    .eq("is_active", true)
    .order("partner_name");
  if (error) throw error;
  return data as VoucherPartner[];
}

export async function getVoucherOrders(): Promise<VoucherOrder[]> {
  const { data, error } = await supabase
    .from("voucher_orders")
    .select("*")
    .eq("user_id", DEMO_USER_ID)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as VoucherOrder[];
}

// Demo-only: no real payment gateway is called. This simulates a
// completed order entirely within the app's own database so the
// redemption flow can be demonstrated end-to-end.
export async function createDemoVoucherOrder(partnerId: number, denomination: number) {
  const { data: order, error: insertError } = await supabase
    .from("voucher_orders")
    .insert({
      user_id: DEMO_USER_ID,
      partner_id: partnerId,
      denomination,
      purchase_price: denomination,
      status: "initiated",
    })
    .select()
    .single();
  if (insertError) throw insertError;

  const mockVoucherCode = `DEMO-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

  const { data: completed, error: updateError } = await supabase
    .from("voucher_orders")
    .update({
      status: "completed",
      voucher_code: mockVoucherCode,
      delivered_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .select()
    .single();
  if (updateError) throw updateError;

  return completed as VoucherOrder;
}
