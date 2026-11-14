// Handyman Grozny API: public content + orders + reviews, Telegram login & bot, admin CRUD, backups.
// Deploy with verify_jwt=false: the function does its own auth (Telegram code -> session token).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(SUPA_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BOT = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const BUCKET = "hm-media";
const FN_URL = `${SUPA_URL}/functions/v1/api`;
const SITE = "https://handyman-grozny.ru";
const STATUSES = ["new", "work", "done", "cancel"];
const ST: Record<string, string> = { new: "Новая", work: "В работе", done: "Готово", cancel: "Отмена" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (d: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(d), { status, headers: { ...cors, "Content-Type": "application/json", ...extra } });

class HttpError extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}
const fail = (m: string, s = 400): never => { throw new HttpError(m, s); };

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (t: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
const rnd = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
const digits6 = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const must = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) { console.error(r.error); fail("Ошибка сервера, попробуйте ещё раз", 500); } return r.data; };
const rub = (n: number) => n.toLocaleString("ru-RU") + " ₽";
const waNum = (phone: string) => { const d = (phone || "").replace(/\D/g, ""); if (d.length < 10) return ""; return d.length === 11 && d[0] === "8" ? "7" + d.slice(1) : d; };
const mapUrl = (lat: number, lon: number) => `https://yandex.ru/maps/?pt=${lon},${lat}&z=17&l=map`;
// Route from the master's current location (empty start in rtext) to the customer's point; opens Yandex Maps / Navigator app on the phone.
const routeUrl = (lat: number, lon: number) => `https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=auto`;

async function tg(method: string, body: Record<string, unknown>) {
  if (!BOT) fail("Бот не настроен: добавьте TELEGRAM_BOT_TOKEN в секреты Supabase", 500);
  const r = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.ok) fail("Telegram: " + (j.description || "ошибка"), 502);
  return j.result;
}
const getAdmin = async () => must(await sb.from("hm_admin").select("*").eq("id", 1).single()) as Record<string, any>;
const setAdmin = async (patch: Record<string, unknown>) => must(await sb.from("hm_admin").update(patch).eq("id", 1));
const getTexts = async (keys: string[]) => {
  const rows = must(await sb.from("hm_texts").select("key,value").in("key", keys)) as any[];
  const t: Record<string, string> = {}; rows.forEach((r) => (t[r.key] = r.value)); return t;
};

const clientIp = (req: Request) => {
  const h = req.headers;
  const xff = (h.get("x-forwarded-for") || "").split(",").map((x) => x.trim()).filter(Boolean);
  return h.get("cf-connecting-ip") || h.get("x-real-ip") || xff[xff.length - 1] || "";
};
const ipHash = async (req: Request) => { const ip = clientIp(req); return ip ? (await sha("hm:" + ip)).slice(0, 24) : null; };
const locked = (a: Record<string, any>) => a.lock_until && new Date(a.lock_until) > new Date();
const countSince = async (table: string, minutes: number, ip?: string | null) => {
  let q = sb.from(table).select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - minutes * 60_000).toISOString());
  if (ip) q = q.eq("ip_hash", ip);
  const { count } = await q; return count ?? 0;
};

// ---------- table whitelists for admin CRUD ----------
const TABLES: Record<string, { name: string; cols: string[]; order: [string, boolean]; key?: string }> = {
  orders: { name: "hm_orders", cols: ["status", "admin_note", "amount"], order: ["created_at", false] },
  services: { name: "hm_services", cols: ["cat", "cat_title", "name", "price_from", "sort", "active"], order: ["sort", true] },
  cases: { name: "hm_cases", cols: ["tag", "title", "was", "did", "result", "before_url", "after_url", "before_cap", "after_cap", "sort", "published"], order: ["sort", true] },
  gallery: { name: "hm_gallery", cols: ["title", "tag", "image_url", "sort", "published"], order: ["sort", true] },
  texts: { name: "hm_texts", cols: ["value"], order: ["sort", true], key: "key" },
  reviews: { name: "hm_reviews", cols: ["status", "reply"], order: ["created_at", false] },
  warranties: { name: "hm_warranties", cols: ["months", "works", "client_name", "note"], order: ["created_at", false], key: "token" },
};
const PRIVATE_TABLES = ["orders", "warranties"]; // changes there do not touch the public snapshot

