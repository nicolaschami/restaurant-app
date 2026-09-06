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
import KitchenStations from './pages/kitchenstation'; // Your Kitchen Station Setup component
import KDSContainer from './pages/Kdscontainer';
import Printo from './pages/Printo'
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

  return (
    <SidebarLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && (
        <DashboardView
          restaurantName="My Kitchen"
          onNavigate={(tab) => setActiveTab(tab)}
          onSelectTicket={handleSelectTicket}
        />
      )}

      {activeTab === 'pos' && (
        <PosViewWrapper
          activeOrder={activeOrder}
          onResetOrder={handleResetOrder}
          onClose={handleClosePos}
        />
      )}

      {activeTab === 'categories' && <Categories />}
      {activeTab === 'modifiers' && <Modifiers />}
      {activeTab === 'raw-materials' && <RawMaterials />}
      {activeTab === 'menu-items' && <Products />}
      {activeTab === 'tables' && <Tables />}
      {activeTab === 'customers' && <Customers />}
      {activeTab === 'suppliers' && <Suppliers />}
      {activeTab === 'print' && <Printo />}

      {/* KDS Display Screen */}
      {activeTab === 'kitchenscreen' && <KDSContainer />}

      {/* Kitchen Station Management Setup Screen (Matches ID in SidebarLayout) */}
      {activeTab === 'kitchenstations' && <KitchenStations />}
      {activeTab === 'RestaurantSettings' && <RestaurantSettings />}
      
    </SidebarLayout>
  );
}

export default App;