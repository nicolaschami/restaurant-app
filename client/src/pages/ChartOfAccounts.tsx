// client/src/pages/ChartOfAccounts.tsx
//
// Settings → Chart of Accounts (asked 2026-10-28, like the user's tblaccount): the
// restaurant's accounts as a TREE — 4 Third parties → 40 → 401 → 4011 → 40110001 Fresh Farms.
//   - Bold = a group (adds up what is under it; nothing is booked on it directly).
//   - Supplier accounts (under 4011) are made by RES when the supplier is created:
//     they show a «Supplier» badge and follow its name.
//   - The owner adds accounts under a group (e.g. more expenses under 61), renames
//     them, makes them inactive, and deletes those never used. Managers only look.
// Data: GET/POST/PUT/DELETE /api/accounts (server: src/routes/accounts.ts)

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileSpreadsheet, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { toast } from '../components/Toaster';
import { askConfirm } from '../components/ConfirmHost';
import { hasRole } from '../lib/session';
import { ancestors, treeOrder } from '../lib/accountTree';

interface Account {
  code: string;
  name: string;
  kind: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  parentCode: string | null;
  isGroup: boolean;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  linkedTo: 'supplier' | null;
  lines: number; // journal lines booked on it
}

const KIND_LABEL: Record<Account['kind'], string> = {
  ASSET: 'Asset',
  LIABILITY: 'Liability',
  EQUITY: 'Equity',
  INCOME: 'Income',
  EXPENSE: 'Expense',
};
const KIND_TONE: Record<Account['kind'], string> = {
  ASSET: 'bg-sky-50 text-sky-700',
  LIABILITY: 'bg-orange-50 text-orange-700',
  EQUITY: 'bg-violet-50 text-violet-700',
  INCOME: 'bg-emerald-50 text-emerald-700',
  EXPENSE: 'bg-rose-50 text-rose-700',
};
const errorOf = (err: any, fallback: string) => err?.response?.data?.error || fallback;

