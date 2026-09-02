import { useState } from 'react';
import SidebarLayout from './components/SidebarLayout'; // Adjust path if located elsewhere in components
import DashboardView, { type ActiveOrder } from './pages/Dashboard';
import PosView from './pages/PosScreen'; // Adjust path if needed
import Categories from './pages/Categories';
import Modifiers from './pages/Modifiers';
import RawMaterials from './pages/RawMaterials';
import Products  from './pages/Products';
import Tables from './pages/Tablo';
import Customers from './pages/customers';
import Suppliers from './pages/Suppliers';

// Updated safe type wrapper to include onClose
const PosViewWrapper = PosView as React.ComponentType<{
  activeOrder?: ActiveOrder | null;
  onResetOrder?: () => void;
  onClose?: () => void; // 👈 Added onClose prop definition here
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
    setActiveOrder(null);      // Clear active ticket state
    setActiveTab('dashboard'); // Switch active view back to Dashboard
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
          onClose={handleClosePos} // 👈 Pass handler to POS wrapper
        />
      )}

    {activeTab === 'categories' && (
      <Categories  />
    )}
    {activeTab === 'modifiers' && (
      <Modifiers   />
    )}

  {activeTab === 'raw-materials' && (
      <RawMaterials   />
    )}

   {activeTab === 'menu-items' && (
      <Products   />
    )}
   
   {activeTab === 'tables' && (
      <Tables   />
    )}
   {activeTab === 'customers' && (
      <Customers   />
    )}

{activeTab === 'suppliers' && (
      <Suppliers   />
    )}

    </SidebarLayout>
  );
}

export default App;