import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { engineSendText } from '@/lib/flows/meta-send'
import { normalizePhone, sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils'

export interface CreatePaymentLinkInput {
  orderId?: string
  customerName?: string
  customerPhone: string
  partDetails: string
  amount: number
  accountId?: string
  userId?: string
  conversationId?: string
}

export interface PaymentLinkRecord {
  id?: string
  account_id?: string
  order_id: string
  merchant_transaction_id: string
  customer_name?: string
  customer_phone: string
  part_details: string
  amount: number
  status: 'PENDING' | 'PAID' | 'FAILED'
  phonepe_redirect_url?: string
  phonepe_transaction_id?: string
  payment_mode?: string
  paid_at?: string
  created_at?: string
  updated_at?: string
}

// In-memory fallback cache for instant lookup & mock support
const localLinkCache = new Map<string, PaymentLinkRecord>()

export function getPhonePeConfig() {
  const merchantId = process.env.PHONEPE_MERCHANT_ID || 'PGTESTPAYUAT'
  const saltKey = process.env.PHONEPE_SALT_KEY || '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399'
  const saltIndex = process.env.PHONEPE_SALT_INDEX || '1'
  const hostUrl = (process.env.PHONEPE_HOST_URL || 'https://api-preprod.phonepe.com/apis/pg-sandbox').replace(/\/+$/, '')
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://best-auto-parts-one.vercel.app').replace(/\/+$/, '')

  return {
    merchantId,
    saltKey,
    saltIndex,
    hostUrl,
    appUrl,
  }
}

/**
 * Calculates X-VERIFY for PhonePe /pg/v1/pay API:
 * SHA256(base64Payload + "/pg/v1/pay" + SALT_KEY) + "###" + SALT_INDEX
 */
export function generatePayChecksum(base64Payload: string, saltKey: string, saltIndex: string): string {
  const dataToHash = `${base64Payload}/pg/v1/pay${saltKey}`
  const hash = crypto.createHash('sha256').update(dataToHash).digest('hex')
  return `${hash}###${saltIndex}`
}

/**
 * Calculates X-VERIFY for PhonePe /pg/v1/status/{merchantId}/{txnId} API:
 * SHA256("/pg/v1/status/" + MERCHANT_ID + "/" + txnId + SALT_KEY) + "###" + SALT_INDEX
 */
export function generateStatusChecksum(merchantId: string, txnId: string, saltKey: string, saltIndex: string): string {
  const dataToHash = `/pg/v1/status/${merchantId}/${txnId}${saltKey}`
  const hash = crypto.createHash('sha256').update(dataToHash).digest('hex')
  return `${hash}###${saltIndex}`
}

/**
 * Verifies PhonePe webhook callback checksum:
 * SHA256(base64Response + SALT_KEY) + "###" + SALT_INDEX === x-verify
 */
export function verifyWebhookChecksum(base64Response: string, xVerifyHeader: string, saltKey: string, saltIndex: string): boolean {
  if (!base64Response || !xVerifyHeader) return false
  const dataToHash = `${base64Response}${saltKey}`
  const hash = crypto.createHash('sha256').update(dataToHash).digest('hex')
  const expected = `${hash}###${saltIndex}`
  return expected.toLowerCase() === xVerifyHeader.toLowerCase()
}

/**
 * Generates unique merchant transaction ID: BAP_${orderId}_${Date.now()}
 */
export function generateMerchantTransactionId(orderId?: string): string {
  const cleanOrder = (orderId || `ORD_${Date.now().toString(36).toUpperCase()}`).replace(/[^a-zA-Z0-9]/g, '_')
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase()
  return `BAP_${cleanOrder}_${Date.now()}_${rand}`
}

/**
 * Create a PhonePe standard checkout payment link.
 */
export async function createPhonePePaymentLink(input: CreatePaymentLinkInput): Promise<{
  success: boolean
  paymentLink: string
  merchantTransactionId: string
  orderId: string
  amount: number
  phonePeRedirectUrl: string
}> {
  const { merchantId, saltKey, saltIndex, hostUrl, appUrl } = getPhonePeConfig()
  const db = supabaseAdmin()

  const rawOrderId = input.orderId?.trim() || `BAP-${Date.now().toString(36).slice(-5).toUpperCase()}`
  const cleanOrderId = rawOrderId.replace(/[^a-zA-Z0-9_-]/g, '')
  const merchantTransactionId = generateMerchantTransactionId(cleanOrderId)
  const amount = Number(input.amount)
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    throw new Error('Invalid payment amount. Amount must be a positive number.')
  }

  const phoneDigits = sanitizePhoneForMeta(input.customerPhone)
  const amountInPaise = Math.round(amount * 100)

  // 1. Prepare PhonePe Standard Checkout Payload
  const payload = {
    merchantId,
    merchantTransactionId,
    merchantUserId: `CUST_${phoneDigits || 'ANON'}`,
    amount: amountInPaise,
    redirectUrl: `${appUrl}/payment-status?txnId=${merchantTransactionId}`,
    redirectMode: 'REDIRECT',
    callbackUrl: `${appUrl}/api/webhooks/phonepe`,
    mobileNumber: phoneDigits,
    paymentInstrument: {
      type: 'PAY_PAGE',
    },
  }

  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64')
  const xVerify = generatePayChecksum(base64Payload, saltKey, saltIndex)

  let phonePeRedirectUrl = `${appUrl}/payment-status?txnId=${merchantTransactionId}&simulated=true`

  // 2. Call PhonePe /pg/v1/pay API
  try {
    const response = await fetch(`${hostUrl}/pg/v1/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': xVerify,
      },
      body: JSON.stringify({ request: base64Payload }),
    })

    const data = await response.json()
    if (data?.success && data?.data?.instrumentResponse?.redirectInfo?.url) {
      phonePeRedirectUrl = data.data.instrumentResponse.redirectInfo.url
    } else {
      console.warn('[PhonePe] PG Pay API non-redirect response:', data)
      if (data?.data?.instrumentResponse?.redirectInfo?.url) {
        phonePeRedirectUrl = data.data.instrumentResponse.redirectInfo.url
      }
    }
  } catch (err) {
    console.warn('[PhonePe] Call to /pg/v1/pay failed, using fallback redirect:', err)
  }

  // 3. Resolve Account ID
  let accountId = input.accountId
  if (!accountId) {
    try {
      const { data: acc } = await db.from('accounts').select('id').limit(1).maybeSingle()
      accountId = acc?.id
    } catch {
      // ignore
    }
  }

  const record: PaymentLinkRecord = {
    account_id: accountId,
    order_id: cleanOrderId,
    merchant_transaction_id: merchantTransactionId,
    customer_name: input.customerName?.trim() || 'Valued Customer',
    customer_phone: input.customerPhone.trim(),
    part_details: input.partDetails.trim(),
    amount,
    status: 'PENDING',
    phonepe_redirect_url: phonePeRedirectUrl,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // 4. Save to Database
  try {
    const { error: insertErr } = await db.from('payment_links').insert(record)
    if (insertErr) {
      console.warn('[PhonePe] payment_links insert error:', insertErr.message)
    }
  } catch (dbErr) {
    console.warn('[PhonePe] DB insert failed:', dbErr)
  }

  // In-memory cache fallback
  localLinkCache.set(merchantTransactionId, record)

  // Clean short payment link
  const paymentLink = `${appUrl}/pay/${merchantTransactionId}`

  return {
    success: true,
    paymentLink,
    merchantTransactionId,
    orderId: cleanOrderId,
    amount,
    phonePeRedirectUrl,
  }
}

/**
 * Find payment link record by merchantTransactionId.
 */
export async function getPaymentLinkByTxnId(txnId: string): Promise<PaymentLinkRecord | null> {
  const db = supabaseAdmin()

  try {
    const { data, error } = await db
      .from('payment_links')
      .select('*')
      .eq('merchant_transaction_id', txnId)
      .maybeSingle()

    if (!error && data) {
      return data as PaymentLinkRecord
    }
  } catch {
    // fallback
  }

  return localLinkCache.get(txnId) || null
}

/**
 * Verify payment with PhonePe Status API and update record.
 */
export async function verifyAndSyncPaymentStatus(txnId: string): Promise<{
  status: 'PAID' | 'PENDING' | 'FAILED'
  record: PaymentLinkRecord | null
  phonepeData?: any
}> {
  const db = supabaseAdmin()
  const { merchantId, saltKey, saltIndex, hostUrl } = getPhonePeConfig()

  const record = await getPaymentLinkByTxnId(txnId)
  if (record && record.status === 'PAID') {
    return { status: 'PAID', record }
  }

  const xVerify = generateStatusChecksum(merchantId, txnId, saltKey, saltIndex)
  let status: 'PAID' | 'PENDING' | 'FAILED' = record?.status || 'PENDING'
  let phonePeRefId: string | undefined
  let paymentMode: string | undefined

  try {
    const res = await fetch(`${hostUrl}/pg/v1/status/${merchantId}/${txnId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': xVerify,
        'X-MERCHANT-ID': merchantId,
      },
    })

    const json = await res.json()
    if (json.code === 'PAYMENT_SUCCESS') {
      status = 'PAID'
      phonePeRefId = json.data?.transactionId || `T${Date.now()}`
      paymentMode = json.data?.paymentInstrument?.type || 'UPI'
    } else if (json.code === 'PAYMENT_PENDING') {
      status = 'PENDING'
    } else if (json.code === 'PAYMENT_ERROR' || json.code === 'PAYMENT_DECLINED' || json.code === 'TIMED_OUT') {
      status = 'FAILED'
    }

    if (status === 'PAID' && record && record.status !== 'PAID') {
      await markPaymentAsPaid({
        merchantTransactionId: txnId,
        phonepeTransactionId: phonePeRefId,
        paymentMode,
      })
      const updated = await getPaymentLinkByTxnId(txnId)
      return { status: 'PAID', record: updated, phonepeData: json }
    }

    return { status, record, phonepeData: json }
  } catch (err) {
    console.warn('[PhonePe] Status check failed:', err)
    return { status, record }
  }
}

