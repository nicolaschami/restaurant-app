import { useState, useEffect, useCallback, useRef, type FC } from 'react';
import { api } from '../api';

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

interface Metric {
  label: string;
  value: string;
  change?: string;
  detail?: string;
  icon: string;
  alert?: boolean;
}

interface DashboardViewProps {
  restaurantName: string;
  onNavigate: (tab: string) => void;
  onSelectTicket?: (ticket: ActiveOrder) => void;
}

// ==========================================
// CONSTANTS
// ==========================================
const DASHBOARD_METRICS: Metric[] = [
  { label: "Today's Sales", value: "$1,240.50", change: "+12.5%", icon: "💰" },
  { label: "Menu Items", value: "48", detail: "4 active categories", icon: "🍔" },
  { label: "Stock Alerts", value: "3", detail: "Action required", icon: "⚠️", alert: true },
];

const SALES_BARS = [
  { day: 'MON', revenue: 1260 },
  { day: 'TUE', revenue: 1740 },
  { day: 'WED', revenue: 1440 },
  { day: 'THU', revenue: 2250 },
  { day: 'FRI', revenue: 1950 },
  { day: 'SAT', revenue: 2760 },
  { day: 'SUN', revenue: 2160 },
];

const STOCK_ALERTS = [
  { name: 'Mozzarella Cheese', remaining: '1.2 kg left', progress: 18, color: '#A23B2E', icon: '🧀' },
  { name: 'Chicken Breast', remaining: '3.5 kg left', progress: 35, color: '#B8863B', icon: '🍗' },
  { name: 'Cooking Oil', remaining: '4.2 liters left', progress: 42, color: '#B8863B', icon: '🫗' },
];

const FRESHNESS_META = [
  { key: 'fresh', label: 'Fresh', color: '#4C7A5E' },
  { key: 'aging', label: 'Aging', color: '#B8863B' },
  { key: 'late', label: 'Late', color: '#A23B2E' },
] as const;
type FreshnessKey = (typeof FRESHNESS_META)[number]['key'];

const freshnessOf = (mins: number): FreshnessKey => (mins >= 20 ? 'late' : mins >= 10 ? 'aging' : 'fresh');

const formatDuration = (mins: number): string => {
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
};

const formatDialAvg = (mins: number): { value: number; unit: string } => {
  if (mins < 60) return { value: mins, unit: 'AVG MIN' };
  if (mins < 1440) return { value: Math.round(mins / 60), unit: 'AVG HR' };
  return { value: Math.round(mins / 1440), unit: 'AVG DAY' };
};

const ORDER_TYPE_META = [
  { key: 'dinein', label: 'Dine-In', color: '#5B7C99', match: (s: string) => s.includes('dine') },
  { key: 'takeaway', label: 'Takeaway', color: '#B8863B', match: (s: string) => s.includes('take') || s.includes('pick') },
  { key: 'delivery', label: 'Delivery', color: '#6B6560', match: (s: string) => s.includes('deliver') },
] as const;
type OrderTypeKey = (typeof ORDER_TYPE_META)[number]['key'];

const matchOrderType = (orderType: string) => {
  const s = (orderType || '').toLowerCase();
  return ORDER_TYPE_META.find((m) => m.match(s));
};

