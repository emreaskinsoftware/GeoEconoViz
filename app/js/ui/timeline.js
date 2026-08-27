/**
 * Zaman şeridi: yıl sürgüsü, oynat düğmesi ve veri kapsama çentikleri.
 *
 * Eski arayüzde 1984'ten 2023'e kadar kırk adet onay kutusu elle yazılmıştı.
 * Yerine tek bir sürgü var; sürgünün altındaki çentikler o yıl kaç ülkenin
 * verisi olduğunu gösteriyor, böylece "2024 neden bomboş" sorusu ekranda
 * kendiliğinden cevaplanıyor.
 */

const STEP_MS = 620;

export function createTimeline(root, { onYear }) {
  const range = root.querySelector('#year-range');
  const fill = root.querySelector('.scrub-fill');
  const ticks = root.querySelector('.scrub-ticks');
  const yearOut = root.querySelector('.year-value');
  const coverageOut = root.querySelector('.coverage-value');
  const playBtn = root.querySelector('.play-btn');
  const playIcon = playBtn.querySelector('use');

  let years = [];
  let coverage = new Map();     // yıl -> veri olan ülke sayısı
  let index = 0;
  let timer = null;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function renderTicks() {
    ticks.textContent = '';
    const peak = Math.max(1, ...coverage.values());
    for (const year of years) {
      const bar = document.createElement('i');
      const share = (coverage.get(year) || 0) / peak;
      bar.style.height = `${Math.max(6, Math.round(share * 100))}%`;
      bar.dataset.year = String(year);
      ticks.appendChild(bar);
    }
  }

  function paintPosition() {
    const year = years[index];
    const ratio = years.length > 1 ? index / (years.length - 1) : 0;

    fill.style.width = `${ratio * 100}%`;
    yearOut.textContent = String(year ?? '—');
    range.setAttribute('aria-valuenow', String(year ?? 0));
    range.setAttribute('aria-valuetext', `${year} yılı`);

    const count = coverage.get(year) || 0;
    coverageOut.textContent = count ? `${count} ülke` : 'veri yok';

    for (const bar of ticks.children) {
      bar.dataset.cur = String(Number(bar.dataset.year) === year);
    }
  }

  function commit(nextIndex, { announce = true } = {}) {
    index = Math.max(0, Math.min(years.length - 1, nextIndex));
    range.value = String(index);
    paintPosition();
    if (announce) onYear(years[index]);
  }

  /* --- Oynat --- */

  function setPlayIcon(playing) {
    playIcon.setAttribute('href', playing ? '#i-pause' : '#i-play');
    playBtn.setAttribute('aria-label', playing ? 'Durdur' : 'Yılları oynat');
    playBtn.setAttribute('aria-pressed', String(playing));
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    setPlayIcon(false);
  }

  function play() {
    if (timer || years.length < 2) return;
    // Sondaysak baştan al, yoksa bulunduğu yerden devam etsin
    if (index >= years.length - 1) commit(0);
    setPlayIcon(true);
    timer = setInterval(() => {
      if (index >= years.length - 1) { stop(); return; }
      commit(index + 1);
    }, reduceMotion ? 40 : STEP_MS);
  }

  playBtn.addEventListener('click', () => (timer ? stop() : play()));

  range.addEventListener('input', () => {
    stop();
    commit(Number(range.value));
  });

  // Sürgü odaktayken Home/End uçlara gitsin
  range.addEventListener('keydown', (e) => {
    if (e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    stop();
    commit(e.key === 'Home' ? 0 : years.length - 1);
  });

  /**
   * Gösterge değişince yıl kümesi ve kapsama yeniden kurulur.
   * Mümkünse kullanıcının baktığı yıl korunur; o yılın verisi yoksa
   * en yakın dolu yıla geçilir.
   *
   * @param {number[]} nextYears
   * @param {Map<number, number>} nextCoverage
   * @param {number} [preferred]
   */
  function setYears(nextYears, nextCoverage, preferred) {
    stop();
    years = nextYears;
    coverage = nextCoverage;

    range.min = '0';
    range.max = String(Math.max(0, years.length - 1));
    range.disabled = years.length < 2;
    playBtn.disabled = years.length < 2;

    renderTicks();

    // Yıl seçimi kapsama duyarlı olmalı. Göstergeler farklı hızlarda
    // yayımlanıyor: en yeni yılda bazılarında iki yüz ülke varken bazılarında
    // on üç tane oluyor. Bakılan yıl körü körüne korunursa gösterge
    // değiştirmek küreyi neredeyse boş bırakıyor.
    const peak = Math.max(1, ...coverage.values());
    const solid = years.filter((y) => (coverage.get(y) || 0) >= peak * 0.6);
    const pool = solid.length ? solid : years;

    let next = -1;
    // Kullanıcının baktığı yıl yeni gösterge için de yeterince doluysa korunur
    if (Number.isFinite(preferred) && (coverage.get(preferred) || 0) >= peak * 0.4) {
      next = years.indexOf(preferred);
    }
    if (next < 0) {
      const target = Number.isFinite(preferred) ? preferred : pool[pool.length - 1];
      // Eşitlikte en yeni yıl kazansın diye `<=` ile artan sırada taranıyor
      let best = pool[pool.length - 1];
      let bestGap = Infinity;
      for (const y of pool) {
        const gap = Math.abs(y - target);
        if (gap <= bestGap) { bestGap = gap; best = y; }
      }
      next = Math.max(0, years.indexOf(best));
    }

    commit(next, { announce: false });
    return years[next];
  }

  return {
    setYears,
    stop,
    get year() { return years[index]; },
    get playing() { return Boolean(timer); },
  };
}
