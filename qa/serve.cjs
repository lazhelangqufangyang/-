const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve('D:/Qoder/赚钱/fitness-planner/dist');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
};

http
  .createServer((req, res) => {
    const p = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.resolve(root + (p === '/' ? '/index.html' : p));
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(404);
      res.end('out');
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end('no');
      return;
    }
    res.writeHead(200, {
      'X-Mark': 'v3',
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(8082, '127.0.0.1');
