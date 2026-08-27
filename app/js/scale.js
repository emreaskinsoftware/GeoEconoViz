/**
 * Renk rampaları ve nicelik (quantile) ölçeği.
 *
 * Kişi başına gelir gibi göstergeler ağır çarpıktır: doğrusal bir renk ölçeği
 * kullanılırsa dünyanın neredeyse tamamı rampanın en soğuk ucunda toplanır ve
 * harita hiçbir şey anlatmaz. Bu yüzden renk, değerin kendisine değil değerin
 * o yılki sıra yüzdesine bağlanıyor — kartografyada standart yaklaşım budur.
 */

/* --------------------------------------------------------------------------
   Renk
   -------------------------------------------------------------------------- */

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(n)));

function rgbToHex([r, g, b]) {
  return '#' + ((1 << 24) | (clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b))
    .toString(16).slice(1);
}

/**
 * Rampa üzerinde t konumundaki renk.
 * @param {string[]} stops en az iki hex durak
 * @param {number} t 0..1
 */
export function rampColor(stops, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const span = (stops.length - 1) * clamped;
  const i = Math.min(stops.length - 2, Math.floor(span));
  const local = span - i;

  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  return rgbToHex([
    a[0] + (b[0] - a[0]) * local,
    a[1] + (b[1] - a[1]) * local,
    a[2] + (b[2] - a[2]) * local,
  ]);
}

/** Bir rengi CSS rgba() dizisine çevirir — gölge ve dolgu tonları için. */
export function withAlpha(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* --------------------------------------------------------------------------
   Ölçek
   -------------------------------------------------------------------------- */

/**
 * Verilen değerler kümesi üzerinde nicelik ölçeği kurar.
 * @param {number[]} values ham değerler (sıralı olmak zorunda değil)
 */
export function quantileScale(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;

  return {
    size: n,
    min: n ? sorted[0] : 0,
    max: n ? sorted[n - 1] : 0,

    /** Değerin sıra yüzdesi (0..1). Boş kümede 0. */
    position(v) {
      if (!n || !Number.isFinite(v)) return 0;
      if (n === 1) return 0.5;

      // v'den küçük olanların sayısını ikili aramayla bul
      let lo = 0;
      let hi = n;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] < v) lo = mid + 1;
        else hi = mid;
      }
      // Eşit değerleri aralığın ortasına yerleştir ki eşitlikler aynı rengi alsın
      let upper = lo;
      while (upper < n && sorted[upper] === v) upper++;
      const rank = (lo + upper - 1) / 2;
      return rank / (n - 1);
    },

    /** t niceliğine düşen değer — lejant etiketleri için. */
    at(t) {
      if (!n) return 0;
      const idx = Math.round(Math.max(0, Math.min(1, t)) * (n - 1));
      return sorted[idx];
    },
  };
}

/** Lejantın beş durağı: en düşük, çeyrek, orta, üç çeyrek, en yüksek. */
export const LEGEND_STOPS = [0, 0.25, 0.5, 0.75, 1];
