# ТЗ: Яндекс Карта в форме заявки + маршрут для мастера

Проект: сайт мастера по дому `handyman-grozny.ru`. Статический сайт на Vercel (HTML/CSS/JS без фреймворков, без сборщика). Бэкенд: Supabase (Postgres + Edge Function `api` на Deno). Уведомления мастеру приходят в Telegram-бот.

---

## 1. Что должно получиться

**Клиент (сайт, форма заявки):**
1. Под полем «Адрес» есть кнопка «📍 На карте». По нажатию раскрывается блок с картой высотой 280 px.
2. Карта — Яндекс Карты JS API 2.1, центр — Грозный `[43.3178, 45.6949]`, зум 13, из элементов управления только кнопки зума.
3. Клик по карте ставит красную метку (`islands#redDotIcon`). Метку можно перетащить. Повторный клик переносит метку.
4. Кнопка «◎ Где я сейчас» берёт геолокацию браузера (`navigator.geolocation`, `enableHighAccuracy: true`, таймаут 12 с) и ставит метку туда с зумом 17.
5. После установки метки:
   - координаты сохраняются в переменную `geo = { lat, lon }` (6 знаков после запятой);
   - подпись под картой меняется на «Точка поставлена ✓ можно перетащить»;
   - адрес определяется обратным геокодированием и вписывается в поле «Адрес», **но только если поле пустое или в нём ещё стоит прошлый автоадрес** (то, что клиент ввёл руками, не затирается);
   - отправляется цель Яндекс Метрики `map_point`.
6. Если Яндекс Карты не загрузились (нет ключа, блокировка, таймаут 10 с) — автоматически открывается запасная карта Leaflet + OpenStreetMap с тем же поведением. Если и она не загрузилась — подпись «Карта не загрузилась — напишите адрес текстом».
7. Карта загружается **лениво**, только при первом нажатии на «📍 На карте» (не тормозит загрузку страницы).

**Мастер:**
1. В Telegram-уведомлении о заявке — строки `Точка: <ссылка>` и `Маршрут: <ссылка>` и inline-кнопки `💬 WhatsApp · 📍 Карта · 🚗 Маршрут`.
2. В админке, в карточке заявки — мини-карта с меткой клиента (iframe-виджет Яндекса) и кнопки «🚗 Маршрут» и «📍 Карта».
3. Если клиент отправляет заявку через WhatsApp — в текст сообщения тоже добавляются строки «Точка на карте» и «Маршрут».
4. «Маршрут» строит путь **от текущего местоположения мастера** до точки клиента; на телефоне открывает приложение Яндекс Карты / Навигатор.

---

## 2. Ключ API

- Ключ: «JavaScript API и HTTP Геокодер», получается в кабинете `developer.tech.yandex.ru`.
- Хранится во фронтенде в `config.js`:
  ```js
  window.HM_YMAPS = "<API_KEY>";
  ```
- Ключ JS API по определению публичный (виден в коде страницы). Защита — **ограничение по HTTP Referer** в кабинете разработчика: `handyman-grozny.ru`, `*.handyman-grozny.ru`.

---

## 3. Ссылки (формулы)

| Назначение | URL |
|---|---|
| Точка на карте | `https://yandex.ru/maps/?pt={lon},{lat}&z=17&l=map` |
| Маршрут от «я здесь» до точки | `https://yandex.ru/maps/?rtext=~{lat},{lon}&rtt=auto` |
| Мини-карта (iframe, без ключа) | `https://yandex.ru/map-widget/v1/?ll={lon},{lat}&z=16&pt={lon},{lat},pm2rdm` |

Внимание: в `pt` и `ll` порядок **долгота, широта**; в `rtext` — **широта, долгота**. Пустая начальная точка в `rtext` (`~` в начале) = «от моего местоположения». `rtt=auto` — на машине.

Почему ссылки, а не `yandexnavi://`: Telegram-кнопки принимают только `http(s)`, а `yandex.ru/maps` на телефоне сам открывает установленное приложение.

---

## 4. Фронтенд: код карты (index.html)

