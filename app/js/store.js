/**
 * Süreli anahtar/değer önbelleği (IndexedDB).
 *
 * Dünya Bankası bir göstergenin tüm ülke-yıl serisini tek istekte veriyor ama
 * ham yanıt ~2 MB. Sıkıştırılmış hâlini burada saklıyoruz: ilk açılıştan sonra
 * gösterge değiştirmek ağa hiç çıkmıyor.
 *
 * IndexedDB kullanılamıyorsa (gizli sekme, kısıtlı depolama, dosya protokolü)
 * bellek içi haritaya düşer — uygulama çalışmaya devam eder, sadece sekme
 * kapanınca önbellek gider.
 */

const DB_NAME = 'geoeconoviz';
const STORE = 'cache';
const VERSION = 1;

const memory = new Map();
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, VERSION);
    } catch {
      resolve(null);           // indexedDB erişimi engellenmiş
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve) => {
    let request;
    try {
      request = fn(db.transaction(STORE, mode).objectStore(STORE));
    } catch {
      resolve(undefined);
      return;
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
  });
}

/**
 * Önbellekten oku. Kayıt yoksa veya süresi dolmuşsa undefined döner.
 * @param {string} key
 * @param {number} maxAgeMs
 */
export async function read(key, maxAgeMs) {
  const local = memory.get(key);
  if (local && Date.now() - local.at < maxAgeMs) return local.value;

  const db = await openDb();
  if (!db) return undefined;

  const record = await tx(db, 'readonly', (s) => s.get(key));
  if (!record || Date.now() - record.at >= maxAgeMs) return undefined;

  memory.set(key, record);
  return record.value;
}

/**
 * Önbelleğe yaz. Kota dolarsa sessizce geçer — veri zaten ağdan alınabilir.
 */
export async function write(key, value) {
  const record = { at: Date.now(), value };
  memory.set(key, record);

  const db = await openDb();
  if (!db) return;
  await tx(db, 'readwrite', (s) => s.put(record, key));
}

/** Tüm önbelleği boşalt. */
export async function clear() {
  memory.clear();
  const db = await openDb();
  if (!db) return;
  await tx(db, 'readwrite', (s) => s.clear());
}