async function requireSession(req: Request) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t || t.length < 32) fail("Нужно войти", 401);
  const row = must(await sb.from("hm_admin_sessions").select("expires_at").eq("token_hash", await sha(t)).maybeSingle());
  if (!row || new Date((row as any).expires_at) < new Date()) fail("Сессия истекла, войдите снова", 401);
  return t;
}

// ---------- public content (static snapshot on Storage CDN) ----------
const SNAPSHOT = "content.json";
let contentCache: { at: number; data: unknown } | null = null;
async function writeSnapshot(data: unknown) {
  const { error } = await sb.storage.from(BUCKET).upload(SNAPSHOT, new Blob([JSON.stringify(data)], { type: "application/json" }), {
    upsert: true, contentType: "application/json", cacheControl: "60",
  });
  if (error) console.error("snapshot", error);
}
async function content() {
  if (contentCache && Date.now() - contentCache.at < 30_000) return contentCache.data;
  const data = await loadContent();
  contentCache = { at: Date.now(), data };
  await writeSnapshot(data);
  return data;
}
async function republish() { contentCache = null; await content(); }
async function loadContent() {
  const [t, s, c, g, r] = await Promise.all([
    sb.from("hm_texts").select("key,value"),
    sb.from("hm_services").select("id,cat,cat_title,name,price_from,sort").eq("active", true).order("sort"),
    sb.from("hm_cases").select("id,tag,title,was,did,result,before_url,after_url,before_cap,after_cap").eq("published", true).order("sort"),
    sb.from("hm_gallery").select("id,title,tag,image_url").eq("published", true).order("sort"),
    sb.from("hm_reviews").select("id,name,rating,text,reply,created_at").eq("status", "approved").order("created_at", { ascending: false }).limit(60),
  ]);
  const texts: Record<string, string> = {};
  (must(t) as any[]).forEach((x) => (texts[x.key] = x.value));
  return { texts, services: must(s), cases: must(c), gallery: must(g), reviews: must(r) };
}

// ---------- Telegram keyboards ----------
function orderKb(o: Record<string, any>, reviewText = "") {
  const rows: any[] = [];
  if (o.status !== "work" && o.status !== "done") rows.push([{ text: "🔧 В работу", callback_data: `o:${o.id}:work` }, { text: "✅ Готово", callback_data: `o:${o.id}:done` }]);
  else if (o.status === "work") rows.push([{ text: "✅ Готово", callback_data: `o:${o.id}:done` }, { text: "✖ Отмена", callback_data: `o:${o.id}:cancel` }]);
  if (o.status === "new") rows[0].push({ text: "✖", callback_data: `o:${o.id}:cancel` });
  const links: any[] = [];
  const wa = waNum(o.phone);
  if (wa) links.push({ text: "💬 WhatsApp", url: `https://wa.me/${wa}` });
  if (o.lat != null && o.lon != null) { links.push({ text: "📍 Карта", url: mapUrl(o.lat, o.lon) }); links.push({ text: "🚗 Маршрут", url: routeUrl(o.lat, o.lon) }); }
  if (links.length) rows.push(links);
  if (o.status === "done" && wa && reviewText) rows.push([{ text: "⭐ Попросить отзыв", url: `https://wa.me/${wa}?text=${encodeURIComponent(reviewText)}` }]);
  return { inline_keyboard: rows };
}
async function reviewRequestText(name: string) {
  const t = await getTexts(["review_request", "yandex_review_url"]);
  const link = t.yandex_review_url || `${SITE}/#reviews`;
  return (t.review_request || "{имя}, оставьте, пожалуйста, отзыв: {ссылка}").replaceAll("{имя}", name || "Здравствуйте").replaceAll("{ссылка}", link);
}

