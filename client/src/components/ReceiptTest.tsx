import React, { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { ReceiptPrintout } from './ReceiptPrintout';
import type { KDSTicket } from '../types/kds';

// Mock ticket data for testing
const MOCK_TICKET: KDSTicket = {
  id: 'ticket-1',
  orderNumber: '104',
  tableNumber: 'Table 5',
  orderType: 'DINE_IN',
  createdAt: Date.now(),
  status: 'PENDING',
  notes: 'Pay attention no garlic no onion',
  items: [
    {
      id: 'item-1',
      name: 'Double Cheeseburger',
      quantity: 2,
      station: 'GRILL',
      modifiers: ['No Onions', 'Extra Cheese'],
    },
    {
      id: 'item-2',
      name: 'Large French Fries',
      quantity: 1,
      station: 'FRYER',
    },
    {
      id: 'item-3',
      name: 'Vanilla Milkshake',
      quantity: 1,
      station: 'DRINKS',
    },
  ],
};

export default function ReceiptTest() {
  const contentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: `Receipt-${MOCK_TICKET.orderNumber}`,
  });

  return (
    <div style={{ padding: '20px', background: '#222', minHeight: '100vh', color: '#fff' }}>
      <h2>Thermal Receipt Print Test</h2>
      <button
        onClick={() => handlePrint()}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          background: '#4F46E5',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          marginBottom: '20px',
        }}
      >
        Trigger Print Dialog
      </button>

      <h3>Print Preview (Visual Check):</h3>
      <div style={{ background: '#fff', color: '#000', display: 'inline-block', padding: '10px' }}>
        {/* Render the printable component */}
        <ReceiptPrintout ref={contentRef} ticket={MOCK_TICKET} restaurantName="BURGER BAR" />
      </div>
    </div>
  );
}