import { useState } from 'react';
import Login from './pages/Login';
import SidebarLayout from './components/SidebarLayout';

import Categories from './pages/Categories';
import MenuItems from './pages/Products';
import Modifiers from './pages/Modifiers';
import RawMaterials from './pages/RawMaterials';
import SuppliersPage from './pages/Suppliers';
export default function App() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('token')
  );

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

  return (
    <SidebarLayout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      restaurantName={restaurantName}
      onLogout={handleLogout}
    >
      {/* ================= DASHBOARD ================= */}
      {activeTab === 'dashboard' && (
        
<div className="min-h-full bg-slate-50 px-4 sm:px-6 lg:px-8 pt-2 sm:pt-3 lg:pt-4 pb-4 sm:pb-6 lg:pb-8">
  <div className="mx-auto w-full max-w-[1600px] flex-1 space-y-6 flex flex-col justify-between">

            {/* HERO HEADER */}
           {/* COMPACT HERO */}
<div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-stone-800 px-6 py-5 shadow-lg">
  <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500 text-sm">
          🍽️
        </span>

        <span className="text-xs font-semibold uppercase tracking-wider text-orange-300">
          Tasty Bistro
        </span>
      </div>

      <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl">
        Good afternoon 👋
      </h1>

      <p className="mt-1 text-xs text-slate-300 sm:text-sm">
        Here's what's happening at{' '}
        <span className="font-semibold text-white">
          {restaurantName}
        </span>{' '}
        today.
      </p>
    </div>

    <div className="flex items-center gap-2">
      <button
        onClick={() => setActiveTab('menu-items')}
        className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-orange-400"
      >
        + Add Menu Item
      </button>

      <button
        onClick={() => setActiveTab('raw-materials')}
        className="rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/15"
      >
        Inventory
      </button>
    </div>
  </div>

  {/* subtle decorative glow */}
  <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-orange-500/10 blur-2xl" />
</div>


            {/* STAT CARDS */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

              {/* Sales */}
              <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Today's Sales
                    </p>

                    <h2 className="mt-2 text-3xl font-extrabold text-slate-900">
                      $1,240.50
                    </h2>

                    <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      <span>↗</span>
                      <span>12.5%</span>
                      <span className="font-normal text-slate-400">
                        vs yesterday
                      </span>
                    </div>
                  </div>

                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-xl">
                    💰
                  </div>
                </div>

                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full w-[72%] rounded-full bg-emerald-500" />
                </div>
              </div>

              {/* Orders */}
              <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Active Orders
                    </p>

                    <h2 className="mt-2 text-3xl font-extrabold text-slate-900">
                      18
                    </h2>

                    <p className="mt-2 text-xs text-slate-400">
                      <span className="font-semibold text-indigo-600">
                        8
                      </span>{' '}
                      in kitchen ·{' '}
                      <span className="font-semibold text-emerald-600">
                        10
                      </span>{' '}
                      ready
                    </p>
                  </div>

                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-xl">
                    🧾
                  </div>
                </div>

                <div className="mt-4 flex gap-1">
                  {[...Array(8)].map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${
                        i < 5 ? 'bg-indigo-500' : 'bg-slate-100'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Menu */}
              <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Menu Items
                    </p>

                    <h2 className="mt-2 text-3xl font-extrabold text-slate-900">
                      48
                    </h2>

                    <p className="mt-2 text-xs text-slate-400">
                      Across{' '}
                      <span className="font-semibold text-slate-700">
                        4 categories
                      </span>
                    </p>
                  </div>

                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-xl">
                    🍔
                  </div>
                </div>

                <div className="mt-4 flex -space-x-1">
                  <div className="h-5 w-5 rounded-full bg-orange-400 ring-2 ring-white" />
                  <div className="h-5 w-5 rounded-full bg-emerald-400 ring-2 ring-white" />
                  <div className="h-5 w-5 rounded-full bg-indigo-400 ring-2 ring-white" />
                  <div className="h-5 w-5 rounded-full bg-violet-400 ring-2 ring-white" />
                  <div className="ml-2 text-[10px] text-slate-400">
                    Categories
                  </div>
                </div>
              </div>

              {/* Stock */}
              <div className="group rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">
                      Stock Alerts
                    </p>

                    <h2 className="mt-2 text-3xl font-extrabold text-slate-900">
                      3
                    </h2>

                    <p className="mt-2 text-xs text-amber-700">
                      Items need attention
                    </p>
                  </div>

                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-xl">
                    ⚠️
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('raw-materials')}
                  className="mt-4 text-xs font-bold text-amber-700 hover:text-amber-900"
                >
                  Review inventory →
                </button>
              </div>
            </div>

            {/* MAIN GRID */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">

            {/* SALES OVERVIEW */}
<div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm xl:col-span-2">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-slate-900">Sales Overview</h2>
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-500/20">
          +12.5% vs last week
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Revenue performance over the last 7 days
      </p>
    </div>

    <select className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20">
      <option>Last 7 days</option>
      <option>Last 30 days</option>
      <option>This year</option>
    </select>
  </div>

  {/* Interactive Chart */}
  <div className="relative mt-8">
    {/* Subtle Background Grid Lines */}
    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-8">
      <div className="border-b border-dashed border-slate-100 w-full" />
      <div className="border-b border-dashed border-slate-100 w-full" />
      <div className="border-b border-dashed border-slate-100 w-full" />
    </div>

    <div className="relative z-10 flex h-60 items-end gap-3 sm:gap-6 pt-6">
      {[
        { day: 'Mon', value: 42, revenue: '$1,260' },
        { day: 'Tue', value: 58, revenue: '$1,740' },
        { day: 'Wed', value: 48, revenue: '$1,440' },
        { day: 'Thu', value: 75, revenue: '$2,250' },
        { day: 'Fri', value: 65, revenue: '$1,950' },
        { day: 'Sat', value: 92, revenue: '$2,760', active: true },
        { day: 'Sun', value: 72, revenue: '$2,160' },
      ].map((item) => (
        <div
          key={item.day}
          className="group relative flex h-full flex-1 flex-col justify-end items-center"
        >
          {/* Tooltip on Hover */}
          <div className="absolute -top-3 z-20 hidden flex-col items-center group-hover:flex transition-all">
            <span className="whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md">
              {item.revenue}
            </span>
            <div className="h-1 w-2 border-x-4 border-t-4 border-x-transparent border-t-slate-900" />
          </div>

          {/* Bar Wrapper */}
          <div className="relative w-full max-w-[36px] flex justify-center">
            <div
              className={`w-full rounded-t-xl transition-all duration-300 ease-out group-hover:scale-y-[1.03] origin-bottom ${
                item.active
                  ? 'bg-gradient-to-t from-orange-600 via-amber-500 to-amber-400 shadow-md shadow-orange-500/20'
                  : 'bg-gradient-to-t from-slate-800 to-slate-600 group-hover:from-orange-500 group-hover:to-amber-400'
              }`}
              style={{
                height: `${item.value * 1.8}px`,
              }}
            />
          </div>

          {/* Day Label */}
          <p className={`mt-3 text-center text-xs font-semibold ${item.active ? 'text-orange-600' : 'text-slate-400 group-hover:text-slate-700'}`}>
            {item.day}
          </p>
        </div>
      ))}
    </div>
  </div>
</div>

              {/* QUICK ACTIONS */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5">
                  <h2 className="font-bold text-slate-900">
                    Quick Actions
                  </h2>

                  <p className="mt-1 text-xs text-slate-400">
                    Manage your restaurant quickly
                  </p>
                </div>

                <div className="space-y-3">

                  <button
                    onClick={() => setActiveTab('categories')}
                    className="group flex w-full items-center gap-4 rounded-xl border border-slate-100 p-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-lg">
                      🗂️
                    </div>

                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600">
                        Categories
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Organize your menu
                      </p>
                    </div>

                    <span className="text-slate-300 group-hover:text-indigo-500">
                      →
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('menu-items')}
                    className="group flex w-full items-center gap-4 rounded-xl border border-slate-100 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-lg">
                      🍔
                    </div>

                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-emerald-600">
                        Menu Items
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Add or edit products
                      </p>
                    </div>

                    <span className="text-slate-300 group-hover:text-emerald-500">
                      →
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('modifiers')}
                    className="group flex w-full items-center gap-4 rounded-xl border border-slate-100 p-3 text-left transition hover:border-violet-200 hover:bg-violet-50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-lg">
                      ✨
                    </div>

                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-violet-600">
                        Modifiers
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Manage add-ons
                      </p>
                    </div>

                    <span className="text-slate-300 group-hover:text-violet-500">
                      →
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('raw-materials')}
                    className="group flex w-full items-center gap-4 rounded-xl border border-slate-100 p-3 text-left transition hover:border-amber-200 hover:bg-amber-50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-lg">
                      📦
                    </div>

                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-amber-600">
                        Inventory
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Track raw materials
                      </p>
                    </div>

                    <span className="text-slate-300 group-hover:text-amber-500">
                      →
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* BOTTOM GRID */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

              {/* RECENT ORDERS */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-slate-900">
                      Recent Orders
                    </h2>

                    <p className="mt-1 text-xs text-slate-400">
                      Latest restaurant activity
                    </p>
                  </div>

                  <button className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                    View all →
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                        <th className="pb-3 font-semibold">Order</th>
                        <th className="pb-3 font-semibold">Type</th>
                        <th className="pb-3 font-semibold">Status</th>
                        <th className="pb-3 text-right font-semibold">
                          Amount
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      <tr className="group">
                        <td className="py-4">
                          <p className="text-sm font-bold text-slate-900">
                            #ORD-1042
                          </p>
                          <p className="text-[10px] text-slate-400">
                            2 min ago
                          </p>
                        </td>

                        <td className="py-4 text-xs text-slate-600">
                          Dine-In · Table 4
                        </td>

                        <td className="py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            In Kitchen
                          </span>
                        </td>

                        <td className="py-4 text-right text-sm font-bold text-slate-900">
                          $42.00
                        </td>
                      </tr>

                      <tr className="group">
                        <td className="py-4">
                          <p className="text-sm font-bold text-slate-900">
                            #ORD-1041
                          </p>
                          <p className="text-[10px] text-slate-400">
                            8 min ago
                          </p>
                        </td>

                        <td className="py-4 text-xs text-slate-600">
                          Takeaway
                        </td>

                        <td className="py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Ready
                          </span>
                        </td>

                        <td className="py-4 text-right text-sm font-bold text-slate-900">
                          $18.50
                        </td>
                      </tr>

                      <tr className="group">
                        <td className="py-4">
                          <p className="text-sm font-bold text-slate-900">
                            #ORD-1040
                          </p>
                          <p className="text-[10px] text-slate-400">
                            15 min ago
                          </p>
                        </td>

                        <td className="py-4 text-xs text-slate-600">
                          Delivery
                        </td>

                        <td className="py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                            Completed
                          </span>
                        </td>

                        <td className="py-4 text-right text-sm font-bold text-slate-900">
                          $65.00
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* LOW STOCK */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-slate-900">
                      Low Stock
                    </h2>

                    <p className="mt-1 text-xs text-slate-400">
                      Items that need attention
                    </p>
                  </div>

                  <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600">
                    3 ALERTS
                  </span>
                </div>

                <div className="space-y-4">

                  <div className="rounded-xl bg-red-50 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          Mozzarella Cheese
                        </p>
                        <p className="mt-1 text-[10px] text-red-600">
                          Only 1.2 kg remaining
                        </p>
                      </div>

                      <span className="text-lg">🧀</span>
                    </div>

                    <div className="mt-3 h-1.5 rounded-full bg-red-100">
                      <div className="h-full w-[18%] rounded-full bg-red-500" />
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-50 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          Chicken Breast
                        </p>
                        <p className="mt-1 text-[10px] text-amber-600">
                          3.5 kg remaining
                        </p>
                      </div>

                      <span className="text-lg">🍗</span>
                    </div>

                    <div className="mt-3 h-1.5 rounded-full bg-amber-100">
                      <div className="h-full w-[35%] rounded-full bg-amber-500" />
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-50 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          Cooking Oil
                        </p>
                        <p className="mt-1 text-[10px] text-amber-600">
                          4.2 liters remaining
                        </p>
                      </div>

                      <span className="text-lg">🫗</span>
                    </div>

                    <div className="mt-3 h-1.5 rounded-full bg-amber-100">
                      <div className="h-full w-[42%] rounded-full bg-amber-500" />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('raw-materials')}
                  className="mt-5 w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800"
                >
                  Manage Inventory
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT MANAGEMENT */}
      {activeTab === 'categories' && (
        <Categories onLogout={handleLogout} />
      )}

      {activeTab === 'menu-items' && (
        <MenuItems onLogout={handleLogout} />
      )}

      {activeTab === 'modifiers' && (
        <Modifiers onLogout={handleLogout} />
      )}

      {activeTab === 'raw-materials' && (
        <RawMaterials onLogout={handleLogout} />
      )}

     {/* PARTNERS */}
{(activeTab === 'partners' || activeTab === 'suppliers') && (
  <SuppliersPage />
)}

      {/* SETTINGS */}
      {activeTab === 'settings' && (
        <div className="min-h-full bg-slate-50 p-8">
          <div className="mx-auto max-w-[1600px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h1 className="text-2xl font-bold text-slate-900">
                Settings
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                Configure your system settings.
              </p>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