// ---------- orders ----------
async function order(body: any, req: Request) {
  const items = Array.isArray(body.items) ? body.items.slice(0, 40).map((i: any) => ({
    name: str(i?.name, 120), price_from: Number.isFinite(+i?.price_from) && +i.price_from > 0 ? Math.round(+i.price_from) : null,
  })).filter((i: any) => i.name) : [];
  const lat = +body.lat, lon = +body.lon;
  const geo = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0);
  const row = {
    num: str(body.num, 12), name: str(body.name, 80), phone: str(body.phone, 40), area: str(body.area, 200),
    when_text: str(body.when, 60), note: str(body.note, 1500), items,
    total_from: items.reduce((a: number, i: any) => a + (i.price_from || 0), 0) || null,
    lat: geo ? Math.round(lat * 1e6) / 1e6 : null, lon: geo ? Math.round(lon * 1e6) / 1e6 : null,
    source: body.source === "site" ? "site" : "wa",
  };
  if (!items.length && !row.note) fail("Отметьте хотя бы одну задачу или напишите комментарий");
  if (body.consent !== true) fail("Нужно согласие на обработку персональных данных");
  if (row.source === "site" && row.phone.replace(/\D/g, "").length < 10) fail("Укажите телефон, чтобы мастер мог перезвонить");
  if (str(body.website, 200) || (Number.isFinite(+body.t) && +body.t < 2500)) return { ok: true, id: 0 };
  if (await countSince("hm_orders", 10) >= 30) fail("Сейчас слишком много заявок, позвоните или напишите в WhatsApp", 429);
  const ip_hash = await ipHash(req);
  if (ip_hash && await countSince("hm_orders", 10, ip_hash) >= 5) fail("Слишком много заявок, попробуйте позже", 429);
  const saved = must(await sb.from("hm_orders").insert({ ...row, ip_hash, consent_at: new Date().toISOString() }).select("*").single()) as any;

  try {
    const a = await getAdmin();
    if (a.chat_id && BOT) {
      const lines = [`🛠 Новая заявка №${row.num || saved.id}${row.source === "wa" ? " (ушла и в WhatsApp)" : ""}`, ""];
      items.forEach((i: any) => lines.push(`• ${i.name}${i.price_from ? ` — от ${rub(i.price_from)}` : ""}`));
      if (row.total_from) lines.push("", `Примерно от ${rub(row.total_from)}`);
      lines.push("");
      if (row.name) lines.push(`Имя: ${row.name}`);
      if (row.phone) lines.push(`Телефон: ${row.phone}`);
      if (row.area) lines.push(`Адрес: ${row.area}`);
      if (row.lat != null) { lines.push(`Точка: ${mapUrl(row.lat, row.lon!)}`); lines.push(`Маршрут: ${routeUrl(row.lat, row.lon!)}`); }
      if (row.when_text) lines.push(`Когда: ${row.when_text}`);
      if (row.note) lines.push(`Комментарий: ${row.note}`);
      await tg("sendMessage", { chat_id: a.chat_id, text: lines.join("\n"), reply_markup: orderKb(saved), disable_web_page_preview: true });
    }
  } catch (e) { console.error("notify", e); }
  return { ok: true, id: saved.id, num: row.num || String(saved.id) };
}

