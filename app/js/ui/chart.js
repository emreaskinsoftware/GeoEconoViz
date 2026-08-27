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
 * @param {HTMLElement} host
 * @param {{points: Array<{year:number,value:number}>, indicator: object,
 *          year: number, onScrub?: (year:number|null)=>void}} opts
 */
export function renderSeries(host, { points, indicator, year, onScrub }) {
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

  const W = 800;
  const H = 190;
  const padL = 52;
  const padR = 12;
  const padT = 14;
  const padB = 26;

  const xs = points.map((p) => p.year);
  const ys = points.map((p) => p.value);
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
    'aria-label': `${indicator.long}, ${x0}–${x1} zaman serisi`,
  });

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

  /* --- Alan ve çizgi --- */
  const line = points
    .map((p, i) => `${i ? 'L' : 'M'}${sx(p.year).toFixed(1)},${sy(p.value).toFixed(1)}`)
    .join('');

  svg.appendChild(el('path', {
    class: 'series-area',
    d: `${line}L${sx(x1).toFixed(1)},${H - padB}L${sx(x0).toFixed(1)},${H - padB}Z`,
  }));

  const stroke = el('path', { class: 'series-line', d: line });
  svg.appendChild(stroke);

  /* --- Etkin yılın imleci --- */
  const cursor = el('line', { class: 'series-cursor', y1: padT, y2: H - padB, opacity: 0 });
  const dot = el('circle', { class: 'series-dot', r: 4.5, opacity: 0 });
  svg.append(cursor, dot);

  const place = (yr) => {
    const point = points.find((p) => p.year === yr);
    if (!point) { cursor.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); return null; }
    const x = sx(point.year);
    const y = sy(point.value);
    cursor.setAttribute('x1', x); cursor.setAttribute('x2', x); cursor.setAttribute('opacity', 0.6);
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('opacity', 1);
    return { point, x, y };
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

  const showTip = (info) => {
    if (!info) { tip.dataset.open = 'false'; return; }
    const box = host.getBoundingClientRect();
    tip.innerHTML = '';
    tip.append(
      document.createTextNode(`${info.point.year} · `),
      Object.assign(document.createElement('b'), { textContent: indicator.format(info.point.value) })
    );
    tip.style.left = `${(info.x / W) * box.width}px`;
    tip.style.top = `${(info.y / H) * box.height}px`;
    tip.dataset.open = 'true';
  };

  const nearest = (clientX) => {
    const box = svg.getBoundingClientRect();
    const local = ((clientX - box.left) / box.width) * W;
    const yr = x0 + ((local - padL) / (W - padL - padR)) * (x1 - x0);
    let best = points[0];
    for (const p of points) if (Math.abs(p.year - yr) < Math.abs(best.year - yr)) best = p;
    return best.year;
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
