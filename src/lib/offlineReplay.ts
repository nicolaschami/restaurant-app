// src/lib/offlineReplay.ts
//
// Offline POS sync (step 4, 2026-10-29): /api/local/replay (routes/localCopy.ts) runs
// each action taken offline through the NORMAL route (create order, change, pay). Those
// routes must then skip what already happened offline — the kitchen tickets were printed
// by RES Local. The replay marks its inner request with a secret made at server start,
// so a normal POS request can never pretend to be a replay.

import { randomBytes } from 'crypto';
import type { FastifyRequest } from 'fastify';

export const REPLAY_SECRET = randomBytes(24).toString('hex');

export const isOfflineReplay = (request: FastifyRequest) => request.headers['x-offline-replay'] === REPLAY_SECRET;
