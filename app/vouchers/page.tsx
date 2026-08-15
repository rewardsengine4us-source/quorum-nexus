'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useStore, Voucher } from '@/lib/store';
import { getUserPrograms, getVouchers, redeemVoucher } from '@/lib/api';
import { Navbar } from '@/components/navbar';
import { Gift, Zap, Check, ExternalLink } from 'lucide-react';

const PARTNER_COLORS: Record<string, string> = {
  'Amazon': 'from-orange-500 to-yellow-600',
  'Flipkart': 'from-blue-600 to-purple-600',
  'Zomato': 'from-red-500 to-orange-600',
  'MakeMyTrip': 'from-purple-600 to-pink-600',
  'Uber': 'from-black to-gray-800',
};

// Dummy vouchers with real Amazon India links
const DUMMY_VOUCHERS: Voucher[] = [
  {
    id: '1',
    partner_name: 'Amazon',
    denomination: 500,
    points_required: 5000,
    discount_percentage: 5,
    expiry_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    redemption_url: 'https://www.amazon.in/gp/gift-cards/how-it-works/',
    description: 'Amazon.in Gift Card ₹500',
  },
  {
    id: '2',
    partner_name: 'Amazon',
    denomination: 1000,
    points_required: 10000,
    discount_percentage: 10,
    expiry_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    redemption_url: 'https://www.amazon.in/gp/gift-cards/how-it-works/',
    description: 'Amazon.in Gift Card ₹1000',
  },
  {
    id: '3',
    partner_name: 'Flipkart',
    denomination: 500,
    points_required: 5000,
    discount_percentage: 5,
    expiry_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    redemption_url: 'https://www.flipkart.com/gift-card/p/itmaa3f3fd83eca3',
    description: 'Flipkart Gift Card ₹500',
  },
  {
    id: '4',
    partner_name: 'Zomato',
    denomination: 300,
    points_required: 3000,
    discount_percentage: 0,
    expiry_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    redemption_url: 'https://www.zomato.com/gift-cards',
    description: 'Zomato Gift Card ₹300',
  },
  {
    id: '5',
    partner_name: 'MakeMyTrip',
    denomination: 2000,
    points_required: 20000,
    discount_percentage: 15,
    expiry_date: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
    redemption_url: 'https://www.makemytrip.com/gift-cards/',
    description: 'MakeMyTrip Gift Card ₹2000',
  },
  {
    id: '6',
    partner_name: 'Uber',
    denomination: 500,
    points_required: 5000,
    discount_percentage: 0,
    expiry_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    redemption_url: 'https://www.uber.com/en-IN/gift-cards/',
    description: 'Uber Wallet Credit ₹500',
  },
];

export default function VouchersPage() {
  const { user } = useAuth();
  const { programs, vouchers, setVouchers, setPrograms } = useStore();
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadData = async () => {
      try {
        // Use dummy vouchers for now
        setVouchers(DUMMY_VOUCHERS);
        
        // Try to load actual programs if user exists
        if (user?.id) {
          try {
            const userPrograms = await getUserPrograms(user.id);
            setPrograms(userPrograms);
          } catch (error) {
            console.error('Error loading programs:', error);
            setPrograms([]);
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.id, setPrograms, setVouchers]);

  const handleRedeem = async (voucher: Voucher) => {
    setRedeeming(voucher.id);
    try {
      // For demo, just show success
      if (user?.id && programs.length > 0) {
        await redeemVoucher(user.id, voucher.id, voucher.points_required);
      }
      
      setRedeemed(prev => new Set([...prev, voucher.id]));
      
      // Open voucher link in new tab
      if (voucher.redemption_url) {
        window.open(voucher.redemption_url, '_blank');
      }
      
      setTimeout(() => {
        setRedeemed(prev => {
          const newSet = new Set(prev);
          newSet.delete(voucher.id);
          return newSet;
        });
      }, 3000);
    } catch (error) {
      console.error('Redemption failed:', error);
    } finally {
      setRedeeming(null);
    }
  };

  const canRedeem = programs.length > 0 ? programs.some(p => p.points_balance > 0) : true; // Allow demo redemption

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Redeem Vouchers</h1>
          <p className="text-gray-600">Convert your loyalty points into amazing rewards</p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          </div>
        ) : vouchers.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <Gift size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl font-bold text-gray-800 mb-2">No vouchers available</h3>
            <p className="text-gray-600">Check back soon for new offers!</p>
          </div>
        ) : (
          <>
            {/* Partner Vouchers */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {vouchers.map((voucher) => {
                const isRedeeming = redeeming === voucher.id;
                const isRedeemed = redeemed.has(voucher.id);
                const colorGradient = PARTNER_COLORS[voucher.partner_name] || 'from-gray-600 to-gray-700';
                
                return (
                  <div
                    key={voucher.id}
                    className="bg-gradient-to-br rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition transform hover:scale-105"
                  >
                    <div className={`bg-gradient-to-br ${colorGradient} p-6 text-white`}>
                      <h3 className="text-2xl font-bold mb-2">{voucher.partner_name}</h3>
                      <p className="text-sm opacity-90">₹{voucher.denomination} Voucher</p>
                    </div>

                    <div className="bg-white p-6">
                      <div className="mb-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-600">Points Required</span>
                          <span className="text-2xl font-bold text-indigo-600">{voucher.points_required.toLocaleString()}</span>
                        </div>
                        {voucher.discount_percentage > 0 && (
                          <div className="flex items-center space-x-1 text-orange-600">
                            <Zap size={16} />
                            <span className="text-sm font-semibold">{voucher.discount_percentage}% Extra Value</span>
                          </div>
                        )}
                      </div>

                      <div className="text-xs text-gray-500 mb-4">
                        Expires: {new Date(voucher.expiry_date).toLocaleDateString()}
                      </div>

                      {isRedeemed ? (
                        <div className="w-full bg-green-500 text-white py-2 rounded-lg flex items-center justify-center space-x-2">
                          <Check size={20} />
                          <span>Opening...</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleRedeem(voucher)}
                          disabled={isRedeeming}
                          className="w-full bg-gradient-to-r from-indigo-600 to-pink-600 text-white font-semibold py-2 rounded-lg hover:from-indigo-700 hover:to-pink-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                        >
                          <span>{isRedeeming ? 'Processing...' : 'Redeem Now'}</span>
                          <ExternalLink size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Points Summary */}
            {programs.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Your Points Balance</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {programs.map((program) => (
                    <div key={program.id} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">
                      <h4 className="font-semibold text-gray-800 mb-1">{program.program_name}</h4>
                      <p className="text-sm text-gray-600 mb-3">{program.partner_name}</p>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Available Points</span>
                        <span className="text-2xl font-bold text-indigo-600">{program.points_balance.toLocaleString()}</span>
                      </div>
                      {program.tier && (
                        <div className="mt-2 inline-block bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs font-semibold">
                          Tier: {program.tier}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}