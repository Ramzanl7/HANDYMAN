// node render_reels.js <fontsDir> <outDir> [preview t1,t2|only:id]
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const [F, OUT, ARG] = process.argv.slice(2); const ROOT = path.join(__dirname, '..', '..');
const b64 = p => fs.readFileSync(p).toString('base64');
const font = (fam, w, file, uni) => `@font-face{font-family:${fam};font-weight:${w};src:url(data:font/woff2;base64,${b64(path.join(F, file))})${uni ? ';unicode-range:U+0400-04FF' : ''}}`;
let fonts = '';
for (const [fam, pkg, pre, ws] of [['Osw', 'fontsource-oswald-5.0.0', 'oswald', [700]], ['PMono', 'fontsource-ibm-plex-mono-5.0.0', 'ibm-plex-mono', [600]], ['Plex', 'fontsource-ibm-plex-sans-5.0.0', 'ibm-plex-sans', [400, 500, 600, 700]]])
  for (const w of ws) fonts += font(fam, w, `${pkg}/files/${pre}-latin-${w}-normal.woff2`) + font(fam, w, `${pkg}/files/${pre}-cyrillic-${w}-normal.woff2`, 1);
const webp = n => 'data:image/webp;base64,' + b64(path.join(ROOT, 'img', n + '.webp'));
const REELS = [
  { id: 'lyustra', title: 'Хрустальная<br>люстра', before: 'Голый потолок, из него торчит крюк.', after: 'Люстра висит ровно, все лампы горят.', b: 'crystal-before', a: 'crystal-after', price: ['Повесить люстру / светильник', 'от 1 490 <small>₽</small>'] },
  { id: 'led-lyustra', title: 'LED-люстра', before: 'Провода и плата наружу, ничего не горит.', after: 'Собрана, подключена, светит.', b: 'light-before', a: 'light-after', price: ['Повесить люстру / светильник', 'от 1 490 <small>₽</small>'] },
  { id: 'laminat', title: 'Ламинат<br>в комнате', before: 'Старый пол с облезлой краской.', after: 'Ровный ламинат и плинтус по периметру.', b: 'room-before', a: 'room-after', price: ['Уложить ламинат', 'от 480 <small>₽/м²</small>'] },
  { id: 'televizor', title: 'Телевизор<br>на стену', before: 'Кронштейн на стене, телевизор в коробке.', after: 'Телевизор на стене, ровно по уровню.', b: 'tv-before', a: 'tv-after', price: ['Повесить ТВ на стену', 'от 1 650 <small>₽</small>'] },
  { id: 'krovat', title: 'Сборка<br>кровати', before: 'Детали на полу, инструкции нет.', after: 'Кровать собрана и стоит на месте.', b: 'bed-before', a: 'bed-after', price: ['Собрать кровать', 'от 1 450 <small>₽</small>'] },
  { id: 'komod', title: 'Сборка<br>комода', before: 'Корпус без ящиков.', after: 'Ящики стоят и ходят плавно.', b: 'chest-before', a: 'chest-after', price: ['Собрать комод / тумбу', 'от 1 450 <small>₽</small>'] },
  { id: 'mebel', gallery: true, title: 'Сборка<br>мебели', items: [['wardrobe-arch', 'Шкаф ✓', 'Шкаф с арочными зеркалами.'], ['wardrobe-gold', 'Шкаф ✓', 'Шкаф во всю стену, с золотыми ручками.'], ['kitchen', 'Кухня ✓', 'Кухонный гарнитур с мойкой.'], ['desk', 'Столик ✓', 'Туалетный столик с ящиками.']], price: ['Сборка мебели', 'от 1 350 <small>₽</small>'] },
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(); let p;
  const only = ARG && ARG.startsWith('only:') ? ARG.slice(5).split(',') : null, prev = ARG && !only ? ARG.split(',') : null;
  for (const R of REELS) {
    if (only && !only.includes(R.id)) continue;
    const IMG = { logo: 'data:image/png;base64,' + b64(path.join(ROOT, 'icons/site-512.png')) };
    if (R.gallery) R.items.forEach(x => IMG[x[0]] = webp(x[0])); else { IMG.before = webp(R.b); IMG.after = webp(R.a); }
    const html = fs.readFileSync(path.join(__dirname, 'reels.html'), 'utf8').replace('/*FONTS*/', fonts).replace('/*REEL*/{}', JSON.stringify(R)).replace('/*IMG*/{}', JSON.stringify(IMG));
    if (p) await p.close(); p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.setContent(html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
    if (errs.length) { console.error(R.id, errs); process.exit(1); }
    if (prev) { for (const t of prev) { await p.evaluate(t => frame(t), +t); await p.screenshot({ path: path.join(OUT, `prev-${R.id}-${t}.jpg`), type: 'jpeg', quality: 70 }); } continue; }
    const ev = await p.evaluate(() => EVENTS()); const fps = 30, N = Math.round(ev.dur * fps);
    const fd = path.join(OUT, 'fr-' + R.id); fs.rmSync(fd, { recursive: true, force: true }); fs.mkdirSync(fd);
    for (let i = 0; i < N; i++) { await p.evaluate(t => frame(t), i / fps); await p.screenshot({ path: path.join(fd, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 90 }); }
    const evf = path.join(OUT, R.id + '.json'), wav = path.join(OUT, R.id + '.wav'), mp4 = path.join(OUT, `reel-${R.id}.mp4`);
    fs.writeFileSync(evf, JSON.stringify(ev)); execFileSync('python3', [path.join(__dirname, 'synth.py'), evf, wav]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(fd, '%05d.jpg'), '-i', wav, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', mp4]);
    fs.rmSync(fd, { recursive: true, force: true }); fs.rmSync(evf); fs.rmSync(wav);
    console.log(mp4, (fs.statSync(mp4).size / 1e6).toFixed(2) + ' MB');
  }
  await b.close();
})();
