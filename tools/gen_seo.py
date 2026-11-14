#!/usr/bin/env python3
"""Generates SEO landing pages /uslugi/*.html, /uslugi/index.html and sitemap.xml.
Prices are baked in at build time and refreshed live from the content snapshot by /assets/seo.js.
Run: python3 tools/gen_seo.py  (prices are read from tools/prices.json if present)."""
import json, os, html, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://handyman-grozny.ru"
PHONE, PHONE_INTL = "8 963 599-36-01", "79635993601"
TODAY = datetime.date.today().isoformat()
prices_path = os.path.join(ROOT, "tools", "prices.json")
PRICES = json.load(open(prices_path)) if os.path.exists(prices_path) else []

PAGES = [
 dict(cat="el", slug="elektrik-grozny", short="Электрик", h1="Электрик на дом в Грозном",
  title="Электрик на дом в Грозном — розетки, люстры, кабель | Handyman",
  desc="Вызвать электрика в Грозном: установка розеток и выключателей, подключение люстр и светильников, прокладка кабеля. Цена до начала работ. Мастер Рамзан, 5 лет опыта.",
  intro=["Розетка болтается, люстра лежит в коробке, нужно добавить выключатель или протянуть кабель — это мелкие электромонтажные работы, с которыми я приезжаю в Грозном и ближайших районах.",
         "Перед началом смотрю, что за проводка, называю цену и только потом работаю. Свой инструмент и расходники для подключения беру с собой."],
  includes=["Установка и замена розеток, выключателей", "Подключение люстр, светильников, LED-люстр с пультом", "Прокладка кабеля в кабель-канале", "Поиск, почему не работает свет или розетка", "Другая мелкая электрика по дому и офису"],
  faq=[("Сколько стоит повесить люстру?", "Зависит от люстры: простую повесить быстрее, тяжёлую хрустальную — дольше. Ориентир по ценам — в таблице выше, точную цену скажу по фото."),
       ("Работаете с алюминиевой проводкой?", "Смотрю на месте. Если проводка старая и опасная, честно скажу, что лучше сделать, прежде чем что-то подключать."),
       ("Можно вызвать в тот же день?", "Если есть свободное окно — да. Позвоните или отправьте заявку, скажу, когда смогу приехать.")],
  imgs=[("crystal-after", "Подключённая хрустальная люстра"), ("light-after", "Установленная LED-люстра")]),
 dict(cat="pl", slug="santehnik-grozny", short="Сантехник", h1="Сантехник на дом в Грозном",
  title="Сантехник в Грозном — смесители, унитазы, протечки | Handyman",
  desc="Сантехник на дом в Грозном: замена смесителей и кранов, установка унитаза и сифона, подключение стиральной машины, устранение протечек. Цена до начала работ.",
  intro=["Капает кран, течёт под раковиной, нужно подключить стиральную машину или поменять унитаз — приезжаю и делаю сантехнические работы по квартире и частному дому в Грозном.",
         "Если течёт прямо сейчас — так и скажите при звонке, постараюсь приехать быстрее. Подскажу, какие детали купить, чтобы не ездить в магазин дважды."],
  includes=["Замена смесителей и кранов", "Установка и замена сифонов", "Установка унитаза", "Подключение стиральной и посудомоечной машины", "Поиск и устранение протечек"],
  faq=[("Детали покупать мне?", "Обычно да — я скажу точно, что взять. Так вы сами выбираете смеситель по вкусу и цене."),
       ("Сколько стоит подключить стиральную машину?", "Ориентир — в таблице цен. Если нужно делать отвод от трубы, скажу заранее."),
       ("Работаете в частном доме?", "Да, и в квартирах, и в частных домах.")],
  imgs=[]),
 dict(cat="mb", slug="sborka-mebeli-grozny", short="Сборка мебели", h1="Сборка мебели в Грозном",
  title="Сборка мебели в Грозном — шкафы, кухни, кровати | Handyman",
  desc="Сборка мебели на дому в Грозном: шкафы, кухни, кровати, комоды, столы и стеллажи. Разборка и перестановка. Мастер Рамзан, фото работ на сайте.",
  intro=["Привезли мебель в коробках — соберу шкаф, кухню, кровать, комод или стеллаж. Работаю аккуратно: фасады выставляю ровно, двери и ящики регулирую, чтобы закрывались до конца.",
         "Упаковку и плёнку после сборки забираю или складываю, куда скажете. Фото собранной мебели — на главной странице в разделе «Мебель и объекты»."],
  includes=["Сборка шкафов, в том числе с зеркальными дверями", "Сборка кухонных гарнитуров", "Сборка кроватей, комодов, тумб", "Столы, стеллажи, полки", "Разборка, перестановка и ремонт мебели (направляющие, петли, крепления)"],
  faq=[("Сколько стоит собрать шкаф?", "Зависит от размера и количества дверей и ящиков. Ориентир — в таблице, точнее скажу по фото схемы или коробок."),
       ("Можете починить старую мебель?", "Да: переставить направляющие ящиков, укрепить каркас кровати, поменять петли и ручки."),
       ("Сколько времени занимает сборка?", "Комод или кровать — обычно за один приезд. Большой шкаф или кухня — зависит от модели, скажу заранее.")],
  imgs=[("wardrobe-arch", "Собранный шкаф с арочными зеркалами"), ("kitchen", "Собранный кухонный гарнитур"), ("desk", "Собранный туалетный столик")]),
 dict(cat="fl", slug="ukladka-laminata-grozny", short="Ламинат и линолеум", h1="Укладка ламината и линолеума в Грозном",
  title="Укладка ламината и линолеума в Грозном, плинтусы | Handyman",
  desc="Укладка ламината и линолеума в Грозном, установка плинтусов. Снимаю старое покрытие, кладу новое ровно. Цена за метр — на сайте.",
  intro=["Кладу ламинат и линолеум, устанавливаю плинтусы. Могу снять старое покрытие и подготовить пол под новое.",
         "На главной странице есть пример: комната со старым облезлым линолеумом, в которой теперь ламинат, новая мебель и всё на своих местах."],
  includes=["Укладка ламината", "Укладка линолеума", "Установка плинтусов", "Демонтаж старого покрытия"],
  faq=[("Цена указана за метр?", "Да, для ламината и линолеума цена указана за квадратный метр, для плинтуса — за погонный метр."),
       ("Материал покупать мне?", "Да, я подскажу, сколько брать с запасом, и что нужно кроме самого покрытия."),
       ("Двигаете мебель?", "Да, перед укладкой мебель можно переставить — скажите об этом в заявке.")],
  imgs=[("room-after", "Комната после укладки ламината")]),
 dict(cat="dr", slug="dveri-grozny", short="Двери", h1="Ремонт и регулировка дверей в Грозном",
  title="Регулировка дверей, замена ручек и замков в Грозном | Handyman",
  desc="Регулировка межкомнатных и входных дверей в Грозном, замена ручек, петель и замков. Мастер на дом, цена до начала работ.",
  intro=["Дверь трётся, не закрывается, разболталась ручка или нужно поменять замок — приезжаю и делаю.",
         "Регулирую петли, меняю ручки, личинки и замки. Если деталь нужно купить, скажу, какую именно."],
  includes=["Регулировка межкомнатных и входных дверей", "Замена дверных ручек", "Замена петель", "Замена замков и личинок"],
  faq=[("Можно поменять личинку замка?", "Да. Пришлите фото замка — подскажу, какую личинку купить."),
       ("Дверь трётся о пол, что делать?", "Обычно помогает регулировка петель. Посмотрю на месте и скажу, что нужно.")],
  imgs=[("office-door", "Дверь и кабель-канал в офисе")]),
 dict(cat="lv", slug="internet-kabel-grozny", short="Интернет и ТВ кабель", h1="Интернет-кабель, роутер и ТВ в Грозном",
  title="Проложить интернет-кабель, подключить роутер и ТВ в Грозном | Handyman",
  desc="Прокладка интернет-кабеля, подключение и настройка роутера и Wi‑Fi, ТВ и спутник, обжим кабелей и разъёмов в Грозном.",
  intro=["Протяну интернет-кабель в нужную комнату, аккуратно уложу его в кабель-канал, подключу роутер, настрою Wi‑Fi, подключу телевизор.",
         "Обжимаю кабели и меняю разъёмы. Работаю и в квартирах, и в офисах."],
  includes=["Прокладка интернет-кабеля", "Подключение и настройка роутера, Wi‑Fi", "Подключение ТВ и спутникового оборудования", "Обжим кабелей, замена разъёмов"],
  faq=[("Сделаете так, чтобы провода не было видно?", "Кабель укладываю в кабель-канал или прячу за плинтусом, где это возможно."),
       ("Настроите Wi‑Fi на всю квартиру?", "Подключу и настрою роутер, подскажу, где его лучше поставить.")],
  imgs=[]),
 dict(cat="sm", slug="muzh-na-chas-grozny", short="Муж на час", h1="Муж на час в Грозном",
  title="Муж на час в Грозном — повесить телевизор, полку, карниз | Handyman",
  desc="Муж на час в Грозном: повесить телевизор на стену, полку, карниз, зеркало, картину. Мелкий ремонт по дому одним вызовом. Мастер Рамзан.",
  intro=["Всё, до чего месяцами не доходят руки: повесить телевизор, полку, карниз, зеркало или картину, что-то закрепить, подтянуть, поменять.",
         "Удобнее всего собрать все задачи в одну заявку — сделаю всё за один приезд, а не за три. Уровень, перфоратор и крепёж под разные стены беру с собой."],
  includes=["Повесить телевизор на стену (кронштейн)", "Повесить полку, карниз, зеркало, картину", "Мелкий ремонт по дому", "Несколько задач за один приезд"],
  faq=[("Сколько стоит час работы?", "Я считаю не по часам, а по задачам — так честнее. Цены «от» указаны в таблице, общую сумму назову до начала."),
       ("Можно сразу несколько мелких задач?", "Да, так даже лучше. Отметьте всё в заявке на сайте."),
       ("Повесите телевизор на гипсокартон?", "Смотрю на месте: подберу подходящий крепёж или скажу, где вешать надёжнее.")],
  imgs=[("tv-after", "Телевизор на стене")]),
 dict(cat="ot", slug="ustanovka-tehniki-grozny", short="Установка техники", h1="Установка бытовой техники в Грозном",
  title="Установка бытовой техники, монтаж и демонтаж в Грозном | Handyman",
  desc="Установка и подключение бытовой техники в Грозном, монтаж и демонтаж, помощь по дому. Мастер Рамзан.",
  intro=["Подключу и установлю бытовую технику, сниму старое, смонтирую новое. Если задача необычная — опишите её в заявке, скажу, возьмусь или нет.",
         "Работаю в Грозном и ближайших районах."],
  includes=["Установка и подключение бытовой техники", "Монтаж и демонтаж", "Помощь по дому"],
  faq=[("Беретесь за нестандартные задачи?", "Опишите задачу или пришлите фото — честно скажу, сделаю или нет.")],
  imgs=[("kitchen", "Собранная кухня")]),
]

