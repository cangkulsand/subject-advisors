// Local static review of the compiled fictional prototype; no npm packages needed.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../dist-offerings/demo/', import.meta.url));
const port = Number(process.env.P002_PREVIEW_PORT ?? 5184);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a valid P002_PREVIEW_PORT.');
await readFile(resolve(root, 'index.html')); // Fail clearly if the built preview is missing.
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname); }
  catch { response.writeHead(400); response.end(); return; }
  const target = resolve(root, '.' + pathname);
  const within = relative(root, target);
  if (isAbsolute(within) || within === '..' || within.startsWith('..' + sep) || resolve(root, within) !== target) {
    response.writeHead(403); response.end(); return;
  }
  try {
    // Only the two explicit page routes fall back to the demo, never arbitrary files.
    const file = pathname === '/' || pathname === '/student/offerings' ? resolve(root, 'index.html') : target;
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404); response.end(); }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Fictional UC08 preview: http://127.0.0.1:${port}/student/offerings`);
  console.log('Local browser data only. Press Ctrl+C to stop.');
});
