import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomerReceiptDialog, ReceiptOrderData } from './customer-receipt-dialog';

describe('CustomerReceiptDialog Component', () => {
  const sampleOrder: ReceiptOrderData = {
    order_id: 'ORD-TEST-1001',
    merchant_transaction_id: 'TXN-TEST-1001',
    customer_name: 'Saud Khan',
    customer_phone: '+919634722174',
    part_details: 'Bajaj Pulsar 150 Front Disc Brake Pad (Genuine Bajaj Auto Ltd)',
    amount: 350,
    status: 'PAID',
    razorpay_payment_id: 'pay_ABC123456789',
    razorpay_payment_link_id: 'plink_XYZ987654',
    gateway: 'razorpay',
    payment_mode: 'RAZORPAY_UPI',
    paid_at: '2026-11-28T02:30:00.000Z',
  };

  it('renders null when open is false or order is null', () => {
    const htmlClosed = renderToStaticMarkup(
      React.createElement(CustomerReceiptDialog, {
        open: false,
        onOpenChange: vi.fn(),
        order: sampleOrder,
      })
    );
    expect(htmlClosed).toBe('');

    const htmlNullOrder = renderToStaticMarkup(
      React.createElement(CustomerReceiptDialog, {
        open: true,
        onOpenChange: vi.fn(),
        order: null,
      })
    );
    expect(htmlNullOrder).toBe('');
  });

  it('renders modal overlay with centered bounds and strict viewport constraints', () => {
    const html = renderToStaticMarkup(
      React.createElement(CustomerReceiptDialog, {
        open: true,
        onOpenChange: vi.fn(),
        order: sampleOrder,
      })
    );

    // Viewport overlay
    expect(html).toContain('fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4');

    // Modal container
    expect(html).toContain('w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-2xl shadow-2xl');

    // Fixed header
    expect(html).toContain('Customer Digital Receipt');
    expect(html).toContain('Official payment receipt &amp; order confirmation for Best Auto Parts.');

    // Scrollable body
    expect(html).toContain('flex-1 overflow-y-auto p-4 sm:p-5');

    // Print section ID & print styles
    expect(html).toContain('id="printable-customer-receipt"');
    expect(html).toContain('@media print');

    // Footer actions
    expect(html).toContain('Print Receipt');
    expect(html).toContain('Copy Receipt Text');
    expect(html).toContain('Send via API WhatsApp');
    expect(html).toContain('WhatsApp Web');
  });

  it('applies break-words and wraps long text safely inside receipt rows', () => {
    const longOrder: ReceiptOrderData = {
      order_id: 'BAP-ORD-SUPER-LONG-IDENTIFIER-999999999999999999',
      customer_name: 'Very Long Customer Name Muhammad Saudul Rehman Khan Al Kailashpuri',
      customer_phone: '+919634722174',
      part_details: 'Chain Sprocket Kit (Rolon Heavy Duty Brass Coated 428-120 Links) with Rear Drum Rubber Bushing',
      amount: 1450,
      status: 'PAID',
      razorpay_payment_id: 'pay_VERYLONGRAZORPAYPAYMENTID_1234567890ABCDEF',
      gateway: 'razorpay',
    };

    const html = renderToStaticMarkup(
      React.createElement(CustomerReceiptDialog, {
        open: true,
        onOpenChange: vi.fn(),
        order: longOrder,
      })
    );

    // Verify min-w-0 and break-words are present
    expect(html).toContain('min-w-0 break-words');
    expect(html).toContain('BAP-ORD-SUPER-LONG-IDENTIFIER');
    expect(html).toContain('Razorpay Online');
    expect(html).toContain('Auto-Deducted (-1 Unit)');
  });

  it('renders Cash and Shop UPI payment source badges accurately', () => {
    const cashOrder: ReceiptOrderData = {
      order_id: 'ORD-CASH-1',
      customer_phone: '9634722174',
      part_details: 'Clutch Wire',
      amount: 120,
      status: 'PAID',
      payment_mode: 'CASH',
    };

    const cashHtml = renderToStaticMarkup(
      React.createElement(CustomerReceiptDialog, {
        open: true,
        onOpenChange: vi.fn(),
        order: cashOrder,
      })
    );
    expect(cashHtml).toContain('Cash');

    const upiOrder: ReceiptOrderData = {
      order_id: 'ORD-UPI-1',
      customer_phone: '9634722174',
      part_details: 'Engine Oil 20W40',
      amount: 380,
      status: 'PAID',
      payment_mode: 'UPI',
    };

    const upiHtml = renderToStaticMarkup(
      React.createElement(CustomerReceiptDialog, {
        open: true,
        onOpenChange: vi.fn(),
        order: upiOrder,
      })
    );
    expect(upiHtml).toContain('Shop UPI / QR');
  });
});
