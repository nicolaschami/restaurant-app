import { useState, useEffect, useCallback, type FC } from 'react';
import { money } from '../lib/restaurantSettings';
import { toast } from '../components/Toaster';
import { api, wsUrl } from '../api';
import { ticketLabel } from '../lib/ticketLabel';
import { ChefHat, Archive, Sun, Moon, Plus, Loader2 } from 'lucide-react';

// ==========================================
// TYPES
// ==========================================
export interface ActiveOrder {
  orderId: number;
  ticketNo: number;
  orderType: string;
  status: string;
  totalAmount: string;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  itemCount: number;
  createdAt?: string;
  created_at?: string;
}

interface DashboardViewProps {
  restaurantName: string;
  onNavigate: (tab: string) => void;
  onSelectTicket?: (ticket: ActiveOrder) => void;
}

// Real numbers from GET /api/dashboard/summary (see src/routes/dashboard.ts on the
// server). "Today" and the week follow the restaurant's time zone.
interface DashboardSummary {
  currency: string;
  today: { sales: number; orders: number; averageOrder: number; yesterdaySales: number };
  week: { date: string; label: string; sales: number; orders: number }[];
  activeOrders: number;
  topItems: { name: string; quantity: number; sales: number }[];
  menu: { items: number; categories: number };
  lowStock: {
    count: number;
    items: { id: number; name: string; unit: string; currentStock: number; minQty: number }[];
  };
}

type Theme = 'light' | 'dark';

// ==========================================
// HELPERS
// ==========================================

// Money in the restaurant's currency, e.g. "$1,240.50".
const formatMoney = (value: number, currency = 'USD') => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return money(value); // restaurant currency
  }
};

// "+12.5%" / "-3.0%" compared with yesterday; nothing when yesterday had no sales.
const changeVsYesterday = (today: number, yesterday: number): string | undefined => {
  if (!yesterday) return undefined;
  const pct = ((today - yesterday) / yesterday) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
};

// How long an open order has been waiting: fresh < 10 min ≤ waiting < 20 min ≤ late.
const FRESHNESS_META = [
  { key: 'fresh', label: 'Fresh', color: '#4C7A5E' },
  { key: 'aging', label: 'Waiting', color: '#B8863B' },
  { key: 'late', label: 'Late', color: '#A23B2E' },
] as const;
type FreshnessKey = (typeof FRESHNESS_META)[number]['key'];
const freshnessOf = (mins: number): FreshnessKey => (mins >= 20 ? 'late' : mins >= 10 ? 'aging' : 'fresh');

const formatDuration = (mins: number): string => {
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
};

const ORDER_TYPE_META = [
  { key: 'dinein', label: 'Dine-in', match: (s: string) => s.includes('dine') },
  { key: 'takeaway', label: 'Takeaway', match: (s: string) => s.includes('take') || s.includes('pick') },
  { key: 'delivery', label: 'Delivery', match: (s: string) => s.includes('deliver') },
] as const;
type OrderTypeKey = (typeof ORDER_TYPE_META)[number]['key'];
const matchOrderType = (orderType: string) => {
  const s = (orderType || '').toLowerCase();
  return ORDER_TYPE_META.find((m) => m.match(s));
};

