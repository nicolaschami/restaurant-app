// client/src/components/ChatOrdersInbox.tsx
//
// Chat orders (v2, step 3 — 2026-11-01): the box that RINGS on the staff screens when a
// customer confirms an order in the chat page. Accept → a normal RES order (ticket,
// kitchen, KDS); Reject → a reason the customer sees in the chat.
// Shown on every staff screen (dashboard, POS, settings…), floating at the top right;
// it can be made small, and the sound repeats until every chat order is answered.

import { useEffect, useRef, useState } from 'react';
import { api, wsUrl } from '../api';
import { toast } from './Toaster';
import { Check, X, MessageCircle, ChevronDown, ChevronUp, Volume2, VolumeX, Loader2 } from 'lucide-react';

interface ChatLine {
  itemId: number;
  name: string;
  qty: number;
  size: string | null;
  options: { id: number; name: string; price: number }[];
  note: string | null;
  lineTotal: number;
}
interface ChatOrder {
  id: number;
  ref: string;
  kind: 'order' | 'booking';
  booking: { date: string; time: string; people: number; note: string | null } | null;
  orderType: 'delivery' | 'pickup' | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  knownCustomer: boolean;
  previousOrders: number;
  lines: ChatLine[];
  total: number;
  waitingSeconds: number;
}

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;
const niceDate = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// "ding-dong" made by the browser itself (no sound file to download)
function ring() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    [880, 660].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.28);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + i * 0.28 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.28 + 0.26);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.28);
      o.stop(ctx.currentTime + i * 0.28 + 0.3);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    /* no sound on this PC: the box still shows */
  }
}

