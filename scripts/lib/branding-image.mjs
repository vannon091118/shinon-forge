/**
 * branding-image.mjs — Eigentuemer: ein PNG lesen und einen Screenshot machen.
 *
 * Der Pixel-Beleg der Branding-Messung braucht beides: Chromium fotografiert die
 * Mess-Seite, und der Vergleich zweier Aufnahmen braucht echte Pixel — kein
 * `getComputedStyle`, das nur sagt, was erlaubt ist. Beide Schritte sind reine
 * Werkzeuge ohne Kenntnis der Marke; deshalb stehen sie hier.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

/** Ein PNG (8 Bit, RGB/RGBA) in `{ width, height, channels, pixels }` dekodieren. */
export function decodePng(buffer) {

    let pos = 8;
    let width = 0;
    let height = 0;
    let colorType = 0;
    let depth = 0;
    const idat = [];
    while (pos + 8 <= buffer.length) {
      const length = buffer.readUInt32BE(pos);
      const type = buffer.toString('latin1', pos + 4, pos + 8);
      const data = buffer.subarray(pos + 8, pos + 8 + length);
      if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; }
      if (type === 'IDAT') idat.push(data);
      pos += 12 + length;
    }
    const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
    if (channels === 0 || depth !== 8) throw new Error(`PNG-Format nicht unterstuetzt (colorType ${colorType}, depth ${depth})`);
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const pixels = Buffer.alloc(height * stride);
    let previous = Buffer.alloc(stride);
    for (let y = 0; y < height; y += 1) {
      const filter = raw[y * (stride + 1)];
      const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
      const current = Buffer.alloc(stride);
      for (let x = 0; x < stride; x += 1) {
        const a = x >= channels ? current[x - channels] : 0;
        const b = previous[x];
        const c = x >= channels ? previous[x - channels] : 0;
        let value = line[x];
        if (filter === 1) value += a;
        else if (filter === 2) value += b;
        else if (filter === 3) value += (a + b) >> 1;
        else if (filter === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value += pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
        }
        current[x] = value & 0xff;
      }
      current.copy(pixels, y * stride);
      previous = current;
    }
    return { width, height, channels, pixels };
}

/** Einen Screenshot der Seite machen und den PNG-Buffer zurueckgeben. */
export function shoot(browser, url, out) {

    execFileSync(BROWSER, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--hide-scrollbars', '--window-size=1280,800', '--virtual-time-budget=5000',
      `--screenshot=${out}`, url,
    ], { stdio: 'ignore', timeout: 120000 });
    return readFileSync(out);
}