// ==========================================
// STYLES
// ==========================================
const DashboardStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@500;600;700&display=swap');
    .ticket-font { font-family: 'Bebas Neue', 'Arial Narrow', sans-serif; letter-spacing: 0.05em; }
    .price-font { font-family: 'JetBrains Mono', ui-monospace, monospace; }
    .ticket-tear-line {
      background-image: repeating-linear-gradient(90deg, #d6d3d1 0 5px, transparent 5px 11px);
      height: 1px;
    }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    .counter-texture {
      background-color: #f4f2ee;
      background-image: radial-gradient(#e2ddd3 1px, transparent 1px);
      background-size: 18px 18px;
    }

    .kb-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600;
      letter-spacing: 0.12em; color: #8a8377; margin: 0; }
    .kb-rail-bar { height: 10px; border-radius: 4px; margin-bottom: 2px;
      background: linear-gradient(180deg, #7c766e, #56514a);
      box-shadow: 0 2px 4px rgba(0,0,0,0.15) inset, 0 3px 6px rgba(0,0,0,0.18);
      display: flex; align-items: center; justify-content: space-evenly; padding: 0 12px; }
    .kb-bolt { width: 4px; height: 4px; border-radius: 50%; background: rgba(0,0,0,0.35); }
    .kb-rail-tickets { display: flex; gap: 22px; flex-wrap: wrap; padding: 16px 6px 6px; }
    .kb-ticket-wrap { position: relative; width: 176px; transition: opacity 460ms ease, transform 460ms ease; }
    .kb-clip { position: absolute; top: -18px; left: 50%; transform: translateX(-50%);
      width: 14px; height: 20px; border-radius: 3px;
      background: linear-gradient(180deg, #9b958a, #6b6560);
      box-shadow: 0 2px 3px rgba(0,0,0,0.25); }
    .kb-ticket { background: #FFFDF8; border: 1px solid #E7E1D2; border-top-width: 4px;
      border-radius: 4px; padding: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.06);
      transition: transform 220ms ease, box-shadow 220ms ease; cursor: pointer; }
    .kb-ticket-wrap:hover .kb-ticket { transform: translateY(-7px) scale(1.025);
      box-shadow: 0 14px 24px rgba(0,0,0,0.14); }
    .kb-ticket-wrap:hover .kb-clip { box-shadow: 0 3px 5px rgba(0,0,0,0.3); }
    .kb-ticket-row { display: flex; align-items: center; justify-content: space-between; }
    .kb-ticket-no { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 13px; color: #221F1C; }
    .kb-badge { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700;
      padding: 2px 6px; border-radius: 3px; letter-spacing: 0.02em; }
    .kb-customer { font-family: 'Bebas Neue', sans-serif; font-size: 20px; letter-spacing: 0.01em;
      color: #221F1C; margin: 8px 0 0; line-height: 1; }
    .kb-meta { font-size: 11px; color: #8a8377; margin: 3px 0 0; }
    .kb-price { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 14px; color: #221F1C; }

    .kb-status-card { background: #FFFDF8; border: 1px solid #E7E1D2; border-radius: 10px;
      padding: 16px 18px; }
    .kb-status-title { font-family: 'Bebas Neue', sans-serif; font-size: 15px; letter-spacing: 0.02em;
      color: #221F1C; margin: 0 0 10px; }
    .kb-status-grid { display: flex; gap: 18px; }
    .kb-status-col { flex: 1 1 150px; min-width: 140px; }
    .kb-status-col + .kb-status-col { border-left: 1px dashed #E7E1D2; padding-left: 18px; }
    .kb-status-col-label { font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 700;
      letter-spacing: 0.1em; color: #8a8377; margin: 0 0 2px; }
    .kb-dial-wrap { position: relative; width: 92px; height: 92px; margin: 4px auto; }
    .kb-dial-center { position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; }
    .kb-dial-num { font-family: 'Bebas Neue', sans-serif; font-size: 24px; color: #221F1C; line-height: 1; }
    .kb-dial-unit { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: #8a8377; letter-spacing: 0.06em; }
    .kb-legend-row { display: flex; align-items: center; gap: 6px; padding: 3px 5px; border-radius: 6px;
      width: 100%; text-align: left; border: none; background: transparent; cursor: pointer;
      transition: background 120ms ease; }
    .kb-legend-row:hover { background: #F1ECDC; }
    .kb-legend-row.active { background: #F1ECDC; box-shadow: inset 0 0 0 1px #E7E1D2; }
    .kb-legend-row.dimmed { opacity: 0.45; }
    .kb-legend-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .kb-legend-label { font-size: 10.5px; color: #55504a; flex: 1; }
    .kb-legend-count { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 700; color: #221F1C; }

    .kb-filter-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px;
      font-family: 'JetBrains Mono', monospace; font-weight: 600; color: #221F1C;
      background: #F1ECDC; border: 1px solid #E7E1D2; padding: 3px 6px 3px 10px; border-radius: 12px;
      cursor: pointer; }
    .kb-filter-chip .dot { width: 6px; height: 6px; border-radius: 50%; }
    .kb-filter-chip:hover { background: #EAE3CE; }

    .kb-ws-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11px;
      font-family: 'JetBrains Mono', monospace; font-weight: 600; color: #8a8377; }
    .kb-ws-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .kb-ws-dot.live { background: #4C7A5E; box-shadow: 0 0 0 3px rgba(76,122,94,0.18); }
    .kb-ws-dot.connecting { background: #B8863B; animation: kb-pulse 1.2s ease-in-out infinite; }
    .kb-ws-dot.offline { background: #A23B2E; }
    @keyframes kb-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

    .kb-receipt { background: #FFFDF8; border: 1px solid #E7E1D2; border-radius: 4px;
      padding: 22px 22px 18px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
    .kb-receipt-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
    .kb-receipt-day { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #55504a; width: 34px; }
    .kb-receipt-bar-track { flex: 1; height: 6px; background: #EFEAE0; border-radius: 3px; overflow: hidden; }
    .kb-receipt-bar { height: 100%; background: #4C7A5E; border-radius: 3px; transition: width 700ms ease; }
    .kb-receipt-amt { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600;
      color: #221F1C; width: 62px; text-align: right; }
    .kb-barcode { margin-top: 14px; height: 22px;
      background-image: repeating-linear-gradient(90deg, #221F1C 0 2px, transparent 2px 5px,
        #221F1C 5px 6px, transparent 6px 9px, #221F1C 9px 12px, transparent 12px 16px);
      opacity: 0.8; }
  `}</style>
);

// SUB-COMPONENT: MINI RING
const MiniRing: FC<{
  segments: { color: string; pct: number; dimmed?: boolean }[];
  centerValue: string | number;
  centerUnit: string;
  mounted: boolean;
}> = ({ segments, centerValue, centerUnit, mounted }) => {
  const R = 34;
  const C = 2 * Math.PI * R;
  let cumulative = 0;

  return (
    <div className="kb-dial-wrap">
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle cx="46" cy="46" r={R} fill="none" stroke="#E7E1D2" strokeWidth="7" />
        {segments.map((seg, i) => {
          if (seg.pct <= 0) return null;
          const segLen = mounted ? seg.pct * C : 0;
          const gap = C - segLen;
          const rotation = -90 + cumulative * 360;
          cumulative += seg.pct;
          return (
            <circle
              key={i}
              cx="46" cy="46" r={R} fill="none"
              stroke={seg.color} strokeWidth="7" strokeLinecap={segments.length === 1 ? 'round' : 'butt'}
              strokeOpacity={seg.dimmed ? 0.25 : 1}
              strokeDasharray={`${segLen} ${gap}`}
              transform={`rotate(${rotation} 46 46)`}
              style={{ transition: 'stroke-dasharray 900ms ease 300ms, stroke-opacity 150ms ease' }}
            />
          );
        })}
      </svg>
      <div className="kb-dial-center">
        <span className="kb-dial-num">{centerValue}</span>
        <span className="kb-dial-unit">{centerUnit}</span>
      </div>
    </div>
  );
};

// SUB-COMPONENT: KITCHEN STATUS CARD
const KitchenStatusCard: FC<{
  tickets: ActiveOrder[];
  mounted: boolean;
  getMins: (t: ActiveOrder) => number;
  freshnessFilter: FreshnessKey | null;
  onToggleFreshness: (key: FreshnessKey) => void;
  typeFilter: OrderTypeKey | null;
  onToggleType: (key: OrderTypeKey) => void;
}> = ({ tickets, mounted, getMins, freshnessFilter, onToggleFreshness, typeFilter, onToggleType }) => {
  const freshCounts = { fresh: 0, aging: 0, late: 0 };
  tickets.forEach((t) => freshCounts[freshnessOf(getMins(t))]++);
  const avgMins = tickets.length
    ? Math.round(tickets.reduce((s, t) => s + getMins(t), 0) / tickets.length)
    : 0;
  const dialPct = Math.min(avgMins / 30, 1);
  const dialColor = avgMins >= 20 ? '#A23B2E' : avgMins >= 10 ? '#B8863B' : '#4C7A5E';
  const dialAvg = formatDialAvg(avgMins);

  const typeCounts = { dinein: 0, takeaway: 0, delivery: 0 };
  tickets.forEach((t) => {
    const meta = matchOrderType(t.orderType);
    if (meta) typeCounts[meta.key]++;
  });
  const total = tickets.length;
  const typeSegments = ORDER_TYPE_META.map((meta) => {
    const count = typeCounts[meta.key];
    const pct = total > 0 ? count / total : 0;
    return { ...meta, count, pct, dimmed: typeFilter !== null && typeFilter !== meta.key };
  });

  return (
    <div className="kb-status-card" style={{ flex: '0 0 auto' }}>
      <p className="kb-status-title">Kitchen Status</p>
      <div className="kb-status-grid">
        <div className="kb-status-col">
          <p className="kb-status-col-label">PACE</p>
          <MiniRing
            segments={[{ color: dialColor, pct: dialPct }]}
            centerValue={dialAvg.value}
            centerUnit={dialAvg.unit}
            mounted={mounted}
          />
          <div style={{ marginTop: 4 }}>
            {FRESHNESS_META.map((f) => (
              <button
                key={f.key}
                className={`kb-legend-row ${freshnessFilter === f.key ? 'active' : ''} ${
                  freshnessFilter && freshnessFilter !== f.key ? 'dimmed' : ''
                }`}
                onClick={() => onToggleFreshness(f.key)}
                title={`Show only ${f.label} tickets`}
              >
                <span className="kb-legend-dot" style={{ background: f.color }} />
                <span className="kb-legend-label">{f.label}</span>
                <span className="kb-legend-count">{freshCounts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="kb-status-col">
          <p className="kb-status-col-label">MIX</p>
          <MiniRing
            segments={typeSegments.map((s) => ({ color: s.color, pct: s.pct, dimmed: s.dimmed }))}
            centerValue={total}
            centerUnit="ACTIVE"
            mounted={mounted}
          />
          <div style={{ marginTop: 4 }}>
            {typeSegments.map((seg) => (
              <button
                key={seg.key}
                className={`kb-legend-row ${typeFilter === seg.key ? 'active' : ''} ${seg.dimmed ? 'dimmed' : ''}`}
                onClick={() => onToggleType(seg.key)}
                title={`Show only ${seg.label} tickets`}
              >
                <span className="kb-legend-dot" style={{ background: seg.color }} />
                <span className="kb-legend-label">{seg.label}</span>
                <span className="kb-legend-count">{seg.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// DASHBOARD VIEW
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
  const railRef = useRef<HTMLDivElement>(null);

  const fetchActiveOrders = useCallback(async () => {
    try {
      const response = await api.get('/orders/active', {
        params: { restaurantId: 1 },
      });
      setTickets(response.data.orders || []);
    } catch (err) {
      console.error('Failed to fetch active orders:', err);
    } finally {
      setIsLoadingTickets(false);
    }
  }, []);

  // Open Cash Drawer Handler
  const handleOpenDrawer = async () => {
    try {
      setIsOpeningDrawer(true);
      const selectedPrinter = localStorage.getItem('pos_printer_name') || 'POS-80';
      await api.post('/open-drawer', { printerName: selectedPrinter });
    } catch (err: any) {
      console.error('Failed to open drawer:', err);
      alert(err.response?.data?.error || 'Could not open cash drawer.');
    } finally {
      setIsOpeningDrawer(false);
    }
  };

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let unmounted = false;

    const connect = () => {
      const httpBase: string = (api.defaults?.baseURL as string) || window.location.origin;
      const wsBase = httpBase.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
      const wsUrl = `${wsBase}/ws?restaurantId=1`;
      setWsStatus('connecting');
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        attempt = 0;
        setWsStatus('live');
      };

      socket.onmessage = (event) => {
        try {
          const { event: eventName } = JSON.parse(event.data);
          if (eventName === 'ORDER_UPDATED' || eventName === 'ORDER_STATUS_UPDATED') {
            fetchActiveOrders();
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
  }, [fetchActiveOrders]);

  useEffect(() => {
    fetchActiveOrders();
    const fetchInterval = setInterval(fetchActiveOrders, 60000);
    const minuteTicker = setInterval(() => setNow(Date.now()), 60000);
    const mountTimer = setTimeout(() => setMounted(true), 60);

    return () => {
      clearInterval(fetchInterval);
      clearInterval(minuteTicker);
      clearTimeout(mountTimer);
    };
  }, [fetchActiveOrders]);

  const getElapsedMinutes = useCallback(
    (createdAtStr?: string) => {
      if (!createdAtStr) return 0;
      const createdTime = new Date(createdAtStr).getTime();
      if (isNaN(createdTime)) return 0;
      return Math.max(0, Math.floor((now - createdTime) / (1000 * 60)));
    },
    [now]
  );

  const getMins = (t: ActiveOrder) => getElapsedMinutes(t.created_at || t.createdAt);

  const toggleType = (key: OrderTypeKey) => setTypeFilter((prev) => (prev === key ? null : key));
  const toggleFreshness = (key: FreshnessKey) => setFreshnessFilter((prev) => (prev === key ? null : key));
  const clearFilters = () => {
    setTypeFilter(null);
    setFreshnessFilter(null);
  };

  const displayedTickets = tickets.filter((t) => {
    if (typeFilter) {
      const meta = matchOrderType(t.orderType);
      if (!meta || meta.key !== typeFilter) return false;
    }
    if (freshnessFilter) {
      if (freshnessOf(getMins(t)) !== freshnessFilter) return false;
    }
    return true;
  });

  const typeLabel = typeFilter ? ORDER_TYPE_META.find((m) => m.key === typeFilter) : null;
  const freshLabel = freshnessFilter ? FRESHNESS_META.find((f) => f.key === freshnessFilter) : null;

  const maxRevenue = Math.max(...SALES_BARS.map((d) => d.revenue));
  const weekTotal = SALES_BARS.reduce((s, d) => s + d.revenue, 0);

  return (
    <div className="space-y-6 p-6">
      <DashboardStyles />

      {/* HEADER SECTION */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="text-2xl font-bold text-slate-800">Welcome back, {restaurantName}! 👋</h1>
          <span className="kb-ws-status">
            <span className={`kb-ws-dot ${wsStatus}`} />
            {wsStatus === 'live' ? 'Live' : wsStatus === 'connecting' ? 'Connecting…' : 'Offline'}
          </span>
        </div>
        <p className="text-sm text-slate-500">Here is what's happening in your kitchen today.</p>
      </div>

      {/* THE PASS */}
      <div>
        <div className="mb-3 flex items-center justify-between px-1" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p className="kb-eyebrow">THE PASS</p>
            {typeLabel && (
              <button className="kb-filter-chip" onClick={() => toggleType(typeLabel.key)}>
                <span className="dot" style={{ background: typeLabel.color }} />
                {typeLabel.label} ✕
              </button>
            )}
            {freshLabel && (
              <button className="kb-filter-chip" onClick={() => toggleFreshness(freshLabel.key)}>
                <span className="dot" style={{ background: freshLabel.color }} />
                {freshLabel.label} ✕
              </button>
            )}
            {(typeFilter || freshnessFilter) && (
              <button className="kb-filter-chip" onClick={clearFilters} style={{ opacity: 0.7 }}>
                Clear all
              </button>
            )}
          </div>
          
          {/* EQUAL-STYLED ACTION BUTTONS */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleOpenDrawer}
              disabled={isOpeningDrawer}
              className="text-xs font-semibold text-amber-600 hover:text-amber-700 disabled:opacity-50 transition-colors"
            >
              {isOpeningDrawer ? 'Opening Drawer...' : 'Open Cash Drawer 📥'}
            </button>
            <button 
              onClick={() => onNavigate('pos')} 
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              Open POS →
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', items: 'flex-start' }}>
          <div style={{ flex: '1 1 560px', minWidth: 300 }} ref={railRef}>
            <div className="kb-rail-bar">
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} className="kb-bolt" />
              ))}
            </div>
            <div className="kb-rail-tickets">
              {isLoadingTickets ? (
                <div className="py-8 text-center text-xs text-slate-400 w-full">Loading active tickets...</div>
              ) : displayedTickets.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 w-full">
                  {tickets.length === 0 ? 'No active kitchen tickets' : 'No tickets match the current filter'}
                </div>
              ) : (
                displayedTickets.map((t, i) => {
                  const mins = getMins(t);
                  const angle = (i % 2 === 0 ? -1 : 1) * (1.2 + (i % 3) * 0.6);
                  const status =
                    mins >= 20
                      ? { label: 'LATE', color: '#A23B2E', bg: '#F7ECEA' }
                      : mins >= 10
                      ? { label: 'AGING', color: '#B8863B', bg: '#F8F1E4' }
                      : { label: 'FRESH', color: '#4C7A5E', bg: '#EEF3EE' };
                  const label = t.customerName || `${t.orderType} Order`;

                  return (
                    <div
                      key={t.orderId}
                      className="kb-ticket-wrap cursor-pointer"
                      onClick={() => {
                        if (onSelectTicket) {
                          onSelectTicket(t);
                        } else {
                          onNavigate('pos');
                        }
                      }}
                      style={{
                        transitionDelay: `${i * 90}ms`,
                        opacity: mounted ? 1 : 0,
                        transform: mounted ? `translateY(0) rotate(${angle}deg)` : `translateY(-18px) rotate(${angle}deg)`,
                      }}
                    >
                      <span className="kb-clip" />
                      <div className="kb-ticket" style={{ borderTopColor: status.color }}>
                        <div className="kb-ticket-row">
                          <span className="kb-ticket-no">#{t.ticketNo}</span>
                          <span className="kb-badge" style={{ color: status.color, background: status.bg }}>
                            {status.label} · {formatDuration(mins)}
                          </span>
                        </div>
                        <p className="kb-customer" title={label}>{label}</p>
                        <p className="kb-meta">{t.orderType} · {t.itemCount} items</p>
                        <div className="ticket-tear-line" style={{ margin: '10px 0' }} />
                        <div className="kb-ticket-row">
                          <span className="kb-meta">TOTAL</span>
                          <span className="kb-price">${Number(t.totalAmount || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <KitchenStatusCard
            tickets={tickets}
            mounted={mounted}
            getMins={getMins}
            freshnessFilter={freshnessFilter}
            onToggleFreshness={toggleFreshness}
            typeFilter={typeFilter}
            onToggleType={toggleType}
          />
        </div>
      </div>

      {/* METRICS GRID */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {DASHBOARD_METRICS.map((metric, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-2xl">{metric.icon}</span>
              {metric.change && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                  {metric.change}
                </span>
              )}
            </div>
            <div className="mt-4">
              <h3 className="text-2xl font-bold text-slate-800">{metric.value}</h3>
              <p className="text-xs font-medium text-slate-500">{metric.label}</p>
            </div>
            {metric.detail && (
              <p className={`mt-2 text-xs ${metric.alert ? 'font-semibold text-amber-600' : 'text-slate-400'}`}>
                {metric.detail}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* LOWER SECTION */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <p className="kb-eyebrow" style={{ marginBottom: 8 }}>THIS WEEK</p>
          <div className="kb-receipt">
            {SALES_BARS.map((d) => (
              <div className="kb-receipt-row" key={d.day}>
                <span className="kb-receipt-day">{d.day}</span>
                <div className="kb-receipt-bar-track">
                  <div
                    className="kb-receipt-bar"
                    style={{ width: mounted ? `${(d.revenue / maxRevenue) * 100}%` : '0%' }}
                  />
                </div>
                <span className="kb-receipt-amt">${d.revenue.toLocaleString()}</span>
              </div>
            ))}
            <div className="ticket-tear-line" style={{ margin: '14px 0' }} />
            <div className="kb-receipt-row">
              <span className="kb-receipt-day" style={{ fontWeight: 700 }}>TOTAL</span>
              <span style={{ flex: 1 }} />
              <span className="kb-price" style={{ fontSize: 18 }}>${weekTotal.toLocaleString()}</span>
            </div>
            <div className="kb-barcode" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">Low Stock Alerts</h2>
            <button
              onClick={() => onNavigate('raw-materials')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Manage
            </button>
          </div>
          <div className="space-y-4">
            {STOCK_ALERTS.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                <span className="text-xl">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-700 truncate">{item.name}</span>
                    <span className="text-slate-400">{item.remaining}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full" style={{ width: `${item.progress}%`, background: item.color }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;