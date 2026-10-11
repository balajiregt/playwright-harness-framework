import http from 'node:http';
import { createApi } from './api.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT ?? 4173);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

function resolveAsset(urlPath) {
  if (urlPath.startsWith('/assets/')) {
    return path.join(publicDir, urlPath);
  }
  return path.join(publicDir, 'index.html');
}

const fault = process.env.CRM_BENCHMARK_FAULT ?? null;
if (fault && process.env.CRM_BENCHMARK_MODE !== '1') throw new Error('Faults require explicit benchmark mode');
const api = createApi({ fault });

const server = http.createServer(async (request, response) => {
  try {
    if (await api(request, response)) return;
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
    const filePath = resolveAsset(url.pathname);
    const data = await fs.readFile(filePath);
    response.writeHead(200, {
      'content-type': contentTypes.get(path.extname(filePath)) ?? 'application/octet-stream'
    });
    response.end(data);
  } catch (error) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Sample CRM app listening on http://127.0.0.1:${port}`);
});

