import { describe, expect, it } from 'vitest';
import { generateQrMatrix, generateQrPng } from '../qr-generator';

describe('QR Generator (Zero-Dependency Pure TS)', () => {
  const sampleUpi =
    'upi://pay?pa=9761224004-2@axl&pn=Best%20Auto%20Parts&am=690.00&tr=BAP_TXN_TEST123&tn=Order%20BAP_TXN_TEST123&cu=INR';

  it('generates a valid square boolean matrix with finder patterns', () => {
    const matrix = generateQrMatrix(sampleUpi);
    expect(matrix.length).toBeGreaterThan(30);
    expect(matrix.length).toBe(matrix[0].length);

    // Verify top-left 7x7 finder pattern is present (outer black ring)
    expect(matrix[0][0]).toBe(true);
    expect(matrix[0][6]).toBe(true);
    expect(matrix[6][0]).toBe(true);
    expect(matrix[6][6]).toBe(true);
    // Center of top-left finder (3, 3) must be black
    expect(matrix[3][3]).toBe(true);
    // Inner white ring (1, 1) must be false
    expect(matrix[1][1]).toBe(false);
  });

  it('generates a valid PNG buffer with PNG signature and required chunks', () => {
    const png = generateQrPng(sampleUpi, 4, 4);

    // 1. Verify PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50); // 'P'
    expect(png[2]).toBe(0x4e); // 'N'
    expect(png[3]).toBe(0x47); // 'G'
    expect(png[4]).toBe(0x0d);
    expect(png[5]).toBe(0x0a);
    expect(png[6]).toBe(0x1a);
    expect(png[7]).toBe(0x0a);

    // 2. Contains IHDR chunk
    const ihdrIdx = png.indexOf(Buffer.from('IHDR', 'ascii'));
    expect(ihdrIdx).toBe(12);

    // 3. Contains IDAT chunk
    const idatIdx = png.indexOf(Buffer.from('IDAT', 'ascii'));
    expect(idatIdx).toBeGreaterThan(ihdrIdx);

    // 4. Ends with IEND chunk
    const iendIdx = png.indexOf(Buffer.from('IEND', 'ascii'));
    expect(iendIdx).toBeGreaterThan(idatIdx);

    // 5. Total length is healthy (> 500 bytes)
    expect(png.length).toBeGreaterThan(500);
  });

  it('scales image dimensions based on module size', () => {
    const smallPng = generateQrPng(sampleUpi, 2, 4);
    const largePng = generateQrPng(sampleUpi, 8, 4);

    // Read width from IHDR
    const smallWidth = smallPng.readUInt32BE(16);
    const largeWidth = largePng.readUInt32BE(16);

    expect(largeWidth).toBe(smallWidth * 4);
  });
});
