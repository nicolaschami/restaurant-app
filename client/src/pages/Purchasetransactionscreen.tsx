import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type FC } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';

// ==========================================
// TYPES
// ==========================================
interface Supplier {
  supplierCode: string;
  supplierName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
}

export interface Product {
  id: number;
  code: string | null;
  barcode: string | null;
  name: string;
  category_id: number | null;
  supplier_id: number | null;
  brand: string | null;
  unit: string;
  cost_price: number;
  last_purchase_price: number | null;
  currency_code: string | null;
  current_stock: number | null;
  min_qty: number | null;
  max_qty: number | null;
  has_tva: boolean | null;
  warehouse: string | null;
  notes: string | null;
  created_at: string | null;
  restaurant_id: number;
}

interface PurchaseLineItem {
  id: string;
  name: string;
  raw_material_id?: number | null;
  unit: string;
  qty: number;
  unitCost: number;
  discountPct: number;
}

interface PurchaseReceiptFormProps {
  mode?: 'create' | 'edit';
  transactionId?: number;
  restaurantId?: number;
  onCancel?: () => void;
  onSave?: (payload: {
    grnNumber: string;
    supplier: string;
    supplierDetails?: Supplier | null;
    date: string;
    reference: string;
    comment: string;
    items: PurchaseLineItem[];
    subtotal: number;
    discount: number;
    taxableAmount: number;
    tax: number;
    netTotal: number;
    attachmentName: string | null;
  }) => void;
}

// ==========================================
// MOCK DATA / HELPERS
// ==========================================
const MOCK_UNITS = ['kg', 'g', 'ltr', 'ml', 'pcs', 'box', 'case'];

const TAX_RATE = 0.1;
const makeLineId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const formatMoney = (value: number) => `$${value.toFixed(2)}`;
const pad2 = (n: number) => String(n).padStart(2, '0');

const parseISODate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const buildMonthGrid = (year: number, month: number): Date[] => {
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
};

const emptyLine = (): PurchaseLineItem => ({
  id: makeLineId(),
  name: '',
  unit: 'kg',
  qty: 1,
  unitCost: 0,
  discountPct: 0,
});

const formatDateLabel = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateSlash = (iso: string) => {
  if (!iso) return '';
  const d = parseISODate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const parseTypedDate = (value: string): Date | null => {
  const match = value.trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
};

// ==========================================
// ICONS
// ==========================================
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7" /></svg>
);

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3" /></svg>
);

const FileIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M8 13h8M8 17h5" /></svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
);

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
);

const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
);

