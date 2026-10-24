// client/src/components/Toaster.tsx
//
// Notifications at the TOP RIGHT of the screen (asked 2026-10-25):
//   toast.success('Restaurant info saved')   → green, with a check mark
//   toast.error('Could not save: …')          → red, with a cross
// They disappear by themselves (success after 3.5 s, error after 6 s) or with ✕.
// <Toaster /> is placed ONCE in App.tsx; any screen just imports { toast }.
// (Also meant to replace the browser's alert() pop-ups — V1 cleanup.)

import { useEffect, useState } from 'react';
import { CheckCircle2, X, XCircle } from 'lucide-react';

type Kind = 'success' | 'error';
interface Toast {
  id: number;
  kind: Kind;
  title: string;
  message?: string;
}

// A tiny event bus: toast.*() can be called from anywhere, the Toaster listens.
let nextId = 1;
const listeners = new Set<(t: Toast) => void>();
const push = (kind: Kind, title: string, message?: string) => {
  const t = { id: nextId++, kind, title, message };
  listeners.forEach((l) => l(t));
};

export const toast = {
  success: (title: string, message?: string) => push('success', title, message),
  error: (title: string, message?: string) => push('error', title, message),
};

export default function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (t: Toast) => {
      setItems((list) => [...list.slice(-3), t]); // at most 4 on screen
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), t.kind === 'success' ? 3500 : 6000);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
    };
  }, []);

  const close = (id: number) => setItems((list) => list.filter((x) => x.id !== id));

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[2000] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((t) => {
        const ok = t.kind === 'success';
        return (
          <div
            key={t.id}
            role={ok ? 'status' : 'alert'}
            className={`toast-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-xl ${
              ok ? 'border-emerald-200' : 'border-red-200'
            }`}
            style={{ borderLeft: `5px solid ${ok ? '#059669' : '#dc2626'}` }}
          >
            {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-bold ${ok ? 'text-emerald-800' : 'text-red-700'}`}>{t.title}</div>
              {t.message && <div className="mt-0.5 text-xs text-slate-600">{t.message}</div>}
            </div>
            <button type="button" onClick={() => close(t.id)} className="text-slate-400 hover:text-slate-700" title="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes toast-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
        .toast-in { animation: toast-in 0.2s ease-out; }
      `}</style>
    </div>
  );
}
