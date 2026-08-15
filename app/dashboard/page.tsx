'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useStore } from '@/lib/store';
import { getUserCards, getUserPrograms, getVouchers } from '@/lib/api';
import { Navbar } from '@/components/navbar';
import Link from 'next/link';
import { CreditCard, Gift, TrendingUp, Zap, ArrowRight } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const { cards, programs, vouchers, setCards, setPrograms, setVouchers } = useStore();
  const [loading, setLoading] = useState(true);
  const [totalPoints, setTotalPoints] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return;
      try {
        const userCards = await getUserCards(user.id);
        const userPrograms = await getUserPrograms(user.id);
        const voucherList = await getVouchers();

        setCards(userCards);
        setPrograms(userPrograms);
        setVouchers(voucherList);

        const total = userCards.reduce((sum, card) => sum + (card.points_balance || 0), 0) +
                     userPrograms.reduce((sum, prog) => sum + (prog.points_balance || 0), 0);
        setTotalPoints(total);
      } catch (error) {
        console.error('Error loading dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.id, setCards, setPrograms, setVouchers]);

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Total Points</p>
                <h3 className="text-3xl font-bold mt-2">{loading ? '...' : totalPoints.toLocaleString()}</h3>
              </div>
              <TrendingUp size={32} className="opacity-80" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm">Credit Cards</p>
                <h3 className="text-3xl font-bold mt-2">{cards.length}</h3>
              </div>
              <CreditCard size={32} className="opacity-80" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-pink-500 to-pink-600 text-white rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-pink-100 text-sm">Loyalty Programs</p>
                <h3 className="text-3xl font-bold mt-2">{programs.length}</h3>
              </div>
              <Gift size={32} className="opacity-80" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm">Vouchers</p>
                <h3 className="text-3xl font-bold mt-2">{vouchers.length}</h3>
              </div>
              <Zap size={32} className="opacity-80" />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Link href="/cards">
            <div className="bg-white rounded-xl p-8 shadow-md hover:shadow-lg transition cursor-pointer">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-800">View Cards</h3>
                  <p className="text-gray-600 mt-1">Manage your credit cards and rewards</p>
                </div>
                <ArrowRight className="text-indigo-600" size={28} />
              </div>
            </div>
          </Link>

          <Link href="/transfer">
            <div className="bg-white rounded-xl p-8 shadow-md hover:shadow-lg transition cursor-pointer">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Transfer Points</h3>
                  <p className="text-gray-600 mt-1">Move rewards between programs</p>
                </div>
                <ArrowRight className="text-indigo-600" size={28} />
              </div>
            </div>
          </Link>

          <Link href="/vouchers">
            <div className="bg-white rounded-xl p-8 shadow-md hover:shadow-lg transition cursor-pointer">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Redeem Vouchers</h3>
                  <p className="text-gray-600 mt-1">Convert points to vouchers</p>
                </div>
                <ArrowRight className="text-indigo-600" size={28} />
              </div>
            </div>
          </Link>

          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-8 text-white">
            <h3 className="text-xl font-bold">Pro Tip</h3>
            <p className="mt-2">Stack your rewards! Transfer points from multiple cards to loyalty programs for faster redemption.</p>
          </div>
        </div>

        {/* Recent Cards */}
        {cards.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Your Cards</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cards.slice(0, 3).map((card) => (
                <div key={card.id} className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg p-4 text-white">
                  <p className="text-sm text-gray-400 mb-2">{card.bank_name}</p>
                  <h4 className="text-lg font-semibold mb-4">{card.card_name}</h4>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs text-gray-400">Points Balance</p>
                      <p className="text-2xl font-bold">{card.points_balance.toLocaleString()}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-gray-400">{card.rewards_rate}% rewards</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}