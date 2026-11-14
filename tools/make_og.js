// Link-preview cards (1200x630) for every page: node tools/make_og.js <fontsDir>
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const F = process.argv[2], ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'img/og');
const b64 = p => fs.readFileSync(p).toString('base64');
const font = (fam, w, file, uni) => `@font-face{font-family:${fam};font-weight:${w};src:url(data:font/woff2;base64,${b64(path.join(F, file))})${uni ? ';unicode-range:U+0400-04FF' : ''}}`;
let fonts = '';
for (const [fam, pkg, pre, ws] of [['Osw', 'fontsource-oswald-5.0.0', 'oswald', [700]], ['PMono', 'fontsource-ibm-plex-mono-5.0.0', 'ibm-plex-mono', [600]], ['Plex', 'fontsource-ibm-plex-sans-5.0.0', 'ibm-plex-sans', [400, 500, 600]]])
  for (const w of ws) fonts += font(fam, w, `${pkg}/files/${pre}-latin-${w}-normal.woff2`) + font(fam, w, `${pkg}/files/${pre}-cyrillic-${w}-normal.woff2`, 1);
const img = n => 'data:image/webp;base64,' + b64(path.join(ROOT, 'img', n + '.webp'));
const png = p => 'data:image/png;base64,' + b64(path.join(ROOT, p));
const PRICES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/prices.json'), 'utf8'));
const rub = n => Number(n).toLocaleString('ru-RU').replace(/\s/g, '\u00a0') + '\u00a0₽';
const minOf = cat => Math.min(...PRICES.filter(p => p.cat === cat && p.price_from).map(p => p.price_from));
const slipOf = (cat, n = 4) => PRICES.filter(p => p.cat === cat && p.price_from).slice(0, n).map(p => [p.name, 'от ' + rub(p.price_from)]);
const CATS = [['el', 'Электрика'], ['pl', 'Сантехника'], ['mb', 'Сборка мебели'], ['fl', 'Полы'], ['dr', 'Двери'], ['lv', 'Интернет и ТВ'], ['sm', 'Мелкий ремонт']];
const CARDS = [
  ['elektrik-grozny', ['Электрик', 'на дом', 'в Грозном'], 'Розетки, выключатели, люстры, кабель. Цены от ' + rub(minOf('el')) + '.', { photo: 'crystal-after', tag: 'ЛЮСТРА — ПОДКЛЮЧЕНА ✓' }],
  ['santehnik-grozny', ['Сантехник', 'на дом', 'в Грозном'], 'Смесители, унитазы, сифоны, протечки. Цены от ' + rub(minOf('pl')) + '.', { slip: slipOf('pl') }],
  ['sborka-mebeli-grozny', ['Сборка', 'мебели', 'в Грозном'], 'Шкафы, кухни, кровати, комоды. Цены от ' + rub(minOf('mb')) + '.', { photo: 'wardrobe-gold', tag: 'ШКАФ — СОБРАН ✓' }],
  ['ukladka-laminata-grozny', ['Ламинат', 'и линолеум', 'в Грозном'], 'Укладка покрытий и плинтусов. Цены от ' + rub(minOf('fl')) + ' за м².', { photo: 'room-after', tag: 'ЛАМИНАТ — УЛОЖЕН ✓' }],
  ['dveri-grozny', ['Ремонт', 'дверей', 'в Грозном'], 'Регулировка, ручки, петли, замки. Цены от ' + rub(minOf('dr')) + '.', { photo: 'office-door', tag: 'ДВЕРЬ — ГОТОВО ✓' }],
  ['internet-kabel-grozny', ['Интернет', 'и ТВ-кабель', 'в Грозном'], 'Кабель, роутер, Wi‑Fi, антенна. Цены от ' + rub(minOf('lv')) + '.', { slip: [['Интернет-кабель', 'от ' + rub(350)], ['Роутер и Wi‑Fi', 'по договорённости'], ['ТВ / спутник', 'по договорённости'], ['Кабели и разъёмы', 'от ' + rub(350)]] }],
  ['muzh-na-chas-grozny', ['Муж', 'на час', 'в Грозном'], 'Телевизор на стену, полки, карнизы, зеркала. Мелкий ремонт.', { photo: 'tv-after', tag: 'ТВ — НА СТЕНЕ ✓' }],
  ['ustanovka-tehniki-grozny', ['Установка', 'техники', 'в Грозном'], 'Подключение бытовой техники, монтаж и демонтаж.', { photo: 'kitchen', tag: 'КУХНЯ — СОБРАНА ✓' }],
  ['uslugi', ['Все услуги', 'мастера', 'по дому'], 'Один мастер на все домашние задачи. Цена — до начала работ.', { slip: CATS.map(([c, t]) => [t, 'от ' + rub(minOf(c))]).slice(0, 6), slipTitle: 'Прайс' }],
  ['app', ['Handyman', 'на экране', 'телефона'], 'Как добавить значок на iPhone и Android — видео на 20 секунд.', { app: true }],
  ['garantiya', ['Гарантийный', 'талон', 'Handyman'], 'Если что-то не так — приеду и переделаю. Бесплатно.', { stamp: true }],
  ['admin', ['Панель', 'мастера', 'Handyman'], 'Заявки, работы, цены и отзывы. Вход по коду из Telegram.', { dark: true }],
];
const right = o => {
  if (o.photo) return `<div class="ph"><img src="${img(o.photo)}"><div class="tag">${o.tag}</div></div>`;
  if (o.slip) return `<div class="slip"><div class="st"><span>${o.slipTitle || 'Наряд'} № 01</span><span>ГРОЗНЫЙ</span></div><h3>${o.slipTitle ? 'Цены' : 'Задачи'}</h3>${o.slip.map(([a, b]) => `<div class="li"><i>✓</i><span>${a}</span><b>${b}</b></div>`).join('')}</div>`;
  if (o.app) return `<div class="app"><div class="scr"><div class="isl"></div>${Array.from({ length: 11 }, (_, i) => `<i style="background:${['#ff9f0a', '#30d158', '#64d2ff', '#bf5af2', '#ff453a', '#ffd60a', '#5e5ce6', '#ff375f', '#8e8e93', '#0a84ff', '#ac8e68'][i]}"></i>`).join('')}<img src="${png('icons/site-512.png')}"></div></div>`;
  if (o.stamp) return `<div class="tal"><div class="tt"><span>ТАЛОН № 0001</span><span>HANDYMAN</span></div><div class="ln"></div><div class="ln s"></div><div class="ln"></div><div class="ln s"></div><div class="stamp">ГАРАНТИЯ<small>МАСТЕР РАМЗАН</small></div></div>`;
  if (o.dark) return `<div class="adm"><img src="${png('icons/admin-512.png')}"></div>`;
};
const page = ([slug, t, sub, o]) => `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;font-family:Plex;color:#1d2a44;background:#ece8df;background-image:linear-gradient(rgba(29,42,68,.07) 1.5px,transparent 1.5px),linear-gradient(90deg,rgba(29,42,68,.07) 1.5px,transparent 1.5px);background-size:40px 40px;position:relative}
body.dark{background-color:#1d2a44;color:#ece8df;background-image:linear-gradient(rgba(255,255,255,.06) 1.5px,transparent 1.5px),linear-gradient(90deg,rgba(255,255,255,.06) 1.5px,transparent 1.5px)}
.haz{position:absolute;left:0;right:0;bottom:0;height:18px;background:repeating-linear-gradient(-45deg,#1d2a44 0 16px,#ffd400 16px 32px)}
.dark .haz{background:repeating-linear-gradient(-45deg,#0f1830 0 16px,#ffd400 16px 32px)}
.l{position:absolute;left:64px;top:62px;width:600px}
.logo{display:flex;align-items:center;gap:16px;font:700 30px/1 Osw;letter-spacing:.12em}
.logo i{width:66px;height:26px;border:3.5px solid currentColor;border-radius:15px;background:#ffd400;position:relative;display:block}.logo i::after{content:"";position:absolute;left:22px;top:2.5px;width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #1d2a44}
.dark .logo i{border-color:#ece8df}
h1{font:700 96px/.93 Osw;text-transform:uppercase;margin:44px 0 26px;letter-spacing:.005em}
h1 span{display:block}h1 span:last-child{color:#d6281c}.dark h1 span:last-child{color:#ffd400}
p{font:400 25px/1.4 Plex;color:#3a4561;max-width:560px}.dark p{color:#aab3c7}
.tel{position:absolute;left:64px;bottom:52px;background:#1d2a44;color:#ffd400;font:700 40px/1 Osw;padding:18px 24px;box-shadow:8px 8px 0 #ffd400,8px 8px 0 3px #1d2a44;letter-spacing:.01em}
.dark .tel{background:#ffd400;color:#1d2a44;box-shadow:8px 8px 0 #0f1830,8px 8px 0 3px #ece8df}
.url{position:absolute;left:410px;bottom:64px;font:600 20px/1 PMono;color:#55607a;letter-spacing:.04em}.dark .url{color:#aab3c7}
.ph{position:absolute;right:64px;top:52px;width:400px;height:510px;border:3px solid #1d2a44;padding:12px;background:#ece8df}
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.tag{position:absolute;left:-58px;bottom:70px;background:#ffd400;border:3px solid #1d2a44;font:600 20px/1 PMono;padding:12px 14px;letter-spacing:.04em}
.slip{position:absolute;right:64px;top:62px;width:420px;background:#fff8e6;padding:24px 26px 18px;box-shadow:10px 10px 0 #ffd400,10px 10px 0 3px #1d2a44;border:3px solid #1d2a44}
.st{display:flex;justify-content:space-between;font:600 15px/1 PMono;letter-spacing:.1em;border-bottom:2.5px dashed #1d2a44;padding-bottom:12px}
.slip h3{font:700 44px/1 Osw;text-transform:uppercase;margin:16px 0 8px}
.li{display:flex;gap:12px;align-items:center;padding:13px 0;border-bottom:1.5px dotted rgba(29,42,68,.3);font:500 21px/1.15 Plex}
.li i{flex:none;width:24px;height:24px;border:2.5px solid #1d2a44;background:#ffd400;font:700 15px/19px Plex;text-align:center;font-style:normal}
.li b{margin-left:auto;font:600 17px/1 PMono;white-space:nowrap;color:#55607a}
.app{position:absolute;right:120px;top:40px;width:300px;height:560px;border-radius:52px;background:#0f1830;padding:12px;box-shadow:12px 12px 0 #ffd400,12px 12px 0 3px #1d2a44}
.scr{position:relative;width:100%;height:100%;border-radius:42px;background:linear-gradient(165deg,#3a5590,#1d2a44 60%,#0d1428);display:grid;grid-template-columns:repeat(4,1fr);gap:18px 10px;padding:70px 16px;align-content:start}
.scr i{display:block;width:52px;height:52px;border-radius:14px;margin:auto;opacity:.85}
.isl{position:absolute;left:50%;top:14px;width:86px;height:26px;margin-left:-43px;border-radius:14px;background:#000}
.scr img{grid-column:4;width:62px;height:62px;border-radius:16px;margin:auto;box-shadow:0 0 0 4px #ffd400,0 6px 16px rgba(0,0,0,.4)}
.scr span{position:absolute;right:14px;top:300px;width:76px;text-align:center;font:500 12px/1 Plex;color:#fff}
.tal{position:absolute;right:70px;top:70px;width:440px;height:470px;background:#fff8e6;border:3px solid #1d2a44;padding:30px;box-shadow:10px 10px 0 #ffd400,10px 10px 0 3px #1d2a44}
.tt{display:flex;justify-content:space-between;font:600 16px/1 PMono;letter-spacing:.1em;border-bottom:2.5px dashed #1d2a44;padding-bottom:14px;margin-bottom:30px}
.tal .ln{height:14px;background:rgba(29,42,68,.14);margin:22px 0;width:90%}.tal .ln.s{width:60%}
.stamp{position:absolute;right:28px;bottom:40px;width:230px;height:230px;border:7px solid #d6281c;border-radius:50%;color:#d6281c;display:flex;flex-direction:column;align-items:center;justify-content:center;font:700 40px/1 Osw;transform:rotate(-14deg);box-shadow:inset 0 0 0 6px #fff8e6,inset 0 0 0 10px #d6281c;opacity:.9}
.stamp small{font:600 14px/1 PMono;letter-spacing:.1em;margin-top:10px}
.adm{position:absolute;right:110px;top:115px}.adm img{width:380px;height:380px;border-radius:84px;box-shadow:14px 14px 0 #ffd400,14px 14px 0 3px #0f1830}
</style></head><body class="${o.dark ? 'dark' : ''}"><div class="l"><div class="logo"><i></i>HANDYMAN</div><h1 style="${Math.max(...t.map(x => x.length)) > 10 ? 'font-size:82px' : ''}">${t.map(x => `<span>${x}</span>`).join('')}</h1><p>${sub}</p></div>
<div class="tel">8 963 599-36-01</div><div class="url">handyman-grozny.ru</div>${right(o)}<div class="haz"></div></body></html>`;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  for (const c of CARDS) { await p.setContent(page(c)); await p.evaluate(() => document.fonts.ready); await p.screenshot({ path: path.join(OUT, c[0] + '.jpg'), type: 'jpeg', quality: 86 }); }
  await b.close(); console.log(fs.readdirSync(OUT).join(' '));
})();
