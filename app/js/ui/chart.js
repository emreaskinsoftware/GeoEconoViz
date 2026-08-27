/**
 * SVG çizimleri: kart içi mini eğriler ve ülke zaman serisi.
 * Grafik kütüphanesi yok — dokuz kart ve tek bir seri için gereksiz ağırlık
 * olurdu; hepsi birkaç yüz baytlık path.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const el = (name, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

/** Noktaları verilen kutuya sığdıran düz çizgi yolu. */
function pathFor(points, w, h, pad = 2) {
  if (points.length < 2) return '';
  const xs = points.map((p) => p.year);
  const ys = points.map((p) => p.value);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const spanX = x1 - x0 || 1;
  const spanY = y1 - y0 || 1;

  return points
    .map((p, i) => {
      const x = ((p.year - x0) / spanX) * (w - pad * 2) + pad;
      const y = h - pad - ((p.value - y0) / spanY) * (h - pad * 2);
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join('');
}

/**
 * Kart içi mini eğri. Serinin yönünü tek bakışta verir.
 * @param {Array<{year:number, value:number}>} points
 */
export function sparkline(points, { width = 160, height = 30 } = {}) {
  const svg = el('svg', {
    class: 'stat-spark',
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  });
  if (points.length < 2) return svg;

  svg.appendChild(el('path', {
    d: pathFor(points, width, height, 3),
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.5,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    opacity: 0.55,
  }));

  // Son nokta işaretlensin: "bu, gösterilen yıl"
  const last = points[points.length - 1];
  const xs = points.map((p) => p.year);
  const ys = points.map((p) => p.value);
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1;
  svg.appendChild(el('circle', {
    cx: ((last.year - Math.min(...xs)) / spanX) * (width - 6) + 3,
    cy: height - 3 - ((last.value - Math.min(...ys)) / spanY) * (height - 6),
    r: 2.2,
    fill: 'currentColor',
  }));

  return svg;
}

/**
 * Ülkenin etkin göstergedeki tam zaman serisi.
 *
 * `compare` verilirse ikinci ülke aynı eksene çizilir. Eksen bilerek ortak:
 * karşılaştırmanın bütün anlamı iki eğrinin aynı ölçekte okunması. Her seriyi
 * kendi ölçeğine sığdırmak ikisini de birbirine benzetirdi.
 *
 * @param {HTMLElement} host
 * @param {{points: Array<{year:number,value:number}>, indicator: object,
 *          year: number, name?: string,
 *          compare?: {points: Array<{year:number,value:number}>, name: string},
 *          onScrub?: (year:number|null)=>void}} opts
 */
export function renderSeries(host, { points, indicator, year, name, compare, onScrub }) {
  host.textContent = '';
  const tip = document.createElement('div');
  tip.className = 'series-tip';
  host.appendChild(tip);

  if (points.length < 2) {
    const note = document.createElement('p');
    note.className = 'search-empty';
    note.textContent = 'Bu gösterge için yeterli tarihsel kayıt yok.';
    host.appendChild(note);
    return;
  }

  // Karşılaştırılan ülkenin de en az iki kaydı yoksa çizilecek ikinci eğri yok
  const twin = compare && compare.points.length > 1 ? compare.points : null;

  const W = 800;
  const H = 190;
  const padL = 52;
  const padR = 12;
  const padT = 14;
  const padB = 26;

  // Alan iki serinin birleşimi: bir ülkenin kaydı erken bitiyorsa eğrisi orada
  // kesilir, ölçek kaymaz.
  const all = twin ? points.concat(twin) : points;
  const xs = all.map((p) => p.year);
  const ys = all.map((p) => p.value);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  // Düz seride çizgi kutunun tam ortasında dursun
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const padY = (y1 - y0) * 0.08;
  y0 -= padY;
  y1 += padY;

  const sx = (yr) => padL + ((yr - x0) / (x1 - x0 || 1)) * (W - padL - padR);
  const sy = (v) => H - padB - ((v - y0) / (y1 - y0 || 1)) * (H - padT - padB);

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: 'none',
    role: 'img',
    'aria-label': twin
      ? `${indicator.long}: ${name || 'seçili ülke'} ve ${compare.name} karşılaştırması, ${x0}–${x1}`
      : `${indicator.long}, ${x0}–${x1} zaman serisi`,
  });
  if (twin) svg.dataset.compare = 'true';

  // Çizgi altındaki dolgu için degrade
  const defs = el('defs');
  const grad = el('linearGradient', { id: 'seriesFade', x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(el('stop', { offset: '0%', 'stop-color': 'var(--data-key)', 'stop-opacity': 0.28 }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': 'var(--data-key)', 'stop-opacity': 0 }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  /* --- Izgara ve eksen --- */
  const grid = el('g', { class: 'series-grid' });
  const axis = el('g', { class: 'series-axis' });
  for (let i = 0; i <= 3; i++) {
    const v = y0 + ((y1 - y0) * i) / 3;
    const y = sy(v);
    grid.appendChild(el('line', { x1: padL, y1: y, x2: W - padR, y2: y }));
    const label = el('text', { x: padL - 8, y: y + 3.5, 'text-anchor': 'end' });
    label.textContent = indicator.formatShort(v);
    axis.appendChild(label);
  }
  for (const yr of [x0, Math.round((x0 + x1) / 2), x1]) {
    const label = el('text', { x: sx(yr), y: H - 8, 'text-anchor': 'middle' });
    label.textContent = String(yr);
    axis.appendChild(label);
  }
  svg.append(grid, axis);

  const lineFor = (list) => list
    .map((p, i) => `${i ? 'L' : 'M'}${sx(p.year).toFixed(1)},${sy(p.value).toFixed(1)}`)
    .join('');

  /* --- Karşılaştırılan ülke arkada: kesikli referans çizgisi ---
     Kesiklik rengi görmeyen için de ayırt edici; renk tek başına taşımıyor. */
  if (twin) svg.appendChild(el('path', { class: 'series-line-b', d: lineFor(twin) }));

  /* --- Alan ve çizgi --- */
  const line = lineFor(points);
  // Kapanış kenarları serinin kendi uçlarından alınır; birleşik eksende ilk
  // yıl karşılaştırılan ülkeye ait olabiliyor.
  const ownX0 = points[0].year;
  const ownX1 = points[points.length - 1].year;

  svg.appendChild(el('path', {
    class: 'series-area',
    d: `${line}L${sx(ownX1).toFixed(1)},${H - padB}L${sx(ownX0).toFixed(1)},${H - padB}Z`,
  }));

  const stroke = el('path', { class: 'series-line', d: line });
  svg.appendChild(stroke);

  /* --- Etkin yılın imleci --- */
  const cursor = el('line', { class: 'series-cursor', y1: padT, y2: H - padB, opacity: 0 });
  const dot = el('circle', { class: 'series-dot', r: 4.5, opacity: 0 });
  const dotB = el('circle', { class: 'series-dot-b', r: 4, opacity: 0 });
  svg.append(cursor, dotB, dot);

  const at = (list, yr) => list.find((p) => p.year === yr) || null;

  /**
   * İmleci verilen yıla taşı. İki nokta birbirinden bağımsız: bir ülkenin o
   * yıl kaydı olmayabilir, diğeri yine de gösterilir.
   */
  const place = (yr) => {
    const a = at(points, yr);
    const b = twin ? at(twin, yr) : null;
    if (!a && !b) {
      cursor.setAttribute('opacity', 0);
      dot.setAttribute('opacity', 0);
      dotB.setAttribute('opacity', 0);
      return null;
    }
    const x = sx(yr);
    cursor.setAttribute('x1', x);
    cursor.setAttribute('x2', x);
    cursor.setAttribute('opacity', 0.6);

    if (a) {
      dot.setAttribute('cx', x); dot.setAttribute('cy', sy(a.value)); dot.setAttribute('opacity', 1);
    } else dot.setAttribute('opacity', 0);

    if (b) {
      dotB.setAttribute('cx', x); dotB.setAttribute('cy', sy(b.value)); dotB.setAttribute('opacity', 1);
    } else dotB.setAttribute('opacity', 0);

    return { year: yr, a, b, x, y: sy((a || b).value) };
  };

  /* --- Üzerinde gezinme --- */
  const hit = el('rect', {
    class: 'series-hit',
    x: padL, y: padT,
    width: W - padL - padR,
    height: H - padT - padB,
  });
  svg.appendChild(hit);
  host.insertBefore(svg, tip);

  const tipRow = (label, text, kind) => {
    const row = document.createElement('span');
    row.className = 'series-tip-row';
    row.dataset.kind = kind;
    const who = document.createElement('span');
    who.className = 'series-tip-who';
    who.textContent = label;
    const val = document.createElement('b');
    val.textContent = text;
    row.append(who, val);
    return row;
  };

  const showTip = (info) => {
    if (!info) { tip.dataset.open = 'false'; return; }
    const box = host.getBoundingClientRect();
    tip.textContent = '';

    if (!twin) {
      tip.append(
        document.createTextNode(`${info.year} · `),
        Object.assign(document.createElement('b'), {
          textContent: info.a ? indicator.format(info.a.value) : 'veri yok',
        })
      );
    } else {
      const head = document.createElement('span');
      head.className = 'series-tip-year';
      head.textContent = String(info.year);
      tip.append(
        head,
        tipRow(name || 'Seçili', info.a ? indicator.format(info.a.value) : 'veri yok', 'a'),
        tipRow(compare.name, info.b ? indicator.format(info.b.value) : 'veri yok', 'b')
      );
      if (info.a && info.b) {
        const diff = info.a.value - info.b.value;
        tip.appendChild(
          tipRow('fark', (diff >= 0 ? '+' : '−') + indicator.format(Math.abs(diff)), 'd')
        );
      }
    }

    tip.style.left = `${(info.x / W) * box.width}px`;
    tip.style.top = `${(info.y / H) * box.height}px`;
    tip.dataset.open = 'true';
  };

  // Yakalanabilir yıllar iki serinin birleşimi; yoksa yalnız karşılaştırılan
  // ülkenin verisi olan yıllarda imleç hiç durmazdı.
  const years = twin
    ? [...new Set([...points, ...twin].map((p) => p.year))].sort((a, b) => a - b)
    : points.map((p) => p.year);

  const nearest = (clientX) => {
    const box = svg.getBoundingClientRect();
    const local = ((clientX - box.left) / box.width) * W;
    const yr = x0 + ((local - padL) / (W - padL - padR)) * (x1 - x0);
    let best = years[0];
    for (const y of years) if (Math.abs(y - yr) < Math.abs(best - yr)) best = y;
    return best;
  };

  hit.addEventListener('pointermove', (e) => {
    const yr = nearest(e.clientX);
    showTip(place(yr));
    onScrub?.(yr);
  });
  hit.addEventListener('pointerleave', () => {
    showTip(place(year));
    onScrub?.(null);
  });

  // Açılışta çizgi soldan sağa çizilsin
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const length = stroke.getTotalLength?.() || 0;
    if (length) {
      stroke.style.setProperty('--len', length);
      stroke.dataset.draw = 'true';
    }
  }

  showTip(place(year));
}

/**
 * Sayıyı sıfırdan hedefe sayarak yazar. Yalnızca dosya açılışında kullanılıyor;
 * her yıl değişiminde saymak okumayı zorlaştırırdı.
 */
export function countUp(node, value, format, duration = 620) {
  if (!Number.isFinite(value)) { node.textContent = '—'; return; }

  // Doğru değer her koşulda önce yazılır. Sekme arka plandayken tarayıcı
  // requestAnimationFrame'i çalıştırmaz; animasyona güvenilirse kart boş kalır.
  node.textContent = format(value);

  const hidden = document.visibilityState !== 'visible';
  if (hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  node.textContent = format(0);
  const start = performance.now();
  // Kare döngüsü ortada kesilirse (sekme gizlenirse) değer sıfırda kalmasın
  const guard = setTimeout(() => { node.textContent = format(value); }, duration + 400);

  const tick = (now) => {
    const raw = Math.min(1, (now - start) / duration);
    const t = 1 - Math.pow(1 - raw, 4);
    if (raw < 1) {
      node.textContent = format(value * t);
      requestAnimationFrame(tick);
    } else {
      node.textContent = format(value);
      clearTimeout(guard);
    }
  };
  requestAnimationFrame(tick);
}
