import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { META_ICEBREAKERS, matchIcebreaker } from '@/lib/whatsapp/icebreakers';

export async function GET() {
  try {
    const { accountId } = await getCurrentAccount();
    const icebreakers = Object.values(META_ICEBREAKERS);

    return NextResponse.json({
      icebreakers,
      accountId,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { requireRole } = await import('@/lib/auth/account');
    await requireRole('agent');
    const body = await request.json();

    const { action, text, interactiveReplyId, icebreakerKey, updatedResponse } = body;

    // Test simulation action
    if (action === 'simulate_match') {
      const match = matchIcebreaker(text || '', interactiveReplyId);
      return NextResponse.json({
        matched: Boolean(match),
        icebreaker: match || null,
      });
    }

    // Update response template action
    if (action === 'update_response' && icebreakerKey && updatedResponse) {
      const target = Object.values(META_ICEBREAKERS).find(
        (i) => i.id === icebreakerKey || i.name === icebreakerKey
      );
      if (target) {
        target.responseTemplate = updatedResponse;
        return NextResponse.json({ success: true, icebreaker: target });
      }
      return NextResponse.json({ error: 'Icebreaker not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
