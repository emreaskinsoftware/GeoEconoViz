/**
 * "En çok değişen" bloğu.
 *
 * Sıralama bir yılın fotoğrafını gösteriyor; bu blok filmin kendisini: seçili
 * göstergede en çok yükselen ve en çok gerileyen ülke. Bu bilgi arayüzün başka
 * hiçbir yerinde görünmüyor ve genelde şaşırtıcı çıkıyor — Ruanda'nın yaşam
 * süresi ya da Venezuela'nın kişi başına geliri gibi.
 *
 * Satırlara tıklanınca o ülke seçiliyor: blok aynı zamanda keşfe davet.
 */

/**
 * @param {Array<{year:number, value:number}>} points yıla göre sıralı seri
 * @param {number} from başlangıç yılı
 * @param {number} to bitiş yılı
 * @returns {{from:number,to:number,delta:number,ratio:number}|null}
 */
function changeBetween(points, from, to) {
  // Aralığın uçlarına en yakın gerçek gözlemler; ara yıllar boş olabiliyor.
  let a = null;
  let b = null;
  for (const p of points) {
    if (p.year < from) continue;
    if (p.year > to) break;
    if (a === null) a = p;
    b = p;
  }
  if (!a || !b || a.year === b.year) return null;
  return { from: a, to: b, delta: b.value - a.value, ratio: a.value ? b.value / a.value : null };
}

export function createShifts(root, { onPick }) {
  const head = root.querySelector('.shifts-range');
  const list = root.querySelector('.shifts-list');

  /**
   * @param {object} opts
   * @param {object} opts.indicator etkin gösterge
   * @param {number} opts.year bitiş yılı
   * @param {number} opts.since başlangıç yılı
   * @param {Map<string,object>} opts.countries künyeler
   * @param {(iso3:string)=>Array} opts.seriesFor ülkenin serisi
   * @param {string[]} opts.pool değerlendirilecek ISO3 listesi
   */
  function update({ indicator, year, since, countries, seriesFor, pool }) {
    const changes = [];
    for (const iso3 of pool) {
      const country = countries.get(iso3);
      if (!country) continue;
      const change = changeBetween(seriesFor(iso3), since, year);
      // En az on yıllık bir aralık olmadan "değişim" demek yanıltıcı olur
      if (!change || change.to.year - change.from.year < 10) continue;
      changes.push({ iso3, country, ...change });
    }

    list.textContent = '';

    if (changes.length < 2) {
      head.textContent = '';
      const empty = document.createElement('p');
      empty.className = 'shifts-empty';
      empty.textContent = 'Karşılaştırmaya yetecek tarihsel kayıt yok.';
      list.appendChild(empty);
      return;
    }

    changes.sort((a, b) => b.delta - a.delta);
    const riser = changes[0];
    const faller = changes[changes.length - 1];

    const span = [
      Math.min(riser.from.year, faller.from.year),
      Math.max(riser.to.year, faller.to.year),
    ];
    head.textContent = `${span[0]} → ${span[1]}`;

    for (const entry of [riser, faller]) {
      // Ok, listedeki sırayı değil sayının işaretini gösterir. Doğum hızı gibi
      // bütün ülkelerin gerilediği göstergelerde en üstteki satır bile eksi
      // çıkıyor; ona yukarı ok koymak sayıyla çelişirdi.
      const dir = entry.delta > 0 ? 'up' : 'down';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shift';
      btn.dataset.dir = dir;

      // Ok yönü sayının yönünü gösterir, renk ise bunun iyi mi kötü mü olduğunu.
      // İkisini birbirine bağlamak yanıltıcı olurdu: bebek ölüm hızının artması
      // "yükseliş" ama iyi haber değil.
      btn.dataset.good =
        indicator.tone === 'neutral' ? 'neutral'
        : String((indicator.tone === 'prosperity') === (entry.delta > 0));

      const yon = dir === 'up' ? 'arttı' : 'azaldı';
      btn.title = `${entry.country.name}: ${indicator.format(entry.from.value)} → ${indicator.format(entry.to.value)}`;
      btn.setAttribute('aria-label',
        `${entry.country.name}, ${indicator.name} ${entry.from.year}'den ${entry.to.year}'e ${yon}`);

      const arrow = document.createElement('span');
      arrow.className = 'shift-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = dir === 'up' ? '▲' : '▼';

      const name = document.createElement('span');
      name.className = 'shift-name';
      name.textContent = entry.country.name;

      const delta = document.createElement('span');
      delta.className = 'shift-delta num';
      const sign = entry.delta > 0 ? '+' : '−';
      delta.textContent = sign + indicator.formatShort(Math.abs(entry.delta));

      btn.append(arrow, name, delta);
      btn.addEventListener('click', () => onPick(entry.iso3));
      list.appendChild(btn);
    }
  }

  return { update };
}
