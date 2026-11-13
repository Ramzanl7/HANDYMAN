(() => {
  const box = document.getElementById('t');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const d = s => new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const token = new URLSearchParams(location.search).get('t') || '';
  const fail = m => { box.innerHTML = `<div class="haz"></div><div class="msg">${esc(m)}<br><br><a href="/">На сайт →</a></div>`; };
  if (!window.HM_API || !token) return fail('Ссылка на талон неполная. Попросите мастера прислать её ещё раз.');
  fetch(window.HM_API, { method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ action: 'warranty', token }) })
    .then(r => r.json())
    .then(w => {
      if (w.error) return fail(w.error);
      const valid = new Date(w.until) > new Date();
      const digits = (w.phone || '').replace(/\D/g, ''), intl = digits.length === 11 && digits[0] === '8' ? '7' + digits.slice(1) : digits;
      const text = `Здравствуйте, Рамзан! Пишу по гарантийному талону №${w.number}.`;
      document.title = `Гарантийный талон №${w.number} · Handyman`;
      box.innerHTML = `<div class="haz"></div><div class="in">
        <div class="top"><span class="logo"><span class="lvl"><i></i></span>HANDYMAN</span><span class="no">ТАЛОН № ${esc(w.number)}</span></div>
        <h1>Гарантийный<br><em>талон</em></h1>
        <span class="state ${valid ? 'ok' : 'exp'}">${valid ? '✓ ДЕЙСТВУЕТ ДО ' + d(w.until).toUpperCase() : 'СРОК ГАРАНТИИ ИСТЁК ' + d(w.until).toUpperCase()}</span>
        <dl class="kv">
          ${w.client_name ? `<dt>Клиент</dt><dd>${esc(w.client_name)}</dd>` : ''}
          <dt>Дата работ</dt><dd>${d(w.created_at)}</dd>
          <dt>Что сделано</dt><dd class="works">${esc(w.works)}</dd>
          <dt>Гарантия</dt><dd>${w.months} мес.</dd>
          ${w.note ? `<dt>Примечание</dt><dd>${esc(w.note)}</dd>` : ''}
          <dt>Мастер</dt><dd>Шахбиев Рамзан Исаевич${w.phone ? ` · <a href="tel:+${intl}">${esc(w.phone)}</a>` : ''}</dd>
        </dl>
        ${w.terms ? `<p class="terms">${esc(w.terms)}</p>` : ''}
        <div class="sign"><div><span class="hand">Рамзан</span><small>ПОДПИСЬ МАСТЕРА</small></div></div>
        <div class="acts">${intl ? `<a class="btn wa" href="https://wa.me/${intl}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Написать по гарантии</a><a class="btn" href="tel:+${intl}">☎ Позвонить</a>` : ''}<button class="btn" id="pr">Распечатать</button></div>
      </div><span class="stamp">ГАРАНТИЯ</span>`;
      document.getElementById('pr').onclick = () => print();
    })
    .catch(() => fail('Не удалось загрузить талон. Проверьте интернет и обновите страницу.'));
})();
