import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET } from './route';

vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: vi.fn().mockResolvedValue({ success: true, messageId: 'wamid.msg123' }),
}));

vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'payment_links') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: 'plink_123',
                      order_id: 'ORD-CAT-999',
                      customer_name: 'Mohd Rashid',
                      customer_phone: '919876543210',
                      account_id: 'acc_123',
                    },
                    error: null,
                  }),
                }),
              }),
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'plink_123',
                    order_id: 'ORD-CAT-999',
                    customer_name: 'Mohd Rashid',
                    customer_phone: '919876543210',
                    delivery_status: 'Out for Delivery (Local Rider)',
                    rider_name: 'Mohd Sameer',
                    rider_phone: '+91 98971 23456',
                  },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
            or: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'orders') {
        return {
          update: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'contacts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'cont_123', account_id: 'acc_123', user_id: 'usr_123' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'conversations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'conv_123' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
  })),
}));

describe('Delivery Status API (/api/orders/delivery-status)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when orderId is missing', async () => {
    const req = new Request('http://localhost:3000/api/orders/delivery-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryStatus: 'Confirmed' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('orderId is required');
  });

  it('returns 400 when deliveryStatus is missing', async () => {
    const req = new Request('http://localhost:3000/api/orders/delivery-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'ORD-CAT-101' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('deliveryStatus is required');
  });

  it('updates delivery status to "Out for Delivery (Local Rider)" and sends WhatsApp alert with rider details', async () => {
    const { engineSendText } = await import('@/lib/flows/meta-send');

    const req = new Request('http://localhost:3000/api/orders/delivery-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: 'ORD-CAT-999',
        deliveryStatus: 'Out for Delivery (Local Rider)',
        riderName: 'Mohd Sameer',
        riderPhone: '+91 98971 23456',
        customerPhone: '919876543210',
        customerName: 'Mohd Rashid',
        notifyCustomer: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.orderId).toBe('ORD-CAT-999');
    expect(body.deliveryStatus).toBe('Out for Delivery (Local Rider)');
    expect(body.riderName).toBe('Mohd Sameer');
    expect(body.riderPhone).toBe('+91 98971 23456');

    // Verify WhatsApp alert sent
    expect(engineSendText).toHaveBeenCalledTimes(1);
    const sent = (engineSendText as any).mock.calls[0][0];
    expect(sent.text).toContain('OUT FOR DELIVERY');
    expect(sent.text).toContain('#ORD-CAT-999');
    expect(sent.text).toContain('Mohd Sameer');
    expect(sent.text).toContain('+91 98971 23456');
    expect(sent.text).toContain('Kailashpur, Saharanpur, UP 247001');
    expect(sent.text).toContain('+91 96347 22174');
  });

  it('updates delivery status to "Delivered" and sends completion WhatsApp alert', async () => {
    const { engineSendText } = await import('@/lib/flows/meta-send');

    const req = new Request('http://localhost:3000/api/orders/delivery-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: 'ORD-CAT-888',
        deliveryStatus: 'Delivered',
        riderName: 'Arshad Khan',
        riderPhone: '+91 97612 24004',
        customerPhone: '919876543210',
        customerName: 'Rashid Bhai',
        notifyCustomer: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.deliveryStatus).toBe('Delivered');

    expect(engineSendText).toHaveBeenCalledTimes(1);
    const sent = (engineSendText as any).mock.calls[0][0];
    expect(sent.text).toContain('ORDER DELIVERED');
    expect(sent.text).toContain('#ORD-CAT-888');
    expect(sent.text).toContain('Arshad Khan');
    expect(sent.text).toContain('+91 97612 24004');
    expect(sent.text).toContain('Kailashpur, Saharanpur, UP 247001');
  });

  it('does not send WhatsApp alert when notifyCustomer is false', async () => {
    const { engineSendText } = await import('@/lib/flows/meta-send');

    const req = new Request('http://localhost:3000/api/orders/delivery-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: 'ORD-CAT-777',
        deliveryStatus: 'Out for Delivery (Local Rider)',
        riderName: 'Mohd Sameer',
        riderPhone: '+91 98971 23456',
        notifyCustomer: false,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(engineSendText).not.toHaveBeenCalled();
  });

  it('GET returns 400 when orderId is missing', async () => {
    const req = new Request('http://localhost:3000/api/orders/delivery-status');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('GET returns delivery status for valid orderId', async () => {
    const req = new Request('http://localhost:3000/api/orders/delivery-status?orderId=ORD-CAT-999');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.orderId).toBe('ORD-CAT-999');
    expect(body.deliveryStatus).toBe('Out for Delivery (Local Rider)');
    expect(body.riderName).toBe('Mohd Sameer');
    expect(body.riderPhone).toBe('+91 98971 23456');
  });
});
