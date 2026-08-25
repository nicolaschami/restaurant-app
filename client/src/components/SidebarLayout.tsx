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
    <div className="flex h-screen w-screen bg-slate-900 overflow-hidden select-none">
      
      {/* Collapsible Sidebar */}
      <aside
        className={`bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0 h-full transition-all duration-300 ${
          isCollapsed ? 'w-16' : 'w-48'
        }`}
      >
        {/* Header with Toggle Button */}
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          {!isCollapsed && (
            <div className="min-w-0">
              <h1 className="font-bold text-white text-xs truncate">POS Center</h1>
              <p className="text-[10px] text-slate-400 truncate">{restaurantName}</p>
            </div>
          )}
          
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition mx-auto"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4 text-indigo-400" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-1.5 space-y-1 overflow-y-auto">
          
          {/* Dashboard */}
          <button
            onClick={() => handleTabChange('dashboard')}
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center px-0' : 'gap-2 px-2.5'
            } py-2 rounded-md text-xs font-medium transition ${
              activeTab === 'dashboard'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
            title="Dashboard"
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span className="truncate">Dashboard</span>}
          </button>

          {/* POS Terminal */}
          <button
            onClick={() => handleTabChange('pos')}
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center px-0' : 'gap-2 px-2.5'
            } py-2 rounded-md text-xs font-medium transition ${
              activeTab === 'pos'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
            title="POS Terminal"
          >
            <ShoppingCart className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span className="truncate">POS Terminal</span>}
          </button>

          {/* Products Group */}
          <div>
            <button
              onClick={() => {
                if (isCollapsed) setIsCollapsed(false);
                setIsProductsOpen(!isProductsOpen);
              }}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center px-0' : 'justify-between px-2.5'
              } py-2 rounded-md text-xs font-medium text-slate-300 hover:bg-slate-800/60 transition`}
              title="Products"
            >
              <div className="flex items-center gap-2 min-w-0">
                <UtensilsCrossed className="w-4 h-4 text-indigo-400 shrink-0" />
                {!isCollapsed && <span className="truncate">Products</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
                    isProductsOpen ? 'rotate-180 text-indigo-400' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {/* Products Sub-menu */}
            {isProductsOpen && !isCollapsed && (
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
              onClick={() => {
                if (isCollapsed) setIsCollapsed(false);
                setIsPartnersOpen(!isPartnersOpen);
              }}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center px-0' : 'justify-between px-2.5'
              } py-2 rounded-md text-xs font-medium text-slate-300 hover:bg-slate-800/60 transition`}
              title="Partners"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-indigo-400 shrink-0" />
                {!isCollapsed && <span className="truncate">Partners</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
                    isPartnersOpen ? 'rotate-180 text-indigo-400' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {/* Partners Sub-menu */}
            {isPartnersOpen && !isCollapsed && (
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
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center px-0' : 'gap-2 px-2.5'
            } py-2 rounded-md text-xs font-medium transition ${
              activeTab === 'settings'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
            title="Settings"
          >
            <Settings className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span className="truncate">Settings</span>}
          </button>
        </nav>

        {/* Footer / Logout */}
        {onLogout && (
          <div className="p-1.5 border-t border-slate-800">
            <button
              onClick={onLogout}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center px-0' : 'gap-2 px-2.5'
              } py-2 rounded-md text-xs font-medium text-red-400 hover:bg-red-500/10 transition`}
              title="Logout"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span className="truncate">Logout</span>}
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 h-full w-full overflow-hidden bg-slate-950">
        {children}
      </main>
    </div>
  );
}