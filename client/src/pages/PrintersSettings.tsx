// client/src/pages/PrintersSettings.tsx
//
// Settings → Printers (2026-10-25). Printing goes through the PRINT HELPER only: a
// small Windows program on the restaurant's PC prints directly on the printers (no
// browser, nothing on screen).
//   1. Helpers: add one (its key is shown ONCE, to paste in the helper's config.json),
//      see if it is online 🟢 / offline 🔴, remove it.
//   2. Printers: choose the receipt printer and the cash-drawer printer among the
//      printers the helper reported.
//   3. Tests: print a test page, open the drawer.
//   4. Automatic receipt after each payment (this computer).
//   5. Preview: the receipt exactly as the printer will print it (no printer needed).
// Data: /api/printing …

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Eye, KeyRound, Plus, Printer, RefreshCw, Scissors, Trash2, Vault, Wifi, WifiOff, X } from 'lucide-react';
import { api } from '../api';
import { askConfirm } from '../components/ConfirmHost';
import { toast } from '../components/Toaster';
import ReceiptPreviewModal from '../components/ReceiptPreviewModal';
import { autoPrintEnabled, setAutoPrint } from '../lib/printReceipt';

// One line of the paper, as the server builds it (same builder as the real receipt).
interface PreviewLine {
  text: string;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  big: boolean;
  note?: 'cut' | 'drawer';
}

interface Agent {
  id: number;
  name: string;
  printers: string[];
  online: boolean;
  lastSeenAt: string | null;
}