// ---------- reviews ----------
async function reviewSubmit(body: any, req: Request) {
  const name = str(body.name, 60), text = str(body.text, 1500), rating = Math.round(+body.rating);
  if (!name) fail("Напишите имя");
  if (!(rating >= 1 && rating <= 5)) fail("Поставьте оценку от 1 до 5");
  if (text.length < 10) fail("Напишите хотя бы пару предложений");
  if (body.consent !== true) fail("Нужно согласие на обработку персональных данных");
  if (str(body.website, 200) || (Number.isFinite(+body.t) && +body.t < 3000)) return { ok: true };
  if (await countSince("hm_reviews", 60) >= 20) fail("Сейчас слишком много отзывов, попробуйте позже", 429);
  const ip_hash = await ipHash(req);
  if (ip_hash && await countSince("hm_reviews", 24 * 60, ip_hash) >= 3) fail("Вы уже оставили отзыв, спасибо!", 429);
  const saved = must(await sb.from("hm_reviews").insert({ name, rating, text, ip_hash, consent_at: new Date().toISOString() }).select("id").single()) as any;
  try {
    const a = await getAdmin();
    if (a.chat_id && BOT) {
      await tg("sendMessage", {
        chat_id: a.chat_id, text: `⭐ Новый отзыв ${"★".repeat(rating)}${"☆".repeat(5 - rating)}\n\n${name}:\n«${text}»\n\nНа сайте появится только после вашего одобрения.`,
        reply_markup: { inline_keyboard: [[{ text: "✅ Опубликовать", callback_data: `r:${saved.id}:approved` }, { text: "🙈 Скрыть", callback_data: `r:${saved.id}:hidden` }]] },
      });
    }
  } catch (e) { console.error("notify", e); }
  return { ok: true };
}

// ---------- warranties ----------
async function warrantyGet(body: any) {
  const token = str(body.token, 40).replace(/[^a-f0-9]/g, "");
  if (token.length < 12) fail("Талон не найден", 404);
  const w = must(await sb.from("hm_warranties").select("*").eq("token", token).maybeSingle()) as any;
  if (!w) fail("Талон не найден", 404);
  const t = await getTexts(["warranty_text", "phone"]);
  const until = new Date(w.created_at); until.setMonth(until.getMonth() + w.months);
  return { client_name: w.client_name, works: w.works, months: w.months, created_at: w.created_at, until: until.toISOString(), note: w.note, terms: t.warranty_text || "", phone: t.phone || "", number: token.slice(0, 6).toUpperCase() };
}
async function warrantyCreate(body: any) {
  const order_id = Number.isFinite(+body.order_id) && +body.order_id > 0 ? +body.order_id : null;
  const months = Math.min(60, Math.max(1, Math.round(+body.months || 6)));
  const works = str(body.works, 1500) || fail("Опишите, что сделано");
  const token = rnd(9);
  must(await sb.from("hm_warranties").insert({ token, order_id, months, works, client_name: str(body.client_name, 80), note: str(body.note, 500) }));
  return { token, url: `${SITE}/garantiya.html?t=${token}` };
}

// ---------- backup & stats ----------
const csvCell = (v: unknown) => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (rows: any[], cols: [string, string][]) => "\uFEFF" + [cols.map((c) => c[1]).join(";"), ...rows.map((r) => cols.map(([k]) => csvCell(k === "items" ? (r.items || []).map((i: any) => i.name).join(", ") : r[k])).join(";"))].join("\n");
async function sendBackup(chat_id: number | string) {
  const orders = must(await sb.from("hm_orders").select("*").order("created_at")) as any[];
  const reviews = must(await sb.from("hm_reviews").select("*").order("created_at")) as any[];
  const date = new Date().toISOString().slice(0, 10);
  const send = async (name: string, csv: string, caption: string) => {
    const fd = new FormData();
    fd.append("chat_id", String(chat_id)); fd.append("caption", caption);
    fd.append("document", new Blob([csv], { type: "text/csv" }), name);
    const r = await fetch(`https://api.telegram.org/bot${BOT}/sendDocument`, { method: "POST", body: fd });
    if (!(await r.json()).ok) console.error("backup send failed");
  };
  await send(`handyman-zayavki-${date}.csv`, toCsv(orders, [["id", "ID"], ["num", "Номер"], ["created_at", "Дата"], ["status", "Статус"], ["name", "Имя"], ["phone", "Телефон"], ["area", "Адрес"], ["lat", "Широта"], ["lon", "Долгота"], ["items", "Задачи"], ["total_from", "Оценка от"], ["amount", "Взято, ₽"], ["note", "Комментарий"], ["admin_note", "Заметка"], ["done_at", "Выполнено"], ["consent_at", "Согласие"]]),
    `💾 Резервная копия за ${date}\nЗаявок: ${orders.length}. Сохраните файл — открывается в Excel.`);
  if (reviews.length) await send(`handyman-otzyvy-${date}.csv`, toCsv(reviews, [["id", "ID"], ["created_at", "Дата"], ["status", "Статус"], ["name", "Имя"], ["rating", "Оценка"], ["text", "Текст"], ["reply", "Ответ"]]), `Отзывов: ${reviews.length}`);
}
async function statsText() {
  const orders = must(await sb.from("hm_orders").select("status,amount,created_at,done_at")) as any[];
  const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0);
  const inMonth = orders.filter((o) => new Date(o.created_at) >= m0);
  const doneMonth = orders.filter((o) => o.status === "done" && new Date(o.done_at || o.created_at) >= m0);
  const rev = doneMonth.reduce((a, o) => a + (o.amount || 0), 0);
  const all = orders.filter((o) => o.status === "done").reduce((a, o) => a + (o.amount || 0), 0);
  const paid = doneMonth.filter((o) => o.amount);
  return `📊 Статистика за ${m0.toLocaleDateString("ru-RU", { month: "long" })}\n\nЗаявок: ${inMonth.length}\nВыполнено: ${doneMonth.length}\nЗаработано: ${rub(rev)}\nСредний чек: ${paid.length ? rub(Math.round(rev / paid.length)) : "—"}\n\nНовых сейчас: ${orders.filter((o) => o.status === "new").length}, в работе: ${orders.filter((o) => o.status === "work").length}\nВсего заработано через сайт: ${rub(all)}`;
}

