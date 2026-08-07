import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Get current user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    // Get current session
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    // Update user metadata with phone
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        phone,
        phone_verified: true,
      },
    });

    if (updateError) {
      console.error('Phone update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update phone' },
        { status: 500 }
      );
    }

    // Log to audit
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      phone,
      action: 'phone_verified',
      status: 'success',
    });

    return NextResponse.json(
      { success: true, message: 'Phone number updated' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Update phone error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}