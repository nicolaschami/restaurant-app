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

const PosViewWrapper = PosView as React.ComponentType<{
  activeOrder?: ActiveOrder | null;
  onResetOrder?: () => void;
  onClose?: () => void;
}>;

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pos' | string>('dashboard');
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);

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

  // Renders the appropriate view based on activeTab
  const renderContent = () => {
    // Handle all reports dynamically with an Under Construction fallback view
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
            restaurantName="My Kitchen"
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
            restaurantName="My Kitchen"
            onNavigate={(tab) => setActiveTab(tab)}
            onSelectTicket={handleSelectTicket}
          />
        );
    }
  };

  return (
    <SidebarLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderContent()}
    </SidebarLayout>
  );
}

export default App;