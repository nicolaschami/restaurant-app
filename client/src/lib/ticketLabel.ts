// client/src/lib/ticketLabel.ts
//
// How a ticket number is shown (offline POS, 2026-10-29):
//   - a normal order (saved on the server):  #214
//   - an order taken WITHOUT internet on RES Local: OFF-0007. RES Local numbers them
//     1 000 000 000 + n, so they can never be confused with a server number; the real
//     number is given when the order reaches the server.

const OFFLINE_BASE = 1_000_000_000;

export const isOfflineTicket = (no: number | null | undefined) => Number(no) >= OFFLINE_BASE;

export function ticketLabel(no: number | null | undefined): string {
  if (no == null || Number.isNaN(Number(no))) return '#';
  return isOfflineTicket(no) ? `OFF-${String(Number(no) - OFFLINE_BASE).padStart(4, '0')}` : `#${no}`;
}
