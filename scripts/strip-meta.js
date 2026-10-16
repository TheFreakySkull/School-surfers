// Чистка метаданных у картинок: PNG-тексты/EXIF, JPEG APPn/COM, WebP EXIF/XMP/ICCP.
// Пиксели не трогает. Использование: node scripts/strip-meta.js sprites
import { readFileSync, writeFileSync } from 'fs';

const table = new Uint8Array(0);
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
void table;

function stripPng(buf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error('not a PNG');
  const keep = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'gAMA', 'cHRM', 'sRGB']);
  const out = [sig];
  let pos = 8, dropped = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const end = pos + 12 + len;
    if (keep.has(type)) {
      out.push(buf.subarray(pos, end));
    } else {
      dropped += len;
    }
    if (type === 'IEND') break;
    pos = end;
  }
  return { data: Buffer.concat(out), dropped };
}

function stripJpeg(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) throw new Error('not a JPEG');
  const out = [buf.subarray(0, 2)];
  let pos = 2, dropped = 0;
  while (pos < buf.length) {
    if (buf[pos] !== 0xFF) { pos++; continue; }
    const m = buf[pos + 1];
    if (m === 0xD9) { out.push(buf.subarray(pos)); break; } // EOI
    if (m === 0xD8 || (m >= 0xD0 && m <= 0xD7) || m === 0x01) { out.push(buf.subarray(pos, pos + 2)); pos += 2; continue; }
    const len = buf.readUInt16BE(pos + 2);
    const end = pos + 2 + len;
    if ((m >= 0xE0 && m <= 0xEF) || m === 0xFE) dropped += len; // APPn, COM
    else out.push(buf.subarray(pos, end));
    if (m === 0xDA) { out.push(buf.subarray(end)); break; } // SOS: остальное — скан
    pos = end;
  }
  return { data: Buffer.concat(out), dropped };
}

function stripWebp(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not WebP');
  const chunks = [];
  let pos = 12, dropped = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const end = pos + 8 + size + (size % 2);
    if (id === 'EXIF' || id === 'XMP ' || id === 'ICCP') dropped += size;
    else chunks.push(buf.subarray(pos, end));
    pos = end;
  }
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  buf.copy(head, 0, 0, 12);
  head.writeUInt32LE(body.length + 4, 4);
  return { data: Buffer.concat([head, body]), dropped };
}

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node scripts/strip-meta.js <files...>'); process.exit(1); }
for (const f of files) {
  try {
    const buf = readFileSync(f);
    let r;
    if (f.endsWith('.png')) r = stripPng(buf);
    else if (/\.jpe?g$/i.test(f)) r = stripJpeg(buf);
    else if (f.endsWith('.webp')) r = stripWebp(buf);
    else { console.log(`SKIP ${f} (unknown type)`); continue; }
    if (r.dropped > 0) writeFileSync(f, r.data);
    console.log(`${r.dropped > 0 ? 'CLEAN' : 'ok   '} ${f}  ${buf.length} -> ${r.data.length} bytes (meta -${r.dropped})`);
  } catch (e) {
    console.log(`FAIL ${f}: ${e.message}`);
  }
}
