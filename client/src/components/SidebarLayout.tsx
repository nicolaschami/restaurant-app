import React, { useState, useEffect } from 'react';
import { ROLE_LABEL, canOpen, me } from '../lib/session';
import {
  BookOpen,
  Landmark,
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
  ArrowRightLeft, // Added icon for Transaction header
  ListFilter,     // Added icon for Purchase List subitem
  ListTree,       // Chart of Accounts
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
  // Phone (2026-10-26): the menu is a drawer opened with ☰ (closed after choosing a screen).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isProductsOpen, setIsProductsOpen] = useState(false);
  const [isPartnersOpen, setIsPartnersOpen] = useState(false);
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
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

  // Each menu keeps only what the logged-in role may open (lib/session.ts).
  const productSubItems = [
    { id: 'categories', label: 'Categories', icon: Layers },
    { id: 'menu-items', label: 'Menu Items', icon: Utensils },
    { id: 'modifiers', label: 'Modifiers', icon: SlidersHorizontal },
    { id: 'raw-materials', label: 'Raw Materials', icon: Wheat },
  ].filter((i) => canOpen(i.id));

  const partnerSubItems = [
    { id: 'employees', label: 'Employees', icon: Briefcase },
    { id: 'suppliers', label: 'Suppliers', icon: Truck },
    { id: 'customers', label: 'Customers', icon: CircleUserRound },
  ].filter((i) => canOpen(i.id));

  // Transaction Sub-items
  // "Purchase" (new receipt) is opened from the Purchase List's "+ New purchase"
  // button, so it has no menu entry of its own. `alsoActiveFor`: while that screen
  // is open, "Purchase List" stays highlighted and the Transactions group open.
  const transactionSubItems: { id: string; label: string; icon: typeof ListFilter; alsoActiveFor?: string[] }[] = [
    { id: 'purchaselist', label: 'Purchase List', icon: ListFilter, alsoActiveFor: ['purchase'] },
    { id: 'returnpurchaselist', label: 'Return Purchase', icon: RotateCcw, alsoActiveFor: ['returnpurchase'] },
  ].filter((i) => canOpen(i.id));
  const isTransactionItemActive = (item: (typeof transactionSubItems)[number]) =>
    activeTab === item.id || !!item.alsoActiveFor?.includes(activeTab);

  const settingSubItems = [
    { id: 'tables', label: 'Tables', icon: Table2 },
    { id: 'kitchenstations', label: 'Kitchen-Station', icon: TableOfContents },
    { id: 'RestaurantSettings', label: 'Restaurant Info', icon: Info },
    { id: 'chart-of-accounts', label: 'Chart of Accounts', icon: ListTree },
    { id: 'printers', label: 'Printers', icon: Printer },
    { id: 'users', label: 'Users', icon: UserCheck },
    { id: 'platform', label: 'Platform', icon: Crown },
  ].filter((i) => canOpen(i.id));

  // Full Reports Hierarchy (the plan). Only the reports listed in READY_REPORTS
  // are shown in the menu; add a report id there once its screen is built.
  const allReportCategories = [
    {
      id: 'financial',
      label: 'Financial Reports',
      icon: DollarSign,
      items: [
        { id: 'report-z-report', label: 'Z Report / Closing', icon: Receipt },
        { id: 'report-closed-days', label: 'Closed Days', icon: Calendar },
        { id: 'report-journal', label: 'Journal (JV)', icon: BookOpen },
        { id: 'report-account-balances', label: 'Account Balances', icon: Landmark },
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
        { id: 'report-item-sales', label: 'Sales by Item & Category', icon: Utensils },
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
        { id: 'report-purchases-supplier', label: 'Purchases by Supplier', icon: Receipt },
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

  // Reports that really exist today. Groups left without any ready report are hidden.
  const READY_REPORTS = new Set(['report-current-stock', 'report-stock-movement', 'report-purchases-supplier', 'report-daily-sales', 'report-z-report', 'report-closed-days', 'report-item-sales', 'report-journal', 'report-account-balances']);
  const reportCategories = allReportCategories
    .map((group) => ({ ...group, items: group.items.filter((item) => READY_REPORTS.has(item.id) && canOpen(item.id)) }))
    .filter((group) => group.items.length > 0);

  // Auto-expand groups when activeTab matches
  useEffect(() => {
    if (productSubItems.some((item) => item.id === activeTab)) {
      setIsProductsOpen(true);
    }
    if (partnerSubItems.some((item) => item.id === activeTab)) {
      setIsPartnersOpen(true);
    }
    if (transactionSubItems.some(isTransactionItemActive)) {
      setIsTransactionOpen(true);
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
    setMobileNavOpen(false); // phone: close the drawer after choosing a screen
  };

  return (
    <div className="flex h-[100dvh] w-screen bg-[#131c18] overflow-hidden select-none">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
        .ticket-font { font-family: 'Bebas Neue', 'Arial Narrow', sans-serif; letter-spacing: 0.05em; }
      `}</style>

      {/* Phone: dark backdrop behind the open drawer (tap = close) */}
      {mobileNavOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileNavOpen(false)} />}

      {/* Sidebar — on a phone (below md) a drawer that slides in from the left */}
      <aside
        className={`bg-[#131c18] text-slate-300 flex flex-col border-r border-[#2a3a32] shrink-0 h-full transition-all duration-300 ${
          isCollapsed ? 'w-16' : 'w-60'
        } max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-64 ${
          mobileNavOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="p-3 border-b border-[#2a3a32] flex items-center justify-between">
          {!isCollapsed && (
            <div className="min-w-0 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#9a7d3c] to-[#c9a24b] text-[11px]">
                🍽️
              </span>
              <div className="min-w-0">
                <h1 className="ticket-font uppercase text-xs text-white leading-none truncate">POS Center</h1>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">{restaurantName}</p>
                {me && (
                  <p className="text-[10px] truncate mt-0.5 text-[#c9a24b]">
                    {me.name} · {ROLE_LABEL[me.role]}
                  </p>
                )}
              </div>
            </div>
          )}

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition mx-auto"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4 text-[#c9a24b]" />
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
                ? 'bg-white/10 text-white shadow-[inset_3px_0_0_0_#c9a24b]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title="Dashboard"
          >
            <LayoutDashboard className={`w-4 h-4 shrink-0 ${activeTab === 'dashboard' ? 'text-[#c9a24b]' : ''}`} />
            {!isCollapsed && <span className="truncate">Dashboard</span>}
          </button>

          {/* POS Terminal */}
          <button
            onClick={() => handleTabChange('pos')}
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center px-0' : 'gap-2 px-2.5'
            } py-2 rounded-md text-xs font-medium transition ${
              activeTab === 'pos'
                ? 'bg-white/10 text-white shadow-[inset_3px_0_0_0_#c9a24b]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title="POS Terminal"
          >
            <ShoppingCart className={`w-4 h-4 shrink-0 ${activeTab === 'pos' ? 'text-[#c9a24b]' : ''}`} />
            {!isCollapsed && <span className="truncate">POS Terminal</span>}
          </button>

          {/* Products Group */}
          {productSubItems.length > 0 && (<div>
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
                <UtensilsCrossed className="w-4 h-4 text-[#c9a24b] shrink-0" />
                {!isCollapsed && <span className="truncate">Products</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
                    isProductsOpen ? 'rotate-180 text-[#c9a24b]' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {isProductsOpen && !isCollapsed && (
              <div className="mt-0.5 ml-2 pl-2 border-l border-[#2a3a32] space-y-0.5">
                {productSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition ${
                        isActive
                          ? 'bg-white/5 text-[#e6cf8f] shadow-[inset_2px_0_0_0_#c9a24b] font-semibold'
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
          </div>)}

          {/* Partners Group */}
          {partnerSubItems.length > 0 && (<div>
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
                <Users className="w-4 h-4 text-[#c9a24b] shrink-0" />
                {!isCollapsed && <span className="truncate">Partners</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
                    isPartnersOpen ? 'rotate-180 text-[#c9a24b]' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {isPartnersOpen && !isCollapsed && (
              <div className="mt-0.5 ml-2 pl-2 border-l border-[#2a3a32] space-y-0.5">
                {partnerSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition ${
                        isActive
                          ? 'bg-white/5 text-[#e6cf8f] shadow-[inset_2px_0_0_0_#c9a24b] font-semibold'
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
          </div>)}

          {/* Transaction Group (Added here before Settings) */}
          {transactionSubItems.length > 0 && (<div>
            <button
              onClick={() => {
                if (isCollapsed) setIsCollapsed(false);
                setIsTransactionOpen(!isTransactionOpen);
              }}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center px-0' : 'justify-between px-2.5'
              } py-2 rounded-md text-xs font-medium text-slate-300 hover:bg-white/5 transition`}
              title="Transaction"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ArrowRightLeft className="w-4 h-4 text-[#c9a24b] shrink-0" />
                {!isCollapsed && <span className="truncate">Transaction</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
                    isTransactionOpen ? 'rotate-180 text-[#c9a24b]' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {isTransactionOpen && !isCollapsed && (
              <div className="mt-0.5 ml-2 pl-2 border-l border-[#2a3a32] space-y-0.5">
                {transactionSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = isTransactionItemActive(item);
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition ${
                        isActive
                          ? 'bg-white/5 text-[#e6cf8f] shadow-[inset_2px_0_0_0_#c9a24b] font-semibold'
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
          </div>)}

          {/* Settings Group */}
          {settingSubItems.length > 0 && (<div>
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
                <Settings className="w-4 h-4 text-[#c9a24b] shrink-0" />
                {!isCollapsed && <span className="truncate">Settings</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
                    isSettingsOpen ? 'rotate-180 text-[#c9a24b]' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {isSettingsOpen && !isCollapsed && (
              <div className="mt-0.5 ml-2 pl-2 border-l border-[#2a3a32] space-y-0.5">
                {settingSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition ${
                        isActive
                          ? 'bg-white/5 text-[#e6cf8f] shadow-[inset_2px_0_0_0_#c9a24b] font-semibold'
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
          </div>)}

          {/* Nested Reports Group */}
          {reportCategories.length > 0 && (<div>
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
                <BarChart3 className="w-4 h-4 text-[#c9a24b] shrink-0" />
                {!isCollapsed && <span className="truncate">Reports</span>}
              </div>
              {!isCollapsed && (
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
                    isReportsOpen ? 'rotate-180 text-[#c9a24b]' : 'text-slate-500'
                  }`}
                />
              )}
            </button>

            {/* Sub-menu (Categories) */}
            {isReportsOpen && !isCollapsed && (
              <div className="mt-0.5 ml-2 pl-2 border-l border-[#2a3a32] space-y-1">
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
                            isGroupOpen ? 'rotate-90 text-[#c9a24b]' : 'text-slate-500'
                          }`}
                        />
                      </button>

                      {/* Sub-sub-menu (Individual Reports) */}
                      {isGroupOpen && (
                        <div className="mt-0.5 ml-2 pl-2 border-l border-[#3f5247] space-y-0.5">
                          {group.items.map((item) => {
                            const ItemIcon = item.icon;
                            const isActive = activeTab === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => handleTabChange(item.id)}
                                className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition ${
                                  isActive
                                    ? 'bg-white/10 text-[#e6cf8f] font-semibold'
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
          </div>)}
        </nav>

        {/* Footer / Logout */}
        {onLogout && (
          <div className="p-1.5 border-t border-[#2a3a32]">
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
      <div className="flex min-w-0 flex-1 flex-col h-full">
        {/* Phone only: a slim top bar with ☰ to open the menu */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[#2a3a32] bg-[#131c18] px-3 text-white md:hidden">
          <button
            onClick={() => {
              setIsCollapsed(false); // the drawer always shows the labels
              setMobileNavOpen(true);
            }}
            className="rounded-md p-1.5 text-[#c9a24b] hover:bg-white/10"
            aria-label="Open the menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate text-sm font-bold">{restaurantName}</span>
        </div>
        <main className="flex-1 min-h-0 w-full overflow-y-auto bg-slate-50">{children}</main>
      </div>
    </div>
  );
}