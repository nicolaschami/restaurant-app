import { useState, useRef, useEffect, type FC } from 'react';
import { api } from './api';

interface ActiveOrder {
  orderId: number;
  ticketNo: number;
  orderType: string;
  status: string;
  totalAmount: string;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  itemCount: number;
  createdAt?: string; // Optional timestamp to calculate exact elapsed minutes
}

// ==========================================
// IMPORTS (Page & Component Dependencies)
// ==========================================
import Login from './pages/Login';
import SidebarLayout from './components/SidebarLayout';
import Categories from './pages/Categories';
import MenuItems from './pages/Products';
import Modifiers from './pages/Modifiers';
import RawMaterials from './pages/RawMaterials';
import SuppliersPage from './pages/Suppliers';
import PosScreen from './pages/PosScreen';
import Tables from './pages/Tablo';
import Customers from './pages/customers';

// ==========================================
// TYPES & MOCK DATA
// ==========================================
interface Metric {
  label: string;
  value: string;
  change?: string;
  detail?: string;
  icon: string;
  alert?: boolean;
}

const DASHBOARD_METRICS: Metric[] = [
  { label: "Today's Sales", value: "$1,240.50", change: "+12.5%", icon: "💰" },
  { label: "Active Orders", value: "18", detail: "8 kitchen · 10 ready", icon: "🧾" },
  { label: "Menu Items", value: "48", detail: "4 active categories", icon: "🍔" },
  { label: "Stock Alerts", value: "3", detail: "Action required", icon: "⚠️", alert: true },
];

const SALES_BARS = [
  { day: 'Mon', value: 42, revenue: '$1,260' },
  { day: 'Tue', value: 58, revenue: '$1,740' },
  { day: 'Wed', value: 48, revenue: '$1,440' },
  { day: 'Thu', value: 75, revenue: '$2,250' },
  { day: 'Fri', value: 65, revenue: '$1,950' },
  { day: 'Sat', value: 92, revenue: '$2,760', active: true },
  { day: 'Sun', value: 72, revenue: '$2,160' },
];

const STOCK_ALERTS = [
  { name: 'Mozzarella Cheese', remaining: '1.2 kg left', progress: 18, color: 'bg-red-500', bg: 'bg-red-50', icon: '🧀' },
  { name: 'Chicken Breast', remaining: '3.5 kg left', progress: 35, color: 'bg-amber-500', bg: 'bg-amber-50', icon: '🍗' },
  { name: 'Cooking Oil', remaining: '4.2 liters left', progress: 42, color: 'bg-amber-500', bg: 'bg-amber-50', icon: '🫗' },
];

