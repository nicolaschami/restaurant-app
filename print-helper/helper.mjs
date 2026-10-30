// print-helper/helper.mjs
//
// RES PRINT HELPER — a small program that runs (hidden) on the restaurant's PC that
// has the printers. It connects to the RES server, tells it which printers this PC
// has, waits for print jobs, and prints them DIRECTLY on the Windows printer:
// no browser, nothing on screen. (Agreed with the user 2026-10-25.)
//
// Needs only Node 22+ (no packages). Settings in config.json (same folder):
//   { "server": "http://127.0.0.1:3000", "key": "rph_…" }
// The key is given by Settings → Printers → "Add helper" (shown once).
// Log: helper.log (same folder).
//
// Run:            node helper.mjs
// Run hidden:     start-hidden.vbs        (and install-startup.ps1 to start with Windows)
//
// RES Local (2026-10-28, offline POS): the helper also keeps a copy of the menu,
// tables, users' PINs and open orders in SQLite (data/res-local.db) — see local-copy.mjs —
// and is the GATEWAY the POS opens on this PC: http://localhost:3901 (gateway.mjs).
// Optional in config.json: "localPort": 3901, and "lan": true so POS 2 can open the POS
// through this PC (http://<this PC's address>:3901) — needs a Windows Firewall rule:
//   netsh advfirewall firewall add rule name="RES Local (POS 2)" dir=in action=allow protocol=TCP localport=3901 profile=private
//
// As ONE PROGRAM (2026-10-30): build/build-exe.mjs packs Node + these files into
// RES-Local.exe, and installer/RES-Local.iss makes RES-Local-Setup.exe around it. Then
// config.json, helper.log, raw-print.ps1 and data/ are next to RES-Local.exe.

import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSea } from 'node:sea';
import { startLocalCopy } from './local-copy.mjs';
import { startGateway } from './gateway.mjs';

// The folder of this program: next to RES-Local.exe (one program), or next to this file
// (node helper.mjs, during development).
const HERE = isSea() ? dirname(process.execPath) : dirname(fileURLToPath(import.meta.url));
const VERSION = '1.2.0';

function log(...parts) {
  const line = `${new Date().toISOString()}  ${parts.join(' ')}`;
  console.log(line);
  try {
    appendFileSync(join(HERE, 'helper.log'), line + '\n');
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- settings
let config;
try {
  config = JSON.parse(readFileSync(join(HERE, 'config.json'), 'utf8'));
} catch {
  log('ERROR config.json missing or invalid. Copy config.example.json to config.json and paste your helper key.');
  process.exit(1);
}
if (!config.key || !String(config.key).startsWith('rph_')) {
  log('ERROR config.json: "key" is missing. Get it from Settings → Printers → Add helper.');
  process.exit(1);
}
const wsUrl = `${String(config.server || 'http://127.0.0.1:3000').replace(/^http/, 'ws').replace(/\/$/, '')}/agent?key=${encodeURIComponent(config.key)}`;

// ---------------------------------------------------------------- Windows helpers
function powershell(args) {
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], { windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    p.on('error', (e) => resolve({ code: -1, out: '', err: String(e) }));
  });
}

// The printers installed on this PC.
async function listPrinters() {
  const r = await powershell(['-Command', 'Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress']);
  try {
    const v = JSON.parse(r.out || '[]');
    return Array.isArray(v) ? v : [v];
  } catch {
    return [];
  }
}