// ---------- Telegram webhook (buttons, commands, pairing) ----------
async function handleTelegram(req: Request) {
  const a = await getAdmin();
  if (!a.webhook_secret || req.headers.get("x-telegram-bot-api-secret-token") !== a.webhook_secret) return new Response("forbidden", { status: 403 });
  let u: any = {};
  try { u = await req.json(); } catch (_) { return new Response("ok"); }
  try {
    if (u.callback_query) {
      const q = u.callback_query;
      if (!a.chat_id || String(q.from?.id) !== String(a.chat_id)) { await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Нет доступа" }); return new Response("ok"); }
      const [kind, idS, val] = String(q.data || "").split(":"); const id = +idS;
      if (kind === "o" && STATUSES.includes(val)) {
        const patch: Record<string, unknown> = { status: val }; if (val === "done") patch.done_at = new Date().toISOString();
        const o = must(await sb.from("hm_orders").update(patch).eq("id", id).select("*").single()) as any;
        await tg("answerCallbackQuery", { callback_query_id: q.id, text: `Заявка: ${ST[val]}` });
        const rt = val === "done" ? await reviewRequestText(o.name) : "";
        await tg("editMessageReplyMarkup", { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: orderKb(o, rt) });
        if (val === "done") await tg("sendMessage", { chat_id: a.chat_id, text: `Сколько взяли за заказ №${o.num || o.id}? (id ${o.id})\nОтветьте на это сообщение числом — запишу в статистику.`, reply_markup: { force_reply: true, input_field_placeholder: "Например, 2500" } });
      } else if (kind === "r" && ["approved", "hidden"].includes(val)) {
        must(await sb.from("hm_reviews").update({ status: val }).eq("id", id));
        await republish();
        await tg("answerCallbackQuery", { callback_query_id: q.id, text: val === "approved" ? "Опубликовано на сайте" : "Скрыто" });
        await tg("editMessageReplyMarkup", { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text: val === "approved" ? "✅ Опубликован" : "🙈 Скрыт", callback_data: `r:${id}:${val === "approved" ? "hidden" : "approved"}` }]] } });
      } else await tg("answerCallbackQuery", { callback_query_id: q.id });
    } else if (u.message) {
      const m = u.message, text = String(m.text || "").trim();
      if (!a.chat_id) {
        if (m.chat?.type === "private" && a.pair_code && new Date(a.pair_expires) > new Date() && text.toUpperCase().includes(a.pair_code)) {
          await setAdmin({ chat_id: m.chat.id, pair_code: null, pair_expires: null });
          await tg("sendMessage", { chat_id: m.chat.id, text: "✅ Готово. Этот чат привязан к админке Handyman." });
        }
      } else if (String(m.chat?.id) === String(a.chat_id)) {
        const ref = /id (\d+)\)/.exec(m.reply_to_message?.text || "");
        if (ref) {
          const amount = parseInt(text.replace(/\D/g, ""), 10);
          if (Number.isFinite(amount)) { must(await sb.from("hm_orders").update({ amount }).eq("id", +ref[1])); await tg("sendMessage", { chat_id: a.chat_id, text: `Записал: ${rub(amount)} ✓` }); }
          else await tg("sendMessage", { chat_id: a.chat_id, text: "Не понял сумму. Ответьте числом, например 2500." });
        } else if (text.startsWith("/backup")) await sendBackup(a.chat_id);
        else if (text.startsWith("/stats")) await tg("sendMessage", { chat_id: a.chat_id, text: await statsText() });
        else await tg("sendMessage", { chat_id: a.chat_id, text: "Команды:\n/stats — статистика за месяц\n/backup — резервная копия заявок\n\nЗаявки и отзывы приходят сюда с кнопками.\nАдминка: " + SITE + "/admin/" });
      }
    }
  } catch (e) { console.error("tg", e); }
  return new Response("ok");
}