export default function ChartOfAccounts() {
  const [rows, setRows] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{ mode: 'new'; parent: string } | { mode: 'edit'; account: Account } | null>(null);
  const canEdit = hasRole('owner');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/accounts');
      setRows(res.data.accounts || []);
    } catch (err) {
      setError(errorOf(err, 'The chart of accounts could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const tree = useMemo(() => treeOrder(rows), [rows]);

  // Searching shows the matching accounts with every group above them.
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      const keep = new Set<string>();
      for (const r of rows) {
        if (r.code.startsWith(q) || r.name.toLowerCase().includes(q)) {
          keep.add(r.code);
          ancestors(rows, r.code).forEach((a) => keep.add(a));
        }
      }
      return tree.filter((r) => keep.has(r.code));
    }
    const out: typeof tree = [];
    let hideBelow = Infinity;
    for (const r of tree) {
      if (r.level > hideBelow) continue;
      hideBelow = Infinity;
      out.push(r);
      if (r.isGroup && closed.has(r.code)) hideBelow = r.level;
    }
    return out;
  }, [tree, rows, search, closed]);

  const childCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.parentCode) m.set(r.parentCode, (m.get(r.parentCode) ?? 0) + 1);
    return m;
  }, [rows]);

  const toggle = (code: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  // "Classes only" closes every group; "Open all" opens them
  const closeAll = () => setClosed(new Set(rows.filter((r) => r.isGroup).map((r) => r.code)));

  const remove = async (a: Account) => {
    if (!(await askConfirm({ title: 'Delete account', message: `Delete ${a.code} ${a.name}?` }))) return;
    try {
      await api.delete(`/accounts/${a.code}`);
      toast.success('Account deleted', `${a.code} ${a.name}`);
      load();
    } catch (err) {
      toast.error('Not deleted', errorOf(err, 'The account could not be deleted.'));
    }
  };

  const exportExcel = () => {
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const out = [
      ['Code', 'Name', 'Parent', 'Group', 'Type', 'Linked to', 'Active', 'Description'],
      ...tree.map((r) => [r.code, r.name, r.parentCode ?? '', r.isGroup ? 'Y' : 'N', KIND_LABEL[r.kind], r.linkedTo ?? '', r.isActive ? 'Y' : 'N', r.description ?? '']),
    ];
    const csv = '﻿' + out.map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chart-of-accounts.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const groups = rows.filter((r) => r.isGroup).length;

  return (
    <div className="flex h-full flex-col gap-3 bg-slate-50 p-4">
      {/* One-line header */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-bold text-slate-800">
          Chart of Accounts
          <span className="ml-2 text-xs font-normal text-slate-500">
            {rows.length} accounts · {groups} groups
          </span>
        </h1>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code or name…"
            className="h-9 w-48 rounded-md border border-slate-300 bg-white pl-8 pr-2 text-sm focus:border-[#c9a24b] focus:outline-none"
          />
        </div>
        <button onClick={() => setClosed(new Set())} className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-100">
          Open all
        </button>
        <button onClick={closeAll} className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-100">
          Classes only
        </button>
        <button onClick={load} title="Refresh" className="flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={exportExcel} disabled={!rows.length} title="Export to Excel" className="flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">
          <FileSpreadsheet className="h-4 w-4" />
        </button>
        {canEdit && (
          <button
            onClick={() => setForm({ mode: 'new', parent: '' })}
            className="flex h-9 items-center gap-1.5 rounded-md bg-[#131c18] px-3 text-sm font-medium text-white hover:bg-[#1f2d26]"
          >
            <Plus className="h-4 w-4 text-[#c9a24b]" /> New account
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div className="p-6 text-center text-sm text-red-600">{error}</div>
        ) : loading && !rows.length ? (
          <div className="p-6 text-center text-sm text-slate-500">Loading…</div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10 bg-[#131c18] text-xs text-white">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Account</th>
                <th className="px-3 py-2 text-left font-semibold">Type</th>
                <th className="px-3 py-2 text-left font-semibold">Linked to</th>
                <th className="px-3 py-2 text-right font-semibold">Entries</th>
                <th className="w-24 px-3 py-2 text-right font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const open = !closed.has(r.code) || !!search.trim();
                const kids = childCount.get(r.code) ?? 0;
                return (
                  <tr key={r.code} className={`group border-b border-slate-100 ${r.isGroup ? 'bg-[#f6f1e4]/70 font-semibold' : 'hover:bg-slate-50'} ${r.isActive ? '' : 'opacity-50'}`}>
                    <td className="py-1.5 pr-3" style={{ paddingLeft: 8 + (r.level - 1) * 16 }}>
                      <span className="inline-flex w-4 justify-center align-middle">
                        {r.isGroup && kids > 0 && (
                          <button onClick={() => toggle(r.code)} className="rounded text-slate-500 hover:bg-slate-200" title={open ? 'Close' : 'Open'}>
                            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </span>
                      <span className="font-mono text-xs font-semibold text-[#8a6d2c]">{r.code}</span>{' '}
                      <span className="text-slate-800">{r.name}</span>
                      {r.isGroup && kids > 0 && <span className="ml-1 text-[11px] font-normal text-slate-400">· {kids}</span>}
                      {!r.isActive && <span className="ml-1.5 rounded bg-slate-200 px-1 text-[10px] font-normal text-slate-600">inactive</span>}
                      {r.description && <span className="ml-1.5 text-[11px] font-normal text-slate-400">— {r.description}</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${KIND_TONE[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
                    </td>
                    <td className="px-3 py-1.5 text-xs font-normal">
                      {r.linkedTo && (
                        <span className="rounded bg-[#c9a24b]/15 px-1.5 py-0.5 font-semibold text-[#8a6420]">
                          Supplier
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs font-normal tabular-nums text-slate-500">{r.isGroup ? '' : r.lines || ''}</td>
                    <td className="px-3 py-1.5 text-right">
                      {canEdit && (
                        <span className="inline-flex gap-0.5 opacity-60 group-hover:opacity-100">
                          {r.isGroup && (
                            <button onClick={() => setForm({ mode: 'new', parent: r.code })} title={`New account under ${r.code}`} className="rounded p-1 text-slate-600 hover:bg-[#c9a24b]/20">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => setForm({ mode: 'edit', account: r })} title="Edit" className="rounded p-1 text-slate-600 hover:bg-slate-200">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {!r.isSystem && !r.linkedTo && !r.lines && !kids && (
                            <button onClick={() => remove(r)} title="Delete" className="rounded p-1 text-red-600 hover:bg-red-50">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!shown.length && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-slate-500">No account matches.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        Bold = a group: it adds up the accounts under it. Each supplier gets its own account under 4011
        automatically. {canEdit ? 'Use + on a group to add an account under it.' : 'Only the owner can change the chart.'}
      </p>

      {form && (
        <AccountForm
          rows={rows}
          form={form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// ================================================================= new / edit window

function AccountForm({
  rows,
  form,
  onClose,
  onSaved,
}: {
  rows: Account[];
  form: { mode: 'new'; parent: string } | { mode: 'edit'; account: Account };
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = form.mode === 'edit' ? form.account : null;
  const [parent, setParent] = useState(editing ? editing.parentCode ?? '' : form.mode === 'new' ? form.parent : '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [isGroup, setIsGroup] = useState(editing?.isGroup ?? false);
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [description, setDescription] = useState(editing?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => treeOrder(rows.filter((r) => r.isGroup)), [rows]);
  const parentRow = rows.find((r) => r.code === parent);
  const followsLink = !!editing?.linkedTo;

  // a new account: propose the next free code under the chosen group
  useEffect(() => {
    if (editing || !parent) return;
    let stop = false;
    api
      .get('/accounts/next-code', { params: { parent } })
      .then((res) => !stop && setCode(res.data.code || parent))
      .catch(() => !stop && setCode(parent));
    return () => {
      stop = true;
    };
  }, [parent, editing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.put(`/accounts/${editing.code}`, { name, description, isActive, isGroup });
        toast.success('Account saved', `${editing.code} ${name}`);
      } else {
        await api.post('/accounts', { code: code.trim(), name, parentCode: parent, isGroup, description });
        toast.success('Account added', `${code} ${name}`);
      }
      onSaved();
    } catch (err) {
      setError(errorOf(err, 'The account could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const input = 'h-9 w-full rounded-md border border-slate-300 px-2 text-sm focus:border-[#c9a24b] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500';
  const label = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between rounded-t-xl bg-[#131c18] px-4 py-2.5 text-white">
          <h2 className="text-sm font-bold">{editing ? `Edit ${editing.code}` : 'New account'}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-white/10" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <label className={label}>Under the group</label>
            <select value={parent} onChange={(e) => setParent(e.target.value)} disabled={!!editing} className={input}>
              <option value="">Choose a group…</option>
              {groups.map((g) => (
                <option key={g.code} value={g.code}>
                  {' '.repeat((g.level - 1) * 3)}
                  {g.code} {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={label}>Code</label>
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} disabled={!!editing} className={`${input} font-mono`} />
            </div>
            <div className="col-span-2">
              <label className={label}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={followsLink} autoFocus className={input} />
            </div>
          </div>
          {followsLink && (
            <p className="-mt-1 text-[11px] text-slate-500">
              This account follows its {editing!.linkedTo}: rename the {editing!.linkedTo} and the account follows.
            </p>
          )}
          {!editing && parentRow && (
            <p className="-mt-1 text-[11px] text-slate-500">
              The code starts with {parentRow.code}. Type: {KIND_LABEL[parentRow.kind]} (like its group).
            </p>
          )}
          <div>
            <label className={label}>Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={input} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-700">
            {!editing?.isSystem && !editing?.linkedTo && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} className="accent-[#131c18]" />
                Group (other accounts go under it)
              </label>
            )}
            {editing && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-[#131c18]" />
                Active
              </label>
            )}
          </div>
          {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button onClick={onClose} className="h-9 rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim() || (!editing && (!parent || !code))}
            className="flex h-9 items-center gap-1.5 rounded-md bg-[#131c18] px-4 text-sm font-semibold text-white hover:bg-[#1f2d26] disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
