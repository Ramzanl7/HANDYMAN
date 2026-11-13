(() => {
  const API = window.HM_API;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tok = () => { try { return localStorage.getItem('hm_t') || ''; } catch { return ''; } };
  const setTok = t => { try { t ? localStorage.setItem('hm_t', t) : localStorage.removeItem('hm_t'); } catch {} };
  let toastT;
  const toast = (m, err) => { const t = $('#toast'); t.textContent = m; t.className = 'toast on' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast', 2400); };

  async function call(action, data = {}) {
    const h = { 'content-type': 'application/json' };
    if (tok()) h.authorization = 'Bearer ' + tok();
    let r, j;
    try { r = await fetch(API, { method: 'POST', headers: h, body: JSON.stringify({ action, ...data }) }); j = await r.json(); }
    catch { throw new Error('Нет связи с сервером'); }
    if (r.status === 401 && !['login_verify', 'login_request'].includes(action)) { setTok(''); showLogin(); throw new Error(j.error || 'Нужно войти'); }
    if (!r.ok || j.error) throw new Error(j.error || 'Ошибка');
    return j;
  }
  const busy = async (btn, fn) => { const t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = t; } };
  const fmtDate = d => new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const rub = n => Number(n).toLocaleString('ru-RU') + ' ₽';

  /* ================= LOGIN ================= */
  const lgMsg = m => $('#lgMsg').textContent = m || '';
  async function showLogin() {
    $('#panel').hidden = true; $('#logout').hidden = true; $('#logoutAll').hidden = true; $('#login').hidden = false;
    ['#lgNoBot', '#lgPair', '#lgCode'].forEach(s => $(s).hidden = true); $('#lgLoading').hidden = false; lgMsg('');
    try {
      const s = await call('status');
      $('#lgLoading').hidden = true;
      if (!s.bot_ready) $('#lgNoBot').hidden = false;
      else if (!s.paired) $('#lgPair').hidden = false;
      else $('#lgCode').hidden = false;
    } catch (e) { $('#lgLoading').hidden = true; lgMsg(e.message); }
  }
  $('#pairStart').onclick = e => busy(e.currentTarget, async () => {
    lgMsg('');
    try {
      const r = await call('pair_start');
      $('#botName').textContent = '@' + r.bot; $('#botLink').href = 'https://t.me/' + r.bot + '?start=' + r.code;
      $('#pairCmd').textContent = '/start ' + r.code; $('#pairBox').hidden = false; $('#pairStart').hidden = true;
    } catch (e) { lgMsg(e.message); }
  });
  $('#pairFinish').onclick = e => busy(e.currentTarget, async () => {
    lgMsg('');
    try { await call('pair_finish'); toast('Telegram привязан ✓'); showLogin(); } catch (err) { lgMsg(err.message); }
  });
  const reqCode = btn => busy(btn, async () => {
    lgMsg('');
    try { await call('login_request'); $('#codeBox').hidden = false; $('#getCode').hidden = true; $('#codeIn').focus(); toast('Код отправлен в Telegram'); }
    catch (e) { lgMsg(e.message); }
  });
  $('#getCode').onclick = e => reqCode(e.currentTarget);
  $('#again').onclick = e => reqCode(e.currentTarget);
  const verify = () => busy($('#verify'), async () => {
    lgMsg('');
    try { const r = await call('login_verify', { code: $('#codeIn').value }); setTok(r.token); showPanel(); }
    catch (e) { lgMsg(e.message); $('#codeIn').select(); }
  });
  $('#verify').onclick = verify;
  $('#codeIn').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); if (e.target.value.length === 6) verify(); });
  $('#logout').onclick = async () => { try { await call('logout'); } catch {} setTok(''); showLogin(); };
  $('#logoutAll').onclick = async () => { if (!confirm('Выйти из админки на всех телефонах и компьютерах?')) return; try { await call('logout_all'); } catch {} setTok(''); showLogin(); toast('Вы вышли везде'); };
  $('#recheck').onclick = () => location.reload();

  /* ================= PANEL ================= */
  let tab = 'orders';
  function showPanel() {
    $('#login').hidden = true; $('#panel').hidden = false; $('#logout').hidden = false; $('#logoutAll').hidden = false;
    go(location.hash.slice(1) || 'orders');
  }
  function go(t) {
    if (!VIEWS[t]) t = 'orders';
    tab = t; history.replaceState(null, '', '#' + t);
    $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('#view').innerHTML = '<div class="empty"><span class="spin"></span></div>';
    VIEWS[t]().catch(e => { $('#view').innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
    scrollTo(0, 0);
  }
  $('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); };

  /* ---------- orders ---------- */
  const ST = { new: 'Новая', work: 'В работе', done: 'Готово', cancel: 'Отмена' };
  let oFilter = 'active', orders = [];
  const setBadge = () => { const n = orders.filter(o => o.status === 'new').length; $('#badge').hidden = !n; $('#badge').textContent = n; };
  async function vOrders() {
    orders = (await call('list', { table: 'orders' })).rows; setBadge();
    renderOrders();
  }
  function renderOrders() {
    const F = { active: o => o.status === 'new' || o.status === 'work', new: o => o.status === 'new', done: o => o.status === 'done', all: () => true };
    const list = orders.filter(F[oFilter]);
    const cnt = k => orders.filter(F[k]).length;
    $('#view').innerHTML = `<h1>Заявки</h1><p class="sub">Каждый наряд с сайта сохраняется здесь и приходит вам в Telegram.</p>
      <div class="filters">${[['active', 'Активные'], ['new', 'Новые'], ['done', 'Готово'], ['all', 'Все']].map(([k, t]) => `<button data-f="${k}" class="${k === oFilter ? 'on' : ''}">${t} · ${cnt(k)}</button>`).join('')}</div>
      ${list.length ? list.map(orderCard).join('') : '<div class="empty">Пока пусто. Как только кто-то отправит наряд с сайта — он появится здесь.</div>'}`;
    $('.filters').onclick = e => { const b = e.target.closest('button'); if (b) { oFilter = b.dataset.f; renderOrders(); } };
  }
  function orderCard(o) {
    const ph = (o.phone || '').replace(/[^\d+]/g, '');
    const wa = ph ? 'https://wa.me/' + ph.replace(/^\+/, '').replace(/^8/, '7') : '';
    return `<article class="card order" data-id="${o.id}">
      <div class="hd"><b>№ ${esc(o.num || o.id)}</b><span>${fmtDate(o.created_at)}</span><span class="st ${o.status}">${ST[o.status]}</span></div>
      ${o.items?.length ? `<ul>${o.items.map(i => `<li>${esc(i.name)}${i.price_from ? `<span>от ${rub(i.price_from)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      <dl class="kv">
        ${o.total_from ? `<dt>Примерно</dt><dd><b>от ${rub(o.total_from)}</b></dd>` : ''}
        ${o.name ? `<dt>Имя</dt><dd>${esc(o.name)}</dd>` : ''}
        ${o.phone ? `<dt>Телефон</dt><dd><a href="tel:${esc(ph)}">${esc(o.phone)}</a></dd>` : ''}
        ${o.area ? `<dt>Район</dt><dd>${esc(o.area)}</dd>` : ''}
        ${o.when_text ? `<dt>Когда</dt><dd>${esc(o.when_text)}</dd>` : ''}
        ${o.note ? `<dt>Коммент.</dt><dd>${esc(o.note)}</dd>` : ''}
      </dl>
      <textarea class="note" placeholder="Заметка для себя: адрес, цена, договорились на…">${esc(o.admin_note)}</textarea>
      <div class="acts">
        ${ph ? `<a class="btn sm" href="tel:${esc(ph)}">☎ Позвонить</a><a class="btn sm" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${o.status !== 'work' ? `<button class="btn sm" data-s="work">В работу</button>` : ''}
        ${o.status !== 'done' ? `<button class="btn sm y" data-s="done">✓ Готово</button>` : ''}
        ${o.status !== 'cancel' ? `<button class="btn sm" data-s="cancel">Отмена</button>` : `<button class="btn sm" data-s="new">Вернуть</button>`}
      </div></article>`;
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('.order [data-s]'); if (!b) return;
    const id = +b.closest('.order').dataset.id, s = b.dataset.s;
    await busy(b, async () => {
      try { await call('save', { table: 'orders', row: { id, status: s } }); const o = orders.find(x => x.id === id); o.status = s; setBadge(); renderOrders(); toast(ST[s]); }
      catch (err) { toast(err.message, 1); }
    });
  });
  document.addEventListener('change', async e => {
    if (!e.target.matches('.order .note')) return;
    const id = +e.target.closest('.order').dataset.id, v = e.target.value;
    try { await call('save', { table: 'orders', row: { id, admin_note: v } }); orders.find(x => x.id === id).admin_note = v; toast('Заметка сохранена'); } catch (err) { toast(err.message, 1); }
  });

  /* ---------- image upload ---------- */
  async function shrink(file, max = 1600) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let blob = await new Promise(r => c.toBlob(r, 'image/webp', .82));
      if (!blob || blob.type !== 'image/webp') blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .85));
      return blob;
    } finally { URL.revokeObjectURL(url); }
  }
  async function upload(file) {
    const blob = await shrink(file);
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const { signedUrl, publicUrl } = await call('upload_url', { ext });
    const r = await fetch(signedUrl, { method: 'PUT', headers: { 'content-type': blob.type }, body: blob });
    if (!r.ok) throw new Error('Не удалось загрузить фото');
    return publicUrl;
  }
  const pickHTML = (name, url, label) => `<label class="pick" data-pick="${name}">${url ? `<img src="${esc(url)}" alt="">` : `<span>＋<br>${label}</span>`}<input type="file" accept="image/*"><input type="hidden" name="${name}" value="${esc(url || '')}"></label>`;
  function bindPicks(root) {
    root.querySelectorAll('.pick').forEach(p => p.querySelector('input[type=file]').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      const ld = document.createElement('div'); ld.className = 'ld'; ld.innerHTML = '<span><span class="spin"></span> загрузка…</span>'; p.append(ld);
      try {
        const u = await upload(f);
        p.querySelector('input[type=hidden]').value = u;
        let im = p.querySelector('img'); if (!im) { p.querySelector('span')?.remove(); im = document.createElement('img'); p.prepend(im); }
        im.src = u;
      } catch (err) { toast(err.message, 1); } finally { ld.remove(); e.target.value = ''; }
    }));
  }

  /* ---------- dialog helper ---------- */
  function openDlg(html, onSave, onDelete) {
    const d = $('#dlg'), f = $('#dlgForm');
    f.innerHTML = html + `<div class="dacts"><span>${onDelete ? '<button type="button" class="btn sm del" id="dDel">Удалить</button>' : ''}</span><span style="display:flex;gap:8px"><button type="button" class="btn sm" id="dCancel">Отмена</button><button type="submit" class="btn sm ink" id="dSave">Сохранить</button></span></div>`;
    bindPicks(f);
    $('#dCancel').onclick = () => d.close();
    if (onDelete) $('#dDel').onclick = async () => { if (!confirm('Удалить безвозвратно?')) return; try { await onDelete(); d.close(); } catch (e) { toast(e.message, 1); } };
    f.onsubmit = async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(f).entries());
      f.querySelectorAll('input[type=checkbox]').forEach(c => data[c.name] = c.checked);
      await busy($('#dSave'), async () => { try { await onSave(data); d.close(); } catch (err) { toast(err.message, 1); } });
    };
    d.showModal();
  }
  const reorder = async (table, rows, i, dir) => {
    const j = i + dir; if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    await call('reorder', { table, ids: rows.map(r => r.id) });
  };

  /* ---------- cases ---------- */
  let cases = [];
  async function vCases() { cases = (await call('list', { table: 'cases' })).rows; renderCases(); }
  function renderCases() {
    $('#view').innerHTML = `<h1>Работы</h1><p class="sub">Кейсы «было / стало» на сайте. Нажмите на работу, чтобы изменить. Порядок — стрелками.</p>
      <p style="margin-bottom:14px"><button class="btn ink" id="addCase">＋ Добавить работу</button></p>
      ${cases.map((c, i) => `<div class="card row ${c.published ? '' : 'off'}" data-i="${i}">
        <div class="thumbs"><img src="${esc(c.before_url || '')}" alt=""><img src="${esc(c.after_url || '')}" alt=""></div>
        <div class="grow"><b>${esc(c.title)}</b><small>${esc(c.tag)}${c.published ? '' : ' · СКРЫТО'}</small></div>
        <div class="ord"><button data-mv="-1">▲</button><button data-mv="1">▼</button></div></div>`).join('') || '<div class="empty">Работ пока нет</div>'}`;
    $('#addCase').onclick = () => caseDlg({ published: true, before_cap: 'было', after_cap: 'стало ✓' });
    $$('#view [data-i]').forEach(el => {
      const i = +el.dataset.i;
      el.onclick = e => { if (!e.target.closest('[data-mv]')) caseDlg(cases[i]); };
      el.querySelectorAll('[data-mv]').forEach(b => b.onclick = async () => { try { await reorder('cases', cases, i, +b.dataset.mv); renderCases(); } catch (e) { toast(e.message, 1); } });
    });
  }
  function caseDlg(c) {
    openDlg(`<h2>${c.id ? 'Работа' : 'Новая работа'}</h2>
      <div class="two">${pickHTML('before_url', c.before_url, 'фото «было»')}${pickHTML('after_url', c.after_url, 'фото «стало»')}</div>
      <div class="f"><label>Название</label><input name="title" required value="${esc(c.title)}" placeholder="Например: Шкаф-купе"></div>
      <div class="f"><label>Категория (в шапке квитанции)</label><input name="tag" value="${esc(c.tag)}" placeholder="СБОРКА МЕБЕЛИ"></div>
      <div class="f"><label>Было</label><textarea name="was" rows="2">${esc(c.was)}</textarea></div>
      <div class="f"><label>Сделал</label><textarea name="did" rows="2">${esc(c.did)}</textarea></div>
      <div class="f"><label>Итог (коротко)</label><input name="result" value="${esc(c.result)}" placeholder="ДВЕРИ ЗАКРЫВАЮТСЯ МЯГКО"></div>
      <div class="two"><div class="f"><label>Подпись «было»</label><input name="before_cap" value="${esc(c.before_cap)}"></div><div class="f"><label>Подпись «стало»</label><input name="after_cap" value="${esc(c.after_cap)}"></div></div>
      <label class="chk"><input type="checkbox" name="published" ${c.published ? 'checked' : ''}> Показывать на сайте</label>`,
      async d => {
        if (!d.before_url || !d.after_url) throw new Error('Добавьте оба фото');
        const row = { ...d, id: c.id }; if (!c.id) row.sort = (cases.at(-1)?.sort || 0) + 10;
        await call('save', { table: 'cases', row }); toast('Сохранено'); await vCases();
      },
      c.id ? async () => { await call('delete', { table: 'cases', id: c.id }); toast('Удалено'); await vCases(); } : null);
  }

  /* ---------- gallery ---------- */
  let gal = [];
  async function vGallery() { gal = (await call('list', { table: 'gallery' })).rows; renderGallery(); }
  function renderGallery() {
    $('#view').innerHTML = `<h1>Фото</h1><p class="sub">Галерея «Мебель и объекты». Нажмите на фото, чтобы изменить.</p>
      <p style="margin-bottom:14px"><button class="btn ink" id="addG">＋ Добавить фото</button></p>
      <div class="grid">${gal.map((g, i) => `<div class="tile ${g.published ? '' : 'off'}" data-i="${i}">${g.published ? '' : '<span class="hid">СКРЫТО</span>'}<img src="${esc(g.image_url)}" alt="" loading="lazy"><p><b>${esc(g.title)}</b><span>${esc(g.tag)}</span></p>
        <div class="ord" style="flex-direction:row;margin-top:6px"><button data-mv="-1">◀</button><button data-mv="1">▶</button></div></div>`).join('')}</div>`;
    $('#addG').onclick = () => galDlg({ published: true });
    $$('#view .tile').forEach(el => {
      const i = +el.dataset.i;
      el.onclick = e => { if (e.target.closest('[data-mv]')) return; galDlg(gal[i]); };
      el.querySelectorAll('[data-mv]').forEach(b => b.onclick = async () => { try { await reorder('gallery', gal, i, +b.dataset.mv); renderGallery(); } catch (e) { toast(e.message, 1); } });
    });
  }
  function galDlg(g) {
    openDlg(`<h2>${g.id ? 'Фото' : 'Новое фото'}</h2>
      <div style="max-width:260px">${pickHTML('image_url', g.image_url, 'выбрать фото')}</div>
      <div class="two"><div class="f"><label>Подпись</label><input name="title" value="${esc(g.title)}" placeholder="Шкаф-купе"></div><div class="f"><label>Тег</label><input name="tag" value="${esc(g.tag)}" placeholder="сборка"></div></div>
      <label class="chk"><input type="checkbox" name="published" ${g.published ? 'checked' : ''}> Показывать на сайте</label>`,
      async d => {
        if (!d.image_url) throw new Error('Выберите фото');
        const row = { ...d, id: g.id }; if (!g.id) row.sort = (gal.at(-1)?.sort || 0) + 10;
        await call('save', { table: 'gallery', row }); toast('Сохранено'); await vGallery();
      },
      g.id ? async () => { await call('delete', { table: 'gallery', id: g.id }); toast('Удалено'); await vGallery(); } : null);
  }

  /* ---------- prices ---------- */
  let serv = [];
  async function vServices() { serv = (await call('list', { table: 'services' })).rows; renderServices(); }
  function renderServices() {
    const groups = []; const by = {};
    serv.forEach(s => { if (!by[s.cat]) { by[s.cat] = { k: s.cat, t: s.cat_title, items: [] }; groups.push(by[s.cat]); } by[s.cat].items.push(s); });
    $('#view').innerHTML = `<h1>Цены</h1><p class="sub">Цена «от» видна клиенту в наряде. Пустое поле — цена не показывается. Сохраняется само.</p>
      ${groups.map(g => `<section class="card cat" data-cat="${esc(g.k)}"><h3>${esc(g.t)}<button class="btn sm" data-add>＋ строка</button></h3>
        ${g.items.map(s => `<div class="prow" data-id="${s.id}"><input value="${esc(s.name)}" data-f="name"><span class="p">от<input inputmode="numeric" value="${s.price_from ?? ''}" data-f="price_from" placeholder="—">₽</span><button class="x" data-del title="Удалить">✕</button></div>`).join('')}
      </section>`).join('')}
      <button class="btn" id="addCat">＋ Новая категория</button>`;
    $$('#view .prow input').forEach(inp => inp.addEventListener('change', async () => {
      const id = +inp.closest('.prow').dataset.id, f = inp.dataset.f;
      let v = inp.value.trim(); if (f === 'price_from') { v = v.replace(/\D/g, ''); inp.value = v; v = v ? +v : null; }
      try { await call('save', { table: 'services', row: { id, [f]: v } }); const s = serv.find(x => x.id === id); s[f] = v; toast('Сохранено'); } catch (e) { toast(e.message, 1); }
    }));
    $$('#view [data-del]').forEach(b => b.onclick = async () => {
      const id = +b.closest('.prow').dataset.id; if (!confirm('Удалить строку?')) return;
      try { await call('delete', { table: 'services', id }); serv = serv.filter(x => x.id !== id); renderServices(); } catch (e) { toast(e.message, 1); }
    });
    $$('#view [data-add]').forEach(b => b.onclick = async () => {
      const k = b.closest('.cat').dataset.cat, g = by[k], last = g.items.at(-1);
      const name = prompt('Название услуги'); if (!name) return;
      try { await call('save', { table: 'services', row: { cat: k, cat_title: g.t, name, sort: (last?.sort || 0) + 1 } }); await vServices(); } catch (e) { toast(e.message, 1); }
    });
    $('#addCat').onclick = async () => {
      const t = prompt('Название категории'); if (!t) return;
      const name = prompt('Первая услуга в категории'); if (!name) return;
      try { await call('save', { table: 'services', row: { cat: 'c' + Date.now().toString(36), cat_title: t, name, sort: (serv.at(-1)?.sort || 0) + 10 } }); await vServices(); } catch (e) { toast(e.message, 1); }
    };
  }

  /* ---------- texts ---------- */
  async function vTexts() {
    const rows = (await call('list', { table: 'texts' })).rows;
    $('#view').innerHTML = `<h1>Тексты</h1><p class="sub">Измените текст и нажмите в другом месте — сохранится само. **Слово** — жирным.</p>
      ${rows.map(r => `<div class="card tx" data-k="${esc(r.key)}"><label>${esc(r.label)}</label><textarea rows="${Math.min(6, Math.ceil(r.value.length / 60) + 1)}">${esc(r.value)}</textarea><div class="ok"></div></div>`).join('')}`;
    $$('#view .tx textarea').forEach(t => t.addEventListener('change', async () => {
      const box = t.closest('.tx'), ok = box.querySelector('.ok');
      try { await call('save', { table: 'texts', row: { key: box.dataset.k, value: t.value } }); ok.textContent = '✓ сохранено'; setTimeout(() => ok.textContent = '', 2000); } catch (e) { toast(e.message, 1); }
    }));
  }

  const VIEWS = { orders: vOrders, cases: vCases, gallery: vGallery, services: vServices, texts: vTexts };

  /* ---------- start ---------- */
  if (!API) { document.body.innerHTML = '<div class="wrap"><h1>Не настроено</h1><p>В config.js нет адреса API.</p></div>'; return; }
  (async () => { if (tok()) { try { await call('me'); return showPanel(); } catch {} } showLogin(); })();
  setInterval(() => { if (!document.hidden && tok() && tab === 'orders' && !$('#panel').hidden && !$('#dlg').open && !document.activeElement?.matches('textarea')) vOrders().catch(() => {}); }, 60000);
})();
