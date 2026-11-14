// node render.js <ios|android> <fontsDir> <siteScreenshot> <outDir> [preview t1,t2,...]
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const [OS, F, SITE, OUT, PREV] = process.argv.slice(2);
const R = p => path.join(__dirname, '..', '..', p);
const b64 = p => fs.readFileSync(p).toString('base64');
const font = (fam, w, file, uni) => `@font-face{font-family:${fam};font-weight:${w};src:url(data:font/woff2;base64,${b64(path.join(F, file))})${uni ? ';unicode-range:U+0400-04FF' : ''}}`;
let fonts = '';
for (const [fam, pkg, pre, ws] of [['Osw', 'fontsource-oswald-5.0.0', 'oswald', [700]], ['PMono', 'fontsource-ibm-plex-mono-5.0.0', 'ibm-plex-mono', [600]], ['Plex', 'fontsource-ibm-plex-sans-5.0.0', 'ibm-plex-sans', [400, 500, 600, 700]]])
  for (const w of ws) { fonts += font(fam, w, `${pkg}/files/${pre}-latin-${w}-normal.woff2`) + font(fam, w, `${pkg}/files/${pre}-cyrillic-${w}-normal.woff2`, 1); }
const IMG = { site: 'data:image/png;base64,' + b64(SITE), icon: 'data:image/png;base64,' + b64(R('icons/site-512.png')), logo: 'data:image/png;base64,' + b64(R('print/logo/logo-icon.png')) };
let html = fs.readFileSync(path.join(__dirname, 'howto.html'), 'utf8').replace('/*FONTS*/', fonts).replace('/*IMG*/{}', JSON.stringify(IMG)).replace("/*OS*/'ios'", JSON.stringify(OS));
function mux() {
  const wav = path.join(OUT, `audio-${OS}.wav`), mp4 = path.join(OUT, `howto-${OS}.mp4`), src = path.join(OUT, `silent-${OS}.mp4`);
  execFileSync('python3', [path.join(__dirname, 'synth.py'), path.join(OUT, `events-${OS}.json`), wav], { stdio: 'inherit' });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', mp4]);
  fs.rmSync(wav); fs.rmSync(path.join(OUT, `events-${OS}.json`));
}
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setContent(html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  if (errs.length) { console.error(errs); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const ev = await p.evaluate(() => EVENTS()); fs.writeFileSync(path.join(OUT, `events-${OS}.json`), JSON.stringify(ev));
  if (PREV === 'audio') { await b.close(); return mux(); }
  if (PREV) { for (const t of PREV.split(',')) { await p.evaluate(t => frame(t), +t); await p.screenshot({ path: path.join(OUT, `prev-${OS}-${t}.jpg`), type: 'jpeg', quality: 80 }); } await b.close(); return; }
  const dur = await p.evaluate(() => S.dur); const fps = 30, N = Math.round(dur * fps);
  const fd = path.join(OUT, 'frames-' + OS); fs.rmSync(fd, { recursive: true, force: true }); fs.mkdirSync(fd);
  for (let i = 0; i < N; i++) { await p.evaluate(t => frame(t), i / fps); await p.screenshot({ path: path.join(fd, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 }); }
  await b.close();
  const mp4 = path.join(OUT, `howto-${OS}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(fd, '%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, `silent-${OS}.mp4`)]);
  mux();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1.6', '-i', mp4, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', path.join(OUT, `howto-${OS}.jpg`)]);
  fs.rmSync(fd, { recursive: true, force: true });
  fs.rmSync(path.join(OUT, `silent-${OS}.mp4`)); console.log(mp4, (fs.statSync(mp4).size / 1e6).toFixed(2) + ' MB', N, 'frames');
})();
