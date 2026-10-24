// Generates the app icons (a "+" on a rounded teal square) as PNGs with no dependencies.
// Usage: node scripts/make-icons.js
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [11, 114, 133, 255];
const FG = [255, 183, 3, 255];
const CLEAR = [0, 0, 0, 0];

// full: background fills the square (maskable); otherwise rounded corners.
function icon(size, { full = false, plusScale = 0.56 } = {}) {
  const radius = full ? 0 : size * 0.2;
  const arm = (size * plusScale) / 2;
  const thick = size * plusScale * 0.11;
  const c = size / 2;
  return png(size, (x, y) => {
    const dx = Math.max(radius - x, x - (size - radius), 0);
    const dy = Math.max(radius - y, y - (size - radius), 0);
    if (dx * dx + dy * dy > radius * radius) return CLEAR;
    const ax = Math.abs(x - c);
    const ay = Math.abs(y - c);
    if ((ax <= arm && ay <= thick) || (ay <= arm && ax <= thick)) return FG;
    return BG;
  });
}

mkdirSync('icons', { recursive: true });
writeFileSync('icons/icon-192.png', icon(192));
writeFileSync('icons/icon-512.png', icon(512));
writeFileSync('icons/icon-maskable-512.png', icon(512, { full: true, plusScale: 0.42 }));
console.log('icons written');
