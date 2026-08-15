'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useStore } from '@/lib/store';
import { getUserCards } from '@/lib/api';
import { Navbar } from '@/components/navbar';
import { CreditCard, Plus } from 'lucide-react';

export default function CardsPage() {
  const { user } = useAuth();
  const { cards, setCards } = useStore();
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const loadCards = async () => {
      if (!user?.id) return;
      try {
        const userCards = await getUserCards(user.id);
        setCards(userCards);
      } catch (error) {
        console.error('Error loading cards:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCards();
  }, [user?.id, setCards]);

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Your Credit Cards</h1>
          <p className="text-gray-600">Manage your cards and track rewards</p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          </div>
        ) : cards.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <CreditCard size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl font-bold text-gray-800 mb-2">No cards yet</h3>
            <p className="text-gray-600 mb-6">Link your credit cards to start earning and tracking rewards</p>
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-gradient-to-r from-indigo-600 to-pink-600 text-white px-6 py-2 rounded-lg hover:from-indigo-700 hover:to-pink-700 transition inline-flex items-center space-x-2">
              <Plus size={20} />
              <span>Add Card</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cards.map((card) => (
              <div key={card.id} className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 text-white shadow-lg hover:shadow-xl transition">
                <div className="mb-4">
                  <p className="text-sm text-gray-400 uppercase tracking-widest">{card.bank_name}</p>
                  <h3 className="text-xl font-bold mt-2">{card.card_name}</h3>
                  <p className="text-sm text-gray-400 mt-1">{card.card_type}</p>
                </div>

                <div className="bg-gray-700 bg-opacity-50 rounded p-3 mb-4">
                  <p className="text-xs text-gray-400 mb-1">Points Balance</p>
                  <p className="text-3xl font-bold">{card.points_balance.toLocaleString()}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400 text-xs">Rewards Rate</p>
                    <p className="font-semibold text-lg">{card.rewards_rate}%</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs">Currency</p>
                    <p className="font-semibold text-lg">{card.currency}</p>
                  </div>
                </div>

                <button className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg transition">
                  Transfer Points
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}