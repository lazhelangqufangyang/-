/**
 * 生产静态服务：gzip + 长缓存 + /api 反代。
 * 只依赖 Node 内置模块，替代 vite preview（后者不压缩、且给静态资源发 no-cache）。
 * 用法：node serve.mjs（默认 4173，可用 PORT / API_TARGET 覆盖）
 */
import { createServer, request } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = join(process.cwd(), 'dist');
const PORT = Number(process.env.PORT || 4173);
const API_TARGET = new URL(process.env.API_TARGET || 'http://127.0.0.1:8787');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest']);
const gzipCache = new Map();

function cacheControl(pathname) {
  if (pathname === '/index.html' || pathname === '/sw.js') return 'no-cache';
  if (pathname.startsWith('/assets/') || /\.(jpg|jpeg|png|svg|webmanifest|woff2)$/i.test(pathname)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=3600';
}

function send(req, res, filePath, pathname) {
  const stat = statSync(filePath);
  const ext = extname(filePath).toLowerCase();
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl(pathname),
    ETag: etag,
    Vary: 'Accept-Encoding',
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  if (COMPRESSIBLE.has(ext) && String(req.headers['accept-encoding'] || '').includes('gzip')) {
    let body = gzipCache.get(filePath);
    if (!body) {
      body = gzipSync(readFileSync(filePath));
      gzipCache.set(filePath, body);
    }
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }

  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

function serve(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const filePath = normalize(join(ROOT, rel));
  const inside = filePath.startsWith(ROOT + sep);
  if (inside && existsSync(filePath) && statSync(filePath).isFile()) {
    send(req, res, filePath, pathname);
    return;
  }
  // 带扩展名的算静态资源缺失，其余回退 index.html（SPA）
  if (extname(rel)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  send(req, res, join(ROOT, 'index.html'), '/index.html');
}

function proxy(req, res, url) {
  const upstream = request(
    {
      hostname: API_TARGET.hostname,
      port: API_TARGET.port || 80,
      path: url.pathname + url.search,
      method: req.method,
      headers: { ...req.headers, host: API_TARGET.host },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (res.headersSent) return;
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ code: 502, message: '后端不可用' }));
  });
  req.pipe(upstream);
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    proxy(req, res, url);
    return;
  }
  serve(req, res, url.pathname);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`[serve] http://127.0.0.1:${PORT} -> ${ROOT}, api -> ${API_TARGET.href}`);
});
