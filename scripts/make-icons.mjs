/* Generates the PWA icon set into public/.
   Run with: node scripts/make-icons.mjs

   Writes PNGs directly via zlib rather than pulling in an image
   library — the mark is two circle arcs, which is cheaper to rasterise
   by hand than to add sharp/canvas to the dependency tree.

   Mark: an orange leaf (the lens where two circles overlap, tilted 45°)
   on the app's ink background. "Orangeleaf". */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const INK = [10, 10, 12];       // #0A0A0C — matches the dark theme paper
const FLAME = [255, 122, 26];   // #FF7A1A
const FLAME_DEEP = [222, 91, 11];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array of size*size*4 → PNG buffer */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  // 10,11,12 = deflate / adaptive / no interlace, all zero

  // Each scanline is prefixed with a filter byte (0 = none).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const o = y * (size * 4 + 1);
    raw[o] = 0;
    rgba.copy ? rgba.copy(raw, o + 1, y * size * 4, (y + 1) * size * 4)
      : Buffer.from(rgba).copy(raw, o + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* Supersampled 3x so the curves come out smooth without any
   antialiasing maths of our own. */
const SS = 3;

function draw(size, { scale = 1, rounded = false }) {
  const S = size * SS;
  const buf = Buffer.alloc(size * size * 4);

  const cx = S / 2, cy = S / 2;
  // Leaf = intersection of two circles offset along the 45° diagonal.
  const R = S * 0.42 * scale;
  const off = R * 0.62;
  const dx = off * Math.SQRT1_2, dy = off * Math.SQRT1_2;
  const radius = S * 0.22; // for the rounded-square background

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x * SS + sx + 0.5;
          const py = y * SS + sy + 0.5;

          // Background — square, or rounded square for the apple icon
          let inBg = true;
          if (rounded) {
            const qx = Math.max(radius - px, px - (S - radius), 0);
            const qy = Math.max(radius - py, py - (S - radius), 0);
            inBg = qx * qx + qy * qy <= radius * radius;
          }
          if (!inBg) continue;

          const d1 = Math.hypot(px - (cx - dx), py - (cy + dy));
          const d2 = Math.hypot(px - (cx + dx), py - (cy - dy));
          const inLeaf = d1 <= R && d2 <= R;

          // Midrib: the line along the leaf's long axis
          const along = ((px - cx) + (py - cy)) * Math.SQRT1_2;
          const across = ((px - cx) - (py - cy)) * Math.SQRT1_2;
          const inVein = inLeaf && Math.abs(across) < S * 0.012
            && Math.abs(along) < R * 0.92;

          const c = inVein ? INK : inLeaf ? (along < 0 ? FLAME : FLAME_DEEP) : INK;
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }

      const n = SS * SS;
      const o = (y * size + x) * 4;
      buf[o] = Math.round(r / n);
      buf[o + 1] = Math.round(g / n);
      buf[o + 2] = Math.round(b / n);
      buf[o + 3] = Math.round(a / n);
    }
  }
  return buf;
}

mkdirSync('public', { recursive: true });

const targets = [
  // Maskable icons must keep their content inside the middle ~80%,
  // since the launcher may crop to a circle.
  { file: 'pwa-192.png', size: 192, opts: { scale: 1 } },
  { file: 'pwa-512.png', size: 512, opts: { scale: 1 } },
  { file: 'pwa-maskable-512.png', size: 512, opts: { scale: 0.72 } },
  { file: 'apple-touch-icon.png', size: 180, opts: { scale: 1, rounded: false } },
];

for (const t of targets) {
  writeFileSync(`public/${t.file}`, encodePng(t.size, draw(t.size, t.opts)));
  console.log(`wrote public/${t.file} (${t.size}×${t.size})`);
}
