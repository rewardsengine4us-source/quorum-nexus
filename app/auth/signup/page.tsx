'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Phone, Mail, Lock, CheckCircle, Loader } from 'lucide-react';

type SignupStep = 'phone' | 'otp' | 'email-password' | 'success';

export default function SignupPage() {
  const [step, setStep] = useState<SignupStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [otpResendCountdown, setOtpResendCountdown] = useState(0);
  
  const router = useRouter();
  const { signUp } = useAuth();

  // Step 1: Send OTP to phone
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, action: 'signup' }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to send OTP');
        return;
      }

      setSuccess(`OTP sent to ${data.phone || phone.slice(-4)}`);
      setStep('otp');
      setOtpResendCountdown(30); // 30 second cooldown

      // Countdown timer
      const interval = setInterval(() => {
        setOtpResendCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (otp.length !== 6) {
      setError('OTP must be 6 digits');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/otp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Invalid OTP');
        return;
      }

      setSuccess('Phone verified successfully!');
      setStep('email-password');
    } catch (err: any) {
      setError(err.message || 'Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Create account with email and password
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      // Signup with Supabase
      await signUp(email, password);

      // Update user metadata with phone number
      const response = await fetch('/api/update-user-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      if (!response.ok) {
        console.warn('Failed to update phone number, but signup succeeded');
      }

      setSuccess('Account created! Email verification sent.');
      setStep('success');
      
      setTimeout(() => router.push('/auth/login'), 3000);
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
        {/* Header */}
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">Sign Up</h1>
        <p className="text-center text-gray-600 text-sm mb-6">
          {step === 'phone' && 'Verify your phone number'}
          {step === 'otp' && 'Enter the 6-digit OTP'}
          {step === 'email-password' && 'Create your account'}
          {step === 'success' && 'Account created!'}
        </p>

        {/* Progress indicator */}
        <div className="flex gap-2 mb-6">
          <div className={`flex-1 h-2 rounded ${step === 'phone' || step === 'otp' || step === 'email-password' || step === 'success' ? 'bg-purple-600' : 'bg-gray-300'}`} />
          <div className={`flex-1 h-2 rounded ${step === 'otp' || step === 'email-password' || step === 'success' ? 'bg-purple-600' : 'bg-gray-300'}`} />
          <div className={`flex-1 h-2 rounded ${step === 'email-password' || step === 'success' ? 'bg-purple-600' : 'bg-gray-300'}`} />
          <div className={`flex-1 h-2 rounded ${step === 'success' ? 'bg-purple-600' : 'bg-gray-300'}`} />
        </div>

        {/* Step 1: Phone Verification */}
        {step === 'phone' && (
          <form onSubmit={handleSendOTP} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Phone className="inline w-4 h-4 mr-2" />
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Indian phone numbers with +91 or 10-digit format</p>
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}
            {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">{success}</div>}
            <button
              type="submit"
              disabled={loading || !phone}
              className="w-full bg-purple-600 text-white py-2 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Send OTP'}
            </button>
          </form>
        )}

        {/* Step 2: OTP Verification */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter 6-Digit OTP
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="w-full px-4 py-2 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Expires in 5 minutes</p>
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}
            {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">{success}</div>}
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-purple-600 text-white py-2 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Verify OTP'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setOtp('');
                setError('');
                setSuccess('');
              }}
              disabled={otpResendCountdown > 0}
              className="w-full text-purple-600 py-2 rounded-lg font-semibold hover:text-purple-700 disabled:opacity-50 text-sm"
            >
              {otpResendCountdown > 0 ? `Resend OTP in ${otpResendCountdown}s` : 'Change phone number'}
            </button>
          </form>
        )}

        {/* Step 3: Email & Password */}
        {step === 'email-password' && (
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="inline w-4 h-4 mr-2" />
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Lock className="inline w-4 h-4 mr-2" />
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                required
              />
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>}
            {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">{success}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 text-white py-2 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Create Account'}
            </button>
          </form>
        )}

        {/* Step 4: Success */}
        {step === 'success' && (
          <div className="text-center space-y-4">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
            <h2 className="text-2xl font-bold text-green-600">Account Created!</h2>
            <p className="text-gray-600">
              We've sent a verification email to <strong>{email}</strong>
            </p>
            <p className="text-sm text-gray-500">
              Check your email and verify to access the full app. Redirecting to login...
            </p>
          </div>
        )}

        {/* Footer */}
        {step !== 'success' && (
          <p className="text-center text-gray-600 mt-6 text-sm">
            Already have an account? <a href="/auth/login" className="text-purple-600 font-semibold hover:underline">Login</a>
          </p>
        )}
      </div>
    </div>
  );
}