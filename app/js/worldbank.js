/**
 * Dünya Bankası Açık Veri API'si (v2).
 *
 * Anahtar istemez, CORS açıktır, ücretsizdir. Bu yüzden projede arada bir
 * sunucu yok: tarayıcı doğrudan kaynaktan okuyor.
 *
 * Bir gösterge tek istekte geliyor (tüm ülkeler x tüm yıllar, ~9.000 satır).
 * Ham yanıt ~2 MB olduğu için önbelleğe sıkıştırılmış hâlini yazıyoruz:
 *   { AFG: { 1990: 12.3, 1991: 11.8, ... }, ALB: {...} }
 */

import { read, write } from './store.js';
import { YEAR_MIN, YEAR_MAX } from './indicators.js';

const BASE = 'https://api.worldbank.org/v2';
const TTL_INDICATOR = 7 * 24 * 60 * 60 * 1000;    // 7 gün
const TTL_COUNTRIES = 30 * 24 * 60 * 60 * 1000;   // 30 gün
const TIMEOUT = 30000;

/** Türkçe ülke adı üreteci. Ortam desteklemiyorsa İngilizce ada düşülür. */
const trNames = (() => {
  try {
    return new Intl.DisplayNames(['tr'], { type: 'region' });
  } catch {
    return null;
  }
})();

/** Dünya Bankası'nın bölge ve gelir grubu etiketleri sabit bir kümedir. */
const REGIONS = {
  'East Asia & Pacific': 'Doğu Asya ve Pasifik',
  'Europe & Central Asia': 'Avrupa ve Orta Asya',
  'Latin America & Caribbean': 'Latin Amerika ve Karayipler',
  'Middle East & North Africa': 'Orta Doğu ve Kuzey Afrika',
  'North America': 'Kuzey Amerika',
  'South Asia': 'Güney Asya',
  'Sub-Saharan Africa': 'Sahra Altı Afrika',
};

const INCOMES = {
  'High income': 'Yüksek gelir',
  'Upper middle income': 'Üst orta gelir',
  'Lower middle income': 'Alt orta gelir',
  'Low income': 'Düşük gelir',
  'Not classified': 'Sınıflandırılmamış',
};

export function turkishName(iso2, fallback) {
  if (!trNames || !iso2) return fallback;
  try {
    const name = trNames.of(iso2.toUpperCase());
    // Intl bilmediği kodu olduğu gibi geri verir; o durumda İngilizcesi daha iyi.
    return !name || name === iso2.toUpperCase() ? fallback : name;
  } catch {
    return fallback;
  }
}

/** Zaman aşımlı, tek yeniden denemeli JSON isteği. */
async function fetchJson(url, { retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { signal: abort.signal });
      if (!res.ok) throw new Error(`Dünya Bankası ${res.status} döndürdü`);
      const body = await res.json();
      // Hata durumunda API 200 ile { message: [...] } döndürebiliyor.
      if (!Array.isArray(body)) throw new Error('Beklenmeyen yanıt biçimi');
      if (body[0] && body[0].message) {
        throw new Error(body[0].message[0]?.value || 'Dünya Bankası hata bildirdi');
      }
      return body;
    } catch (err) {
      if (attempt >= retries) {
        throw err.name === 'AbortError'
          ? new Error('Dünya Bankası zaman aşımına uğradı')
          : err;
      }
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Ülke listesi ve künyeleri.
 * Bölge kimliği "NA" olan kayıtlar ülke değil, toplulaştırma ("Avrupa Birliği",
 * "Yüksek gelirli ülkeler" gibi) — sıralamayı bozmasınlar diye eleniyor.
 *
 * @returns {Promise<Map<string, object>>} ISO3 -> künye
 */
export async function loadCountries() {
  const key = 'countries:v2';
  let rows = await read(key, TTL_COUNTRIES);

  if (!rows) {
    const body = await fetchJson(`${BASE}/country?format=json&per_page=400`);
    rows = (body[1] || [])
      .filter((c) => c.region && c.region.id !== 'NA')
      .map((c) => ({
        iso3: c.id,
        iso2: (c.iso2Code || '').toUpperCase(),
        nameEn: c.name.trim(),
        region: c.region.value.trim(),
        income: c.incomeLevel?.value?.trim() || '',
        capital: c.capitalCity?.trim() || '',
        lat: Number(c.latitude) || null,
        lon: Number(c.longitude) || null,
      }));
    await write(key, rows);
  }

  const map = new Map();
  for (const c of rows) {
    map.set(c.iso3, {
      ...c,
      name: turkishName(c.iso2, c.nameEn),
      region: REGIONS[c.region] || c.region,
      income: INCOMES[c.income] || c.income,
    });
  }
  return map;
}

/**
 * Bir göstergenin bütün ülke-yıl serisi.
 *
 * @param {string} code Dünya Bankası gösterge kodu
 * @returns {Promise<{byCountry: Record<string, Record<number, number>>,
 *                    years: number[], updated: string}>}
 */
export async function loadIndicator(code) {
  const key = `ind:${code}:${YEAR_MIN}-${YEAR_MAX}`;
  const cached = await read(key, TTL_INDICATOR);
  if (cached) return cached;

  const url =
    `${BASE}/country/all/indicator/${encodeURIComponent(code)}` +
    `?format=json&per_page=20000&date=${YEAR_MIN}:${YEAR_MAX}`;

  const body = await fetchJson(url);
  const rows = body[1] || [];

  const byCountry = {};
  const yearSet = new Set();

  for (const row of rows) {
    const iso3 = row.countryiso3code;
    const value = row.value;
    // Toplulaştırmaların ISO3'ü boş gelir; değeri olmayan satır da işe yaramaz.
    if (!iso3 || value === null || value === undefined) continue;

    const year = Number(row.date);
    if (!Number.isFinite(year)) continue;

    (byCountry[iso3] ||= {})[year] = value;
    yearSet.add(year);
  }

  const result = {
    byCountry,
    years: [...yearSet].sort((a, b) => a - b),
    updated: body[0]?.lastupdated || '',
  };

  await write(key, result);
  return result;
}
