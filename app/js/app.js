/**
 * GeoEconoViz — uygulama orkestrasyonu.
 *
 * Durum üç alandan ibaret: hangi gösterge, hangi yıl, hangi ülke seçili.
 * Geri kalan her şey bu üçünden türetiliyor; küre, lejant, sıralama ve dosya
 * hep aynı türetmeyi okuyor. Eski sürümde iki ayrı dosya aynı tabloyu farklı
 * varsayımlarla yazıyor ve birbirini eziyordu.
 */

import { INDICATORS, BY_ID, RAMPS, DEFAULT_INDICATOR } from './indicators.js';
import { loadCountries, loadIndicator } from './worldbank.js';
import { quantileScale, rampColor } from './scale.js';
import { createGlobe } from './globe.js';
import { createRail, applyTint } from './ui/rail.js';
import { createTimeline } from './ui/timeline.js';
import { createRanking } from './ui/ranking.js';
import { createDossier } from './ui/dossier.js';
import { createSearch } from './ui/search.js';
import { toast } from './ui/toast.js';

/* ==========================================================================
   Durum
   ========================================================================== */

const state = {
  indicatorId: DEFAULT_INDICATOR,
  year: null,
  iso3: null,
  countries: new Map(),
  /** göstergeId -> { byCountry, years, updated } */
  data: new Map(),
};

let globe = null;
let rail = null;
let timeline = null;
let ranking = null;
let dossier = null;

const boot = document.getElementById('boot');
const bootStatus = document.getElementById('boot-status');
const bootBar = document.getElementById('boot-bar');

function progress(text, ratio) {
  if (text) bootStatus.textContent = text;
  bootBar.style.width = `${Math.round(ratio * 100)}%`;
}

/* ==========================================================================
   Türetmeler
   ========================================================================== */

const indicator = () => BY_ID[state.indicatorId];

/** Etkin gösterge + yıl için ülke değerleri. */
function entriesFor(indicatorId, year) {
  const set = state.data.get(indicatorId);
  if (!set) return [];
  const out = [];
  for (const [iso3, byYear] of Object.entries(set.byCountry)) {
    const value = byYear[year];
    // Ülke künyesi yoksa toplulaştırmadır; sıralamaya girmemeli.
    if (Number.isFinite(value) && state.countries.has(iso3)) out.push({ iso3, value });
  }
  return out;
}

/** Yıl -> o yıl verisi olan ülke sayısı. */
function coverageFor(indicatorId) {
  const set = state.data.get(indicatorId);
  const counts = new Map();
  if (!set) return counts;
  for (const [iso3, byYear] of Object.entries(set.byCountry)) {
    if (!state.countries.has(iso3)) continue;
    for (const year of Object.keys(byYear)) {
      const y = Number(year);
      counts.set(y, (counts.get(y) || 0) + 1);
    }
  }
  return counts;
}

/** Bir ülkenin bir göstergedeki tam serisi, yıla göre sıralı. */
function seriesFor(iso3, indicatorId) {
  const byYear = state.data.get(indicatorId)?.byCountry?.[iso3];
  if (!byYear) return [];
  return Object.entries(byYear)
    .map(([year, value]) => ({ year: Number(year), value }))
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => a.year - b.year);
}

/* ==========================================================================
   Çizim
   ========================================================================== */

function render({ repaintGlobe = true, paintDuration = 520 } = {}) {
  const ind = indicator();
  const entries = entriesFor(state.indicatorId, state.year);
  const scale = quantileScale(entries.map((e) => e.value));
  const ramp = RAMPS[ind.tone];

  const valueOf = new Map(entries.map((e) => [e.iso3, e.value]));

  if (repaintGlobe && globe) {
    globe.paint((iso3) => {
      const value = valueOf.get(iso3);
      return Number.isFinite(value)
        ? rampColor(ramp.stops, scale.position(value))
        : null;
    }, paintDuration);
  }

  rail.update(ind, scale);
  ranking.render({
    indicator: ind,
    year: state.year,
    values: entries,
    countries: state.countries,
    scale,
  });

  writeHash();
  lastScale = scale;
  lastValues = valueOf;
}

let lastScale = quantileScale([]);
let lastValues = new Map();

