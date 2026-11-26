'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { collectNews } = require('./lib/feeds');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const TTL_MS = (Number(process.env.CACHE_MINUTES) || 10) * 60 * 1000;
const MIN_REFRESH_MS = 60 * 1000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

let cache = null; // { body: Buffer, gz: Buffer, at: number }
let inflight = null;

async function getNews(force) {
  const fresh = cache && Date.now() - cache.at < (force ? MIN_REFRESH_MS : TTL_MS);
  if (fresh) return cache;
  if (!inflight) {
    inflight = collectNews()
      .then((payload) => {
        const body = Buffer.from(JSON.stringify(payload));
        const total = Object.values(payload.sections).flat().length;
        // Sem nenhuma matéria (fontes fora do ar), tenta de novo em 1 minuto.
        cache = { body, gz: zlib.gzipSync(body), at: total ? Date.now() : Date.now() - TTL_MS + MIN_REFRESH_MS };
        const ok = payload.sources.filter((s) => s.ok).length;
        console.log(`[news] ${ok}/${payload.sources.length} fontes ok, ${total} matérias`);
        return cache;
      })
      .finally(() => { inflight = null; });
  }
  // Se já existe cache antigo, devolve imediatamente e atualiza em segundo plano.
  if (cache && !force) {
    inflight.catch(() => {});
    return cache;
  }
  return inflight;
}

function send(res, req, status, headers, body, gz) {
  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (gz && acceptsGzip) {
    headers['Content-Encoding'] = 'gzip';
    body = gz;
  }
  headers['Vary'] = 'Accept-Encoding';
  headers['X-Content-Type-Options'] = 'nosniff';
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

async function handleApi(req, res, url) {
  try {
    const data = await getNews(url.searchParams.get('refresh') === '1');
    send(res, req, 200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache' }, data.body, data.gz);
  } catch (err) {
    console.error('[news] falha ao coletar', err);
    send(res, req, 502, { 'Content-Type': MIME['.json'] }, JSON.stringify({ error: 'Não foi possível carregar as fontes agora.' }));
  }
}

function handleStatic(req, res, url) {
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    return send(res, req, 400, { 'Content-Type': MIME['.txt'] }, 'Requisição inválida');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    return send(res, req, 403, { 'Content-Type': MIME['.txt'] }, 'Acesso negado');
  }
  fs.readFile(file, (err, content) => {
    if (err) return send(res, req, 404, { 'Content-Type': MIME['.txt'] }, 'Não encontrado');
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const compressible = /text|json|svg|manifest|javascript/.test(type);
    const cacheControl = ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600';
    send(res, req, 200, { 'Content-Type': type, 'Cache-Control': cacheControl }, content, compressible ? zlib.gzipSync(content) : null);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, req, 405, { 'Content-Type': MIME['.txt'], Allow: 'GET, HEAD' }, 'Método não permitido');
  }
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return send(res, req, 400, { 'Content-Type': MIME['.txt'] }, 'Requisição inválida');
  }
  if (url.pathname === '/api/news') return handleApi(req, res, url);
  return handleStatic(req, res, url);
});

server.listen(PORT, HOST, () => {
  console.log(`Panorama rodando em http://localhost:${PORT}`);
  getNews(false).catch(() => {}); // aquece o cache
});
