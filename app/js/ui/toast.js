/**
 * Bildirimler.
 *
 * Projenin ilk hâlinde her hata yalnızca console.error'a gidiyordu; kullanıcı
 * bir şeyin bozulduğunu hiç görmüyordu. Artık hata da, uzun süren işin bittiği
 * de ekranda söyleniyor.
 */

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement('div');
  host.className = 'toasts';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

/**
 * @param {string} message
 * @param {{tone?: 'info'|'error', duration?: number}} [opts]
 */
export function toast(message, opts = {}) {
  const { tone = 'info', duration = tone === 'error' ? 6000 : 3200 } = opts;

  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.tone = tone;

  const dot = document.createElement('span');
  dot.className = 'toast-dot';
  el.appendChild(dot);
  el.appendChild(document.createTextNode(message));

  ensureHost().appendChild(el);

  const remove = () => {
    el.dataset.leaving = 'true';
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 600);      // animasyon kapalıysa da temizle
  };
  const timer = setTimeout(remove, duration);
  el.addEventListener('click', () => { clearTimeout(timer); remove(); });

  return remove;
}
