// client/src/pages/CustomerChat.tsx
//
// Chat orders (v2, step 2 — 2026-11-01): the page the restaurant's CUSTOMERS open,
// e.g. https://<server>/chat/tahinajin (link on Instagram / WhatsApp, or a QR code).
// No login: it only calls /api/public/chat/... (see src/routes/publicChat.ts).
//
// The page keeps the conversation (and the last draft) and sends them on each
// message; the server re-checks and re-prices everything, so nothing typed or
// changed here can change a price.

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Send, Check, Pencil, User, Loader2, RotateCcw } from 'lucide-react';

interface ChatMessage {
  role: 'customer' | 'bot';
  text: string;
  buttons?: string[];
  card?: OrderCard | null;
  booking?: BookingCard | null; // a table booking (instead of an order card)
  ready?: boolean;
  human?: boolean;
  status?: boolean; // "Order sent / Accepted / Rejected" (green box)
}
interface CardLine {
  itemId: number;
  name: string;
  qty: number;
  size: string | null;
  options: { id: number; name: string; price: number }[];
  note: string | null;
  lineTotal: number;
}
interface OrderCard {
  orderType: 'delivery' | 'pickup' | null;
  lines: CardLine[];
  subtotal: number;
  tax: number;
  total: number;
}
interface BookingCard {
  date: string | null;
  time: string | null;
  people: number | null;
  note: string | null;
  tableLabel: string | null;
  ok: boolean; // RES found a free table
}
type Draft = { intent?: string; orderType: string | null; lines: unknown[]; booking?: unknown } | null;

// "2026-11-07" → "Sat 7 Nov"
const niceDate = (d: string | null) =>
  d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '…';
type Customer = { name: string | null; phone: string | null; address: string | null };
// the order once sent: W-ref + the secret token used to ask its status
type Placed = { ref: string; token: string; status: 'pending' | 'accepted' | 'rejected'; ticketNo?: number; busyShown?: boolean };

