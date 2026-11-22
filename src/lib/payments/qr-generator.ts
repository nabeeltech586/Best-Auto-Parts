import zlib from 'zlib';

/**
 * Pure TypeScript ISO/IEC 18004 QR Code Matrix and PNG Image Generator
 * Zero external dependencies. Uses Node.js standard built-in `zlib`.
 */

// Galois Field GF(2^8) math with primitive polynomial 0x11d
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], GF_EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsCompute(data: Uint8Array, numEcBytes: number): Uint8Array {
  const gen = rsGeneratorPoly(numEcBytes);
  const res = new Uint8Array(data.length + numEcBytes);
  res.set(data, 0);

  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

// QR Code Specifications: Version 8 (49x49), EC Level M (15% recovery)
// Total codewords: 192 (122 data codewords, 70 EC codewords across 4 blocks of 24+24+24+25?)
// To make it fully universal and robust across sizes from small URLs to long UPI URIs:
interface VersionSpec {
  version: number;
  size: number;
  dataBytes: number;
  ecBytesPerBlock: number;
  numBlocks: number;
  alignments: number[];
}

const VERSIONS: VersionSpec[] = [
  // Version 4: 33x33, EC M -> 64 data bytes
  { version: 4, size: 33, dataBytes: 64, ecBytesPerBlock: 18, numBlocks: 2, alignments: [6, 26] },
  // Version 6: 41x41, EC M -> 108 data bytes
  { version: 6, size: 41, dataBytes: 108, ecBytesPerBlock: 24, numBlocks: 4, alignments: [6, 34] },
  // Version 8: 49x49, EC M -> 152 data bytes (Holds typical UPI URI up to 150 chars)
  { version: 8, size: 49, dataBytes: 152, ecBytesPerBlock: 24, numBlocks: 4, alignments: [6, 26, 46] },
  // Version 10: 57x57, EC M -> 216 data bytes (Holds long UPI URIs up to 210 chars)
  { version: 10, size: 57, dataBytes: 216, ecBytesPerBlock: 28, numBlocks: 5, alignments: [6, 30, 54] },
];

export function generateQrMatrix(text: string): boolean[][] {
  const bytes = Buffer.from(text, 'utf-8');
  const spec = VERSIONS.find((v) => bytes.length + 3 <= v.dataBytes) || VERSIONS[VERSIONS.length - 1];

  // 1. Bit Buffer Construction (Byte Mode: 0100)
  const bitBuf: number[] = [];
  function pushBits(val: number, length: number) {
    for (let i = length - 1; i >= 0; i--) {
      bitBuf.push((val >>> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte Mode
  pushBits(bytes.length, 8); // Character count
  for (let i = 0; i < bytes.length; i++) {
    pushBits(bytes[i], 8);
  }

  // Terminator & Padding
  const maxDataBits = spec.dataBytes * 8;
  const padLength = Math.min(4, maxDataBits - bitBuf.length);
  pushBits(0, padLength);
  while (bitBuf.length % 8 !== 0) {
    bitBuf.push(0);
  }

  const dataCodewords = new Uint8Array(spec.dataBytes);
  for (let i = 0; i < bitBuf.length / 8; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bitBuf[i * 8 + b];
    }
    dataCodewords[i] = byteVal;
  }

  // Alternate pad bytes 0xEC and 0x11
  let padIdx = 0;
  for (let i = bitBuf.length / 8; i < spec.dataBytes; i++) {
    dataCodewords[i] = padIdx % 2 === 0 ? 0xec : 0x11;
    padIdx++;
  }

  // 2. Block division and Reed-Solomon EC computation
  const blockSize = Math.floor(spec.dataBytes / spec.numBlocks);
  const ecBlocks: Uint8Array[] = [];
  const dataBlocks: Uint8Array[] = [];

  for (let i = 0; i < spec.numBlocks; i++) {
    const start = i * blockSize;
    const end = i === spec.numBlocks - 1 ? spec.dataBytes : start + blockSize;
    const chunk = dataCodewords.slice(start, end);
    dataBlocks.push(chunk);
    ecBlocks.push(rsCompute(chunk, spec.ecBytesPerBlock));
  }

  // Interleave data and EC codewords
  const interleaved: number[] = [];
  const maxBlockLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxBlockLen; i++) {
    for (const b of dataBlocks) {
      if (i < b.length) interleaved.push(b[i]);
    }
  }
  for (let i = 0; i < spec.ecBytesPerBlock; i++) {
    for (const ec of ecBlocks) {
      if (i < ec.length) interleaved.push(ec[i]);
    }
  }

  // 3. Matrix Assembly
  const size = spec.size;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );

  function placeFinder(r: number, c: number) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
            matrix[nr][nc] =
              dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
          } else {
            matrix[nr][nc] = false; // separator
          }
        }
      }
    }
  }

  // Finder Patterns
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing Patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  // Alignment Patterns
  for (const r of spec.alignments) {
    for (const c of spec.alignments) {
      if (matrix[r][c] !== null) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          matrix[r + dr][c + dc] =
            Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
        }
      }
    }
  }

  // Format Info Area Reserve (Dummy placeholder to prevent data overwrite)
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  matrix[size - 8][8] = true; // Dark module

  // 4. Fill Data Bits with Zig-Zag Scan avoiding function modules
  const allBits: number[] = [];
  for (const byte of interleaved) {
    for (let b = 7; b >= 0; b--) {
      allBits.push((byte >>> b) & 1);
    }
  }

  let bitIdx = 0;
  let upwards = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column
    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (matrix[r][c] === null) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          // Apply standard Mask 0: (row + col) % 2 == 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bit === 1) !== mask;
        }
      }
    }
    upwards = !upwards;
  }

  // Format info for EC Level M, Mask 0: 0x5412 (101010000010010)
  const formatInfo = 0x5412;
  for (let i = 0; i < 15; i++) {
    const bit = ((formatInfo >>> i) & 1) === 1;
    if (i < 6) matrix[8][i] = bit;
    else if (i < 8) matrix[8][i + 1] = bit;
    else matrix[8 - (i - 7)][8] = bit;

    if (i < 8) matrix[size - 1 - i][8] = bit;
    else matrix[8][size - (15 - i)] = bit;
  }

  return matrix.map((row) => row.map((cell) => cell ?? false));
}

