import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = file.slice(root.length);
    if (!file.startsWith(root) || relative.split(sep).some(part => part.startsWith('.')) || !types[extname(file)]) {
      response.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] + '; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
server.listen(port, host, () => console.log(`Sandtris running at http://${host}:${port}`));
