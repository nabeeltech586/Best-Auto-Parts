import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PaymentService } from '@/lib/payments/payment-service';
import type { PhonePeWebhookPayload } from '@/lib/payments/phonepe/types';

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

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    const body = (await req.json()) as PhonePeWebhookPayload;

    if (!body || !body.payload || !body.payload.merchantOrderId) {
      return NextResponse.json(
        { error: 'Invalid webhook payload structure' },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();
    const result = await PaymentService.processWebhook(db, authHeader, body);

    if (result.status === 'INVALID_AUTH') {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid webhook signature/credentials' },
        { status: 401 }
      );
    }

    if (result.status === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'Order reference not found' },
        { status: 404 }
      );
    }

    if (result.status === 'AMOUNT_MISMATCH') {
      return NextResponse.json(
        { error: 'Payment amount mismatch' },
        { status: 400 }
      );
    }

    // PhonePe expects 200 OK for successfully received webhooks
    return NextResponse.json({
      status: 'SUCCESS',
      outcome: result.status,
      merchantTransactionId: result.merchantTransactionId,
      orderId: result.orderId,
    });
  } catch (err: unknown) {
    console.error('[PhonePe Webhook Route Error]:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
