// client/src/pages/PlatformScreen.tsx
//
// Settings → Platform (only the PLATFORM OWNER sees it), users & roles 2026-10-26:
// the restaurants on the platform, and "New restaurant": creates the restaurant AND
// its owner account in one step (agreed with the user: no invite link). The new owner
// then logs in, completes Restaurant Info and creates the restaurant's users.
// Data: /api/platform/restaurants

import { useEffect, useState } from 'react';
import { Building2, Copy, Plus, RefreshCw, X } from 'lucide-react';
import { api } from '../api';
import { toast } from '../components/Toaster';
import { COUNTRIES } from '../lib/countries';

interface RestaurantRow {
  id: number;
  name: string;
  phone: string;
  country: string | null;
  currency: string | null;
  users: number;
  ownerEmail: string | null;
  createdAt: string;
}

const input = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm outline-none focus:border-[#c9a24b]';
const label = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500';

export default function PlatformScreen() {
  const [rows, setRows] = useState<RestaurantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ restaurant: string; email: string; password: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/platform/restaurants');
      setRows(res.data.restaurants || []);
    } catch (err: any) {
      toast.error('Restaurants not loaded', err?.response?.data?.error || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const countryName = (code: string | null) => COUNTRIES.find((c) => c.code === code)?.name ?? code ?? '—';

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-b-2 border-[#c9a24b] bg-[#131c18] px-4 py-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#c9a24b]">Platform · only you see this</div>
          <h1 className="text-lg font-extrabold text-white">
            Restaurants <span className="text-sm font-normal text-slate-400">· {rows.length}</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={load} title="Refresh" className="flex h-9 items-center rounded-md border border-white/20 px-3 text-white hover:bg-white/10">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setAdding(true)} className="flex h-9 items-center gap-1.5 rounded-md bg-[#c9a24b] px-3 text-sm font-bold text-[#131c18] hover:bg-[#d8b465]">
            <Plus className="h-4 w-4" /> New restaurant
          </button>
        </div>
      </div>

      {created && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <div className="mb-1 font-bold">✓ {created.restaurant} is ready. Send these login details to the owner:</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-white px-2 py-1 font-mono text-xs text-slate-800">
              Email: {created.email} · Password: {created.password}
            </code>
            <button
              onClick={() => {
                navigator.clipboard
                  .writeText(`Your RES POS account\nRestaurant: ${created.restaurant}\nEmail: ${created.email}\nPassword: ${created.password}\nPlease change your password after the first login.`)
                  .then(() => toast.success('Copied', 'Paste it in WhatsApp or an email.'))
                  .catch(() => toast.error('Not copied', 'Copy it by hand.'));
              }}
              className="flex h-7 items-center gap-1 rounded border border-emerald-300 bg-white px-2 text-xs font-semibold text-emerald-800"
            >
              <Copy className="h-3.5 w-3.5" /> Copy message
            </button>
            <button onClick={() => setCreated(null)} className="text-emerald-700" title="Hide">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1 text-[11px] text-emerald-800">The password is shown only now. The owner can change it, and creates the restaurant's users.</div>
        </div>
      )}

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[#131c18] text-xs text-white">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">#</th>
              <th className="px-3 py-2 text-left font-semibold">Restaurant</th>
              <th className="px-3 py-2 text-left font-semibold">Country</th>
              <th className="px-3 py-2 text-left font-semibold">Currency</th>
              <th className="px-3 py-2 text-left font-semibold">Owner</th>
              <th className="px-3 py-2 text-right font-semibold">Users</th>
              <th className="px-3 py-2 text-left font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="px-3 py-2 text-slate-400">{r.id}</td>
                <td className="px-3 py-2 font-semibold text-slate-800">
                  <Building2 className="mr-1.5 inline h-4 w-4 text-[#c9a24b]" />
                  {r.name}
                </td>
                <td className="px-3 py-2 text-slate-600">{countryName(r.country)}</td>
                <td className="px-3 py-2 text-slate-600">{r.currency || 'USD'}</td>
                <td className="px-3 py-2 text-slate-600">{r.ownerEmail || <span className="text-red-500">no owner</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.users}</td>
                <td className="px-3 py-2 text-slate-500">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <NewRestaurantModal
          onClose={() => setAdding(false)}
          onCreated={(info) => {
            setAdding(false);
            setCreated(info);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewRestaurantModal({ onClose, onCreated }: { onClose: () => void; onCreated: (i: { restaurant: string; email: string; password: string }) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('LB');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // a starting password the owner will change
  const suggest = () => setPassword(`Res-${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`);

  const create = async () => {
    setError(null);
    setSaving(true);
    const c = COUNTRIES.find((x) => x.code === country);
    try {
      await api.post('/platform/restaurants', {
        restaurant: { name, phone, country, currency: c?.currency, timezone: c?.timezone },
        owner: { name: ownerName, email: ownerEmail, password },
      });
      toast.success('Restaurant created', name);
      onCreated({ restaurant: name, email: ownerEmail.trim().toLowerCase(), password });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Not created. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 lg:pl-60" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-xl border-t-[3px] border-t-[#c9a24b] bg-white p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-[#131c18]">New restaurant</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Close (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[#8a6d2c]">The restaurant</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={label}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} autoFocus />
          </div>
          <div>
            <label className={label}>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Country (sets currency & time zone)</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={input}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} · {c.currency}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-widest text-[#8a6d2c]">Its owner (restaurant admin)</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Name</label>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Email (login)</label>
            <input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className={input} />
          </div>
          <div className="col-span-2">
            <label className={label}>Starting password (the owner changes it)</label>
            <div className="flex gap-2">
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 6 characters" className={`${input} font-mono`} />
              <button type="button" onClick={suggest} className="h-9 shrink-0 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                Suggest
              </button>
            </div>
          </div>
        </div>
        {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-100">Cancel</button>
          <button onClick={create} disabled={saving} className="h-9 rounded-md bg-[#131c18] px-4 text-sm font-semibold text-white hover:bg-[#1f2d26] disabled:opacity-50">
            {saving ? 'Creating…' : 'Create restaurant + owner'}
          </button>
        </div>
      </div>
    </div>
  );
}
