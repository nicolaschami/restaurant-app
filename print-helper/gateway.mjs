// print-helper/gateway.mjs
//
// RES LOCAL GATEWAY — offline POS, step 3a (agreed with the user 2026-10-29).
// On the cashier PC the POS opens through RES Local:  http://localhost:3901
// (instead of the VPS address). Why: the VPS is on plain http for now, and browsers
// only let a page work without internet on https or localhost.
//
//   ONLINE  → everything is passed through to the VPS (screens, /api, /uploads, the
//             live WebSocket): the POS works exactly as before. On the way, RES Local
//             keeps a copy of the screens (table files) and of the answers the POS
//             needs to open (table api_cache).
//   OFFLINE → the VPS does not answer: RES Local answers by itself from those copies,
//             at the same address. What is not available offline answers 503 with a
//             clear message. Every 10 s it checks if the VPS is back.
//
// Only this PC for now (127.0.0.1). POS 2 over the LAN comes in a later step.
// Offline ORDERS (steps 3b / 3c): offline-orders.mjs answers the order calls first (new
// order OFF-0001, changes, open orders, tables, payment, printing, PIN login).
//
// SYNC (step 4): back ONLINE, sync.mjs sends the actions taken offline to the server.
// Until an order's actions are all sent, that order stays on this PC even online:
//   - a call on an OFF order already synced goes to its real order (OFF-0001 → #1042);
//   - a call on an order with actions still waiting is answered here and queued after
//     them (so the server receives the actions in the order they were done);
//   - Z closing is refused while actions are waiting (the Z must count every sale).
//
// POS 2 (step 5, 2026-10-29): with "lan": true in config.json the gateway also listens
// on the restaurant network, so POS 2 opens the POS at http://<this PC's address>:3901
// and shares the same RES Local (same copy, same OFF counter, same orders, same printers).
// Safety: guests on the restaurant Wi-Fi are on that network too. Online the server
// checks every login; OFFLINE RES Local answers only logins the server ACCEPTED through
// this gateway before (known_tokens: sha256 of the token) — anything else gets 401.

import http from 'node:http';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createOfflineOrders, LOCAL_BASE } from './offline-orders.mjs';
import { startSync } from './sync.mjs';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

// The GET answers the POS needs to open offline (kept while online).
const OFFLINE_GETS = [
  /^\/api\/tables$/,
  /^\/api\/categories$/,
  /^\/api\/menu-items$/,
  /^\/api\/modifier-groups$/,
  /^\/api\/customers$/,
  /^\/api\/orders\/active$/,
  /^\/api\/orders\/\d+$/,
  /^\/api\/restaurant\/settings$/,
  /^\/api\/auth\/me$/,
];
const CONNECT_TIMEOUT = 5_000; // no answer to "connect" in 5 s = the VPS can't be reached
const PROBE_EVERY = 10_000;

