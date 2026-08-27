/**
 * Yerel geliştirme sunucusu.
 *
 * Bağımlılığı yok: `npm start` demek için `npm install` gerekmiyor. Tek işi
 * dosyaları doğru MIME türüyle vermek — uygulama ES modülleri kullandığı için
 * dosyayı çift tıklayıp açmak (file://) çalışmaz, HTTP gerekir.
 *
 * Yayına almak için sunucu şart değil: klasörü olduğu gibi GitHub Pages,
 * Netlify ya da Vercel'e koymak yeterli.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Geçersiz istek');
    return;
  }

  if (pathname.endsWith('/')) pathname += 'index.html';

  // Dizin dışına çıkma denemelerini engelle
  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, 'index.html')) {
    res.writeHead(403).end('Erişim yok');
    return;
  }

  fs.readFile(filePath, (err, body) => {
    if (err) {
      // Bilinmeyen yol: tek sayfalık uygulama olduğu için index.html'e düş
      if (!path.extname(pathname)) {
        fs.readFile(path.join(ROOT, 'index.html'), (e2, html) => {
          if (e2) res.writeHead(404).end('Bulunamadı');
          else res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(html);
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bulunamadı');
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(body);
  });
});

server.listen(PORT, () => {
  console.log(`GeoEconoViz  →  http://localhost:${PORT}`);
});
