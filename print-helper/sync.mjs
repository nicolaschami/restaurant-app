// print-helper/sync.mjs
//
// RES LOCAL — offline POS, step 4: SYNC (agreed with the user 2026-10-29).
// When the internet is back, the actions taken offline (table offline_ops, written by
// offline-orders.mjs) are sent to the server ONE BY ONE, IN ORDER:
//   POST <server>/api/local/replay   { opId, method, path, body, userId, at, offlineNo }
// The server runs each one through its normal route (real rules: kitchen lines, totals,
// tables, stock, journal) and remembers its opId: an action sent twice is done once.
//
//   - Real numbers: when "create OFF-0001" is done the server answers with the real order
//     (#1042). RES Local writes OFF-0001 = #1042 in id_map and sends the next actions of
//     that order ("add dessert", "pay") to #1042.
//   - The server refuses an action (4xx, e.g. "already paid"): it is marked FAILED with
//     the reason, the other actions of THAT order are not sent (they depend on it), the
//     other orders continue. A manager decides what to do.
//   - No internet / server error (5xx) in the middle: stop, try again later — nothing is
//     lost and nothing is done twice (the server remembers the opIds already done).
//   - When every action of an order is sent, its local copy is removed: the server's
//     order is the truth again.
// It runs when the gateway sees the server again, and every 15 s while actions wait.

import { LOCAL_BASE } from './offline-orders.mjs';

const EVERY = 15_000;

export function startSync({ db, server, key, log, isOnline }) {
  const base = String(server || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const nextOp = db.prepare("SELECT * FROM offline_ops WHERE status = 'waiting' ORDER BY seq LIMIT 1");
  const setOp = db.prepare('UPDATE offline_ops SET status = ?, result = ?, error = ? WHERE seq = ?');
  const failOrder = db.prepare("UPDATE offline_ops SET status = 'failed', error = ? WHERE order_id = ? AND status = 'waiting'");
  const getMap = db.prepare('SELECT server_id FROM id_map WHERE local_id = ?');
  const addMap = db.prepare('INSERT INTO id_map (local_id, server_id, ticket_no, synced_at) VALUES (?, ?, ?, ?) ON CONFLICT (local_id) DO NOTHING');
  const offNo = db.prepare('SELECT off_no FROM local_orders WHERE id = ?');
  const opsLeft = db.prepare("SELECT COUNT(*) AS n FROM offline_ops WHERE order_id = ? AND status <> 'sent'");
  const dropLocal = db.prepare('DELETE FROM local_orders WHERE id = ?');
  const dropCache = db.prepare('DELETE FROM api_cache WHERE key = ?');
  const counts = db.prepare('SELECT status, COUNT(*) AS n FROM offline_ops GROUP BY status');

  let running = false;
  let lastSyncAt = null;
  let lastError = null;

  // /api/orders/1000000001/pay → /api/orders/1042/pay (null: its order was never created)
  function realPath(path) {
    const m = path.match(/^\/api\/orders\/(\d+)(\/pay)?$/);
    if (!m || Number(m[1]) < LOCAL_BASE) return path;
    const map = getMap.get(Number(m[1]));
    return map ? `/api/orders/${map.server_id}${m[2] || ''}` : null;
  }

  // The order is fully on the server: forget the local copy.
  function finishOrder(orderId, serverId) {
    if (opsLeft.get(orderId).n > 0) return;
    dropLocal.run(orderId);
    dropCache.run(`/api/orders/${serverId ?? orderId}`);
  }

  async function syncNow() {
    if (running || !isOnline()) return;
    running = true;
    let sent = 0;
    try {
      for (let op = nextOp.get(); op; op = nextOp.get()) {
        const path = realPath(op.path);
        if (!path) {
          failOrder.run('Its order could not be created on the server.', op.order_id);
          continue;
        }
        const offline = op.order_id >= LOCAL_BASE && op.method === 'POST' && op.path === '/api/orders';
        const no = offline ? offNo.get(op.order_id)?.off_no : null;
        let answer;
        try {
          const res = await fetch(`${base}/api/local/replay`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-helper-key': key },
            body: JSON.stringify({
              opId: op.op_id, method: op.method, path, body: op.body ? JSON.parse(op.body) : {},
              userId: op.user_id ? Number(op.user_id) : null, at: op.created_at,
              offlineNo: no ? `OFF-${String(no).padStart(4, '0')}` : null,
            }),
            signal: AbortSignal.timeout(30_000),
          });
          if (res.status >= 500 || res.status === 401) throw new Error(`server answered ${res.status}`);
          answer = await res.json();
          if (res.status >= 400) answer = { status: res.status, result: answer };
        } catch (err) {
          // no internet / server problem: stop here, try again later (nothing is lost)
          lastError = String(err?.message || err);
          log('Sync paused:', lastError);
          return;
        }
        if (answer.status >= 500) {
          lastError = `server error ${answer.status}`;
          log('Sync paused: the server could not do an action, trying again later.');
          return;
        }
        if (answer.status < 300) {
          setOp.run('sent', JSON.stringify(answer.result ?? null), null, op.seq);
          sent++;
          let serverId = Number(path.match(/^\/api\/orders\/(\d+)/)?.[1]) || null;
          if (offline && answer.result?.order?.id) {
            serverId = answer.result.order.id;
            addMap.run(op.order_id, serverId, answer.result.order.ticketNo ?? null, new Date().toISOString());
            log(`Sync: OFF-${String(no).padStart(4, '0')} is now order #${answer.result.order.ticketNo}.`);
          }
          finishOrder(op.order_id, serverId);
        } else {
          // refused by the server: this action and the next ones of the same order fail
          const reason = answer.result?.error || `refused (${answer.status})`;
          setOp.run('failed', JSON.stringify(answer.result ?? null), reason, op.seq);
          failOrder.run(`An earlier action of this order failed: ${reason}`, op.order_id);
          log(`Sync: action ${op.method} ${op.path} REFUSED by the server: ${reason}`);
        }
      }
      if (sent) log(`Sync done: ${sent} action(s) sent, nothing waiting.`);
      lastSyncAt = new Date().toISOString();
      lastError = null;
    } finally {
      running = false;
    }
  }

  setInterval(() => syncNow().catch((err) => log('Sync error:', String(err?.stack || err))), EVERY);

  function status() {
    const out = { waiting: 0, sent: 0, failed: 0 };
    for (const r of counts.all()) out[r.status] = r.n;
    return { ...out, syncing: running, lastSyncAt, lastSyncError: lastError };
  }
  return { syncNow: () => syncNow().catch((err) => log('Sync error:', String(err?.stack || err))), status };
}
