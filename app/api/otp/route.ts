import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// BFSI Security: Rate limiting check
async function checkRateLimit(phone: string): Promise<boolean> {
  try {
    // Check if user has sent more than 3 OTPs in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { count } = await supabase
      .from('otp_codes')
      .select('*', { count: 'exact', head: true })
      .eq('phone', phone)
      .eq('status', 'sent')
      .gte('created_at', oneHourAgo);

    return (count || 0) < 3; // Allow max 3 attempts per hour
  } catch (error) {
    console.error('Rate limit check error:', error);
    return false;
  }
}

// POST: Generate and send OTP
export async function POST(req: NextRequest) {
  try {
    const { phone, action } = await req.json();

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Validate phone format (basic validation for Indian numbers)
    const phoneRegex = /^(\+91|0)?[6-9]\d{9}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Rate limiting
    const isAllowed = await checkRateLimit(phone);
    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Too many OTP requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Generate OTP
    const otp = generateOTP();
    const expiryTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store OTP in database
    const { error: insertError } = await supabase
      .from('otp_codes')
      .insert({
        phone,
        otp_code: otp,
        action: action || 'signup',
        status: 'sent',
        expiry_at: expiryTime.toISOString(),
        attempts: 0,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('OTP insertion error:', insertError);
      return NextResponse.json(
        { error: 'Failed to generate OTP' },
        { status: 500 }
      );
    }

    // TODO: In production, send via SMS/WhatsApp
    // For now, log OTP for testing
    console.log(`OTP for ${phone}: ${otp}`);

    return NextResponse.json(
      {
        success: true,
        message: 'OTP sent successfully',
        phone: phone.slice(-4), // Return masked phone for security
        expirySeconds: 300,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('OTP generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT: Verify OTP
export async function PUT(req: NextRequest) {
  try {
    const { phone, otp } = await req.json();

    if (!phone || !otp) {
      return NextResponse.json(
        { error: 'Phone and OTP are required' },
        { status: 400 }
      );
    }

    // Get the latest OTP for this phone
    const { data: otpRecord, error: fetchError } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('phone', phone)
      .eq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !otpRecord) {
      return NextResponse.json(
        { error: 'No OTP found. Please request a new one.' },
        { status: 400 }
      );
    }

    // Check if OTP is expired
    if (new Date() > new Date(otpRecord.expiry_at)) {
      await supabase
        .from('otp_codes')
        .update({ status: 'expired' })
        .eq('id', otpRecord.id);
      
      return NextResponse.json(
        { error: 'OTP has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // Check attempt limit (BFSI Security: max 5 attempts)
    if (otpRecord.attempts >= 5) {
      await supabase
        .from('otp_codes')
        .update({ status: 'blocked' })
        .eq('id', otpRecord.id);
      
      return NextResponse.json(
        { error: 'Too many attempts. Please request a new OTP.' },
        { status: 429 }
      );
    }

    // Verify OTP
    if (otpRecord.otp_code !== otp) {
      // Increment attempts
      await supabase
        .from('otp_codes')
        .update({ attempts: otpRecord.attempts + 1 })
        .eq('id', otpRecord.id);

      return NextResponse.json(
        { error: 'Invalid OTP. Please try again.' },
        { status: 400 }
      );
    }

    // Mark OTP as verified
    await supabase
      .from('otp_codes')
      .update({ status: 'verified' })
      .eq('id', otpRecord.id);

    return NextResponse.json(
      {
        success: true,
        message: 'OTP verified successfully',
        phone,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('OTP verification error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}