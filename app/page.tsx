'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Auto-redirect to dashboard (no auth needed)
    router.push('/dashboard');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">Quorum Nexus</h1>
        <p className="text-xl text-white/80">Redirecting to dashboard...</p>
      </div>
    </div>
  );
}