import { NextResponse, after } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { resolveAudienceContacts, type AudienceConfig } from '@/lib/broadcast-audience';
import { createBroadcast, deliverBroadcast, BroadcastError } from '@/lib/whatsapp/broadcast-core';

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    const { data: broadcasts, error } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Compute top-level summary analytics
    let totalSent = 0;
    let totalDelivered = 0;
    let totalRead = 0;
    let totalReplied = 0;
    let totalFailed = 0;

    for (const b of broadcasts ?? []) {
      totalSent += Number(b.sent_count) || 0;
      totalDelivered += Number(b.delivered_count) || 0;
      totalRead += Number(b.read_count) || 0;
      totalReplied += Number(b.replied_count) || 0;
      totalFailed += Number(b.failed_count) || 0;
    }

    const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0;
    const readRate = totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 100) : 0;

    return NextResponse.json({
      broadcasts: broadcasts ?? [],
      analytics: {
        total_sent: totalSent,
        total_delivered: totalDelivered,
        total_read: totalRead,
        total_replied: totalReplied,
        total_failed: totalFailed,
        delivery_rate_percent: deliveryRate,
        read_rate_percent: readRate,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body must be a valid JSON object' }, { status: 400 });
    }

    const templateName = body.template_name?.trim();
    if (!templateName) {
      return NextResponse.json({ error: "'template_name' is required" }, { status: 400 });
    }

    const audienceType = body.audience_type || 'all';
    const contactIds: string[] = Array.isArray(body.contact_ids) ? body.contact_ids : [];
    const tagIds: string[] = Array.isArray(body.tag_ids) ? body.tag_ids : [];
    const excludeTagIds: string[] = Array.isArray(body.exclude_tag_ids) ? body.exclude_tag_ids : [];

    if (audienceType === 'selected_contacts' && contactIds.length === 0) {
      return NextResponse.json(
        { error: "At least one contact ID must be selected when audience_type is 'selected_contacts'" },
        { status: 400 }
      );
    }

    const audienceConfig: AudienceConfig = {
      type: audienceType,
      contactIds: contactIds.length > 0 ? contactIds : undefined,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      excludeTagIds: excludeTagIds.length > 0 ? excludeTagIds : undefined,
    };

    // 1. Resolve contacts for this audience
    const targetContacts = await resolveAudienceContacts(supabase, audienceConfig, async () => []);

    if (targetContacts.length === 0) {
      return NextResponse.json(
        { error: 'No matching contacts found for the specified audience criteria' },
        { status: 400 }
      );
    }

    // 2. Prepare recipient parameters with auto-name and fallback support
    const variables = body.variables || {};
    const recipients = targetContacts.map((contact) => {
      // Resolve body params: default {{1}} maps to contact name or fallback
      const var1 = variables['1'] || variables['name'];
      const rawName = contact.name?.trim();
      const param1: string = rawName
        ? rawName
        : typeof var1?.fallback === 'string' && var1.fallback.trim()
          ? var1.fallback.trim()
          : 'Valued Customer';

      return {
        to: contact.phone,
        params: [param1],
      };
    });

    // 3. Create the broadcast plan
    const plan = await createBroadcast(supabase, accountId, userId, {
      name: body.name?.trim() || `Broadcast - ${new Date().toLocaleDateString('en-IN')}`,
      templateName,
      templateLanguage: body.template_language?.trim() || 'en_US',
      recipients,
    });

    // 4. Update the audience_filter in broadcasts row so it shows correctly in dashboard
    await supabase
      .from('broadcasts')
      .update({
        audience_filter: {
          type: audienceType,
          contactIds: audienceType === 'selected_contacts' ? contactIds : undefined,
          tagIds: tagIds.length > 0 ? tagIds : undefined,
        },
        template_variables: variables,
      })
      .eq('id', plan.broadcastId);

    // 5. Fan out asynchronously
    if (body.dispatch !== false) {
      after(() => deliverBroadcast(supabase, plan));
    }

    return NextResponse.json(
      {
        success: true,
        broadcast_id: plan.broadcastId,
        status: 'sending',
        total_recipients: plan.planned.length,
        audience_type: audienceType,
        selected_contacts_count: contactIds.length,
      },
      { status: 202 }
    );
  } catch (err) {
    if (err instanceof BroadcastError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return toErrorResponse(err);
  }
}
