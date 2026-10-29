// print-helper/local-copy.mjs
//
// RES LOCAL — offline POS, step 1 (agreed with the user 2026-10-28).
// The print helper also keeps a COPY of what the POS needs, in a SQLite file on this PC,
// so the restaurant keeps selling when the internet is down (sometimes for hours).
//   - SQLite is built into Node 22 (node:sqlite): nothing to install.
//   - The file is created by itself: data/res-local.db (next to this file).
//   - Every minute (and at start) it asks the server "anything new since version X?"
//     (GET /api/local/snapshot with the helper key). Same version → the server answers
//     304 and nothing is downloaded. New version → the copy is replaced in ONE
//     transaction (never half old / half new).
//   - The VPS stays the boss: this copy is only read when the server can't be reached.
//   - Offline login is PIN ONLY: the copy has the users' PIN hashes, never passwords.
// Its status (shown by the gateway, gateway.mjs): http://127.0.0.1:3901/local/status
//
// Tables (version 1):
//   meta (key, value)            version, saved_at, restaurant_id, restaurant_name, last_contact…
//   copy (kind, id, data)        one row per copied record, data = the record as JSON
//                                kinds: restaurant, categories, menuItems, modifierGroups,
//                                modifierOptions, menuItemModifiers, tables, kitchenStations,
//                                users, openOrders, openOrderItems
// Tables (version 2, used by the gateway): files, api_cache — see UPGRADES below.
// Tables (version 3, offline orders): local_orders, offline_ops — see UPGRADES below.
// Tables (version 4, sync): id_map — see UPGRADES below.
// Tables (version 5, POS 2 / safety): known_tokens — see UPGRADES below.
// Upgrades: the file's PRAGMA user_version says which version it is; a newer helper
// runs the missing upgrade steps by itself at start (nobody runs a script by hand).

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const REFRESH_EVERY = 60_000; // 1 minute
const KINDS = [
  'restaurant', 'categories', 'menuItems', 'modifierGroups', 'modifierOptions', 'menuItemModifiers',
  'tables', 'kitchenStations', 'users', 'openOrders', 'openOrderItems',
];

