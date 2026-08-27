/**
 * Ülke dosyası: sağ sütunun ikinci sekmesi.
 *
 * Eski akışta ülkeye tıklayınca bir Bootstrap modalı açılıyor, kullanıcı
 * "Tamam"a basıyor ve ancak ondan sonra tablo doluyordu. Burada tıklamanın
 * karşılığı doğrudan veri: dokuz göstergenin o yılki değeri, her birinin
 * eğrisi ve etkin göstergenin tam zaman serisi.
 *
 * Karşılaştırma modu: bir ülke sabitlenir ve sonra gezilen her ülke onun
 * üzerine çizilir. Sıralama "kim önde" sorusunu yanıtlıyor; karşılaştırma
 * "ikisi arasındaki fark nasıl açıldı" sorusunu.
 */

import { INDICATORS } from '../indicators.js';
import { sparkline, renderSeries, countUp } from './chart.js';

const FLAG = (iso2) => `https://flagcdn.com/w160/${iso2.toLowerCase()}.png`;
const FLAG_SM = (iso2) => `https://flagcdn.com/w40/${iso2.toLowerCase()}.png`;

/**
 * Serideki o yılın kaydı; yoksa en yakın önceki kayda düşer.
 * @returns {{value:number, year:number, exact:boolean}|null}
 */
function pick(points, year) {
  const exact = points.find((p) => p.year === year);
  if (exact) return { value: exact.value, year: exact.year, exact: true };
  const before = [...points].reverse().find((p) => p.year < year);
  return before ? { value: before.value, year: before.year, exact: false } : null;
}