CSS = "/assets/seo.css"
esc = lambda s: html.escape(s, quote=True)
rub = lambda n: f"{n:,}".replace(",", " ") + " ₽"

def price_rows(cat):
    rows = [p for p in PRICES if p["cat"] == cat]
    if not rows: return ""
    unit = {"Уложить ламинат": " / м²", "Уложить линолеум": " / м²", "Установить плинтус": " / пог. м"}
    return "".join(f'<tr data-name="{esc(p["name"])}"><td>{esc(p["name"])}</td><td class="pr">{"от " + rub(p["price_from"]) + unit.get(p["name"], "") if p.get("price_from") else "по договорённости"}</td></tr>' for p in rows)

def page(pg):
    url = f"{SITE}/uslugi/{pg['slug']}.html"
    rows = [p for p in PRICES if p["cat"] == pg["cat"]]
    others = "".join(f'<a href="/uslugi/{o["slug"]}.html">{esc(o["short"])}</a>' for o in PAGES if o["slug"] != pg["slug"])
    imgs = "".join(f'<figure><img src="/img/{n}-800.webp" alt="{esc(a)}" loading="lazy" width="800" height="1000"><figcaption>{esc(a)}</figcaption></figure>' for n, a in pg["imgs"])
    ld = [
      {"@context": "https://schema.org", "@type": "Service", "name": pg["h1"], "serviceType": pg["short"], "description": pg["desc"], "url": url,
       "areaServed": {"@type": "City", "name": "Грозный"},
       "provider": {"@type": "HomeAndConstructionBusiness", "name": "Handyman Грозный — мастер Рамзан", "telephone": "+7 963 599-36-01", "url": SITE + "/",
                    "address": {"@type": "PostalAddress", "addressLocality": "Грозный", "addressRegion": "Чеченская Республика", "addressCountry": "RU"}},
       **({"offers": [{"@type": "Offer", "name": p["name"], "priceCurrency": "RUB", "price": p["price_from"], "priceSpecification": {"@type": "PriceSpecification", "minPrice": p["price_from"], "priceCurrency": "RUB"}} for p in rows if p.get("price_from")]} if rows else {})},
      {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in pg["faq"]]},
      {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Главная", "item": SITE + "/"},
        {"@type": "ListItem", "position": 2, "name": "Услуги", "item": SITE + "/uslugi/"},
        {"@type": "ListItem", "position": 3, "name": pg["short"], "item": url}]},
    ]
    return f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(pg["title"])}</title>
