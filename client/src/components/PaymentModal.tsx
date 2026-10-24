import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { currencySymbol, money as formatMoney } from '../lib/restaurantSettings';

// ==========================================================================
// PaymentModal — "Take payment" window of the POS (USD only).
//
// One method per order: Cash, or one card (Visa, Mastercard, Debit).
//   - Cash: the cashier enters what the customer gave (number pad or quick
//     buttons). The window shows the change to give back, "exact amount", or
//     what is still to pay; it can't be completed until the total is covered.
//   - Card: the card machine is not connected yet, so the cashier charges it
//     on the machine and confirms "Card approved".
// The server checks everything again and computes the real change
// (POST /api/orders/:id/pay); this window only shows it.
//
// It is rendered inside the POS (.pos-root), so it uses the POS color tokens
// (--panel, --card, --gold-text, …) and follows the light/dark theme.
// ==========================================================================

export type PaymentMethod = 'CASH' | 'VISA' | 'MASTERCARD' | 'DEBIT';

export interface PaymentResult {
  method: PaymentMethod;
  amountDue: string;
  amountReceived: string;
  changeGiven: string;
  message: string;
  drawerFailed?: boolean;
}

interface PaymentModalProps {
  orderLabel: string; // e.g. "Order #1009 · Takeaway"
  total: number; // amount due shown to the cashier
  onCancel: () => void;
  // Saves the order, takes the payment on the server, opens the drawer for cash.
  // Throws an Error with a readable message when it fails.
  onConfirm: (method: PaymentMethod, amountReceived: number) => Promise<PaymentResult>;
  onDone: () => void; // "New order" after a successful payment
  onPreview?: () => void; // "Preview receipt" after a successful payment
  onDashboard?: () => void; // "Dashboard" after a successful payment (leave the POS)
}

const METHODS: { id: PaymentMethod; label: string; hint: string }[] = [
  { id: 'CASH', label: 'Cash', hint: 'Change calculated' },
  { id: 'VISA', label: 'Visa', hint: 'Card machine' },
  { id: 'MASTERCARD', label: 'Mastercard', hint: 'Card machine' },
  { id: 'DEBIT', label: 'Debit', hint: 'Card machine' },
];

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

// Money in whole cents, so 0.1 + 0.2 never shows 0.30000000004.
const toCents = (n: number) => Math.round(n * 100);
// Money in the restaurant's currency (Settings → Restaurant Info); amounts here are in cents.
const money = (cents: number) => formatMoney(cents / 100);

