import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')?.trim()

    const db = supabaseAdmin()

    let query = db
      .from('payment_links')
      .select('*')
      .order('created_at', { ascending: false })

    if (status && status !== 'ALL') {
      query = query.eq('status', status)
    }

    if (search) {
      query = query.or(
        `order_id.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,part_details.ilike.%${search}%,merchant_transaction_id.ilike.%${search}%`
      )
    }

    const { data: links, error } = await query.limit(100)

    if (error) {
      console.warn('[API /api/payments/links] DB error:', error.message)
      return NextResponse.json({
        links: [],
        metrics: {
          totalCollected: 0,
          pendingAmount: 0,
          paidCount: 0,
          pendingCount: 0,
          totalCount: 0,
        },
      })
    }

    // Calculate metrics
    const { data: allRows } = await db
      .from('payment_links')
      .select('amount, status')

    let totalCollected = 0
    let pendingAmount = 0
    let paidCount = 0
    let pendingCount = 0
    const totalCount = allRows?.length || 0

    if (allRows) {
      for (const row of allRows) {
        const amt = Number(row.amount) || 0
        if (row.status === 'PAID') {
          totalCollected += amt
          paidCount++
        } else if (row.status === 'PENDING') {
          pendingAmount += amt
          pendingCount++
        }
      }
    }

    return NextResponse.json({
      links: links || [],
      metrics: {
        totalCollected,
        pendingAmount,
        paidCount,
        pendingCount,
        totalCount,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[API /api/payments/links] Error:', message)
    return NextResponse.json({ error: message || 'Failed to fetch links' }, { status: 500 })
  }
}
