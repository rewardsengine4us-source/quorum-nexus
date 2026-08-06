'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';

export function Navbar() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/login');
  };

  return (
    <nav className="bg-white shadow-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/dashboard" className="flex items-center space-x-2">
            <div className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
              Quorum
            </div>
          </Link>

          <div className="hidden md:flex items-center space-x-8">
            <Link href="/dashboard" className="text-gray-700 hover:text-indigo-600 transition">
              Dashboard
            </Link>
            <Link href="/cards" className="text-gray-700 hover:text-indigo-600 transition">
              Cards
            </Link>
            <Link href="/transfer" className="text-gray-700 hover:text-indigo-600 transition">
              Transfer
            </Link>
            <Link href="/vouchers" className="text-gray-700 hover:text-indigo-600 transition">
              Vouchers
            </Link>
          </div>

          <div className="hidden md:flex items-center space-x-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="flex items-center space-x-2 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition"
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-4 space-y-4 border-t">
            <Link href="/dashboard" className="block text-gray-700 hover:text-indigo-600">
              Dashboard
            </Link>
            <Link href="/cards" className="block text-gray-700 hover:text-indigo-600">
              Cards
            </Link>
            <Link href="/transfer" className="block text-gray-700 hover:text-indigo-600">
              Transfer
            </Link>
            <Link href="/vouchers" className="block text-gray-700 hover:text-indigo-600">
              Vouchers
            </Link>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center space-x-2 bg-red-500 text-white px-4 py-2 rounded-lg"
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
