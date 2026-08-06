import { supabase } from './supabase';
import { Card, LoyaltyProgram, TransferRoute, Voucher } from './store';

export async function getUserCards(userId: string): Promise<Card[]> {
  try {
    const { data, error } = await supabase
      .from('user_cards')
      .select('id, bank_id, card_name, card_type, rewards_rate, points_balance, currency, banks(bank_name)')
      .eq('user_id', userId);

    if (error) throw error;
    return data?.map((card: any) => ({
      ...card,
      bank_name: card.banks?.bank_name || 'Unknown Bank',
    })) || [];
  } catch (error) {
    console.error('Error fetching cards:', error);
    return [];
  }
}

export async function getUserPrograms(userId: string): Promise<LoyaltyProgram[]> {
  try {
    const { data, error } = await supabase
      .from('user_programs')
      .select('id, program_id, points_balance, tier, loyalty_programs(program_name, partner_name, program_type)')
      .eq('user_id', userId);

    if (error) throw error;
    return data?.map((prog: any) => ({
      ...prog,
      program_name: prog.loyalty_programs?.program_name || 'Unknown Program',
      partner_name: prog.loyalty_programs?.partner_name || 'Unknown Partner',
      program_type: prog.loyalty_programs?.program_type || 'points',
    })) || [];
  } catch (error) {
    console.error('Error fetching programs:', error);
    return [];
  }
}

export async function getTransferRoutes(): Promise<TransferRoute[]> {
  try {
    const { data, error } = await supabase
      .from('transfer_routes')
      .select('*');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching transfer routes:', error);
    return [];
  }
}

export async function getVouchers(): Promise<Voucher[]> {
  try {
    const { data, error } = await supabase
      .from('voucher_partners')
      .select('*');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching vouchers:', error);
    return [];
  }
}

export async function createTransfer(
  userId: string,
  cardId: string,
  programId: string,
  points: number
) {
  try {
    const { data, error } = await supabase
      .from('transfer_history')
      .insert([
        {
          user_id: userId,
          source_card_id: cardId,
          destination_program_id: programId,
          points_transferred: points,
          status: 'completed',
        },
      ])
      .select();

    if (error) throw error;
    return data?.[0];
  } catch (error) {
    console.error('Error creating transfer:', error);
    throw error;
  }
}

export async function redeemVoucher(
  userId: string,
  voucherId: string,
  points: number
) {
  try {
    const { data, error } = await supabase
      .from('redemption_history')
      .insert([
        {
          user_id: userId,
          voucher_id: voucherId,
          points_redeemed: points,
          status: 'completed',
        },
      ])
      .select();

    if (error) throw error;
    return data?.[0];
  } catch (error) {
    console.error('Error redeeming voucher:', error);
    throw error;
  }
}
