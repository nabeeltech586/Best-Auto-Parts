import { NextResponse } from 'next/server';
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { sendTextMessage } from '@/lib/whatsapp/meta-api';
import { decrypt } from '@/lib/whatsapp/encryption';
import { syncSupplierToContact } from '@/lib/contacts/distributor-sync';
import {
  findOrCreateContactAndConversation,
  logOutboundMessageToInbox,
} from '@/lib/whatsapp/inbox-logger';
import type { PurchaseOrderItem } from '@/types/inventory';

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    const { data: orders, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[inventory/purchase-orders GET] Query failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ purchase_orders: orders || [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const body = await request.json();

    const supplierId = body.supplier_id || null;
    const supplierName = body.supplier_name?.trim();
    let supplierPhone = body.supplier_phone?.trim() || '';
    const items: PurchaseOrderItem[] = Array.isArray(body.items) ? body.items : [];
    const notes = body.notes?.trim() || null;
    const sendViaWhatsapp = Boolean(body.send_via_whatsapp);

    if (!supplierName) {
      return NextResponse.json({ error: 'Distributor name is required' }, { status: 400 });
    }

    if (!supplierPhone) {
      return NextResponse.json({ error: 'Distributor WhatsApp number is required' }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'At least one part item is required' }, { status: 400 });
    }

    // Normalize phone
    supplierPhone = supplierPhone.replace(/[^0-9+]/g, '');
    if (!supplierPhone.startsWith('+')) {
      if (supplierPhone.length === 10) supplierPhone = `+91${supplierPhone}`;
      else if (supplierPhone.startsWith('91') && supplierPhone.length === 12) supplierPhone = `+${supplierPhone}`;
    }

    // Generate PO Number if not provided
    const year = new Date().getFullYear();
    let poNumber = body.po_number?.trim();
    if (!poNumber) {
      const { count } = await supabase
        .from('purchase_orders')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId);

      const seq = String((count ?? 0) + 1).padStart(3, '0');
      poNumber = `PO-${year}-${seq}`;
    }

    // Compute totals
    const totalItems = items.length;
    const totalUnits = items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
    const totalEstimatedCost = items.reduce(
      (acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.cost_price) || 0),
      0,
    );

    const { data: po, error } = await supabase
      .from('purchase_orders')
      .insert({
        account_id: accountId,
        po_number: poNumber,
        supplier_id: supplierId,
        supplier_name: supplierName,
        supplier_phone: supplierPhone,
        items,
        total_items: totalItems,
        total_units: totalUnits,
        total_estimated_cost: totalEstimatedCost,
        notes,
        status: 'SENT',
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[inventory/purchase-orders POST] Insert failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-sync PO supplier to contacts directory
    try {
      await syncSupplierToContact(supabase, {
        firm_name: supplierName,
        whatsapp_number: supplierPhone,
        contact_person: supplierName,
        account_id: accountId,
      });
    } catch (syncErr) {
      console.warn('[inventory/purchase-orders POST] Supplier to contact sync skipped:', syncErr);
    }

    let whatsappDispatched = false;
    let whatsappError: string | null = null;

    if (sendViaWhatsapp) {
      try {
        const { data: config } = await supabase
          .from('whatsapp_config')
          .select('phone_number_id, access_token')
          .eq('account_id', accountId)
          .maybeSingle();

        if (config?.phone_number_id && config?.access_token) {
          const phoneNumberId = config.phone_number_id;
          const accessToken = decrypt(config.access_token);
          // Build formatted text message
          const today = new Date().toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });

          const lines = [
            `*PURCHASE ORDER - BEST AUTO PARTS*`,
            `*PO No:* #${poNumber} | *Date:* ${today}`,
            `*To:* ${supplierName}`,
            '',
          ];

          items.forEach((item, idx) => {
            const oem = item.oem_number ? `OEM: ${item.oem_number}` : '';
            const brand = item.brand ? `${item.brand}` : '';
            const spec = [oem, brand].filter(Boolean).join(' | ');
            const specStr = spec ? ` (${spec})` : '';
            lines.push(`${idx + 1}. ${item.part_name}${specStr} — *Qty: ${item.quantity} pcs*`);
          });

          lines.push('');
          lines.push(`*Total Items:* ${totalItems} | *Total Units:* ${totalUnits}`);
          if (notes) {
            lines.push(`*Notes:* ${notes}`);
          }
          lines.push('');
          lines.push('Please confirm availability & dispatch time.');
          lines.push('- Best Auto Parts, Saharanpur (+91 96347 22174)');

          const messageText = lines.join('\n');
          const cleanTo = supplierPhone.replace(/[^0-9]/g, '');

          const sendResult = await sendTextMessage({
            phoneNumberId,
            accessToken,
            to: cleanTo,
            text: messageText,
          });
          whatsappDispatched = true;

          // Log PO message into CRM Inbox conversation thread
          try {
            const category: 'Distributor' | 'Wholesaler' =
              supplierName.toUpperCase().includes('AGENCY') ? 'Distributor' : 'Wholesaler';
            const resolution = await findOrCreateContactAndConversation(supabase, {
              accountId,
              phone: supplierPhone,
              name: supplierName,
              category,
              company: supplierName,
            });

            if (resolution.success && resolution.conversationId) {
              await logOutboundMessageToInbox(supabase, {
                conversationId: resolution.conversationId,
                contentText: messageText,
                previewTitle: `📦 PO #${poNumber} (${totalUnits} pcs) — ${supplierName}`,
                contentType: 'text',
                messageId: sendResult?.messageId || `crm_po_${Date.now()}`,
                status: 'sent',
              });
            }
          } catch (crmLogErr) {
            console.warn('[inventory/purchase-orders] CRM inbox logging non-fatal notice:', crmLogErr);
          }
        }
      } catch (err: unknown) {
        console.warn('[inventory/purchase-orders] WhatsApp direct dispatch notice:', err);
        whatsappError = err instanceof Error ? err.message : 'Meta API send error';
      }
    }

    return NextResponse.json(
      {
        purchase_order: po,
        whatsapp_dispatched: whatsappDispatched,
        whatsapp_error: whatsappError,
      },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
