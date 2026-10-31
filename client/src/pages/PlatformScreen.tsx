// client/src/pages/PlatformScreen.tsx
//
// Settings → Platform (only the PLATFORM OWNER sees it), users & roles 2026-10-26:
// the restaurants on the platform, and "New restaurant": creates the restaurant AND
// its owner account in one step (agreed with the user: no invite link). The new owner
// then logs in, completes Restaurant Info and creates the restaurant's users.
// Login codes (2026-10-28): each new restaurant gets a short code ("capri"), fixed
// once saved; its owner logs in as admin@capri and its staff as sara@capri.
// Delete (2026-10-31): the red bin deletes a restaurant and ALL its data, after typing back
// its login code (or name). Not offered for a restaurant holding a platform owner (yours).
// Edit (2026-10-31): the pencil fixes a mistake — name, phone, country (currency + time
// zone), login code (every login follows: sara@old → sara@new) — and can reset the
// owner's password (shown once).
// Data: /api/platform/restaurants

import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, Copy, KeyRound, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { toast } from '../components/Toaster';
import { COUNTRIES } from '../lib/countries';

interface RestaurantRow {
  id: number;
  name: string;
  loginCode: string | null; // null = older restaurant (email logins)
  phone: string;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  users: number;
  ownerEmail: string | null;
  createdAt: string;
  orders: number;
  locked: boolean; // holds a platform owner account: can never be deleted
}