// ==========================================
// SHARED STYLE INJECTION (fonts + ticket motif)
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
    .ticket-stub {
      clip-path: polygon(0% 0%, 100% 0%, 100% 91%, 94% 100%, 88% 91%, 82% 100%, 76% 91%, 70% 100%, 64% 91%, 58% 100%, 52% 91%, 46% 100%, 40% 91%, 34% 100%, 28% 91%, 22% 100%, 16% 91%, 10% 100%, 4% 91%, 0% 100%);
    }
    @keyframes steamRise {
      0% { transform: translateY(0) scale(1); opacity: 0; }
      20% { opacity: 0.55; }
      100% { transform: translateY(-16px) scale(1.6); opacity: 0; }
    }
    .steam-wisp {
      position: absolute;
      bottom: 100%;
      width: 5px;
      height: 12px;
      border-radius: 50%;
      background: rgba(255,255,255,0.6);
      filter: blur(2px);
      animation: steamRise 2.6s ease-in infinite;
    }
  `}</style>
);

// ==========================================
// SUB-COMPONENT: DASHBOARD VIEW
// ==========================================
interface DashboardViewProps {
  restaurantName: string;
  onNavigate: (tab: string) => void;
}

const DashboardView: FC<DashboardViewProps> = ({ restaurantName, onNavigate }) => {
  const [tickets, setTickets] = useState<ActiveOrder[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState<boolean>(true);
  const railRef = useRef<HTMLDivElement>(null);

  const fetchActiveOrders = async () => {
    try {
    const response = await api.get('/orders/active', {
  params: { restaurantId: '1' },
});
      setTickets(response.data.orders || []);
    } catch (err) {
      console.error('Failed to fetch active orders:', err);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  useEffect(() => {
    fetchActiveOrders();
    // Poll every 15 seconds to keep live tickets updated
    const interval = setInterval(fetchActiveOrders, 15000);
    return () => clearInterval(interval);
  }, []);

  const scrollRail = (dir: 'left' | 'right') => {
    railRef.current?.scrollBy({ left: dir === 'left' ? -190 : 190, behavior: 'smooth' });
  };

  const getElapsedMinutes = (createdAt?: string) => {
    if (!createdAt) return 0;
    const diffMs = Date.now() - new Date(createdAt).getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60)));
  };

  return (
    <div className="h-full overflow-y-auto counter-texture px-4 sm:px-6 lg:px-8 py-6 pb-20 space-y-6">
      <DashboardStyles />

      {/* 1. HERO HEADER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#1c1917] via-[#241d17] to-[#2b2118] p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-[#c2621f]/15 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-6 w-6 items-center justify-center rounded-md bg-[#c2621f]/25 text-xs">
                🍽️
                <span className="steam-wisp" style={{ left: '5px', animationDelay: '0s' }} />
                <span className="steam-wisp" style={{ left: '14px', animationDelay: '1.1s' }} />
              </span>
              <span className="text-xs font-semibold uppercase tracking-widest text-[#e8ceb8]">Tasty Bistro</span>
            </div>
            <h1 className="ticket-font uppercase text-2xl sm:text-3xl lg:text-4xl text-white">
              Good afternoon 👋
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Here is what is happening at <span className="font-semibold text-white">{restaurantName}</span> today.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('pos')}
              className="rounded-xl bg-gradient-to-r from-[#8a3f16] to-[#c2621f] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-[#8a3f16]/30 transition hover:opacity-95 hover:scale-[1.02] active:scale-95"
            >
              Open POS
            </button>
            <button
              onClick={() => onNavigate('raw-materials')}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-xs font-semibold text-slate-200 backdrop-blur transition hover:bg-white/10"
            >
              Inventory
            </button>
          </div>
        </div>
      </div>

      {/* 2. KPI METRICS GRID */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {DASHBOARD_METRICS.map((metric) => (
          <div
            key={metric.label}
            className={`ticket-stub relative overflow-hidden border p-5 pb-8 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${
              metric.alert
                ? 'border-[#f0c9a6] bg-gradient-to-br from-[#fdece1]/80 to-white'
                : 'border-slate-200/80 bg-white'
            }`}
          >
            {!metric.alert && (
              <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-[#8a3f16] to-[#c2621f]" />
            )}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{metric.label}</p>
                <h2 className="mt-2 text-3xl font-black price-font tracking-tight text-[#1c1917]">{metric.value}</h2>

                {metric.change && (
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    ↗ {metric.change} <span className="font-normal text-slate-400">vs yesterday</span>
                  </span>
                )}
                {metric.detail && (
                  <p className="mt-2 text-xs font-medium text-slate-500">{metric.detail}</p>
                )}
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl shadow-inner ${metric.alert ? 'bg-[#f0c9a6]/50' : 'bg-slate-100'}`}>
                {metric.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 3. MAIN SECTION GRID */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        
        {/* Live Kitchen Rail (API Integrated) */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="ticket-font uppercase text-lg text-[#1c1917]">Live Kitchen Rail</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdece1] px-2.5 py-0.5 text-xs font-bold text-[#8a3f16] ring-1 ring-inset ring-[#f0c9a6]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#c2621f] animate-ping" />
                  {tickets.length} Pending
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Oldest tickets flagged in red</p>
            </div>
            <button
              onClick={() => onNavigate('pos')}
              className="text-xs font-semibold text-[#b5541f] hover:text-[#8a3f16]"
            >
              View All →
            </button>
          </div>

          <div className="relative">
            <div className="absolute left-9 right-9 top-0 h-[3px] bg-[#1c1917] rounded-full" />

            {/* Floating carousel arrows */}
            <button
              onClick={() => scrollRail('left')}
              aria-label="Scroll rail left"
              className="absolute left-0 top-1/2 mt-1.5 -translate-y-1/2 z-20 h-9 w-9 flex items-center justify-center rounded-full bg-white border border-slate-200 shadow-md text-slate-500 text-lg leading-none hover:bg-gradient-to-r hover:from-[#8a3f16] hover:to-[#c2621f] hover:text-white hover:border-transparent hover:scale-105 active:scale-95 transition-all"
            >
              ‹
            </button>
            <button
              onClick={() => scrollRail('right')}
              aria-label="Scroll rail right"
              className="absolute right-0 top-1/2 mt-1.5 -translate-y-1/2 z-20 h-9 w-9 flex items-center justify-center rounded-full bg-white border border-slate-200 shadow-md text-slate-500 text-lg leading-none hover:bg-gradient-to-r hover:from-[#8a3f16] hover:to-[#c2621f] hover:text-white hover:border-transparent hover:scale-105 active:scale-95 transition-all"
            >
              ›
            </button>

            <div
              ref={railRef}
              className="flex gap-4 overflow-x-auto no-scrollbar px-11 pb-2 pt-[9px] snap-x scroll-smooth"
            >
              {isLoadingTickets ? (
                <div className="py-8 text-center text-xs text-slate-400 w-full">Loading active tickets...</div>
              ) : tickets.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 w-full">No active kitchen tickets</div>
              ) : (
                tickets.map((t) => {
                  const mins = getElapsedMinutes(t.createdAt);
                  const isOverdue = mins >= 20;
                  const isAging = mins >= 10;
                  const dotColor = isOverdue ? 'bg-red-500' : isAging ? 'bg-amber-500' : 'bg-emerald-500';
                  const badgeClass = isOverdue
                    ? 'bg-red-100 text-red-700 border-red-200'
                    : isAging
                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                    : 'bg-emerald-100 text-emerald-700 border-emerald-200';

                  const label = t.customerName || `${t.orderType} Order`;

                  return (
                    <div key={t.orderId} className="relative shrink-0 w-44 snap-start">
                      <div className={`absolute left-1/2 -top-[3px] -translate-x-1/2 h-3 w-3 rounded-full ${dotColor} ring-4 ring-white z-10`} />
                      <div
                        className={`mt-2.5 rounded-2xl border p-4 transition-all hover:shadow-md ${
                          isOverdue ? 'border-red-200 bg-red-50/30' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="price-font text-xs font-bold text-[#1c1917]">#{t.ticketNo}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border price-font ${badgeClass}`}>
                            {mins}m{isOverdue ? ' !' : ''}
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-bold text-slate-800 truncate" title={label}>{label}</p>
                        <p className="text-xs text-slate-400">{t.orderType} · {t.itemCount} items</p>
                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-2">
                          <span className="text-xs text-slate-400">Total</span>
                          <span className="price-font text-sm font-bold text-[#1c1917]">
                            ${Number(t.totalAmount || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Quick Navigation Panel */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <h2 className="ticket-font uppercase text-lg text-[#1c1917]">Quick Actions</h2>
          <p className="mt-1 text-xs text-slate-400">Manage operations quickly</p>

          <div className="mt-4 space-y-2">
            {[
              { tab: 'categories', label: 'Categories', desc: 'Organize menu structure', icon: '🗂️' },
              { tab: 'menu-items', label: 'Menu Items', desc: 'Add or edit products', icon: '🍔' },
              { tab: 'modifiers', label: 'Modifiers', desc: 'Manage options & add-ons', icon: '✨' },
              { tab: 'raw-materials', label: 'Inventory', desc: 'Track raw materials', icon: '📦' },
            ].map((item) => (
              <button
                key={item.tab}
                onClick={() => onNavigate(item.tab)}
                className="group flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:border-[#f0c9a6] hover:bg-[#fdece1]/50"
              >
                <span className="text-2xl">{item.icon}</span>
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-800 group-hover:text-[#b5541f] transition">
                    {item.label}
                  </p>
                  <p className="text-[10px] text-slate-400">{item.desc}</p>
                </div>
                <span className="text-xs text-slate-300 group-hover:text-[#b5541f] transition">→</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. BOTTOM CHARTS & INVENTORY ALERTS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        
        {/* Analytics Bar Chart */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="ticket-font uppercase text-lg text-[#1c1917]">Sales Analytics</h2>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 ring-1 ring-inset ring-emerald-200">
                  +12.5% vs last week
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Revenue overview over the past 7 days</p>
            </div>
            
            <select className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-100 focus:ring-2 focus:ring-[#c2621f]/20">
              <option>Last 7 days</option>
              <option>Last 30 days</option>
            </select>
          </div>

          <div className="relative mt-8 flex h-48 items-end gap-3 sm:gap-6 pt-6">
            {SALES_BARS.map((bar) => (
              <div key={bar.day} className="group relative flex h-full flex-1 flex-col justify-end items-center">
                <div className="absolute -top-6 hidden flex-col items-center group-hover:flex">
                  <span className="rounded-md bg-[#1c1917] px-2 py-1 text-[10px] price-font font-medium text-white shadow-md">
                    {bar.revenue}
                  </span>
                </div>
                <div
                  className={`w-full max-w-[32px] rounded-t-lg transition-all duration-300 ${
                    bar.active
                      ? 'bg-gradient-to-t from-[#8a3f16] via-[#c2621f] to-[#e0925a] shadow-md shadow-[#8a3f16]/20'
                      : 'bg-slate-800 group-hover:bg-gradient-to-t group-hover:from-[#8a3f16] group-hover:to-[#c2621f]'
                  }`}
                  style={{ height: `${bar.value * 1.3}px` }}
                />
                <p className={`mt-2 text-xs font-semibold ${bar.active ? 'text-[#b5541f]' : 'text-slate-400'}`}>
                  {bar.day}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Inventory Stock Alerts */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="ticket-font uppercase text-lg text-[#1c1917]">Stock Alerts</h2>
                <p className="mt-1 text-xs text-slate-400">Items requiring restock</p>
              </div>
              <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600">
                3 ALERTS
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {STOCK_ALERTS.map((alert) => (
                <div key={alert.name} className={`rounded-xl p-3 ${alert.bg}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{alert.name}</p>
                      <p className="mt-0.5 text-[10px] price-font font-semibold text-slate-500">{alert.remaining}</p>
                    </div>
                    <span className="text-xl">{alert.icon}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-black/5">
                    <div className={`h-full rounded-full ${alert.color}`} style={{ width: `${alert.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => onNavigate('raw-materials')}
            className="w-full rounded-xl bg-gradient-to-r from-[#8a3f16] to-[#c2621f] py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:opacity-95"
          >
            Manage Inventory
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// MAIN APP COMPONENT
// ==========================================
export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [restaurantName, setRestaurantName] = useState<string>(
    localStorage.getItem('restaurantName') || 'My Restaurant'
  );
  const [activeTab, setActiveTab] = useState('dashboard');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('restaurantName');
    setToken(null);
  };

  if (!token) {
    return (
      <Login
        onLoginSuccess={(jwt, name) => {
          setToken(jwt);
          setRestaurantName(name);
        }}
      />
    );
  }

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView restaurantName={restaurantName} onNavigate={setActiveTab} />;
      case 'categories':
        return <Categories onLogout={handleLogout} />;
      case 'menu-items':
        return <MenuItems onLogout={handleLogout} />;
      case 'modifiers':
        return <Modifiers onLogout={handleLogout} />;
      case 'raw-materials':
        return <RawMaterials onLogout={handleLogout} />;
      case 'partners':
      case 'suppliers':
        return <SuppliersPage />;
      case 'pos':
        return <PosScreen onLogout={handleLogout} />;
      case 'settings':
      case 'tabels':
        return <Tables />;
      case 'customers':
        return <Customers />;
      default:
        return <DashboardView restaurantName={restaurantName} onNavigate={setActiveTab} />;
    }
  };

  return (
    <SidebarLayout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      restaurantName={restaurantName}
      onLogout={handleLogout}
    >
      {renderActiveView()}
    </SidebarLayout>
  );
}