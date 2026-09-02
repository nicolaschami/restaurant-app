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

    /* --- Kitchen Pass rail --- */
    .kb-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600;
      letter-spacing: 0.12em; color: #8a8377; margin: 0; }
    .kb-rail-bar { height: 10px; border-radius: 4px; margin-bottom: 2px;
      background: linear-gradient(180deg, #7c766e, #56514a);
      box-shadow: 0 2px 4px rgba(0,0,0,0.15) inset, 0 3px 6px rgba(0,0,0,0.18);
      display: flex; align-items: center; justify-content: space-evenly; padding: 0 12px; }
    .kb-bolt { width: 4px; height: 4px; border-radius: 50%; background: rgba(0,0,0,0.35); }
    .kb-rail-tickets { display: flex; gap: 22px; flex-wrap: wrap; padding: 26px 6px 6px; }
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

    .kb-dial-card { background: #FFFDF8; border: 1px solid #E7E1D2; border-radius: 10px;
      padding: 20px; text-align: center; }
    .kb-dial-center { position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; }
    .kb-dial-num { font-family: 'Bebas Neue', sans-serif; font-size: 34px; color: #221F1C; line-height: 1; }
    .kb-dial-unit { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #8a8377; letter-spacing: 0.08em; }
    .kb-legend-row { display: flex; align-items: center; gap: 8px; padding: 5px 4px; }
    .kb-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .kb-legend-label { font-size: 12px; color: #55504a; flex: 1; }
    .kb-legend-count { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; color: #221F1C; }

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

// ==========================================
// SUB-COMPONENT: SERVICE PULSE DIAL
// ==========================================
const ServicePulseDial: FC<{ tickets: ActiveOrder[]; mounted: boolean; getMins: (t: ActiveOrder) => number }> = ({
  tickets,
  mounted,
  getMins,
}) => {
  const counts = { fresh: 0, aging: 0, late: 0 };
  tickets.forEach((t) => {
    const m = getMins(t);
    if (m >= 20) counts.late++;
    else if (m >= 10) counts.aging++;
    else counts.fresh++;
  });
  const avgMins = tickets.length
    ? Math.round(tickets.reduce((s, t) => s + getMins(t), 0) / tickets.length)
    : 0;

  const R = 54;
  const C = 2 * Math.PI * R;
  const dialPct = Math.min(avgMins / 30, 1);
  const dialColor = avgMins >= 20 ? '#A23B2E' : avgMins >= 10 ? '#B8863B' : '#4C7A5E';

  return (
    <div className="kb-dial-card" style={{ flex: '0 0 240px' }}>
      <p className="kb-eyebrow" style={{ marginBottom: 4 }}>SERVICE PULSE</p>
      <div style={{ position: 'relative', width: 140, height: 140, margin: '8px auto' }}>
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#E7E1D2" strokeWidth="10" />
          <circle
            cx="70" cy="70" r={R} fill="none"
            stroke={dialColor} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={mounted ? C * (1 - dialPct) : C}
            transform="rotate(-90 70 70)"
            style={{ transition: 'stroke-dashoffset 900ms ease 300ms' }}
          />
        </svg>
        <div className="kb-dial-center">
          <span className="kb-dial-num">{avgMins}</span>
          <span className="kb-dial-unit">AVG MIN</span>
        </div>
      </div>
      <div style={{ marginTop: 10, textAlign: 'left' }}>
        <div className="kb-legend-row">
          <span className="kb-legend-dot" style={{ background: '#4C7A5E' }} />
          <span className="kb-legend-label">Fresh</span>
          <span className="kb-legend-count">{counts.fresh}</span>
        </div>
        <div className="kb-legend-row">
          <span className="kb-legend-dot" style={{ background: '#B8863B' }} />
          <span className="kb-legend-label">Aging</span>
          <span className="kb-legend-count">{counts.aging}</span>
        </div>
        <div className="kb-legend-row">
          <span className="kb-legend-dot" style={{ background: '#A23B2E' }} />
          <span className="kb-legend-label">Late</span>
          <span className="kb-legend-count">{counts.late}</span>
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
  const [now, setNow] = useState<number>(Date.now());
  const [mounted, setMounted] = useState(false);
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

  useEffect(() => {
    fetchActiveOrders();

    const fetchInterval = setInterval(fetchActiveOrders, 15000);
    const minuteTicker = setInterval(() => {
      setNow(Date.now());
    }, 60000);
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

  const maxRevenue = Math.max(...SALES_BARS.map((d) => d.revenue));
  const weekTotal = SALES_BARS.reduce((s, d) => s + d.revenue, 0);

  return (
    <div className="space-y-6 p-6">
      <DashboardStyles />

      {/* HEADER SECTION */}
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Welcome back, {restaurantName}! 👋</h1>
          <p className="text-sm text-slate-500">Here is what's happening in your kitchen today.</p>
        </div>
      </div>

      {/* THE PASS: rail + service pulse dial */}
      <div>
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="kb-eyebrow">THE PASS</p>
          <button onClick={() => onNavigate('pos')} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
            Open POS →
          </button>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 560px', minWidth: 300 }} ref={railRef}>
            <div className="kb-rail-bar">
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} className="kb-bolt" />
              ))}
            </div>
            <div className="kb-rail-tickets">
              {isLoadingTickets ? (
                <div className="py-8 text-center text-xs text-slate-400 w-full">Loading active tickets...</div>
              ) : tickets.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 w-full">No active kitchen tickets</div>
              ) : (
                tickets.map((t, i) => {
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
                            {status.label} · {mins}m
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

          <ServicePulseDial tickets={tickets} mounted={mounted} getMins={getMins} />
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

      {/* LOWER SECTION: RECEIPT REVENUE & STOCK */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Weekly revenue */}
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

        {/* Stock Alerts */}
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