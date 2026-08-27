/**
 * Sol ray: gösterge seçici ve lejant.
 *
 * Eski arayüzde dokuz onay kutusu vardı; her biri tabloya bir sütun ekliyor,
 * hangi kutunun hangi metriğe karşılık geldiği ise iki ayrı dosyada iki farklı
 * indeks düzenine göre çözülüyordu. İncelemedeki hataların yarısı buradan
 * çıkmıştı. Artık aynı anda tek gösterge etkin: küreyi, lejantı, sıralamayı ve
 * arayüzün vurgu rengini o belirliyor.
 */

import { INDICATORS, RAMPS } from '../indicators.js';
import { LEGEND_STOPS } from '../scale.js';

export function createRail(root, { onChange }) {
  const list = root.querySelector('.indicator-list');
  const legendRamp = root.querySelector('.legend-ramp');
  const legendUnit = root.querySelector('.legend-unit');
  const legendScale = root.querySelector('.legend-scale');

  const buttons = new Map();

  for (const ind of INDICATORS) {
    const li = document.createElement('li');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'indicator';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', 'false');
    btn.dataset.id = ind.id;

    const dot = document.createElement('span');
    dot.className = 'indicator-dot';
    dot.setAttribute('aria-hidden', 'true');

    const body = document.createElement('span');
    body.className = 'indicator-body';

    const name = document.createElement('span');
    name.className = 'indicator-name';
    name.textContent = ind.name;

    const code = document.createElement('span');
    code.className = 'indicator-code num';
    code.textContent = ind.code;

    body.append(name, code);
    btn.append(dot, body);
    btn.addEventListener('click', () => onChange(ind.id));
    li.appendChild(btn);
    list.appendChild(li);
    buttons.set(ind.id, btn);
  }

  // Ok tuşlarıyla dolaşım — radyo grubunun beklenen davranışı
  list.addEventListener('keydown', (e) => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    const step = keys[e.key];
    if (!step) return;
    e.preventDefault();
    const ids = INDICATORS.map((i) => i.id);
    const current = ids.indexOf(document.activeElement?.dataset?.id);
    const next = ids[(current + step + ids.length) % ids.length];
    buttons.get(next)?.focus();
    onChange(next);
  });

  /**
   * @param {object} indicator etkin gösterge kaydı
   * @param {object} scale o yılın nicelik ölçeği
   */
  function update(indicator, scale) {
    for (const [id, btn] of buttons) {
      btn.setAttribute('aria-checked', String(id === indicator.id));
      btn.tabIndex = id === indicator.id ? 0 : -1;
    }

    legendUnit.textContent = indicator.unit;

    // Rampa yeniden çizildiğinde soldan sağa açılsın
    legendRamp.removeAttribute('data-wipe');
    void legendRamp.offsetWidth;              // yeniden akış: animasyon yeniden başlar
    legendRamp.dataset.wipe = 'true';

    legendScale.textContent = '';
    if (!scale.size) {
      const empty = document.createElement('span');
      empty.textContent = 'Bu yıl için veri yok';
      legendScale.appendChild(empty);
      return;
    }
    for (const t of LEGEND_STOPS) {
      const span = document.createElement('span');
      span.textContent = indicator.formatShort(scale.at(t));
      legendScale.appendChild(span);
    }
  }

  return { update };
}

/**
 * Etkin göstergenin rampasını CSS değişkenlerine yazar.
 * Arayüzdeki tek doygun renk budur; gösterge değişince lejant, sıralama
 * çubukları, grafik çizgisi, odak halkaları ve oynat düğmesi birlikte döner.
 */
export function applyTint(indicator) {
  const ramp = RAMPS[indicator.tone];
  const root = document.documentElement.style;

  ramp.stops.forEach((hex, i) => root.setProperty(`--data-${i + 1}`, hex));
  root.setProperty('--data-key', ramp.key);
  root.setProperty('--data-key-soft', hexAlpha(ramp.key, 0.16));
  root.setProperty('--data-key-line', hexAlpha(ramp.key, 0.42));

  // Tarayıcı sekmesi ve mobil adres çubuğu da uyum sağlasın
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#070d18');
}

function hexAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
