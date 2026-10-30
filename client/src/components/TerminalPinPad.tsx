// client/src/components/TerminalPinPad.tsx
//
// The login of a registered POS TERMINAL (2026-10-26): the cashier types a 4-digit PIN.
// The PC sends its secret key + the PIN; the server finds the restaurant from the key
// and the user from the PIN (inside that restaurant).
// Look (chosen by the user 2026-10-30, option C — same style as the login, option B):
// one dark green screen with a soft gold glow; on top the restaurant's logo (or the gold
// RES mark) and name, the greeting of the time of day and the clock; then 4 dots that
// glow gold as digits are typed and shake red on a wrong PIN, and big square keys easy
// to press on a touch screen; at the bottom the online / offline circle (only through
// RES Local) and "Manager? Sign in with username".
// Physical keyboard works too (digits, Backspace, Esc).

import { useEffect, useRef, useState } from 'react';
import { Delete, Loader2 } from 'lucide-react';
import { api } from '../api';
import { forgetTerminal, terminalKey, terminalRestaurant } from '../lib/terminal';
import OnlineDot from './OnlineDot';

interface Props {
  onLoggedIn: (token: string, user: any) => void;
  onUseEmail: () => void; // "Sign in with username instead"
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

  // the digit keys: big squares, easy to press on a touch screen
  const key =
    'pin-key flex h-[76px] items-center justify-center rounded-2xl border border-[#2f3d36] bg-[#17211c] text-[28px] font-semibold text-white transition select-none';
  const softKey =
    'flex h-[76px] items-center justify-center rounded-2xl border border-[#2f3d36] bg-transparent text-[15px] font-semibold text-[#a9b3ad] transition hover:text-white active:scale-95';

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#0e1512] px-4 py-8 text-[#e9e4d6]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap');
        .pin-serif { font-family: 'Fraunces', Georgia, serif; }
        @keyframes pin-shake { 0%,100% { transform: translateX(0) } 20%,60% { transform: translateX(-9px) } 40%,80% { transform: translateX(9px) } }
        .pin-shake { animation: pin-shake .38s ease-in-out; }
        .pin-key:hover { background: rgba(201,162,75,.10); border-color: rgba(201,162,75,.6); }
        .pin-key:active { transform: scale(.94); background: rgba(201,162,75,.24); }
        @keyframes pin-pop { 0% { transform: scale(.6) } 60% { transform: scale(1.25) } 100% { transform: scale(1) } }
        .pin-dot-on { animation: pin-pop .18s ease-out; }
      `}</style>

      {/* soft gold glow (decoration only) */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-56 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[#c9a24b]/10 blur-[60px]" />

      <div className="relative flex w-full max-w-[360px] flex-col items-center">
        {/* the restaurant: its logo (Restaurant Info) or the gold RES mark */}
        <div className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt="" className="h-12 w-12 rounded-[14px] object-cover ring-2 ring-[#c9a24b]" onError={() => setLogo('')} />
          ) : (
            <div className="pin-serif flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#c9a24b] text-[17px] font-bold text-[#131c18]">RES</div>
          )}
          <div className="flex flex-col">
            <span className="pin-serif text-[22px] leading-tight text-white">{restaurant || 'Restaurant'}</span>
            <span className="text-xs uppercase tracking-[0.1em] text-[#c9a24b]">{greeting} · enter your PIN</span>
          </div>
        </div>
        <div className="mt-2 text-sm tabular-nums text-[#8f9a93]">
          {time} · {date}
        </div>
        {welcomeLine && <div className="mt-1 max-w-sm text-center text-sm italic text-[#c9a24b]/80">“{welcomeLine}”</div>}

        {/* the 4 dots */}
        <div key={shake} className={`mt-7 flex justify-center gap-[14px] ${shake ? 'pin-shake' : ''}`}>
          {[0, 1, 2, 3].map((i) => {
            const on = i < pin.length;
            return (
              <span
                key={i}
                className={`h-4 w-4 rounded-full transition ${
                  error ? 'bg-red-500/80' : on ? 'pin-dot-on bg-[#c9a24b] shadow-[0_0_12px_rgba(201,162,75,.8)]' : 'border-2 border-[#4a5a52]'
                }`}
              />
            );
          })}
        </div>

        {/* message */}
        <div className={`mt-3 h-5 text-center text-sm font-semibold ${welcome ? 'text-emerald-400' : error ? 'text-red-400' : 'text-[#8f9a93]'}`}>
          {welcome ? (
            `Welcome, ${welcome}`
          ) : busy ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking…
            </span>
          ) : (
            error || 'Who is working?'
          )}
        </div>

        {/* keys */}
        <div className="mt-5 grid w-full grid-cols-3 gap-[14px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} onClick={() => press(d)} className={key}>
              {d}
            </button>
          ))}
          <button onClick={() => press('clear')} className={softKey}>
            Clear
          </button>
          <button onClick={() => press('0')} className={key}>
            0
          </button>
          <button onClick={() => press('back')} className={softKey} title="Delete" aria-label="Delete last digit">
            <Delete className="h-7 w-7" />
          </button>
        </div>

        {/* online / offline + username login */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[13px] text-[#8f9a93]">
          <OnlineDot />
          <button onClick={onUseEmail} className="text-[#c9a24b] underline-offset-2 hover:underline">
            Manager? Sign in with username
          </button>
        </div>
      </div>
    </div>
  );
}
