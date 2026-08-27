/**
 * Ülke araması.
 *
 * Türkçe yazımı bağışlar: "turkiye", "Türkiye"yi; "guney kore", "Güney Kore"yi
 * bulur. Aynı zamanda ISO kodları ve İngilizce adlar üzerinden de eşleşir, çünkü
 * insanlar "TUR" ya da "Germany" da yazıyor.
 */

const FOLD = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/** Aksanları ve büyük/küçük farkını düşürerek karşılaştırılabilir bir dizge üretir. */
export function fold(text) {
  return String(text)
    .replace(/[çğıİöşüâîû]/g, (c) => FOLD[c] || c)
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const FLAG = (iso2) => `https://flagcdn.com/w40/${iso2.toLowerCase()}.png`;
const LIMIT = 8;

export function createSearch(root, { countries, onPick }) {
  const field = root.querySelector('.search-field');
  const input = root.querySelector('#search-input');
  const clear = root.querySelector('.search-clear');
  const results = root.querySelector('.search-results');

  // Arama dizinini bir kez kur
  const index = [...countries.entries()].map(([iso3, c]) => ({
    iso3,
    country: c,
    haystack: `${fold(c.name)} ${fold(c.nameEn)} ${iso3.toLowerCase()} ${(c.iso2 || '').toLowerCase()}`,
    sortKey: fold(c.name),
  }));

  let hits = [];
  let cursor = -1;

  function close() {
    results.dataset.open = 'false';
    input.setAttribute('aria-expanded', 'false');
    cursor = -1;
  }

  function paintCursor() {
    [...results.querySelectorAll('.search-hit')].forEach((btn, i) => {
      btn.setAttribute('aria-selected', String(i === cursor));
    });
  }

  function search(query) {
    const q = fold(query.trim());
    field.dataset.filled = String(query.length > 0);

    if (!q) { close(); return; }

    hits = index
      .filter((entry) => entry.haystack.includes(q))
      // Baştan eşleşenler önce gelsin
      .sort((a, b) => {
        const aStarts = a.sortKey.startsWith(q) ? 0 : 1;
        const bStarts = b.sortKey.startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.sortKey.localeCompare(b.sortKey, 'tr');
      })
      .slice(0, LIMIT);

    results.textContent = '';
    cursor = -1;

    if (!hits.length) {
      const li = document.createElement('li');
      li.className = 'search-empty';
      li.textContent = `"${query.trim()}" için ülke bulunamadı.`;
      results.appendChild(li);
    } else {
      hits.forEach((hit, i) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-hit';
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', 'false');

        if (hit.country.iso2) {
          const img = document.createElement('img');
          img.src = FLAG(hit.country.iso2);
          img.alt = '';
          img.loading = 'lazy';
          img.addEventListener('error', () => img.remove(), { once: true });
          btn.appendChild(img);
        }

        const label = document.createElement('span');
        label.className = 'search-hit-name';
        label.textContent = hit.country.name;

        const code = document.createElement('span');
        code.className = 'search-hit-code';
        code.textContent = hit.iso3;

        btn.append(label, code);
        btn.addEventListener('click', () => pick(i));
        li.appendChild(btn);
        results.appendChild(li);
      });
    }

    results.dataset.open = 'true';
    input.setAttribute('aria-expanded', 'true');
  }

  function pick(i) {
    const hit = hits[i];
    if (!hit) return;
    input.value = hit.country.name;
    field.dataset.filled = 'true';
    close();
    onPick(hit.iso3);
  }

  input.addEventListener('input', () => search(input.value));
  input.addEventListener('focus', () => { if (input.value.trim()) search(input.value); });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); input.blur(); return; }
    if (!hits.length || results.dataset.open !== 'true') {
      if (e.key === 'Enter' && input.value.trim()) search(input.value);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = (cursor + 1) % hits.length; paintCursor(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = (cursor - 1 + hits.length) % hits.length; paintCursor(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(cursor >= 0 ? cursor : 0); }
  });

  clear.addEventListener('click', () => {
    input.value = '';
    field.dataset.filled = 'false';
    close();
    input.focus();
  });

  document.addEventListener('pointerdown', (e) => {
    if (!root.contains(e.target)) close();
  });

  // Klavye kısayolu: eğik çizgi aramaya odaklanır
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    input.focus();
    input.select();
  });

  return { close, focus: () => input.focus() };
}
