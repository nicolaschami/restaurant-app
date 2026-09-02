import { useState } from 'react';
import SidebarLayout from './components/SidebarLayout'; // Adjust path if located elsewhere in components
import DashboardView, { type ActiveOrder } from './pages/Dashboard';
import PosView from './pages/PosScreen'; // Adjust path if needed

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
    </SidebarLayout>
  );
}

export default App;