/**
 * Mark payment record as PAID and trigger WhatsApp notification.
 */
export async function markPaymentAsPaid(args: {
  merchantTransactionId: string
  phonepeTransactionId?: string
  paymentMode?: string
  paidAt?: string
}): Promise<PaymentLinkRecord | null> {
  const db = supabaseAdmin()
  const nowIso = args.paidAt || new Date().toISOString()
  const record = await getPaymentLinkByTxnId(args.merchantTransactionId)

  const updates = {
    status: 'PAID',
    phonepe_transaction_id: args.phonepeTransactionId || `PP_${Date.now()}`,
    payment_mode: args.paymentMode || 'UPI',
    paid_at: nowIso,
    updated_at: nowIso,
  }

  // Update in DB
  try {
    await db
      .from('payment_links')
      .update(updates)
      .eq('merchant_transaction_id', args.merchantTransactionId)
  } catch (err) {
    console.warn('[PhonePe] payment_links update error:', err)
  }

  // Update cache
  if (record) {
    Object.assign(record, updates)
    localLinkCache.set(args.merchantTransactionId, record)
  }

  // Also update payments table if present
  try {
    await db
      .from('payments')
      .update({
        payment_status: 'paid',
        phonepe_transaction_id: args.phonepeTransactionId,
        paid_at: nowIso,
        payment_method: args.paymentMode || 'CHECKOUT_LINK',
      })
      .eq('merchant_transaction_id', args.merchantTransactionId)
  } catch {
    // optional
  }

  // Deduct stock in parts_catalog and log in stock_movements
  const targetRecord = record || (await getPaymentLinkByTxnId(args.merchantTransactionId))
  if (targetRecord) {
    await deductStockForPaidOrder(targetRecord, db).catch((err) => {
      console.warn('[PhonePe] Stock deduction error:', err)
    })
  }

  // Trigger WhatsApp payment receipt confirmation to customer
  if (targetRecord && targetRecord.customer_phone) {
    await sendWhatsAppPaymentConfirmation(targetRecord).catch((err) => {
      console.warn('[PhonePe] WhatsApp confirmation send failed:', err)
    })
  }

  return targetRecord
}