/* ==========================================================================
   Eylemler
   ========================================================================== */

async function selectIndicator(id, { announce = true } = {}) {
  if (!BY_ID[id]) return;
  state.indicatorId = id;
  applyTint(BY_ID[id]);

  // Veri henüz gelmediyse getir; bu arada arayüz eski veriyle durmasın
  if (!state.data.has(id)) {
    rail.update(BY_ID[id], quantileScale([]));
    ranking.showSkeleton();
    try {
      state.data.set(id, await loadIndicator(BY_ID[id].code));
    } catch (err) {
      toast(`${BY_ID[id].name} verisi alınamadı: ${err.message}`, { tone: 'error' });
      return;
    }
  }

  const set = state.data.get(id);
  const nextYear = timeline.setYears(set.years, coverageFor(id), state.year);
  state.year = nextYear;

  render();
  if (state.iso3) refreshDossier();
  if (announce) {
    document.getElementById('rail-title').textContent = BY_ID[id].long;
  }
}

function selectYear(year) {
  state.year = year;
  // Oynatma sırasında geçişler kısa olmalı, yoksa renkler yetişemez
  render({ paintDuration: timeline.playing ? 260 : 460 });
  if (state.iso3) refreshDossier();
}

function selectCountry(iso3, { fly = true } = {}) {
  const country = state.countries.get(iso3);
  if (!country) return;

  state.iso3 = iso3;
  globe?.select(iso3);
  ranking.select(iso3);

  if (fly && Number.isFinite(country.lon) && Number.isFinite(country.lat)) {
    globe?.flyTo(country.lon, country.lat, { height: 1.15e7 });
  }

  dossier.open({
    iso3,
    country,
    indicator: indicator(),
    year: state.year,
    seriesFor: (indId) => seriesFor(iso3, indId),
  });
  writeHash();
}

function refreshDossier() {
  if (!state.iso3 || dossier.iso3 !== state.iso3) return;
  dossier.open({
    iso3: state.iso3,
    country: state.countries.get(state.iso3),
    indicator: indicator(),
    year: state.year,
    seriesFor: (indId) => seriesFor(state.iso3, indId),
  });
}

function clearCountry() {
  state.iso3 = null;
  globe?.select(null);
  ranking.select(null, { scroll: false });
  dossier.close();
  writeHash();
}

/* ==========================================================================
   Bağlantı paylaşımı: #/gösterge/yıl/ülke
   ========================================================================== */

let hashLock = false;

function writeHash() {
  hashLock = true;
  const parts = ['', state.indicatorId, state.year];
  if (state.iso3) parts.push(state.iso3);
  history.replaceState(null, '', `#${parts.join('/')}`);
  requestAnimationFrame(() => { hashLock = false; });
}

function readHash() {
  const [, id, year, iso3] = decodeURIComponent(location.hash.slice(1)).split('/');
  return {
    indicatorId: BY_ID[id] ? id : null,
    year: Number.isFinite(Number(year)) ? Number(year) : null,
    iso3: iso3 && /^[A-Z-]{3,5}$/.test(iso3) ? iso3 : null,
  };
}

/* ==========================================================================
   Küre ipucu
   ========================================================================== */

const tip = document.getElementById('geo-tip');
const tipName = tip.querySelector('.geo-tip-name');
const tipValue = tip.querySelector('.geo-tip-value');
let tipFrame = 0;

function moveTip(position) {
  if (tipFrame) return;
  tipFrame = requestAnimationFrame(() => {
    tipFrame = 0;
    const canvas = globe.viewer.scene.canvas.getBoundingClientRect();
    const x = canvas.left + position.x + 16;
    const y = canvas.top + position.y + 16;
    // Sağ ve alt kenardan taşmasın
    const maxX = window.innerWidth - tip.offsetWidth - 12;
    const maxY = window.innerHeight - tip.offsetHeight - 12;
    tip.style.transform = `translate3d(${Math.min(x, maxX)}px, ${Math.min(y, maxY)}px, 0) scale(1)`;
  });
}

