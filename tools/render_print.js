// Print files: QR sticker (60x80 mm) and business card (90x50 mm + 2 mm bleed) -> PNG 300 dpi, PDF, A4 sheets.
// node tools/render_print.js <fontsDir>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const F = process.argv[2], ROOT = path.join(__dirname, '..'), P = p => path.join(ROOT, 'print', p);
const b64 = p => fs.readFileSync(p).toString('base64');
const font = (fam, w, file, uni) => `@font-face{font-family:${fam};font-weight:${w};src:url(data:font/woff2;base64,${b64(path.join(F, file))})${uni ? ';unicode-range:U+0400-04FF' : ''}}`;
let fonts = '';
for (const [fams, pkg, pre, ws] of [[['Osw', 'Oswald'], 'fontsource-oswald-5.0.0', 'oswald', [600, 700]], [['PMono', 'IBM Plex Mono'], 'fontsource-ibm-plex-mono-5.0.0', 'ibm-plex-mono', [600]], [['Plex', 'IBM Plex Sans'], 'fontsource-ibm-plex-sans-5.0.0', 'ibm-plex-sans', [400, 500, 600, 700]]])
  for (const fam of fams) for (const w of ws) { const f = fam.includes(' ') ? `"${fam}"` : fam; fonts += font(f, w, `${pkg}/files/${pre}-latin-${w}-normal.woff2`) + font(f, w, `${pkg}/files/${pre}-cyrillic-${w}-normal.woff2`, 1); }
const MM = 300 / 25.4; // px per mm at 300 dpi
(async () => {
  const b = await chromium.launch();
  // ---- sticker ----
  let st = fs.readFileSync(P('sticker.html'), 'utf8').replace(/<link[^>]+fonts\.googleapis[^>]+>/g, '').replace('<style>', '<style>' + fonts);
  let p = await b.newPage({ viewport: { width: Math.round(60 * 3.7795), height: Math.round(80 * 3.7795) }, deviceScaleFactor: MM / 3.7795 });
  await p.setContent(st); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: P('sticker-300dpi.png') });
  await p.pdf({ path: P('sticker.pdf'), width: '60mm', height: '80mm', printBackground: true });
  const stPng = 'data:image/png;base64,' + b64(P('sticker-300dpi.png'));
  const crop = `.c{position:absolute;background:#000}`;
  const sheet = (img, w, h, cols, rows, gap) => {
    const W = 210, H = 297, x0 = (W - cols * w - (cols - 1) * gap) / 2, y0 = (H - rows * h - (rows - 1) * gap) / 2; let s = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = x0 + c * (w + gap), y = y0 + r * (h + gap); s += `<img src="${img}" style="position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm">`; }
    // crop marks on outer edges
    for (let c = 0; c <= cols; c++) for (const e of [c * (w + gap), c * (w + gap) - gap]) { if (e < 0 || e > cols * w + (cols - 1) * gap) continue; s += `<i class="c" style="left:${x0 + e - .1}mm;top:${y0 - 6}mm;width:.2mm;height:4mm"></i><i class="c" style="left:${x0 + e - .1}mm;top:${y0 + rows * h + (rows - 1) * gap + 2}mm;width:.2mm;height:4mm"></i>`; }
    for (let r = 0; r <= rows; r++) for (const e of [r * (h + gap), r * (h + gap) - gap]) { if (e < 0 || e > rows * h + (rows - 1) * gap) continue; s += `<i class="c" style="top:${y0 + e - .1}mm;left:${x0 - 6}mm;height:.2mm;width:4mm"></i><i class="c" style="top:${y0 + e - .1}mm;left:${x0 + cols * w + (cols - 1) * gap + 2}mm;height:.2mm;width:4mm"></i>`; }
    return `<div style="position:relative;width:210mm;height:297mm;overflow:hidden;break-after:page">${s}</div>`;
  };
  const a4 = async (pages, out) => { const q = await b.newPage(); await q.setContent(`<!doctype html><html><head><style>@page{size:A4;margin:0}*{margin:0;padding:0}${crop}</style></head><body>${pages.join('')}</body></html>`); await q.pdf({ path: out, format: 'A4', printBackground: true }); await q.close(); };
  await a4([sheet(stPng, 60, 80, 3, 3, 4)], P('stickers-A4.pdf'));
  // ---- business card ----
  const qr = fs.readFileSync(P('vizitka/qr-flat.svg'), 'utf8'); // flat (no 3D shadows): reads better at 33 mm
  const vz = fs.readFileSync(P('vizitka/vizitka.html'), 'utf8').replace('/*FONTS*/', fonts).replace('/*QR*/', qr);
  p = await b.newPage({ viewport: { width: Math.round(94 * 3.7795), height: Math.round(54 * 3.7795) }, deviceScaleFactor: MM / 3.7795 });
  await p.setContent(vz); await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: P('vizitka/vizitka-94x54-bleed.pdf'), width: '94mm', height: '54mm', printBackground: true });
  const shots = {};
  for (const side of ['front', 'back']) {
    const el = await p.$('.' + side); const f = P(`vizitka/vizitka-${side}-300dpi.png`); await el.screenshot({ path: f }); shots[side] = f;
  }
  // A4 for home printing: trim bleed (2 mm) -> 90x50, 2 x 5 cards, page 1 fronts, page 2 backs mirrored horizontally for duplex
  const trim = async (f) => { const q = await b.newPage({ viewport: { width: Math.round(90 * MM), height: Math.round(50 * MM) } }); await q.setContent(`<body style="margin:0;overflow:hidden"><img src="data:image/png;base64,${b64(f)}" style="margin:-${2 * MM}px 0 0 -${2 * MM}px;width:${94 * MM}px"></body>`); const o = f.replace('-300dpi.png', '-90x50.png'); await q.screenshot({ path: o }); await q.close(); return 'data:image/png;base64,' + b64(o); };
  const fr = await trim(shots.front), bk = await trim(shots.back);
  await a4([sheet(fr, 90, 50, 2, 5, 0), sheet(bk, 90, 50, 2, 5, 0)], P('vizitka/vizitki-A4-10sht.pdf'));
  await b.close();
  console.log(fs.readdirSync(P('vizitka')).join(' '));
})();
