// client/src/components/ConfirmHost.tsx
//
// askConfirm() — the app's own "Are you sure?" box instead of the browser's grey
// window.confirm() pop-up (2026-10-26). Works like toast: any screen can call it.
//
//   if (!(await askConfirm({ title: 'Delete table', message: 'Delete T5?' }))) return;
//
// <ConfirmHost /> is placed ONCE (main.tsx, next to the Toaster) and shows the shared
// ConfirmModal; the promise answers true (confirmed) or false (cancelled).

import { useEffect, useState } from 'react';
import ConfirmModal from './ConfirmModal';

interface Ask {
  title: string;
  message: string;
  confirmLabel?: string; // default "Delete"
  isDanger?: boolean; // default true (red)
}

// A tiny event bus, like the Toaster's.
let show: ((a: Ask, answer: (ok: boolean) => void) => void) | null = null;

export function askConfirm(a: Ask): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(window.confirm(a.message)); // host not mounted (should not happen)
    show(a, resolve);
  });
}

export default function ConfirmHost() {
  const [current, setCurrent] = useState<{ ask: Ask; answer: (ok: boolean) => void } | null>(null);

  useEffect(() => {
    show = (ask, answer) => setCurrent({ ask, answer });
    return () => {
      show = null;
    };
  }, []);

  const close = (ok: boolean) => {
    current?.answer(ok);
    setCurrent(null);
  };

  return (
    <ConfirmModal
      isOpen={Boolean(current)}
      title={current?.ask.title ?? ''}
      message={current?.ask.message ?? ''}
      confirmLabel={current?.ask.confirmLabel ?? 'Delete'}
      isDanger={current?.ask.isDanger ?? true}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );
}