async function botSetup() {
  const a = await getAdmin();
  const secret = a.webhook_secret || rnd(24);
  await tg("setWebhook", { url: FN_URL, secret_token: secret, allowed_updates: ["message", "callback_query"] });
  if (!a.webhook_secret) await setAdmin({ webhook_secret: secret });
  await tg("setMyCommands", { commands: [{ command: "stats", description: "Статистика за месяц" }, { command: "backup", description: "Резервная копия заявок" }] });
  return { ok: true };
}

// ---------- auth ----------
async function status() {
  const a = await getAdmin();
  let bot = "";
  if (BOT) { try { bot = (await tg("getMe", {})).username; } catch (_) { /* bad token */ } }
  return { bot_ready: !!bot, bot, paired: !!a.chat_id };
}
async function pairStart() {
  const a = await getAdmin();
  if (a.chat_id) fail("Telegram уже привязан");
  const me = await tg("getMe", {});
  const code = rnd(3).toUpperCase();
  await setAdmin({ pair_code: code, pair_expires: new Date(Date.now() + 15 * 60_000).toISOString() });
  return { code, bot: me.username };
}
async function pairFinish() {
  let a = await getAdmin();
  if (a.chat_id) return { ok: true };
  if (!a.pair_code || new Date(a.pair_expires) < new Date()) fail("Код привязки истёк, начните заново");
  let ups: any[] = [];
  try { ups = await tg("getUpdates", { limit: 100, allowed_updates: ["message"] }); }
  catch (_) { a = await getAdmin(); if (a.chat_id) return { ok: true }; fail("Отправьте боту /start " + a.pair_code + ", подождите пару секунд и нажмите ещё раз"); }
  const hit = ups.find((u) => u.message?.chat?.type === "private" && String(u.message?.text || "").toUpperCase().includes(a.pair_code));
  if (!hit) fail("Не вижу сообщения с кодом. Отправьте боту /start " + a.pair_code + " и нажмите ещё раз");
  await setAdmin({ chat_id: hit.message.chat.id, pair_code: null, pair_expires: null });
  await tg("sendMessage", { chat_id: hit.message.chat.id, text: "✅ Готово. Этот чат привязан к админке Handyman." });
  return { ok: true };
}
async function loginRequest() {
  const a = await getAdmin();
  if (!a.chat_id) fail("Сначала привяжите Telegram");
  if (locked(a)) fail("Вход временно заблокирован из-за неверных кодов. Попробуйте через час", 429);
  if (a.last_code_at && Date.now() - new Date(a.last_code_at).getTime() < 45_000) fail("Код уже отправлен. Новый можно запросить через минуту");
  const inWindow = a.req_window && Date.now() - new Date(a.req_window).getTime() < 3600_000;
  if (inWindow && a.req_count >= 6) fail("Слишком много запросов кода. Попробуйте через час", 429);
  const code = digits6();
  await setAdmin({
    code_hash: await sha(code), code_expires: new Date(Date.now() + 5 * 60_000).toISOString(),
    code_attempts: 0, last_code_at: new Date().toISOString(),
    req_count: inWindow ? a.req_count + 1 : 1, req_window: inWindow ? a.req_window : new Date().toISOString(),
  });
  await tg("sendMessage", { chat_id: a.chat_id, text: `Код для входа в админку: ${code}\n\nДействует 5 минут. Если это не вы — ничего не делайте, без кода никто не войдёт.` });
  return { ok: true };
}
async function loginVerify(body: any) {
  const a = await getAdmin();
  if (locked(a)) fail("Вход временно заблокирован из-за неверных кодов. Попробуйте через час", 429);
  const code = str(body.code, 10).replace(/\D/g, "");
  if (!a.code_hash || !a.code_expires || new Date(a.code_expires) < new Date()) fail("Код истёк, запросите новый");
  if (a.code_attempts >= 5) fail("Слишком много попыток, запросите новый код");
  if ((await sha(code)) !== a.code_hash) {
    const fails = (a.fail_count || 0) + 1;
    if (fails >= 10) {
      await setAdmin({ code_attempts: a.code_attempts + 1, fail_count: 0, code_hash: null, lock_until: new Date(Date.now() + 3600_000).toISOString() });
      try { await tg("sendMessage", { chat_id: a.chat_id, text: "⚠️ 10 неверных кодов подряд. Вход в админку заблокирован на час. Если это были не вы — кто-то пытается подобрать код, ничего делать не нужно." }); } catch (_) { /* ignore */ }
      fail("Слишком много ошибок. Вход заблокирован на час", 429);
    }
    await setAdmin({ code_attempts: a.code_attempts + 1, fail_count: fails });
    fail("Неверный код");
  }
  await setAdmin({ code_hash: null, code_expires: null, code_attempts: 0, fail_count: 0, lock_until: null });
  const token = rnd(32);
  must(await sb.from("hm_admin_sessions").insert({ token_hash: await sha(token), expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() }));
  await sb.from("hm_admin_sessions").delete().lt("expires_at", new Date().toISOString());
  try { await tg("sendMessage", { chat_id: a.chat_id, text: "🔐 Выполнен вход в админку." }); } catch (_) { /* ignore */ }
  try { await botSetup(); } catch (e) { console.error("bot setup", e); }
  return { token };
}

