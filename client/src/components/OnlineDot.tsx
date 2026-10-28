// client/src/components/OnlineDot.tsx
//
// Offline POS (agreed with the user 2026-10-28): a SMALL circle in the POS header —
// green = online, red = offline (no internet: RES Local on this PC answers).
// It asks RES Local's status page every 5 s. When the POS is opened directly on the
// VPS (not through RES Local, http://localhost:3901) there is no status page: nothing shows.

import { useEffect, useState } from 'react';

interface LocalStatus {
  online: boolean;
  waiting?: number; // orders taken offline, not sent yet (step 3b)
}

export default function OnlineDot() {
  const [status, setStatus] = useState<LocalStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch('/local/status', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => alive && setStatus(s && typeof s.online === 'boolean' ? s : null))
        .catch(() => alive && setStatus(null));
    check();
    const t = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!status) return null;
  const waiting = status.waiting ?? 0;
  const label = status.online ? (waiting ? `Online · sending ${waiting}` : 'Online') : `Offline${waiting ? ` · ${waiting} waiting` : ''}`;
  return (
    <span
      title={status.online ? 'Connected to the server' : 'No internet: working on RES Local (this PC). Selling, payments and printing keep working.'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 12, fontSize: 12, background: 'rgba(127,127,127,0.12)' }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          background: status.online ? '#3fbf6f' : '#e5483b',
          boxShadow: `0 0 0 2px ${status.online ? 'rgba(63,191,111,0.35)' : 'rgba(229,72,59,0.35)'}`,
        }}
      />
      {label}
    </span>
  );
}