// ==========================================
// STYLES
// ==========================================
const ReceiptStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap');

    .pr-page, .pr-page * { box-sizing: border-box; }
    .pr-success-screen {
      min-height: calc(100dvh - 56px); display: grid; place-items: center; padding: 32px;
    }
    .pr-success-card {
      width: min(100%, 460px); padding: 42px 34px; border: 1px solid #cce7d3; border-radius: 22px;
      background: rgba(255,255,255,.94); box-shadow: 0 20px 56px rgba(34,54,42,.12); text-align: center;
    }
    .pr-success-icon {
      display: grid; place-items: center; width: 68px; height: 68px; margin: 0 auto 20px;
      border-radius: 50%; background: #e5f7e9; color: #24843b; box-shadow: 0 0 0 8px rgba(60,174,83,.10);
    }
    .pr-success-icon svg { width: 34px; height: 34px; fill: none; stroke: currentColor; stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
    .pr-success-title { margin: 0; color: var(--ink); font-size: 25px; font-weight: 800; letter-spacing: -.04em; }
    .pr-success-copy { margin: 9px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
    .pr-success-card .pr-btn { margin-top: 24px; }
    .pr-success-backdrop {
      position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center; padding: 24px;
      background: rgba(23, 35, 30, .48); backdrop-filter: blur(8px);
      animation: pr-success-fade-in .2s ease-out;
    }
    .pr-success-modal {
      position: relative; width: min(100%, 470px); overflow: hidden; padding: 38px 34px 30px;
      border: 1px solid rgba(255,255,255,.72); border-radius: 26px; background: #fff;
      box-shadow: 0 28px 80px rgba(23,35,30,.26), 0 8px 24px rgba(23,35,30,.12);
      text-align: center; animation: pr-success-pop-in .25s cubic-bezier(.23,1,.32,1);
    }
    .pr-success-modal::before {
      content: ''; position: absolute; inset: 0 0 auto; height: 7px;
      background: linear-gradient(90deg, #24843b, #69bb70, #a9521b);
    }
    .pr-success-modal::after {
      content: ''; position: absolute; width: 220px; height: 220px; border-radius: 50%;
      top: -145px; right: -70px; background: rgba(91,187,102,.12); pointer-events: none;
    }
    .pr-success-modal-icon {
      position: relative; z-index: 1; display: grid; place-items: center; width: 76px; height: 76px;
      margin: 0 auto 20px; border: 7px solid #f1fbf2; border-radius: 50%;
      background: linear-gradient(145deg, #dff6e3, #edfbee); color: #24843b;
      box-shadow: 0 10px 24px rgba(36,132,59,.18), 0 0 0 1px #ccebd1;
    }
    .pr-success-modal-icon svg { width: 35px; height: 35px; fill: none; stroke: currentColor; stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
    .pr-success-kicker { margin: 0 0 7px; color: #24843b; font-size: 10px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    .pr-success-modal-title { margin: 0; color: #17231e; font-size: 28px; font-weight: 800; letter-spacing: -.055em; }
    .pr-success-modal-copy { max-width: 300px; margin: 10px auto 0; color: #6e7b73; font-size: 12px; line-height: 1.6; }
    .pr-success-actions { display: grid; grid-template-columns: 1.15fr .85fr; gap: 10px; margin-top: 28px; }
    .pr-success-action { min-height: 44px; border-radius: 11px; padding: 0 14px; font: 800 11px/1 'Manrope', sans-serif; cursor: pointer; transition: transform .16s ease, box-shadow .16s ease, background .16s ease; }
    .pr-success-action:hover { transform: translateY(-1px); }
    .pr-success-action-primary { border: 1px solid #a9521b; background: #a9521b; color: #fff; box-shadow: 0 8px 16px rgba(169,82,27,.2); }
    .pr-success-action-primary:hover { background: #853d13; box-shadow: 0 10px 20px rgba(169,82,27,.26); }
    .pr-success-action-secondary { border: 1px solid #dce5dd; background: #fff; color: #536159; }
    .pr-success-action-secondary:hover { background: #f7faf7; border-color: #c4d2c6; }
    .pr-success-action:focus-visible { outline: 3px solid rgba(240,161,94,.72); outline-offset: 2px; }
    @keyframes pr-success-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pr-success-pop-in { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @media (max-width: 520px) {
      .pr-success-backdrop { padding: 16px; }
      .pr-success-modal { padding: 34px 20px 22px; border-radius: 22px; }
      .pr-success-actions { grid-template-columns: 1fr; }
    }

    .pr-page {
      --ink: #17231e;
      --muted: #6e7b73;
      --line: #dce5dd;
      --paper: #ffffff;
      --canvas: #f2f5f1;
      --forest: #a9521b;
      --forest-dark: #853d13;
      --lime: #f0a15e;
      --orange: #a9521b;
      --soft-green: #fbf1ea;
      min-height: 100dvh;
      overflow-y: auto;
      padding: 28px;
      background:
        radial-gradient(circle at 7% 6%, rgba(169, 82, 27, .08), transparent 22rem),
        radial-gradient(circle at 92% 8%, rgba(237, 138, 66, .10), transparent 19rem),
        linear-gradient(135deg, #f8f9fb 0%, #eef1f5 100%);
      color: var(--ink);
      font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
    }

    .pr-shell { width: 100%; margin: 0 auto; }
    .pr-topbar {
      display: flex; align-items: center; justify-content: space-between; gap: 20px;
      margin: 0 2px 18px;
    }
    .pr-breadcrumb { display: flex; align-items: center; gap: 9px; min-width: 0; }
    .pr-breadcrumb-kicker { color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .pr-breadcrumb-sep { color: #a6b1a9; }
    .pr-breadcrumb-title { color: var(--ink); font-size: 13px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pr-topbar-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

    .pr-btn {
      min-height: 40px; border-radius: 10px; border: 1px solid transparent; padding: 0 15px;
      font: 700 12px/1 'Manrope', sans-serif; cursor: pointer; transition: transform .16s ease, box-shadow .16s ease, background .16s ease;
    }
    .pr-btn:hover { transform: translateY(-1px); }
    .pr-btn:focus-visible, .pr-input:focus-visible, .pr-row-input:focus-visible, .pr-row-select:focus-visible, .pr-row-add:focus-visible, .pr-remove:focus-visible { outline: 3px solid rgba(216, 239, 130, .9); outline-offset: 2px; }
    .pr-btn-quiet { border-color: var(--line); color: #536159; background: rgba(255,255,255,.68); }
    .pr-btn-quiet:hover { background: #fff; box-shadow: 0 4px 14px rgba(23, 35, 30, .08); }
    .pr-btn-primary { color: #fff; background: var(--forest); box-shadow: 0 8px 18px rgba(169, 82, 27, .21); }
    .pr-btn-primary:hover { background: var(--forest-dark); box-shadow: 0 10px 22px rgba(169, 82, 27, .28); }

    .pr-card {
      overflow: visible; border: 1px solid rgba(203, 215, 205, .9); border-radius: 20px;
      background: rgba(255, 255, 255, .86); box-shadow: 0 20px 56px rgba(34, 54, 42, .11);
      backdrop-filter: blur(12px);
    }

    .pr-hero {
      position: relative; overflow: visible; z-index: 5; padding: 18px 30px 16px;
      background: linear-gradient(115deg, #ffffff 0%, #fafbfc 68%, #f8f4f0 100%); color: var(--ink);
    }
    .pr-hero::after {
      content: ''; position: absolute; width: 260px; height: 260px; border-radius: 50%; right: -80px; top: -134px;
      border: 42px solid rgba(169,82,27,.10); pointer-events: none;
    }
    .pr-hero-top { position: relative; z-index: 1; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
    .pr-eyebrow { margin: 0 0 3px; color: #7b858d; font-size: 9px; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
    .pr-title-row { display: flex; align-items: center; gap: 9px; }
    .pr-title { margin: 0; font-size: clamp(22px, 3vw, 28px); font-weight: 800; letter-spacing: -.055em; line-height: 1; }
    .pr-receiving-tag { padding: 4px 7px; border: 1px solid rgba(240,161,94,.52); border-radius: 99px; color: var(--lime); font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .pr-receipt-id { margin: 5px 0 0; color: #6f7981; font: 500 10px/1.2 'DM Mono', monospace; }
    .pr-status { position: relative; z-index: 1; display: flex; align-items: center; gap: 7px; padding: 8px 10px; border: 1px solid #e1e5e8; border-radius: 10px; background: rgba(255,255,255,.82); color: #3d474d; box-shadow: 0 3px 10px rgba(30, 36, 40, .06); white-space: nowrap; }
    .pr-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--lime); box-shadow: 0 0 0 4px rgba(240,161,94,.16); }
    .pr-status-copy { color: #3d474d; font-size: 11px; font-weight: 700; }

    .pr-details {
      position: relative; z-index: 1; display: grid;
      grid-template-columns: minmax(200px, 1.2fr) minmax(140px, .65fr) minmax(150px, .85fr) minmax(220px, 1.3fr);
      gap: 10px; margin-top: 14px;
    }
    .pr-field { min-width: 0; }
    .pr-field-label { display: block; margin: 0 0 5px; color: #7b858d; font-size: 8px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .pr-input {
      width: 100%; height: 36px; border: 1px solid #dfe4e7; border-radius: 9px; padding: 0 11px;
      background: #f8f9fa; color: var(--ink); font: 600 12px/1 'Manrope', sans-serif;
      transition: background .16s ease, border-color .16s ease;
    }
    .pr-supplier-input { height: 34px; text-align: left; direction: ltr; padding-right: 38px; }
    .pr-supplier-chevron {
      position: absolute; top: 35px; right: 8px; display: grid; place-items: center;
      width: 25px; height: 25px; border: 0; border-radius: 7px; background: transparent;
      color: #536159; cursor: pointer; transform: translateY(-50%); transition: background .15s ease, color .15s ease, transform .15s ease;
    }
    .pr-supplier-chevron:hover { background: var(--soft-green); color: var(--forest); }
    .pr-supplier-chevron:focus-visible { outline: 3px solid rgba(240,161,94,.72); outline-offset: 1px; }
    .pr-supplier-chevron svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; transition: transform .15s ease; }
    .pr-supplier-chevron-open svg { transform: rotate(180deg); }
    .pr-supplier-field { position: relative; }
    .pr-supplier-menu {
      position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 100;
      max-height: 230px; overflow-y: auto; padding: 6px; border: 1px solid #dce5dd;
      border-radius: 11px; background: #fff; box-shadow: 0 16px 34px rgba(23,35,30,.16), 0 3px 8px rgba(23,35,30,.08);
    }
    .pr-supplier-option {
      display: block; width: 100%; padding: 9px 10px; border: 0; border-radius: 7px;
      background: transparent; color: var(--ink); text-align: left; cursor: pointer;
    }
    .pr-supplier-option:hover, .pr-supplier-option:focus, .pr-supplier-option[aria-selected='true'] { background: var(--soft-green); outline: none; }
    .pr-supplier-option-main { display: block; font-size: 11px; font-weight: 800; line-height: 1.35; }
    .pr-supplier-option-details { display: block; margin-top: 3px; color: var(--muted); font-size: 10px; line-height: 1.35; }
    .pr-supplier-empty { padding: 10px; color: var(--muted); font-size: 11px; text-align: left; }
    .pr-input::placeholder { color: #8b949b; }
    .pr-input:hover { background: #fff; border-color: #cbd3d8; }
    .pr-input:focus { border-color: #c87942; background: #fff; outline: none; box-shadow: 0 0 0 3px rgba(169,82,27,.10); }

    .pr-supplier-badge {
      display: flex; align-items: center; gap: 6px; margin-top: 4px; padding: 3px 8px;
      border-radius: 6px; background: #f0f4f1; border: 1px solid #d4dfd6; font-size: 10px; color: var(--muted);
    }
    .pr-supplier-badge span { font-weight: 700; color: var(--ink); }

    .pr-datefield { position: relative; }
    .pr-date-trigger {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 0 8px 0 11px; cursor: text;
    }
    .pr-date-trigger-open { border-color: #c87942; background: #fff; box-shadow: 0 0 0 3px rgba(169,82,27,.10); }
    .pr-date-input { min-width: 0; flex: 1; height: 100%; border: 0; padding: 0; background: transparent; color: var(--ink); font: 600 12px/1 'Manrope', sans-serif; outline: none; }
    .pr-date-input::placeholder { color: #8b949b; }
    .pr-date-icon-button { display: grid; place-items: center; flex: 0 0 24px; width: 24px; height: 28px; margin-right: -4px; border: 0; border-radius: 6px; background: transparent; color: #93a099; cursor: pointer; }
    .pr-date-icon-button:hover { background: var(--soft-green); color: var(--forest); }
    .pr-date-icon-button svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

    .pr-datepicker {
      width: 288px;
      background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 14px;
      box-shadow: 0 18px 40px rgba(23, 35, 30, .16), 0 4px 10px rgba(23,35,30,.08);
      animation: pr-datepicker-in .14s ease-out;
    }
    @keyframes pr-datepicker-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

    .pr-datepicker-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .pr-datepicker-title { color: var(--ink); font-size: 13px; font-weight: 800; letter-spacing: -.02em; }
    .pr-datepicker-selectors { display: grid; grid-template-columns: 1.35fr .8fr .9fr; gap: 6px; margin: 0 0 10px; }
    .pr-datepicker-select {
      width: 100%; height: 30px; border: 1px solid var(--line); border-radius: 8px; padding: 0 7px;
      background: #f8faf8; color: var(--ink); font: 700 10px/1 'Manrope', sans-serif; cursor: pointer;
    }
    .pr-datepicker-select:hover { border-color: var(--forest); background: #fff; }
    .pr-datepicker-select:focus,
    .pr-datepicker-select:focus-visible {
      border-color: var(--forest);
      background: #fff;
      color: var(--ink);
      outline: 3px solid rgba(240,161,94,.72);
      outline-offset: 1px;
      box-shadow: 0 0 0 2px rgba(169,82,27,.12);
    }
    .pr-datepicker-nav {
      display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 8px;
      background: transparent; color: #6e7b73; cursor: pointer; transition: background .15s ease, color .15s ease;
    }
    .pr-datepicker-nav:hover { background: var(--soft-green); color: var(--forest); }
    .pr-datepicker-nav svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }

    .pr-datepicker-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 2px; }
    .pr-datepicker-weekdays span {
      text-align: center; color: #99a49e; font-size: 9px; font-weight: 800; letter-spacing: .06em;
      text-transform: uppercase; padding: 4px 0;
    }

    .pr-datepicker-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .pr-datepicker-day {
      display: grid; place-items: center; height: 30px; border: 0; border-radius: 9px; background: transparent;
      color: var(--ink); font: 600 11.5px/1 'DM Mono', monospace; cursor: pointer; transition: background .13s ease, color .13s ease;
    }
    .pr-datepicker-day:hover { background: var(--soft-green); color: var(--forest); }
    .pr-datepicker-day-muted { color: #c3cbc6; }
    .pr-datepicker-day-today { color: var(--forest); box-shadow: inset 0 0 0 1.5px rgba(169,82,27,.55); }
    .pr-datepicker .pr-datepicker-grid button.pr-datepicker-day.pr-datepicker-day-selected,
    .pr-datepicker .pr-datepicker-grid button.pr-datepicker-day.pr-datepicker-day-selected:hover,
    .pr-datepicker .pr-datepicker-grid button.pr-datepicker-day.pr-datepicker-day-selected:focus {
      display: grid;
      place-items: center;
      background: #a9521b !important;
      color: #ffffff !important;
      -webkit-text-fill-color: #ffffff !important;
      font-weight: 800;
      opacity: 1 !important;
      text-shadow: none;
      box-shadow: 0 4px 10px rgba(169,82,27,.32);
    }
    .pr-datepicker-day-selected:focus-visible { outline: 3px solid rgba(240,161,94,.9); outline-offset: 1px; }

    .pr-datepicker-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
    .pr-datepicker-link {
      border: 0; background: transparent; padding: 4px 6px; border-radius: 6px; cursor: pointer;
      font: 700 11px/1 'Manrope', sans-serif; color: #6e7b73; transition: background .15s ease, color .15s ease;
    }
    .pr-datepicker-link:hover { background: var(--soft-green); color: var(--forest); }
    .pr-datepicker-link.pr-datepicker-today { color: var(--forest); }

    .pr-content { display: grid; grid-template-columns: minmax(0, 1fr) 290px; gap: 0; align-items: start; border-top: 1px solid #dfe4e7; box-shadow: 0 -2px 8px rgba(34, 43, 48, .035); }
    .pr-lines { min-width: 0; padding: 23px 26px 28px; }
    .pr-lines-toolbar { position: sticky; top: 0; z-index: 4; display: flex; justify-content: space-between; align-items: center; gap: 15px; margin: -23px -26px 16px; padding: 18px 26px 12px; background: rgba(255,255,255,.94); border-bottom: 1px solid transparent; backdrop-filter: blur(10px); }
    .pr-section-heading { display: flex; align-items: baseline; gap: 9px; }
    .pr-section-title { margin: 0; color: var(--ink); font-size: 17px; font-weight: 800; letter-spacing: -.035em; }
    .pr-section-note { color: var(--muted); font: 500 10px/1 'DM Mono', monospace; }
    .pr-add-row { display: inline-flex; align-items: center; gap: 6px; min-height: 35px; padding: 0 11px; border: 1px solid #e9c9b1; border-radius: 8px; background: var(--soft-green); color: var(--forest); font: 800 11px/1 'Manrope', sans-serif; cursor: pointer; transition: background .16s ease, transform .16s ease; white-space: nowrap; }
    .pr-add-row svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
    .pr-add-row:hover { background: #f7e5d8; transform: translateY(-1px); }

    .pr-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 13px; background: #fff; }
    .pr-items-head, .pr-item-row {
      display: grid; grid-template-columns: 32px minmax(170px, 1.6fr) 74px 70px 92px 82px 104px 30px 30px; column-gap: 8px; align-items: center; min-width: 840px;
    }
    .pr-items-head { min-height: 36px; padding: 0 10px; background: #f7faf7; border-bottom: 1px solid var(--line); color: #718078; font-size: 9px; font-weight: 800; letter-spacing: .095em; text-transform: uppercase; }
    .pr-items-head span:nth-child(3), .pr-items-head span:nth-child(4), .pr-items-head span:nth-child(5), .pr-items-head span:nth-child(6), .pr-items-head span:nth-child(7) { text-align: right; }
    .pr-item-row { min-height: 59px; padding: 9px 10px; border-bottom: 1px solid #edf1ed; }
    .pr-item-row:last-of-type { border-bottom: 0; }
    .pr-item-no { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 7px; background: #f2f6f2; color: #738078; font: 500 10px/1 'DM Mono', monospace; }
    .pr-row-input, .pr-row-select {
      width: 100%; height: 35px; border: 1px solid transparent; border-radius: 7px; padding: 0 8px; background: transparent; color: var(--ink); font: 600 12px/1 'Manrope', sans-serif; transition: background .16s ease, border-color .16s ease; }
    .pr-row-input:hover, .pr-row-select:hover { border-color: #dce6de; background: #fafcf9; }
    .pr-row-input:focus, .pr-row-select:focus { border-color: #d18a58; background: #fff; outline: none; }
    .pr-row-input[type='number'], .pr-row-select { text-align: right; }
    .pr-row-select { cursor: pointer; text-align-last: right; }
    .pr-row-discount { color: var(--forest); }
    .pr-line-total { display: block; padding-right: 8px; color: var(--ink); font: 500 12px/1 'DM Mono', monospace; text-align: right; }
    .pr-row-add { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: #a3aea6; cursor: pointer; transition: color .16s ease, background .16s ease; }
    .pr-row-add svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    .pr-row-add:hover { color: var(--forest); background: var(--soft-green); }
    .pr-remove { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: #a3aea6; cursor: pointer; transition: color .16s ease, background .16s ease; }
    .pr-remove svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    .pr-remove:hover { color: #ba513f; background: #fff0ed; }
    .pr-table-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 160px; padding: 22px; text-align: center; }
    .pr-table-empty strong { font-size: 13px; }
    .pr-table-empty p { max-width: 250px; margin: 5px 0 13px; color: var(--muted); font-size: 11px; line-height: 1.55; }
    .pr-table-foot { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-top: 1px solid var(--line); background: #fcfdfc; color: #748179; font: 500 10px/1.4 'DM Mono', monospace; }

    .pr-sidebar { padding: 23px 22px; border-left: 1px solid var(--line); background: #f8faf8; }
    .pr-sidebar-inner { position: sticky; top: 20px; }
    .pr-summary-label { margin: 0 0 14px; color: #77837b; font-size: 9px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
    .pr-total-list { border-top: 1px solid var(--line); }
    .pr-total-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); color: #68756d; font-size: 11px; font-weight: 600; }
    .pr-total-row strong { color: var(--ink); font: 500 11px/1 'DM Mono', monospace; }
    .pr-discount-row { gap: 8px; }
    .pr-discount-input-wrap { display: flex; align-items: center; gap: 4px; }
    .pr-discount-currency { color: #9aa6a0; font: 500 11px/1 'DM Mono', monospace; }
    .pr-discount-input {
      width: 64px; height: 26px; border: 1px solid var(--line); border-radius: 6px; padding: 0 6px;
      text-align: right; color: var(--forest); background: #fff; font: 600 11px/1 'DM Mono', monospace;
    }
    .pr-discount-input:focus { outline: none; border-color: #c87942; box-shadow: 0 0 0 2px rgba(169,82,27,.12); }
    .pr-grand-total { margin-top: 12px; padding: 15px; border-radius: 13px; background: #171717; color: white; }
    .pr-grand-total-label { display: block; color: rgba(255,255,255,.67); font-size: 9px; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
    .pr-grand-total-value { display: block; margin-top: 5px; color: var(--lime); font-size: 26px; font-weight: 800; letter-spacing: -.065em; }

    .pr-attachment-block { margin-top: 23px; padding-top: 20px; border-top: 1px solid var(--line); }
    .pr-attachment-title { margin: 0 0 9px; color: #77837b; font-size: 9px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .pr-dropzone { display: flex; align-items: center; gap: 10px; min-height: 62px; padding: 10px; border: 1px dashed #b9c9bd; border-radius: 10px; background: #fff; cursor: pointer; transition: background .16s ease, border-color .16s ease; }
    .pr-dropzone:hover { border-color: #c87942; background: #fff8f3; }
    .pr-upload-badge { display: grid; place-items: center; flex: 0 0 34px; height: 34px; border-radius: 8px; background: var(--soft-green); color: var(--forest); }
    .pr-upload-badge svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .pr-dropzone-copy { min-width: 0; }
    .pr-dropzone-copy strong { display: block; color: var(--ink); font-size: 11px; font-weight: 800; }
    .pr-dropzone-copy span { display: block; margin-top: 2px; color: var(--muted); font-size: 10px; line-height: 1.4; }
    .pr-attachment { display: flex; align-items: center; gap: 9px; min-height: 62px; padding: 9px; border: 1px solid #cfe2d2; border-radius: 10px; background: #fff; }
    .pr-attachment-thumb, .pr-attachment-icon { display: grid; place-items: center; flex: 0 0 34px; width: 34px; height: 34px; border-radius: 7px; border: 1px solid #dce6de; background: #f1f6f1; color: var(--forest); object-fit: cover; }
    .pr-attachment-icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linejoin: round; }
    .pr-attachment-copy { min-width: 0; flex: 1; }
    .pr-attachment-name { overflow: hidden; color: var(--ink); font-size: 10.5px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
    .pr-attachment-size { margin-top: 2px; color: var(--muted); font-size: 9.5px; }
    .pr-attachment-remove { display: grid; place-items: center; flex: 0 0 25px; width: 25px; height: 25px; border: 0; border-radius: 6px; background: transparent; color: #9ba79f; cursor: pointer; }
    .pr-attachment-remove:hover { background: #fff0ed; color: #ba513f; }
    .pr-attachment-remove svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    .pr-sidebar-date { margin: 18px 0 0; color: #839087; font: 500 9px/1.5 'DM Mono', monospace; }

    /* ✅ FIX: Loading screen styles */
    .pr-loading-screen {
      display: grid; place-items: center; min-height: 60vh; text-align: center; gap: 14px;
    }
    .pr-loading-spinner {
      width: 46px; height: 46px; border-radius: 50%;
      border: 4px solid #f0e2d5; border-top-color: #a9521b;
      animation: pr-spin .8s linear infinite;
    }
    .pr-loading-copy {
      margin: 0; color: #6e7b73; font-size: 13px; font-weight: 700; letter-spacing: -.01em;
    }
    @keyframes pr-spin { to { transform: rotate(360deg); } }

    @media (max-width: 820px) {
      .pr-page { padding: 16px; }
      .pr-content { grid-template-columns: 1fr; }
      .pr-sidebar { border-top: 1px solid var(--line); border-left: 0; }
      .pr-sidebar-inner { position: static; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; }
      .pr-attachment-block { margin-top: 0; padding-top: 0; border-top: 0; }
      .pr-sidebar-date { display: none; }
    }
    @media (max-width: 620px) {
      .pr-page { padding: 10px; }
      .pr-topbar { align-items: flex-start; margin: 0 2px 12px; }
      .pr-breadcrumb-kicker, .pr-breadcrumb-sep { display: none; }
      .pr-topbar-actions { gap: 6px; }
      .pr-btn { min-height: 36px; padding: 0 10px; }
      .pr-hero { padding: 20px 17px 17px; }
      .pr-hero-top { align-items: flex-start; }
      .pr-status { padding: 8px; }
      .pr-status-copy { display: none; }
      .pr-details { grid-template-columns: 1fr; gap: 9px; margin-top: 16px; }
      .pr-lines { padding: 19px 14px 18px; }
      .pr-lines-toolbar { margin: -19px -14px 16px; padding: 15px 14px 11px; }
      .pr-lines-toolbar { align-items: flex-start; }
      .pr-section-heading { display: block; }
      .pr-section-note { display: block; margin-top: 4px; }
      .pr-sidebar { padding: 18px 14px; }
      .pr-sidebar-inner { grid-template-columns: 1fr; gap: 19px; }
      .pr-table-wrap { border-radius: 10px; }
      .pr-items-head, .pr-item-row { min-width: 800px; }
    }
  `}</style>
);

// ==========================================
// COMPONENT
// ==========================================
const initialHeaderState = {
  supplierName: '',
  supplierId: '',
  grnNumber: '',
  reference: '',
  comment: '',
  receivedAt: new Date().toISOString().split('T')[0],
  subtotal: 0,
  taxAmount: 0,
  discountAmount: 0,
  netTotal: 0,
};

const PurchaseReceiptForm: FC<PurchaseReceiptFormProps> = ({
  mode = 'create',
  transactionId,
  restaurantId = 1,
  onCancel,
  onSave,
}) => {
  console.log('[PurchaseReceiptForm]', {
    mode,
    transactionId,
    restaurantId,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [grnNumber, setGrnNumber] = useState('GRN-0148');

  // ✅ FIX: Split into two independent loading flags. Never initialize to `true`
  // (the transaction effect will raise it as soon as it actually starts fetching).
  const [isLoadingTransaction, setIsLoadingTransaction] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const isLoading = isLoadingTransaction || isLoadingInitial;

  const [supplier, setSupplier] = useState('');
  const [selectedSupplierDetails, setSelectedSupplierDetails] = useState<Supplier | null>(null);
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState<boolean>(false);

  const [product, setproduct] = useState('');
  const [selectedProductdetaisl, setselectedProductdetaisl] = useState<Product | null>(null);
  const [ProductList, setProductList] = useState<Product[]>([]);
  const [isLoadingProducts, setsLoadingProducts] = useState<boolean>(false);

  const [date, setDate] = useState(todayISO());
  const [dateInput, setDateInput] = useState(() => formatDateSlash(todayISO()));
  const [reference, setReference] = useState('');
  const [comment, setComment] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [items, setItems] = useState<PurchaseLineItem[]>([]);
  const [orderDiscount, setOrderDiscount] = useState<number>(0);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedPreviewUrl, setAttachedPreviewUrl] = useState<string | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [calendarCursor, setCalendarCursor] = useState<Date>(() => parseISODate(date || todayISO()));
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemNameRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const addButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const formRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const popoverContentRef = useRef<HTMLDivElement>(null);
  const dateTriggerRef = useRef<HTMLInputElement>(null);
  const supplierInputRef = useRef<HTMLInputElement>(null);

  const [supplierName, setSupplierName] = useState('');
  const [isSupplierMenuOpen, setIsSupplierMenuOpen] = useState(false);
  const [activeSupplierIndex, setActiveSupplierIndex] = useState(0);

  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  // ==========================================================
  // ✅ FIX: Transaction loader — single source of truth for
  // isLoadingTransaction. No stray setIsLoading(false) after.
  // ==========================================================
  useEffect(() => {
    if (mode !== 'edit' || !transactionId) {
      // Ensure we're never stuck "true" if we bail out early.
      setIsLoadingTransaction(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const loadTransaction = async () => {
      setIsLoadingTransaction(true);
      try {
        console.log(
          '[PurchaseReceiptForm] Loading transaction:',
          transactionId,
        );

        const res = await api.get(
          `/stock-transactions/${transactionId}`,
          {
            params: { restaurantId },
            signal: controller.signal,
          },
        );

        if (cancelled) return;

        const transaction = res.data;

        console.log(
          '[PurchaseReceiptForm] Transaction response:',
          transaction,
        );

        // Header fields
        setGrnNumber(transaction.grnNumber ?? '');

        const loadedSupplier = transaction.supplierName ?? '';
        setSupplier(loadedSupplier);

        // Extract supplier code + name from "SUP-102 - Ocean Catch Seafoods"
        const supplierParts = loadedSupplier.split(' - ');
        const loadedSupplierCode = supplierParts[0]?.trim() ?? '';
        const loadedSupplierName = supplierParts.slice(1).join(' - ').trim();

        setSelectedSupplierDetails({
          supplierCode: loadedSupplierCode,
          supplierName: loadedSupplierName,
          contactPerson: null,
          phone: null,
          email: null,
        });

        setReference(transaction.reference ?? '');
        setComment(transaction.comment ?? '');

        // Date
        const loadedDate = transaction.transactionDate ?? todayISO();
        setDate(loadedDate);
        setDateInput(formatDateSlash(loadedDate));
        setCalendarCursor(parseISODate(loadedDate));

        // Order discount
        setOrderDiscount(Number(transaction.discountAmount ?? 0));

        // Item rows
        const details = Array.isArray(transaction.details)
          ? transaction.details
          : [];

        setItems(
          details.map((detail: any, index: number) => {
            // ✅ FIX: compute the id once, then actually USE it below.
            const rawMaterialId =
              detail.RawMaterialId ??
              detail.RawMaterialID ??
              detail.rawMaterialId ??
              detail.raw_material_id ??
              null;

            return {
              id: String(detail.detailId ?? `${transactionId}-${index}`),
              name: detail.itemname ?? '',
              raw_material_id: rawMaterialId, // ✅ was `detail.RawMaterialId ?? ''`
              unit: detail.unit ?? 'kg',
              qty: Number(detail.qty ?? detail.quantity ?? 0),
              unitCost: Number(detail.unitCost ?? detail.unit_cost ?? 0),
              discountPct: Number(detail.discountPct ?? detail.discount_pct ?? 0),
            };
          }),
        );
      } catch (error: any) {
        if (error?.name === 'CanceledError' || cancelled) return;
        console.error(
          '[PurchaseReceiptForm] Failed to load transaction:',
          error,
        );
      } finally {
        if (!cancelled) setIsLoadingTransaction(false);
      }
    };

    loadTransaction();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mode, transactionId, restaurantId]);

  // ==========================================================
  // ✅ FIX: Initial data loader — uses its OWN flag so it can
  // never stomp on the transaction loader.
  // ==========================================================
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoadingInitial(true);
      try {
        const [suppliersRes, rawMaterialsRes] = await Promise.all([
          api.get('/suppliers', { params: { restaurantId } }),
          api.get('/raw-materials', { params: { restaurantId } }),
        ]);

        console.log('==============================================');
        console.log('Suppliers:', suppliersRes.data);
        console.log('Raw Materials:', rawMaterialsRes.data);
        console.log('==============================================');

        setSuppliersList(suppliersRes.data);

        let rawMaterials: Product[] = [];
        if (Array.isArray(rawMaterialsRes.data)) {
          rawMaterials = rawMaterialsRes.data;
        } else if (rawMaterialsRes.data.rawMaterials) {
          rawMaterials = rawMaterialsRes.data.rawMaterials;
        } else if (rawMaterialsRes.data.data) {
          rawMaterials = rawMaterialsRes.data.data;
        }

        setProductList(rawMaterials);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoadingInitial(false);
      }
    };

    fetchInitialData();
  }, [restaurantId]);

  const handleCreateAnotherReceipt = () => {
    const resetDate = todayISO();
    const nextGrnNumber = `GRN-${Date.now().toString().slice(-6)}`;

    setSupplierName('');
    setSupplier('');
    setSelectedSupplierDetails(null);
    setGrnNumber(nextGrnNumber);
    setReference('');
    setComment('');
    setDate(resetDate);
    setDateInput(formatDateSlash(resetDate));
    setCalendarCursor(parseISODate(resetDate));
    setIsDatePickerOpen(false);

    setItems([]);

    setIsSaved(false);
    window.requestAnimationFrame(() => supplierInputRef.current?.focus());
  };

  useEffect(() => {
    supplierInputRef.current?.focus();
  }, []);

  const handleBackToDashboard = () => {
    setIsSaved(false);
    onCancel?.();
    window.location.assign('/dashboard');
  };

  const handleSupplierChange = (value: string) => {
    setSupplier(value);
    setActiveSupplierIndex(0);
    setIsSupplierMenuOpen(value.trim().length > 0);
    const matched = suppliersList.find(
      (s) =>
        s.supplierName.toLowerCase() === value.trim().toLowerCase() ||
        `${s.supplierCode} - ${s.supplierName}`.toLowerCase() === value.trim().toLowerCase()
    );
    setSelectedSupplierDetails(matched || null);
  };

  const handleSupplierKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const query = supplier.trim().toLowerCase();
    const filteredSuppliers = suppliersList.filter((s) =>
      !query || `${s.supplierCode} ${s.supplierName}`.toLowerCase().includes(query)
    );

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsSupplierMenuOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' && filteredSuppliers.length) {
      event.preventDefault();
      setIsSupplierMenuOpen(true);
      setActiveSupplierIndex((index) => (index + 1) % filteredSuppliers.length);
      return;
    }
    if (event.key === 'ArrowUp' && filteredSuppliers.length) {
      event.preventDefault();
      setIsSupplierMenuOpen(true);
      setActiveSupplierIndex((index) => (index - 1 + filteredSuppliers.length) % filteredSuppliers.length);
      return;
    }
    if (event.key === 'Enter' && isSupplierMenuOpen && filteredSuppliers.length) {
      event.preventDefault();
      const selected = filteredSuppliers[activeSupplierIndex] || filteredSuppliers[0];
      handleSupplierChange(`${selected.supplierCode} - ${selected.supplierName}`);
      setIsSupplierMenuOpen(false);
      return;
    }
    handleEnterAsTab(event);
  };

  const handleSave = async () => {
    if (!selectedSupplierDetails) {
      alert('Please select a valid supplier from the dropdown list.');
      return;
    }

    if (!items.length) {
      alert('Please add at least one item before saving.');
      return;
    }

    const hasInvalidItem = items.some((item) => !item.raw_material_id);
    if (hasInvalidItem) {
      alert('One or more items do not have a valid raw material ID. Please select them from the suggestion list.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const supplierId = selectedSupplierDetails?.supplierCode
        ?? selectedSupplierDetails?.supplierCode
        ?? 1;

      const payload = {
        restaurantId: 1,

        supplierName: supplier.trim() || selectedSupplierDetails?.supplierName || "Prime Meats & Produce Co.",

        supplierId: 1,
        grnNumber: grnNumber,
        receivedAt: date,
        reference: reference,
        comment: comment,

        subtotal: Number(subtotal.toFixed(2)),
        discount: Number(discount.toFixed(2)),
        tax: Number(tax.toFixed(2)),
        netTotal: Number(netTotal.toFixed(2)),

        items: items.map((item) => ({
          rawMaterialId: Number(item.raw_material_id),
          name: item.name.trim(),
          quantity: Number(item.qty),
          unit: item.unit,
          unitCost: Number(item.unitCost),
          discountPct: Number(item.discountPct || 0),
          lineTotal: Number(lineTotalOf(item).toFixed(2)),
        })),
      };

      console.log('NUEVO Clean Payload 001:', JSON.stringify(payload, null, 2));

      if (mode === 'edit' && transactionId) {
        await api.put(
          `/stock-transactions/${transactionId}`,
          payload,
          { params: { restaurantId } },
        );

        console.log(
          '[PurchaseReceiptForm] Transaction updated:',
          transactionId,
        );

        onCancel?.();
      } else {
        await api.post('/stock-transactions', payload);

        console.log(
          '[PurchaseReceiptForm] New transaction created',
        );

        setIsSaved(true);
      }
    } catch (error: any) {
      console.error('Backend Error Response:', error.response?.data);
      setErrorMessage(error.response?.data?.message || 'Failed to save transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isDatePickerOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (datePickerRef.current?.contains(target)) return;
      if (popoverContentRef.current?.contains(target)) return;
      setIsDatePickerOpen(false);
    };
    const handleFocusOutside = (event: FocusEvent) => {
      const target = event.target as Node;
      if (datePickerRef.current?.contains(target)) return;
      if (popoverContentRef.current?.contains(target)) return;
      setIsDatePickerOpen(false);
    };
    const handleDismiss = () => setIsDatePickerOpen(false);
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('focusin', handleFocusOutside);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('focusin', handleFocusOutside);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [isDatePickerOpen]);

  const openDatePicker = () => {
    setCalendarCursor(parseISODate(date || todayISO()));
    const rect = dateTriggerRef.current?.getBoundingClientRect();
    if (rect) {
      const popoverWidth = 288;
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - popoverWidth - 12));
      setPopoverPosition({ top: rect.bottom + 8, left });
    }
    setIsDatePickerOpen(true);
  };

  const goToMonth = (delta: number) => {
    setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const updateDatePart = (part: 'day' | 'month' | 'year', rawValue: string) => {
    const current = parseISODate(date || toISODate(calendarCursor));
    const value = Number(rawValue);
    const year = part === 'year' ? value : current.getFullYear();
    const month = part === 'month' ? value : current.getMonth();
    const requestedDay = part === 'day' ? value : current.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const next = new Date(year, month, Math.min(requestedDay, daysInMonth));
    setCalendarCursor(next);
    setDate(toISODate(next));
  };

  const selectDate = (d: Date) => {
    setDate(toISODate(d));
    setDateInput(formatDateSlash(toISODate(d)));
    setIsDatePickerOpen(false);
    window.requestAnimationFrame(() => {
      if (dateTriggerRef.current) focusAdjacentField(dateTriggerRef.current, 1);
    });
  };

  const handleDateInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value.replace(/[^0-9/.-]/g, '').slice(0, 10);
    setDateInput(nextValue);
    const parsed = parseTypedDate(nextValue);
    if (parsed) {
      setDate(toISODate(parsed));
      setCalendarCursor(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
  };

  const handleDateInputBlur = () => {
    const parsed = parseTypedDate(dateInput);
    if (parsed) {
      const nextDate = toISODate(parsed);
      setDate(nextDate);
      setDateInput(formatDateSlash(nextDate));
      setCalendarCursor(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
      return;
    }
    setDateInput(date ? formatDateSlash(date) : '');
  };

  const focusAdjacentField = (current: HTMLElement, direction: 1 | -1) => {
    const container = formRef.current;
    if (!container) return;
    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>('input, select, [data-tabstop]')
    ).filter((el) => !(el as HTMLInputElement).disabled && el.tabIndex !== -1 && el.offsetParent !== null);
    const index = focusables.indexOf(current);
    if (index === -1) return;
    const target = focusables[index + direction];
    if (!target) return;
    target.focus();
    if (target instanceof HTMLInputElement && target.type !== 'date') {
      target.select();
    }
  };

  const handleEnterAsTab = (event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    focusAdjacentField(event.currentTarget, event.shiftKey ? -1 : 1);
  };

  const handleDiscountEnter = (itemId: string) => (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (event.shiftKey) {
      focusAdjacentField(event.currentTarget, -1);
      return;
    }
    addButtonRefs.current[itemId]?.focus();
  };

  useEffect(() => () => {
    if (attachedPreviewUrl) URL.revokeObjectURL(attachedPreviewUrl);
  }, [attachedPreviewUrl]);

  const updateItem = (id: string, patch: Partial<PurchaseLineItem>) => {
    setItems((previous) => previous.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    setItems((previous) => previous.filter((item) => item.id !== id));
  };

  const addItem = () => {
    const newItem = emptyLine();
    setItems((previous) => [newItem, ...previous]);
    window.requestAnimationFrame(() => {
      itemNameRefs.current[newItem.id]?.focus();
      itemNameRefs.current[newItem.id]?.select();
    });
  };

  const addItemAfter = (afterId: string) => {
    const newItem = emptyLine();
    setItems((previous) => {
      const index = previous.findIndex((item) => item.id === afterId);
      if (index === -1) return [...previous, newItem];
      const next = [...previous];
      next.splice(index + 1, 0, newItem);
      return next;
    });
    window.requestAnimationFrame(() => {
      itemNameRefs.current[newItem.id]?.focus();
      itemNameRefs.current[newItem.id]?.select();
    });
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (attachedPreviewUrl) URL.revokeObjectURL(attachedPreviewUrl);
    setAttachedFile(file);
    setAttachedPreviewUrl(file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  };

  const removeAttachment = () => {
    if (attachedPreviewUrl) URL.revokeObjectURL(attachedPreviewUrl);
    setAttachedFile(null);
    setAttachedPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const lineTotalOf = (item: PurchaseLineItem) => {
    const gross = (Number(item.qty) || 0) * (Number(item.unitCost) || 0);
    const discountPct = Math.min(Math.max(Number(item.discountPct) || 0, 0), 100);
    return gross * (1 - discountPct / 100);
  };

  const subtotal = items.reduce((sum, item) => sum + lineTotalOf(item), 0);
  const discount = Math.min(Math.max(Number(orderDiscount) || 0, 0), subtotal);
  const taxableAmount = subtotal - discount;
  const tax = taxableAmount * TAX_RATE;
  const netTotal = taxableAmount + tax;
  const itemCount = items.length;

  const handleProductSelect = (itemId: string, value: string) => {
    const matchedProduct = ProductList.find(
      (product) => product.name.toLowerCase() === value.trim().toLowerCase()
    );

    if (matchedProduct) {
      const productData = matchedProduct as any;

      const unit = productData.unit || productData.Unit || 'kg';

      let costPrice = productData.cost_price || productData.costPrice || 0;
      if (typeof costPrice === 'string') {
        costPrice = parseFloat(costPrice) || 0;
      }

      console.log('Selected product:', {
        name: matchedProduct.name,
        unit: unit,
        costPrice: costPrice,
        rawData: productData,
      });

      updateItem(itemId, {
        name: matchedProduct.name,
        raw_material_id: matchedProduct.id,
        unit: unit,
        unitCost: costPrice,
      });
    } else {
      updateItem(itemId, { name: value });
    }
  };

  // ==========================================================
  // ✅ FIX: Show a loading screen while either fetch is running.
  // ==========================================================
  if (isLoading) {
    return (
      <main className="pr-page">
        <ReceiptStyles />
        <div className="pr-loading-screen">
          <div className="pr-loading-spinner" aria-hidden="true" />
          <p className="pr-loading-copy">
            {isLoadingTransaction ? 'Loading Transaction .... ' : 'Loading suppliers…'}
          </p>
        </div>
      </main>
    );
  }

  if (isSaved) {
    return (
      <main className="pr-page">
        <ReceiptStyles />
        <div className="pr-success-backdrop">
          <div className="pr-success-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-success-title">
            <div className="pr-success-modal-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <p className="pr-success-kicker">Receipt saved</p>
            <h3 id="receipt-success-title" className="pr-success-modal-title">Successfully done</h3>
            <p className="pr-success-modal-copy">The goods receipt has been saved successfully and is ready for review.</p>

            <div className="pr-success-actions">
              <button
                type="button"
                onClick={handleCreateAnotherReceipt}
                className="pr-success-action pr-success-action-primary"
              >
                Create another Transaction
              </button>
              <button
                type="button"
                onClick={handleBackToDashboard}
                className="pr-success-action pr-success-action-secondary"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pr-page">
      <ReceiptStyles />
      <div className="pr-shell" ref={formRef}>
        <section className="pr-card" aria-label="Goods receipt form">
          <div className="pr-hero">
            <div className="pr-hero-top">
              <div>
                <p className="pr-eyebrow">Inbound inventory</p>
                <div className="pr-title-row">
                  <h1 className="pr-title">Receive goods</h1>
                  <span className="pr-receiving-tag">Draft</span>
                </div>
                <p className="pr-receipt-id">RECEIPT / {grnNumber || 'UNASSIGNED'}</p>
              </div>
              <div className="pr-topbar-actions">
                <button className="pr-btn pr-btn-quiet" type="button" onClick={onCancel}>Cancel</button>
                <button
                  className="pr-btn pr-btn-primary"
                  type="button"
                  onClick={handleSave}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save receipt'}
                </button>
              </div>
            </div>

            <div className="pr-details">
              <label className="pr-field pr-supplier-field">
                <span className="pr-field-label">
                  Supplier {isLoadingSuppliers && '(Loading...)'}
                </span>
                <input
                  ref={supplierInputRef}
                  className="pr-input pr-supplier-input"
                  value={supplier}
                  onChange={(event) => handleSupplierChange(event.target.value)}
                  onFocus={() => { setActiveSupplierIndex(0); }}
                  onBlur={() => window.setTimeout(() => setIsSupplierMenuOpen(false), 120)}
                  onKeyDown={handleSupplierKeyDown}
                  placeholder={isLoadingSuppliers ? 'Loading suppliers...' : 'Search or enter supplier…'}
                />
                <button
                  type="button"
                  className={`pr-supplier-chevron${isSupplierMenuOpen ? ' pr-supplier-chevron-open' : ''}`}
                  aria-label={isSupplierMenuOpen ? 'Close supplier list' : 'Open supplier list'}
                  aria-expanded={isSupplierMenuOpen}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    supplierInputRef.current?.focus();
                    setIsSupplierMenuOpen((open) => !open);
                    setActiveSupplierIndex(0);
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                {isSupplierMenuOpen && (
                  <div className="pr-supplier-menu" role="listbox" aria-label="Supplier suggestions">
                    {suppliersList
                      .filter((s) => {
                        const query = supplier.trim().toLowerCase();
                        return !query || `${s.supplierCode} ${s.supplierName}`.toLowerCase().includes(query);
                      })
                      .map((s, index) => (
                        <button
                          key={s.supplierCode}
                          type="button"
                          className="pr-supplier-option"
                          role="option"
                          aria-selected={index === activeSupplierIndex}
                          onMouseEnter={() => setActiveSupplierIndex(index)}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            handleSupplierChange(`${s.supplierCode} - ${s.supplierName}`);
                            setIsSupplierMenuOpen(false);
                          }}
                        >
                          <span className="pr-supplier-option-main">{s.supplierCode} - {s.supplierName}</span>
                          <span className="pr-supplier-option-details">
                            {[s.contactPerson, s.phone, s.email].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      ))}
                    {!suppliersList.some((s) => {
                      const query = supplier.trim().toLowerCase();
                      return !query || `${s.supplierCode} ${s.supplierName}`.toLowerCase().includes(query);
                    }) && <div className="pr-supplier-empty">No suppliers found</div>}
                  </div>
                )}
              </label>
              <div className="pr-field pr-datefield" ref={datePickerRef}>
                <span className="pr-field-label">Received on</span>
                <div className={`pr-input pr-date-trigger${isDatePickerOpen ? ' pr-date-trigger-open' : ''}`}>
                  <input
                    ref={dateTriggerRef}
                    className="pr-date-input"
                    type="text"
                    inputMode="numeric"
                    value={dateInput}
                    placeholder="DD/MM/YYYY"
                    aria-label="Received date, type day, month, and year"
                    data-tabstop="true"
                    onChange={handleDateInputChange}
                    onBlur={handleDateInputBlur}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        if (!isDatePickerOpen) openDatePicker();
                      }
                      handleEnterAsTab(event);
                    }}
                  />
                  <button
                    type="button"
                    className="pr-date-icon-button"
                    onClick={() => (isDatePickerOpen ? setIsDatePickerOpen(false) : openDatePicker())}
                    aria-haspopup="dialog"
                    aria-expanded={isDatePickerOpen}
                    aria-label="Open date calendar"
                  >
                    <CalendarIcon />
                  </button>
                </div>

                {isDatePickerOpen && popoverPosition && createPortal(
                  <div
                    className="pr-datepicker"
                    ref={popoverContentRef}
                    role="dialog"
                    aria-label="Choose received date"
                    style={{ position: 'fixed', top: popoverPosition.top, left: popoverPosition.left, zIndex: 1000 }}
                  >
                    <div className="pr-datepicker-head">
                      <button type="button" className="pr-datepicker-nav" onClick={() => goToMonth(-1)} aria-label="Previous month">
                        <ChevronLeftIcon />
                      </button>
                      <span className="pr-datepicker-title">{MONTH_LABELS[calendarCursor.getMonth()]} {calendarCursor.getFullYear()}</span>
                      <button type="button" className="pr-datepicker-nav" onClick={() => goToMonth(1)} aria-label="Next month">
                        <ChevronRightIcon />
                      </button>
                    </div>
                    <div className="pr-datepicker-selectors" aria-label="Select date parts">
                      <select
                        className="pr-datepicker-select"
                        aria-label="Select month"
                        value={calendarCursor.getMonth()}
                        onChange={(event) => updateDatePart('month', event.target.value)}
                        onKeyDown={handleEnterAsTab}
                        data-tabstop="true"
                      >
                        {MONTH_LABELS.map((month, index) => <option key={month} value={index}>{month}</option>)}
                      </select>
                      <select
                        className="pr-datepicker-select"
                        aria-label="Select day"
                        value={parseISODate(date || toISODate(calendarCursor)).getDate()}
                        onChange={(event) => updateDatePart('day', event.target.value)}
                        onKeyDown={handleEnterAsTab}
                        data-tabstop="true"
                      >
                        {Array.from({ length: new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 0).getDate() }, (_, index) => index + 1)
                          .map((day) => <option key={day} value={day}>{pad2(day)}</option>)}
                      </select>
                      <select
                        className="pr-datepicker-select"
                        aria-label="Select year"
                        value={calendarCursor.getFullYear()}
                        onChange={(event) => updateDatePart('year', event.target.value)}
                        onKeyDown={handleEnterAsTab}
                        data-tabstop="true"
                      >
                        {Array.from({ length: 21 }, (_, index) => new Date().getFullYear() - 10 + index)
                          .map((year) => <option key={year} value={year}>{year}</option>)}
                      </select>
                    </div>
                    <div className="pr-datepicker-weekdays">
                      {WEEKDAY_LABELS.map((w) => <span key={w}>{w}</span>)}
                    </div>
                    <div className="pr-datepicker-grid">
                      {buildMonthGrid(calendarCursor.getFullYear(), calendarCursor.getMonth()).map((d, i) => {
                        const inMonth = d.getMonth() === calendarCursor.getMonth();
                        const selected = Boolean(date) && isSameDay(d, parseISODate(date));
                        const isToday = isSameDay(d, new Date());
                        const classes = [
                          'pr-datepicker-day',
                          !inMonth ? 'pr-datepicker-day-muted' : '',
                          isToday && !selected ? 'pr-datepicker-day-today' : '',
                          selected ? 'pr-datepicker-day-selected' : '',
                        ].filter(Boolean).join(' ');
                        return (
                          <button key={i} type="button" className={classes} onClick={() => selectDate(d)}>
                            {d.getDate()}
                          </button>
                        );
                      })}
                    </div>
                    <div className="pr-datepicker-foot">
                      <button
                        type="button"
                        className="pr-datepicker-link"
                        onClick={() => { setDate(''); setDateInput(''); setIsDatePickerOpen(false); }}
                      >
                        Clear
                      </button>
                      <button type="button" className="pr-datepicker-link pr-datepicker-today" onClick={() => selectDate(new Date())}>
                        Today
                      </button>
                    </div>
                  </div>,
                  document.body
                )}
              </div>
              <label className="pr-field">
                <span className="pr-field-label">Reference</span>
                <input
                  className="pr-input"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  onKeyDown={handleEnterAsTab}
                  placeholder="Invoice # or delivery note"
                />
              </label>
              <label className="pr-field">
                <span className="pr-field-label">Comment</span>
                <input
                  className="pr-input"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  onKeyDown={handleEnterAsTab}
                  placeholder="Optional note about this delivery"
                />
              </label>
            </div>
          </div>

          <div className="pr-content">
            <section className="pr-lines" aria-label="Receipt line items">
              <div className="pr-lines-toolbar">
                <div className="pr-section-heading">
                  <h2 className="pr-section-title">Items received</h2>
                  <span className="pr-section-note">{itemCount} {itemCount === 1 ? 'line' : 'lines'}</span>
                </div>
                <button className="pr-add-row" type="button" onClick={addItem}>
                  <PlusIcon /> Add item
                </button>
              </div>

              <div className="pr-table-wrap">
                <div className="pr-items-head" aria-hidden="true">
                  <span>#</span><span>Item</span><span>Quantity</span><span>Unit</span><span>Unit cost</span><span>Disc. %</span><span>Line total</span><span /><span />
                </div>

                {items.length === 0 ? (
                  <div className="pr-table-empty">
                    <strong>No items added yet</strong>
                    <p>Add the first delivery line to calculate this receipt's running total.</p>
                    <button className="pr-add-row" type="button" onClick={addItem}><PlusIcon /> Add first item</button>
                  </div>
                ) : items.map((item, index) => {
                  const lineTotal = lineTotalOf(item);
                  return (
                    <div className="pr-item-row" key={item.id}>
                      <span className="pr-item-no">{String(index + 1).padStart(2, '0')}</span>
                      <input
                        className="pr-row-input"
                        ref={(element) => {
                          itemNameRefs.current[item.id] = element;
                        }}
                        list="pr-material-list"
                        value={item.name ?? ''}
                        onChange={(event) => {
                          const selectedName = event.target.value;
                          handleProductSelect(item.id, selectedName);
                        }}
                        onKeyDown={handleEnterAsTab}
                        placeholder="Item name"
                        aria-label={`Item name, row ${index + 1}`}
                      />
                      <input
                        className="pr-row-input"
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.qty}
                        onChange={(event) => updateItem(item.id, { qty: parseFloat(event.target.value) || 0 })}
                        onKeyDown={handleEnterAsTab}
                        aria-label={`Quantity, row ${index + 1}`}
                      />
                      <select
                        className="pr-row-select"
                        value={item.unit}
                        onChange={(event) => updateItem(item.id, { unit: event.target.value })}
                        onKeyDown={handleEnterAsTab}
                        aria-label={`Unit, row ${index + 1}`}
                      >
                        {MOCK_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                      <input
                        className="pr-row-input"
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitCost}
                        onChange={(event) => updateItem(item.id, { unitCost: parseFloat(event.target.value) || 0 })}
                        onKeyDown={handleEnterAsTab}
                        aria-label={`Unit cost, row ${index + 1}`}
                      />
                      <input
                        className="pr-row-input pr-row-discount"
                        type="number"
                        min={0}
                        max={100}
                        step="1"
                        value={item.discountPct}
                        onChange={(event) => updateItem(item.id, { discountPct: parseFloat(event.target.value) || 0 })}
                        onKeyDown={handleDiscountEnter(item.id)}
                        aria-label={`Discount percent, row ${index + 1}`}
                      />
                      <output className="pr-line-total">{formatMoney(lineTotal)}</output>
                      <button className="pr-row-add" type="button" ref={(element) => { addButtonRefs.current[item.id] = element; }} onClick={() => addItemAfter(item.id)} title="Add row below" aria-label={`Add a new row below row ${index + 1}`}>
                        <PlusIcon />
                      </button>
                      <button className="pr-remove" type="button" onClick={() => removeItem(item.id)} title="Remove item" aria-label={`Remove ${item.name || `row ${index + 1}`}`}>
                        <CloseIcon />
                      </button>
                    </div>
                  );
                })}
                <datalist id="pr-material-list">
                  {ProductList?.map((material: Product) => (
                    <option key={material.id} value={material.name} />
                  ))}
                </datalist>
                <div className="pr-table-foot">
                  <span>All values update automatically</span>
                  <span>{itemCount} {itemCount === 1 ? 'receipt item' : 'receipt items'}</span>
                </div>
              </div>
            </section>

            <aside className="pr-sidebar" aria-label="Receipt summary">
              <div className="pr-sidebar-inner">
                <div>
                  <p className="pr-summary-label">Receipt summary</p>
                  <div className="pr-total-list">
                    <div className="pr-total-row"><span>Items</span><strong>{itemCount}</strong></div>
                    <div className="pr-total-row"><span>Subtotal</span><strong>{formatMoney(subtotal)}</strong></div>
                    <div className="pr-total-row pr-discount-row">
                      <span>Discount</span>
                      <span className="pr-discount-input-wrap">
                        <span className="pr-discount-currency">−$</span>
                        <input
                          className="pr-discount-input"
                          type="number"
                          min={0}
                          max={subtotal}
                          step="0.01"
                          value={orderDiscount}
                          onChange={(event) => setOrderDiscount(parseFloat(event.target.value) || 0)}
                          onKeyDown={handleEnterAsTab}
                          aria-label="Order-level discount amount"
                        />
                      </span>
                    </div>
                    <div className="pr-total-row"><span>Tax ({(TAX_RATE * 100).toFixed(0)}%)</span><strong>{formatMoney(tax)}</strong></div>
                  </div>
                  <div className="pr-grand-total">
                    <span className="pr-grand-total-label">Net total</span>
                    <strong className="pr-grand-total-value">{formatMoney(netTotal)}</strong>
                  </div>
                </div>

                <div className="pr-attachment-block">
                  <p className="pr-attachment-title">Supplier document</p>
                  {!attachedFile ? (
                    <div className="pr-dropzone" onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && fileInputRef.current?.click()}>
                      <span className="pr-upload-badge"><UploadIcon /></span>
                      <span className="pr-dropzone-copy"><strong>Attach invoice</strong><span>Photo or PDF delivery note</span></span>
                    </div>
                  ) : (
                    <div className="pr-attachment">
                      {attachedPreviewUrl ? <img className="pr-attachment-thumb" src={attachedPreviewUrl} alt="Attached document preview" /> : <span className="pr-attachment-icon"><FileIcon /></span>}
                      <div className="pr-attachment-copy">
                        <div className="pr-attachment-name" title={attachedFile.name}>{attachedFile.name}</div>
                        <div className="pr-attachment-size">{(attachedFile.size / 1024).toFixed(0)} KB attached</div>
                      </div>
                      <button className="pr-attachment-remove" type="button" onClick={removeAttachment} title="Remove attachment" aria-label="Remove attachment"><CloseIcon /></button>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFileSelect} style={{ display: 'none' }} />
                  <p className="pr-sidebar-date">RECEIVED · {formatDateLabel(date).toUpperCase()}</p>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
};

export default PurchaseReceiptForm;