export function createDossier(root, { onIndicatorPick, onClose, onCompareToggle, onCompareClear }) {
  const flag = root.querySelector('.dossier-flag');
  const name = root.querySelector('.dossier-name');
  const meta = root.querySelector('.dossier-meta');
  const grid = root.querySelector('.stat-grid');
  const seriesTitle = root.querySelector('.series-title');
  const seriesLegend = root.querySelector('.series-legend');
  const seriesChart = root.querySelector('.series-chart');
  // Not: `.summary p` demek yetmez — bölümün ilk paragrafı başlık etiketidir.
  const summary = root.querySelector('.summary-text');
  const closeBtn = root.querySelector('.dossier-close');

  /* --- Karşılaştırma şeridi --- */
  const bar = root.querySelector('.compare-bar');
  const cmpToggle = bar.querySelector('.compare-toggle');
  const cmpToggleText = bar.querySelector('.compare-toggle-text');
  const cmpChip = bar.querySelector('.compare-chip');
  const cmpChipFlag = bar.querySelector('.compare-chip-flag');
  const cmpChipName = bar.querySelector('.compare-chip-name');
  const cmpChipX = bar.querySelector('.compare-chip-x');

  cmpToggle.addEventListener('click', () => onCompareToggle?.());
  cmpChipX.addEventListener('click', () => onCompareClear?.());

  let restoreFocus = null;
  let current = null;
  let summaryToken = 0;

  closeBtn.addEventListener('click', () => close());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.dataset.open === 'true') close();
  });

  function metaItem(label, value) {
    const span = document.createElement('span');
    const strong = document.createElement('span');
    strong.className = 'meta-label';
    strong.textContent = label;
    const text = document.createElement('span');
    text.textContent = value;
    span.append(strong, text);
    return span;
  }

  /** Şeridin üç hâli: kapalı, ikinci ülke bekleniyor, çift kurulu. */
  function renderBar(compare) {
    const state = !compare ? 'off' : compare.country ? 'on' : 'arming';
    bar.dataset.state = state;
    cmpToggle.setAttribute('aria-pressed', String(state !== 'off'));
    cmpToggleText.textContent = state === 'arming' ? 'Vazgeç' : 'Karşılaştır';

    if (state === 'on') {
      cmpChipName.textContent = compare.country.name;
      if (compare.country.iso2) {
        cmpChipFlag.src = FLAG_SM(compare.country.iso2);
        cmpChipFlag.hidden = false;
      } else {
        cmpChipFlag.hidden = true;
      }
      cmpChip.hidden = false;
    } else {
      cmpChip.hidden = true;
    }
  }

  /** Grafiğin üstündeki iki anahtar ve aradaki fark. */
  function renderLegend({ country, compare, indicator, year }) {
    seriesLegend.textContent = '';
    if (!compare?.country) { seriesLegend.hidden = true; return; }

    const a = pick(compare.self, year);
    const b = pick(compare.points, year);

    const key = (kind, label, text) => {
      const span = document.createElement('span');
      span.className = 'series-key';
      span.dataset.kind = kind;
      const swatch = document.createElement('i');
      swatch.setAttribute('aria-hidden', 'true');
      const who = document.createElement('span');
      who.textContent = label;
      const val = document.createElement('b');
      val.textContent = text;
      span.append(swatch, who, val);
      return span;
    };

    seriesLegend.append(
      key('a', country.name, a ? indicator.formatShort(a.value) : 'veri yok'),
      key('b', compare.country.name, b ? indicator.formatShort(b.value) : 'veri yok')
    );

    if (a && b) {
      const diff = a.value - b.value;
      seriesLegend.appendChild(
        key('d', 'fark', (diff >= 0 ? '+' : '−') + indicator.formatShort(Math.abs(diff)))
      );
    }
    seriesLegend.hidden = false;
  }

  /**
   * @param {object} opts
   * @param {string} opts.iso3
   * @param {object} opts.country künye
   * @param {object} opts.indicator etkin gösterge
   * @param {number} opts.year
   * @param {(id: string) => Array<{year:number,value:number}>} opts.seriesFor
   * @param {{country?: object, seriesFor?: (id:string)=>Array}|null} [opts.compare]
   *        yoksa kapalı, `country` yoksa ikinci ülke bekleniyor demektir
   */
  function open({ iso3, country, indicator, year, seriesFor, compare = null }) {
    const reopening = current === iso3;
    current = iso3;

    if (!reopening) restoreFocus = document.activeElement;

    const twin = compare?.country ? compare : null;

    /* --- Künye --- */
    name.textContent = country.name;
    if (country.iso2) {
      flag.src = FLAG(country.iso2);
      flag.alt = `${country.name} bayrağı`;
      flag.hidden = false;
    } else {
      flag.hidden = true;
    }
    flag.onerror = () => { flag.hidden = true; };

    meta.textContent = '';
    meta.appendChild(metaItem('kod', iso3));
    if (country.region) meta.appendChild(metaItem('bölge', country.region));
    if (country.income) meta.appendChild(metaItem('gelir grubu', country.income));
    if (country.capital) meta.appendChild(metaItem('başkent', country.capital));

    renderBar(compare);

    /* --- Dokuz gösterge --- */
    grid.textContent = '';
    INDICATORS.forEach((ind, i) => {
      const points = seriesFor(ind.id);
      const shown = pick(points, year);

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'stat';
      card.dataset.active = String(ind.id === indicator.id);
      card.style.animationDelay = `${40 + i * 32}ms`;
      card.setAttribute('aria-label', `${ind.long} — küreyi bu göstergeye göre boya`);

      const label = document.createElement('span');
      label.className = 'stat-label';
      label.textContent = ind.long;

      const value = document.createElement('span');
      value.className = 'stat-value num';

      const unit = document.createElement('span');
      unit.className = 'stat-unit num';

      if (shown) {
        countUp(value, shown.value, ind.formatShort, 560);
        // Yıl tam tutmuyorsa hangi yıla düşüldüğü yazılır, sessizce kaydırılmaz
        unit.textContent = shown.exact ? ind.unit : `${ind.unit} · ${shown.year}`;
      } else {
        value.dataset.empty = 'true';
        value.textContent = 'veri yok';
        unit.textContent = ind.unit;
      }

      card.append(label, value, unit);

      /* Karşılaştırma açıkken her kart ikinci ülkenin aynı yıldaki değerini de
         taşır: dokuz göstergenin tamamı tek bakışta kıyaslanır. */
      if (twin) {
        const other = pick(twin.seriesFor(ind.id), year);
        const vs = document.createElement('span');
        vs.className = 'stat-vs num';
        const who = document.createElement('i');
        who.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.textContent = other ? ind.formatShort(other.value) : 'veri yok';
        vs.append(who, text);
        vs.title = `${twin.country.name}${other && !other.exact ? ` · ${other.year}` : ''}`;
        card.appendChild(vs);
      }

      if (points.length > 1) card.appendChild(sparkline(points.slice(-24)));
      card.addEventListener('click', () => onIndicatorPick(ind.id));
      grid.appendChild(card);
    });

    /* --- Zaman serisi --- */
    const own = seriesFor(indicator.id);
    seriesTitle.textContent = twin
      ? `${indicator.long} · ${country.name} ↔ ${twin.country.name}`
      : `${indicator.long} · ${country.name}`;

    renderSeries(seriesChart, {
      points: own,
      indicator,
      year,
      name: country.name,
      compare: twin ? { points: twin.seriesFor(indicator.id), name: twin.country.name } : null,
    });

    renderLegend({
      country,
      indicator,
      year,
      compare: twin ? { ...twin, self: own, points: twin.seriesFor(indicator.id) } : null,
    });

    /* --- Ansiklopedi özeti --- */
    loadSummary(country.name);

    root.dataset.open = 'true';
    root.removeAttribute('aria-hidden');
    if (!reopening) closeBtn.focus({ preventScroll: true });
  }

  async function loadSummary(title) {
    const token = ++summaryToken;
    summary.textContent = '';
    summary.classList.add('skeleton');

    try {
      // Başlık kodlanmalı: "Kongo - Kinşasa" gibi adlar aksi hâlde bozuk URL üretir
      const res = await fetch(
        `https://tr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (token !== summaryToken) return;

      summary.classList.remove('skeleton');
      if (!res.ok) { summary.textContent = 'Bu ülke için Türkçe Vikipedi özeti bulunamadı.'; return; }

      const data = await res.json();
      if (token !== summaryToken) return;

      summary.textContent = data.extract || 'Bu ülke için Türkçe Vikipedi özeti bulunamadı.';
      if (data.content_urls?.desktop?.page) {
        summary.append(' ');
        const link = document.createElement('a');
        link.href = data.content_urls.desktop.page;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Vikipedi’de oku';
        summary.appendChild(link);
      }
    } catch {
      if (token !== summaryToken) return;
      summary.classList.remove('skeleton');
      summary.textContent = 'Vikipedi’ye ulaşılamadı.';
    }
  }

  function close() {
    if (root.dataset.open !== 'true') return;
    root.dataset.open = 'false';
    root.setAttribute('aria-hidden', 'true');
    current = null;
    summaryToken++;
    renderBar(null);   // şerit açık kaldığı hâliyle donmasın
    onClose?.();
    if (restoreFocus && document.contains(restoreFocus)) {
      restoreFocus.focus({ preventScroll: true });
    }
    restoreFocus = null;
  }

  return { open, close, get iso3() { return current; } };
}