Разметка (внутри формы):
```html
<div class="addr">
  <label>Адрес<input id="fArea" autocomplete="street-address" placeholder="Улица, дом или район"></label>
  <button type="button" class="mapbtn" id="mapBtn">📍 На карте</button>
</div>
<div class="mapbox" id="mapBox" hidden>
  <div id="map" aria-label="Карта для выбора адреса"></div>
  <div class="maptools">
    <button type="button" id="geoBtn">◎ Где я сейчас</button>
    <span id="mapHint">Нажмите на карту — поставлю точку</span>
  </div>
</div>
```

CSS:
```css
.mapbox{border:2px solid var(--ink);margin-top:4px}
#map{height:280px;position:relative;isolation:isolate;z-index:0} /* isolation — чтобы карта не перекрывала липкую шапку */
```

Логика (ключевые части):
```js
let map, marker, autoAddr = '', kind = ''; // kind: 'y' — Яндекс, 'l' — Leaflet
const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });

const loadYandex = async () => {
  if (!window.HM_YMAPS) throw new Error('no key');
  if (!window.ymaps) await loadScript('https://api-maps.yandex.ru/2.1/?apikey=' + encodeURIComponent(window.HM_YMAPS) + '&lang=ru_RU');
  await new Promise((ok, no) => { const t = setTimeout(no, 10000); ymaps.ready(() => { clearTimeout(t); ok(); }); });
};

// обратное геокодирование: сначала Яндекс, при ошибке — Nominatim (OSM)
const reverse = async (lat, lon) => {
  if (kind === 'y') {
    try {
      const r = await ymaps.geocode([lat, lon], { results: 1 });
      const g = r.geoObjects.get(0);
      if (g) return fillAddr(String(g.getAddressLine()).replace(/^Россия,\s*/, '').replace(/^Чеченская Республика,\s*/, ''));
    } catch (_) {}
  }
  // fallback: https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=..&lon=..&zoom=18&accept-language=ru
};

const setPoint = (lat, lon, zoom) => {
  geo = { lat: +lat.toFixed(6), lon: +lon.toFixed(6) };
  if (kind === 'y') {
    if (!marker) {
      marker = new ymaps.Placemark([lat, lon], { hintContent: 'Сюда приедет мастер' }, { preset: 'islands#redDotIcon', draggable: true });
      marker.events.add('dragend', () => { const c = marker.geometry.getCoordinates(); setPoint(c[0], c[1]); });
      map.geoObjects.add(marker);
    } else marker.geometry.setCoordinates([lat, lon]);
    if (zoom) map.setCenter([lat, lon], zoom, { duration: 300 });
  } else { /* то же на Leaflet: L.marker(..., {draggable:true}) */ }
  // подпись, перерисовка формы, цель Метрики, reverse(lat, lon)
};

// по кнопке «📍 На карте»
map = new ymaps.Map('map', { center: [43.3178, 45.6949], zoom: 13, controls: ['zoomControl'] },
                    { suppressMapOpenBlock: true, yandexMapDisablePoiInteractivity: true });
map.events.add('click', e => { const c = e.get('coords'); setPoint(c[0], c[1]); });
// при повторном раскрытии блока: map.container.fitToViewport()
```

Запасной вариант Leaflet лежит локально: `/vendor/leaflet/leaflet.js` и `.css` (версия 1.9.4), тайлы `https://tile.openstreetmap.org/{z}/{x}/{y}.png`.

**Отправка заявки** — в JSON к серверу добавляются `lat` и `lon` (если точка поставлена):
```js
fetch(HM_API, { method: 'POST', body: JSON.stringify({ action: 'order', ..., lat: geo?.lat, lon: geo?.lon }) })
```

**Текст для WhatsApp** (ссылка `wa.me/...?text=`):
```js
if (geo) {
  lines.push('Точка на карте: https://yandex.ru/maps/?pt=' + geo.lon + ',' + geo.lat + '&z=17&l=map');
  lines.push('Маршрут: https://yandex.ru/maps/?rtext=~' + geo.lat + ',' + geo.lon + '&rtt=auto');
}
```

---

## 5. Заголовки безопасности (CSP) — vercel.json

Без этого Яндекс Карты не загрузятся. Для страниц сайта (`/(.*)`) к Content-Security-Policy добавлено:

