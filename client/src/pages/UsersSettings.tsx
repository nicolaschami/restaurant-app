// client/src/pages/UsersSettings.tsx
//
// Settings → Users (owner only), users & roles 2026-10-26:
//   - the restaurant's users: name, email, role, PIN set?, active / deactivated;
//   - add a user (name, email, password, role, optional 4-digit PIN);
//   - change a role, rename, reset the password, set / remove the PIN,
//     deactivate / reactivate (a deactivated user cannot log in; history is kept).
// The server enforces the rules (you cannot change your own role or deactivate
// yourself; a restaurant keeps at least one active owner; PINs are unique).
//   - POS terminals: the PCs where cashiers log in with their PIN only; remove one
//     (a replaced or stolen PC) and it asks for email + password again.
// Data: /api/users, /api/terminals

import { useEffect, useState } from 'react';
import { KeyRound, Monitor, Plus, RefreshCw, Trash2, UserCheck, UserX, X } from 'lucide-react';
import { forgetTerminal, terminalKey } from '../lib/terminal';
import { api } from '../api';
import { askConfirm } from '../components/ConfirmHost';
import { toast } from '../components/Toaster';
import { ROLE_LABEL, me, type Role } from '../lib/session';

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  hasPin: boolean;
  createdAt: string;
}

const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, incl. users, restaurant info and printers',
  manager: 'Menu, purchases, stock, tables, reports + POS',
  cashier: 'POS, orders, payments, opening cash, Z closing',
};
const ROLE_BADGE: Record<Role, string> = {
  owner: 'bg-[#131c18] text-[#c9a24b]',
  manager: 'bg-[#c9a24b]/20 text-[#8a6d2c]',
  cashier: 'bg-slate-100 text-slate-600',
};

