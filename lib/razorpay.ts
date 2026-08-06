// lib/razorpay.ts - Razorpay payment integration for India

import { supabase } from './supabase';

export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  offer_id: string | null;
  status: string;
  attempts: number;
  notes: Record<string, any>;
  created_at: number;
}

export interface RazorpayPayment {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

// Initialize Razorpay
declare global {
  interface Window {
    Razorpay: any;
  }
}

export const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

// Create Razorpay order
export async function createRazorpayOrder(
  amount: number,
  userId: string,
  tier: 'premium'
) {
  try {
    const response = await fetch('/api/razorpay/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount, // in paise (amount * 100)
        userId,
        tier,
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    throw error;
  }
}

// Open Razorpay checkout
export async function openRazorpayCheckout(
  order: RazorpayOrder,
  userEmail: string,
  userName: string
) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      const options = {
        key: RAZORPAY_KEY,
        amount: order.amount,
        currency: 'INR',
        name: 'Quorum Nexus',
        description: 'Premium Rewards Platform',
        order_id: order.id,
        handler: function (response: RazorpayPayment) {
          resolve(response);
        },
        prefill: {
          email: userEmail,
          name: userName,
        },
        theme: {
          color: '#6366F1', // Indigo
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();

      rzp.on('payment.failed', (response: any) => {
        reject(new Error(response.error.description));
      });
    };
    document.body.appendChild(script);
  });
}

// Verify payment signature
export async function verifyRazorpaySignature(
  payment: RazorpayPayment,
  secret: string
) {
  try {
    const response = await fetch('/api/razorpay/verify-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payment),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (error) {
    console.error('Error verifying payment:', error);
    throw error;
  }
}

// Upgrade user to premium
export async function upgradeToPremium(userId: string) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({
        tier: 'premium',
        premium_since: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error upgrading to premium:', error);
    throw error;
  }
}

// Create payment record
export async function createPaymentRecord(
  userId: string,
  orderId: string,
  paymentId: string,
  amount: number,
  status: 'success' | 'failed'
) {
  try {
    const { data, error } = await supabase
      .from('payments')
      .insert([
        {
          user_id: userId,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          amount,
          status,
          created_at: new Date().toISOString(),
        },
      ]);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating payment record:', error);
    throw error;
  }
}

// Get payment history
export async function getPaymentHistory(userId: string) {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching payment history:', error);
    return [];
  }
}
