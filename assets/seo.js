// Service pages: refresh prices / phone from the admin snapshot and load Yandex Metrika if configured.
(() => {
  const $$ = s => [...document.querySelectorAll(s)];
  const rub = n => Number(n).toLocaleString('ru-RU') + ' ₽';
  const units = { 'Уложить ламинат': ' / м²', 'Уложить линолеум': ' / м²', 'Установить плинтус': ' / пог. м' };
  if (!window.HM_CONTENT) return;
  fetch(window.HM_CONTENT).then(r => r.ok ? r.json() : null).then(d => {
    if (!d) return;
    const T = d.texts || {};
    const byName = {}; (d.services || []).forEach(s => (byName[s.name] = s));
    $$('.prices tr[data-name]').forEach(tr => { const s = byName[tr.dataset.name]; if (s) tr.querySelector('.pr').textContent = s.price_from ? 'от ' + rub(s.price_from) + (units[s.name] || '') : 'по договорённости'; });
    if (T.phone) {
      const d2 = T.phone.replace(/\D/g, ''), intl = d2.length === 11 && d2[0] === '8' ? '7' + d2.slice(1) : d2;
      if (intl.length >= 11) { $$('a[href^="tel:"]').forEach(a => a.href = 'tel:+' + intl); $$('a[href*="wa.me/"]').forEach(a => a.href = a.href.replace(/wa\.me\/\d+/, 'wa.me/' + intl)); $$('[data-phone]').forEach(e => e.textContent = T.phone); }
    }
    const id = String(T.metrika_id || '').replace(/\D/g, '');
    if (id) {
      (function (m, e, t, r, i, k, a) { m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); }; m[i].l = 1 * new Date(); k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a); })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
      window.ym(+id, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
      document.addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; const g = a.href.startsWith('tel:') ? 'call' : a.href.includes('wa.me/') ? 'whatsapp' : a.href.includes('#order') ? 'service_to_order' : ''; if (g) window.ym(+id, 'reachGoal', g); });
    }
  }).catch(() => {});
})();
