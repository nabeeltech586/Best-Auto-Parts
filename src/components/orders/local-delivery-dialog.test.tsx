import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocalDeliveryDialog } from './local-delivery-dialog';

describe('LocalDeliveryDialog Component', () => {
  it('renders without throwing when order is null and open is false', () => {
    expect(() => {
      renderToStaticMarkup(
        React.createElement(LocalDeliveryDialog, {
          open: false,
          onOpenChange: vi.fn(),
          order: null,
        })
      );
    }).not.toThrow();
  });

  it('renders without throwing when order is provided with valid data', () => {
    expect(() => {
      renderToStaticMarkup(
        React.createElement(LocalDeliveryDialog, {
          open: true,
          onOpenChange: vi.fn(),
          order: {
            order_id: 'ORD-CAT-1234',
            customer_name: 'Mohd Rashid',
            customer_phone: '919876543210',
            part_details: 'Hero Splendor Brake Shoe',
            amount: 170,
            delivery_status: 'Out for Delivery (Local Rider)',
            rider_name: 'Mohd Sameer',
            rider_phone: '+91 98971 23456',
          },
        })
      );
    }).not.toThrow();
  });

  it('renders safely without throwing when order has missing, null, or undefined fields', () => {
    expect(() => {
      renderToStaticMarkup(
        React.createElement(LocalDeliveryDialog, {
          open: true,
          onOpenChange: vi.fn(),
          order: {
            order_id: '',
            customer_name: null,
            customer_phone: null,
            part_details: null,
            amount: null,
            delivery_status: null,
            rider_name: null,
            rider_phone: null,
            delivery_notes: null,
          } as any,
        })
      );
    }).not.toThrow();
  });

  it('renders safely when opened in blank mode from /orders', () => {
    expect(() => {
      renderToStaticMarkup(
        React.createElement(LocalDeliveryDialog, {
          open: true,
          onOpenChange: vi.fn(),
          order: {
            order_id: '',
            customer_name: '',
            customer_phone: '',
            part_details: '',
            delivery_status: 'Out for Delivery (Local Rider)',
          },
        })
      );
    }).not.toThrow();
  });

  it('renders safely when order uses camelCase props instead of snake_case', () => {
    expect(() => {
      renderToStaticMarkup(
        React.createElement(LocalDeliveryDialog, {
          open: true,
          onOpenChange: vi.fn(),
          order: {
            orderId: 'ORD-CAT-5678',
            customerName: 'Sameer Khan',
            customerPhone: '919634722174',
            deliveryStatus: 'Delivered',
            riderName: 'Arshad Khan',
            riderPhone: '+91 97612 24004',
          } as any,
        })
      );
    }).not.toThrow();
  });
});
