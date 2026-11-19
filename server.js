import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { extname, resolve } from 'node:path';

const { ADMIN_PASSWORD, VIEWER_PASSWORD } = process.env;
if (!ADMIN_PASSWORD || !VIEWER_PASSWORD || ADMIN_PASSWORD === VIEWER_PASSWORD) {
  throw new Error('Defina ADMIN_PASSWORD e VIEWER_PASSWORD distintos no ambiente.');
}
const root = import.meta.dirname;
const dataDir = process.env.STUDIO_DATA_DIR || resolve(root, '.data');
await mkdir(dataDir, { recursive: true });
const database = new DatabaseSync(resolve(dataDir, 'studio.sqlite'));
database.exec(`
  CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, role TEXT, expires INTEGER);
`);
const hash = value => createHash('sha256').update(value).digest();
const tokenHash = value => hash(value).toString('hex');
const lifetime = 8 * 60 * 60;
const attempts = new Map();
const secureCookie = process.env.SECURE_COOKIE === '1' ? '; Secure' : '';
const cookie = (value, age) => `studio=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secureCookie}`;
const staticFiles = new Map([
  ['/app.js', 'public/app.js'], ['/style.css', 'public/style.css'], ['/viewport.js','public/viewport.js'],
  ['/vendor/three.module.js', 'node_modules/three/build/three.module.js'],
  ['/vendor/three.core.js', 'node_modules/three/build/three.core.js'],
  ['/vendor/OrbitControls.js', 'node_modules/three/examples/jsm/controls/OrbitControls.js'],
  ['/vendor/OBJLoader.js', 'node_modules/three/examples/jsm/loaders/OBJLoader.js'],
  ['/vendor/GLTFLoader.js', 'node_modules/three/examples/jsm/loaders/GLTFLoader.js'],
  ['/vendor/OBJExporter.js', 'node_modules/three/examples/jsm/exporters/OBJExporter.js'],
  ['/vendor/BufferGeometryUtils.js', 'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'],
  ['/utils/BufferGeometryUtils.js', 'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'],
  ['/vendor/SkeletonUtils.js', 'node_modules/three/examples/jsm/utils/SkeletonUtils.js'],
  ['/utils/SkeletonUtils.js', 'node_modules/three/examples/jsm/utils/SkeletonUtils.js'],
]);
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript' };
const route = /^\/(?:|entrar|studio(?:\/[a-f0-9]{24})?|admin)$/;
const invalid = (message, status = 400) => Object.assign(new Error(message), { status });

