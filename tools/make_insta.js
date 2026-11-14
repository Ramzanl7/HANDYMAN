// Instagram kit in the site style: highlight covers (1080x1920), pinned posts (1080x1350), story templates.
// node tools/make_insta.js <fontsDir>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const F = process.argv[2], ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'print/instagram');
const b64 = p => fs.readFileSync(p).toString('base64');
const font = (fam, w, file, uni) => `@font-face{font-family:${fam};font-weight:${w};src:url(data:font/woff2;base64,${b64(path.join(F, file))})${uni ? ';unicode-range:U+0400-04FF' : ''}}`;
let fonts = '';
for (const [fam, pkg, pre, ws] of [['Osw', 'fontsource-oswald-5.0.0', 'oswald', [700]], ['PMono', 'fontsource-ibm-plex-mono-5.0.0', 'ibm-plex-mono', [600]], ['Plex', 'fontsource-ibm-plex-sans-5.0.0', 'ibm-plex-sans', [400, 500, 600, 700]]])
  for (const w of ws) fonts += font(fam, w, `${pkg}/files/${pre}-latin-${w}-normal.woff2`) + font(fam, w, `${pkg}/files/${pre}-cyrillic-${w}-normal.woff2`, 1);
const img = n => 'data:image/webp;base64,' + b64(path.join(ROOT, 'img', n + '.webp'));
const PR = JSON.parse(fs.readFileSync(path.join(__dirname, 'prices-live.json'), 'utf8'));
const rub = n => Number(n).toLocaleString('ru-RU').replace(/\s/g, ' ') + ' ₽';
const unit = { 'Уложить ламинат': '/м²', 'Уложить линолеум': '/м²', 'Установить плинтус': '/м' };
const CSS = `${fonts}
*{margin:0;padding:0;box-sizing:border-box}
:root{--paper:#ece8df;--ink:#1d2a44;--ink2:#55607a;--y:#ffd400;--red:#d6281c}
body{font-family:Plex;color:var(--ink);overflow:hidden;position:relative}
.paper{background:var(--paper);background-image:linear-gradient(rgba(29,42,68,.07) 2px,transparent 2px),linear-gradient(90deg,rgba(29,42,68,.07) 2px,transparent 2px);background-size:54px 54px}
.navy{background:var(--ink);color:var(--paper);background-image:linear-gradient(rgba(255,255,255,.05) 2px,transparent 2px),linear-gradient(90deg,rgba(255,255,255,.05) 2px,transparent 2px);background-size:54px 54px}
.haz{position:absolute;left:0;right:0;height:24px;background:repeating-linear-gradient(-45deg,var(--ink) 0 20px,var(--y) 20px 40px)}
.navy .haz{background:repeating-linear-gradient(-45deg,#0f1830 0 20px,var(--y) 20px 40px)}
.logo{display:flex;align-items:center;gap:14px;font:700 32px/1 Osw;letter-spacing:.12em}
.logo i{width:66px;height:26px;border:3.5px solid currentColor;border-radius:15px;background:var(--y);position:relative;display:block}.logo i::after{content:"";position:absolute;left:22px;top:2.5px;width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid var(--ink)}
.sheet{font:600 24px/1 PMono;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2);display:flex;gap:14px;align-items:center}
.sheet::before{content:"";width:44px;height:3px;background:currentColor}
.navy .sheet{color:#aab3c7}
h1{font:700 150px/.9 Osw;text-transform:uppercase}
h1 .r{color:var(--red)}.navy h1 .r{color:var(--y)}
.foot{position:absolute;left:80px;right:80px;bottom:64px;display:flex;justify-content:space-between;align-items:center;font:600 26px/1 PMono;letter-spacing:.06em}
.tel{background:var(--ink);color:var(--y);font:700 44px/1 Osw;padding:18px 24px;box-shadow:8px 8px 0 var(--y),8px 8px 0 3px var(--ink)}
.navy .tel{background:var(--y);color:var(--ink);box-shadow:8px 8px 0 #0f1830,8px 8px 0 3px var(--paper)}
.pg{position:absolute;right:80px;top:80px;font:600 24px/1 PMono;color:var(--ink2);letter-spacing:.1em}
`;
// ---------- icons (stroke, 200x200 viewBox) ----------
const IC = {
  price: '<path d="M30 100 L100 30 H170 V100 L100 170 Z" /><circle cx="138" cy="62" r="12"/><path d="M84 86v52M72 98h30a14 14 0 0 1 0 28H72M72 116h36"/>',
  works: '<rect x="34" y="40" width="132" height="120" rx="8"/><path d="M62 104l26 26 52-56"/>',
  reviews: '<path d="M100 28l21 44 48 6-35 33 9 48-43-23-43 23 9-48-35-33 48-6z"/>',
  order: '<rect x="44" y="34" width="112" height="136" rx="6"/><path d="M76 34v-8h48v8"/><path d="M68 80l10 10 18-20M108 82h28M68 120l10 10 18-20M108 122h28"/>',
  shield: '<path d="M100 26l62 22v48c0 40-28 66-62 78-34-12-62-38-62-78V48z"/><path d="M72 100l20 20 38-40"/>',
  me: '<rect x="20" y="74" width="160" height="52" rx="26"/><path d="M78 74v52M122 74v52"/><ellipse cx="100" cy="100" rx="14" ry="11"/>',
  map: '<path d="M100 172s-52-52-52-92a52 52 0 0 1 104 0c0 40-52 92-52 92z"/><circle cx="100" cy="80" r="18"/>',
};
const svg = (k, c = '#ffd400', w = 10) => `<svg viewBox="0 0 200 200" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`;
// ---------- highlight covers ----------
const COVERS = [['price', 'Цены'], ['works', 'Работы'], ['reviews', 'Отзывы'], ['order', 'Заказ'], ['shield', 'Гарантия'], ['me', 'О мастере'], ['map', 'Районы']];
const cover = ([k, t]) => `<body class="navy" style="width:1080px;height:1920px"><div style="position:absolute;left:50%;top:50%;width:620px;height:620px;margin:-310px;border-radius:50%;border:8px solid #ffd400;display:grid;place-items:center;box-shadow:inset 0 0 0 26px #1d2a44,inset 0 0 0 30px rgba(255,212,0,.35)"><div style="width:340px;height:340px">${svg(k)}</div></div><div style="position:absolute;left:0;right:0;top:1330px;text-align:center;font:700 64px/1 Osw;letter-spacing:.12em;text-transform:uppercase;color:#ece8df">${t}</div></body>`;
// ---------- posts 1080x1350 ----------
const P = [];
P.push(['post1-intro', `<body class="paper" style="width:1080px;height:1350px"><div class="haz" style="top:0"></div>
<div style="position:absolute;left:80px;top:90px" class="logo"><i></i>HANDYMAN</div><div class="pg">ГРОЗНЫЙ</div>
<div style="position:absolute;left:80px;top:190px"><div class="sheet">Мастер по дому · 5 лет</div><h1 style="margin-top:26px;font-size:124px">Рамзан.<br>Мастер<br><span class="r">по дому.</span></h1>
<p style="font:400 34px/1.4 Plex;color:#2f3a55;margin-top:34px;width:500px">Электрика, сантехника, мебель, полы, двери. Работаю один: трубку беру я, приезжаю тоже я.</p></div>
${[['wardrobe-arch', 690, 150, 3, 'ШКАФ ✓'], ['crystal-after', 650, 490, -4, 'ЛЮСТРА ✓'], ['room-after', 700, 830, 2, 'ЛАМИНАТ ✓']].map(([n, x, y, r, c]) => `<div style="position:absolute;left:${x}px;top:${y}px;width:290px;background:#fff;padding:12px 12px 46px;transform:rotate(${r}deg);box-shadow:0 14px 30px rgba(29,42,68,.25);border:2px solid rgba(29,42,68,.15)"><img src="${img(n)}" style="width:100%;height:270px;object-fit:cover;display:block"><div style="position:absolute;left:0;right:0;bottom:12px;text-align:center;font:600 22px/1 PMono;letter-spacing:.08em">${c}</div></div>`).join('')}
<div class="foot"><div class="tel">8 963 599-36-01</div><span>handyman-grozny.ru</span></div></body>`]);
const cats = {}; PR.forEach(p => (cats[p.cat_title] = cats[p.cat_title] || []).push(p));
const pricePage = (groups, n, total) => `<body class="paper" style="width:1080px;height:1350px"><div class="haz" style="top:0"></div>
<div style="position:absolute;left:80px;top:90px" class="logo"><i></i>HANDYMAN</div><div class="pg">ПРАЙС · ${n}/${total}</div>
<div style="position:absolute;left:80px;right:80px;top:180px;background:#fff8e6;border:4px solid var(--ink);box-shadow:14px 14px 0 var(--y),14px 14px 0 4px var(--ink);padding:34px 40px">
${groups.map(g => `<div style="font:700 50px/1 Osw;text-transform:uppercase;margin:${g === groups[0] ? 0 : 30}px 0 10px">${g}</div>${cats[g].map(p => `<div style="display:flex;align-items:baseline;gap:14px;padding:13px 0;border-bottom:2px dotted rgba(29,42,68,.3);font:500 30px/1.15 Plex"><span>${p.name.replace(' — опишу в комментарии', '')}</span><span style="flex:1"></span><b style="font:600 27px/1 PMono;white-space:nowrap">от ${rub(p.price_from)}${unit[p.name] || ''}</b></div>`).join('')}`).join('')}
</div><div class="foot" style="bottom:56px"><span style="font:500 24px/1.3 Plex;letter-spacing:0;color:#55607a;width:560px">Цены «от». Точную стоимость называю до начала работы — по фото или на месте.</span><span>handyman-grozny.ru</span></div></body>`;
P.push(['post2-price-1', `<body class="navy" style="width:1080px;height:1350px"><div class="haz" style="top:0"></div>
<div style="position:absolute;left:80px;top:90px" class="logo"><i></i>HANDYMAN</div><div class="pg" style="color:#aab3c7">ЛИСТАЙТЕ →</div>
<div style="position:absolute;left:80px;top:250px"><div class="sheet">Грозный · 2026</div><h1 style="margin-top:30px;font-size:210px">Прайс<br><span class="r">мастера</span></h1>
<p style="font:400 36px/1.4 Plex;color:#aab3c7;margin-top:40px;width:820px">Электрика, сантехника, сборка мебели, полы, двери и мелкий ремонт. Цена — до начала работы, без сюрпризов.</p></div>
<div style="position:absolute;right:80px;top:200px;width:200px;height:200px">${svg('price')}</div>
<div class="foot"><div class="tel">8 963 599-36-01</div><span style="color:#aab3c7">handyman-grozny.ru</span></div></body>`]);
const pp = [['Электрика', 'Сантехника'], ['Сборка мебели', 'Полы'], ['Двери', 'Слаботочка', 'Мелкий ремонт', 'Другое']];
pp.forEach((g, i) => P.push([`post2-price-${i + 2}`, pricePage(g, i + 1, pp.length)]));
P.push(['post3-how', `<body class="paper" style="width:1080px;height:1350px"><div class="haz" style="top:0"></div>
<div style="position:absolute;left:80px;top:90px" class="logo"><i></i>HANDYMAN</div><div class="pg">НАРЯД-ЗАКАЗ</div>
<div style="position:absolute;left:80px;right:80px;top:190px"><div class="sheet">Как заказать</div><h1 style="margin-top:22px;font-size:132px">Три шага —<br><span class="r">и готово</span></h1>
${[['Напишите задачу', 'В WhatsApp, Direct или на сайте. Можно сразу фото — так быстрее посчитаю.'], ['Узнайте цену', 'Называю стоимость до начала работы. Если на месте окажется сложнее — сначала скажу.'], ['Я приезжаю', 'Со своим инструментом. Делаю, убираю за собой. Если что-то не так — переделаю.']].map(([a, b], i) => `<div style="display:grid;grid-template-columns:110px 1fr;gap:28px;align-items:start;margin-top:${i ? 34 : 50}px"><div style="height:110px;border:4px solid var(--ink);background:var(--y);display:grid;place-items:center;font:700 70px/1 Osw">${i + 1}</div><div><div style="font:700 50px/1 Osw;text-transform:uppercase">${a}</div><div style="font:400 30px/1.35 Plex;color:#2f3a55;margin-top:10px">${b}</div></div></div>`).join('')}</div>
<div class="foot"><div class="tel">8 963 599-36-01</div><span>handyman-grozny.ru</span></div></body>`]);
// ---------- story templates 1080x1920 ----------
const S = [];
S.push(['story-done', `<body class="paper" style="width:1080px;height:1920px"><div class="haz" style="top:0"></div><div class="haz" style="bottom:0"></div>
<div style="position:absolute;left:80px;top:110px" class="logo"><i></i>HANDYMAN</div>
<div style="position:absolute;left:80px;top:220px"><div class="sheet">Работа сделана</div><div style="font:700 120px/.95 Osw;text-transform:uppercase;margin-top:20px">Готово <span style="color:var(--red)">✓</span></div></div>
<div style="position:absolute;left:80px;right:80px;top:470px;height:1050px;border:5px dashed rgba(29,42,68,.35);display:grid;place-items:center;font:600 30px/1.4 PMono;color:#8a92a6;text-align:center">МЕСТО ДЛЯ ФОТО<br>(наложите своё фото поверх)</div>
<div style="position:absolute;left:80px;bottom:120px" class="tel">8 963 599-36-01</div><div style="position:absolute;right:80px;bottom:140px;font:600 28px/1 PMono">handyman-grozny.ru</div></body>`]);
S.push(['story-free', `<body class="navy" style="width:1080px;height:1920px"><div class="haz" style="top:0"></div><div class="haz" style="bottom:0"></div>
<div style="position:absolute;left:80px;top:110px" class="logo"><i></i>HANDYMAN</div>
<div style="position:absolute;left:80px;right:80px;top:560px"><div class="sheet">Расписание</div><h1 style="margin-top:30px;font-size:170px">Есть<br>свободное<br><span class="r">окно</span></h1>
<p style="font:400 44px/1.4 Plex;color:#aab3c7;margin-top:46px">Завтра могу приехать. Пишите, что нужно сделать — скажу цену сразу.</p></div>
<div style="position:absolute;left:80px;bottom:140px" class="tel">8 963 599-36-01</div></body>`]);
S.push(['story-review', `<body class="paper" style="width:1080px;height:1920px"><div class="haz" style="top:0"></div><div class="haz" style="bottom:0"></div>
<div style="position:absolute;left:80px;top:110px" class="logo"><i></i>HANDYMAN</div>
<div style="position:absolute;left:80px;top:220px"><div class="sheet">Отзыв клиента</div><div style="font:700 150px/1 Osw;color:var(--y);-webkit-text-stroke:4px var(--ink);margin-top:20px;letter-spacing:.05em">★★★★★</div></div>
<div style="position:absolute;left:80px;right:80px;top:520px;height:1000px;background:#fff8e6;border:4px solid var(--ink);box-shadow:14px 14px 0 var(--y),14px 14px 0 4px var(--ink);display:grid;place-items:center;font:600 30px/1.4 PMono;color:#8a92a6;text-align:center">СКРИНШОТ ОТЗЫВА<br>(наложите поверх)</div>
<div style="position:absolute;left:80px;bottom:120px" class="tel">8 963 599-36-01</div></body>`]);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const shot = async (name, html, w, h) => { const p = await b.newPage({ viewport: { width: w, height: h } }); await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>${html}</html>`); await p.evaluate(() => document.fonts.ready); await p.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 92 }); await p.close(); };
  for (const c of COVERS) await shot('highlight-' + c[1].toLowerCase().replace(/\s/g, '-'), cover(c), 1080, 1920);
  for (const [n, h] of P) await shot(n, h, 1080, 1350);
  for (const [n, h] of S) await shot(n, h, 1080, 1920);
  await b.close(); console.log(fs.readdirSync(OUT).join('\n'));
})();
