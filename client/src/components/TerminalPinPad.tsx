// client/src/components/TerminalPinPad.tsx
//
// The login of a registered POS TERMINAL (2026-10-26): the cashier types a 4-digit PIN.
// The PC sends its secret key + the PIN; the server finds the restaurant from the key
// and the user from the PIN (inside that restaurant).
// Look (chosen by the user): a SPLIT screen —
//   left : a warm light welcome panel (cream / gold): the restaurant's logo and name,
//          "Good morning / afternoon / evening", a big clock and the date, and the
//          welcome line (first line of the receipt header, Restaurant Info);
//   right: the dark green keypad — 4 dots that glow gold as digits are typed and shake
//          red on a wrong PIN, big round keys.
// On a narrow screen only the keypad shows.
// Physical keyboard works too (digits, Backspace, Esc).

import { useEffect, useRef, useState } from 'react';
import { Delete, Loader2, Store } from 'lucide-react';
import { api } from '../api';
import { forgetTerminal, terminalKey, terminalRestaurant } from '../lib/terminal';

interface Props {
  onLoggedIn: (token: string, user: any) => void;
  onUseEmail: () => void; // "Log in with email instead"
}

export default function TerminalPinPad({ onLoggedIn, onUseEmail }: Props) {
  const [restaurant, setRestaurant] = useState(terminalRestaurant());
  const [logo, setLogo] = useState('');
  const [welcomeLine, setWelcomeLine] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0); // changes on each wrong PIN → replays the shake
  const [busy, setBusy] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Is this PC still a terminal? (the owner may have removed it) + name and logo
  useEffect(() => {
    api
      .post('/auth/terminal-check', { key: terminalKey() })
      .then((res) => {
        setRestaurant(res.data.restaurantName);
        setLogo(res.data.logoUrl || '');
        setWelcomeLine(res.data.welcome || '');
      })
      .catch((err) => {
        if (err?.response?.status === 404) {
          forgetTerminal();
          onUseEmail();
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (code: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/auth/terminal-login', { key: terminalKey(), pin: code });
      setWelcome(res.data.user?.name || '');
      // a short "Welcome" before the POS opens
      setTimeout(() => onLoggedIn(res.data.token, res.data.user), 450);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        forgetTerminal();
        onUseEmail();
        return;
      }
      setError(!err?.response ? 'Cannot reach the server.' : err.response.data?.error || 'Wrong PIN.');
      setShake((n) => n + 1);
      setPin('');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const press = (k: string) => {
    if (busyRef.current) return;
    if (k === 'back') return setPin((p) => p.slice(0, -1));
    if (k === 'clear') {
      setError(null);
      return setPin('');
    }
    setError(null);
    setPin((p) => {
      if (p.length >= 4) return p;
      const next = p + k;
      if (next.length === 4) setTimeout(() => submit(next), 160); // 4th digit → log in
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Escape') press('clear');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key =
    'pin-key flex h-[96px] w-[96px] items-center justify-center rounded-full border border-[#c9a24b]/35 bg-white/[0.04] text-4xl font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition select-none';

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // The restaurant's logo in a gold ring (or a shop icon).
  const Logo = ({ size }: { size: number }) => (
    <div
      className="flex items-center justify-center overflow-hidden rounded-full bg-[#131c18] ring-2 ring-[#c9a24b] ring-offset-4 ring-offset-[#f6efe0]"
      style={{ width: size, height: size }}
    >
      {logo ? (
        <img src={logo} alt="" className="h-full w-full object-cover" onError={() => setLogo('')} />
      ) : (
        <Store className="text-[#c9a24b]" style={{ width: size * 0.45, height: size * 0.45 }} />
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* ---------- left: warm welcome panel ---------- */}
      <div
        className="relative hidden flex-1 flex-col items-center justify-center overflow-hidden px-10 text-center md:flex"
        style={{
          background:
            'radial-gradient(circle at 20% 15%, rgba(201,162,75,.22) 0, transparent 40%), radial-gradient(circle at 85% 90%, rgba(201,162,75,.18) 0, transparent 45%), linear-gradient(160deg, #fbf7ee 0%, #f3e9d4 100%)',
        }}
      >
        {/* soft gold rings in the corners */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full border-[18px] border-[#c9a24b]/10" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full border-[22px] border-[#c9a24b]/10" />

        <Logo size={120} />
        <div className="mt-6 text-[11px] font-bold uppercase tracking-[0.35em] text-[#8a6d2c]">POS terminal</div>
        <h1 className="mt-1 text-3xl font-extrabold text-[#131c18]">{restaurant || 'Restaurant'}</h1>
        <div className="mx-auto mt-5 h-px w-24 bg-gradient-to-r from-transparent via-[#c9a24b] to-transparent" />
        <div className="mt-5 text-xl font-semibold text-[#5c4a22]">{greeting}</div>
        <div className="mt-1 text-6xl font-extrabold tabular-nums tracking-tight text-[#131c18]">{time}</div>
        <div className="mt-2 text-base text-[#6b5a35]">{date}</div>
        <div className="mt-8 max-w-sm text-lg italic text-[#8a6d2c]">“{welcomeLine || `Welcome to ${restaurant || 'our restaurant'}`}”</div>
      </div>

      {/* ---------- right: the keypad ---------- */}
      <div
        className="flex w-full items-center justify-center p-4 md:w-1/2 md:shrink-0"
        style={{ background: 'radial-gradient(ellipse at top, #1f3a2e 0%, #131c18 45%, #070a09 100%)' }}
      >
      <style>{`
        @keyframes pin-shake { 0%,100% { transform: translateX(0) } 20%,60% { transform: translateX(-9px) } 40%,80% { transform: translateX(9px) } }
        .pin-shake { animation: pin-shake .38s ease-in-out; }
        .pin-key:hover { background: rgba(201,162,75,.12); border-color: rgba(201,162,75,.7); }
        .pin-key:active { transform: scale(.92); background: rgba(201,162,75,.28); }
        @keyframes pin-pop { 0% { transform: scale(.6) } 60% { transform: scale(1.25) } 100% { transform: scale(1) } }
        .pin-dot-on { animation: pin-pop .18s ease-out; }
      `}</style>

      <div className="w-full max-w-[440px] rounded-3xl border border-[#c9a24b]/20 bg-black/25 px-7 pb-6 pt-7 shadow-2xl backdrop-blur">
        {/* restaurant */}
        {/* narrow screens: name + clock here (the welcome panel is hidden) */}
        <div className="flex flex-col items-center text-center md:hidden">
          <div className="mb-3">
            <Logo size={80} />
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#c9a24b]">POS terminal</div>
          <div className="mt-1 text-2xl font-extrabold text-white">{restaurant || 'Restaurant'}</div>
          <div className="mt-1 text-sm tabular-nums text-slate-400">
            {time} · {date}
          </div>
        </div>
        {/* wide screens: a short title above the dots */}
        <div className="hidden text-center md:block">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#c9a24b]">Staff login</div>
          <div className="mt-1 text-xl font-extrabold text-white">Who is working?</div>
        </div>

        {/* the 4 dots */}
        <div key={shake} className={`mt-6 flex justify-center gap-4 ${shake ? 'pin-shake' : ''}`}>
          {[0, 1, 2, 3].map((i) => {
            const on = i < pin.length;
            return (
              <span
                key={i}
                className={`h-4 w-4 rounded-full transition ${
                  error ? 'bg-red-500/80' : on ? 'pin-dot-on bg-[#c9a24b] shadow-[0_0_12px_rgba(201,162,75,.8)]' : 'border-2 border-white/30'
                }`}
              />
            );
          })}
        </div>

        {/* message */}
        <div className={`mt-3 h-5 text-center text-sm font-semibold ${welcome ? 'text-emerald-400' : error ? 'text-red-400' : 'text-slate-400'}`}>
          {welcome ? (
            `Welcome, ${welcome}`
          ) : busy ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking…
            </span>
          ) : (
            error || 'Enter your PIN'
          )}
        </div>

        {/* keys */}
        <div className="mt-5 grid grid-cols-3 justify-items-center gap-x-5 gap-y-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} onClick={() => press(d)} className={key}>
              {d}
            </button>
          ))}
          <button onClick={() => press('clear')} className="h-[96px] w-[96px] rounded-full text-sm font-semibold text-slate-400 transition hover:text-white active:scale-95">
            Clear
          </button>
          <button onClick={() => press('0')} className={key}>
            0
          </button>
          <button
            onClick={() => press('back')}
            className="flex h-[96px] w-[96px] items-center justify-center rounded-full text-slate-300 transition hover:text-white active:scale-95"
            title="Delete"
          >
            <Delete className="h-10 w-10" />
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
          <span className="font-bold tracking-wider text-slate-500">RES POS</span>
          <button onClick={onUseEmail} className="text-[#c9a24b] underline-offset-2 hover:underline">
            Log in with email
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
