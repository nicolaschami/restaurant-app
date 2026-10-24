// client/src/components/OpeningCashPrompt.tsx
//
// POS reminder at the start of the day (agreed 2026-10-25): the first time the POS
// opens in a new day (= after a Z), a small window asks to confirm the opening cash
// in the drawer. It shows the cash left at the last Z; the cashier confirms it or
// types another amount. It never blocks selling: "Later" closes it, and it is not
// asked again on this device until the next Z.
// Data: GET /api/z-reports/opening-status, POST /api/z-reports/opening-cash

import { money } from '../lib/restaurantSettings';
import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { api } from '../api';

// "Asked already" is remembered per restaurant and per day (= per last Z number).
const askedKey = (lastZ: number | null) => `openingCashAsked:${localStorage.getItem('restaurantName') || ''}:${lastZ ?? 0}`;

export default function OpeningCashPrompt() {
  const [status, setStatus] = useState<{ amount: number; source: string; lastZNumber: number | null } | null>(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/z-reports/opening-status')
      .then((res) => {
        const d = res.data;
        if (!d?.needsConfirm) return; // already confirmed today
        try {
          if (localStorage.getItem(askedKey(d.lastZNumber))) return; // "Later" was chosen today
        } catch {
          /* storage blocked: just ask */
        }
        setStatus(d);
        setAmount(Number(d.amount || 0).toFixed(2));
      })
      .catch(() => {}); // old server / offline: no reminder, selling goes on
  }, []);

  if (!status) return null;

  const remember = () => {
    try {
      localStorage.setItem(askedKey(status.lastZNumber), '1');
    } catch {
      /* ignore */
    }
  };

  const confirm = async () => {
    const n = Number(amount);
    if (amount === '' || isNaN(n) || n < 0) {
      setError('Enter the cash in the drawer (0 if it is empty).');
      return;
    }
    setSaving(true);
    try {
      await api.post('/z-reports/opening-cash', { amount: n });
      remember();
      setStatus(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'The opening cash could not be saved.');
      setSaving(false);
    }
  };

  const later = () => {
    remember();
    setStatus(null);
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-2xl" role="dialog" aria-modal="true">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#c9a24b]/15 text-[#8a6d2c]">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <div className="text-base font-bold text-slate-800">Opening cash</div>
            <div className="text-xs text-slate-500">New day: how much cash is in the drawer before selling?</div>
          </div>
        </div>
        {status.source === 'last-z' && (
          <div className="mb-2 text-xs text-slate-500">
            Left in the drawer at the last closing: <b>{money(Number(status.amount))}</b>. Confirm it, or type the new amount.
          </div>
        )}
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          autoFocus
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && confirm()}
          className="h-12 w-full rounded-md border border-slate-300 px-3 text-right text-2xl font-bold tabular-nums outline-none focus:border-[#c9a24b]"
        />
        {error && <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={later} className="h-11 rounded-md border border-slate-300 px-4 text-sm text-slate-600 hover:bg-slate-100">
            Later
          </button>
          <button onClick={confirm} disabled={saving} className="h-11 rounded-md bg-[#131c18] px-5 text-sm font-semibold text-white hover:bg-[#1f2d26] disabled:opacity-50">
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
