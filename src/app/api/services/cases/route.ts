import { NextResponse } from 'next/server';
import {
  getServiceCases,
  createServiceCase,
} from '@/lib/services/service-cases';
import type { CreateServiceCaseInput } from '@/types/services';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    const cases = await getServiceCases(null, accountId);
    return NextResponse.json({ cases });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: CreateServiceCaseInput = await request.json();

    if (!body.customer_name || !body.phone || !body.service_type) {
      return NextResponse.json(
        { error: 'customer_name, phone, and service_type are required' },
        { status: 400 }
      );
    }

    const created = await createServiceCase(body);
    return NextResponse.json({ case: created }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
