import http from 'node:http';
import { register, login, logout, authenticate, getData, putData, deleteAccount } from './auth.mjs';

// The server stores and returns opaque ciphertext. It never receives passwords,
// encryption keys or plaintext attendance data. Request logging is intentionally
// absent, so no usernames or addresses are written to logs.

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 512 * 1024;

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });

const bearer = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
};

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,64}$/;

async function handle(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  const method = req.method;

  if (method === 'POST' && pathname === '/api/auth/register') {
    const { username, authKey, inviteCode } = await readBody(req);
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      return send(res, 400, { error: 'Invalid username' });
    }
    const r = register(username, authKey, inviteCode);
    if (r.error === 'disabled') return send(res, 403, { error: 'Registration is closed' });
    if (r.error === 'invite') return send(res, 403, { error: 'Invalid invite code' });
    if (r.error === 'exists') return send(res, 409, { error: 'Username is taken' });
    if (r.error) return send(res, 400, { error: 'Invalid request' });
    return send(res, 201, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    const { username, authKey } = await readBody(req);
    if (typeof username !== 'string' || typeof authKey !== 'string') {
      return send(res, 400, { error: 'Missing credentials' });
    }
    const r = login(username, authKey);
    if (r.error === 'locked') return send(res, 429, { error: 'Too many failed attempts. Try again in 15 minutes.' });
    if (r.error) return send(res, 401, { error: 'Invalid username or password' });
    return send(res, 200, { token: r.token });
  }

  if (!pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });

  const username = authenticate(bearer(req));
  if (!username) return send(res, 401, { error: 'Please log in' });

  if (method === 'POST' && pathname === '/api/auth/logout') {
    logout(bearer(req));
    return send(res, 204);
  }

  if (method === 'GET' && pathname === '/api/data') {
    const d = getData(username);
    if (!d) return send(res, 404, { error: 'Not found' });
    return send(res, 200, d);
  }

  if (method === 'PUT' && pathname === '/api/data') {
    const { blob, version } = await readBody(req);
    if (typeof blob !== 'string' || blob.length > MAX_BODY || !Number.isInteger(version)) {
      return send(res, 400, { error: 'Invalid data' });
    }
    const r = putData(username, blob, version);
    if (r.error === 'conflict') return send(res, 409, { error: 'Data changed elsewhere', version: r.version });
    if (r.error) return send(res, 404, { error: 'Not found' });
    return send(res, 200, { version: r.version });
  }

  if (method === 'DELETE' && pathname === '/api/account') {
    deleteAccount(username, bearer(req));
    return send(res, 204);
  }

  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    if (res.headersSent) return;
    send(res, err.status || 500, { error: err.status ? err.message : 'Server error' });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Attendance API listening on ${HOST}:${PORT}`);
});
