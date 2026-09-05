export type OrderType = 'Dine-In' | 'Take Away' | 'Delivery';

export interface ModifierOption {
  label: string;
  price: number;
}

export interface ModifierGroup {
  name: string;
  options: ModifierOption[];
}

export interface Item {
  id: number;
  catId: string;
  name: string;
  price: number;
  modifierGroups?: ModifierGroup[];
}

export interface SelectedModifier {
  groupName: string;
  label: string;
  price: number;
}

export interface BasketItem {
  cartItemId: string;
  item: Item;
  selectedModifiers: SelectedModifier[];
  quantity: number;
  totalUnitPrice: number;
}
