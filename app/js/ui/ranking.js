/**
 * Sağ panel: seçili gösterge ve yıla göre ülke sıralaması.
 *
 * Sıra değiştiğinde satırlar yeni yerlerine kayarak gider (FLIP). Yıl oynatıldığı
 * sırada bu, verinin nasıl kaydığını okunur kılan asıl şey oluyor.
 *
 * İki başarım notu:
 *  - Satır düğümleri ISO3 anahtarıyla yeniden kullanılıyor; her karede tablo
 *    baştan kurulmuyor. (Eski sürüm döngü içinde innerHTML += yapıyordu:
 *    iki yüz satır için iki yüz kez yeniden ayrıştırma.)
 *  - FLIP ölçümleri iki toplu okuma/yazma turunda yapılıyor ve yalnızca ekrana
 *    yakın satırlar animasyona sokuluyor.
 */

const FLAG = (iso2) => `https://flagcdn.com/w40/${iso2.toLowerCase()}.png`;

export function createRanking(root, { onSelect }) {
  const list = root.querySelector('.rank-list');
  const title = root.querySelector('.rank-subtitle');
  const orderButtons = [...root.querySelectorAll('.rank-order button')];

  const rows = new Map();        // iso3 -> <li>
  let descending = true;
  let selected = null;
  let compared = null;
  let lastRender = null;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  for (const btn of orderButtons) {
    btn.addEventListener('click', () => {
      const next = btn.dataset.order === 'desc';
      if (next === descending) return;
      descending = next;
      syncOrderButtons();
      if (lastRender) render(lastRender);
    });
  }

  function syncOrderButtons() {
    for (const btn of orderButtons) {
      btn.setAttribute('aria-pressed', String((btn.dataset.order === 'desc') === descending));
    }
  }
  syncOrderButtons();

  function buildRow(iso3, country) {
    const li = document.createElement('li');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rank-row';
    btn.dataset.iso3 = iso3;

    const pos = document.createElement('span');
    pos.className = 'rank-pos num';

    const flag = document.createElement('img');
    flag.className = 'rank-flag';
    flag.loading = 'lazy';
    flag.decoding = 'async';
    flag.alt = '';
    if (country.iso2) flag.src = FLAG(country.iso2);
    // Bayrak yoksa kırık görsel simgesi yerine boş bir kutu kalsın
    flag.addEventListener('error', () => { flag.removeAttribute('src'); }, { once: true });

    const name = document.createElement('span');
    name.className = 'rank-name';

    const value = document.createElement('span');
    value.className = 'rank-value';

    btn.append(pos, flag, name, value);
    btn.addEventListener('click', () => onSelect(iso3));
    li.appendChild(btn);

    li._parts = { btn, pos, name, value };
    return li;
  }

  /**
   * @param {{indicator: object, year: number, values: Array<{iso3, value}>,
   *          countries: Map<string, object>, scale: object}} state
   */
  function render(state) {
    lastRender = state;
    const { indicator, year, values, countries, scale } = state;

    // Değerler birimsiz yazılıyor (dar sütun); birim başlıkta bir kez duruyor.
    // Ülke sayısı zaten zaman şeridindeki "Kapsam" alanında.
    title.textContent = values.length
      ? `${year} · ${indicator.unit}`
      : `${year} · veri yok`;

    const ordered = [...values].sort((a, b) =>
      descending ? b.value - a.value : a.value - b.value
    );

    /* --- 0) izlenmeyen düğümleri temizle ---
       İskelet satırları ve "kayıt yok" iletisi `rows` haritasında olmadığı için
       aşağıdaki silme döngüsü onlara dokunmuyordu; veri gelince gerçek satırların
       üstünde kalıcı bir boşluk olarak duruyorlardı. */
    for (const child of [...list.children]) {
      if (!child._parts) child.remove();
    }

    /* --- FLIP: 1) eski konumları oku --- */
    const before = new Map();
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;
    const shouldAnimate = !reduceMotion && rows.size > 0;

    if (shouldAnimate) {
      for (const [iso3, li] of rows) before.set(iso3, li.offsetTop);
    }

    /* --- 2) içeriği ve sırayı güncelle --- */
    const fragment = document.createDocumentFragment();
    const seen = new Set();
    const peak = scale.max || 1;
    const floor = scale.min || 0;
    const span = peak - floor || 1;

    ordered.forEach((entry, i) => {
      const country = countries.get(entry.iso3);
      if (!country) return;

      let li = rows.get(entry.iso3);
      if (!li) {
        li = buildRow(entry.iso3, country);
        rows.set(entry.iso3, li);
      }
      const { btn, pos, name, value } = li._parts;

      pos.textContent = String(i + 1);
      name.textContent = country.name;
      value.textContent = indicator.formatShort(entry.value);
      btn.style.setProperty('--bar', `${((entry.value - floor) / span) * 100}%`);
      btn.setAttribute('aria-current', String(entry.iso3 === selected));
      btn.dataset.compare = String(entry.iso3 === compared);
      btn.title = `${country.name} · ${indicator.format(entry.value)}`;

      seen.add(entry.iso3);
      fragment.appendChild(li);
    });

    for (const [iso3, li] of rows) {
      if (!seen.has(iso3)) { li.remove(); rows.delete(iso3); }
    }
    list.appendChild(fragment);

    if (!ordered.length) {
      list.textContent = '';
      rows.clear();
      const empty = document.createElement('li');
      empty.className = 'search-empty';
      empty.textContent = 'Bu yıl için kayıt yok. Sürgüyü başka bir yıla getirin.';
      list.appendChild(empty);
      return;
    }

    /* --- 3) yeni konumları oku, farkı geri al, sonra bırak --- */
    if (!shouldAnimate) return;

    const moves = [];
    for (const [iso3, li] of rows) {
      const from = before.get(iso3);
      if (from === undefined) continue;
      const to = li.offsetTop;
      const delta = from - to;
      // Yalnızca gerçekten yer değiştiren ve ekrana yakın satırları oynat
      if (Math.abs(delta) < 1) continue;
      if (to < viewTop - list.clientHeight || to > viewBottom + list.clientHeight) continue;
      moves.push([li, delta]);
    }

    for (const [li, delta] of moves) {
      li.style.transition = 'none';
      li.style.transform = `translate3d(0, ${delta}px, 0)`;
    }
    if (moves.length) {
      requestAnimationFrame(() => {
        for (const [li] of moves) {
          li.style.transition = '';
          li.style.transform = '';
          li.dataset.flip = 'true';
        }
      });
    }
  }

  /** Seçili ülkeyi işaretle ve listede görünür yap. */
  function select(iso3, { scroll = true } = {}) {
    selected = iso3;
    for (const [id, li] of rows) {
      li._parts.btn.setAttribute('aria-current', String(id === iso3));
    }
    if (scroll && iso3 && rows.has(iso3)) {
      rows.get(iso3).scrollIntoView({
        block: 'nearest',
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
    }
  }

  /** Karşılaştırmaya sabitlenmiş ülkeyi listede de işaretle. */
  function markCompare(iso3) {
    compared = iso3;
    for (const [id, li] of rows) {
      li._parts.btn.dataset.compare = String(id === iso3);
    }
  }

  function showSkeleton() {
    list.textContent = '';
    rows.clear();
    for (let i = 0; i < 12; i++) {
      const li = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'rank-row';
      const bar = document.createElement('span');
      bar.className = 'skeleton';
      bar.style.height = '14px';
      bar.style.width = `${45 + ((i * 37) % 45)}%`;
      bar.style.opacity = String(1 - i * 0.06);
      row.appendChild(bar);
      li.appendChild(row);
      list.appendChild(li);
    }
  }

  return { render, select, markCompare, showSkeleton };
}
