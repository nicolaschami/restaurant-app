// src/types/kds.ts

export interface KDSItem {
  id: string;
  name: string;
  quantity: number;
  station: string;
  modifiers?: string[];
  completed?: boolean;
}

export interface KDSTicket {
  id: string;
  orderNumber: string;
  tableNumber?: string;
  orderType: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  createdAt: number;
  items: KDSItem[];
  status: 'PENDING' | 'IN_PROGRESS' | 'READY';
  notes?: string;
}