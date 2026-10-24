// src/lib/printAgents.ts
//
// The print helpers that are CONNECTED right now (one live WebSocket each), and how a
// print job is sent to one of them and its answer awaited.
//
// Messages (JSON):
//   helper → server  { type: 'hello', printers: string[], version }  after connecting
//   server → helper  { type: 'print', jobId, printer, data }         data = base64 ESC/POS
//   helper → server  { type: 'result', jobId, ok, error? }           after printing
//   both             { type: 'ping' } / { type: 'pong' }             keep-alive

import { WebSocket } from 'ws';

interface Agent {
  agentId: number;
  restaurantId: number;
  name: string;
  socket: WebSocket;
  printers: string[];
}

const agents = new Map<number, Agent>(); // agentId → connected helper
const waiting = new Map<string, { resolve: (r: { ok: boolean; error?: string }) => void; timer: NodeJS.Timeout }>();

export function addAgent(a: Agent) {
  // a helper that reconnects replaces its old connection
  const old = agents.get(a.agentId);
  if (old && old.socket !== a.socket) {
    try {
      old.socket.close();
    } catch {
      /* ignore */
    }
  }
  agents.set(a.agentId, a);
}

export function removeAgent(agentId: number, socket: WebSocket) {
  if (agents.get(agentId)?.socket === socket) agents.delete(agentId);
}

export function setAgentPrinters(agentId: number, printers: string[]) {
  const a = agents.get(agentId);
  if (a) a.printers = printers;
}

export function isOnline(agentId: number) {
  return agents.has(agentId);
}

export function onlineAgents(restaurantId: number): Agent[] {
  return [...agents.values()].filter((a) => a.restaurantId === restaurantId);
}

// A helper answered a job.
export function jobResult(jobId: string, ok: boolean, error?: string) {
  const w = waiting.get(jobId);
  if (!w) return;
  clearTimeout(w.timer);
  waiting.delete(jobId);
  w.resolve({ ok, error });
}

// Send a print job to the restaurant's helper that has this printer (else the first
// online one) and wait for its answer (max 10 s).
export function sendPrintJob(
  restaurantId: number,
  printer: string,
  dataBase64: string
): Promise<{ ok: boolean; error?: string; agent?: string }> {
  const list = onlineAgents(restaurantId);
  if (!list.length) {
    return Promise.resolve({ ok: false, error: 'The print helper is offline. Check that it runs on the cashier PC.' });
  }
  const agent = list.find((a) => a.printers.includes(printer)) ?? list[0];
  const jobId = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(jobId);
      resolve({ ok: false, error: 'The print helper did not answer in time.', agent: agent.name });
    }, 10_000);
    waiting.set(jobId, { resolve: (r) => resolve({ ...r, agent: agent.name }), timer });
    try {
      agent.socket.send(JSON.stringify({ type: 'print', jobId, printer, data: dataBase64 }));
    } catch (err: any) {
      clearTimeout(timer);
      waiting.delete(jobId);
      resolve({ ok: false, error: 'Could not reach the print helper.', agent: agent.name });
    }
  });
}
