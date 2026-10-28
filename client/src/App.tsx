import { useEffect, useState } from 'react';
import { loadRestaurantSettings } from './lib/restaurantSettings';
import { canOpen, loadMe, setMe } from './lib/session';
import UsersSettings from './pages/UsersSettings';
import PlatformScreen from './pages/PlatformScreen';
import SidebarLayout from './components/SidebarLayout';
import DashboardView, { type ActiveOrder } from './pages/Dashboard';
import PosView from './pages/PosScreen';
import Categories from './pages/Categories';
import Modifiers from './pages/Modifiers';
import RawMaterials from './pages/RawMaterials';
import Products from './pages/Products';
import Tables from './pages/Tablo';
import Customers from './pages/customers';
import Suppliers from './pages/Suppliers';
import KitchenStations from './pages/kitchenstation';
import KDSContainer from './pages/Kdscontainer';
import RestaurantSettings from './pages/RestaurantSettings';
import PrintersSettings from './pages/PrintersSettings';
import PurchaseReceiptForm from './pages/Purchasetransactionscreen';
import PurchaseList from './pages/PurchaseTransactionsList';
import Login from './pages/Login';
import CurrentStockReport from './pages/CurrentStockReport';
import StockMovementReport from './pages/StockMovementReport';
import PurchasesReport from './pages/PurchasesReport';
import DailySalesReport from './pages/DailySalesReport';
import ZReportPage from './pages/ZReportPage';
import ClosedDaysReport from './pages/ClosedDaysReport';
import JournalReport from './pages/JournalReport';
import AccountBalancesReport from './pages/AccountBalancesReport';
import ChartOfAccounts from './pages/ChartOfAccounts';
import SalesByItemReport from './pages/SalesByItemReport';