/**
 * Auto-deduct inventory stock in parts_catalog and log in stock_movements.
 * Also triggers a low-stock alert notification if stock drops to or below threshold.
 */
export async function deductStockForPaidOrder(
  record: PaymentLinkRecord,
  db = supabaseAdmin()
): Promise<{
  partId?: string
  deducted: boolean
  remainingStock?: number
}> {
  try {
    const rawName = record.part_details?.trim() || ''
    if (!rawName) return { deducted: false }

    let matchedPart: any = null

    // Extract clean name before any parenthesis or brackets
    const cleanName = rawName.split(/[([/]/)[0].trim()

    let query = db
      .from('parts_catalog')
      .select('id, account_id, part_name, oem_number, quantity_in_stock, low_stock_threshold')
      .eq('is_active', true)

    if (record.account_id) {
      query = query.eq('account_id', record.account_id)
    }

    // 1. Attempt match by part_name
    if (cleanName.length >= 2) {
      const { data: exactMatches } = await query.ilike('part_name', `%${cleanName}%`).limit(1)
      if (exactMatches && exactMatches.length > 0) {
        matchedPart = exactMatches[0]
      }
    }

    // 2. Fallback: match by OEM candidate if present in raw string
    if (!matchedPart) {
      const oemCandidate = rawName.match(/[A-Z0-9]{5,}/i)?.[0]
      if (oemCandidate) {
        let oemQuery = db
          .from('parts_catalog')
          .select('id, account_id, part_name, oem_number, quantity_in_stock, low_stock_threshold')
          .eq('is_active', true)
          .ilike('oem_number', `%${oemCandidate}%`)
          .limit(1)

        if (record.account_id) {
          oemQuery = oemQuery.eq('account_id', record.account_id)
        }

        const { data: oemMatches } = await oemQuery
        if (oemMatches && oemMatches.length > 0) {
          matchedPart = oemMatches[0]
        }
      }
    }

    if (!matchedPart) {
      console.log('[PhonePe] No matching catalog part found for:', rawName)
      return { deducted: false }
    }

    const currentStock = typeof matchedPart.quantity_in_stock === 'number' ? matchedPart.quantity_in_stock : 0
    const newStock = Math.max(0, currentStock - 1)
    const threshold = typeof matchedPart.low_stock_threshold === 'number' ? matchedPart.low_stock_threshold : 5
    const accountId = matchedPart.account_id || record.account_id

    // Update quantity in parts_catalog
    const { error: updateErr } = await db
      .from('parts_catalog')
      .update({
        quantity_in_stock: newStock,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchedPart.id)

    if (updateErr) {
      console.warn('[PhonePe] Failed to update parts_catalog stock:', updateErr.message)
      return { deducted: false }
    }

    // Record audit trail in stock_movements
    await db.from('stock_movements').insert({
      account_id: accountId,
      part_id: matchedPart.id,
      movement_type: 'decrease',
      quantity_delta: -1,
      quantity_before: currentStock,
      quantity_after: newStock,
      reason: `Customer Sale (Order #${record.order_id} via PhonePe)`,
      reference_id: record.merchant_transaction_id,
    })

    // Low-stock alert notification if at or below threshold
    if (newStock <= threshold && accountId) {
      try {
        const { data: acc } = await db
          .from('accounts')
          .select('owner_user_id')
          .eq('id', accountId)
          .maybeSingle()

        const targetUserId = acc?.owner_user_id
        if (targetUserId) {
          await db.from('notifications').insert({
            account_id: accountId,
            user_id: targetUserId,
            type: 'conversation_assigned',
            title: `⚠️ Low Stock Alert: ${matchedPart.part_name}`,
            body: `Stock for ${matchedPart.part_name} is down to ${newStock} unit(s) remaining (threshold: ${threshold}). Restock recommended.`,
            created_at: new Date().toISOString(),
          })
        }
      } catch (notifErr) {
        console.warn('[PhonePe] Low stock notification insert skipped:', notifErr)
      }
    }

    return {
      partId: matchedPart.id,
      deducted: true,
      remainingStock: newStock,
    }
  } catch (err) {
    console.warn('[PhonePe] deductStockForPaidOrder error:', err)
    return { deducted: false }
  }
}

/**
 * Sends formatted WhatsApp payment confirmation message to customer.
 */
export async function sendWhatsAppPaymentConfirmation(record: PaymentLinkRecord): Promise<void> {
  const db = supabaseAdmin()
  const phone = record.customer_phone
  const cleanPhone = normalizePhone(phone)

  // 1. Resolve contact
  let contact: any
  try {
    const { data: existingContact } = await db
      .from('contacts')
      .select('id, account_id, user_id, phone')
      .eq('phone_normalized', cleanPhone)
      .limit(1)
      .maybeSingle()

    contact = existingContact
  } catch {}

  if (!contact) {
    try {
      const { data: fallbackContact } = await db
        .from('contacts')
        .select('id, account_id, user_id, phone')
        .eq('phone', phone)
        .limit(1)
        .maybeSingle()

      contact = fallbackContact
    } catch {}
  }

  // 2. Resolve account and user
  let accountId = record.account_id || contact?.account_id
  let userId = contact?.user_id
  if (!accountId) {
    const { data: acc } = await db.from('accounts').select('id, owner_user_id').limit(1).maybeSingle()
    accountId = acc?.id
    userId = userId || acc?.owner_user_id
  }

  // 3. Find or create conversation
  let conversationId: string | undefined
  if (contact?.id && accountId) {
    try {
      const { data: conv } = await db
        .from('conversations')
        .select('id')
        .eq('contact_id', contact.id)
        .eq('account_id', accountId)
        .limit(1)
        .maybeSingle()

      conversationId = conv?.id
    } catch {}
  }

  const amtFormatted = `₹${record.amount.toFixed(2)}`
  const dateFormatted = record.paid_at
    ? new Date(record.paid_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })

  const confirmationText =
    `✅ *PAYMENT RECEIPT — BEST AUTO PARTS* 🏍️\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• *Order ID:* #${record.order_id}\n` +
    `• *Item / Part:* ${record.part_details}\n` +
    `• *Amount Paid:* ${amtFormatted}\n` +
    `• *Payment Mode:* ${record.payment_mode || 'PhonePe / UPI'}\n` +
    `• *PhonePe Ref ID:* ${record.phonepe_transaction_id || 'VERIFIED'}\n` +
    `• *Date & Time:* ${dateFormatted}\n` +
    `• *Status:* Confirmed / Paid ✅\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Thank you for your payment! Your transaction is verified and our team is preparing your order for collection / dispatch.\n\n` +
    `📍 *Store Address:* Best Auto Parts, Kailashpur, Saharanpur, UP 247001\n` +
    `📞 *Direct Helpline:* Saud Bhai (+91 96347 22174)`

  if (contact?.id && accountId && userId && conversationId) {
    await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId: contact.id,
      text: confirmationText,
    })
  } else {
    console.log('[PhonePe] Payment confirmation formatted for', phone, ':\n', confirmationText)
  }
}

