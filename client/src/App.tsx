import { useState } from 'react';
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
import Printo from './pages/Printo';
import RestaurantSettings from './pages/RestaurantSettings';
import PurchaseReceiptForm from './pages/Purchasetransactionscreen';
import PurchaseList from './pages/PurchaseTransactionsList';
import Login from './pages/Login';
import CurrentStockReport from './pages/CurrentStockReport';
import StockMovementReport from './pages/StockMovementReport';
import PurchasesReport from './pages/PurchasesReport';
import DailySalesReport from './pages/DailySalesReport';
import ZReportPage from './pages/ZReportPage';

const PosViewWrapper = PosView as React.ComponentType<{
  activeOrder?: ActiveOrder | null;
  onResetOrder?: () => void;
  onClose?: () => void;
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
    setToken(null);
    setActiveTab('dashboard');
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

  // The POS opens full screen (no sidebar): cashiers need all the room, and its
  // own header has a button back to the dashboard.
  if (activeTab === 'pos') {
    return (
      <PosViewWrapper
        activeOrder={activeOrder}
        onResetOrder={handleResetOrder}
        onClose={handleClosePos}
      />
    );
  }

  const renderContent = () => {
    // Reports that are built. Any other "report-…" tab shows the "under development" page.
    if (activeTab === 'report-current-stock') return <CurrentStockReport />;
    if (activeTab === 'report-stock-movement') return <StockMovementReport />;
    if (activeTab === 'report-purchases-supplier') return <PurchasesReport />;
    if (activeTab === 'report-daily-sales') return <DailySalesReport />;
    if (activeTab === 'report-z-report') return <ZReportPage />;

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
      case 'print':
        return <Printo />;
      case 'kitchenscreen':
        return <KDSContainer />;
      case 'kitchenstations':
        return <KitchenStations />;
      case 'RestaurantSettings':
        return <RestaurantSettings />;
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
