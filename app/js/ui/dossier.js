/**
 * Ülke dosyası: alttan yükselen ayrıntı sayfası.
 *
 * Eski akışta ülkeye tıklayınca bir Bootstrap modalı açılıyor, kullanıcı
 * "Tamam"a basıyor ve ancak ondan sonra tablo doluyordu. Burada tıklamanın
 * karşılığı doğrudan veri: dokuz göstergenin o yılki değeri, her birinin
 * eğrisi ve etkin göstergenin tam zaman serisi.
 */

import { INDICATORS } from '../indicators.js';
import { sparkline, renderSeries, countUp } from './chart.js';

const FLAG = (iso2) => `https://flagcdn.com/w160/${iso2.toLowerCase()}.png`;

export function createDossier(root, { onIndicatorPick, onClose }) {
  const flag = root.querySelector('.dossier-flag');
  const name = root.querySelector('.dossier-name');
  const meta = root.querySelector('.dossier-meta');
  const grid = root.querySelector('.stat-grid');
  const seriesTitle = root.querySelector('.series-title');
  const seriesChart = root.querySelector('.series-chart');
  // Not: `.summary p` demek yetmez — bölümün ilk paragrafı başlık etiketidir.
  const summary = root.querySelector('.summary-text');
  const closeBtn = root.querySelector('.dossier-close');

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

  /**
   * @param {object} opts
   * @param {string} opts.iso3
   * @param {object} opts.country künye
   * @param {object} opts.indicator etkin gösterge
   * @param {number} opts.year
   * @param {(id: string) => Array<{year:number,value:number}>} opts.seriesFor
   */
  function open({ iso3, country, indicator, year, seriesFor }) {
    const reopening = current === iso3;
    current = iso3;

    if (!reopening) restoreFocus = document.activeElement;

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

    /* --- Dokuz gösterge --- */
    grid.textContent = '';
    INDICATORS.forEach((ind, i) => {
      const points = seriesFor(ind.id);
      const point = points.find((p) => p.year === year);
      // O yıl boşsa serideki en yakın önceki kayda düş, ama bunu belli et
      const fallback = point ? null : [...points].reverse().find((p) => p.year < year);
      const shown = point || fallback;

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
        unit.textContent = fallback ? `${ind.unit} · ${shown.year}` : ind.unit;
      } else {
        value.dataset.empty = 'true';
        value.textContent = 'veri yok';
        unit.textContent = ind.unit;
      }

      card.append(label, value, unit);
      if (points.length > 1) card.appendChild(sparkline(points.slice(-24)));
      card.addEventListener('click', () => onIndicatorPick(ind.id));
      grid.appendChild(card);
    });

    /* --- Zaman serisi --- */
    seriesTitle.textContent = `${indicator.long} · ${country.name}`;
    renderSeries(seriesChart, {
      points: seriesFor(indicator.id),
      indicator,
      year,
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
    onClose?.();
    if (restoreFocus && document.contains(restoreFocus)) {
      restoreFocus.focus({ preventScroll: true });
    }
    restoreFocus = null;
  }

  return { open, close, get iso3() { return current; } };
}
