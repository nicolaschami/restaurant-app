// src/components/ReceiptPrintout.tsx
import React, { forwardRef } from 'react';
import type { KDSTicket } from '../types/kds';

interface ReceiptProps {
  ticket: KDSTicket;
  restaurantName?: string;
}

export const ReceiptPrintout = forwardRef<HTMLDivElement, ReceiptProps>(
  ({ ticket, restaurantName = 'OUR RESTAURANT' }, ref) => {
    return (
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div ref={ref} className="pdf-receipt">
          <style>{`
            @media screen {
              .pdf-receipt {
                display: none;
              }
            }

            @media print {
              @page {
                margin: 15mm;
                size: A4 portrait; /* Standard PDF page size */
              }
              body {
                margin: 0;
                padding: 0;
                background: #fff;
              }
              .pdf-receipt {
                display: block !important;
                width: 100%;
                max-width: 600px; /* Centers the invoice content */
                margin: 0 auto;
                font-family: Arial, Helvetica, sans-serif;
                font-size: 14px;
                color: #000;
                line-height: 1.5;
              }
              .text-center { text-align: center; }
              .bold { font-weight: bold; }
              .divider { border-top: 1px solid #ccc; margin: 12px 0; }
              .item-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
              .mod-row { font-size: 12px; color: #555; padding-left: 15px; }
            }
          `}</style>

          <div className="text-center bold" style={{ fontSize: '22px', marginBottom: '4px' }}>
            {restaurantName}
          </div>
          <div className="text-center bold" style={{ fontSize: '16px' }}>
            Invoice / Order #{ticket.orderNumber}
          </div>
          <div className="text-center">{ticket.orderType.replace('_', ' ')}</div>
          {ticket.tableNumber && (
            <div className="text-center bold">Table: {ticket.tableNumber}</div>
          )}
          <div className="text-center">
            Date: {new Date(ticket.createdAt).toLocaleString()}
          </div>

          <div className="divider" />

          <div style={{ marginTop: '10px' }}>
            {ticket.items.map((item) => (
              <div key={item.id} style={{ marginBottom: '8px' }}>
                <div className="item-row">
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                </div>
                {item.modifiers?.map((mod, i) => (
                  <div key={i} className="mod-row">
                    + {mod}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="divider" />

          {ticket.notes && (
            <>
              <div>
                <span className="bold">Note:</span> {ticket.notes}
              </div>
              <div className="divider" />
            </>
          )}

          <div className="text-center bold" style={{ marginTop: '20px', fontSize: '14px' }}>
            THANK YOU FOR YOUR VISIT!
          </div>
        </div>
      </div>
    );
  }
);

ReceiptPrintout.displayName = 'ReceiptPrintout';