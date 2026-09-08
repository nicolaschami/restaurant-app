import React, { useState, useEffect } from 'react';
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
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Table2,
  CircleUserRound,
  TableOfContents,
  Printer,
  Info,
  // Report Icons
  BarChart3,
  Receipt,
  TrendingUp,
  CreditCard,
  Percent,
  RotateCcw,
  Ban,
  Coins,
  Vault,
  ShoppingBag,
  Clock,
  Calendar,
  Sparkles,
  Award,
  TrendingDown,
  DollarSign,
  PlusCircle,
  Menu,
  PackageCheck,
  AlertTriangle,
  ArrowLeftRight,
  Trash2,
  Sliders,
  Scale,
  Calculator,
  ChefHat,
  Timer,
  AlertCircle,
  LayoutGrid,
  UserSquare2,
  History,
  ShieldAlert,
  UserX,
  Repeat,
  Armchair,
  MapPin,
  Bike,
  UserCheck2,
  Map,
  User,
  Crown,
  UserPlus,
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
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // States for expanding nested sub-categories under Reports
  const [openReportSubGroups, setOpenReportSubGroups] = useState<Record<string, boolean>>({
    financial: false,
    sales: false,
    product: false,
    inventory: false,
    kitchen: false,
    staff: false,
    tables: false,
    delivery: false,
    customers: false,
  });

  const toggleReportSubGroup = (key: string) => {
    setOpenReportSubGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const productSubItems = [
    { id: 'categories', label: 'Categories', icon: Layers },
    { id: 'menu-items', label: 'Menu Items', icon: Utensils },
    { id: 'modifiers', label: 'Modifiers', icon: SlidersHorizontal },
    { id: 'raw-materials', label: 'Raw Materials', icon: Wheat },
    { id: 'purchase', label: 'Purchase Transaction', icon: Receipt },
  ];

  // Full Reports Hierarchy
  const reportCategories = [
    {
      id: 'financial',
      label: 'Financial Reports',
      icon: DollarSign,
      items: [
        { id: 'report-z-report', label: 'Z Report / Closing', icon: Receipt },
        { id: 'report-x-report', label: 'X Report / Shift Audit', icon: Receipt },
        { id: 'report-payment-methods', label: 'Payment Methods', icon: CreditCard },
        { id: 'report-tax', label: 'Tax Report', icon: Calculator },
        { id: 'report-discounts', label: 'Discounts Report', icon: Percent },
        { id: 'report-refunds', label: 'Refunds Report', icon: RotateCcw },
        { id: 'report-voids', label: 'Voids Report', icon: Ban },
        { id: 'report-tips', label: 'Tips Report', icon: Coins },
        { id: 'report-cash-drawer', label: 'Cash Drawer Report', icon: Vault },
      ],
    },
    {
      id: 'sales',
      label: 'Sales Analytics',
      icon: TrendingUp,
      items: [
        { id: 'report-daily-sales', label: 'Daily Sales', icon: BarChart3 },
        { id: 'report-category-sales', label: 'Sales by Category', icon: Layers },
        { id: 'report-item-sales', label: 'Sales by Item', icon: Utensils },
        { id: 'report-employee-sales', label: 'Sales by Employee', icon: UserSquare2 },
        { id: 'report-dine-in-delivery', label: 'Dine-In vs Delivery', icon: ShoppingBag },
        { id: 'report-order-types', label: 'Sales by Order Type', icon: ShoppingBag },
        { id: 'report-peak-hours', label: 'Peak Hours Breakdown', icon: Clock },
        { id: 'report-day-of-week-sales', label: 'Sales by Day of Week', icon: Calendar },
        { id: 'report-avg-order-value', label: 'Average Order Value', icon: Sparkles },
      ],
    },
    {
      id: 'product',
      label: 'Product Performance',
      icon: Award,
      items: [
        { id: 'report-best-selling', label: 'Best Selling Items', icon: Award },
        { id: 'report-worst-selling', label: 'Worst Selling Items', icon: TrendingDown },
        { id: 'report-item-profitability', label: 'Item Profitability', icon: DollarSign },
        { id: 'report-modifier-sales', label: 'Modifier / Add-on Sales', icon: PlusCircle },
        { id: 'report-menu-performance', label: 'Menu Performance', icon: Menu },
      ],
    },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: PackageCheck,
      items: [
        { id: 'report-current-stock', label: 'Current Stock', icon: PackageCheck },
        { id: 'report-low-stock', label: 'Low Stock', icon: AlertTriangle },
        { id: 'report-stock-movement', label: 'Stock Movement', icon: ArrowLeftRight },
        { id: 'report-ingredient-consumption', label: 'Ingredient Consumption', icon: Wheat },
        { id: 'report-spoilage-waste', label: 'Waste / Spoilage', icon: Trash2 },
        { id: 'report-stock-adjustments', label: 'Stock Adjustments', icon: Sliders },
        { id: 'report-inventory-variance', label: 'Inventory Variance', icon: Scale },
        { id: 'report-inventory-valuation', label: 'Inventory Valuation', icon: DollarSign },
      ],
    },
    {
      id: 'kitchen',
      label: 'Kitchen / KDS',
      icon: ChefHat,
      items: [
        { id: 'report-kitchen-performance', label: 'Kitchen Performance', icon: ChefHat },
        { id: 'report-prep-times', label: 'Preparation Times', icon: Timer },
        { id: 'report-delayed-orders', label: 'Delayed Orders', icon: AlertCircle },
        { id: 'report-orders-by-station', label: 'Orders by Station', icon: LayoutGrid },
        { id: 'report-item-prep-performance', label: 'Item Prep Performance', icon: Utensils },
      ],
    },
    {
      id: 'staff',
      label: 'Staff',
      icon: Users,
      items: [
        { id: 'report-staff-sales', label: 'Employee Sales', icon: UserSquare2 },
        { id: 'report-employee-shifts', label: 'Employee Shifts', icon: History },
        { id: 'report-cashier-performance', label: 'Cashier Performance', icon: CreditCard },
        { id: 'report-employee-discounts', label: 'Discounts by Employee', icon: Percent },
        { id: 'report-employee-voids', label: 'Voids by Employee', icon: ShieldAlert },
        { id: 'report-employee-refunds', label: 'Refunds by Employee', icon: UserX },
      ],
    },
    {
      id: 'tables',
      label: 'Tables',
      icon: Table2,
      items: [
        { id: 'report-table-sales', label: 'Table Sales', icon: Table2 },
        { id: 'report-table-turnover', label: 'Table Turnover', icon: Repeat },
        { id: 'report-table-occupancy', label: 'Table Occupancy', icon: Armchair },
        { id: 'report-avg-dining-time', label: 'Average Dining Time', icon: Clock },
        { id: 'report-section-sales', label: 'Sales by Section', icon: MapPin },
      ],
    },
    {
      id: 'delivery',
      label: 'Delivery',
      icon: Bike,
      items: [
        { id: 'report-delivery-sales', label: 'Delivery Sales', icon: Bike },
        { id: 'report-delivery-times', label: 'Delivery Times', icon: Timer },
        { id: 'report-orders-by-driver', label: 'Orders by Driver', icon: UserCheck2 },
        { id: 'report-driver-performance', label: 'Driver Performance', icon: Award },
        { id: 'report-delivery-areas', label: 'Delivery Areas', icon: Map },
      ],
    },
    {
      id: 'customers',
      label: 'Customers',
      icon: CircleUserRound,
      items: [
        { id: 'report-customer-sales', label: 'Customer Sales', icon: User },
        { id: 'report-top-customers', label: 'Top Customers', icon: Crown },
        { id: 'report-new-vs-returning', label: 'New vs Returning', icon: UserPlus },
        { id: 'report-customer-frequency', label: 'Customer Frequency', icon: Repeat },
        { id: 'report-avg-customer-spend', label: 'Average Customer Spend', icon: Sparkles },
      ],
    },
  ];

  const partnerSubItems = [
    { id: 'users', label: 'Users', icon: UserCheck },
    { id: 'employees', label: 'Employees', icon: Briefcase },
    { id: 'suppliers', label: 'Suppliers', icon: Truck },
    { id: 'customers', label: 'Customers', icon: CircleUserRound },
  ];

  const settingSubItems = [
    { id: 'tables', label: 'Tables', icon: Table2 },
    { id: 'kitchenstations', label: 'Kitchen-Station', icon: TableOfContents },
    { id: 'print', label: 'Print Test page', icon: Printer },
    { id: 'RestaurantSettings', label: 'Restaurant Info', icon: Info },
  ];

  // Auto-expand groups when activeTab matches
  useEffect(() => {
    if (productSubItems.some((item) => item.id === activeTab)) {
      setIsProductsOpen(true);
    }
    if (partnerSubItems.some((item) => item.id === activeTab)) {
      setIsPartnersOpen(true);
    }
    if (settingSubItems.some((item) => item.id === activeTab)) {
      setIsSettingsOpen(true);
    }

    reportCategories.forEach((group) => {
      if (group.items.some((item) => item.id === activeTab)) {
        setIsReportsOpen(true);
        setOpenReportSubGroups((prev) => ({ ...prev, [group.id]: true }));
      }
    });
  }, [activeTab]);

  const handleTabChange = (tabId: string) => {
    if (typeof setActiveTab === 'function') {
      setActiveTab(tabId);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#1c1917] overflow-hidden select-none">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
        .ticket-font { font-family: 'Bebas Neue', 'Arial Narrow', sans-serif; letter-spacing: 0.05em; }
      `}</style>

      {/* Sidebar */}
      <aside
        className={`bg-[#1c1917] text-slate-300 flex flex-col border-r border-[#33291f] shrink-0 h-full transition-all duration-300 ${
          isCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* Header */}
        <div className="p-3 border-b border-[#33291f] flex items-center justify-between">
          {!isCollapsed && (
            <div className="min-w-0 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#8a3f16] to-[#c2621f] text-[11px]">
                🍽️
              </span>
              <div className="min-w-0">
                <h1 className="ticket-font uppercase text-xs text-white leading-none truncate">POS Center</h1>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">{restaurantName}</p>
              </div>
            </div>
          )}

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition mx-auto"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4 text-[#c2621f]" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-1.5 space-y-1 overflow-y-auto">
          {/* Dashboard */}
          <button
            onClick={() => handleTabChange('dashboard')}
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center px-0' : 'gap-2 px-2.5'
            } py-2 rounded-md text-xs font-medium transition ${
              activeTab === 'dashboard'
                ? 'bg-white/10 text-white shadow-[inset_3px_0_0_0_#c2621f]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title="Dashboard"
          >
            <LayoutDashboard className={`w-4 h-4 shrink-0 ${activeTab === 'dashboard' ? 'text-[#c2621f]' : ''}`} />
            {!isCollapsed && <span className="truncate">Dashboard</span>}
          </button>

          {/* POS Terminal */}
          <button
            onClick={() => handleTabChange('pos')}
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center px-0' : 'gap-2 px-2.5'
            } py-2 rounded-md text-xs font-medium transition ${
              activeTab === 'pos'
                ? 'bg-white/10 text-white shadow-[inset_3px_0_0_0_#c2621f]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title="POS Terminal"
          >
            <ShoppingCart className={`w-4 h-4 shrink-0 ${activeTab === 'pos' ? 'text-[#c2621f]' : ''}`} />
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
              } py-2 rounded-md text-xs font-medium text-slate-300 hover:bg-white/5 transition`}
              title="Products"
            >
              <div className="flex items-center gap-2 min-w-0">
                <UtensilsCrossed className="w-4 h-4 text-[#c2621f] shrink-0" />
                {!isCollapsed && <span className="truncate">Products</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
                    isProductsOpen ? 'rotate-180 text-[#c2621f]' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {isProductsOpen && !isCollapsed && (
              <div className="mt-0.5 ml-2 pl-2 border-l border-[#33291f] space-y-0.5">
                {productSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition ${
                        isActive
                          ? 'bg-white/5 text-[#e0925a] shadow-[inset_2px_0_0_0_#c2621f] font-semibold'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
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
              } py-2 rounded-md text-xs font-medium text-slate-300 hover:bg-white/5 transition`}
              title="Partners"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-[#c2621f] shrink-0" />
                {!isCollapsed && <span className="truncate">Partners</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
                    isPartnersOpen ? 'rotate-180 text-[#c2621f]' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {isPartnersOpen && !isCollapsed && (
              <div className="mt-0.5 ml-2 pl-2 border-l border-[#33291f] space-y-0.5">
                {partnerSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition ${
                        isActive
                          ? 'bg-white/5 text-[#e0925a] shadow-[inset_2px_0_0_0_#c2621f] font-semibold'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
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

          {/* Settings Group */}
          <div>
            <button
              onClick={() => {
                if (isCollapsed) setIsCollapsed(false);
                setIsSettingsOpen(!isSettingsOpen);
              }}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center px-0' : 'justify-between px-2.5'
              } py-2 rounded-md text-xs font-medium text-slate-300 hover:bg-white/5 transition`}
              title="Settings"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Settings className="w-4 h-4 text-[#c2621f] shrink-0" />
                {!isCollapsed && <span className="truncate">Settings</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
                    isSettingsOpen ? 'rotate-180 text-[#c2621f]' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {isSettingsOpen && !isCollapsed && (
              <div className="mt-0.5 ml-2 pl-2 border-l border-[#33291f] space-y-0.5">
                {settingSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition ${
                        isActive
                          ? 'bg-white/5 text-[#e0925a] shadow-[inset_2px_0_0_0_#c2621f] font-semibold'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
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


          
          {/* Nested Reports Group */}
          <div>
            <button
              onClick={() => {
                if (isCollapsed) setIsCollapsed(false);
                setIsReportsOpen(!isReportsOpen);
              }}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center px-0' : 'justify-between px-2.5'
              } py-2 rounded-md text-xs font-medium text-slate-300 hover:bg-white/5 transition`}
              title="Reports"
            >
              <div className="flex items-center gap-2 min-w-0">
                <BarChart3 className="w-4 h-4 text-[#c2621f] shrink-0" />
                {!isCollapsed && <span className="truncate">Reports</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
                    isReportsOpen ? 'rotate-180 text-[#c2621f]' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {/* Sub-menu (Categories) */}
            {isReportsOpen && !isCollapsed && (
              <div className="mt-0.5 ml-2 pl-2 border-l border-[#33291f] space-y-1">
                {reportCategories.map((group) => {
                  const GroupIcon = group.icon;
                  const isGroupOpen = !!openReportSubGroups[group.id];

                  return (
                    <div key={group.id}>
                      <button
                        onClick={() => toggleReportSubGroup(group.id)}
                        className="w-full flex items-center justify-between px-2 py-1 rounded text-[11px] font-medium text-slate-300 hover:text-white hover:bg-white/5 transition"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <GroupIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{group.label}</span>
                        </div>
                        <ChevronRight
                          className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
                            isGroupOpen ? 'rotate-90 text-[#c2621f]' : 'text-slate-500'
                          }`}
                        />
                      </button>

                      {/* Sub-sub-menu (Individual Reports) */}
                      {isGroupOpen && (
                        <div className="mt-0.5 ml-2 pl-2 border-l border-[#44362a] space-y-0.5">
                          {group.items.map((item) => {
                            const ItemIcon = item.icon;
                            const isActive = activeTab === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => handleTabChange(item.id)}
                                className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition ${
                                  isActive
                                    ? 'bg-white/10 text-[#e0925a] font-semibold'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                              >
                                <ItemIcon className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{item.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Footer / Logout */}
        {onLogout && (
          <div className="p-1.5 border-t border-[#33291f]">
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

      {/* Main Content */}
      <main className="flex-1 h-full w-full overflow-y-auto bg-slate-50">{children}</main>
    </div>
  );
}