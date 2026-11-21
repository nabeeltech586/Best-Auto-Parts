import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const h = vi.hoisted(() => ({
  state: {
    callerRole: 'admin' as 'admin' | 'agent' | 'viewer',
    callerAccountId: 'account-alpha',
    deletedId: null as string | null,
    deletedAccountId: null as string | null,
  },
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: async (requiredRole: string) => {
    const rolesOrder = ['viewer', 'agent', 'admin', 'owner'];
    const callerIdx = rolesOrder.indexOf(h.state.callerRole);
    const requiredIdx = rolesOrder.indexOf(requiredRole);

    if (callerIdx < requiredIdx) {
      const err = new Error(`This action requires the '${requiredRole}' role or higher`);
      (err as unknown as { status: number }).status = 403;
      throw err;
    }

    return {
      accountId: h.state.callerAccountId,
      userId: 'user-1',
      role: h.state.callerRole,
      supabase: {
        from: (table: string) => {
          if (table === 'vehicle_fitment') {
            return {
              delete: () => ({
                eq: (col1: string, val1: string) => ({
                  eq: (col2: string, val2: string) => {
                    if (col1 === 'id') h.state.deletedId = val1;
                    if (col2 === 'account_id') h.state.deletedAccountId = val2;
                    return { error: null };
                  },
                }),
              }),
            };
          }
          throw new Error(`Unexpected table ${table}`);
        },
      },
    };
  },
  toErrorResponse: (err: unknown) => ({
    body: { error: err instanceof Error ? err.message : 'error' },
    status: (err as { status?: number })?.status ?? 500,
  }),
}));

import { DELETE } from './route';

describe('DELETE /api/inventory/fitment/[id] — Role & RLS Consistency', () => {
  beforeEach(() => {
    h.state.callerRole = 'admin';
    h.state.callerAccountId = 'account-alpha';
    h.state.deletedId = null;
    h.state.deletedAccountId = null;
  });

  it('allows an admin to delete a vehicle fitment record', async () => {
    h.state.callerRole = 'admin';
    const req = new Request('https://test/api/inventory/fitment/fitment-123', {
      method: 'DELETE',
    });
    const res = await DELETE(req, {
      params: Promise.resolve({ id: 'fitment-123' }),
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(h.state.deletedId).toBe('fitment-123');
    expect(h.state.deletedAccountId).toBe('account-alpha');
  });

  it('refuses an agent with 403 Forbidden', async () => {
    h.state.callerRole = 'agent';
    const req = new Request('https://test/api/inventory/fitment/fitment-123', {
      method: 'DELETE',
    });
    const res = await DELETE(req, {
      params: Promise.resolve({ id: 'fitment-123' }),
    });

    expect(res.status).toBe(403);
    expect((res as unknown as { body: { error: string } }).body.error).toContain(
      "requires the 'admin' role or higher",
    );
    expect(h.state.deletedId).toBeNull();
  });

  it('refuses a viewer with 403 Forbidden', async () => {
    h.state.callerRole = 'viewer';
    const req = new Request('https://test/api/inventory/fitment/fitment-123', {
      method: 'DELETE',
    });
    const res = await DELETE(req, {
      params: Promise.resolve({ id: 'fitment-123' }),
    });

    expect(res.status).toBe(403);
    expect(h.state.deletedId).toBeNull();
  });

  it('ensures migration 060 vehicle_fitment_delete RLS matches admin role requirement', () => {
    const migrationPath = join(
      process.cwd(),
      'supabase',
      'migrations',
      '060_auto_parts_catalog.sql',
    );
    const sql = readFileSync(migrationPath, 'utf8');

    // RLS policy MUST require 'admin'
    const policyRegex =
      /CREATE\s+POLICY\s+vehicle_fitment_delete\s+ON\s+vehicle_fitment\s+FOR\s+DELETE\s+USING\s*\(\s*is_account_member\s*\(\s*account_id\s*,\s*'admin'\s*\)\s*\)/i;
    expect(policyRegex.test(sql)).toBe(true);
  });
});