// Print raw bytes (ESC/POS) on a printer.
async function printRaw(printer, base64) {
  const dir = mkdtempSync(join(tmpdir(), 'res-print-'));
  const file = join(dir, 'job.bin');
  try {
    writeFileSync(file, Buffer.from(base64, 'base64'));
    const r = await powershell(['-File', join(HERE, 'raw-print.ps1'), '-Printer', printer, '-File', file]);
    return r.code === 0 ? { ok: true } : { ok: false, error: r.err || `Print failed (code ${r.code}).` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- connection
// The helper must NEVER stop: a server that restarts or is unreachable only means
// "try again in a few seconds" (1 s, 2 s, 4 s … max 30 s). Any unexpected error is
// logged and the helper keeps running.
let retry = 1000;
let reconnectTimer = null;
function scheduleReconnect() {
  if (reconnectTimer) return; // already planned
  log(`Disconnected. Retrying in ${Math.round(retry / 1000)} s…`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, retry);
  retry = Math.min(retry * 2, 30_000);
}

function connect() {
  log('Connecting to', wsUrl.replace(/key=[^&]+/, 'key=...'));
  let ws;
  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    log('Could not connect:', String(err?.message || err));
    return scheduleReconnect();
  }
  let ping;
  let opened = false;
  let ended = false; // this attempt asks for ONE retry only (watchdog or close)
  const endAttempt = () => {
    if (ended) return;
    ended = true;
    scheduleReconnect();
  };
  // Watchdog: a connection attempt that has not opened after 10 s is abandoned and
  // retried (when the server is unreachable, Node may otherwise wait silently).
  const watchdog = setTimeout(() => {
    if (opened) return;
    log('No answer from the server.');
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    endAttempt();
  }, 10_000);

  ws.addEventListener('open', async () => {
    opened = true;
    clearTimeout(watchdog);
    try {
      retry = 1000;
      const printers = await listPrinters();
      ws.send(JSON.stringify({ type: 'hello', printers, version: VERSION }));
      log('Connected. Printers on this PC:', printers.join(' | ') || '(none)');
      ping = setInterval(() => {
        try {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          /* the close event follows */
        }
      }, 25_000);
    } catch (err) {
      log('Error after connecting:', String(err?.message || err));
    }
  });

  ws.addEventListener('message', async (ev) => {
    let msg;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (msg.type === 'print') {
      let res;
      try {
        res = await printRaw(String(msg.printer), String(msg.data || ''));
      } catch (err) {
        res = { ok: false, error: String(err?.message || err) };
      }
      log(res.ok ? 'Printed on' : 'FAILED on', msg.printer, res.ok ? '' : `- ${res.error}`);
      try {
        ws.send(JSON.stringify({ type: 'result', jobId: msg.jobId, ...res }));
      } catch {
        /* connection lost: the server will report "did not answer" */
      }
    } else if (msg.type === 'welcome') {
      log('Server knows this helper as:', msg.name);
    }
  });

  ws.addEventListener('close', (ev) => {
    clearInterval(ping);
    clearTimeout(watchdog);
    if (ev.code === 1008 || ev.code === 4001) log('Refused by the server (wrong key?).');
    endAttempt();
  });
  ws.addEventListener('error', () => {
    /* the close event follows */
  });
}

// Last safety net: log any unexpected error and keep running (and reconnecting).
process.on('uncaughtException', (err) => {
  log('Unexpected error (helper keeps running):', String(err?.stack || err));
  scheduleReconnect();
});
process.on('unhandledRejection', (err) => {
  log('Unexpected error (helper keeps running):', String(err?.stack || err));
});

// Keep the program running at all times (without this, Node can end quietly while
// the server is unreachable, because nothing else is waiting).
setInterval(() => {}, 60_000);

log(`RES Print Helper ${VERSION} starting`);
connect();

// RES Local: the offline copy + the gateway the POS opens (http://localhost:3901).
// If it fails to start, printing still works.
// Offline printing uses the same printRaw as the server's jobs. FOR TESTS ONLY:
// "testPrintFolder" in config.json saves each paper as a .bin file there instead of
// printing (never set in a restaurant).
const offlinePrint = config.testPrintFolder
  ? async (printer, base64) => {
      const dir = String(config.testPrintFolder);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${Date.now()}-${String(printer).replace(/[^\w.-]+/g, '_')}.bin`), Buffer.from(base64, 'base64'));
      return { ok: true };
    }
  : printRaw;
try {
  const copy = startLocalCopy({ server: config.server, key: config.key, log, folder: join(HERE, 'data') });
  startGateway({ server: config.server, key: config.key, port: Number(config.localPort) || 3901, lan: config.lan === true, log, copy, print: offlinePrint });
} catch (err) {
  log('RES Local could not start (printing still works):', String(err?.stack || err));
}