const PosViewWrapper = PosView as React.ComponentType<{
  activeOrder?: ActiveOrder | null;
  onResetOrder?: () => void;
  onClose?: () => void;
  onSwitchUser?: (token: string, user: any) => void;
}>;

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pos' | string>('dashboard');
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);

  // Login "ticket" (JWT) saved by the Login page. The server needs it on protected
  // routes (categories, products...) — without it they answer 401 Unauthorized.
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [restaurantName, setRestaurantName] = useState<string>(
    localStorage.getItem('restaurantName') || 'My Restaurant'
  );

  // Forget the saved login; setting token to null shows the Login page again.
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('restaurantName');
    setMe(null);
    setToken(null);
    setActiveTab('dashboard');
  };

  // "Switch user" on the POS (4-digit PIN): the new user's login replaces the current
  // one. The token state is NOT changed on purpose: that would reload everything and
  // lose the ticket being typed — the next requests simply use the new login.
  const [, setUserVersion] = useState(0);
  const handleSwitchUser = (jwt: string, user: any) => {
    localStorage.setItem('token', jwt);
    setMe(user);
    setUserVersion((v) => v + 1); // the menus follow the new user's role
  };

  const handleSelectTicket = (ticket: ActiveOrder) => {
    setActiveOrder(ticket);
    setActiveTab('pos');
  };

  const handleResetOrder = () => {
    setActiveOrder(null);
  };

  const handleClosePos = () => {
    setActiveOrder(null);
    setActiveTab('dashboard');
  };

  // After login: the restaurant's currency and tax, and WHO is logged in (name, role
  // — the menus show only what the role may open). Loaded before the screens.
  const [settingsReady, setSettingsReady] = useState(false);
  useEffect(() => {
    if (!token) return;
    setSettingsReady(false);
    Promise.all([loadRestaurantSettings(), loadMe()]).finally(() => setSettingsReady(true));
  }, [token]);

  // Not logged in yet → show only the Login page (no sidebar, no screens).
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

  if (!settingsReady) {
    return <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading…</div>;
  }

  // The POS opens full screen (no sidebar): cashiers need all the room, and its
  // own header has a button back to the dashboard.
  if (activeTab === 'pos') {
    return (
      <PosViewWrapper
        activeOrder={activeOrder}
        onResetOrder={handleResetOrder}
        onClose={handleClosePos}
        onSwitchUser={handleSwitchUser}
      />
    );
  }

  const renderContent = () => {
    // A screen the logged-in role may not open (the server refuses it anyway).
    if (!canOpen(activeTab)) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-50 p-6 text-center">
          <div className="text-3xl">🔒</div>
          <h2 className="text-lg font-bold text-slate-800">Not available for your role</h2>
          <p className="max-w-sm text-sm text-slate-500">Ask the restaurant owner if you need access to this screen.</p>
        </div>
      );
    }
    if (activeTab === 'users') return <UsersSettings />;
    if (activeTab === 'platform') return <PlatformScreen />;
    if (activeTab === 'chart-of-accounts') return <ChartOfAccounts />;
    // Reports that are built. Any other "report-…" tab shows the "under development" page.
    if (activeTab === 'report-current-stock') return <CurrentStockReport />;
    if (activeTab === 'report-stock-movement') return <StockMovementReport />;
    if (activeTab === 'report-purchases-supplier') return <PurchasesReport />;
    if (activeTab === 'report-daily-sales') return <DailySalesReport />;
    if (activeTab === 'report-z-report') return <ZReportPage />;
    if (activeTab === 'report-closed-days') return <ClosedDaysReport />;
    if (activeTab === 'report-journal') return <JournalReport />;
    if (activeTab === 'report-account-balances') return <AccountBalancesReport />;
    if (activeTab === 'report-item-sales') return <SalesByItemReport />;

    if (activeTab.startsWith('report-')) {
      const reportTitle = activeTab
        .replace('report-', '')
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-slate-50 p-6">
          <div className="p-4 rounded-full bg-amber-50 text-amber-600 border border-amber-200 mb-4 shadow-sm">
            <span className="text-3xl">🚧</span>
          </div>
          <h2 className="text-xl font-bold text-slate-800 tracking-wide uppercase">
            {reportTitle} Report
          </h2>
          <p className="text-sm mt-1 text-slate-500 max-w-sm text-center">
            This module is currently under development and will be available in a future update.
          </p>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardView
            restaurantName={restaurantName}
            onNavigate={(tab) => setActiveTab(tab)}
            onSelectTicket={handleSelectTicket}
          />
        );
      case 'pos':
        return (
          <PosViewWrapper
            activeOrder={activeOrder}
            onResetOrder={handleResetOrder}
            onClose={handleClosePos}
          />
        );
      case 'purchase':
        return (
          <PurchaseReceiptForm
            key="PUR"
            onCancel={() => setActiveTab('purchaselist')}
          />
        );
      case 'purchaselist':
        return (
          <PurchaseList
            key="PUR"
            // "+ New purchase" opens the same screen as Transactions → Purchase
            onNewPurchase={() => setActiveTab('purchase')}
          />
        );
      // Purchase returns: the same screens as purchases, with type RP
      // (stock goes down instead of up).
      case 'returnpurchase':
        return (
          <PurchaseReceiptForm
            key="RP"
            kind="RP"
            onCancel={() => setActiveTab('returnpurchaselist')}
          />
        );
      case 'returnpurchaselist':
        return (
          <PurchaseList
            key="RP"
            kind="RP"
            onNewPurchase={() => setActiveTab('returnpurchase')}
          />
        );
      case 'categories':
        return <Categories />;
      case 'modifiers':
        return <Modifiers />;
      case 'raw-materials':
        return <RawMaterials />;
      case 'menu-items':
        return <Products />;
      case 'tables':
        return <Tables />;
      case 'customers':
        return <Customers />;
      case 'suppliers':
        return <Suppliers />;
      case 'kitchenscreen':
        return <KDSContainer />;
      case 'kitchenstations':
        return <KitchenStations />;
      case 'RestaurantSettings':
        return <RestaurantSettings />;
      case 'printers':
        return <PrintersSettings />;
      default:
        return (
          <DashboardView
            restaurantName={restaurantName}
            onNavigate={(tab) => setActiveTab(tab)}
            onSelectTicket={handleSelectTicket}
          />
        );
    }
  };

  return (
    <SidebarLayout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onLogout={handleLogout}
      restaurantName={restaurantName}
    >
      {renderContent()}
    </SidebarLayout>
  );
}

export default App;