export default function ChatOrdersInbox() {
  const [orders, setOrders] = useState<ChatOrder[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [small, setSmall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [conversation, setConversation] = useState<{ role: string; text: string }[] | null>(null);
  const [, setTick] = useState(0);
  const loadedAt = useRef(Date.now());

  const load = async () => {
    try {
      const r = await api.get('/chat-orders/pending');
      setOrders(r.data.orders ?? []);
      setReasons(r.data.rejectReasons ?? []);
      loadedAt.current = Date.now();
    } catch {
      /* the chat orders table may not exist yet on this server: stay hidden */
    }
  };

  // live: a new chat order (or answered on another screen) → reload; and every 15 s
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    const connect = () => {
      socket = new WebSocket(wsUrl(`/ws?token=${encodeURIComponent(localStorage.getItem('token') || '')}`));
      socket.onmessage = (e) => {
        try {
          if (JSON.parse(e.data)?.event === 'CHAT_ORDERS_UPDATED') loadRef.current();
        } catch {
          /* ignore */
        }
      };
      socket.onclose = () => {
        if (!closed) retry = setTimeout(connect, 5000);
      };
    };
    connect();
    loadRef.current();
    const poll = setInterval(() => loadRef.current(), 15_000);
    const tick = setInterval(() => setTick((t) => t + 1), 1000); // the "waiting 0:42" timer
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      clearInterval(poll);
      clearInterval(tick);
      socket?.close();
    };
  }, []);

  // the ring: now, then every 6 s while something waits
  const count = orders.length;
  useEffect(() => {
    if (!count || muted) return;
    ring();
    const t = setInterval(ring, 6000);
    return () => clearInterval(t);
  }, [count, muted]);
  useEffect(() => {
    if (count) setSmall(false); // a new one opens the box again
  }, [count]);

  if (!count) return null;
  const current = orders.find((o) => o.id === selected) ?? orders[0];
  const waited = current.waitingSeconds + (Date.now() - loadedAt.current) / 1000;

  const accept = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/chat-orders/${current.id}/accept`);
      if (r.data.kind === 'booking') {
        toast.success(`Table booked · ${r.data.table}`, `${current.customerName} · ${niceDate(current.booking!.date)} ${current.booking!.time} · ${current.booking!.people} people`);
      } else {
        toast.success(`Chat order accepted · #${r.data.ticketNo}`, `${current.customerName} · ${money(current.total)}`);
      }
      (r.data.kitchen ?? []).filter((k: any) => !k.ok).forEach((k: any) => toast.error('Kitchen ticket not printed', k.error));
      setConversation(null);
      await load();
    } catch (e: any) {
      toast.error('Could not accept', e?.response?.data?.error || e.message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const reject = async (reason: string) => {
    setBusy(true);
    try {
      await api.post(`/chat-orders/${current.id}/reject`, { reason });
      toast.success('Chat order rejected', `${current.ref} · the customer sees: "${reason}"`);
      setRejecting(false);
      setConversation(null);
      await load();
    } catch (e: any) {
      toast.error('Could not reject', e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const openChat = async () => {
    if (conversation) return setConversation(null);
    try {
      const r = await api.get(`/chat-orders/${current.id}`);
      setConversation(r.data.conversation ?? []);
    } catch {
      toast.error('Could not open the chat');
    }
  };

  // small: a gold pill (the ring goes on)
  if (small) {
    return (
      <button
        onClick={() => setSmall(false)}
        className="fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-lg"
        style={{ background: '#c9a24b', color: '#131c18' }}
      >
        <MessageCircle className="h-4 w-4" /> {count} chat order{count > 1 ? 's' : ''} waiting <ChevronDown className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      className="fixed right-4 top-4 z-[70] w-[440px] max-w-[calc(100vw-2rem)] rounded-2xl p-3 text-[13px] shadow-2xl"
      style={{ background: '#fffaf0', border: '2px solid #c9a24b', color: '#2a2a22', boxShadow: '0 0 0 5px rgba(201,162,75,.2), 0 18px 40px rgba(0,0,0,.25)' }}
    >
      {/* head */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 animate-bounce items-center justify-center rounded-xl text-lg" style={{ background: '#c9a24b' }}>
          💬
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold">
            {current.kind === 'booking'
              ? `New table booking · ${current.ref} · 📅`
              : `New chat order · ${current.ref} · ${current.orderType === 'delivery' ? '🛵 Delivery' : '🥡 Pickup'}`}
          </div>
          <div className="text-xs font-semibold" style={{ color: waited > 300 ? '#b5533c' : '#7d7563' }}>
            waiting {clock(waited)}
          </div>
        </div>
        <button onClick={() => setMuted((m) => !m)} title={muted ? 'Sound on' : 'Sound off'} className="rounded-lg p-1.5 hover:bg-black/5">
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button onClick={() => setSmall(true)} title="Make small" className="rounded-lg p-1.5 hover:bg-black/5">
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>

      {/* other waiting chat orders */}
      {count > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {orders.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                setSelected(o.id);
                setRejecting(false);
                setConversation(null);
              }}
              className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={o.id === current.id ? { background: '#c9a24b', color: '#131c18' } : { border: '1px solid #e2d6bb', color: '#7d7563' }}
            >
              {o.ref} · {o.customerName}
            </button>
          ))}
        </div>
      )}

      {/* a table booking: when, how many */}
      {current.kind === 'booking' && current.booking && (
        <div className="mt-2 rounded-xl px-3 py-2 text-[14px]" style={{ border: '1px dashed #c9a24b' }}>
          <div className="font-bold">
            📅 {niceDate(current.booking.date)} · 🕘 {current.booking.time} · 👥 {current.booking.people} people
          </div>
          {current.booking.note && <div className="text-xs" style={{ color: '#7d7563' }}>📝 {current.booking.note}</div>}
          <div className="text-xs" style={{ color: '#7d7563' }}>Accept → booked in Reservations on the best free table</div>
        </div>
      )}

      {/* the order */}
      {current.kind !== 'booking' && <>
      <div className="mt-2 max-h-[34vh] overflow-y-auto">
        {current.lines.map((l, i) => (
          <div key={i} className="flex gap-2 border-b border-dashed py-1" style={{ borderColor: '#e2d6bb' }}>
            <b style={{ color: '#916b28' }}>{l.qty}×</b>
            <div className="min-w-0 flex-1">
              {l.name}
              {l.size ? ` (${l.size})` : ''}
              {(l.options.length > 0 || l.note) && (
                <div className="text-xs" style={{ color: '#7d7563' }}>
                  {[...l.options.map((o) => o.name), l.note].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <span>{money(l.lineTotal)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between pt-1.5 text-[14px] font-bold">
        <span>Total · {current.orderType === 'delivery' ? 'pay at delivery' : 'pay at pickup'}</span>
        <span>{money(current.total)}</span>
      </div>
      </>}

      {/* the customer */}
      <div className="mt-2 rounded-xl px-2.5 py-2" style={{ background: '#f6efdf' }}>
        <div className="flex items-center gap-2">
          <b>{current.customerName}</b>
          {current.knownCustomer || current.previousOrders > 0 ? (
            <span className="rounded px-1.5 text-[11px] font-bold" style={{ background: '#f3ead6', color: '#916b28' }}>
              {current.previousOrders} order{current.previousOrders === 1 ? '' : 's'} before
            </span>
          ) : (
            <span className="rounded px-1.5 text-[11px] font-bold" style={{ background: '#e3f0e7', color: '#3f8a5a' }}>
              NEW CUSTOMER
            </span>
          )}
          <a href={`tel:${current.customerPhone}`} className="ml-auto font-semibold" style={{ color: '#916b28' }}>
            📞 {current.customerPhone}
          </a>
        </div>
        {current.orderType === 'delivery' && current.customerAddress && <div className="mt-0.5" style={{ color: '#5c5647' }}>📍 {current.customerAddress}</div>}
      </div>

      {/* the conversation */}
      {conversation && (
        <div className="mt-2 max-h-[28vh] space-y-1 overflow-y-auto rounded-xl p-2" style={{ background: '#131c18' }}>
          {conversation.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-xl px-2 py-1 text-xs ${m.role === 'customer' ? 'ml-auto' : ''}`}
              style={m.role === 'customer' ? { background: '#c9a24b', color: '#131c18' } : { background: '#22302a', color: '#eef0ea' }}
            >
              {m.text}
            </div>
          ))}
        </div>
      )}

      {/* answer */}
      {rejecting ? (
        <div className="mt-2.5">
          <div className="mb-1.5 text-xs font-semibold" style={{ color: '#b5533c' }}>
            Why? The customer sees it in the chat.
          </div>
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <button key={r} disabled={busy} onClick={() => reject(r)} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ border: '1px solid #b5533c', color: '#b5533c' }}>
                {r}
              </button>
            ))}
            <button onClick={() => setRejecting(false)} className="rounded-full px-3 py-1 text-xs" style={{ border: '1px solid #e2d6bb', color: '#7d7563' }}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-2">
          <button
            onClick={accept}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl px-5 py-2 font-bold text-white disabled:opacity-60"
            style={{ background: '#3f8a5a' }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept
          </button>
          <button
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-semibold"
            style={{ border: '1px solid #b5533c', color: '#b5533c' }}
          >
            <X className="h-4 w-4" /> Reject
          </button>
          <button onClick={openChat} className="ml-auto flex items-center gap-1 text-xs font-semibold" style={{ color: '#7d7563' }}>
            <MessageCircle className="h-3.5 w-3.5" /> {conversation ? 'Hide the chat' : 'Open the chat'}
          </button>
        </div>
      )}
    </div>
  );
}