// plain fetch, never with the staff login token
const base = String(api.defaults.baseURL || '/api').replace(/\/$/, '');
async function callChat(path: string, body?: unknown) {
  const res = await fetch(`${base}/public/chat/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Error'), { status: res.status });
  return data;
}

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;
const WELCOME = (name: string): ChatMessage => ({
  role: 'bot',
  text: `Ahla w sahla 👋 Welcome to ${name}! What would you like today? Write normally, e.g. "2 tawook w large fries".`,
  buttons: ['🛵 Delivery', '🥡 Pickup', '📅 Book a table', '📋 What do you have?'],
});

// the conversation survives a page refresh (same tab only); storage may be blocked
const loadSaved = (code: string) => {
  try {
    return JSON.parse(sessionStorage.getItem(`chat:${code}`) || 'null');
  } catch {
    return null;
  }
};
const save = (code: string, v: unknown) => {
  try {
    sessionStorage.setItem(`chat:${code}`, JSON.stringify(v));
  } catch {
    /* private mode: the chat simply starts again after a refresh */
  }
};

export default function CustomerChat({ code }: { code: string }) {
  const [restaurant, setRestaurant] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'off' | 'missing'>('loading');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<Draft>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // the customer's details found by the AI, and the order once it is sent (step 3)
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 1. which restaurant, and is its chat on
  useEffect(() => {
    callChat(encodeURIComponent(code))
      .then((r) => {
        setRestaurant(r.restaurant);
        document.title = `${r.restaurant} · Order`;
        setState(r.ready ? 'ok' : 'off');
        const saved = loadSaved(code);
        if (saved?.messages?.length) {
          setMessages(saved.messages);
          setDraft(saved.draft ?? null);
          setCustomer(saved.customer ?? null);
          setPlaced(saved.placed ?? null);
        } else {
          setMessages([WELCOME(r.restaurant)]);
        }
      })
      .catch((e) => setState(e.status === 404 ? 'missing' : 'off'));
  }, [code]);

  useEffect(() => {
    if (messages.length) save(code, { messages, draft, customer, placed });
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, draft, customer, placed, busy, code]);

  // 3. after Confirm: ask every 5 s what the restaurant answered
  useEffect(() => {
    if (!placed || placed.status === 'accepted' || placed.status === 'rejected') return;
    const check = async () => {
      try {
        const s = await callChat(`${encodeURIComponent(code)}/status/${placed.token}`);
        const say = (text: string) => setMessages((m) => [...m, { role: 'bot', text, status: true }]);
        if (s.status === 'accepted' && s.kind === 'booking') {
          say(`👍 Your table is booked at ${restaurant}!\n📅 ${niceDate(s.booking?.date)} at ${s.booking?.time} · ${s.booking?.people} people.\nSee you soon! 😊`);
          setPlaced((p) => (p ? { ...p, status: 'accepted' } : p));
        } else if (s.status === 'accepted') {
          say(`👍 Accepted by ${restaurant}! Your order number is #${s.ticketNo}.\n🍳 Preparing now. Sahtein!`);
          setPlaced((p) => (p ? { ...p, status: 'accepted', ticketNo: s.ticketNo } : p));
        } else if (s.status === 'rejected') {
          say(`😔 Sorry, the restaurant could not take this ${s.kind === 'booking' ? 'booking' : 'order'}: ${s.rejectReason}`);
          setPlaced((p) => (p ? { ...p, status: 'rejected' } : p));
        } else if (s.waitingSeconds > 300 && !placed.busyShown) {
          say(`⏳ The restaurant is busy right now.${s.restaurantPhone ? ` You can call them: ${s.restaurantPhone}` : ''} Your order is still waiting for them.`);
          setPlaced((p) => (p ? { ...p, busyShown: true } : p));
        }
      } catch {
        /* try again at the next tick */
      }
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, [placed, code, restaurant]);

  // 2. one message → the server → the AI's reply + RES's order card
  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy || state !== 'ok' || placed) return;
    const next: ChatMessage[] = [...messages, { role: 'customer', text: t }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const r = await callChat(`${encodeURIComponent(code)}/message`, {
        history: next.map((m) => ({ role: m.role, text: m.text })),
        draft,
      });
      setDraft(r.draft ?? null);
      setCustomer(r.customer ?? null);
      setMessages((m) => [
        ...m,
        {
          role: 'bot',
          text: r.reply,
          buttons: r.buttons,
          card: r.intent !== 'booking' && r.card?.lines?.length ? r.card : null,
          booking: r.intent === 'booking' && r.booking && (r.booking.date || r.booking.time || r.booking.people) ? r.booking : null,
          ready: r.readyToConfirm,
          human: r.wantsHuman,
        },
      ]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'bot', text: e.message || 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const startOver = () => {
    setDraft(null);
    setCustomer(null);
    setPlaced(null);
    setInput('');
    setMessages([WELCOME(restaurant || '')]);
  };

  // Confirm → the order goes to the restaurant's POS (it rings there)
  const confirm = async () => {
    if (busy || placed) return;
    setBusy(true);
    try {
      const r = await callChat(`${encodeURIComponent(code)}/confirm`, {
        history: messages.map((m) => ({ role: m.role, text: m.text })),
        draft,
        customer,
      });
      setPlaced({ ref: r.ref, token: r.token, status: 'pending' });
      const what = r.kind === 'booking' ? 'Booking request' : 'Order';
      setMessages((m) => [...m, { role: 'bot', text: `✅ ${what} ${r.ref} sent!\nWaiting for the restaurant to accept it… ⏳`, status: true }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'bot', text: e.message || 'Sorry, the order could not be sent. Please try again.' }]);
    } finally {
      setBusy(false);
    }
  };

  // only the LAST bot message keeps its buttons and its Confirm, and only the latest
  // order card is shown (it always holds the whole order)
  const lastBot = messages.map((m) => m.role).lastIndexOf('bot');
  const lastCard = messages.map((m) => Boolean(m.card || m.booking)).lastIndexOf(true);

  if (state === 'missing') {
    return <Center>This restaurant link does not exist. Please check the address.</Center>;
  }

  return (
    <div className="min-h-[100dvh] w-full flex justify-center" style={{ background: '#0e1512', color: '#eef0ea' }}>
      <div className="w-full max-w-[520px] h-[100dvh] flex flex-col" style={{ background: '#131c18' }}>
        {/* header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: '#33453b' }}>
          <div
            className="relative w-10 h-10 rounded-full flex items-center justify-center font-bold"
            style={{ background: '#c9a24b', color: '#131c18', fontFamily: 'Georgia, serif' }}
          >
            {(restaurant || '…').slice(0, 1).toUpperCase()}
            <span
              className="absolute right-0 bottom-0 w-2.5 h-2.5 rounded-full border-2"
              style={{ background: state === 'ok' ? '#5fae7b' : '#9aa89f', borderColor: '#131c18' }}
            />
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate" style={{ fontFamily: 'Georgia, serif', fontSize: 17 }}>
              {restaurant || 'Loading…'}
            </div>
            <div className="text-xs" style={{ color: state === 'ok' ? '#5fae7b' : '#9aa89f' }}>
              {state === 'ok' ? '● Online · we reply right away' : state === 'off' ? 'Chat not available yet' : ''}
            </div>
          </div>
          {/* start a new conversation (forgets this one) */}
          {messages.length > 1 && !busy && (
            <button
              onClick={startOver}
              className="ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-xs"
              style={{ border: '1px solid #33453b', color: '#9aa89f' }}
            >
              <RotateCcw className="w-3.5 h-3.5" /> New order
            </button>
          )}
        </header>

        {state === 'off' && (
          <div className="mx-3 mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: '#2a2416', border: '1px solid #c9a24b', color: '#e6cf8f' }}>
            The chat is not set up yet. Please call the restaurant to order.
          </div>
        )}

        {/* messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
          {messages.map((m, i) => (
            <div key={i} className="flex flex-col gap-2">
              {m.status ? (
                <div className="self-stretch whitespace-pre-wrap rounded-2xl px-3 py-2.5 text-[14px]" style={{ background: 'rgba(95,174,123,.1)', border: '1px solid #5fae7b' }}>
                  {m.text}
                </div>
              ) : (
                <Bubble mine={m.role === 'customer'}>{m.text}</Bubble>
              )}

              {m.booking && i === lastCard && (
                <BookingCardView booking={m.booking} ready={!!m.ready && i === lastBot && !placed} onConfirm={confirm} onChange={() => inputRef.current?.focus()} />
              )}

              {m.card && i === lastCard && <Card card={m.card} ready={!!m.ready && i === lastBot && !placed} onConfirm={confirm} onChange={() => inputRef.current?.focus()} />}

              {m.human && (
                <div className="self-start flex items-center gap-2 text-xs rounded-full px-3 py-1" style={{ border: '1px solid #5fae7b', color: '#5fae7b' }}>
                  <User className="w-3.5 h-3.5" /> A staff member will answer you here
                </div>
              )}

              {i === lastBot && !busy && !placed && m.buttons && m.buttons.length > 0 && (
                <div className="flex flex-wrap gap-1.5 self-start max-w-[92%]">
                  {m.buttons.map((b) => (
                    <button
                      key={b}
                      onClick={() => send(b)}
                      disabled={state !== 'ok'}
                      className="rounded-full px-3 py-1.5 text-[13px] disabled:opacity-50"
                      style={{ border: '1px solid #c9a24b', color: '#e6cf8f', background: 'rgba(201,162,75,.07)' }}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="self-start rounded-2xl px-3 py-2 text-sm flex items-center gap-2" style={{ background: '#1b2621', border: '1px solid #33453b', color: '#9aa89f' }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> writing…
            </div>
          )}
        </div>

        {/* input */}
        <form
          className="flex items-center gap-2 px-3 py-3 border-t"
          style={{ borderColor: '#33453b' }}
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={state !== 'ok' || !!placed}
            maxLength={500}
            placeholder={placed ? 'Order sent · tap "New order" for another one' : state === 'ok' ? 'Write a message…' : 'Chat not available'}
            className="flex-1 rounded-full px-4 py-2.5 text-[15px] outline-none disabled:opacity-60"
            style={{ background: '#1b2621', border: '1px solid #33453b', color: '#eef0ea' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || busy || state !== 'ok'}
            className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-40"
            style={{ background: '#c9a24b', color: '#131c18' }}
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function Bubble({ mine, children }: { mine: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`max-w-[82%] px-3 py-2 text-[14px] leading-snug whitespace-pre-wrap rounded-2xl ${mine ? 'self-end rounded-br-md' : 'self-start rounded-bl-md'}`}
      style={mine ? { background: '#c9a24b', color: '#131c18' } : { background: '#1b2621', border: '1px solid #33453b' }}
    >
      {children}
    </div>
  );
}

// The order card: always what RES computed (names, prices, total).
function Card({ card, ready, onConfirm, onChange }: { card: OrderCard; ready: boolean; onConfirm: () => void; onChange: () => void }) {
  return (
    <div className="self-start w-[90%] rounded-2xl px-3 py-2.5 text-[13px]" style={{ background: '#1b2621', border: '1px solid #c9a24b' }}>
      <div className="flex justify-between items-baseline mb-1">
        <span className="font-semibold" style={{ fontFamily: 'Georgia, serif', color: '#e6cf8f' }}>Your order</span>
        <span className="text-xs" style={{ color: '#9aa89f' }}>
          {card.orderType === 'delivery' ? '🛵 Delivery' : card.orderType === 'pickup' ? '🥡 Pickup' : ''}
        </span>
      </div>
      {card.lines.map((l, i) => (
        <div key={i} className="flex gap-2 py-0.5">
          <b style={{ color: '#c9a24b' }}>{l.qty}×</b>
          <div className="min-w-0 flex-1">
            {l.name}
            {l.size ? ` (${l.size})` : ''}
            {(l.options.length > 0 || l.note) && (
              <div className="text-xs" style={{ color: '#9aa89f' }}>
                {[...l.options.map((o) => o.name), l.note].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
          <span style={{ color: '#e6cf8f' }}>{money(l.lineTotal)}</span>
        </div>
      ))}
      <div className="mt-1.5 pt-1.5 border-t" style={{ borderColor: '#33453b' }}>
        {card.tax > 0 && (
          <div className="flex justify-between" style={{ color: '#9aa89f' }}>
            <span>Tax</span>
            <span>{money(card.tax)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-[14px]">
          <span>Total</span>
          <span>{money(card.total)}</span>
        </div>
      </div>
      <div className="text-xs mt-1" style={{ color: '#9aa89f' }}>💵 Pay at {card.orderType === 'delivery' ? 'delivery' : 'pickup'} (cash or card)</div>
      {ready && (
        <div className="flex gap-2 mt-2">
          <button onClick={onConfirm} className="flex-1 rounded-xl py-2 font-semibold flex items-center justify-center gap-1.5" style={{ background: '#c9a24b', color: '#131c18' }}>
            <Check className="w-4 h-4" /> Confirm
          </button>
          <button onClick={onChange} className="rounded-xl px-3 py-2 flex items-center gap-1.5" style={{ border: '1px solid #33453b', color: '#9aa89f' }}>
            <Pencil className="w-3.5 h-3.5" /> Change
          </button>
        </div>
      )}
    </div>
  );
}

// The table booking card: what RES checked (a free table found or not).
function BookingCardView({ booking, ready, onConfirm, onChange }: { booking: BookingCard; ready: boolean; onConfirm: () => void; onChange: () => void }) {
  const row = (icon: string, label: string, value: string) => (
    <div className="flex gap-2 py-0.5">
      <span className="w-5">{icon}</span>
      <span style={{ color: '#9aa89f' }} className="w-16">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
  return (
    <div className="self-start w-[90%] rounded-2xl px-3 py-2.5 text-[13px]" style={{ background: '#1b2621', border: '1px solid #c9a24b' }}>
      <div className="mb-1 font-semibold" style={{ fontFamily: 'Georgia, serif', color: '#e6cf8f' }}>
        Your table booking
      </div>
      {row('📅', 'Date', niceDate(booking.date))}
      {row('🕘', 'Time', booking.time ?? '…')}
      {row('👥', 'People', booking.people ? String(booking.people) : '…')}
      {booking.note && row('📝', 'Note', booking.note)}
      <div className="mt-1.5 pt-1.5 border-t text-xs" style={{ borderColor: '#33453b', color: booking.ok ? '#5fae7b' : '#9aa89f' }}>
        {booking.ok
          ? '✓ A table is free at this time'
          : booking.date && booking.time && booking.people
            ? '✕ Not possible at this time: choose another one'
            : 'Date, time and number of people needed'}
      </div>
      {ready && (
        <div className="flex gap-2 mt-2">
          <button onClick={onConfirm} className="flex-1 rounded-xl py-2 font-semibold flex items-center justify-center gap-1.5" style={{ background: '#c9a24b', color: '#131c18' }}>
            <Check className="w-4 h-4" /> Confirm booking
          </button>
          <button onClick={onChange} className="rounded-xl px-3 py-2 flex items-center gap-1.5" style={{ border: '1px solid #33453b', color: '#9aa89f' }}>
            <Pencil className="w-3.5 h-3.5" /> Change
          </button>
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 text-center" style={{ background: '#0e1512', color: '#9aa89f' }}>
      {children}
    </div>
  );
}