export default function PrintersSettings() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [receiptPrinter, setReceiptPrinter] = useState('');
  const [drawerPrinter, setDrawerPrinter] = useState(''); // '' = same as the receipt printer
  // kitchen tickets (2026-10-26): each category prints on its own printer (category
  // screen); this one is for categories without a printer
  const [kitchenPrinter, setKitchenPrinter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // which button is working
  const [newName, setNewName] = useState('Cashier PC');
  const [newKey, setNewKey] = useState<string | null>(null); // shown once after "Add helper"
  const [autoPrint, setAutoPrintState] = useState(autoPrintEnabled());
  // Preview: ticket number ('' = last paid order) and the paper to show
  const [previewTicket, setPreviewTicket] = useState('');
  const [paper, setPaper] = useState<{ ticketNo: number; lines: PreviewLine[] } | null>(null);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await api.get('/printing');
      setAgents(res.data.agents || []);
      if (!quiet) {
        setReceiptPrinter(res.data.receiptPrinter || '');
        setDrawerPrinter(res.data.drawerPrinter || '');
        setKitchenPrinter(res.data.kitchenPrinter || '');
      }
    } catch (err: any) {
      if (!quiet) toast.error('Printers not loaded', err?.response?.data?.error || 'Check the server.');
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // the helper's online / offline status refreshes by itself
    const t = setInterval(() => load(true), 5000);
    return () => clearInterval(t);
  }, []);

  // All printer names the helpers reported (a saved name stays in the list even if
  // its helper is offline now).
  const printerNames = useMemo(() => {
    const set = new Set<string>();
    agents.forEach((a) => a.printers.forEach((p) => set.add(p)));
    if (receiptPrinter) set.add(receiptPrinter);
    if (drawerPrinter) set.add(drawerPrinter);
    if (kitchenPrinter) set.add(kitchenPrinter);
    return [...set].sort();
  }, [agents, receiptPrinter, drawerPrinter, kitchenPrinter]);

  const anyOnline = agents.some((a) => a.online);

  // everything on screen, in one save
  const allChoices = () => ({ receiptPrinter, drawerPrinter, kitchenPrinter });

  const save = async () => {
    setBusy('save');
    try {
      await api.put('/printing', allChoices());
      toast.success('Printers saved', receiptPrinter ? `Receipts print on ${receiptPrinter}.` : 'No receipt printer chosen.');
    } catch (err: any) {
      toast.error('Not saved', err?.response?.data?.error || 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const addHelper = async () => {
    setBusy('add');
    try {
      const res = await api.post('/printing/agents', { name: newName });
      setNewKey(res.data.key);
      toast.success('Helper added', 'Copy its key now: it is shown only once.');
      load(true);
    } catch (err: any) {
      toast.error('Helper not added', err?.response?.data?.error || 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const removeHelper = async (a: Agent) => {
    if (!(await askConfirm({ title: 'Remove helper', message: `Remove the helper "${a.name}"? It will stop printing until it gets a new key.`, confirmLabel: 'Remove' }))) return;
    try {
      await api.delete(`/printing/agents/${a.id}`);
      toast.success('Helper removed');
      load(true);
    } catch (err: any) {
      toast.error('Not removed', err?.response?.data?.error || 'Please try again.');
    }
  };

  const testPage = async () => {
    setBusy('test');
    try {
      await api.post('/printing/test', { printer: receiptPrinter });
      toast.success('Test page sent', `Look at ${receiptPrinter}.`);
    } catch (err: any) {
      toast.error('Test page not printed', err?.response?.data?.error || 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const testDrawer = async () => {
    setBusy('drawer');
    try {
      await api.put('/printing', allChoices()); // use what is on screen
      await api.post('/printing/drawer');
      toast.success('Drawer signal sent', 'The drawer should open.');
    } catch (err: any) {
      toast.error('Drawer not opened', err?.response?.data?.error || 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const showPreview = async () => {
    setBusy('preview');
    try {
      const res = await api.post('/printing/preview', previewTicket.trim() ? { ticketNo: Number(previewTicket) } : {});
      setPaper({ ticketNo: res.data.ticketNo, lines: [] });
    } catch (err: any) {
      toast.error('No preview', err?.response?.data?.error || 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const copyKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      toast.success('Key copied', 'Paste it in config.json of the helper.');
    } catch {
      toast.error('Not copied', 'Select the key and copy it by hand.');
    }
  };

  const card = 'rounded-xl border border-slate-200 border-t-[3px] border-t-[#c9a24b] bg-white p-4 shadow-sm';
  const btnDark = 'flex h-9 items-center gap-1.5 rounded-md bg-[#131c18] px-3 text-sm font-semibold text-white hover:bg-[#1f2d26] disabled:opacity-50';
  const btnLight = 'flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50';
  const select = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-[#c9a24b]';

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto bg-slate-50 p-4">
      {/* One-line header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-b-2 border-[#c9a24b] bg-[#131c18] px-4 py-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#c9a24b]">Settings · Printers</div>
          <h1 className="text-lg font-extrabold text-white">Printing</h1>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
            anyOnline ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' : 'border-red-400/50 bg-red-400/10 text-red-300'
          }`}
        >
          {anyOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {anyOnline ? 'Print helper online' : 'Print helper offline'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* 1. Helpers */}
        <div className={card}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-[#131c18]">1 · Print helper</h2>
            <button onClick={() => load()} className="text-slate-400 hover:text-slate-700" title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            A small program on the PC that has the printers. It prints directly — no browser, nothing on screen.
          </p>
          {!agents.length && !loading && <div className="mb-3 rounded-md bg-slate-50 p-3 text-sm text-slate-500">No helper yet. Add one below.</div>}
          <div className="mb-3 space-y-1.5">
            {agents.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
                <span className={`h-2.5 w-2.5 rounded-full ${a.online ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800">{a.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {a.online ? `online · ${a.printers.length} printers` : a.lastSeenAt ? `offline · last seen ${new Date(a.lastSeenAt).toLocaleString('en-GB')}` : 'never connected yet'}
                  </div>
                </div>
                <button onClick={() => removeHelper(a)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remove this helper">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name, e.g. Cashier PC" className={select} />
            <button onClick={addHelper} disabled={busy === 'add'} className={`${btnDark} shrink-0`}>
              <Plus className="h-4 w-4 text-[#c9a24b]" /> Add helper
            </button>
          </div>

          {newKey && (
            <div className="mt-3 rounded-lg border border-[#c9a24b]/50 bg-[#c9a24b]/10 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#8a6d2c]">
                <KeyRound className="h-4 w-4" /> The helper's key — shown only once
              </div>
              <div className="flex gap-2">
                <code className="min-w-0 flex-1 select-all break-all rounded bg-white px-2 py-1.5 font-mono text-xs text-slate-800">{newKey}</code>
                <button onClick={copyKey} className={btnLight}>
                  <Copy className="h-4 w-4" /> Copy
                </button>
              </div>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[11px] text-slate-600">
                <li>In the <b>print-helper</b> folder, copy <b>config.example.json</b> to <b>config.json</b>.</li>
                <li>Paste this key in <b>"key"</b> and save.</li>
                <li>Run <b>install-startup.ps1</b> once: the helper starts now (hidden) and with Windows.</li>
                <li>It turns 🟢 online here within a few seconds.</li>
              </ol>
            </div>
          )}
        </div>

        {/* 2. Printers + 3. tests */}
        <div className={card}>
          <h2 className="mb-2 text-sm font-extrabold text-[#131c18]">2 · Printers</h2>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Receipt printer</label>
          <select value={receiptPrinter} onChange={(e) => setReceiptPrinter(e.target.value)} className={`${select} mb-3`}>
            <option value="">{printerNames.length ? 'Choose the receipt printer…' : 'Connect a helper first'}</option>
            {printerNames.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Cash drawer connected to</label>
          <select value={drawerPrinter} onChange={(e) => setDrawerPrinter(e.target.value)} className={`${select} mb-3`}>
            <option value="">Same as the receipt printer</option>
            {printerNames.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <p className="mb-3 text-[11px] text-slate-500">
            Use a thermal receipt printer (80 mm, ESC/POS). PDF "printers" cannot read printer commands.
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            <button onClick={save} disabled={busy === 'save'} className={btnDark}>
              <CheckCircle2 className="h-4 w-4 text-[#c9a24b]" /> Save
            </button>
          </div>

          <h2 className="mb-2 text-sm font-extrabold text-[#131c18]">3 · Test</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={testPage} disabled={!receiptPrinter || busy === 'test'} className={btnLight}>
              <Printer className="h-4 w-4" /> {busy === 'test' ? 'Printing…' : 'Print test page'}
            </button>
            <button onClick={testDrawer} disabled={!receiptPrinter || busy === 'drawer'} className={btnLight}>
              <Vault className="h-4 w-4" /> {busy === 'drawer' ? 'Opening…' : 'Open drawer'}
            </button>
          </div>

          <h2 className="mb-2 mt-4 text-sm font-extrabold text-[#131c18]">4 · Automatic receipt</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={(e) => {
                setAutoPrint(e.target.checked);
                setAutoPrintState(e.target.checked);
                toast.success(e.target.checked ? 'Automatic receipt ON' : 'Automatic receipt OFF', 'On this computer only.');
              }}
              className="h-4 w-4 accent-[#c9a24b]"
            />
            Print the receipt after each payment <span className="text-slate-400">(this computer)</span>
          </label>

          <h2 className="mb-2 mt-4 text-sm font-extrabold text-[#131c18]">5 · Preview a receipt</h2>
          <p className="mb-2 text-[11px] text-slate-500">Exactly what the printer prints — no printer needed.</p>
          <div className="flex gap-2">
            <input
              value={previewTicket}
              onChange={(e) => setPreviewTicket(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && showPreview()}
              placeholder="Ticket # (empty = last paid)"
              className={select}
            />
            <button onClick={showPreview} disabled={busy === 'preview'} className={`${btnLight} shrink-0`}>
              <Eye className="h-4 w-4" /> Preview
            </button>
          </div>
        </div>

        {/* 6. Kitchen tickets: each category's printer is chosen on the category screen */}
        <div className={card}>
          <h2 className="mb-1 text-sm font-extrabold text-[#131c18]">6 · Kitchen printer</h2>
          <p className="mb-3 text-[11px] text-slate-500">
            When an order is saved, each dish prints on its <b>category's printer</b> (Menu → Categories) — and a CANCEL ticket
            when a dish is removed. Categories without a printer use the default below. Nothing chosen = no kitchen ticket.
          </p>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Default kitchen printer</label>
          <select value={kitchenPrinter} onChange={(e) => setKitchenPrinter(e.target.value)} className={`${select} mb-3`}>
            <option value="">No kitchen printer</option>
            {printerNames.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button onClick={save} disabled={busy === 'save'} className={btnDark}>
            <CheckCircle2 className="h-4 w-4 text-[#c9a24b]" /> Save
          </button>
        </div>
      </div>

      {/* The paper, as printed (shared with the POS) */}
      {paper && <ReceiptPreviewModal ticketNo={paper.ticketNo} onClose={() => setPaper(null)} />}
    </div>
  );
}
