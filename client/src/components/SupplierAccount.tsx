// client/src/components/SupplierAccount.tsx
//
// Suppliers › Account (mockup agreed 2026-10-26: https://claude.ai/artifact/VnRMtuuuhYzHemRom4ToBn).
// One supplier's account, in 4 tabs:
//   - Statement : every movement on account 401 with a running balance
//                 (purchase = credit, we owe more; return / payment = debit, we owe less)
//   - Documents : the purchases (GRN) and returns (RP) — click one to open it
//   - Payments  : PAY-0001… with «Void» (reason required; never deletes)
//   - Journal   : the full journal entries (JV) behind those movements
// «New payment» opens the payment window (NewPaymentModal below).
// Data: GET /api/suppliers/:id/account?from=&to=  (the server computes every number)

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Ban, Loader2, Plus, X } from 'lucide-react';
import { api } from '../api';
import { toast } from './Toaster';
import { money } from '../lib/restaurantSettings';
import { PeriodPicker, niceDate } from './ItemMovementView';
import DatePicker from './DatePicker';
import PurchaseTransactionEditModal from '../pages/PurchaseTransactionEditModal';

// ---------------------------------------------------------------- types (as the server sends them)
interface StatementRow {
  entryId: number;
  entryNo: string; // JV-0007
  date: string;
  sourceType: 'PURCHASE' | 'RETURN' | 'SUPPLIER_PAYMENT' | 'OPENING' | 'VOID';
  sourceId: number | null;
  documentNo: string | null;
  description: string | null;
  debit: number;
  credit: number;
  balance: number; // running balance after this line
}
interface DocumentRow {
  id: number;
  number: string;
  type: 'PUR' | 'RP';
  date: string;
  reference: string | null;
  total: number;
  tax: number;
}
interface PaymentRow {
  id: number;
  paymentNo: string;
  paidAt: string;
  method: Method;
  amount: number;
  reference: string | null;
  description: string | null;
  fromCashDrawer: boolean;
  status: 'POSTED' | 'VOIDED';
  voidReason: string | null;
  entryNo: string | null;
  createdBy: string;
}
interface JournalEntry {
  entryId: number;
  entryNo: string;
  date: string;
  sourceType: StatementRow['sourceType'];
  documentNo: string | null;
  description: string | null;
  lines: Array<{ lineNo: number; account: string; accountName: string; debit: number; credit: number }>;
}
interface Account {
  supplier: {
    id: number;
    code: string | null;
    name: string;
    contactPerson: string | null;
    phone: string | null;
    paymentTerms: string | null;
    creditLimit: number;
  };
  balance: number; // today, positive = we owe
  openingBalance: number; // at the start of the period
  closingBalance: number;
  totals: { purchases: number; returns: number; payments: number };
  statement: StatementRow[];
  documents: DocumentRow[];
  payments: PaymentRow[];
  journal: JournalEntry[];
}

type Method = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD';
const METHODS: Array<{ id: Method; label: string; refLabel: string }> = [
  { id: 'CASH', label: 'Cash', refLabel: 'Receipt no. (optional)' },
  { id: 'BANK_TRANSFER', label: 'Bank transfer', refLabel: 'Transfer reference' },
  { id: 'CHEQUE', label: 'Cheque', refLabel: 'Cheque number' },
  { id: 'CARD', label: 'Card', refLabel: 'Card slip / last 4 digits' },
];
const methodLabel = (p: Pick<PaymentRow, 'method' | 'fromCashDrawer'>) =>
  (METHODS.find((m) => m.id === p.method)?.label ?? p.method) +
  (p.method === 'CASH' ? (p.fromCashDrawer ? ' · drawer' : ' · owner') : '');

// ---------------------------------------------------------------- small helpers
const pad = (n: number) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const monthStartISO = () => todayISO().slice(0, 8) + '01';
// 0 → empty cell (a line is a debit OR a credit)
const amountCell = (v: number) => (v ? money(v) : '');
// "We owe" in red/brown, an advance in green
const balanceTone = (v: number) => (v > 0.004 ? 'text-[#9a3412]' : v < -0.004 ? 'text-emerald-700' : 'text-slate-700');
const balanceLabel = (v: number) => (v < -0.004 ? 'Advance paid' : 'We owe');