function showTip(iso3, position) {
  const country = state.countries.get(iso3);
  if (!iso3) { tip.dataset.open = 'false'; return; }

  tipName.textContent = country?.name || globe.countries.get(iso3)?.name || iso3;
  const value = lastValues.get(iso3);
  if (Number.isFinite(value)) {
    // İpucunda birim de görünsün; tek satır olduğu için yer var.
    tipValue.textContent = indicator().format(value);
    tipValue.removeAttribute('data-empty');
  } else {
    tipValue.textContent = 'veri yok';
    tipValue.dataset.empty = 'true';
  }
  moveTip(position);
  tip.dataset.open = 'true';
}

/* ==========================================================================
   Dar ekran çekmeceleri
   ========================================================================== */

function wireDrawers() {
  const scrim = document.getElementById('scrim');
  const panels = [
    [document.getElementById('toggle-rail'), document.getElementById('rail')],
    [document.getElementById('toggle-rank'), document.getElementById('rank')],
  ];

  const closeAll = () => {
    for (const [btn, panel] of panels) {
      panel.dataset.open = 'false';
      btn.setAttribute('aria-expanded', 'false');
    }
    scrim.dataset.open = 'false';
  };

  for (const [btn, panel] of panels) {
    btn.addEventListener('click', () => {
      const willOpen = panel.dataset.open !== 'true';
      closeAll();
      if (willOpen) {
        panel.dataset.open = 'true';
        btn.setAttribute('aria-expanded', 'true');
        scrim.dataset.open = 'true';
      }
    });
  }

  scrim.addEventListener('click', closeAll);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
  // Ülke seçilince çekmece kapansın ki dosya görünür olsun
  return closeAll;
}

/* ==========================================================================
   Açılış
   ========================================================================== */

function waitForCesium() {
  if (window.Cesium) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = setInterval(() => {
      if (window.Cesium) { clearInterval(check); resolve(); }
      else if (Date.now() - started > 25000) {
        clearInterval(check);
        reject(new Error('CesiumJS yüklenemedi — ağ bağlantınızı kontrol edin'));
      }
    }, 60);
  });
}

