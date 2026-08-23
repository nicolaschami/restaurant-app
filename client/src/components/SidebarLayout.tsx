import React, { useState } from 'react';
import {
  LayoutDashboard,
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
  const [isProductsOpen, setIsProductsOpen] = useState(false);
  const [isPartnersOpen, setIsPartnersOpen] = useState(false);

  const productSubItems = [
    { id: 'categories', label: 'Categories', icon: Layers },
    { id: 'menu-items', label: 'Menu Items', icon: Utensils },
    { id: 'modifiers', label: 'Modifiers', icon: SlidersHorizontal },
    { id: 'raw-materials', label: 'Raw Materials', icon: Wheat },
  ];

  const partnerSubItems = [
    { id: 'users', label: 'Users', icon: UserCheck },
    { id: 'employees', label: 'Employees', icon: Briefcase },
    { id: 'suppliers', label: 'Suppliers', icon: Truck },
  ];

  const handleTabChange = (tabId: string) => {
    if (typeof setActiveTab === 'function') {
      setActiveTab(tabId);
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Sidebar - Compact Width (w-48) */}
      <aside className="w-48 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0">
        
        {/* Header / Brand */}
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="font-bold text-white text-xs truncate">POS Center</h1>
            <p className="text-[10px] text-slate-400 truncate">{restaurantName}</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-1.5 space-y-0.5 overflow-y-auto">
          
          {/* Dashboard */}
          <button
            onClick={() => handleTabChange('dashboard')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'dashboard'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Dashboard</span>
          </button>

          {/* Products Group */}
          <div>
            <button
              onClick={() => setIsProductsOpen(!isProductsOpen)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:bg-slate-800/60 transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                <UtensilsCrossed className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">Products</span>
              </div>
              <ChevronDown
                className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
                  isProductsOpen ? 'rotate-180 text-indigo-400' : 'text-slate-500'
                }`}
              />
            </button>

            {/* Products Sub-menu Items */}
            {isProductsOpen && (
              <div className="mt-0.5 ml-2 pl-2 border-l border-slate-800 space-y-0.5">
                {productSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition ${
                        isActive
                          ? 'bg-indigo-600/20 text-indigo-400 font-semibold'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                      }`}
                    >
                      <Icon className="w-3 h-3 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Partners Group */}
          <div>
            <button
              onClick={() => setIsPartnersOpen(!isPartnersOpen)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:bg-slate-800/60 transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">Partners</span>
              </div>
              <ChevronDown
                className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
                  isPartnersOpen ? 'rotate-180 text-indigo-400' : 'text-slate-500'
                }`}
              />
            </button>

            {/* Partners Sub-menu Items */}
            {isPartnersOpen && (
              <div className="mt-0.5 ml-2 pl-2 border-l border-slate-800 space-y-0.5">
                {partnerSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition ${
                        isActive
                          ? 'bg-indigo-600/20 text-indigo-400 font-semibold'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                      }`}
                    >
                      <Icon className="w-3 h-3 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Settings */}
          <button
            onClick={() => handleTabChange('settings')}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'settings'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Settings</span>
          </button>
        </nav>

        {/* Footer / Logout */}
        {onLogout && (
          <div className="p-1.5 border-t border-slate-800">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-red-400 hover:bg-red-500/10 transition"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Logout</span>
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}