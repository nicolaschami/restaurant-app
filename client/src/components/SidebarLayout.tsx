import React, { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  UtensilsCrossed,
  Layers,
  Utensils,
  SlidersHorizontal,
  Wheat,
  Users,
  UserCheck,
  Briefcase,
  Truck,
  Settings,
  ChevronDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Table2,
  CircleUserRound,
} from 'lucide-react';

interface SidebarLayoutProps {
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  onLogout?: () => void;
  restaurantName?: string;
  children?: React.ReactNode;
}

export default function SidebarLayout({
  activeTab = 'dashboard',
  setActiveTab,
  onLogout,
  restaurantName = 'Tasty Bistro',
  children,
}: SidebarLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    products: true,
    partners: false,
    settings: false,
  });

  const toggleSection = (section: string) => {
    if (isCollapsed) setIsCollapsed(false);
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleTabClick = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (setActiveTab) {
      setActiveTab(tabId);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#1c1917] select-none">
      <aside
        className={`bg-[#1c1917] text-slate-300 flex flex-col border-r border-[#33291f] h-full transition-all duration-300 ${
          isCollapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Header */}
        <div className="p-3 border-b border-[#33291f] flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-gradient-to-br from-[#8a3f16] to-[#c2621f] text-xs">
                🍽️
              </span>
              <div>
                <h1 className="text-xs font-bold text-white uppercase tracking-wider">POS Center</h1>
                <p className="text-[10px] text-slate-400">{restaurantName}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5 mx-auto"
          >
            {isCollapsed ? <PanelLeftOpen className="w-4 h-4 text-[#c2621f]" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {/* Main Links */}
          <button
            type="button"
            onClick={(e) => handleTabClick(e, 'dashboard')}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded text-xs font-medium ${
              activeTab === 'dashboard' ? 'bg-[#c2621f] text-white' : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Dashboard</span>}
          </button>

          <button
            type="button"
            onClick={(e) => handleTabClick(e, 'pos')}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded text-xs font-medium ${
              activeTab === 'pos' ? 'bg-[#c2621f] text-white' : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            <ShoppingCart className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>POS Terminal</span>}
          </button>

          {/* Products Category */}
          <div className="py-1">
            <button
              type="button"
              onClick={() => toggleSection('products')}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded text-xs font-medium text-slate-200 hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4 text-[#c2621f]" />
                {!isCollapsed && <span>Products</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${openSections.products ? 'rotate-180' : ''}`}
                />
              )}
            </button>

            {openSections.products && !isCollapsed && (
              <div className="ml-4 mt-1 border-l border-[#33291f] pl-2 space-y-1">
                <button
                  type="button"
                  onClick={(e) => handleTabClick(e, 'categories')}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] ${
                    activeTab === 'categories' ? 'text-[#c2621f] font-bold bg-white/5' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> Categories
                </button>
                <button
                  type="button"
                  onClick={(e) => handleTabClick(e, 'menu-items')}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] ${
                    activeTab === 'menu-items' ? 'text-[#c2621f] font-bold bg-white/5' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Utensils className="w-3.5 h-3.5" /> Menu Items
                </button>
                <button
                  type="button"
                  onClick={(e) => handleTabClick(e, 'modifiers')}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] ${
                    activeTab === 'modifiers' ? 'text-[#c2621f] font-bold bg-white/5' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Modifiers
                </button>
                <button
                  type="button"
                  onClick={(e) => handleTabClick(e, 'raw-materials')}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] ${
                    activeTab === 'raw-materials' ? 'text-[#c2621f] font-bold bg-white/5' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Wheat className="w-3.5 h-3.5" /> Raw Materials
                </button>
              </div>
            )}
          </div>

          {/* Partners Category */}
          <div className="py-1">
            <button
              type="button"
              onClick={() => toggleSection('partners')}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded text-xs font-medium text-slate-200 hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#c2621f]" />
                {!isCollapsed && <span>Partners</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${openSections.partners ? 'rotate-180' : ''}`}
                />
              )}
            </button>

            {openSections.partners && !isCollapsed && (
              <div className="ml-4 mt-1 border-l border-[#33291f] pl-2 space-y-1">
                <button
                  type="button"
                  onClick={(e) => handleTabClick(e, 'users')}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] ${
                    activeTab === 'users' ? 'text-[#c2621f] font-bold bg-white/5' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" /> Users
                </button>
                <button
                  type="button"
                  onClick={(e) => handleTabClick(e, 'employees')}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] ${
                    activeTab === 'employees' ? 'text-[#c2621f] font-bold bg-white/5' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" /> Employees
                </button>
                <button
                  type="button"
                  onClick={(e) => handleTabClick(e, 'suppliers')}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] ${
                    activeTab === 'suppliers' ? 'text-[#c2621f] font-bold bg-white/5' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" /> Suppliers
                </button>
              </div>
            )}
          </div>

          {/* Settings Category */}
          <div className="py-1">
            <button
              type="button"
              onClick={() => toggleSection('settings')}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded text-xs font-medium text-slate-200 hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#c2621f]" />
                {!isCollapsed && <span>Settings</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${openSections.settings ? 'rotate-180' : ''}`}
                />
              )}
            </button>

            {openSections.settings && !isCollapsed && (
              <div className="ml-4 mt-1 border-l border-[#33291f] pl-2 space-y-1">
                <button
                  type="button"
                  onClick={(e) => handleTabClick(e, 'tables')}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] ${
                    activeTab === 'tables' ? 'text-[#c2621f] font-bold bg-white/5' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" /> Tables
                </button>
                <button
                  type="button"
                  onClick={(e) => handleTabClick(e, 'customers')}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] ${
                    activeTab === 'customers' ? 'text-[#c2621f] font-bold bg-white/5' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <CircleUserRound className="w-3.5 h-3.5" /> Customers
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Footer */}
        {onLogout && (
          <div className="p-2 border-t border-[#33291f]">
            <button
              type="button"
              onClick={onLogout}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded"
            >
              <LogOut className="w-4 h-4" />
              {!isCollapsed && <span>Logout</span>}
            </button>
          </div>
        )}
      </aside>

      {/* Main Content View */}
      <main className="flex-1 h-full overflow-y-auto bg-slate-50">
        {children}
      </main>
    </div>
  );
}