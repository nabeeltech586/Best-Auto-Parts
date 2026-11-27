import { NextResponse } from 'next/server';
import {
  updateServiceCase,
  deleteServiceCase,
} from '@/lib/services/service-cases';
import type { UpdateServiceCaseInput } from '@/types/services';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: UpdateServiceCaseInput = await request.json();

    const updated = await updateServiceCase(id, body);
    if (!updated) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    return NextResponse.json({ case: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = await deleteServiceCase(id);
    return NextResponse.json({ success });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