<meta name="description" content="{esc(pg["desc"])}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website"><meta property="og:locale" content="ru_RU"><meta property="og:site_name" content="Handyman Грозный">
<meta property="og:title" content="{esc(pg["h1"])}"><meta property="og:description" content="{esc(pg["desc"])}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/img/og/{pg["slug"]}.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ece8df">
<link rel="icon" href="/icons/site-192.png"><link rel="apple-touch-icon" href="/icons/site-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{CSS}">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<header class="hdr"><div class="w"><a href="/" class="logo"><span class="lvl"><i></i></span><span>HANDYMAN<small>ГРОЗНЫЙ</small></span></a><a href="tel:+{PHONE_INTL}" class="btn ink sm" data-phone-link>☎ <span data-phone>{PHONE}</span></a></div></header>
<main class="w">
  <nav class="crumbs" aria-label="Навигация"><a href="/">Главная</a> / <a href="/uslugi/">Услуги</a> / <span>{esc(pg["short"])}</span></nav>
  <div class="sheet">Грозный и ближайшие районы</div>
  <h1>{esc(pg["h1"])}</h1>
  {''.join(f"<p class='lead'>{esc(t)}</p>" for t in pg["intro"])}
  <div class="ctas"><a class="btn ink" href="/?cat={pg["cat"]}#order">Оставить заявку <b>→</b></a><a class="btn wa" href="https://wa.me/{PHONE_INTL}" target="_blank" rel="noopener">WhatsApp</a><a class="btn" href="tel:+{PHONE_INTL}" data-phone-link>Позвонить</a></div>

  <section><h2>Что делаю</h2><ul class="inc">{''.join(f"<li>{esc(x)}</li>" for x in pg["includes"])}</ul></section>
  {f'<section><h2>Цены</h2><table class="prices" data-cat="{pg["cat"]}"><tbody>{price_rows(pg["cat"])}</tbody></table><p class="note">Это цены «от». Точную стоимость называю до начала работы — по фото или на месте.</p></section>' if rows else ''}
  {f'<section><h2>Мои работы</h2><div class="gal">{imgs}</div></section>' if imgs else ''}
  <section><h2>Как это работает</h2><ol class="steps"><li><b>Заявка</b>Отметьте задачи на сайте, позвоните или напишите в WhatsApp. Можно сразу прислать фото.</li><li><b>Цена</b>Называю стоимость до начала работы. Если на месте окажется сложнее — сначала скажу.</li><li><b>Работа</b>Приезжаю со своим инструментом, делаю, убираю за собой.</li></ol></section>
  <section><h2>Вопросы</h2><div class="faq">{''.join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in pg["faq"])}</div></section>
  <section class="final"><h2>Мастер Рамзан</h2><p>Мне 21, в ремонте 5 лет, живу в Грозном. Работаю один: трубку беру я, приезжаю тоже я.</p><div class="ctas"><a class="btn ink" href="/?cat={pg["cat"]}#order">Оставить заявку <b>→</b></a><a class="btn" href="tel:+{PHONE_INTL}" data-phone-link>☎ <span data-phone>{PHONE}</span></a></div></section>
  <nav class="others" aria-label="Другие услуги"><h2>Другие услуги</h2>{others}</nav>
