import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 8092);
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.sqlite': 'application/octet-stream', '.json': 'application/json', '.wav': 'audio/wav', '.png': 'image/png', '.ico': 'image/x-icon' };
createServer((req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname));
  if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const file = statSync(path).isDirectory() ? resolve(path, 'index.html') : path;
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    createReadStream(file).on('error', () => res.end()).pipe(res);
  } catch { res.writeHead(404).end(); }
}).listen(port, '127.0.0.1', () => console.log(`SQLite web acceptance: http://localhost:${port}`));