// The user id inside a login token (only to keep /api/auth/me per user; not a security check).
function tokenUserId(req) {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return String(payload.id ?? '');
  } catch {
    return '';
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

// print(printer, base64) → { ok, error? }: the helper's own printing (used offline)
export function startGateway({ server, key, port = 3901, lan = false, log, copy, print }) {
  const target = new URL(String(server || 'http://127.0.0.1:3000'));
  const secure = target.protocol === 'https:';
  const targetPort = Number(target.port) || (secure ? 443 : 80);
  const lib = secure ? https : http;
  const db = copy.db;
  const offline = createOfflineOrders({ db, log, print });

  let vpsUp = true; // optimistic at start: the first request tells
  const sync = startSync({ db, server, key, log, isOnline: () => vpsUp });
  const setVps = (up) => {
    if (up === vpsUp) return;
    vpsUp = up;
    log(up ? 'Gateway: the server answers again → ONLINE.' : 'Gateway: the server does not answer → OFFLINE, answering from the local copy.');
    if (up) sync.syncNow(); // back online: send what was done offline
  };
  setTimeout(() => sync.syncNow(), 3_000); // actions left from before a restart

  // ---- known logins (offline: only these are answered)
  const tokenOf = (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const hashToken = (t) => createHash('sha256').update(t).digest('hex');
  const known = new Set(db.prepare('SELECT hash FROM known_tokens').all().map((r) => r.hash));
  const getKnown = db.prepare('SELECT exp FROM known_tokens WHERE hash = ?');
  const addKnown = db.prepare('INSERT INTO known_tokens (hash, user_id, exp, seen_at) VALUES (?, ?, ?, ?) ON CONFLICT (hash) DO NOTHING');
  function tokenExp(t) {
    try {
      return Number(JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8')).exp || 0);
    } catch {
      return 0;
    }
  }
  function rememberToken(t) {
    if (!t || t.split('.').length !== 3) return;
    const h = hashToken(t);
    if (known.has(h)) return;
    known.add(h);
    let userId = '';
    try {
      userId = String(JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8')).id ?? '');
    } catch {
      /* not a login token */
    }
    addKnown.run(h, userId, tokenExp(t), new Date().toISOString());
  }
  function knownToken(t) {
    if (!t) return false;
    const h = hashToken(t);
    if (!known.has(h)) return false;
    const exp = Number(getKnown.get(h)?.exp || 0);
    return !exp || exp * 1000 > Date.now();
  }
  // the PIN logins work WITHOUT a login (that is how you log in); everything else needs one
  const NO_LOGIN_NEEDED = new Set(['/api/auth/pin-login', '/api/auth/terminal-login', '/api/auth/terminal-check']);

  // Online, a call on an order taken / changed offline: where must it go?
  //   'local' → answered here (actions of that order still waiting), else the path to send
  const mapId = db.prepare('SELECT server_id FROM id_map WHERE local_id = ?');
  function routeOrderCall(req, url, body) {
    let id = Number(url.pathname.match(/^\/api\/orders\/(\d+)(?:\/pay)?$/)?.[1]);
    if (!id && url.pathname === '/api/printing/receipt') {
      try {
        id = Number(JSON.parse(body.toString('utf8') || '{}').orderId);
      } catch {
        id = 0;
      }
    }
    if (!id) return null;
    if (offline.pending(id)) return 'local';
    if (id >= LOCAL_BASE) {
      const m = mapId.get(id);
      if (!m) return 'local';
      if (url.pathname === '/api/printing/receipt') return { body: Buffer.from(JSON.stringify({ ...JSON.parse(body.toString('utf8')), orderId: m.server_id })) };
      return { url: req.url.replace(`/api/orders/${id}`, `/api/orders/${m.server_id}`) };
    }
    return null;
  }

  const saveFile = db.prepare(
    'INSERT INTO files (path, content_type, body, saved_at) VALUES (?, ?, ?, ?) ON CONFLICT (path) DO UPDATE SET content_type = excluded.content_type, body = excluded.body, saved_at = excluded.saved_at'
  );
  const getFile = db.prepare('SELECT content_type, body FROM files WHERE path = ?');
  const saveApi = db.prepare(
    'INSERT INTO api_cache (key, status, content_type, body, saved_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET status = excluded.status, content_type = excluded.content_type, body = excluded.body, saved_at = excluded.saved_at'
  );
  const getApi = db.prepare('SELECT status, content_type, body FROM api_cache WHERE key = ?');
  const apiKey = (req, pathAndQuery) => (pathAndQuery.startsWith('/api/auth/me') ? `${pathAndQuery}#user=${tokenUserId(req)}` : pathAndQuery);

  // Pass one request to the VPS. Resolves true when the VPS answered (the answer is
  // already sent to the POS), false when it could not be reached (nothing sent yet).
  function forward(req, res, body, onAnswer) {
    return new Promise((resolve) => {
      const headers = { ...req.headers, host: target.host };
      delete headers['accept-encoding']; // plain answers, so they can be kept as they are
      if (body.length) headers['content-length'] = String(body.length);
      const up = lib.request(
        { protocol: target.protocol, hostname: target.hostname, port: targetPort, method: req.method, path: req.url, headers },
        (upRes) => {
          setVps(true);
          const chunks = [];
          res.writeHead(upRes.statusCode || 502, upRes.headers);
          upRes.on('data', (c) => {
            chunks.push(c);
            res.write(c);
          });
          upRes.on('end', () => {
            res.end();
            try {
              onAnswer?.(upRes, Buffer.concat(chunks));
            } catch (err) {
              log('Gateway: could not keep a copy of', req.url, '-', String(err?.message || err));
            }
            resolve(true);
          });
          upRes.on('error', () => {
            res.destroy();
            resolve(true);
          });
        }
      );
      // "connect" must succeed within 5 s; after that a slow answer is fine (30 s idle).
      up.on('socket', (s) => {
        if (s.connecting === false) return;
        const t = setTimeout(() => up.destroy(new Error('connect timeout')), CONNECT_TIMEOUT);
        s.once(secure ? 'secureConnect' : 'connect', () => clearTimeout(t));
      });
      up.setTimeout(30_000, () => up.destroy(new Error('timeout')));
      up.on('error', () => {
        if (res.headersSent) {
          res.destroy();
          resolve(true);
        } else resolve(false);
      });
      up.end(body);
    });
  }

  // Answer from the local copies (the VPS can't be reached).
  async function answerOffline(req, res, url, body) {
    const path = url.pathname;
    if (path.startsWith('/api/')) {
      // offline, only a login the server accepted before through this gateway
      if (!NO_LOGIN_NEEDED.has(path) && !knownToken(tokenOf(req))) {
        return sendJson(res, 401, { error: 'No internet: this login is not known on this PC. Log in once while online.', offline: true });
      }
      // the order calls first: offline orders (OFF-0001…), payment, printing, PIN login
      let answer = null;
      try {
        answer = await offline.handle(req, url, body, tokenUserId(req));
      } catch (err) {
        log('Offline order error:', String(err?.stack || err));
        return sendJson(res, 500, { error: 'RES Local could not save this offline. Please try again.' });
      }
      if (answer) {
        res.writeHead(answer.status, { 'content-type': 'application/json; charset=utf-8', 'x-res-offline': '1', 'cache-control': 'no-store' });
        return res.end(JSON.stringify(answer.body));
      }
      const hit = req.method === 'GET' ? getApi.get(apiKey(req, path + url.search)) : null;
      if (hit) {
        res.writeHead(hit.status, { 'content-type': hit.content_type || 'application/json', 'x-res-offline': '1', 'cache-control': 'no-store' });
        return res.end(Buffer.from(hit.body));
      }
      return sendJson(res, 503, { error: 'No internet: this is not available offline. Selling on the POS keeps working.', offline: true });
    }
    if (req.method === 'GET') {
      // the screens: the file itself, or the app's page for its own addresses (/pos, /…)
      const file = getFile.get(path) || ((req.headers.accept || '').includes('text/html') ? getFile.get('/') || getFile.get('/index.html') : null);
      if (file) {
        res.writeHead(200, { 'content-type': file.content_type || 'application/octet-stream', 'x-res-offline': '1' });
        return res.end(Buffer.from(file.body));
      }
    }
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('RES Local: no internet, and this page was never opened online on this PC.');
  }

  // Keep a copy of what passed (only good answers).
  function keep(req, url, upRes, body) {
    // a login the server accepted (any good answer to a call that carried it)
    if (upRes.statusCode >= 200 && upRes.statusCode < 300 && url.pathname.startsWith('/api/')) rememberToken(tokenOf(req));
    const fresh = upRes.headers['x-new-token']; // the server renews logins once a day
    if (fresh) rememberToken(String(fresh));
    if (upRes.statusCode !== 200) return;
    const now = new Date().toISOString();
    const type = String(upRes.headers['content-type'] || '');
    // A PIN login on this PC (switch user / PIN pad): keep that user's real login, so the
    // same PIN works offline (offline-orders.mjs). And the PIN pad's restaurant name.
    if (req.method === 'POST') {
      if (url.pathname === '/api/auth/pin-login' || url.pathname === '/api/auth/terminal-login' || url.pathname === '/api/auth/login') {
        const answer = JSON.parse(body.toString('utf8'));
        rememberToken(String(answer?.token || '')); // the new login is known from now on
        const userId = answer?.user?.id;
        if (userId && url.pathname !== '/api/auth/login') saveApi.run(`login#user=${userId}`, 200, type, body, now);
      } else if (url.pathname === '/api/auth/terminal-check') saveApi.run('terminal-check', 200, type, body, now);
      return;
    }
    if (req.method !== 'GET') return;
    if (url.pathname.startsWith('/api/')) {
      if (OFFLINE_GETS.some((re) => re.test(url.pathname))) saveApi.run(apiKey(req, url.pathname + url.search), 200, type, body, now);
    } else if (!url.pathname.startsWith('/local/')) {
      saveFile.run(url.pathname, type, body, now);
    }
  }

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://local');
    if (url.pathname === '/local/status') return sendJson(res, 200, { online: vpsUp, ...copy.status(), ...sync.status() });
    let body = await readBody(req);
    if (vpsUp) {
      // the Z must count every sale: not while offline actions are still being sent
      if (req.method === 'POST' && url.pathname === '/api/z-reports/close' && offline.waiting() > 0) {
        sync.syncNow();
        return sendJson(res, 409, { error: `${offline.waiting()} action(s) taken offline are still being sent to the server. Wait a moment, then close the day.` });
      }
      const route = routeOrderCall(req, url, body);
      if (route === 'local') return answerOffline(req, res, url, body);
      if (route?.url) req.url = route.url;
      if (route?.body) body = route.body;
      const answered = await forward(req, res, body, (upRes, data) => keep(req, url, upRes, data));
      if (answered) return;
      setVps(false);
    }
    await answerOffline(req, res, url, body);
  });

  // The live connection (WebSocket /ws, used by the POS and dashboards): passed through
  // as it is while online; offline it is refused (the screens retry by themselves).
  httpServer.on('upgrade', (req, socket, head) => {
    if (!vpsUp) return socket.destroy();
    const onConnected = () => {
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const name = req.rawHeaders[i];
        raw += `${name}: ${name.toLowerCase() === 'host' ? target.host : req.rawHeaders[i + 1]}\r\n`;
      }
      up.write(raw + '\r\n');
      if (head?.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    };
    const up = secure
      ? tls.connect({ host: target.hostname, port: targetPort, servername: target.hostname }, onConnected)
      : net.connect(targetPort, target.hostname, onConnected);
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });

  // While offline: is the VPS back? (any HTTP answer means yes)
  setInterval(() => {
    if (vpsUp) return;
    const probe = lib.request({ hostname: target.hostname, port: targetPort, path: '/api/auth/me', method: 'GET', timeout: CONNECT_TIMEOUT }, (r) => {
      r.resume();
      setVps(true);
    });
    probe.on('timeout', () => probe.destroy());
    probe.on('error', () => {});
    probe.end();
  }, PROBE_EVERY);

  httpServer.on('error', (err) => log('Gateway could not start:', String(err?.message || err)));
  // this PC only, or also the restaurant network (POS 2) with "lan": true
  httpServer.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
    log(`Gateway: open the POS at http://localhost:${port}  (status: /local/status)`);
    if (lan) {
      const addresses = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => `http://${a.address}:${port}`);
      log(`Gateway: POS 2 opens ${addresses.join('  or  ') || '(no network address found)'}`);
    }
  });
  return { isOnline: () => vpsUp };
}
