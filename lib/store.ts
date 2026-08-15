import { create } from 'zustand';

export type Card = {
  id: string;
  bank_id: string;
  bank_name: string;
  card_name: string;
  card_type: string;
  rewards_rate: number;
  points_balance: number;
  currency: string;
};

export type LoyaltyProgram = {
  id: string;
  program_name: string;
  partner_name: string;
  program_type: string;
  points_balance: number;
  tier: string;
};

export type TransferRoute = {
  id: string;
  card_id: string;
  program_id: string;
  conversion_rate: number;
  fee_percentage: number;
  estimated_points: number;
};

export type Voucher = {
  id: string;
  partner_name: string;
  denomination: number;
  points_required: number;
  discount_percentage: number;
  expiry_date: string;
  redemption_url?: string;
  description?: string;
};

type Store = {
  cards: Card[];
  programs: LoyaltyProgram[];
  transferRoutes: TransferRoute[];
  vouchers: Voucher[];
  selectedCard: Card | null;
  selectedProgram: LoyaltyProgram | null;
  
  setCards: (cards: Card[]) => void;
  setPrograms: (programs: LoyaltyProgram[]) => void;
  setTransferRoutes: (routes: TransferRoute[]) => void;
  setVouchers: (vouchers: Voucher[]) => void;
  setSelectedCard: (card: Card | null) => void;
  setSelectedProgram: (program: LoyaltyProgram | null) => void;
};

export const useStore = create<Store>((set) => ({
  cards: [],
  programs: [],
  transferRoutes: [],
  vouchers: [],
  selectedCard: null,
  selectedProgram: null,

  setCards: (cards) => set({ cards }),
  setPrograms: (programs) => set({ programs }),
  setTransferRoutes: (routes) => set({ transferRoutes: routes }),
  setVouchers: (vouchers) => set({ vouchers }),
  setSelectedCard: (card) => set({ selectedCard: card }),
  setSelectedProgram: (program) => set({ selectedProgram: program }),
}));