async function jsonBody(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw invalid('Envie um corpo JSON.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 12_000_000) chunks.push(chunk);
  }
  if (size > 12_000_000) throw invalid('O projeto excede o tamanho permitido.', 413);
  try { return JSON.parse(Buffer.concat(chunks)); }
  catch { throw invalid('Dados inválidos.'); }
}
function validProject(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 ||
      !Array.isArray(value.objects) || value.objects.length > 100 || !Array.isArray(value.messages)) return false;
  return value.objects.every(item => item && typeof item.id === 'string' && typeof item.name === 'string' &&
    ['cube','sphere','cylinder','cone','torus','imported'].includes(item.shape) && /^#[a-f\d]{6}$/i.test(item.color) &&
    ['position','rotation','scale'].every(key => Array.isArray(item[key]) && item[key].length === 3 &&
      item[key].every(n => Number.isFinite(n) && Math.abs(n) <= 3600)) &&
    (item.shape !== 'imported' || typeof item.source === 'string'));
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'sha256-y0joblgLTLFGhbj/xXhGS1SyGmxly/oZpyENyx9LBXI='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob: data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  const reply = (status, result) => {
    res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
    res.end(JSON.stringify(result));
  };
  const sessionToken = (req.headers.cookie || '').match(/(?:^|;\s*)studio=([a-f0-9]{64})(?:;|$)/)?.[1];
  const now = Math.floor(Date.now() / 1000);
  const session = sessionToken && database.prepare('SELECT role FROM sessions WHERE token=? AND expires>?').get(tokenHash(sessionToken), now);
  try {
    if (pathname.startsWith('/api/')) {
      if (!['GET','HEAD'].includes(req.method)) {
        const origin = req.headers.origin;
        if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && new URL(origin).host !== req.headers.host)) throw invalid('Origem inválida.', 403);
      }
      if (pathname === '/api/session' && req.method === 'GET') return reply(200, { role: session?.role ?? null });
      if (pathname === '/api/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress;
        for (const [address, entry] of attempts) if (entry.until <= now) attempts.delete(address);
        const attempt = attempts.get(ip) || { count: 0, until: now + 300 };
        if (attempt.count >= 10) throw invalid('Muitas tentativas. Aguarde alguns minutos.', 429);
        const { role, password } = await jsonBody(req) || {};
        const expected = role === 'admin' ? ADMIN_PASSWORD : VIEWER_PASSWORD;
        if (!['admin','viewer'].includes(role) || typeof password !== 'string' || !timingSafeEqual(hash(password), hash(expected))) {
          attempt.count++;
          attempts.set(ip, attempt);
          throw invalid('Perfil ou senha incorretos.', 401);
        }
        attempts.delete(ip);
        if (sessionToken) database.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash(sessionToken));
        database.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
        const token = randomBytes(32).toString('hex');
        database.prepare('INSERT INTO sessions VALUES (?,?,?)').run(tokenHash(token), role, now + lifetime);
        res.setHeader('Set-Cookie', cookie(token, lifetime));
        return reply(200, { role });
      }
      if (pathname === '/api/logout' && req.method === 'POST') {
        if (sessionToken) database.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash(sessionToken));
        res.setHeader('Set-Cookie', cookie('', 0));
        return reply(200, {});
      }
      if (!session) throw invalid('Entre para continuar.', 401);
      if (req.method !== 'GET' && session.role !== 'admin') throw invalid('A edição exige acesso administrativo.', 403);
      if ((pathname === '/api/projects' || pathname === '/api/admin') && req.method === 'GET') {
        if (pathname.endsWith('admin') && session.role !== 'admin') throw invalid('Acesso restrito a administradores.', 403);
        return reply(200, database.prepare('SELECT id,name FROM projects ORDER BY rowid DESC').all());
      }
      if (pathname === '/api/projects' && req.method === 'POST') {
        const project = await jsonBody(req);
        if (!validProject(project)) throw invalid('Dados do projeto inválidos.');
        const id = randomBytes(12).toString('hex');
        database.prepare('INSERT INTO projects VALUES (?,?,?)').run(id, project.name, JSON.stringify(project));
        return reply(201, { id });
      }
      const match = pathname.match(/^\/api\/projects\/([a-f0-9]{24})$/);
      if (match) {
        const id = match[1];
        const row = database.prepare('SELECT data FROM projects WHERE id=?').get(id);
        if (!row) throw invalid('Projeto não encontrado.', 404);
        if (req.method === 'GET') return reply(200, JSON.parse(row.data));
        if (req.method === 'PUT') {
          const project = await jsonBody(req);
          if (!validProject(project)) throw invalid('Dados do projeto inválidos.');
          database.prepare('UPDATE projects SET name=?,data=? WHERE id=?').run(project.name, JSON.stringify(project), id);
          return reply(200, {});
        }
        if (req.method === 'DELETE') {
          database.prepare('DELETE FROM projects WHERE id=?').run(id);
          return reply(200, {});
        }
      }
      throw invalid('Rota não encontrada.', 404);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw invalid('Método não permitido.', 405);
    const file = staticFiles.get(pathname) ?? (route.test(pathname) ? 'public/index.html' : null);
    if (!file) throw invalid('Página não encontrada.', 404);
    if (pathname === '/admin' && session && session.role !== 'admin') throw invalid('Acesso restrito a administradores.', 403);
    const content = await readFile(resolve(root, file));
    res.writeHead(200, {'Content-Type': `${types[extname(file)]}; charset=utf-8`});
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (!error.status) console.error(error);
    reply(error.status || 500, { error: error.status ? error.message : 'Falha interna. Tente novamente.' });
  }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1');
