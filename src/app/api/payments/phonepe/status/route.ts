import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PaymentService } from '@/lib/payments/payment-service';

let _adminClient: SupabaseClient | null = null;
function getSupabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key-placeholder'
    );
  }
  return _adminClient;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderRef = searchParams.get('order');

    if (!orderRef) {
      return NextResponse.json(
        { error: 'Missing order reference' },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();
    const result = await PaymentService.reconcilePaymentStatus(db, orderRef);

    return NextResponse.json({
      merchantTransactionId: orderRef,
      status: result.status,
      success: result.success,
      utr: result.utr,
    });
  } catch (err: unknown) {
    console.error('[PhonePe Status Route Error]:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