// ---------------------------------------------------------------- the SQLite file
// Each step brings the file from version i to i + 1. Add new steps at the END only.
const UPGRADES = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
   CREATE TABLE IF NOT EXISTS copy (
     kind TEXT NOT NULL,
     id   TEXT NOT NULL,
     data TEXT NOT NULL,          -- the record, as JSON
     PRIMARY KEY (kind, id)
   );`,
  // v2 (gateway): the screens and the POS answers seen while online, to serve them offline
  `CREATE TABLE IF NOT EXISTS files (
     path         TEXT PRIMARY KEY,   -- /index.html, /assets/index-abc123.js …
     content_type TEXT,
     body         BLOB NOT NULL,
     saved_at     TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS api_cache (
     key          TEXT PRIMARY KEY,   -- GET path + query (+ user for /api/auth/me)
     status       INTEGER NOT NULL,
     content_type TEXT,
     body         BLOB NOT NULL,
     saved_at     TEXT NOT NULL
   );`,
  // v3 (offline orders, offline-orders.mjs): the orders kept on this PC, and every POS
  // action written down to be replayed to the VPS when the internet is back
  `CREATE TABLE IF NOT EXISTS local_orders (
     id         INTEGER PRIMARY KEY,  -- 1000000001… for OFF orders, or the VPS id of an order changed offline
     off_no     INTEGER,              -- OFF-0001 → 1 (NULL for a VPS order)
     data       TEXT NOT NULL,        -- the order as the POS reads it (GET /orders/:id), JSON
     status     TEXT NOT NULL,        -- open | closed | deleted
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS offline_ops (
     seq        INTEGER PRIMARY KEY AUTOINCREMENT,  -- replay order
     op_id      TEXT NOT NULL UNIQUE,               -- unique id: sent twice = saved once
     created_at TEXT NOT NULL,
     method     TEXT NOT NULL,
     path       TEXT NOT NULL,
     body       TEXT,                               -- exactly what the POS sent
     order_id   INTEGER,
     user_id    TEXT,
     status     TEXT NOT NULL DEFAULT 'waiting',    -- waiting | sent | failed
     result     TEXT,
     error      TEXT
   );`,
  // v4 (sync, sync.mjs): OFF-0001 = the real order it became on the server
  `CREATE TABLE IF NOT EXISTS id_map (
     local_id   INTEGER PRIMARY KEY,  -- 1000000001
     server_id  INTEGER NOT NULL,     -- the real order id on the server
     ticket_no  INTEGER,              -- its real ticket number (#1042)
     synced_at  TEXT NOT NULL
   );`,
  // v5 (POS 2 over the LAN, gateway.mjs): the logins the server ACCEPTED through this
  // gateway (sha256 of the token, never the token itself). Offline, RES Local answers
  // only these — not a guest on the restaurant Wi-Fi.
  `CREATE TABLE IF NOT EXISTS known_tokens (
     hash     TEXT PRIMARY KEY,
     user_id  TEXT,
     exp      INTEGER,               -- the login's expiry (seconds), 0 = none
     seen_at  TEXT NOT NULL
   );`,
];

function openDb(folder) {
  mkdirSync(folder, { recursive: true });
  const db = new DatabaseSync(join(folder, 'res-local.db'));
  db.exec('PRAGMA journal_mode = WAL;'); // safe if the PC is switched off during a write
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < UPGRADES.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(UPGRADES[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return db;
}

// ---------------------------------------------------------------- RES Local
export function startLocalCopy({ server, key, log, folder }) {
  const db = openDb(folder);
  const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?');
  const setMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value');
  const meta = (k) => getMeta.get(k)?.value ?? null;
  const insertRow = db.prepare('INSERT INTO copy (kind, id, data) VALUES (?, ?, ?)');
  const base = String(server || 'http://127.0.0.1:3000').replace(/\/$/, '');

  let serverReachable = false;
  let lastError = null;

  // Replace the whole copy at once (one transaction).
  function saveSnapshot(snap) {
    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM copy');
      for (const kind of KINDS) {
        const value = snap.data[kind];
        const list = Array.isArray(value) ? value : value ? [value] : [];
        list.forEach((row, i) => {
          // menu_item_modifiers has no id of its own: item + group is its key
          const id = row.id ?? (row.menu_item_id != null ? `${row.menu_item_id}-${row.modifier_group_id}` : String(i));
          insertRow.run(kind, String(id), JSON.stringify(row));
        });
      }
      setMeta.run('version', snap.version);
      setMeta.run('saved_at', new Date().toISOString());
      setMeta.run('restaurant_id', String(snap.data.restaurant?.id ?? ''));
      setMeta.run('restaurant_name', String(snap.data.restaurant?.name ?? ''));
      // the highest OFF number the server already has (the counter continues after it)
      setMeta.run('server_last_off', String(Number(snap.data.lastOfflineNo) || 0));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  async function refresh() {
    try {
      const res = await fetch(`${base}/api/local/snapshot`, {
        headers: { 'x-helper-key': key, ...(meta('version') ? { 'if-none-match': meta('version') } : {}) },
        signal: AbortSignal.timeout(15_000),
      });
      serverReachable = true;
      setMeta.run('last_contact', new Date().toISOString());
      if (res.status === 304) return; // the copy is up to date
      if (!res.ok) {
        lastError = `Server answered ${res.status}`;
        log('Local copy: server answered', res.status);
        return;
      }
      const snap = await res.json();
      saveSnapshot(snap);
      lastError = null;
      log(`Local copy saved: version ${snap.version} · ${snap.data.menuItems?.length ?? 0} menu items · ${snap.data.users?.length ?? 0} users with PIN · ${snap.data.openOrders?.length ?? 0} open orders`);
    } catch (err) {
      // no internet / server down: keep the copy we have, try again next minute
      if (serverReachable) log('Local copy: server not reachable, keeping the saved copy.');
      serverReachable = false;
      lastError = String(err?.message || err);
      // no copy at all yet (first start): try again sooner, every 10 s
      if (!meta('version')) setTimeout(refresh, 10_000);
    }
  }

  // Counts per kind, for the status page.
  function counts() {
    const out = {};
    for (const r of db.prepare('SELECT kind, COUNT(*) AS n FROM copy GROUP BY kind').all()) out[r.kind] = r.n;
    return out;
  }

  // What /local/status shows (the gateway adds whether the VPS answers right now).
  function status() {
    return {
      copyVersion: meta('version'),
      savedAt: meta('saved_at'),
      lastContact: meta('last_contact'),
      restaurant: { id: Number(meta('restaurant_id')) || null, name: meta('restaurant_name') },
      counts: counts(),
      lastError,
    };
  }

  const saved = meta('saved_at');
  log(saved ? `Local copy found (version ${meta('version')}, saved ${saved}).` : 'Local copy: none yet, downloading…');
  refresh();
  setInterval(refresh, REFRESH_EVERY);
  return { refresh, db, status, serverReachable: () => serverReachable };
}
