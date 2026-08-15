'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useStore } from '@/lib/store';
import { getUserCards, getUserPrograms, createTransfer } from '@/lib/api';
import { Navbar } from '@/components/navbar';
import { ArrowRight, CheckCircle } from 'lucide-react';

export default function TransferPage() {
  const { user } = useAuth();
  const { cards, programs, setCards, setPrograms } = useStore();
  const [loading, setLoading] = useState(true);
  const [fromCard, setFromCard] = useState('');
  const [toProgram, setToProgram] = useState('');
  const [points, setPoints] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return;
      try {
        const userCards = await getUserCards(user.id);
        const userPrograms = await getUserPrograms(user.id);
        setCards(userCards);
        setPrograms(userPrograms);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.id, setCards, setPrograms]);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromCard || !toProgram || !points) return;

    setTransferring(true);
    try {
      await createTransfer(user?.id || '', fromCard, toProgram, parseInt(points));
      setSuccessMessage(`Successfully transferred ${points} points!`);
      setFromCard('');
      setToProgram('');
      setPoints('');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Transfer failed:', error);
    } finally {
      setTransferring(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Transfer Points</h1>
          <p className="text-gray-600">Move rewards from your cards to loyalty programs</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Transfer Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-md p-8">
              {successMessage && (
                <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg flex items-center space-x-2">
                  <CheckCircle size={20} />
                  <span>{successMessage}</span>
                </div>
              )}

              <form onSubmit={handleTransfer} className="space-y-6">
                {/* From Card */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    From Credit Card
                  </label>
                  <select
                    value={fromCard}
                    onChange={(e) => setFromCard(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    <option value="">Select a card...</option>
                    {cards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.bank_name} - {card.card_name} ({card.points_balance.toLocaleString()} points)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Points Amount */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Points to Transfer
                  </label>
                  <input
                    type="number"
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                    placeholder="Enter points amount"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                {/* To Program */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    To Loyalty Program
                  </label>
                  <select
                    value={toProgram}
                    onChange={(e) => setToProgram(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    <option value="">Select a program...</option>
                    {programs.map((prog) => (
                      <option key={prog.id} value={prog.id}>
                        {prog.program_name} - {prog.partner_name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={transferring || !fromCard || !toProgram || !points}
                  className="w-full bg-gradient-to-r from-indigo-600 to-pink-600 text-white font-semibold py-3 rounded-lg hover:from-indigo-700 hover:to-pink-700 transition disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  <span>{transferring ? 'Transferring...' : 'Transfer Points'}</span>
                  <ArrowRight size={20} />
                </button>
              </form>
            </div>
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white shadow-md">
              <h3 className="text-xl font-bold mb-4">How it works</h3>
              <ol className="space-y-3 text-sm">
                <li className="flex space-x-3">
                  <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-white text-indigo-600 font-semibold">1</span>
                  <span>Select a credit card</span>
                </li>
                <li className="flex space-x-3">
                  <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-white text-indigo-600 font-semibold">2</span>
                  <span>Enter points amount</span>
                </li>
                <li className="flex space-x-3">
                  <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-white text-indigo-600 font-semibold">3</span>
                  <span>Choose loyalty program</span>
                </li>
                <li className="flex space-x-3">
                  <span className="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-white text-indigo-600 font-semibold">4</span>
                  <span>Confirm transfer</span>
                </li>
              </ol>
            </div>

            {fromCard && (
              <div className="mt-4 bg-white rounded-xl p-6 shadow-md">
                <h4 className="font-semibold text-gray-800 mb-2">Transfer Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Points:</span>
                    <span className="font-semibold">{points || '0'}</span>
                  </div>
                  <div className="pt-2 border-t border-gray-200">
                    <div className="flex justify-between text-gray-600">
                      <span>Fee:</span>
                      <span className="font-semibold text-orange-600">0%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}