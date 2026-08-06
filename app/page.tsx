'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CreditCard, Gift, TrendingUp, Zap, ArrowRight, Sparkles } from 'lucide-react';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      {/* Navigation */}
      <nav className="bg-white/10 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Quorum Nexus</h1>
          <div className="hidden md:flex space-x-4">
            <Link href="/auth/login" className="text-white hover:bg-white/20 px-4 py-2 rounded-lg transition">
              Sign In
            </Link>
            <Link href="/auth/signup" className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 transition">
              Sign Up
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4">
        <div className="py-20 md:py-32">
          <div className="text-center mb-16">
            <h2 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Rewards on Steroids 🚀
            </h2>
            <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
              Consolidate all your credit card rewards into one powerful platform. Transfer, track, and redeem points like never before.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/auth/signup"
                className="bg-white text-indigo-600 px-8 py-3 rounded-lg font-bold text-lg hover:bg-gray-100 transition inline-flex items-center justify-center space-x-2"
              >
                <span>Get Started Free</span>
                <ArrowRight size={20} />
              </Link>
              <Link
                href="/auth/login"
                className="border-2 border-white text-white px-8 py-3 rounded-lg font-bold text-lg hover:bg-white/10 transition"
              >
                Sign In
              </Link>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-8 border border-white/20">
              <div className="bg-gradient-to-br from-blue-400 to-blue-600 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
                <CreditCard size={32} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">15+ Banks</h3>
              <p className="text-white/80">Support for major credit card issuers across India with real-time balance sync</p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-xl p-8 border border-white/20">
              <div className="bg-gradient-to-br from-purple-400 to-purple-600 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
                <Gift size={32} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">57 Loyalty Programs</h3>
              <p className="text-white/80">Connect to every major loyalty program and redeem rewards your way</p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-xl p-8 border border-white/20">
              <div className="bg-gradient-to-br from-pink-400 to-pink-600 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp size={32} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">155+ Routes</h3>
              <p className="text-white/80">Optimized transfer paths from cards to loyalty programs with best rates</p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-xl p-8 border border-white/20">
              <div className="bg-gradient-to-br from-orange-400 to-orange-600 w-16 h-16 rounded-lg flex items-center justify-center mb-4">
                <Zap size={32} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">5 Voucher Partners</h3>
              <p className="text-white/80">Redeem at Amazon, Flipkart, Zomato, MakeMyTrip, Uber and more</p>
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-12 border border-white/20 mb-16">
            <h3 className="text-3xl font-bold text-white mb-12 text-center">How It Works</h3>
            <div className="grid md:grid-cols-4 gap-8">
              {[
                { num: 1, title: 'Connect', desc: 'Link your credit cards via secure OAuth' },
                { num: 2, title: 'Sync', desc: 'Auto-sync your reward points in real-time' },
                { num: 3, title: 'Transfer', desc: 'Move points to 57+ loyalty programs' },
                { num: 4, title: 'Redeem', desc: 'Convert to vouchers or direct rewards' },
              ].map((step) => (
                <div key={step.num} className="text-center">
                  <div className="bg-white text-indigo-600 w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl mb-4 mx-auto">
                    {step.num}
                  </div>
                  <h4 className="text-lg font-bold text-white mb-2">{step.title}</h4>
                  <p className="text-white/70 text-sm">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="bg-white rounded-xl p-12 text-center shadow-2xl">
            <Sparkles className="mx-auto text-yellow-500 mb-4" size={40} />
            <h3 className="text-3xl font-bold text-gray-800 mb-4">Ready to maximize your rewards?</h3>
            <p className="text-gray-600 mb-6 text-lg">Join thousands using Quorum Nexus to earn smarter</p>
            <Link
              href="/auth/signup"
              className="inline-block bg-gradient-to-r from-indigo-600 to-pink-600 text-white px-8 py-3 rounded-lg font-bold text-lg hover:from-indigo-700 hover:to-pink-700 transition"
            >
              Start for Free
            </Link>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-8 border-t border-white/20 text-center text-white/60 text-sm">
          <p>Quorum Nexus © 2026 | Rewards on Steroids</p>
        </footer>
      </main>
    </div>
  );
}