const input = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm outline-none focus:border-[#c9a24b]';
const label = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500';

export default function PlatformScreen() {
  const [rows, setRows] = useState<RestaurantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ restaurant: string; email: string; password: string } | null>(null);
  const [deleting, setDeleting] = useState<RestaurantRow | null>(null);
  const [editing, setEditing] = useState<RestaurantRow | null>(null);

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
              Username: {created.email} · Password: {created.password}
            </code>
            <button
              onClick={() => {
                navigator.clipboard
                  .writeText(`Your RES POS account\nRestaurant: ${created.restaurant}\nAddress: ${window.location.origin}\nUsername: ${created.email}\nPassword: ${created.password}\nPlease change your password after the first login.`)
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
              <th className="px-3 py-2 text-left font-semibold">Login code</th>
              <th className="px-3 py-2 text-left font-semibold">Country</th>
              <th className="px-3 py-2 text-left font-semibold">Currency</th>
              <th className="px-3 py-2 text-left font-semibold">Owner</th>
              <th className="px-3 py-2 text-right font-semibold">Users</th>
              <th className="px-3 py-2 text-right font-semibold">Orders</th>
              <th className="px-3 py-2 text-left font-semibold">Created</th>
              <th className="px-3 py-2" />
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
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.loginCode ? `@${r.loginCode}` : <span className="text-slate-400">— (emails)</span>}</td>
                <td className="px-3 py-2 text-slate-600">{countryName(r.country)}</td>
                <td className="px-3 py-2 text-slate-600">{r.currency || 'USD'}</td>
                <td className="px-3 py-2 text-slate-600">{r.ownerEmail || <span className="text-red-500">no owner</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.users}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.orders}</td>
                <td className="px-3 py-2 text-slate-500">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : '—'}</td>
                <td className="flex justify-end gap-1 px-3 py-2">
                  <button
                    onClick={() => setEditing(r)}
                    title={`Edit ${r.name}`}
                    aria-label={`Edit ${r.name}`}
                    className="rounded-md border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-100"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {r.locked ? (
                    <span className="self-center px-1 text-[11px] text-slate-400" title="Your own restaurant (it holds your platform owner account)">yours</span>
                  ) : (
                    <button
                      onClick={() => setDeleting(r)}
                      title={`Delete ${r.name} and all its data`}
                      aria-label={`Delete ${r.name}`}
                      className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
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
      {editing && (
        <EditRestaurantModal
          restaurant={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {deleting && (
        <DeleteRestaurantModal
          restaurant={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// Edit a restaurant (fix a mistake), and reset its owner's password.
function EditRestaurantModal({ restaurant, onClose, onSaved }: { restaurant: RestaurantRow; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(restaurant.name);
  const [phone, setPhone] = useState(restaurant.phone || '');
  const [country, setCountry] = useState(restaurant.country || 'LB');
  const [loginCode, setLoginCode] = useState(restaurant.loginCode || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<{ username: string; password: string } | null>(null);
  const toCode = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  const codeChanged = loginCode !== (restaurant.loginCode || '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const c = COUNTRIES.find((x) => x.code === country);
    try {
      const res = await api.put(`/platform/restaurants/${restaurant.id}`, {
        name,
        phone,
        country,
        // the country sets the currency and time zone (only when the country changes)
        ...(country !== restaurant.country ? { currency: c?.currency, timezone: c?.timezone } : {}),
        ...(codeChanged ? { loginCode } : {}),
      });
      const n = res.data?.loginsRenamed ?? 0;
      toast.success(`${name} saved`, n ? `${n} login(s) renamed to …@${res.data.loginCode}. Tell the staff their new username.` : 'The restaurant is updated.');
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Not saved. Please try again.');
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    setError(null);
    try {
      const res = await api.post(`/platform/restaurants/${restaurant.id}/reset-owner-password`, {});
      setNewPassword(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'The password could not be reset.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 lg:pl-60" onMouseDown={() => !saving && onClose()}>
      <div className="w-full max-w-lg rounded-xl border-t-[3px] border-t-[#c9a24b] bg-white p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-[#131c18]">Edit {restaurant.name}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Close (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} autoFocus />
          </div>
          <div>
            <label className={label}>Login code</label>
            <input value={loginCode} onChange={(e) => setLoginCode(toCode(e.target.value))} placeholder="e.g. capri" className={`${input} font-mono`} />
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
        {codeChanged && restaurant.loginCode && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            Every login of this restaurant will change: <b className="font-mono">sara@{restaurant.loginCode}</b> → <b className="font-mono">sara@{loginCode || '…'}</b>. Tell the staff their new username.
          </div>
        )}
        {codeChanged && !restaurant.loginCode && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
            The existing email logins stay as they are. New users will be <b className="font-mono">name@{loginCode || '…'}</b>.
          </div>
        )}

        {/* the owner forgot the password */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
          <button type="button" onClick={resetPassword} className="flex h-8 items-center gap-1.5 rounded-md border border-slate-300 px-3 font-semibold text-slate-700 hover:bg-slate-100">
            <KeyRound className="h-3.5 w-3.5" /> Reset owner's password
          </button>
          {newPassword && (
            <span className="rounded bg-emerald-50 px-2 py-1 font-mono text-emerald-900">
              {newPassword.username} · {newPassword.password}
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard
                    .writeText(`Your RES POS account\nRestaurant: ${name}\nUsername: ${newPassword.username}\nNew password: ${newPassword.password}\nPlease change it after logging in.`)
                    .then(() => toast.success('Copied', 'Paste it in WhatsApp or an email.'))
                    .catch(() => toast.error('Not copied', 'Copy it by hand.'))
                }
                className="ml-2 inline-flex items-center gap-1 font-sans font-semibold text-emerald-800 underline"
              >
                <Copy className="h-3 w-3" /> copy
              </button>
            </span>
          )}
        </div>
        {newPassword && <div className="mt-1 text-[11px] text-slate-500">Shown only now. The owner changes it after logging in.</div>}

        {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="h-9 rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-100">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="h-9 rounded-md bg-[#131c18] px-4 text-sm font-semibold text-white hover:bg-[#1f2d26] disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Delete a restaurant: type its login code (or name) back to unlock the red button.
function DeleteRestaurantModal({ restaurant, onClose, onDeleted }: { restaurant: RestaurantRow; onClose: () => void; onDeleted: () => void }) {
  const word = restaurant.loginCode || restaurant.name;
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = typed.trim().toLowerCase() === word.trim().toLowerCase();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const remove = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.delete(`/platform/restaurants/${restaurant.id}`, { data: { confirm: typed } });
      const d = res.data?.deleted || {};
      toast.success(`${restaurant.name} deleted`, `${d.orders ?? 0} orders, ${d.users ?? 0} users, ${d.menuItems ?? 0} dishes removed.`);
      onDeleted();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Not deleted. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 lg:pl-60" onMouseDown={() => !busy && onClose()}>
      <div className="w-full max-w-md rounded-xl border-t-[3px] border-t-red-600 bg-white p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <h2 className="text-base font-extrabold text-[#131c18]">Delete {restaurant.name}?</h2>
        </div>
        <p className="text-sm text-slate-700">
          This deletes the restaurant and <b>all its data</b>: {restaurant.orders} orders, {restaurant.users} users, the menu, tables, customers,
          suppliers, stock, the journal and the Z reports. <b>It cannot be undone.</b>
        </p>
        <label className={`${label} mt-4`} htmlFor="delete-confirm">
          To confirm, type <span className="font-mono normal-case text-red-600">{word}</span>
        </label>
        <input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" className={`${input} font-mono`} />
        {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="h-9 rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={remove}
            disabled={!ok || busy}
            className="flex h-9 items-center gap-1.5 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> {busy ? 'Deleting…' : 'Delete for good'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewRestaurantModal({ onClose, onCreated }: { onClose: () => void; onCreated: (i: { restaurant: string; email: string; password: string }) => void }) {
  const [name, setName] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false); // typed by hand: stop suggesting
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('LB');
  const [ownerName, setOwnerName] = useState('');
  const [ownerUsername, setOwnerUsername] = useState('admin');

  // only a–z and 0–9, like the database rule
  const toCode = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  // "Capri Restaurant" → "capri": the first word, until the code is typed by hand
  const onName = (v: string) => {
    setName(v);
    if (!codeTouched) setLoginCode(toCode(v.trim().split(/\s+/)[0] || ''));
  };
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
        restaurant: { name, loginCode, phone, country, currency: c?.currency, timezone: c?.timezone },
        owner: { name: ownerName, username: ownerUsername, password },
      });
      toast.success('Restaurant created', name);
      onCreated({ restaurant: name, email: `${ownerUsername}@${loginCode}`, password });
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
          <div>
            <label className={label}>Name</label>
            <input value={name} onChange={(e) => onName(e.target.value)} className={input} autoFocus />
          </div>
          <div>
            <label className={label}>Login code</label>
            <input
              value={loginCode}
              onChange={(e) => {
                setCodeTouched(true);
                setLoginCode(toCode(e.target.value));
              }}
              placeholder="e.g. capri"
              className={`${input} font-mono`}
            />
            <p className="mt-1 text-[11px] text-slate-500">Short, a–z and 0–9. Fixed once saved.</p>
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
            <label className={label}>Username (login)</label>
            <div className="flex h-9 overflow-hidden rounded-md border border-slate-300 focus-within:border-[#c9a24b]">
              <input
                value={ownerUsername}
                onChange={(e) => setOwnerUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                className="min-w-0 flex-1 bg-white px-2.5 font-mono text-sm outline-none"
              />
              <span className="flex items-center border-l border-slate-300 bg-slate-100 px-2.5 font-mono text-sm text-slate-500">@{loginCode || 'code'}</span>
            </div>
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
        {ownerUsername && loginCode && (
          <div className="mt-3 rounded-md border border-[#c9a24b]/40 bg-[#c9a24b]/10 px-3 py-2 text-xs text-[#5c4214]">
            The owner logs in with <b className="font-mono">{ownerUsername}@{loginCode}</b>
          </div>
        )}
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
