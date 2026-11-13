// Handyman Grozny API: public content + orders, Telegram login, admin CRUD.
// Deploy with verify_jwt=false: the function does its own auth (Telegram code -> session token).
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const BOT = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const BUCKET = "hm-media";

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

const clientIp = (req: Request) => {
  const h = req.headers;
  const xff = (h.get("x-forwarded-for") || "").split(",").map((x) => x.trim()).filter(Boolean);
  return h.get("cf-connecting-ip") || h.get("x-real-ip") || xff[xff.length - 1] || "";
};
const locked = (a: Record<string, any>) => a.lock_until && new Date(a.lock_until) > new Date();

// ---------- table whitelists for admin CRUD ----------
const TABLES: Record<string, { name: string; cols: string[]; order: [string, boolean]; key?: string }> = {
  orders: { name: "hm_orders", cols: ["status", "admin_note"], order: ["created_at", false] },
  services: { name: "hm_services", cols: ["cat", "cat_title", "name", "price_from", "sort", "active"], order: ["sort", true] },
  cases: { name: "hm_cases", cols: ["tag", "title", "was", "did", "result", "before_url", "after_url", "before_cap", "after_cap", "sort", "published"], order: ["sort", true] },
  gallery: { name: "hm_gallery", cols: ["title", "tag", "image_url", "sort", "published"], order: ["sort", true] },
  texts: { name: "hm_texts", cols: ["value"], order: ["sort", true], key: "key" },
};

async function requireSession(req: Request) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t || t.length < 32) fail("Нужно войти", 401);
  const row = must(await sb.from("hm_admin_sessions").select("expires_at").eq("token_hash", await sha(t)).maybeSingle());
  if (!row || new Date((row as any).expires_at) < new Date()) fail("Сессия истекла, войдите снова", 401);
  return t;
}

// ---------- public ----------
// Visitors read a static snapshot (Storage CDN), so page views never hit this function.
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
async function republish() {
  contentCache = null;
  await content();
}
async function loadContent() {
  const [t, s, c, g] = await Promise.all([
    sb.from("hm_texts").select("key,value"),
    sb.from("hm_services").select("id,cat,cat_title,name,price_from,sort").eq("active", true).order("sort"),
    sb.from("hm_cases").select("id,tag,title,was,did,result,before_url,after_url,before_cap,after_cap").eq("published", true).order("sort"),
    sb.from("hm_gallery").select("id,title,tag,image_url").eq("published", true).order("sort"),
  ]);
  const texts: Record<string, string> = {};
  (must(t) as any[]).forEach((r) => (texts[r.key] = r.value));
  return { texts, services: must(s), cases: must(c), gallery: must(g) };
}

async function order(body: any, req: Request) {
  const items = Array.isArray(body.items) ? body.items.slice(0, 40).map((i: any) => ({
    name: str(i?.name, 120), price_from: Number.isFinite(+i?.price_from) && +i.price_from > 0 ? Math.round(+i.price_from) : null,
  })).filter((i: any) => i.name) : [];
  const row = {
    num: str(body.num, 12), name: str(body.name, 80), phone: str(body.phone, 40), area: str(body.area, 160),
    when_text: str(body.when, 60), note: str(body.note, 1500), items,
    total_from: items.reduce((a: number, i: any) => a + (i.price_from || 0), 0) || null,
  };
  if (!items.length && !row.note) fail("Пустая заявка");
  if (body.consent !== true) fail("Нужно согласие на обработку персональных данных");
  // bots: hidden field filled or form sent faster than a human can
  if (str(body.website, 200) || (Number.isFinite(+body.t) && +body.t < 2500)) return { ok: true, id: 0 };
  const recent = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count: total } = await sb.from("hm_orders").select("id", { count: "exact", head: true }).gte("created_at", recent);
  if ((total ?? 0) >= 30) fail("Сейчас слишком много заявок, позвоните или напишите в WhatsApp", 429);
  const ip = clientIp(req);
  const ip_hash = ip ? (await sha("hm:" + ip)).slice(0, 24) : null;
  if (ip_hash) {
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await sb.from("hm_orders").select("id", { count: "exact", head: true }).eq("ip_hash", ip_hash).gte("created_at", since);
    if ((count ?? 0) >= 5) fail("Слишком много заявок, попробуйте позже", 429);
  }
  const saved = must(await sb.from("hm_orders").insert({ ...row, ip_hash, consent_at: new Date().toISOString() }).select("id").single()) as any;

  // notify the master in Telegram (best effort)
  try {
    const a = await getAdmin();
    if (a.chat_id && BOT) {
      const lines = [`🛠 Новая заявка №${row.num || saved.id}`, ""];
      items.forEach((i: any) => lines.push(`• ${i.name}${i.price_from ? ` — от ${i.price_from} ₽` : ""}`));
      if (row.total_from) lines.push("", `Примерно от ${row.total_from} ₽`);
      lines.push("");
      if (row.name) lines.push(`Имя: ${row.name}`);
      if (row.phone) lines.push(`Телефон: ${row.phone}`);
      if (row.area) lines.push(`Район: ${row.area}`);
      if (row.when_text) lines.push(`Когда: ${row.when_text}`);
      if (row.note) lines.push(`Комментарий: ${row.note}`);
      await tg("sendMessage", { chat_id: a.chat_id, text: lines.join("\n") });
    }
  } catch (_) { /* ignore */ }
  return { ok: true, id: saved.id };
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
  const a = await getAdmin();
  if (a.chat_id) fail("Telegram уже привязан");
  if (!a.pair_code || new Date(a.pair_expires) < new Date()) fail("Код привязки истёк, начните заново");
  const ups: any[] = await tg("getUpdates", { limit: 100, allowed_updates: ["message"] });
  const hit = ups.find((u) => u.message?.chat?.type === "private" && String(u.message?.text || "").toUpperCase().includes(a.pair_code));
  if (!hit) fail("Не вижу сообщения с кодом. Отправьте боту /start " + a.pair_code + " и нажмите ещё раз");
  await setAdmin({ chat_id: hit.message.chat.id, pair_code: null, pair_expires: null });
  if (ups.length) { try { await tg("getUpdates", { offset: ups[ups.length - 1].update_id + 1, limit: 1 }); } catch (_) { /* ignore */ } }
  await tg("sendMessage", { chat_id: hit.message.chat.id, text: "✅ Готово. Этот чат привязан к админке Handyman: сюда будут приходить коды для входа и новые заявки." });
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
  return { token };
}