async function main() {
  const initial = readHash();
  if (initial.indicatorId) state.indicatorId = initial.indicatorId;
  applyTint(indicator());

  /* --- 1. Ülke künyeleri --- */
  progress('Ülke künyeleri alınıyor', 0.12);
  try {
    state.countries = await loadCountries();
  } catch (err) {
    progress('Dünya Bankası’na ulaşılamadı', 1);
    bootStatus.textContent = `Veri alınamadı: ${err.message}`;
    toast('Dünya Bankası’na ulaşılamadı. Sayfayı yenilemeyi deneyin.', { tone: 'error', duration: 12000 });
    return;
  }

  /* --- 2. İlk gösterge ve küre eşzamanlı --- */
  progress('Gösterge serisi indiriliyor', 0.3);
  const dataPromise = loadIndicator(indicator().code);
  const globePromise = waitForCesium().then(() =>
    createGlobe(document.getElementById('globe'), {
      onHover: (iso3, position) => showTip(iso3, position),
      onHoverMove: (position) => moveTip(position),
      onSelect: (iso3) => selectCountry(iso3, { fly: false }),
      onDismiss: () => clearCountry(),
    })
  );

  /* --- 3. Arayüzü kur --- */
  const closeDrawers = wireDrawers();

  rail = createRail(document.getElementById('rail'), {
    onChange: (id) => selectIndicator(id),
  });
  timeline = createTimeline(document.getElementById('timeline'), {
    onYear: (year) => selectYear(year),
  });
  ranking = createRanking(document.getElementById('rank'), {
    onSelect: (iso3) => { closeDrawers(); selectCountry(iso3); },
  });
  dossier = createDossier(document.getElementById('dossier'), {
    onIndicatorPick: (id) => selectIndicator(id),
    onClose: () => { state.iso3 = null; globe?.select(null); ranking.select(null, { scroll: false }); },
  });
  createSearch(document.querySelector('.search'), {
    countries: state.countries,
    onPick: (iso3) => { closeDrawers(); selectCountry(iso3); },
  });
  ranking.showSkeleton();

  /* --- 4. Veri geldi --- */
  let set;
  try {
    set = await dataPromise;
  } catch (err) {
    progress('Gösterge alınamadı', 1);
    toast(`Veri alınamadı: ${err.message}`, { tone: 'error', duration: 12000 });
    return;
  }
  state.data.set(state.indicatorId, set);
  progress('Küre çiziliyor', 0.72);

  state.year = timeline.setYears(set.years, coverageFor(state.indicatorId), initial.year);
  document.getElementById('rail-title').textContent = indicator().long;

  /* --- 5. Küre hazır --- */
  try {
    globe = await globePromise;
  } catch (err) {
    progress('Küre yüklenemedi', 1);
    toast(err.message, { tone: 'error', duration: 12000 });
    // Küre olmasa da sıralama ve dosya çalışsın
    render({ repaintGlobe: false });
    boot.dataset.done = 'true';
    return;
  }

  render({ paintDuration: 900 });

  // Konsoldan bakmak için tek tutamak: geoEconoViz.state, .globe, .render()
  // Tek sayfalık bir uygulamada işe yarıyor, sunumda da veri göstermeyi
  // kolaylaştırıyor.
  window.geoEconoViz = { state, globe, render, selectIndicator, selectCountry };

  progress('Hazır', 1);
  boot.dataset.done = 'true';
  globe.introFlight();

  if (initial.iso3 && state.countries.has(initial.iso3)) {
    setTimeout(() => selectCountry(initial.iso3), 900);
  }

  /* --- 6. Kalan göstergeleri arka planda getir ---
     Böylece gösterge değiştirmek ve ülke dosyasını açmak anında oluyor. */
  prefetchRest();

  /* --- 7. Arazi dokusu düğmesi --- */
  const reliefBtn = document.getElementById('relief-btn');
  if (!globe.hasRelief) {
    reliefBtn.hidden = true;                 // doku alınamadıysa düğme de olmasın
  } else {
    let wanted = true;
    try { wanted = localStorage.getItem('geoeconoviz:relief') !== 'off'; } catch { /* engelli depolama */ }
    reliefBtn.setAttribute('aria-pressed', String(globe.setRealistic(wanted)));

    reliefBtn.addEventListener('click', () => {
      const on = globe.setRealistic(!globe.realistic);
      reliefBtn.setAttribute('aria-pressed', String(on));
      try { localStorage.setItem('geoeconoviz:relief', on ? 'on' : 'off'); } catch { /* yoksay */ }
    });
  }

  /* --- 8. Kaynak bilgisi --- */
  document.getElementById('about-btn').addEventListener('click', () => {
    const updated = state.data.get(state.indicatorId)?.updated;
    toast(
      `Veri: Dünya Bankası Açık Verisi${updated ? ` · son güncelleme ${updated}` : ''} · CC BY 4.0`,
      { duration: 7000 }
    );
  });

  window.addEventListener('hashchange', () => {
    if (hashLock) return;
    const next = readHash();
    if (next.indicatorId && next.indicatorId !== state.indicatorId) selectIndicator(next.indicatorId);
    if (next.iso3 && next.iso3 !== state.iso3) selectCountry(next.iso3);
  });
}

/**
 * Kalan sekiz göstergeyi sırayla, arayüzü meşgul etmeden indir.
 *
 * Hepsi birlikte yaklaşık 16 MB; hızlı bağlantıda bu, gösterge değiştirmeyi ve
 * ülke dosyasını açmayı anında yapıyor. Veri tasarrufu açıksa ya da bağlantı
 * yavaşsa hiç başlamıyor: gösterge seçildiğinde zaten tek tek indiriliyor.
 */
async function prefetchRest() {
  const net = navigator.connection;
  if (net && (net.saveData || /(^|-)2g$/.test(net.effectiveType || ''))) return;

  for (const ind of INDICATORS) {
    if (state.data.has(ind.id)) continue;
    try {
      state.data.set(ind.id, await loadIndicator(ind.code));
      // Açık bir dosya varsa yeni gelen gösterge oraya da yansısın
      if (state.iso3) refreshDossier();
    } catch {
      // Sessiz geç: kullanıcı o göstergeyi seçerse yeniden denenecek
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

main().catch((err) => {
  console.error(err);
  bootStatus.textContent = 'Beklenmeyen bir hata oluştu.';
  toast(String(err.message || err), { tone: 'error', duration: 12000 });
});
