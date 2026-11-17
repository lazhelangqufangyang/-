// 生成应用图标：程序化画一个杠铃片+横杠的浅底图标，再用 zlib 编成 PNG。
// 本机没有图像工具链，所以不下载任何图标素材，也不引入依赖。
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'images');
mkdirSync(outDir, { recursive: true });

const BG = [242, 245, 241, 255];
const ACCENT = [15, 122, 82, 255];
const PLATE = [198, 214, 203, 255];
const LINE = [26, 34, 30, 255];

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function px(buf, size, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function rect(buf, size, x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) px(buf, size, Math.round(x), Math.round(y), color);
}

function roundRect(buf, size, x0, y0, w, h, radius, color) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const inCorner =
        (x < x0 + radius && y < y0 + radius) ||
        (x > x0 + w - radius && y < y0 + radius) ||
        (x < x0 + radius && y > y0 + h - radius) ||
        (x > x0 + w - radius && y > y0 + h - radius);
      if (inCorner) {
        const cx = x < x0 + radius ? x0 + radius : x0 + w - radius;
        const cy = y < y0 + radius ? y0 + radius : y0 + h - radius;
        if (Math.hypot(x - cx, y - cy) > radius) continue;
      }
      px(buf, size, x, y, color);
    }
  }
}

function disc(buf, size, cx, cy, rOuter, rInner, color) {
  for (let y = Math.floor(cy - rOuter); y <= cy + rOuter; y += 1) {
    for (let x = Math.floor(cx - rOuter); x <= cx + rOuter; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= rOuter && d >= rInner) px(buf, size, x, y, color);
    }
  }
}

function draw(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = BG[0];
    buf[i + 1] = BG[1];
    buf[i + 2] = BG[2];
    buf[i + 3] = 255;
  }
  if (!maskable) roundRect(buf, size, 0, 0, size - 1, size - 1, size * 0.22, BG);

  // 内容缩到中心 60%（maskable 的安全区）
  const k = maskable ? 0.6 : 0.78;
  const w = size * k;
  const cx = size / 2;
  const cy = size / 2;
  const barH = w * 0.075;
  rect(buf, size, cx - w / 2, cy - barH / 2, w, barH, LINE);
  const plateH = w * 0.42;
  const plateW = w * 0.11;
  const innerH = w * 0.3;
  for (const s of [-1, 1]) {
    rect(buf, size, cx + (s * w) / 2 - (s > 0 ? plateW : 0), cy - plateH / 2, plateW, plateH, ACCENT);
    rect(buf, size, cx + (s * w) / 2 - (s > 0 ? plateW * 1.9 : 0) + s * plateW * 0.9, cy - innerH / 2, plateW * 0.8, innerH, PLATE);
    disc(buf, size, cx + (s * w) / 2 - (s > 0 ? plateW / 2 : -plateW / 2), cy, plateH * 0.02, 0, ACCENT);
  }
  rect(buf, size, cx - w * 0.06, cy - w * 0.008, w * 0.12, barH * 0.5, ACCENT);
  return buf;
}

for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-180.png', 180, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true]
]) {
  writeFileSync(join(outDir, name), encodePng(size, draw(size, maskable)));
  console.log('wrote', name, size);
}