const ACCOUNT_NAMES: Record<string, string> = {
  '370': '370 Stocks',
  '401': '401 Suppliers',
  '4426': '4426 VAT recoverable',
  '512': '512 Bank',
  '530': '530 Cash drawer (POS)',
  '531': '531 Cash (owner)',
  '890': '890 Opening balances',
};

const th = 'px-3 py-2 text-[11px] font-bold uppercase tracking-wider';
const td = 'px-3 py-2';
const mono = 'font-mono tabular-nums';

// ================================================================= the account screen
export default function SupplierAccount({ supplierId, onBack }: { supplierId: number; onBack: () => void }) {
  const [[from, to], setRange] = useState<[string, string]>([monthStartISO(), todayISO()]);
  const [tab, setTab] = useState<'statement' | 'documents' | 'payments' | 'journal'>('statement');
  const [data, setData] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [toVoid, setToVoid] = useState<PaymentRow | null>(null);
  const [openDoc, setOpenDoc] = useState<{ id: number; kind: 'PUR' | 'RP' } | null>(null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Load (again) when the supplier, the period or reloadKey changes.
  useEffect(() => {
    let alive = true; // ignore an old answer that arrives after a newer request
    setLoading(true);
    api
      .get(`/suppliers/${supplierId}/account`, { params: { from, to } })
      .then((res) => alive && (setData(res.data), setError(null)))
      .catch((err) => alive && setError(err.response?.data?.error || "The supplier's account could not be loaded."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [supplierId, from, to, reloadKey]);

  const counts = useMemo(() => {
    const docs = data?.documents ?? [];
    const pays = (data?.payments ?? []).filter((p) => p.status === 'POSTED');
    return {
      purchases: docs.filter((d) => d.type === 'PUR').length,
      returns: docs.filter((d) => d.type === 'RP').length,
      payments: pays.length,
    };
  }, [data]);

  const s = data?.supplier;
  const sumDebit = (data?.statement ?? []).reduce((t, r) => t + r.debit, 0);
  const sumCredit = (data?.statement ?? []).reduce((t, r) => t + r.credit, 0);

  // A document number in the statement / journal: purchases and returns open their screen.
  const openSource = (r: { sourceType: StatementRow['sourceType']; sourceId?: number | null }) => {
    if ((r.sourceType === 'PURCHASE' || r.sourceType === 'RETURN') && r.sourceId) {
      setOpenDoc({ id: r.sourceId, kind: r.sourceType === 'RETURN' ? 'RP' : 'PUR' });
    } else if (r.sourceType === 'SUPPLIER_PAYMENT' || r.sourceType === 'VOID') {
      setTab('payments');
    }
  };

  return (
    <div className="min-h-full bg-[#f4f2ec] p-3 sm:p-5">
      <div className="mx-auto max-w-7xl space-y-3">
        {/* header: one line */}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-white" aria-label="Back to suppliers">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Suppliers › Account</div>
            <h1 className="truncate text-lg font-extrabold text-[#131c18]">
              {s?.name ?? '…'} <span className="font-mono text-sm font-semibold text-[#8a6420]">{s?.code}</span>
              <span className="ml-2 text-xs font-normal text-slate-500">
                {[s?.contactPerson, s?.phone, s?.paymentTerms && `Terms ${s.paymentTerms}`].filter(Boolean).join(' · ')}
              </span>
            </h1>
          </div>
          <PeriodPicker from={from} to={to} onChange={setRange} />
          <button
            onClick={() => setPayOpen(true)}
            disabled={!data}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#131c18] px-3 text-xs font-bold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4 text-[#c9a24b]" /> New payment
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-600">{error}</div>}

        {/* KPIs */}
        {data && (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Kpi label={balanceLabel(data.balance)} value={money(Math.abs(data.balance))} sub="today · Σ credit − Σ debit" tone={balanceTone(data.balance)} />
            <Kpi
              label="Purchases (period)"
              value={money(data.totals.purchases - data.totals.returns)}
              sub={`${counts.purchases} purchases · ${counts.returns} returns`}
            />
            <Kpi label="Paid (period)" value={money(data.totals.payments)} sub={`${counts.payments} payment${counts.payments === 1 ? '' : 's'}`} />
            <Kpi
              label="Credit limit"
              value={data.supplier.creditLimit ? money(data.supplier.creditLimit) : '—'}
              sub={
                !data.supplier.creditLimit
                  ? 'no limit set'
                  : data.balance > data.supplier.creditLimit
                    ? `over the limit by ${money(data.balance - data.supplier.creditLimit)}`
                    : `${money(data.supplier.creditLimit - Math.max(data.balance, 0))} still available`
              }
              tone={data.supplier.creditLimit && data.balance > data.supplier.creditLimit ? 'text-[#9a3412]' : undefined}
            />
          </div>
        )}

        {/* tabs */}
        <div role="tablist" className="flex flex-wrap gap-1">
          {(
            [
              ['statement', 'Statement'],
              ['documents', `Documents (${data?.documents.length ?? 0})`],
              ['payments', `Payments (${data?.payments.length ?? 0})`],
              ['journal', 'Journal (JV)'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                tab === id ? 'bg-[#131c18] text-[#e6cf8f]' : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
          {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin self-center text-[#c9a24b]" />}
        </div>

        {/* ===== STATEMENT ===== */}
        {data && tab === 'statement' && (
          <Card note="Purchase = credit (we owe more) · Return / payment = debit (we owe less)">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-[#131c18] text-left text-[#f3ead6]">
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Document</th>
                  <th className={th}>Description</th>
                  <th className={`${th} text-right`}>Debit</th>
                  <th className={`${th} text-right`}>Credit</th>
                  <th className={`${th} text-right`}>Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="text-slate-500">
                  <td className={td}>{niceDate(from)}</td>
                  <td className={td}>—</td>
                  <td className={td}>Balance at the start of the period</td>
                  <td className={td} />
                  <td className={td} />
                  <td className={`${td} ${mono} text-right`}>{money(data.openingBalance)}</td>
                </tr>
                {data.statement.map((r) => (
                  <tr key={r.entryId} className={r.sourceType === 'VOID' ? 'bg-slate-50 text-slate-500' : ''}>
                    <td className={td}>{niceDate(r.date)}</td>
                    <td className={td}>
                      <button onClick={() => openSource(r)} className="font-mono font-semibold text-[#8a6420] hover:underline">
                        {r.documentNo || r.entryNo}
                      </button>
                    </td>
                    <td className={td}>{r.description}</td>
                    <td className={`${td} ${mono} text-right`}>{amountCell(r.debit)}</td>
                    <td className={`${td} ${mono} text-right`}>{amountCell(r.credit)}</td>
                    <td className={`${td} ${mono} text-right font-bold ${balanceTone(r.balance)}`}>{money(r.balance)}</td>
                  </tr>
                ))}
                {data.statement.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">No movement in this period.</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-[#faf7ef] font-bold">
                  <td className={td} colSpan={3}>Totals of the period</td>
                  <td className={`${td} ${mono} text-right`}>{money(sumDebit)}</td>
                  <td className={`${td} ${mono} text-right`}>{money(sumCredit)}</td>
                  <td className={`${td} ${mono} text-right ${balanceTone(data.closingBalance)}`}>{money(data.closingBalance)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        )}

        {/* ===== DOCUMENTS ===== */}
        {data && tab === 'documents' && (
          <Card note="Payments are made on account: they lower the supplier's balance, not one invoice.">
            <table className="w-full min-w-[620px] text-xs">
              <thead className="bg-[#131c18] text-left text-[#f3ead6]">
                <tr>
                  <th className={th}>Document</th>
                  <th className={th}>Date</th>
                  <th className={th}>Reference</th>
                  <th className={th}>Type</th>
                  <th className={`${th} text-right`}>Tax</th>
                  <th className={`${th} text-right`}>Net total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.documents.map((d) => (
                  <tr key={d.id} className="hover:bg-[#faf7ef]">
                    <td className={td}>
                      <button onClick={() => setOpenDoc({ id: d.id, kind: d.type })} className="font-mono font-semibold text-[#8a6420] hover:underline">
                        {d.number}
                      </button>
                    </td>
                    <td className={td}>{niceDate(d.date)}</td>
                    <td className={td}>{d.reference || '—'}</td>
                    <td className={td}>
                      {d.type === 'RP' ? (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">Return</span>
                      ) : (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800">Purchase</span>
                      )}
                    </td>
                    <td className={`${td} ${mono} text-right`}>{money(d.tax)}</td>
                    <td className={`${td} ${mono} text-right font-semibold ${d.type === 'RP' ? 'text-red-700' : ''}`}>
                      {d.type === 'RP' ? '−' : ''}
                      {money(d.total)}
                    </td>
                  </tr>
                ))}
                {data.documents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">No purchase or return in this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        )}

        {/* ===== PAYMENTS ===== */}
        {data && tab === 'payments' && (
          <Card note="«Void» never deletes: it adds an opposite journal entry, so the history stays complete.">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="bg-[#131c18] text-left text-[#f3ead6]">
                <tr>
                  <th className={th}>Payment</th>
                  <th className={th}>Date</th>
                  <th className={th}>Method</th>
                  <th className={th}>Reference</th>
                  <th className={th}>Description</th>
                  <th className={`${th} text-right`}>Amount</th>
                  <th className={th}>Status</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.payments.map((p) => (
                  <tr key={p.id} className={p.status === 'VOIDED' ? 'text-slate-400' : ''}>
                    <td className={`${td} font-mono font-semibold text-[#8a6420]`}>{p.paymentNo}</td>
                    <td className={td}>{niceDate(p.paidAt)}</td>
                    <td className={td}>{methodLabel(p)}</td>
                    <td className={td}>{p.reference || '—'}</td>
                    <td className={td}>
                      {p.description || '—'}
                      {p.status === 'VOIDED' && p.voidReason && <div className="text-[10px] text-red-600">Voided: {p.voidReason}</div>}
                    </td>
                    <td className={`${td} ${mono} text-right font-bold ${p.status === 'VOIDED' ? 'line-through' : ''}`}>{money(p.amount)}</td>
                    <td className={td}>
                      {p.status === 'POSTED' ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Posted</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Voided</span>
                      )}
                    </td>
                    <td className={`${td} text-right`}>
                      {p.status === 'POSTED' && (
                        <button
                          onClick={() => setToVoid(p)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                        >
                          <Ban className="h-3 w-3" /> Void
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {data.payments.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-400">No payment in this period. Use «New payment» at the top.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        )}

        {/* ===== JOURNAL ===== */}
        {data && tab === 'journal' && (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-500">
              Every document writes one balanced journal entry (Σ debit = Σ credit). The database refuses an unbalanced one.
            </p>
            {data.journal.map((j) => {
              const d = j.lines.reduce((t, l) => t + l.debit, 0);
              const c = j.lines.reduce((t, l) => t + l.credit, 0);
              return (
                <div key={j.entryId} className="overflow-hidden rounded-xl border border-[#e4dfd2] bg-white">
                  <div className="flex flex-wrap items-center gap-2 border-b border-[#eee9dc] bg-[#faf7ef] px-3 py-1.5 text-xs">
                    <span className="font-mono font-bold text-[#131c18]">{j.entryNo}</span>
                    <span className="text-slate-500">
                      {niceDate(j.date)} · {j.documentNo || '—'} · {j.description}
                    </span>
                    <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      {Math.round(d * 100) === Math.round(c * 100) ? 'Balanced ✓' : 'Not balanced'}
                    </span>
                  </div>
                  {j.lines.map((l) => (
                    <div key={l.lineNo} className="grid grid-cols-[3fr_1fr_1fr] gap-2 border-b border-slate-50 px-3 py-1 text-xs last:border-0">
                      {/* credits are indented, like in an accounting journal */}
                      <span className={l.credit ? 'pl-6 text-slate-600' : 'font-semibold'}>{ACCOUNT_NAMES[l.account] ?? `${l.account} ${l.accountName}`}</span>
                      <span className={`${mono} text-right`}>{amountCell(l.debit)}</span>
                      <span className={`${mono} text-right`}>{amountCell(l.credit)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            {data.journal.length === 0 && <div className="rounded-xl bg-white p-6 text-center text-xs text-slate-400">No journal entry in this period.</div>}
          </div>
        )}
      </div>

      {payOpen && data && (
        <NewPaymentModal
          supplier={data.supplier}
          balance={data.balance}
          onClose={() => setPayOpen(false)}
          onSaved={() => {
            setPayOpen(false);
            setTab('payments');
            reload();
          }}
        />
      )}
      {toVoid && (
        <VoidPaymentModal
          payment={toVoid}
          onClose={() => setToVoid(null)}
          onDone={() => {
            setToVoid(null);
            reload();
          }}
        />
      )}
      {openDoc && (
        <PurchaseTransactionEditModal transactionId={openDoc.id} kind={openDoc.kind} onClose={() => setOpenDoc(null)} onSaved={reload} />
      )}
    </div>
  );
}

const Kpi = ({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) => (
  <div className="rounded-xl border border-[#e4dfd2] bg-white px-3 py-2">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`font-mono text-lg font-bold ${tone ?? 'text-[#131c18]'}`}>{value}</div>
    <div className="text-[10px] text-slate-500">{sub}</div>
  </div>
);

const Card = ({ note, children }: { note?: string; children: ReactNode }) => (
  <section className="overflow-hidden rounded-xl border border-[#e4dfd2] bg-white">
    <div className="overflow-x-auto">{children}</div>
    {note && <div className="bg-[#faf7ef] px-3 py-1.5 text-[11px] text-slate-500">{note}</div>}
  </section>
);

// Esc closes a pop-up.
function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

// ================================================================= New payment
function NewPaymentModal({
  supplier,
  balance,
  onClose,
  onSaved,
}: {
  supplier: Account['supplier'];
  balance: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nextNo, setNextNo] = useState('PAY-…');
  const [method, setMethod] = useState<Method>('CASH');
  // "Today" of the RESTAURANT (its time zone, sent by the server), not of this PC:
  // just after midnight the two can differ, and the server refuses a future date.
  const [today, setToday] = useState(todayISO());
  const [paidAt, setPaidAt] = useState(todayISO());
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState(''); // empty by default (agreed): the user types it
  const [description, setDescription] = useState('');
  const [fromDrawer, setFromDrawer] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);

  useEffect(() => {
    api
      .get('/supplier-payments/next-number')
      .then((r) => {
        setNextNo(r.data.paymentNo);
        if (r.data.today) {
          setToday(r.data.today);
          setPaidAt(r.data.today);
        }
      })
      .catch(() => {});
  }, []);

  const value = Number(amount.replace(',', '.'));
  const valid = amount.trim() !== '' && Number.isFinite(value) && value > 0;
  const after = balance - (valid ? value : 0);
  const drawer = method === 'CASH' && fromDrawer;
  const creditAccount = method === 'CASH' ? (drawer ? '530' : '531') : '512';

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post('/supplier-payments', {
        supplierId: supplier.id,
        method,
        paidAt,
        amount: Math.round(value * 100) / 100,
        reference: reference.trim() || undefined,
        description: description.trim() || undefined,
        fromCashDrawer: drawer,
      });
      toast.success(`Payment ${res.data.paymentNo} saved — journal entry ${res.data.entryNo}`);
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error || 'The payment could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const label = 'text-[10px] font-bold uppercase tracking-wider text-slate-600';
  const input = 'h-9 w-full rounded-lg border border-[#ddd6c6] px-2 text-sm outline-none focus:border-[#c9a24b]';

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#131c18]/55 p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="New payment" className="max-h-full w-full max-w-lg overflow-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 bg-[#131c18] px-4 py-2.5 text-white">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#c9a24b]">Supplier payment</div>
            <div className="truncate text-sm font-extrabold">New payment · {supplier.name}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm font-bold text-[#e6cf8f]">{nextNo}</div>
            <div className="text-[9px] text-slate-400">next number</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between rounded-lg bg-[#faf7ef] px-3 py-1.5 text-xs">
            <span>{balance < -0.004 ? 'Advance already paid' : 'Balance due today'}</span>
            <span className={`font-mono font-bold ${balanceTone(balance)}`}>{money(Math.abs(balance))}</span>
          </div>

          <div>
            <div className={label}>Method</div>
            <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`h-9 rounded-lg border text-xs font-semibold ${
                    method === m.id ? 'border-[#131c18] bg-[#131c18] text-[#e6cf8f]' : 'border-[#ddd6c6] bg-white text-slate-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* a <div>, not a <label>: a label would pass clicks inside the calendar to its button */}
            <div>
              <span className={label}>Date</span>
              {/* today or earlier (the server checks it too) */}
              <div className="mt-0.5">
                <DatePicker value={paidAt} onChange={setPaidAt} max={today} today={today} />
              </div>
            </div>
            <label className="block">
              <span className={label}>{METHODS.find((m) => m.id === method)?.refLabel}</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} className={input} />
            </label>
          </div>

          <div>
            <span className={label}>Amount</span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                autoFocus
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                className="h-10 w-36 rounded-lg border-2 border-[#c9a24b] px-2 font-mono text-base font-bold outline-none"
              />
              {balance > 0.004 && (
                <button onClick={() => setAmount(balance.toFixed(2))} className="h-8 rounded-lg border border-[#ddd6c6] px-2 text-xs font-semibold hover:bg-[#faf7ef]">
                  Full balance {money(balance)}
                </button>
              )}
            </div>
            {valid && (
              <div className={`mt-1 text-xs font-semibold ${balanceTone(after)}`}>
                {after < -0.004 ? `Balance after: advance of ${money(-after)}` : `Balance after: ${money(after)}`}
              </div>
            )}
          </div>

          <label className="block">
            <span className={label}>Description</span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              placeholder="e.g. October invoices INV-5521 and 5588"
              className="mt-1 w-full resize-y rounded-lg border border-[#ddd6c6] px-2 py-1.5 text-sm outline-none focus:border-[#c9a24b]"
            />
          </label>

          {method === 'CASH' && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#ead7a3] bg-[#fff8e6] px-3 py-2 text-xs">
              <input type="checkbox" checked={fromDrawer} onChange={(e) => setFromDrawer(e.target.checked)} className="h-4 w-4 accent-[#8a6420]" />
              Cash taken from the POS drawer <span className="text-[#5f4512]">(the Z subtracts it from the expected cash)</span>
            </label>
          )}

          {/* what will be written in the journal */}
          <div className="overflow-hidden rounded-lg border border-dashed border-[#d7cfbd] text-xs">
            <div className="bg-[#faf7ef] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">Journal entry that will be created</div>
            <div className="grid grid-cols-[3fr_1fr_1fr] gap-2 border-t border-slate-100 px-3 py-1">
              <span className="font-semibold">401 Suppliers · {supplier.name}</span>
              <span className={`${mono} text-right`}>{valid ? money(value) : '—'}</span>
              <span />
            </div>
            <div className="grid grid-cols-[3fr_1fr_1fr] gap-2 border-t border-slate-100 px-3 py-1">
              <span className="pl-6 text-slate-600">{ACCOUNT_NAMES[creditAccount]}</span>
              <span />
              <span className={`${mono} text-right`}>{valid ? money(value) : '—'}</span>
            </div>
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600">{error}</div>}

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="h-9 rounded-lg border border-[#ddd6c6] px-4 text-xs font-semibold">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!valid || saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#131c18] px-4 text-xs font-bold text-white disabled:opacity-40"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save payment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================================================= Void
function VoidPaymentModal({ payment, onClose, onDone }: { payment: PaymentRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);

  const confirm = async () => {
    if (!reason.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post(`/supplier-payments/${payment.id}/void`, { reason: reason.trim() });
      toast.success(`Payment ${res.data.paymentNo} voided — reversing entry ${res.data.entryNo}`);
      onDone();
    } catch (err: any) {
      setError(err.response?.data?.error || 'The payment could not be voided.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#131c18]/55 p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Void payment" className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-4 shadow-2xl">
        <div className="text-sm font-extrabold text-[#131c18]">
          Void {payment.paymentNo} · {money(payment.amount)}
        </div>
        <p className="text-xs text-slate-500">
          Nothing is deleted: an opposite journal entry is added today and the supplier's balance goes back up by {money(payment.amount)}.
        </p>
        <textarea
          autoFocus
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="Why is this payment voided? (required)"
          className="w-full rounded-lg border border-[#ddd6c6] px-2 py-1.5 text-sm outline-none focus:border-[#c9a24b]"
        />
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 rounded-lg border border-[#ddd6c6] px-4 text-xs font-semibold">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!reason.trim() || saving}
            className="h-9 rounded-lg bg-red-700 px-4 text-xs font-bold text-white disabled:opacity-40"
          >
            Void payment
          </button>
        </div>
      </div>
    </div>
  );
}
