import sharp from 'sharp';
import fs from 'fs';

const W = 900;
const H = 340;

const mascot = await sharp('public/greeting-mascot.png')
  .resize({ width: 210, height: 210, fit: 'inside' })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const fx = 18;
const fy = 78;
const fw = W - 36;
const fh = 240;
const r = 42;
const stroke = 7;

const d = [
  `M ${fx + r},${fy}`,
  `H ${fx + fw - r}`,
  `Q ${fx + fw},${fy} ${fx + fw},${fy + r}`,
  `V ${fy + fh - r}`,
  `Q ${fx + fw},${fy + fh} ${fx + fw - r},${fy + fh}`,
  `H ${fx + r}`,
  `Q ${fx},${fy + fh} ${fx},${fy + fh - r}`,
  `V ${fy + r}`,
  `Q ${fx},${fy} ${fx + r},${fy}`,
  'Z',
].join(' ');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <path d="${d}" fill="#e8f5fc" stroke="#1a4595" stroke-width="${stroke}" stroke-linejoin="round"/>
</svg>`;

const frame = await sharp(Buffer.from(svg)).png().toBuffer();

const mw = mascot.info.width;
const mh = mascot.info.height;
const mx = 8;
const my = Math.max(0, fy + 10 - mh + 32);

await sharp({
  create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([
    { input: frame, left: 0, top: 0 },
    {
      input: mascot.data,
      left: mx,
      top: my,
      raw: { width: mw, height: mh, channels: 4 },
    },
  ])
  .png()
  .toFile('public/greeting-shell.png');

console.log('ok', fs.statSync('public/greeting-shell.png').size, { mw, mh, mx, my });