export default function PaymentModal({ orderLabel, total, onCancel, onConfirm, onDone, onPreview, onDashboard }: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [entered, setEntered] = useState(''); // what the cashier typed, e.g. "50" or "30.5"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.focus(); // so the physical keyboard works right away
  }, []);

  const dueCents = toCents(total);
  const receivedCents = entered === '' ? null : toCents(parseFloat(entered) || 0);
  const isCash = method === 'CASH';
  const enough = !isCash || (receivedCents !== null && receivedCents >= dueCents);
  const changeCents = receivedCents !== null ? receivedCents - dueCents : null;

  // Quick cash buttons: Exact, the next round $10s, and a $50 / $100 note.
  const quick = (() => {
    const ten = Math.ceil(total / 10) * 10;
    const values = [total, ten, ten + 10, total <= 50 ? 50 : 100, 100];
    const seen = new Set<number>();
    return values
      .filter((v) => v >= total && !seen.has(toCents(v)) && seen.add(toCents(v)))
      .slice(0, 4)
      .map((v, i) => ({ label: i === 0 ? 'Exact' : formatMoney(v), value: v }));
  })();

  const press = (key: string) => {
    setError(null);
    setEntered((e) => {
      if (key === 'back') return e.slice(0, -1);
      if (key === '.') return e.includes('.') ? e : (e || '0') + '.';
      if (e.includes('.') && e.split('.')[1].length >= 2) return e; // max 2 decimals
      if (e.replace('.', '').length >= 7) return e; // up to $99,999.99
      return e === '0' ? key : e + key;
    });
  };

  const complete = async () => {
    if (!enough || busy) return;
    setBusy(true);
    setError(null);
    try {
      const amount = isCash ? (receivedCents ?? 0) / 100 : total;
      setResult(await onConfirm(method, amount));
    } catch (err: any) {
      setError(err?.message || 'The payment could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Physical keyboard: digits, ".", Backspace, Enter = complete, Escape = cancel.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (result) {
      if (e.key === 'Enter') onDone();
      return;
    }
    if (e.key === 'Escape' && !busy) return onCancel();
    if (e.key === 'Enter') { e.preventDefault(); return void complete(); }
    if (!isCash) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === '.' || e.key === ',') press('.');
    else if (e.key === 'Backspace') press('back');
  };

  return (
    <div className="pay-overlay" role="dialog" aria-modal="true" aria-label="Take payment">
      <PaymentStyles />
      <div className="pay-box" ref={boxRef} tabIndex={-1} onKeyDown={onKeyDown}>
        {result ? (
          /* ---------- Done ---------- */
          <div className="pay-done">
            <div className="pay-done-icon" aria-hidden="true">✓</div>
            <h2 className="serif">Payment complete</h2>
            <p className="pay-done-method">
              {result.method === 'CASH' ? 'Paid by cash' : `Paid by ${METHODS.find((m) => m.id === result.method)?.label}`}
              {' · '}
              <span className="mono">{formatMoney(Number(result.amountDue))}</span>
            </p>
            {result.method === 'CASH' && (
              <div className={`pay-change ${Number(result.changeGiven) > 0 ? 'give' : 'exact'}`}>
                <span>{Number(result.changeGiven) > 0 ? 'GIVE BACK' : 'EXACT AMOUNT'}</span>
                <b className="mono">{Number(result.changeGiven) > 0 ? formatMoney(Number(result.changeGiven)) : 'No change'}</b>
              </div>
            )}
            {result.drawerFailed && <p className="pay-warn">The cash drawer did not open — open it from the Drawer button.</p>}
            {(onPreview || onDashboard) && (
              <div className="pay-done-actions">
                {onPreview && (
                  <button type="button" className="pay-secondary" onClick={onPreview}>
                    Preview receipt
                  </button>
                )}
                {onDashboard && (
                  <button type="button" className="pay-secondary" onClick={onDashboard}>
                    Dashboard
                  </button>
                )}
              </div>
            )}
            <button type="button" className="pay-primary" onClick={onDone} autoFocus>
              New order
            </button>
          </div>
        ) : (
          <>
            {/* ---------- Header: what to pay ---------- */}
            <div className="pay-head">
              <div>
                <h2 className="serif">Take payment</h2>
                <p>{orderLabel}</p>
              </div>
              <div className="pay-due">
                <span>AMOUNT DUE</span>
                <b className="mono">{money(dueCents)}</b>
              </div>
            </div>

            {/* ---------- Method ---------- */}
            <div className="pay-methods" role="group" aria-label="Payment method">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`pay-method ${method === m.id ? 'on' : ''}`}
                  onClick={() => { setMethod(m.id); setError(null); }}
                  aria-pressed={method === m.id}
                >
                  <b>{m.label}</b>
                  <span>{m.hint}</span>
                </button>
              ))}
            </div>

            {isCash ? (
              /* ---------- Cash: received + change ---------- */
              <div className="pay-cash">
                <div className="pay-cash-left">
                  <div className="pay-received">
                    <span>RECEIVED</span>
                    <b className="mono">{entered === '' ? formatMoney(0) : `${currencySymbol()}${entered}`}</b>
                  </div>
                  <div className="pay-quick">
                    {quick.map((q) => (
                      <button key={q.label} type="button" onClick={() => { setEntered(q.value.toFixed(2)); setError(null); }}>
                        {q.label}
                      </button>
                    ))}
                  </div>
                  <div
                    className={`pay-change ${
                      changeCents === null ? 'idle' : changeCents > 0 ? 'give' : changeCents === 0 ? 'exact' : 'short'
                    }`}
                    aria-live="polite"
                  >
                    <span>
                      {changeCents === null ? 'CHANGE TO GIVE BACK'
                        : changeCents > 0 ? 'CHANGE TO GIVE BACK'
                        : changeCents === 0 ? 'EXACT AMOUNT'
                        : 'STILL TO PAY'}
                    </span>
                    <b className="mono">
                      {changeCents === null ? '—'
                        : changeCents > 0 ? money(changeCents)
                        : changeCents === 0 ? 'No change'
                        : money(-changeCents)}
                    </b>
                  </div>
                </div>
                <div className="pay-keypad">
                  {KEYS.map((k) => (
                    <button key={k} type="button" onClick={() => press(k)} aria-label={k === 'back' ? 'Delete last digit' : k}>
                      {k === 'back' ? '⌫' : k}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* ---------- Card ---------- */
              <div className="pay-card">
                <b className="serif">Charge {money(dueCents)} on the card machine</b>
                <p>Ask the customer to tap or insert their card. When the machine says approved, press the button below.</p>
              </div>
            )}

            {error && <p className="pay-error" role="alert">{error}</p>}

            {/* ---------- Footer ---------- */}
            <div className="pay-foot">
              <button type="button" className="pay-secondary" onClick={onCancel} disabled={busy}>
                Cancel
              </button>
              <span className="pay-note">{isCash ? 'The cash drawer opens automatically.' : ''}</span>
              <button type="button" className="pay-primary" onClick={complete} disabled={!enough || busy}>
                {busy ? 'Saving…'
                  : !enough ? 'Enter amount received'
                  : isCash ? 'Complete payment'
                  : 'Card approved — complete'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Styles use the POS color tokens defined on .pos-root (light and dark).
const PaymentStyles = () => (
  <style>{`
    .pay-overlay { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 16px;
      background: var(--overlay); backdrop-filter: blur(3px); }
    .pay-box { width: min(760px, 100%); max-height: 100%; overflow: auto; border-radius: 20px; outline: none;
      background: var(--panel); border: 1px solid var(--hairline); color: var(--text-primary);
      box-shadow: 0 30px 80px rgba(0,0,0,.45); padding: 20px; display: flex; flex-direction: column; gap: 16px; }
    .pay-box .serif { font-family: 'Fraunces', serif; }
    .pay-box .mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
    .pay-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .pay-head h2 { margin: 0; font-size: 24px; font-weight: 600; color: var(--text-heading); }
    .pay-head p { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
    .pay-due { text-align: right; }
    .pay-due span, .pay-received span, .pay-change span { display: block; font-size: 11px; font-weight: 800; letter-spacing: .1em; color: var(--muted); }
    .pay-due b { font-size: 32px; font-weight: 600; color: var(--gold-text); }
    .pay-methods { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .pay-method { height: 62px; border-radius: 14px; border: 1px solid var(--hairline); background: var(--card);
      color: var(--text-heading); cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
    .pay-method b { font-size: 16px; }
    .pay-method span { font-size: 11px; color: var(--muted); }
    .pay-method.on { background: var(--pay-bg); border-color: var(--pay-bg); color: var(--on-pay); }
    .pay-method.on span { color: var(--on-pay); opacity: .8; }
    .pay-cash { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 14px; }
    .pay-cash-left { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .pay-received { padding: 12px 14px; border-radius: 14px; background: var(--card); border: 1px solid var(--pay-bg); }
    .pay-received b { font-size: 30px; font-weight: 600; color: var(--gold-text); }
    .pay-quick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .pay-quick button, .pay-keypad button { border-radius: 12px; border: 1px solid var(--hairline); background: var(--card);
      color: var(--text-heading); font-family: 'IBM Plex Mono', monospace; font-weight: 600; cursor: pointer; }
    .pay-quick button { height: 46px; font-size: 15px; }
    .pay-quick button:hover, .pay-keypad button:hover, .pay-method:not(.on):hover { background: var(--card-hover); }
    .pay-keypad { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .pay-keypad button { height: 58px; font-size: 22px; }
    .pay-change { margin-top: auto; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--hairline); }
    .pay-change b { display: block; font-size: 34px; font-weight: 600; margin-top: 2px; }
    .pay-change.idle { border-style: dashed; color: var(--muted); }
    .pay-change.give, .pay-change.exact { background: rgba(76,122,94,.18); border-color: #4C7A5E; }
    .pay-change.give b, .pay-change.exact b { color: #4C7A5E; }
    .pos-root[data-theme='dark'] .pay-change.give b, .pos-root[data-theme='dark'] .pay-change.exact b { color: #9fd0ae; }
    .pay-change.short { background: rgba(162,59,46,.14); border-color: var(--rust); }
    .pay-change.short b { color: var(--danger-text); }
    .pay-card { padding: 28px 20px; border-radius: 16px; border: 1px dashed var(--hairline); background: var(--card); text-align: center; }
    .pay-card b { display: block; font-size: 24px; font-weight: 600; color: var(--text-heading); }
    .pay-card p { margin: 8px auto 0; max-width: 440px; font-size: 14px; color: var(--muted); line-height: 1.5; }
    .pay-error { margin: 0; padding: 10px 14px; border-radius: 12px; background: rgba(162,59,46,.14);
      border: 1px solid var(--danger-line); color: var(--danger-text); font-size: 13px; font-weight: 600; }
    .pay-warn { margin: 0; font-size: 13px; color: var(--danger-text); }
    .pay-foot { display: flex; align-items: center; gap: 12px; }
    .pay-note { flex: 1; font-size: 12px; color: var(--muted); }
    .pay-secondary { height: 52px; padding: 0 18px; border-radius: 12px; border: 1px solid var(--hairline);
      background: transparent; color: var(--text-heading); font-weight: 700; cursor: pointer; }
    .pay-primary { height: 56px; min-width: 260px; padding: 0 22px; border-radius: 14px; border: 0;
      background: var(--pay-bg); color: var(--on-pay); font-size: 16px; font-weight: 800; cursor: pointer; }
    .pay-primary:disabled { background: var(--card); color: var(--muted-2); cursor: not-allowed; }
    .pay-secondary:disabled { opacity: .5; cursor: not-allowed; }
    .pay-done-actions { display: flex; gap: 10px; justify-content: center; width: 100%; max-width: 360px; }
    .pay-done-actions .pay-secondary { flex: 1; }
    .pay-done { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px 8px; text-align: center; }
    .pay-done-icon { width: 64px; height: 64px; border-radius: 999px; display: grid; place-items: center;
      background: #4C7A5E; color: #fff; font-size: 30px; font-weight: 800; }
    .pay-done h2 { margin: 4px 0 0; font-size: 26px; font-weight: 600; color: var(--text-heading); }
    .pay-done-method { margin: 0; color: var(--muted); }
    .pay-done .pay-change { width: min(360px, 100%); margin-top: 6px; }
    .pay-done .pay-primary { margin-top: 8px; width: min(360px, 100%); }
    @media (max-width: 640px) {
      .pay-methods { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .pay-cash { grid-template-columns: 1fr; }
      .pay-primary { min-width: 0; flex: 1; }
    }
  `}</style>
);