```
script-src  ... 'unsafe-eval' https://api-maps.yandex.ru https://suggest-maps.yandex.ru https://*.maps.yandex.net https://yandex.ru https://yastatic.net
style-src   ... blob:
img-src     ... https://*.maps.yandex.net https://api-maps.yandex.ru https://yandex.ru https://*.yandex.ru https://yastatic.net https://tile.openstreetmap.org
connect-src ... https://api-maps.yandex.ru https://suggest-maps.yandex.ru https://*.maps.yandex.net https://yandex.ru https://*.yandex.ru https://yastatic.net https://nominatim.openstreetmap.org
frame-src   ... https://api-maps.yandex.ru https://yandex.ru
```
(`'unsafe-eval'` и `blob:` требует сам JS API 2.1.)

Для админки (`/admin/(.*)`, там строгий CSP без внешних скриптов) добавлено только:
```
frame-src https://yandex.ru;
```
— для iframe мини-карты. Скрипты Яндекса в админку не грузятся.

Также в `Permissions-Policy` должно быть `geolocation=(self)` — иначе «Где я сейчас» не сработает.

---

## 6. Бэкенд (Supabase)

**Таблица** `hm_orders` — колонки `lat double precision null`, `lon double precision null`.

**Edge Function `api`, действие `order`:**
- Валидация: оба числа конечные, `|lat| ≤ 90`, `|lon| ≤ 180`, не `(0,0)`. Иначе сохраняется `null`.
- Округление до 6 знаков.

**Хелперы:**
```ts
const mapUrl   = (lat: number, lon: number) => `https://yandex.ru/maps/?pt=${lon},${lat}&z=17&l=map`;
const routeUrl = (lat: number, lon: number) => `https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=auto`;
```

**Telegram-уведомление:**
- в тексте: `Точка: ${mapUrl(...)}` и `Маршрут: ${routeUrl(...)}`, с `disable_web_page_preview: true`;
- в клавиатуре `inline_keyboard` — ряд ссылок:
  ```ts
  if (o.lat != null && o.lon != null) {
    links.push({ text: "📍 Карта", url: mapUrl(o.lat, o.lon) });
    links.push({ text: "🚗 Маршрут", url: routeUrl(o.lat, o.lon) });
  }
  ```
  Тот же ряд сохраняется при смене статуса заявки (кнопки «В работу / Готово» перерисовывают клавиатуру через `editMessageReplyMarkup`).

---

## 7. Админка (admin/app.js)

В карточке заявки, если есть координаты:
```js
`<div class="omap">
  <iframe loading="lazy" title="Точка заказчика"
    src="https://yandex.ru/map-widget/v1/?ll=${+o.lon},${+o.lat}&z=16&pt=${+o.lon},${+o.lat},pm2rdm"></iframe>
  <div class="omap-b">
    <a class="btn sm y" href="https://yandex.ru/maps/?rtext=~${+o.lat},${+o.lon}&rtt=auto" target="_blank" rel="noopener">🚗 Маршрут</a>
    <a class="btn sm"   href="https://yandex.ru/maps/?pt=${+o.lon},${+o.lat}&z=17&l=map" target="_blank" rel="noopener">📍 Карта</a>
  </div>
</div>`
```
`+o.lat` / `+o.lon` — принудительно числа (защита от подстановки в HTML).

CSS:
```css
.omap{border:2px solid var(--ink);margin:10px 0}
.omap iframe{display:block;width:100%;height:200px;border:0}
.omap-b{display:flex;gap:8px;padding:8px;border-top:2px solid var(--ink)}
.omap-b .btn{flex:1}
```

---

## 8. Как проверить

1. Открыть сайт с телефона → «Написать задачу» → «📍 На карте»: должна открыться **Яндекс** карта (логотип Яндекса в углу).
2. Нажать на карту — метка, адрес подставился. Перетащить метку — адрес обновился.
3. «◎ Где я сейчас» — браузер спрашивает разрешение, метка встаёт на текущее место.
4. Отправить заявку «Отправить мастеру» → в Telegram пришли строки «Точка», «Маршрут» и кнопка «🚗 Маршрут» → она открывает Яндекс Карты с маршрутом от текущего места.
5. В админке у заявки видна мини-карта с меткой и кнопки.
6. В консоли браузера нет ошибок `Refused to load ... Content Security Policy`.
7. Проверка запасного варианта: временно убрать ключ из `config.js` — должна открыться карта OpenStreetMap, всё остальное работает так же.