// ---------- admin ----------
async function list(body: any) {
  const t = TABLES[body.table] ?? fail("Нет такой таблицы");
  let q = sb.from(t.name).select("*").order(t.order[0], { ascending: t.order[1] });
  if (body.table === "orders") q = q.limit(500);
  return { rows: must(await q) };
}

async function save(body: any) {
  const t = TABLES[body.table] ?? fail("Нет такой таблицы");
  const src = body.row || {};
  const row: Record<string, unknown> = {};
  for (const c of t.cols) if (c in src) row[c] = src[c] === "" && c === "price_from" ? null : src[c];
  if (body.table === "orders" && row.status && !["new", "work", "done", "cancel"].includes(String(row.status))) fail("Неверный статус");
  if (t.key) {
    const key = str(src[t.key], 60) || fail("Нет ключа");
    return { row: must(await sb.from(t.name).update(row).eq(t.key, key).select().single()) };
  }
  if (src.id) return { row: must(await sb.from(t.name).update(row).eq("id", src.id).select().single()) };
  if (body.table === "orders") fail("Заявки создаются только с сайта");
  return { row: must(await sb.from(t.name).insert(row).select().single()) };
}

async function remove(body: any) {
  if (!["services", "cases", "gallery", "orders"].includes(body.table)) fail("Нельзя удалить");
  must(await sb.from(TABLES[body.table].name).delete().eq("id", body.id));
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

async function logoutAll() {
  await sb.from("hm_admin_sessions").delete().neq("token_hash", "");
  return { ok: true };
}

async function logout(token: string) {
  await sb.from("hm_admin_sessions").delete().eq("token_hash", await sha(token));
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    if (req.method === "GET") {
      if (url.searchParams.get("action") === "content") return json(await content(), 200, { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=600", "CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=600" });
      return json({ ok: true });
    }
    const raw = await req.text();
    if (raw.length > 100_000) fail("Слишком большой запрос", 413);
    let body: any = {};
    try { body = JSON.parse(raw || "{}"); } catch (_) { fail("Неверный JSON"); }
    switch (body.action) {
      case "content": return json(await content());
      case "order": return json(await order(body, req));
      case "status": return json(await status());
      case "pair_start": return json(await pairStart());
      case "pair_finish": return json(await pairFinish());
      case "login_request": return json(await loginRequest());
      case "login_verify": return json(await loginVerify(body));
    }
    const token = await requireSession(req);
    switch (body.action) {
      case "me": return json({ ok: true });
      case "logout": return json(await logout(token));
      case "logout_all": return json(await logoutAll());
      case "list": return json(await list(body));
      case "save": { const r = await save(body); if (body.table !== "orders") await republish(); return json(r); }
      case "delete": { const r = await remove(body); if (body.table !== "orders") await republish(); return json(r); }
      case "reorder": { const r = await reorder(body); await republish(); return json(r); }
      case "publish": await republish(); return json({ ok: true });
      case "upload_url": return json(await uploadUrl(body));
    }
    fail("Неизвестное действие");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Ошибка сервера, попробуйте ещё раз" }, 500);
  }
});
