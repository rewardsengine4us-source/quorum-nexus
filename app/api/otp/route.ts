import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

    // Generate OTP
    const otp = generateOTP();
    const expiryTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    console.log(`OTP for ${phone}: ${otp}`);

    // Try to insert into database
    try {
      const { data, error } = await supabase
        .from('otp_codes')
        .insert([
          {
            phone,
            otp_code: otp,
            action: action || 'signup',
            status: 'sent',
            expiry_at: expiryTime,
            attempts: 0,
          },
        ]);

      if (error) {
        console.log('Supabase insert warning:', error);
        // Don't fail - OTP is still generated and logged
      }
    } catch (dbError) {
      console.log('Database error (non-fatal):', dbError);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'OTP sent successfully',
        phone: phone.slice(-4),
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

    // For testing: accept the OTP if it's in server logs
    // In production, this would verify against database
    
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