</main>
<footer><div class="w"><span>© Handyman Грозный · мастер Рамзан</span><a href="/privacy.html">Политика конфиденциальности</a></div></footer>
<script src="/config.js"></script><script src="/assets/seo.js"></script>
</body>
</html>
'''

def hub():
    cards = "".join(f'<a class="card" href="/uslugi/{p["slug"]}.html"><b>{esc(p["short"])}</b><span>{esc(p["desc"][:110])}…</span></a>' for p in PAGES)
    return f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Услуги мастера по дому в Грозном | Handyman</title>
<meta name="description" content="Все услуги мастера по дому в Грозном: электрика, сантехника, сборка мебели, ламинат, двери, интернет-кабель, муж на час. Цены от 280 ₽.">
<link rel="canonical" href="{SITE}/uslugi/">
<meta property="og:type" content="website"><meta property="og:locale" content="ru_RU"><meta property="og:site_name" content="Handyman Грозный"><meta property="og:title" content="Услуги мастера по дому в Грозном"><meta property="og:description" content="Электрика, сантехника, сборка мебели, ламинат, двери, интернет-кабель, муж на час. Цена — до начала работ."><meta property="og:url" content="{SITE}/uslugi/">
<meta property="og:image" content="{SITE}/img/og/uslugi.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#ece8df">
<link rel="icon" href="/icons/site-192.png">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{CSS}"></head>
<body>
<header class="hdr"><div class="w"><a href="/" class="logo"><span class="lvl"><i></i></span><span>HANDYMAN<small>ГРОЗНЫЙ</small></span></a><a href="tel:+{PHONE_INTL}" class="btn ink sm" data-phone-link>☎ <span data-phone>{PHONE}</span></a></div></header>
<main class="w"><nav class="crumbs"><a href="/">Главная</a> / <span>Услуги</span></nav>
<div class="sheet">Грозный и ближайшие районы</div><h1>Услуги мастера по дому</h1>
<p class="lead">Один мастер на все домашние задачи. Выберите услугу — там цены, примеры работ и ответы на частые вопросы.</p>
<div class="hub">{cards}</div></main>
<footer><div class="w"><span>© Handyman Грозный · мастер Рамзан</span><a href="/privacy.html">Политика конфиденциальности</a></div></footer>
<script src="/config.js"></script><script src="/assets/seo.js"></script>
</body></html>
'''

os.makedirs(os.path.join(ROOT, "uslugi"), exist_ok=True)
for pg in PAGES:
    open(os.path.join(ROOT, "uslugi", pg["slug"] + ".html"), "w").write(page(pg))
open(os.path.join(ROOT, "uslugi", "index.html"), "w").write(hub())
urls = [(SITE + "/", "1.0", "weekly"), (SITE + "/uslugi/", "0.8", "monthly")] + [(f"{SITE}/uslugi/{p['slug']}.html", "0.8", "monthly") for p in PAGES] + [(SITE + "/app/", "0.5", "monthly"), (SITE + "/privacy.html", "0.2", "yearly")]
open(os.path.join(ROOT, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(f"  <url><loc>{u}</loc><lastmod>{TODAY}</lastmod><changefreq>{f}</changefreq><priority>{p}</priority></url>\n" for u, p, f in urls) + "</urlset>\n")
json.dump([{"cat": p["cat"], "slug": p["slug"], "short": p["short"]} for p in PAGES], open(os.path.join(ROOT, "tools", "pages.json"), "w"), ensure_ascii=False, indent=1)
print("pages:", len(PAGES) + 1)
