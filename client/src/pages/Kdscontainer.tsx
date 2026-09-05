import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import KitchenDisplayScreen, { type KDSTicket } from './KitchenDisplayScreen';

// TODO: pull this from auth/session context once available, same as the
// hardcoded restaurantId used elsewhere in the app (Dashboard, POS).
const RESTAURANT_ID = 1;

export default function KDSContainer() {
  const [tickets, setTickets] = useState<KDSTicket[]>([]);
  const [stations, setStations] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchActiveTickets = useCallback(async () => {
    try {
      const res = await api.get('/kds/active', { params: { restaurantId: RESTAURANT_ID } });
      setTickets(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to fetch KDS tickets:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Real kitchen stations from the DB, so the filter buttons and the "By
  // Station" lanes reflect whatever stations actually exist for this
  // restaurant — instead of a hardcoded GRILL/FRYER/SALAD/ASSEMBLY list
  // that silently drifts out of sync if stations are renamed or added.
  const fetchStations = useCallback(async () => {
    try {
      const res = await api.get('/kitchenStation', { params: { restaurantId: RESTAURANT_ID } });
      const raw = Array.isArray(res.data)
        ? res.data
        : res.data?.stations || res.data?.kitchenStations || [];

      const names: string[] = raw
        .map((s: any) => (typeof s === 'string' ? s : s?.name))
        .filter(Boolean)
        .map((n: string) => n.toUpperCase());

      // De-dupe in case the API ever returns the same station twice.
      setStations(Array.from(new Set(names)));
    } catch (err) {
      console.error('Failed to fetch kitchen stations:', err);
      // Leave stations empty on failure — KitchenDisplayScreen falls back
      // to its own built-in default list rather than showing nothing.
    }
  }, []);

  // Initial load + a slow fallback poll for tickets, same pattern as
  // Dashboard.tsx — the websocket below does the real-time work, this
  // just guards against a dropped connection silently going stale.
  useEffect(() => {
    fetchActiveTickets();
    const poll = setInterval(fetchActiveTickets, 60000);
    return () => clearInterval(poll);
  }, [fetchActiveTickets]);

  // Stations rarely change during a shift, so this only needs to run once
  // on mount — no polling needed here.
  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  // Live updates: same websocket room the dashboard subscribes to. Any
  // ORDER_UPDATED broadcast (new order fired, item toggled, order bumped)
  // triggers a fresh ticket fetch so every open KDS screen stays in sync.
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let unmounted = false;

    const connect = () => {
      const httpBase: string = (api.defaults?.baseURL as string) || window.location.origin;
      const wsBase = httpBase.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
      socket = new WebSocket(`${wsBase}/ws?restaurantId=${RESTAURANT_ID}`);

      socket.onmessage = (event) => {
        try {
          const { event: eventName } = JSON.parse(event.data);
          if (eventName === 'ORDER_UPDATED' || eventName === 'ORDER_STATUS_UPDATED') {
            fetchActiveTickets();
          }
        } catch (err) {
          console.error('Failed to parse KDS websocket message:', err);
        }
      };

      socket.onclose = () => {
        if (unmounted) return;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [fetchActiveTickets]);

  // "Bump Ticket" — the only KDSTicket['status'] this component currently
  // fires is 'READY', so anything else is ignored on purpose.
  const handleUpdateTicketStatus = useCallback(
    async (ticketId: string, newStatus: KDSTicket['status']) => {
      if (newStatus !== 'READY') return;
      try {
        await api.patch(`/kds/orders/${ticketId}/bump`);
        // No manual state update needed — KitchenDisplayScreen already
        // removed it locally, and the server's broadcast will keep every
        // other open screen (including this one, on the next message) synced.
      } catch (err) {
        console.error('Failed to bump ticket:', err);
        // The local optimistic removal in KitchenDisplayScreen doesn't know
        // the request failed — re-fetch to bring the ticket back if it did.
        fetchActiveTickets();
      }
    },
    [fetchActiveTickets]
  );

  // Individual item taps — persisted so a refresh or another screen doesn't
  // lose the checkmark.
  const handleCompleteItem = useCallback(
    async (_ticketId: string, itemId: string, completed: boolean) => {
      try {
        await api.patch(`/kds/items/${itemId}/toggle`, { completed });
      } catch (err) {
        console.error('Failed to toggle item completion:', err);
        fetchActiveTickets();
      }
    },
    [fetchActiveTickets]
  );

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F1F5F3',
          color: '#64748B',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
        }}
      >
        Loading kitchen board…
      </div>
    );
  }

  return (
    <KitchenDisplayScreen
      initialTickets={tickets}
      stations={stations}
      onUpdateTicketStatus={handleUpdateTicketStatus}
      onCompleteItem={handleCompleteItem}
    />
  );
}
