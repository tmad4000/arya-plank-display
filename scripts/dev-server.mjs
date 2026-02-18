import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const baseDirArg = process.argv[2];
const baseDir = baseDirArg ? path.resolve(rootDir, baseDirArg) : rootDir;
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = safeJoin(baseDir, pathname);
  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  serve(filePath, res);
});

server.on('error', (error) => {
  if (error.code === 'EPERM') {
    console.error(
      `Could not start dev server on ${host}:${port} (permission denied in this environment).`
    );
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Serving ${baseDir} at http://${host}:${port}`);
});

function serve(filePath, res) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const fallback = path.join(baseDir, 'index.html');
      fs.readFile(fallback, (fallbackErr, html) => {
        if (fallbackErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }

        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
}

function safeJoin(base, targetPath) {
  const resolved = path.resolve(base, `.${targetPath}`);
  if (!resolved.startsWith(base)) {
    return null;
  }

  return resolved;
}
