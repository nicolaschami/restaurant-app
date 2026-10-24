// client/src/components/SwitchUserModal.tsx
//
// "Switch user" on the POS (users & roles, 2026-10-26): the next cashier types their
// 4-digit PIN (set on Settings → Users) and the POS continues under their name —
// no email or password. Big keypad for touch screens; the physical keyboard works too.
// Data: POST /api/auth/pin-login { pin } → a login for that user (same restaurant).

import { useEffect, useRef, useState } from 'react';
import { Delete, X } from 'lucide-react';
import { api } from '../api';

export default function SwitchUserModal({ currentName, onClose, onSwitched }: {
  currentName: string;
  onClose: () => void;
  onSwitched: (token: string, user: any) => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = async (code: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/auth/pin-login', { pin: code });
      onSwitched(res.data.token, res.data.user);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Wrong PIN.');
      setPin('');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const press = (k: string) => {
    if (busy) return;
    if (k === 'back') return setPin((p) => p.slice(0, -1));
    if (k === 'clear') return setPin('');
    setPin((p) => {
      if (p.length >= 4) return p;
      const next = p + k;
      if (next.length === 4) setTimeout(() => submit(next), 120); // 4th digit → go
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const key = 'h-16 rounded-xl border border-white/10 bg-white/5 text-2xl font-bold text-white transition hover:bg-white/10 active:scale-95';

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-xs rounded-2xl border-b-2 border-[#c9a24b] bg-[#131c18] p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-white">Switch user</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-white/10" title="Close (Esc)">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          Now: <span className="text-[#c9a24b]">{currentName}</span> · type your 4-digit PIN
        </p>

        <div className="mb-3 flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-4 w-4 rounded-full border-2 ${i < pin.length ? 'border-[#c9a24b] bg-[#c9a24b]' : 'border-slate-500'}`} />
          ))}
        </div>
        <div className={`mb-3 h-5 text-center text-sm font-semibold ${error ? 'text-red-400' : 'text-slate-400'}`}>
          {error || (busy ? 'Checking…' : '')}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} onClick={() => press(d)} className={key}>
              {d}
            </button>
          ))}
          <button onClick={() => press('clear')} className={`${key} text-sm font-semibold text-slate-300`}>
            Clear
          </button>
          <button onClick={() => press('0')} className={key}>
            0
          </button>
          <button onClick={() => press('back')} className={`${key} flex items-center justify-center`} title="Delete">
            <Delete className="h-6 w-6" />
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-500">PINs are set by the owner on Settings → Users.</p>
      </div>
    </div>
  );
}
