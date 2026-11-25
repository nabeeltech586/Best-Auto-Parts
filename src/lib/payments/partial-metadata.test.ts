import { describe, it, expect } from 'vitest';
import {
  encodePartialMetadata,
  stripPartialMetadataTag,
  parsePaymentAmountsAndStatus,
} from './partial-metadata';

describe('Partial Payment Metadata Utility', () => {
  it('encodes and strips partial metadata tags cleanly', () => {
    const tag = encodePartialMetadata({
      paidAmount: 1500,
      remainingAmount: 1050,
      mode: 'UPI / QR',
      utr: 'UPI Ref 4123891024',
    });

    expect(tag).toBe('[PARTIAL:paid=1500.00:remaining=1050.00:mode=UPI / QR:utr=UPI Ref 4123891024]');

    const rawDetails = `Bajaj Pulsar 150 Clutch Plate Set ${tag}`;
    const cleaned = stripPartialMetadataTag(rawDetails);
    expect(cleaned).toBe('Bajaj Pulsar 150 Clutch Plate Set');
  });

  it('parses fallback partial metadata from part_details when dedicated columns are missing', () => {
    const record = {
      amount: 2550,
      status: 'PENDING',
      part_details:
        'Bajaj Pulsar 150 Clutch Plate Set [PARTIAL:paid=1500.00:remaining=1050.00:mode=Cash in Hand:utr=CASH1234]',
      phonepe_transaction_id: null,
    };

    const parsed = parsePaymentAmountsAndStatus(record);
    expect(parsed.status).toBe('PARTIAL');
    expect(parsed.totalAmount).toBe(2550);
    expect(parsed.paidAmount).toBe(1500);
    expect(parsed.remainingAmount).toBe(1050);
    expect(parsed.paymentMode).toBe('Cash in Hand');
    expect(parsed.utr).toBe('CASH1234');
  });

  it('parses short-form fallback from phonepe_transaction_id', () => {
    const record = {
      amount: 2550,
      status: 'PENDING',
      part_details: 'Bajaj Pulsar 150 Clutch Plate Set',
      phonepe_transaction_id: 'PARTIAL:1500:1050:QR999',
    };

    const parsed = parsePaymentAmountsAndStatus(record);
    expect(parsed.status).toBe('PARTIAL');
    expect(parsed.paidAmount).toBe(1500);
    expect(parsed.remainingAmount).toBe(1050);
    expect(parsed.utr).toBe('QR999');
  });

  it('prefers dedicated columns when present and populated', () => {
    const record = {
      amount: 2550,
      status: 'PARTIAL',
      paid_amount: 1500,
      remaining_amount: 1050,
      part_details: 'Bajaj Pulsar 150 Clutch Plate Set',
    };

    const parsed = parsePaymentAmountsAndStatus(record);
    expect(parsed.status).toBe('PARTIAL');
    expect(parsed.paidAmount).toBe(1500);
    expect(parsed.remainingAmount).toBe(1050);
  });

  it('treats PAID status with remaining 0 as PAID', () => {
    const record = {
      amount: 2550,
      status: 'PAID',
      paid_amount: 2550,
      remaining_amount: 0,
      part_details: 'Bajaj Pulsar 150 Clutch Plate Set',
    };

    const parsed = parsePaymentAmountsAndStatus(record);
    expect(parsed.status).toBe('PAID');
    expect(parsed.paidAmount).toBe(2550);
    expect(parsed.remainingAmount).toBe(0);
  });
});
