// Generates WDIW extension icons with zero dependencies (Node's built-in zlib).
//
// Why hand-rolled: no ImageMagick/rsvg/sharp/canvas is available in this env, and
// Chrome extension icons must be raster (PNG). So we render the mark ourselves —
// a brand-purple rounded square with a white play triangle ("watch") — at a 4×
// supersample and box-downsample for clean anti-aliased edges, then encode PNG
// (truecolor+alpha) by hand. Reproducible: `node scripts/gen-icons.mjs`.
//
// Output: public/icons/wdiw-{16,32,48,128}.png

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersample factor

// Brand palette (matches options.css): gradient #7c3aed → #6d28d9.
const TOP = [124, 58, 237];
const BOTTOM = [109, 40, 217];
const MARK = [255, 255, 255];

// --- CRC32 (for PNG chunks) -------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// --- minimal PNG encoder (8-bit RGBA) ---------------------------------------
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor + alpha
  // 10-12: compression/filter/interlace = 0
  // Filtered scanlines: each row prefixed with filter byte 0 (None).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// --- geometry ---------------------------------------------------------------
function insideRoundRect(x, y, w, h, r) {
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
const edge = (px, py, ax, ay, bx, by) => (px - bx) * (ay - by) - (ax - bx) * (py - by);
function insideTriangle(px, py, a, b, c) {
  const d1 = edge(px, py, a[0], a[1], b[0], b[1]);
  const d2 = edge(px, py, b[0], b[1], c[0], c[1]);
  const d3 = edge(px, py, c[0], c[1], a[0], a[1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

// --- render one icon --------------------------------------------------------
function renderIcon(size) {
  const N = size * SS;
  // supersampled straight-RGBA buffer
  const big = new Uint8ClampedArray(N * N * 4);
  const r = N * 0.22; // corner radius
  // play triangle vertices (right-pointing), in supersampled space
  const tri = [
    [N * 0.37, N * 0.31],
    [N * 0.37, N * 0.69],
    [N * 0.685, N * 0.5],
  ];
  for (let y = 0; y < N; y++) {
    const t = y / (N - 1);
    const bg = [
      Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
      Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
      Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
    ];
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const px = x + 0.5;
      const py = y + 0.5;
      if (!insideRoundRect(px, py, N, N, r)) {
        big[i] = big[i + 1] = big[i + 2] = big[i + 3] = 0;
        continue;
      }
      const col = insideTriangle(px, py, tri[0], tri[1], tri[2]) ? MARK : bg;
      big[i] = col[0];
      big[i + 1] = col[1];
      big[i + 2] = col[2];
      big[i + 3] = 255;
    }
  }
  // box-downsample SS×SS → 1px, premultiplied so edges don't fringe.
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let A = 0;
      let R = 0;
      let G = 0;
      let B = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const si = ((y * SS + dy) * N + (x * SS + dx)) * 4;
          const a = big[si + 3];
          A += a;
          R += big[si] * a;
          G += big[si + 1] * a;
          B += big[si + 2] * a;
        }
      }
      const oi = (y * size + x) * 4;
      const n = SS * SS;
      out[oi + 3] = Math.round(A / n);
      if (A > 0) {
        out[oi] = Math.round(R / A);
        out[oi + 1] = Math.round(G / A);
        out[oi + 2] = Math.round(B / A);
      }
    }
  }
  return out;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(size, size, renderIcon(size));
  writeFileSync(join(OUT_DIR, `wdiw-${size}.png`), png);
  console.log(`wrote wdiw-${size}.png (${png.length} bytes)`);
}