// ---------- admin ----------
async function list(body: any) {
  const t = TABLES[body.table] ?? fail("Нет такой таблицы");
  let q = sb.from(t.name).select("*").order(t.order[0], { ascending: t.order[1] });
  if (body.table === "orders") q = q.limit(1000);
  return { rows: must(await q) };
}
async function save(body: any) {
  const t = TABLES[body.table] ?? fail("Нет такой таблицы");
  const src = body.row || {};
  const row: Record<string, unknown> = {};
  for (const c of t.cols) if (c in src) row[c] = src[c] === "" && (c === "price_from" || c === "amount") ? null : src[c];
  if (body.table === "orders") {
    if (row.status && !STATUSES.includes(String(row.status))) fail("Неверный статус");
    if (row.status === "done") row.done_at = new Date().toISOString();
    if ("amount" in row && row.amount != null) { const n = Math.round(+String(row.amount).replace(/\D/g, "")); row.amount = Number.isFinite(n) ? n : null; }
  }
  if (body.table === "reviews" && row.status && !["pending", "approved", "hidden"].includes(String(row.status))) fail("Неверный статус");
  if (t.key) {
    const key = str(src[t.key], 60) || fail("Нет ключа");
    return { row: must(await sb.from(t.name).update(row).eq(t.key, key).select().single()) };
  }
  if (src.id) return { row: must(await sb.from(t.name).update(row).eq("id", src.id).select().single()) };
  if (["orders", "reviews"].includes(body.table)) fail("Создаются только с сайта");
  return { row: must(await sb.from(t.name).insert(row).select().single()) };
}
async function remove(body: any) {
  if (!["services", "cases", "gallery", "orders", "reviews", "warranties"].includes(body.table)) fail("Нельзя удалить");
  const t = TABLES[body.table];
  must(await sb.from(t.name).delete().eq(t.key || "id", t.key ? str(body.id, 60) : body.id));
  return { ok: true };
}
async function reorder(body: any) {
  if (!["services", "cases", "gallery"].includes(body.table) || !Array.isArray(body.ids)) fail("Неверные данные");
  const name = TABLES[body.table].name;
  await Promise.all(body.ids.slice(0, 300).map((id: number, i: number) => sb.from(name).update({ sort: (i + 1) * 10 }).eq("id", id)));
  return { ok: true };
}
async function uploadUrl(body: any) {
  const ext = ({ webp: "webp", jpg: "jpg", jpeg: "jpg", png: "png" } as Record<string, string>)[String(body.ext).toLowerCase()] ?? fail("Формат не поддерживается");
  const path = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${rnd(4)}.${ext}`;
  const d = must(await sb.storage.from(BUCKET).createSignedUploadUrl(path)) as any;
  return { signedUrl: d.signedUrl, publicUrl: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}
async function logoutAll() { await sb.from("hm_admin_sessions").delete().neq("token_hash", ""); return { ok: true }; }
async function logout(token: string) { await sb.from("hm_admin_sessions").delete().eq("token_hash", await sha(token)); return { ok: true }; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.headers.has("x-telegram-bot-api-secret-token")) return await handleTelegram(req);
    const url = new URL(req.url);
    if (req.method === "GET") {
      if (url.searchParams.get("action") === "content") return json(await content(), 200, { "Cache-Control": "public, max-age=30" });
      return json({ ok: true });
    }
    const raw = await req.text();
    if (raw.length > 100_000) fail("Слишком большой запрос", 413);
    let body: any = {};
    try { body = JSON.parse(raw || "{}"); } catch (_) { fail("Неверный JSON"); }
    switch (body.action) {
      case "content": return json(await content());
      case "order": return json(await order(body, req));
      case "review": return json(await reviewSubmit(body, req));
      case "warranty": return json(await warrantyGet(body));
      case "status": return json(await status());
      case "pair_start": return json(await pairStart());
      case "pair_finish": return json(await pairFinish());
      case "login_request": return json(await loginRequest());
      case "login_verify": return json(await loginVerify(body));
      case "cron_backup": {
        const a = await getAdmin();
        if (!a.cron_secret || str(body.secret, 100) !== a.cron_secret) fail("Нет доступа", 403);
        if (a.chat_id) await sendBackup(a.chat_id);
        return json({ ok: true });
      }
    }
    const token = await requireSession(req);
    switch (body.action) {
      case "me": return json({ ok: true });
      case "logout": return json(await logout(token));
      case "logout_all": return json(await logoutAll());
      case "list": return json(await list(body));
      case "save": { const r = await save(body); if (!PRIVATE_TABLES.includes(body.table)) await republish(); return json(r); }
      case "delete": { const r = await remove(body); if (!PRIVATE_TABLES.includes(body.table)) await republish(); return json(r); }
      case "reorder": { const r = await reorder(body); await republish(); return json(r); }
      case "publish": await republish(); return json({ ok: true });
      case "upload_url": return json(await uploadUrl(body));
      case "warranty_create": return json(await warrantyCreate(body));
      case "review_request_text": return json({ text: await reviewRequestText(str(body.name, 80)) });
      case "bot_setup": return json(await botSetup());
      case "backup_now": { const a = await getAdmin(); if (a.chat_id) await sendBackup(a.chat_id); return json({ ok: true }); }
    }
    fail("Неизвестное действие");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Ошибка сервера, попробуйте ещё раз" }, 500);
  }
});