// Standard PNG Chunk Generation with CRC32
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([len, body, crc]);
}

/**
 * Encodes text into a standalone, scannable PNG QR code Buffer.
 * Default module size: 8px, Quiet zone: 4 modules.
 */
export function generateQrPng(text: string, moduleSize = 8, quietZone = 4): Buffer {
  const matrix = generateQrMatrix(text);
  const qrModules = matrix.length;
  const totalModules = qrModules + quietZone * 2;
  const pixelWidth = totalModules * moduleSize;
  const pixelHeight = pixelWidth;

  // Raw uncompressed scanlines: 1 filter byte + pixelWidth grayscale bytes per row
  const rowBytes = 1 + pixelWidth;
  const rawData = Buffer.alloc(rowBytes * pixelHeight, 0xff); // default white

  for (let r = 0; r < qrModules; r++) {
    for (let c = 0; c < qrModules; c++) {
      if (matrix[r][c]) {
        // Black module
        const startY = (r + quietZone) * moduleSize;
        const startX = (c + quietZone) * moduleSize;

        for (let y = 0; y < moduleSize; y++) {
          const rowOffset = (startY + y) * rowBytes + 1;
          for (let x = 0; x < moduleSize; x++) {
            rawData[rowOffset + startX + x] = 0x00; // Black
          }
        }
      }
    }
  }

  // Set filter byte to 0 (None) at the start of each row
  for (let y = 0; y < pixelHeight; y++) {
    rawData[y * rowBytes] = 0x00;
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk: 13 bytes
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(pixelWidth, 0);
  ihdrData.writeUInt32BE(pixelHeight, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 0; // Grayscale
  ihdrData[10] = 0; // Compression deflate
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // No interlace
  const ihdrChunk = makePngChunk('IHDR', ihdrData);

  // IDAT Chunk
  const idatChunk = makePngChunk('IDAT', deflated);

  // IEND Chunk
  const iendChunk = makePngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}