const input = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm outline-none focus:border-[#c9a24b]';

export default function UsersSettings() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [terminals, setTerminals] = useState<Array<{ id: number; name: string; createdAt: string; lastUsedAt: string | null; createdBy: string }>>([]);

  const loadTerminals = () =>
    api
      .get('/terminals')
      .then((res) => setTerminals(res.data.terminals || []))
      .catch(() => {});

  const removeTerminal = async (id: number, name: string) => {
    if (!(await askConfirm({ title: 'Remove POS terminal', message: `Remove "${name}"? Its PIN pad stops working; that PC will ask for email + password again.`, confirmLabel: 'Remove' }))) return;
    try {
      await api.delete(`/terminals/${id}`);
      toast.success('Terminal removed', name);
      loadTerminals();
    } catch (err: any) {
      toast.error('Not removed', err?.response?.data?.error || 'Please try again.');
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      setRows(res.data.users || []);
    } catch (err: any) {
      toast.error('Users not loaded', err?.response?.data?.error || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    loadTerminals();
  }, []);

  const toggleActive = async (u: UserRow) => {
    try {
      await api.patch(`/users/${u.id}`, { isActive: !u.isActive });
      toast.success(u.isActive ? `${u.name} deactivated` : `${u.name} reactivated`, u.isActive ? 'This user can no longer log in.' : 'This user can log in again.');
      load();
    } catch (err: any) {
      toast.error('Not changed', err?.response?.data?.error || 'Please try again.');
    }
  };

  const active = rows.filter((r) => r.isActive).length;

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto bg-slate-50 p-4">
      {/* One-line header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-b-2 border-[#c9a24b] bg-[#131c18] px-4 py-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#c9a24b]">Settings · Users</div>
          <h1 className="text-lg font-extrabold text-white">
            Users <span className="text-sm font-normal text-slate-400">· {active} active of {rows.length}</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={load} title="Refresh" className="flex h-9 items-center rounded-md border border-white/20 px-3 text-white hover:bg-white/10">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setEditing('new')} className="flex h-9 items-center gap-1.5 rounded-md bg-[#c9a24b] px-3 text-sm font-bold text-[#131c18] hover:bg-[#d8b465]">
            <Plus className="h-4 w-4" /> Add user
          </button>
        </div>
      </div>

      {/* Roles, in one line each */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {(['owner', 'manager', 'cashier'] as Role[]).map((r) => (
          <div key={r} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold ${ROLE_BADGE[r]}`}>{ROLE_LABEL[r]}</span>
            {ROLE_HELP[r]}
          </div>
        ))}
      </div>

      {/* The users */}
      <div className="overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[#131c18] text-xs text-white">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Name</th>
              <th className="px-3 py-2 text-left font-semibold">Email</th>
              <th className="px-3 py-2 text-left font-semibold">Role</th>
              <th className="px-3 py-2 text-left font-semibold">PIN</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {!rows.length && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">No user yet.</td>
              </tr>
            )}
            {rows.map((u) => (
              <tr key={u.id} className={`border-b border-slate-100 ${u.isActive ? '' : 'bg-slate-50 text-slate-400'}`}>
                <td className="px-3 py-2 font-semibold text-slate-800">
                  {u.name}
                  {u.id === me?.id && <span className="ml-1.5 text-[11px] font-normal text-[#8a6d2c]">(you)</span>}
                </td>
                <td className="px-3 py-2 text-slate-600">{u.email}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${ROLE_BADGE[u.role]}`}>{ROLE_LABEL[u.role]}</span>
                </td>
                <td className="px-3 py-2 text-xs">{u.hasPin ? <span className="text-emerald-700">● set</span> : <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2 text-xs">
                  {u.isActive ? <span className="font-semibold text-emerald-700">Active</span> : <span className="font-semibold text-red-600">Deactivated</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setEditing(u)} className="h-8 rounded-md border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                      Edit
                    </button>
                    {u.id !== me?.id && (
                      <button
                        onClick={() => toggleActive(u)}
                        title={u.isActive ? 'Deactivate (cannot log in, history kept)' : 'Reactivate'}
                        className={`flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-semibold ${
                          u.isActive ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {u.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* POS terminals: PCs where cashiers log in with their PIN only */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <Monitor className="h-4 w-4 text-[#c9a24b]" />
          <h2 className="text-sm font-extrabold text-[#131c18]">POS terminals</h2>
          <span className="text-xs text-slate-500">
            · PCs where cashiers log in with their PIN only. To add one: on that PC, log in as owner or manager and tick
            "This PC is a POS terminal".
          </span>
        </div>
        {!terminals.length ? (
          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">No POS terminal yet.</div>
        ) : (
          <div className="space-y-1.5">
            {terminals.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <Monitor className="h-4 w-4 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-800">
                    {t.name} #{t.id}
                  </span>
                  <span className="ml-2 text-xs text-slate-500">
                    registered {new Date(t.createdAt).toLocaleDateString('en-GB')}
                    {t.createdBy ? ` by ${t.createdBy}` : ''}
                    {t.lastUsedAt ? ` · last PIN login ${new Date(t.lastUsedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}` : ' · never used yet'}
                  </span>
                </div>
                <button
                  onClick={() => removeTerminal(t.id, `${t.name} #${t.id}`)}
                  className="flex h-8 items-center gap-1 rounded-md border border-red-200 px-2.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
        {terminalKey() && (
          <button
            onClick={() => {
              forgetTerminal();
              toast.success('This PC is a normal login again', 'Remove it from the list too, if it should no longer be a terminal.');
            }}
            className="mt-2 text-xs text-slate-500 underline hover:text-slate-800"
          >
            This PC: stop using the PIN pad
          </button>
        )}
      </div>

      {editing && <UserModal user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- add / edit

function UserModal({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !user;
  const isMe = user?.id === me?.id;
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'cashier');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [removePin, setRemovePin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    setError(null);
    if (pin && !/^\d{4}$/.test(pin)) return setError('The PIN must be 4 digits.');
    setSaving(true);
    try {
      if (isNew) {
        await api.post('/users', { name, email, password, role, pin: pin || undefined });
        toast.success('User added', `${name} · ${ROLE_LABEL[role]}`);
      } else {
        const body: Record<string, unknown> = { name };
        if (!isMe) body.role = role;
        if (password) body.password = password;
        if (removePin) body.pin = '';
        else if (pin) body.pin = pin;
        await api.patch(`/users/${user!.id}`, body);
        toast.success('User saved', name);
      }
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Not saved. Please try again.');
      setSaving(false);
    }
  };

  const label = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 lg:pl-60" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-xl border-t-[3px] border-t-[#c9a24b] bg-white p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-[#131c18]">{isNew ? 'Add user' : `Edit ${user!.name}`}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Close (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={label}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} autoFocus />
          </div>
          <div>
            <label className={label}>Email (login)</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!isNew} className={`${input} disabled:bg-slate-100 disabled:text-slate-500`} />
          </div>
          <div>
            <label className={label}>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isMe} className={`${input} disabled:bg-slate-100`}>
              {(['cashier', 'manager', 'owner'] as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]} — {ROLE_HELP[r]}
                </option>
              ))}
            </select>
            {isMe && <p className="mt-1 text-[11px] text-slate-400">You cannot change your own role.</p>}
          </div>
          <div>
            <label className={label}>{isNew ? 'Password' : 'New password (empty = keep)'}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 6 characters" className={input} />
          </div>
          <div>
            <label className={label}>
              <KeyRound className="mr-1 inline h-3.5 w-3.5" />
              POS PIN (4 digits, for "Switch user") {user?.hasPin && !removePin ? '· set — type a new one to change' : '· optional'}
            </label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              placeholder="e.g. 4821"
              disabled={removePin}
              className={`${input} tracking-[0.4em] disabled:bg-slate-100`}
            />
            {user?.hasPin && (
              <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={removePin} onChange={(e) => setRemovePin(e.target.checked)} className="accent-[#c9a24b]" /> Remove the PIN
              </label>
            )}
          </div>
        </div>

        {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-100">Cancel</button>
          <button onClick={save} disabled={saving} className="h-9 rounded-md bg-[#131c18] px-4 text-sm font-semibold text-white hover:bg-[#1f2d26] disabled:opacity-50">
            {saving ? 'Saving…' : isNew ? 'Add user' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