// ==========================================
// STYLES — same cream/gold (light) and green/gold (dark) family as the POS
// ==========================================
const DashboardStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

    .dash { min-height: 100%; font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text);
      padding: 16px 24px 24px; display: flex; flex-direction: column; gap: 14px; box-sizing: border-box; }
    .dash[data-theme='light'] { --bg:#f6efdf; --panel:#fffaf0; --card:#ffffff; --hover:#fbf3e0; --line:#e2d6bb;
      --text:#221f1c; --muted:#5f584b; --gold:#8a6420; --gold-line:#c9a24b; --track:#f1e8d3; --bar:#e2d3ad;
      --fresh:#3f6b50; --fresh-bg:#e3eee5; --aging:#8a6420; --aging-bg:#f6ecd5; --late:#a3412a; --late-bg:#f7e0da; }
    .dash[data-theme='dark'] { --bg:#1a2520; --panel:#22302a; --card:#2b3b33; --hover:#34473d; --line:#3f5247;
      --text:#f6f0e2; --muted:#b3bfb3; --gold:#e6cf8f; --gold-line:#9a7d3c; --track:#22302a; --bar:#3f5247;
      --fresh:#9fd0ae; --fresh-bg:#25402f; --aging:#e6cf8f; --aging-bg:#46391f; --late:#f0a68c; --late-bg:#4a2c27; }
    .dash .serif { font-family: 'Fraunces', serif; }
    .dash .mono { font-family: 'IBM Plex Mono', monospace; }

    /* Header: one line */
    .d-head { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    .d-head-title { flex: 1 1 280px; display: flex; align-items: baseline; flex-wrap: wrap; gap: 12px; }
    .d-head-title h1 { margin: 0; font-size: 22px; font-weight: 600; }
    .d-sub { font-size: 13px; color: var(--muted); }
    .d-live { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
    .d-live-dot { width: 8px; height: 8px; border-radius: 999px; }
    .d-live-dot.live { background: #4C7A5E; }
    .d-live-dot.connecting { background: #B8863B; animation: d-pulse 1.2s ease-in-out infinite; }
    .d-live-dot.offline { background: #A23B2E; }
    @keyframes d-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
    .d-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .d-btn { height: 40px; display: inline-flex; align-items: center; gap: 8px; padding: 0 14px; border-radius: 10px;
      border: 1px solid var(--line); background: var(--panel); color: var(--text); font-size: 13px; font-weight: 600;
      cursor: pointer; font-family: inherit; }
    .d-btn:hover:not(:disabled) { background: var(--hover); }
    .d-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .d-btn.icon { width: 40px; padding: 0; justify-content: center; color: var(--gold); }
    .d-btn.primary { background: #c9a24b; border-color: #c9a24b; color: #201a0c; font-size: 14px; font-weight: 700; padding: 0 18px; }
    .d-btn.primary:hover { filter: brightness(1.06); background: #c9a24b; }

    .d-alert { margin: 0; padding: 8px 14px; border-radius: 10px; font-size: 13px;
      background: var(--aging-bg); color: var(--aging); }

    /* Open orders — first and biggest */
    .d-pass { min-height: 400px; box-sizing: border-box; padding: 14px 16px; border-radius: 16px;
      background: var(--panel); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 12px; }
    .d-pass-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .d-pass-head h2 { margin: 0; font-size: 18px; font-weight: 600; flex: 1 1 160px; }
    .d-pass-head h2 .mono { font-size: 14px; color: var(--muted); }
    .d-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .d-chip { height: 32px; display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; border-radius: 999px;
      font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
      background: var(--card); color: var(--muted); border: 1px solid var(--line); }
    .d-chip.on { background: #c9a24b; border-color: #c9a24b; color: #201a0c; }
    .d-chip .dot { width: 8px; height: 8px; border-radius: 999px; }
    /* Cards are placed starting from the RIGHT (like the dishes in the POS);
       the text inside each card stays left-to-right. */
    .d-tickets { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; align-content: start; direction: rtl; }
    .d-ticket { direction: ltr; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 12px 14px;
      border-radius: 12px; border: 1px solid var(--line); background: var(--card); color: var(--text);
      text-align: left; cursor: pointer; font-family: inherit; }
    .d-ticket:hover { border-color: var(--gold-line); }
    .d-ticket-row { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
    .d-ticket-no { font-size: 16px; font-weight: 600; }
    .d-badge { padding: 2px 7px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap; }
    .d-badge.fresh { background: var(--fresh-bg); color: var(--fresh); }
    .d-badge.aging { background: var(--aging-bg); color: var(--aging); }
    .d-badge.late { background: var(--late-bg); color: var(--late); }
    .d-ticket-who { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .d-ticket-meta { font-size: 12px; color: var(--muted); }
    .d-ticket-total { font-size: 15px; font-weight: 600; color: var(--gold); }
    .d-empty { padding: 24px 4px; font-size: 14px; color: var(--muted); }

    /* Key numbers — slim row */
    .d-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
    .d-kpi { padding: 14px 18px; border-radius: 16px; background: var(--card); border: 1px solid var(--line); }
    .d-kpi-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .d-kpi-label { font-size: 13px; font-weight: 600; color: var(--muted); }
    .d-kpi-value { font-size: 24px; font-weight: 600; margin-top: 6px; }
    .d-kpi-detail { font-size: 12px; color: var(--muted); margin-top: 2px; }

    /* Bottom row */
    .d-bottom { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
    .d-card { padding: 16px 18px; border-radius: 16px; background: var(--card); border: 1px solid var(--line);
      display: flex; flex-direction: column; gap: 12px; }
    .d-card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .d-card-head h2 { margin: 0; font-size: 18px; font-weight: 600; }
    .d-link { border: 0; background: none; padding: 0; font-family: inherit; font-size: 14px; font-weight: 600;
      color: var(--gold); cursor: pointer; }
    .d-week { height: 140px; display: flex; align-items: flex-end; gap: 10px; }
    .d-week-col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 6px; }
    .d-week-amt { font-size: 11px; color: var(--muted); }
    .d-week-bar { width: 100%; max-width: 44px; border-radius: 8px 8px 4px 4px; background: var(--bar);
      transition: height 600ms ease; }
    .d-week-bar.today { background: #c9a24b; }
    .d-week-day { font-size: 12px; color: var(--muted); }
    .d-week-day.today { font-weight: 700; color: var(--gold); }
    .d-track { height: 6px; border-radius: 999px; background: var(--track); overflow: hidden; }
    .d-fill { height: 6px; border-radius: 999px; }
    .d-row { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; }
    .d-stock { display: flex; flex-direction: column; gap: 5px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); }

    /* Phone (2026-10-26): tighter, 2 key numbers and 2 open orders per row, one card per row below */
    @media (max-width: 640px) {
      .dash { padding: 10px 10px 16px; gap: 10px; }
      .d-head-title { flex-basis: 100%; }
      .d-head-title h1 { font-size: 19px; }
      .d-actions { width: 100%; }
      .d-actions .d-btn.primary { flex: 1; justify-content: center; }
      .d-pass { min-height: 0; padding: 10px; }
      .d-tickets { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .d-ticket { padding: 10px; }
      .d-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .d-kpi { padding: 10px 12px; }
      .d-kpi-value { font-size: 19px; }
      .d-bottom { grid-template-columns: minmax(0, 1fr); gap: 10px; }
      .d-week { gap: 5px; }
    }
  `}</style>
);

// ==========================================
// MAIN COMPONENT
// ==========================================
export const DashboardView: FC<DashboardViewProps> = ({ restaurantName, onNavigate, onSelectTicket }) => {
  const [tickets, setTickets] = useState<ActiveOrder[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState<boolean>(true);
  const [isOpeningDrawer, setIsOpeningDrawer] = useState<boolean>(false);
  const [now, setNow] = useState<number>(Date.now());
  const [mounted, setMounted] = useState(false);
  const [typeFilter, setTypeFilter] = useState<OrderTypeKey | null>(null);
  const [freshnessFilter, setFreshnessFilter] = useState<FreshnessKey | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);

  // Light/dark is remembered on this computer. Light by default for the back office.
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem('dashboardTheme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('dashboardTheme', theme);
    } catch {
      /* storage unavailable — theme just won't be remembered */
    }
  }, [theme]);

  // Sales, week, stock and menu numbers. Refreshed on load, every minute, and
  // whenever an order changes (live update from the server).
  const fetchSummary = useCallback(async () => {
    try {
      const response = await api.get('/dashboard/summary');
      setSummary(response.data);
      setSummaryError(false);
    } catch (err) {
      console.error('Failed to fetch dashboard summary:', err);
      setSummaryError(true);
    }
  }, []);

  // Open (unpaid) orders. The server picks the restaurant from the login token.
  const fetchActiveOrders = useCallback(async () => {
    try {
      const response = await api.get('/orders/active');
      setTickets(response.data.orders || []);
    } catch (err) {
      console.error('Failed to fetch active orders:', err);
    } finally {
      setIsLoadingTickets(false);
    }
  }, []);

  const handleOpenDrawer = async () => {
    try {
      setIsOpeningDrawer(true);
      // through the print helper (Settings → Printers)
      await api.post('/printing/drawer');
      toast.success('Drawer opened');
    } catch (err: any) {
      toast.error('Drawer not opened', err.response?.data?.error || 'Check the print helper.');
    } finally {
      setIsOpeningDrawer(false);
    }
  };

  // Live updates over the WebSocket (with automatic reconnect).
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let unmounted = false;

    const connect = () => {
      // The server checks this login token before opening the live connection,
      // and picks the restaurant room from it.
      const token = encodeURIComponent(localStorage.getItem('token') || '');
      setWsStatus('connecting');
      socket = new WebSocket(wsUrl(`/ws?token=${token}`)); // same machine as the API

      socket.onopen = () => {
        attempt = 0;
        setWsStatus('live');
      };

      socket.onmessage = (event) => {
        try {
          const { event: eventName } = JSON.parse(event.data);
          if (eventName === 'ORDER_UPDATED' || eventName === 'ORDER_STATUS_UPDATED') {
            fetchActiveOrders();
            fetchSummary();
          }
        } catch (err) {
          console.error('Failed to parse websocket message:', err);
        }
      };

      socket.onclose = () => {
        setWsStatus('offline');
        if (unmounted) return;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [fetchActiveOrders, fetchSummary]);

  useEffect(() => {
    fetchActiveOrders();
    fetchSummary();
    const fetchInterval = setInterval(() => {
      fetchActiveOrders();
      fetchSummary();
    }, 60000);
    const minuteTicker = setInterval(() => setNow(Date.now()), 60000);
    const mountTimer = setTimeout(() => setMounted(true), 60);

    return () => {
      clearInterval(fetchInterval);
      clearInterval(minuteTicker);
      clearTimeout(mountTimer);
    };
  }, [fetchActiveOrders, fetchSummary]);

  const getMins = (t: ActiveOrder) => {
    const createdAtStr = t.created_at || t.createdAt;
    if (!createdAtStr) return 0;
    const createdTime = new Date(createdAtStr).getTime();
    if (isNaN(createdTime)) return 0;
    return Math.max(0, Math.floor((now - createdTime) / 60000));
  };

  const displayedTickets = tickets.filter((t) => {
    if (typeFilter && matchOrderType(t.orderType)?.key !== typeFilter) return false;
    if (freshnessFilter && freshnessOf(getMins(t)) !== freshnessFilter) return false;
    return true;
  });
  const freshCounts = FRESHNESS_META.map((f) => ({
    ...f,
    count: tickets.filter((t) => freshnessOf(getMins(t)) === f.key).length,
  }));
  const lateCount = freshCounts.find((f) => f.key === 'late')?.count || 0;

  const openTicket = (t: ActiveOrder) => (onSelectTicket ? onSelectTicket(t) : onNavigate('pos'));

  // ---- Real numbers (empty until the summary has loaded) ----
  const currency = summary?.currency || 'USD';
  const week = summary?.week || [];
  const maxWeek = Math.max(1, ...week.map((d) => d.sales)); // avoid dividing by 0 on a quiet week
  const weekTotal = week.reduce((s, d) => s + d.sales, 0);
  const topItems = summary?.topItems || [];
  const topMax = Math.max(1, ...topItems.map((t) => t.quantity));
  const salesChange = summary ? changeVsYesterday(summary.today.sales, summary.today.yesterdaySales) : undefined;
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="dash" data-theme={theme}>
      <DashboardStyles />

      {/* HEADER — one line */}
      <div className="d-head">
        <div className="d-head-title">
          <h1 className="serif">{restaurantName}</h1>
          <span className="d-sub">{todayLabel}</span>
          <span className="d-live" title="Updates arrive automatically as orders change">
            <span className={`d-live-dot ${wsStatus}`} />
            {wsStatus === 'live' ? 'Live' : wsStatus === 'connecting' ? 'Connecting…' : 'Offline'}
          </span>
        </div>
        <div className="d-actions">
          <button className="d-btn" onClick={() => onNavigate('kitchenscreen')}>
            <ChefHat className="w-4 h-4" />
            Kitchen display
          </button>
          <button className="d-btn" onClick={handleOpenDrawer} disabled={isOpeningDrawer}>
            <Archive className="w-4 h-4" />
            {isOpeningDrawer ? 'Opening…' : 'Open drawer'}
          </button>
          <button
            className="d-btn icon"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          <button className="d-btn primary" onClick={() => onNavigate('pos')}>
            <Plus className="w-4 h-4" />
            New order
          </button>
        </div>
      </div>

      {summaryError && <p className="d-alert">Could not load today's numbers. They will refresh automatically in a minute.</p>}

      {/* OPEN ORDERS — first and biggest: what staff watch all day */}
      <section className="d-pass" aria-label="Open orders">
        <div className="d-pass-head">
          <h2 className="serif">
            Open orders <span className="mono">· {tickets.length}</span>
          </h2>
          <div className="d-chips" role="group" aria-label="Order type">
            <button className={`d-chip ${typeFilter === null ? 'on' : ''}`} onClick={() => setTypeFilter(null)}>
              All
            </button>
            {ORDER_TYPE_META.map((m) => (
              <button
                key={m.key}
                className={`d-chip ${typeFilter === m.key ? 'on' : ''}`}
                onClick={() => setTypeFilter((prev) => (prev === m.key ? null : m.key))}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="d-chips" role="group" aria-label="Waiting time">
            {freshCounts.map((f) => (
              <button
                key={f.key}
                className={`d-chip ${freshnessFilter === f.key ? 'on' : ''}`}
                onClick={() => setFreshnessFilter((prev) => (prev === f.key ? null : f.key))}
              >
                <span className="dot" style={{ background: f.color }} />
                {f.label} · {f.count}
              </button>
            ))}
          </div>
        </div>

        {isLoadingTickets ? (
          <div className="d-empty">
            <Loader2 className="w-4 h-4" style={{ display: 'inline', marginRight: 6, animation: 'd-pulse 1s infinite' }} />
            Loading open orders…
          </div>
        ) : displayedTickets.length === 0 ? (
          <div className="d-empty">{tickets.length === 0 ? 'No open orders right now.' : 'No open orders match this filter.'}</div>
        ) : (
          <div className="d-tickets">
            {displayedTickets.map((t) => {
              const mins = getMins(t);
              const fresh = freshnessOf(mins);
              const meta = FRESHNESS_META.find((f) => f.key === fresh)!;
              const typeLabel = matchOrderType(t.orderType)?.label || t.orderType;
              return (
                <button
                  key={t.orderId}
                  className="d-ticket"
                  style={{ boxShadow: `inset 0 3px 0 ${meta.color}` }}
                  onClick={() => openTicket(t)}
                  title="Open in the POS"
                >
                  <div className="d-ticket-row">
                    <span className="d-ticket-no mono">{ticketLabel(t.ticketNo)}</span>
                    <span className={`d-badge ${fresh}`}>
                      {fresh === 'late' ? 'LATE · ' : fresh === 'aging' ? 'WAITING · ' : ''}
                      {formatDuration(mins)}
                    </span>
                  </div>
                  <div className="d-ticket-who">{t.customerName || `${typeLabel} order`}</div>
                  <div className="d-ticket-row" style={{ alignItems: 'baseline' }}>
                    <span className="d-ticket-meta">
                      {typeLabel} · {t.itemCount} {t.itemCount === 1 ? 'item' : 'items'}
                    </span>
                    <span className="d-ticket-total mono">{formatMoney(Number(t.totalAmount || 0), currency)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* KEY NUMBERS — slim row */}
      <div className="d-kpis">
        <div className="d-kpi">
          <div className="d-kpi-top">
            <span className="d-kpi-label">Today's sales</span>
            {salesChange && (
              <span className={`d-badge ${salesChange.startsWith('-') ? 'late' : 'fresh'}`}>{salesChange}</span>
            )}
          </div>
          <div className="d-kpi-value mono">{summary ? formatMoney(summary.today.sales, currency) : '—'}</div>
          <div className="d-kpi-detail">
            {summary
              ? summary.today.yesterdaySales
                ? `vs ${formatMoney(summary.today.yesterdaySales, currency)} yesterday`
                : 'No sales yesterday'
              : ' '}
          </div>
        </div>
        <div className="d-kpi">
          <span className="d-kpi-label">Orders today</span>
          <div className="d-kpi-value mono">{summary ? summary.today.orders : '—'}</div>
          <div className="d-kpi-detail">
            {summary ? `Average ${formatMoney(summary.today.averageOrder, currency)} per order` : ' '}
          </div>
        </div>
        <div className="d-kpi">
          <div className="d-kpi-top">
            <span className="d-kpi-label">Open now</span>
            {lateCount > 0 && <span className="d-badge late">{lateCount} late</span>}
          </div>
          <div className="d-kpi-value mono">{tickets.length}</div>
          <div className="d-kpi-detail">Orders not paid yet</div>
        </div>
        <div className="d-kpi">
          <div className="d-kpi-top">
            <span className="d-kpi-label">Stock alerts</span>
            {!!summary?.lowStock.count && <span className="d-badge aging">Action</span>}
          </div>
          <div className="d-kpi-value mono">{summary ? summary.lowStock.count : '—'}</div>
          <div className="d-kpi-detail">
            {summary ? (summary.lowStock.count > 0 ? 'At or below minimum' : 'All stock above minimum') : ' '}
          </div>
        </div>
      </div>

      {/* BOTTOM ROW — week · best sellers · low stock */}
      <div className="d-bottom">
        <section className="d-card">
          <div className="d-card-head">
            <h2 className="serif">Last 7 days</h2>
            <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--gold)' }}>
              {formatMoney(weekTotal, currency)}
            </span>
          </div>
          <div className="d-week">
            {week.map((d, i) => {
              const isToday = i === week.length - 1;
              return (
                <div className="d-week-col" key={d.date} title={`${d.date}: ${formatMoney(d.sales, currency)} · ${d.orders} orders`}>
                  <span className="d-week-amt mono">{formatMoney(Math.round(d.sales), currency).replace(/\.00$/, '')}</span>
                  <div
                    className={`d-week-bar ${isToday ? 'today' : ''}`}
                    style={{ height: mounted ? `${Math.max(2, (d.sales / maxWeek) * 84)}px` : '2px' }}
                  />
                  <span className={`d-week-day ${isToday ? 'today' : ''}`}>{isToday ? 'Today' : d.label}</span>
                </div>
              );
            })}
            {!summary && !summaryError && <span className="d-sub">Loading…</span>}
          </div>
        </section>

        <section className="d-card">
          <div className="d-card-head">
            <h2 className="serif">Best sellers today</h2>
          </div>
          {summary && topItems.length === 0 && <p className="d-sub" style={{ margin: 0 }}>No dishes sold yet today.</p>}
          {topItems.map((item) => (
            <div key={item.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div className="d-row">
                <span style={{ fontWeight: 600 }}>{item.name}</span>
                <span className="d-sub">
                  <span className="mono" style={{ color: 'var(--text)', fontWeight: 600 }}>{item.quantity}</span> sold ·{' '}
                  {formatMoney(item.sales, currency)}
                </span>
              </div>
              <div className="d-track">
                <div className="d-fill" style={{ width: `${(item.quantity / topMax) * 100}%`, background: '#c9a24b' }} />
              </div>
            </div>
          ))}
        </section>

        <section className="d-card">
          <div className="d-card-head">
            <h2 className="serif">Low stock</h2>
            <button className="d-link" onClick={() => onNavigate('raw-materials')}>
              Manage →
            </button>
          </div>
          {summary && summary.lowStock.items.length === 0 && (
            <p className="d-sub" style={{ margin: 0 }}>All raw materials are above their minimum quantity.</p>
          )}
          {summary?.lowStock.items.map((item) => {
            // Bar = current stock as a share of the minimum; red when empty, gold otherwise.
            const out = item.currentStock <= 0;
            const pct = Math.min(100, (item.currentStock / item.minQty) * 100);
            return (
              <div key={item.id} className="d-stock">
                <div className="d-row">
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: out ? 'var(--late)' : 'var(--aging)' }}>
                    {out ? 'Out of stock' : 'Low'}
                  </span>
                </div>
                <div className="d-sub">
                  {item.currentStock} {item.unit} left · minimum {item.minQty} {item.unit}
                </div>
                <div className="d-track">
                  <div className="d-fill" style={{ width: `${out ? 0 : Math.max(pct, 4)}%`, background: out ? '#A23B2E' : '#B8863B' }} />
                </div>
              </div>
            );
          })}
          {summary && summary.lowStock.count > summary.lowStock.items.length && (
            <p className="d-sub" style={{ margin: 0 }}>
              + {summary.lowStock.count - summary.lowStock.items.length} more — open Raw Materials to see all.
            </p>
          )}
        </section>
      </div>
    </div>
  );
};

export default DashboardView;
