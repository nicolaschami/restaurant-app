import React, { useState, useEffect, useMemo } from 'react';
import { useRef } from 'react'; 
import { api } from '../api';
import {
  Coffee,
  Wine,
  Utensils,
  Pizza,
  Cake,
  Search,
  Plus,
  Minus,
  CreditCard,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Sun,
  Moon,
  UtensilsCrossed,
  X,
  Trash2,
  Sparkles,
  SlidersHorizontal,
  Check,
  Printer,
  Archive,
  Gift,
  UserPlus,
 Phone,
  MapPin,
  FileText,
  Mail,
  Loader2
  } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface PosScreenProps {
  onLogout: () => void;
  // Minimal shape needed from the dashboard ticket — just enough to know which
  // order to fetch. Full line items/table/customer come from GET /orders/:id.
  activeOrder?: { orderId: number; ticketNo?: number } | null;
  onResetOrder?: () => void;
 onClose?: () => void; // 👈 Accept onClose
}

/* ---------- API SHAPES ---------- */

export interface ApiCategory {
  id: number;
  restaurantId: number;
  name: string;
  printername: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
  updatedById: number | null;
}

export interface VariantPrice {
  size: string;
  dineIn: number;
  waiter: number;
  delivery: number;
  takeaway: number;
}

export interface ApiMenuItem {
  id: number;
  restaurantId: number;
  categoryId: number;
  menuName: string;
  invoiceName: string;
  kitchenName: string;
  priceDineIn: string;
  priceTakeaway: string;
  priceDelivery: string;
  priceWaiter: string;
  costPrice: string;
  description: string | null;
  images: string[];
  isAvailable: boolean;
  position: number;
  hasVariants: boolean;
  variantPrices: VariantPrice[];
  modifierGroupIds?: number[];
}

export interface ApiModifierOption {
  id: number;
  name: string;
  price?: number | string;
  priceAdjustment?: number | string;
}

export interface ApiModifierGroup {
  id: number;
  name: string;
  minSelection: number;
  maxSelection: number;
  isRequired?: boolean;
  options: ApiModifierOption[];
}

/* ---------- DISPLAY / DOMAIN SHAPES ---------- */

export interface Item {
  id: number;
  catId: number;
  name: string;
  price: number;
  description?: string;
  image?: string;
  hasVariants: boolean;
  variantPrices?: VariantPrice[];
  modifierGroupIds?: number[];
}

export interface SelectedModifier {
  groupId: number;
  groupName: string;
  optionId: number;
  optionName: string;
  price: number;
}

export interface CompInfo {
  reason: string;
}

export interface BasketItem {
  cartItemId: string;
  item: Item;
  quantity: number;
  variantSize?: string;
  modifiers: SelectedModifier[];
  comp?: CompInfo | null;
}

interface Category {
  id: number;
  label: string;
  icon: LucideIcon;
  no: string;
}

export interface RestaurantTable {
  id: number;
  label: string; // e.g. "23"
  capacity?: number;
  status: 'free' | 'occupied';
  occupiedOrderNo?: number;
  zone?: string;   // e.g., "Main Dining", "Patio", "Bar"
  notes?: string;  // e.g., "Near window", "VIP Table"
}

export interface Customer {
  id: number | string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

// Fallback used only if /tables isn't available yet — lets the picker work
// today and get replaced transparently once a real Tables backend exists.
const generateMockTables = (): RestaurantTable[] =>
  Array.from({ length: 16 }, (_, i) => ({
    id: i + 1,
    label: String(i + 1),
    capacity: i % 4 === 3 ? 6 : 4,
    status: [3, 7, 12].includes(i) ? 'occupied' : 'free',
    occupiedOrderNo: [3, 7, 12].includes(i) ? 280 + i : undefined,
  }));

type OrderType = 'Dine-In' | 'Takeaway' | 'Delivery';
type Theme = 'dark' | 'light';

const getCategoryIcon = (name: string): LucideIcon => {
  const lower = name.toLowerCase();
  if (lower.includes('drink') || lower.includes('coffee') || lower.includes('hot')) return Coffee;
  if (lower.includes('beverage') || lower.includes('wine')) return Wine;
  if (lower.includes('appetizer')) return Utensils;
  if (lower.includes('main')) return Pizza;
  if (lower.includes('dessert') || lower.includes('desert')) return Cake;
  return UtensilsCrossed;
};

/* ---------- PRICE RESOLUTION ---------- */

const variantKeyByOrderType: Record<OrderType, keyof VariantPrice> = {
  'Dine-In': 'dineIn',
  'Takeaway': 'takeaway',
  'Delivery': 'delivery',
};

const flatKeyByOrderType: Record<OrderType, 'priceDineIn' | 'priceTakeaway' | 'priceDelivery'> = {
  'Dine-In': 'priceDineIn',
  'Takeaway': 'priceTakeaway',
  'Delivery': 'priceDelivery',
};

const resolveMinPrice = (raw: ApiMenuItem, orderType: OrderType): number => {
  if (raw.hasVariants && raw.variantPrices?.length) {
    const key = variantKeyByOrderType[orderType];
    const prices = raw.variantPrices
      .map((v) => Number(v[key]) || 0)
      .filter((p) => p > 0);
    return prices.length ? Math.min(...prices) : 0;
  }
  return Number(raw[flatKeyByOrderType[orderType]]) || 0;
};

const resolveVariantPrice = (variant: VariantPrice, orderType: OrderType): number => {
  const key = variantKeyByOrderType[orderType];
  return Number(variant[key]) || 0;
};

const parseModPrice = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

let ticketSeq = 214;

export default function PosScreen({onClose, onLogout, activeOrder, onResetOrder }: PosScreenProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<number | null>(null);
  const [theme, setTheme] = useState<Theme>('dark');

  const [categories, setCategories] = useState<Category[]>([]);
  const [rawMenuItems, setRawMenuItems] = useState<ApiMenuItem[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ApiModifierGroup[]>([]);
  const [activeCat, setActiveCat] = useState<number | null>(null);
  
  const [isLoadingCategories, setIsLoadingCategories] = useState<boolean>(true);
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [orderType, setOrderType] = useState<OrderType>('Dine-In');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [ticketNo, setTicketNo] = useState<number>(() => ticketSeq++);
  const [basket, setBasket] = useState<BasketItem[]>([]);

  const [variantModalItem, setVariantModalItem] = useState<ApiMenuItem | null>(null);
  const [modifierPickerFor, setModifierPickerFor] = useState<BasketItem | null>(null);
  const [pendingModifierSelection, setPendingModifierSelection] = useState<SelectedModifier[]>([]);

  const [qtyEditorId, setQtyEditorId] = useState<string | null>(null);
  const [qtyEditorValue, setQtyEditorValue] = useState<string>('');
  const [compTargetId, setCompTargetId] = useState<string | null>(null);
  const [compQty, setCompQty] = useState<number>(1);
  const [showPrintPreview, setShowPrintPreview] = useState<boolean>(false);
  const [deliveryFee, setDeliveryFee] = useState<string>('0.00');

  /* ---------- ORDER TYPE DETAIL: table (Dine-In) / customer (Delivery) ---------- */
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [dineInTable, setDineInTable] = useState<RestaurantTable | null>(null);
  const [showTablePicker, setShowTablePicker] = useState<boolean>(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deliveryCustomer, setDeliveryCustomer] = useState<Customer | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState<boolean>(false);
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [isAddingCustomer, setIsAddingCustomer] = useState<boolean>(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [newCustomerNotes, setNewCustomerNotes] = useState('');

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setIsLoadingCategories(true);
        setIsLoadingItems(true);
        setError(null);

        const [catRes, itemRes, modRes, tableRes, customerRes] = await Promise.all([
          api.get('/categories', { params: { restaurantId: 1 } }),
          api
            .get('/menu-items', { params: { restaurant_id: 1, limit: 2000 } })
            .catch(() => ({ data: [] })),
          api
            .get('/modifier-groups', { params: { restaurantId: 1 } })
            .catch(() => ({ data: [] })),
          api
            .get('/tables', { params: { restaurantId: 1 } })
            .catch(() => ({ data: generateMockTables() })),
          api
            .get('/customers', { params: { restaurantId: 1 } })
            .catch(() => ({ data: [] })),
        ]);

        const rawCategories: ApiCategory[] = catRes.data.categories || catRes.data || [];
        const formattedCategories: Category[] = rawCategories
          .sort((a, b) => a.position - b.position)
          .map((cat, index) => ({
            id: cat.id,
            label: cat.name,
            icon: getCategoryIcon(cat.name),
            no: String(index + 1).padStart(2, '0'),
          }));

        setCategories(formattedCategories);
        if (formattedCategories.length > 0) {
          setActiveCat((prev) => prev ?? formattedCategories[0].id);
        }

        const rawItems: ApiMenuItem[] = itemRes.data.menuItems || itemRes.data || [];
        setRawMenuItems(
          rawItems
            .filter((i) => i.isAvailable)
            .map((i: any) => ({
              ...i,
              modifierGroupIds: i.modifierGroupIds || i.modifier_group_ids || [],
            }))
        );

        const rawMods = modRes.data;
        const baseGroups = Array.isArray(rawMods)
          ? rawMods
          : rawMods?.modifierGroups || rawMods?.data || [];
        const parsedGroups: ApiModifierGroup[] = baseGroups.map((g: any) => ({
          id: g.id,
          name: g.name,
          minSelection: g.minSelection ?? 0,
          maxSelection: g.maxSelection ?? 1,
          isRequired: g.isRequired ?? false,
          options: (g.options || g.modifiers || g.items || []).map((o: any) => ({
            id: o.id,
            name: o.name,
            price: parseModPrice(o.price ?? o.priceAdjustment),
          })),
        }));
        setModifierGroups(parsedGroups);

        const rawTables = tableRes.data;
        const tableList: RestaurantTable[] = Array.isArray(rawTables)
          ? rawTables
          : rawTables?.tables || generateMockTables();
        setTables(
          tableList.map((t: any) => ({
            id: t.id,
            label: String(t.label ?? t.number ?? t.name ?? t.id),
            capacity: t.capacity,
            status: t.status === 'occupied' ? 'occupied' : 'free',
            occupiedOrderNo: t.occupiedOrderNo ?? t.orderNo,
            zone: t.zone,
            notes: t.notes,
          }))
        );

        const rawCustomers = customerRes.data;
        const customerList = Array.isArray(rawCustomers)
          ? rawCustomers
          : rawCustomers?.customers || [];
        setCustomers(
          customerList.map((c: any) => ({
            id: c.id,
            name: c.name ?? c.customerName ?? 'Unnamed',
            phone: c.phone ?? '',
            email: c.email ?? '',
            address: c.address ?? '',
            notes: c.notes ?? c.customerNotes ?? '',
          }))
        );
      } catch (err: any) {
        if (err.response?.status === 401) {
          onLogout();
        } else {
          setError(err.response?.data?.message || 'Could not load menu. Check server connection.');
        }
      } finally {
        setIsLoadingCategories(false);
        setIsLoadingItems(false);
      }
    };

    fetchAll();
  }, [onLogout]);

  /* ---------- LOAD A SELECTED TICKET FROM THE DASHBOARD ---------- */
  useEffect(() => {
    const orderId = activeOrder?.orderId;
    if (!orderId) return;
    // Wait until menu/table/customer lists are in, so we can match line items
    // back to real menu items and resolve table/customer objects.
    if (isLoadingItems || isLoadingCategories) return;

    let cancelled = false;

    const loadOrder = async () => {
      try {
        setIsLoadingOrder(true);
        setError(null);

        // NOTE: same convention as the rest of this file (api.post('/orders', ...),
        // api.get('/orders/active')) — no '/api' prefix, that lives in the api client's baseURL.
        const res = await api.get(`/orders/${orderId}`);
        const order = res.data.order || res.data;
        if (cancelled) return;

        setTicketNo(order.ticketNo ?? activeOrder?.ticketNo ?? ticketSeq);
        setOrderType((order.orderType as OrderType) || 'Dine-In');
        setDeliveryFee(String(order.deliveryFee ?? 0));

        if (order.orderType === 'Dine-In' && order.tableId) {
          const matchedTable = tables.find((t) => t.id === order.tableId);
          setDineInTable(
            matchedTable ?? {
              id: order.tableId,
              label: order.tableLabel ?? String(order.tableId),
              status: 'occupied',
            }
          );
        } else {
          setDineInTable(null);
        }

        if (order.orderType === 'Delivery' && (order.customerId || order.customerName)) {
          const matchedCustomer = customers.find((c) => c.id === order.customerId);
          setDeliveryCustomer(
            matchedCustomer ?? {
              id: order.customerId ?? order.customerName,
              name: order.customerName ?? 'Customer',
              phone: order.customerPhone ?? '',
              address: order.customerAddress ?? order.deliveryAddress ?? '',
            }
          );
        } else {
          setDeliveryCustomer(null);
        }

        const lineItems = order.items || [];
        const rebuiltBasket: BasketItem[] = lineItems.map((li: any, idx: number) => {
          const rawItem = rawMenuItems.find((r) => r.id === li.menuItemId);
          return {
            cartItemId: `${order.id ?? orderId}-${idx}-${Date.now()}`,
            item: {
              id: li.menuItemId,
              catId: rawItem?.categoryId ?? 0,
              name: li.name ?? rawItem?.menuName ?? 'Item',
              price: Number(li.unitPrice) || 0,
              hasVariants: rawItem?.hasVariants ?? false,
              variantPrices: rawItem?.variantPrices,
              modifierGroupIds: rawItem?.modifierGroupIds,
            },
            quantity: li.quantity ?? 1,
            variantSize: li.variantSize || undefined,
            modifiers: (li.modifiers || []).map((m: any) => ({
              groupId: m.groupId,
              groupName: m.groupName,
              optionId: m.optionId,
              optionName: m.optionName,
              price: Number(m.price) || 0,
            })),
            comp: li.isComp ? { reason: li.compReason || '' } : null,
          };
        });

        setBasket(rebuiltBasket);
        console.log('[currentOrderId SET FROM LOAD EFFECT]', order.id ?? orderId, '(loaded from GET /orders/:id)');
       setCurrentOrderId(order.id ?? orderId);
      } catch (err: any) {
        if (!cancelled) {
          console.error('Failed to load order', err);
          setError(err.response?.data?.message || 'Could not load the selected order.');
        }
      } finally {
        if (!cancelled) setIsLoadingOrder(false);
        // Clear the parent's selection so re-visiting POS without a new click
        // doesn't keep refetching the same order.
        onResetOrder?.();
      }
    };

    loadOrder();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrder?.orderId, isLoadingItems, isLoadingCategories]);

  const displayItems: Item[] = useMemo(
    () =>
      rawMenuItems.map((raw) => ({
        id: raw.id,
        catId: raw.categoryId,
        name: raw.menuName,
        description: raw.description ?? undefined,
        image: raw.images?.[0],
        price: resolveMinPrice(raw, orderType),
        hasVariants: raw.hasVariants,
        variantPrices: raw.variantPrices,
        modifierGroupIds: raw.modifierGroupIds || [],
      })),
    [rawMenuItems, orderType]
  );

  const filteredItems = displayItems.filter(
    (i) =>
      (activeCat === null || i.catId === activeCat) &&
      i.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCategory = categories.find((c) => c.id === activeCat);

  const handleItemClick = (item: Item) => {
    if (item.hasVariants) {
      const raw = rawMenuItems.find((r) => r.id === item.id);
      if (raw) setVariantModalItem(raw);
      return;
    }
    addToBasket(item);
  };

  const addToBasket = (item: Item, variant?: VariantPrice) => {
    const price = variant ? resolveVariantPrice(variant, orderType) : item.price;
    const variantSize = variant?.size;
    const matchKey = `${item.id}-${variantSize ?? ''}`;

    setBasket((prev) => {
      const existing = prev.find(
        (b) => `${b.item.id}-${b.variantSize ?? ''}` === matchKey && !b.comp
      );
      if (existing) {
        return prev.map((b) =>
          b === existing ? { ...b, quantity: b.quantity + 1 } : b
        );
      }
      return [
        ...prev,
        {
          cartItemId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          item: { ...item, price },
          quantity: 1,
          variantSize,
          modifiers: [],
        },
      ];
    });

    setVariantModalItem(null);
  };

  const updateQuantity = (cartItemId: string, delta: number) => {
    setBasket((prev) =>
      prev
        .map((b) => {
          if (b.cartItemId === cartItemId) {
            const newQty = b.quantity + delta;
            return newQty > 0 ? { ...b, quantity: newQty } : null;
          }
          return b;
        })
        .filter((b): b is BasketItem => b !== null)
    );
  };

  const setExactQuantity = (cartItemId: string, qty: number) => {
    if (qty <= 0) {
      removeItem(cartItemId);
      return;
    }
    setBasket((prev) =>
      prev.map((b) => (b.cartItemId === cartItemId ? { ...b, quantity: qty } : b))
    );
  };

  const removeItem = (cartItemId: string) => {
    setBasket((prev) => prev.filter((b) => b.cartItemId !== cartItemId));
  };

  /* ---------- MODIFIER LINKING ---------- */

  const getGroupsForItem = (item: Item): ApiModifierGroup[] =>
    (item.modifierGroupIds || [])
      .map((id) => modifierGroups.find((g) => g.id === id))
      .filter((g): g is ApiModifierGroup => Boolean(g));

  const modifiersTotal = (b: BasketItem) =>
    (b.modifiers || []).reduce((sum, m) => sum + m.price, 0);

  const openModifierPicker = (b: BasketItem) => {
    setModifierPickerFor(b);
    setPendingModifierSelection(b.modifiers || []);
  };

  const toggleModifierOption = (group: ApiModifierGroup, option: ApiModifierOption) => {
    setPendingModifierSelection((prev) => {
      const exists = prev.find((m) => m.groupId === group.id && m.optionId === option.id);
      if (exists) {
        return prev.filter((m) => !(m.groupId === group.id && m.optionId === option.id));
      }
      const price = parseModPrice(option.price ?? option.priceAdjustment);
      const selectedInGroup = prev.filter((m) => m.groupId === group.id);

      if (group.maxSelection === 1) {
        const withoutGroup = prev.filter((m) => m.groupId !== group.id);
        return [
          ...withoutGroup,
          { groupId: group.id, groupName: group.name, optionId: option.id, optionName: option.name, price },
        ];
      }

      if (group.maxSelection > 0 && selectedInGroup.length >= group.maxSelection) {
        return prev;
      }

      return [
        ...prev,
        { groupId: group.id, groupName: group.name, optionId: option.id, optionName: option.name, price },
      ];
    });
  };

  const confirmModifierSelection = () => {
    if (!modifierPickerFor) return;
    setBasket((prev) =>
      prev.map((b) =>
        b.cartItemId === modifierPickerFor.cartItemId
          ? { ...b, modifiers: pendingModifierSelection }
          : b
      )
    );
    setModifierPickerFor(null);
  };

  /* ---------- QUANTITY KEYPAD ---------- */

  const openQtyEditor = (b: BasketItem) => {
    setQtyEditorId(b.cartItemId);
    setQtyEditorValue(String(b.quantity));
  };

  const pressDigit = (d: string) => {
    setQtyEditorValue((v) => {
      const next = v === '0' ? d : v + d;
      return next.slice(0, 3);
    });
  };

  const pressBackspace = () => setQtyEditorValue((v) => v.slice(0, -1));
  const pressClearQty = () => setQtyEditorValue('');

  const confirmQtyEditor = () => {
    const n = parseInt(qtyEditorValue, 10);
    if (qtyEditorId && !isNaN(n)) {
      setExactQuantity(qtyEditorId, n);
    }
    setQtyEditorId(null);
  };

  /* ---------- COMP / GIFT ITEM ---------- */

  const COMP_REASONS = ['Staff Meal', 'Manager Comp', 'Kitchen Error', 'Promotion'];

  const compTargetItem = basket.find((b) => b.cartItemId === compTargetId) || null;

  const toggleComp = (b: BasketItem) => {
    if (b.comp) {
      setBasket((prev) =>
        prev.map((x) => (x.cartItemId === b.cartItemId ? { ...x, comp: null } : x))
      );
    } else {
      setCompTargetId(b.cartItemId);
      setCompQty(1);
    }
  };

  const incCompQty = () =>
    setCompQty((q) => Math.min(q + 1, compTargetItem?.quantity ?? q));
  const decCompQty = () => setCompQty((q) => Math.max(q - 1, 1));

  const applyComp = (reason: string) => {
    if (!compTargetId) return;
    setBasket((prev) => {
      const idx = prev.findIndex((b) => b.cartItemId === compTargetId);
      if (idx === -1) return prev;
      const target = prev[idx];
      const n = Math.min(Math.max(compQty, 1), target.quantity);

      if (n >= target.quantity) {
        const updated = [...prev];
        updated[idx] = { ...target, comp: { reason } };
        return updated;
      }

      const compedLine: BasketItem = {
        ...target,
        cartItemId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        quantity: n,
        modifiers: [...target.modifiers],
        comp: { reason },
      };
      const remainingLine: BasketItem = {
        ...target,
        quantity: target.quantity - n,
        modifiers: [...target.modifiers],
        comp: null,
      };
      const updated = [...prev];
      updated.splice(idx, 1, remainingLine, compedLine);
      return updated;
    });
    setCompTargetId(null);
  };

  /* ---------- PER-LINE PRICE (accounts for comp) ---------- */

  const lineUnitPrice = (b: BasketItem) => (b.comp ? 0 : b.item.price + modifiersTotal(b));

  /* ---------- HARDWARE ACTIONS ---------- */

  const handleOpenDrawer = () => {
    alert('Drawer signal sent');
  };

  const handlePrintCopy = () => {
    alert('Copy sent to printer');
    setShowPrintPreview(false);
  };

  const deliveryFeeNum = orderType === 'Delivery' ? parseFloat(deliveryFee) || 0 : 0;

  const subtotal = basket.reduce((acc, b) => acc + lineUnitPrice(b) * b.quantity, 0);
  const tax = subtotal * 0.1;
  const total = subtotal + tax + deliveryFeeNum;
  const itemCount = basket.reduce((a, b) => a + b.quantity, 0);

  /* ---------- SAVE ORDER ---------- */

// add near your other useState lines:
const savingRef = useRef(false);

const handleSaveOrder = async (isPayment: boolean) => {
  // Hard, synchronous guard — impossible to double-fire even on a fast double-click,
  // unlike isSaving (state), which can lag a render behind the actual click.
  if (savingRef.current) {
    console.log('[SAVE] blocked — already saving');
    return;
  }

  console.log('[SAVE] start', { isPayment, basketLength: basket.length, orderType, currentOrderId });

  if (basket.length === 0) {
    console.log('[SAVE] blocked — empty basket');
    return;
  }
  if (orderType === 'Dine-In' && !dineInTable) {
    console.log('[SAVE] blocked — no table selected, opening picker');
    setShowTablePicker(true);
    return;
  }
  if (orderType === 'Delivery' && !deliveryCustomer) {
    console.log('[SAVE] blocked — no customer selected, opening picker');
    setShowCustomerPicker(true);
    return;
  }

  savingRef.current = true;
  setIsSaving(true);
  setError(null);

  try {
    const orderPayload = {
      restaurantId: 1,
      ticketNo,
      orderStatus: isPayment ? 'CLOSED' : 'open',
      tableStatus: isPayment ? 'free' : 'occupied',
      orderType,
      tableId: orderType === 'Dine-In' ? dineInTable?.id : null,
      tableLabel: orderType === 'Dine-In' ? dineInTable?.label : null,
      customerId: orderType === 'Delivery' ? deliveryCustomer?.id : null,
      customerName: orderType === 'Delivery' ? deliveryCustomer?.name : null,
      customerPhone: orderType === 'Delivery' ? deliveryCustomer?.phone : null,
      customerAddress: orderType === 'Delivery' ? deliveryCustomer?.address : null,
      deliveryFee: deliveryFeeNum,
      subtotal,
      tax,
      total,
      items: basket.map((b) => ({
        menuItemId: b.item.id,
        name: b.item.name,
        quantity: b.quantity,
        unitPrice: b.item.price,
        variantSize: b.variantSize || null,
        isComp: Boolean(b.comp),
        compReason: b.comp ? b.comp.reason : null,
        modifiers: (b.modifiers || []).map((m) => ({
          groupId: m.groupId,
          groupName: m.groupName,
          optionId: m.optionId,
          optionName: m.optionName,
          price: m.price,
        })),
        lineTotal: lineUnitPrice(b) * b.quantity,
      })),
    };

    console.log('[SAVE] currentOrderId =', currentOrderId, '→ branch:', currentOrderId ? 'UPDATE' : 'CREATE');

    let savedOrderId = currentOrderId;
    if (currentOrderId) {
      const res = await api.put(`/orders/${currentOrderId}`, orderPayload);
      console.log('[SAVE] PUT response', res.data);
    } else {
      const res = await api.post('/orders', orderPayload);
      savedOrderId = res.data?.order?.id ?? null;
      console.log('[SAVE] POST response, new id =', savedOrderId);
    }

    const tableRes = await api
      .get('/tables', { params: { restaurantId: 1 } })
      .catch(() => ({ data: [] }));
    const freshTables = Array.isArray(tableRes.data) ? tableRes.data : tableRes.data?.tables || [];
    if (freshTables.length > 0) {
      setTables(freshTables);
    } else if (orderType === 'Dine-In' && dineInTable) {
      setTables((prev) => prev.map((t) => (t.id === dineInTable.id ? { ...t, status: 'occupied' } : t)));
    }

    setBasket([]);
    setDineInTable(null);
    setDeliveryCustomer(null);
    setDeliveryFee('0.00');
    if (!currentOrderId) setTicketNo((prev) => prev + 1);
    setCurrentOrderId(null);

    console.log('[SAVE] success, done. saved order id =', savedOrderId);
    onClose?.();
  } catch (err: any) {
    console.error('[SAVE] failed:', err);
    setError(err.response?.data?.message || err.response?.data?.error || 'Failed to save order. Please try again.');
  } finally {
    setIsSaving(false);
    savingRef.current = false;
  }
};
/* ---------- Update order  ---------- */













/* ---------- End Update order  ---------- */


  /* ---------- ORDER TYPE SWITCHING ---------- */

  const handleOrderTypeChange = (type: OrderType) => {
    setOrderType(type);
    if (type === 'Dine-In') setShowTablePicker(true);
    if (type === 'Delivery') setShowCustomerPicker(true);
  };

  const selectTable = (table: RestaurantTable) => {
    if (table.status === 'occupied') return;
    setDineInTable(table);
    setShowTablePicker(false);
  };

  const filteredCustomers = customers.filter((c) => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return true;

    const nameMatch = c.name?.toLowerCase().includes(q) ?? false;
    const phoneMatch = c.phone?.toLowerCase().includes(q) ?? false;
    const emailMatch = c.email?.toLowerCase().includes(q) ?? false;
    const addressMatch = c.address?.toLowerCase().includes(q) ?? false;

    return nameMatch || phoneMatch || emailMatch || addressMatch;
  });

  const selectCustomer = (customer: Customer) => {
    setDeliveryCustomer(customer);
    setShowCustomerPicker(false);
    setCustomerSearch('');
    setIsAddingCustomer(false);
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) return;

    const customerData = {
      name: newCustomerName.trim(),
      phone: newCustomerPhone.trim(),
      email: newCustomerEmail.trim(),
      address: newCustomerAddress.trim(),
      notes: newCustomerNotes.trim(),
    };

    try {
      const response = await api.post('/customers', customerData);
      const savedCustomer = response.data;

      setCustomers((prev) => [...prev, savedCustomer]);
      selectCustomer(savedCustomer);

      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerEmail('');
      setNewCustomerAddress('');
      setNewCustomerNotes('');
    } catch (error) {
      console.error('Failed to save customer:', error);
    }
  };

  const orderLabel = (() => {
    if (orderType === 'Dine-In') {
      return dineInTable
        ? `Dine-In – T#${dineInTable.label} – Order #${ticketNo}`
        : `Dine-In – Select Table – Order #${ticketNo}`;
    }
    if (orderType === 'Delivery') {
      return deliveryCustomer
        ? `Delivery – ${deliveryCustomer.name} – Order #${ticketNo}`
        : `Delivery – Select Customer – Order #${ticketNo}`;
    }
    return `Takeaway – Order #${ticketNo}`;
  })();

  const iconColor = theme === 'dark' ? '#201a0c' : '#fbf5e8';
  const inactiveIconColor = 'var(--muted)';

  return (
    <div className="pos-root" data-theme={theme}>
      <style>{`
/* Customer Info - Updated */
.customer-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.customer-details {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.customer-detail-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--muted-2);
  background: var(--panel-2);
  padding: 2px 10px 2px 6px;
  border-radius: 12px;
  border: 1px solid var(--hairline);
}

.customer-detail-item svg {
  flex-shrink: 0;
  color: var(--brass-soft);
}



@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

        .pos-root {
          font-family: 'Inter', sans-serif;
          width: 100%;
          height: 100vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          -webkit-font-smoothing: antialiased;
          transition: background 0.25s ease, color 0.25s ease;
          position: relative;
        }

        /* ---------- DARK TOKENS ---------- */
        .pos-root[data-theme='dark'] {
          --bg: #141d18;
          --bg-deep: #0e1512;
          --panel: #1b2620;
          --panel-2: #212e26;
          --card: #24322a;
          --card-hover: #2c3e34;
          --hairline: #34453a;
          --brass: #c9a24b;
          --brass-soft: #e0c887;
          --brass-dim: #8a6f34;
          --rust: #b1573a;
          --text-primary: #f3ecdc;
          --text-heading: #f3ecdc;
          --muted: #93a094;
          --muted-2: #6f7d70;
          --toggle-icon: #e0c887;
          --overlay: rgba(6, 10, 8, 0.65);
          background: var(--bg);
          color: var(--text-primary);
        }

        /* ---------- LIGHT TOKENS ---------- */
        .pos-root[data-theme='light'] {
          --bg: #f2ead6;
          --bg-deep: #e3d3a4;
          --panel: #f9f2df;
          --panel-2: #ecdfb9;
          --card: #fdf9ee;
          --card-hover: #f7ecce;
          --hairline: #d6c28e;
          --brass: #916b28;
          --brass-soft: #74551e;
          --brass-dim: #bd9142;
          --rust: #9c4530;
          --text-primary: #2b2115;
          --text-heading: #201808;
          --muted: #6e6045;
          --muted-2: #8f7f5c;
          --toggle-icon: #916b28;
          --overlay: rgba(43, 33, 21, 0.4);
          background: var(--bg);
          color: var(--text-primary);
        }

        .pos-root[data-theme='light'] .item-card {
          box-shadow: 0 4px 12px rgba(43,33,21,0.05);
        }
        .pos-root[data-theme='light'] .brand-mark,
        .pos-root[data-theme='light'] .btn-pay {
          color: #fbf5e8;
        }
        .pos-root[data-theme='light'] .item-card:hover .item-add {
          color: #fbf5e8;
        }
        .pos-root[data-theme='light'] .order-switch button.active {
          color: #fbf5e8;
        }
        .pos-root[data-theme='light'] .btn-modifier-save {
          color: #fbf5e8;
        }

        .serif { font-family: 'Fraunces', serif; }
        .mono { font-family: 'IBM Plex Mono', monospace; }

        /* ---------- HEADER ---------- */
        .pos-header {
          height: 68px;
          flex-shrink: 0;
          background: var(--bg-deep);
          border-bottom: 1px solid var(--hairline);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 28px;
          transition: background 0.25s ease, border-color 0.25s ease;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          z-index: 10;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .brand-mark {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: linear-gradient(135deg, var(--brass-soft), var(--brass-dim));
          display: flex;
          align-items: center;
          justify-content: center;
          color: #201a0c;
          font-family: 'Fraunces', serif;
          font-weight: 700;
          font-size: 18px;
          box-shadow: 0 3px 12px rgba(201,162,75,0.25);
        }
        .brand-text h1 {
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 18px;
          letter-spacing: 0.02em;
          color: var(--text-heading);
          margin: 0;
        }
        .brand-text p {
          font-size: 10.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted-2);
          margin: 2px 0 0;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .theme-toggle {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          border: 1px solid var(--hairline);
          background: var(--panel);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--toggle-icon);
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .theme-toggle:hover {
          background: var(--card-hover);
          border-color: var(--brass-dim);
          transform: scale(1.05);
        }

        .order-switch {
          display: flex;
          gap: 4px;
          background: var(--bg);
          border: 1px solid var(--hairline);
          border-radius: 10px;
          padding: 4px;
        }
        .order-switch button {
          font-family: 'Inter', sans-serif;
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 0.02em;
          padding: 8px 18px;
          border-radius: 7px;
          border: none;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .order-switch button.active {
          background: var(--brass);
          color: #201a0c;
          box-shadow: 0 2px 10px rgba(201,162,75,0.3);
        }
        .order-switch button:not(.active):hover {
          color: var(--text-heading);
        }

        /* ---------- BODY GRID ---------- */
        .pos-body {
          flex: 1;
          display: grid;
          grid-template-columns: 230px 1fr 380px;
          overflow: hidden;
        }

        /* ---------- CATEGORY RAIL ---------- */
        .cat-rail {
          background: var(--bg-deep);
          border-right: 1px solid var(--hairline);
          padding: 20px 12px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition: background 0.25s ease, border-color 0.25s ease;
        }
        .cat-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted-2);
          padding: 0 10px 10px;
        }
        .cat-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 12px;
          border-radius: 9px;
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s ease;
          position: relative;
        }
        .cat-btn:hover {
          background: var(--panel-2);
          transform: translateX(2px);
        }
        .cat-btn.active {
          background: var(--panel-2);
          border-color: var(--hairline);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .cat-btn.active::before {
          content: '';
          position: absolute;
          left: -12px;
          top: 10px;
          bottom: 10px;
          width: 4px;
          background: var(--brass);
          border-radius: 0 4px 4px 0;
          box-shadow: 0 0 10px var(--brass);
        }
        .cat-no {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          color: var(--muted-2);
          width: 16px;
          flex-shrink: 0;
        }
        .cat-btn.active .cat-no { color: var(--brass); font-weight: 600; }
        .cat-icon-wrap {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: var(--panel);
          border: 1px solid var(--hairline);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.2s ease;
        }
        .cat-btn.active .cat-icon-wrap {
          background: var(--brass);
          border-color: var(--brass);
          box-shadow: 0 2px 8px rgba(201,162,75,0.3);
        }
        .cat-btn span.label {
          font-size: 13px;
          font-weight: 500;
          color: var(--muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cat-btn.active span.label { color: var(--text-heading); font-weight: 600; }

        /* ---------- MENU / PRODUCTS ---------- */
        .menu-col {
          background: var(--bg);
          padding: 24px 28px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .menu-heading {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 18px;
        }
        .menu-heading h2 {
          font-family: 'Fraunces', serif;
          font-style: italic;
          font-weight: 500;
          font-size: 24px;
          color: var(--text-heading);
          margin: 0;
        }
        .menu-heading span {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: var(--muted-2);
        }

        .search-wrap {
          position: relative;
          margin-bottom: 22px;
          flex-shrink: 0;
        }
        .search-wrap svg {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--muted-2);
        }
        .search-wrap input {
          width: 100%;
          background: var(--panel);
          border: 1px solid var(--hairline);
          border-radius: 10px;
          padding: 12px 16px 12px 42px;
          font-size: 13px;
          font-family: 'Inter', sans-serif;
          color: var(--text-primary);
          transition: all 0.2s ease;
        }
        .search-wrap input::placeholder { color: var(--muted-2); }
        .search-wrap input:focus {
          outline: none;
          border-color: var(--brass-dim);
          box-shadow: 0 0 0 3px rgba(201,162,75,0.15);
        }

        .items-scroll {
          flex: 1;
          overflow-y: auto;
          padding-right: 4px;
        }
        .items-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 16px;
        }

        .item-card {
          background: var(--card);
          border: 1px solid var(--hairline);
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
        }
        .item-card:hover {
          background: var(--card-hover);
          border-color: var(--brass-dim);
          transform: translateY(-3px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        }
        .item-card:active { transform: translateY(0) scale(0.98); }

        .item-img-wrap {
          width: 100%;
          height: 110px;
          background: var(--panel-2);
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .item-img-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s ease;
        }
        .item-card:hover .item-img-wrap img {
          transform: scale(1.05);
        }
        .item-placeholder-icon {
          color: var(--muted-2);
          opacity: 0.6;
        }

        .variant-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          background: var(--bg-deep);
          border: 1px solid var(--hairline);
          color: var(--brass-soft);
          font-size: 9.5px;
          font-weight: 600;
          padding: 3px 7px;
          border-radius: 6px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          backdrop-filter: blur(4px);
        }

        .item-content {
          padding: 14px;
          display: flex;
          flex-direction: column;
          flex: 1;
          justify-content: space-between;
        }
        .item-name {
          font-family: 'Fraunces', serif;
          font-weight: 500;
          font-size: 15px;
          color: var(--text-heading);
          line-height: 1.3;
        }
        .item-desc {
          font-size: 11px;
          color: var(--muted);
          margin-top: 5px;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .item-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 14px;
          padding-top: 10px;
          border-top: 1px dashed var(--hairline);
        }
        .item-price {
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 600;
          font-size: 14px;
          color: var(--brass-soft);
        }
        .item-price .from {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--muted-2);
          margin-right: 4px;
        }
        .item-add {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: var(--panel-2);
          border: 1px solid var(--hairline);
          color: var(--muted);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .item-card:hover .item-add {
          background: var(--brass);
          border-color: var(--brass);
          color: #201a0c;
        }

        .cat-state-msg {
          font-size: 12px;
          color: var(--muted-2);
          padding: 10px;
          text-align: center;
        }
        .items-state-msg {
          font-size: 14px;
          color: var(--muted-2);
          text-align: center;
          padding: 60px 0;
          font-family: 'Fraunces', serif;
          font-style: italic;
        }

        /* ---------- TICKET / BASKET ---------- */
        .ticket-col {
          background: var(--bg-deep);
          border-left: 1px solid var(--hairline);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: background 0.25s ease, border-color 0.25s ease;
          box-shadow: -4px 0 15px rgba(0,0,0,0.05);
        }
        .ticket-head {
          padding: 22px 22px 18px;
          border-bottom: 1px dashed var(--hairline);
          flex-shrink: 0;
        }
        .ticket-head-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        .ticket-head-top h2 {
          font-family: 'Fraunces', serif;
          font-style: italic;
          font-size: 16.5px;
          font-weight: 500;
          color: var(--text-heading);
          margin: 0;
          line-height: 1.35;
        }
        .ticket-head-top h2.order-label-editable {
          cursor: pointer;
          transition: color 0.15s ease;
        }
        .ticket-head-top h2.order-label-editable:hover {
          color: var(--brass-soft);
          text-decoration: underline;
          text-decoration-style: dotted;
          text-underline-offset: 3px;
        }
        .ticket-meta {
          font-size: 11.5px;
          color: var(--muted-2);
          display: flex;
          gap: 10px;
        }

        .ticket-body {
          flex: 1;
          overflow-y: auto;
          padding: 10px 22px;
        }
        .ticket-empty {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: var(--muted-2);
        }
        .ticket-empty span { font-size: 13px; font-family: 'Fraunces', serif; font-style: italic; }

        .ticket-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 14px 0;
          border-bottom: 1px dotted var(--hairline);
          transition: background 0.15s ease;
        }
        .ticket-line:last-child { border-bottom: none; }
        .ticket-line-details { flex: 1; min-width: 0; }
        .ticket-line-name {
          font-family: 'Fraunces', serif;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 4px;
        }
        .ticket-line-name .size-tag {
          font-family: 'Inter', sans-serif;
          font-size: 9.5px;
          font-weight: 700;
          color: var(--brass);
          background: var(--panel);
          border: 1px solid var(--hairline);
          padding: 1px 6px;
          border-radius: 4px;
          text-transform: uppercase;
        }
        .ticket-line-name .mod-tag {
          color: var(--muted);
          font-weight: 600;
        }
        .ticket-line-price {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          color: var(--brass-soft);
          margin-top: 4px;
        }
        .ticket-line-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .qty-stepper {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--panel);
          border: 1px solid var(--hairline);
          border-radius: 8px;
          padding: 4px;
          flex-shrink: 0;
        }
        .qty-stepper button {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .qty-stepper button:hover { background: var(--card-hover); color: var(--text-heading); }
        .qty-value {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-heading);
          width: 20px;
          text-align: center;
          background: transparent;
          border: none;
          cursor: pointer;
          border-radius: 4px;
          padding: 2px 0;
          transition: background 0.15s ease;
        }
        .qty-value:hover { background: var(--card-hover); }
        .comp-strike {
          text-decoration: line-through;
          color: var(--muted-2);
          margin-right: 6px;
        }
        .comp-free {
          color: var(--brass);
          font-weight: 700;
          text-transform: uppercase;
          font-size: 10px;
        }
        .size-tag.comp-badge {
          color: var(--brass);
          border-color: var(--brass-dim);
        }
        .btn-modifier-line {
          position: relative;
          border: none;
          background: transparent;
          color: var(--muted-2);
          cursor: pointer;
          padding: 5px;
          border-radius: 6px;
          transition: color 0.15s ease, background 0.15s ease;
        }
        .btn-modifier-line:hover { color: var(--brass); background: var(--panel-2); }
        .btn-modifier-line.has-mods { color: var(--brass); }
        .btn-modifier-line .mod-count {
          position: absolute;
          top: -3px;
          right: -3px;
          background: var(--brass);
          color: #201a0c;
          font-size: 8px;
          font-weight: 700;
          min-width: 13px;
          height: 13px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 2px;
          line-height: 1;
        }
        .btn-remove-line {
          border: none;
          background: transparent;
          color: var(--muted-2);
          cursor: pointer;
          padding: 5px;
          border-radius: 6px;
          transition: color 0.15s ease, background 0.15s ease;
        }
        .btn-remove-line:hover { color: var(--rust); background: var(--panel-2); }

        .tear {
          position: relative;
          height: 14px;
          flex-shrink: 0;
          background:
            radial-gradient(circle at 8px 0, transparent 6px, var(--bg-deep) 6.5px) repeat-x;
          background-size: 16px 16px;
          transition: background 0.25s ease;
        }
        .tear::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          border-top: 1px dashed var(--hairline);
        }

        .ticket-summary {
          padding: 18px 22px 22px;
          flex-shrink: 0;
          background: var(--panel);
          border-top: 1px solid var(--hairline);
        }
        .sum-row {
          display: flex;
          justify-content: space-between;
          font-size: 12.5px;
          color: var(--muted);
          padding: 4px 0;
        }
        .sum-row .mono { color: var(--text-primary); }
        .sum-total {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-top: 10px;
          padding-top: 14px;
          border-top: 1px dashed var(--hairline);
        }
        .sum-total-label {
          font-family: 'Fraunces', serif;
          font-style: italic;
          font-size: 15px;
          color: var(--text-heading);
        }
        .sum-total-value {
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 600;
          font-size: 22px;
          color: var(--brass-soft);
        }

        .delivery-row {
          align-items: center;
        }
        .delivery-fee-input-wrap {
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--panel-2);
          border: 1px solid var(--hairline);
          border-radius: 7px;
          padding: 3px 8px;
        }
        .delivery-fee-input-wrap .dfee-currency {
          font-size: 11px;
          color: var(--muted-2);
        }
        .delivery-fee-input-wrap input {
          width: 56px;
          background: transparent;
          border: none;
          outline: none;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          color: var(--text-primary);
          text-align: right;
        }
        .delivery-fee-input-wrap:focus-within {
          border-color: var(--brass-dim);
        }

        .quick-actions-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-top: 18px;
        }
        .btn-icon-action {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 10px 4px;
          border-radius: 99px;
          border: 1px solid var(--hairline);
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 10px;
          font-weight: 600;
        }
        .btn-icon-action:hover {
          background: var(--panel-2);
          color: var(--text-heading);
          border-color: var(--brass-dim);
        }
        .btn-icon-action.clear { color: var(--rust); border-color: rgba(177,87,58,0.35); }
        .btn-icon-action.clear:hover { background: rgba(177,87,58,0.12); }

        .btn-pay {
          width: 100%;
          margin-top: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 15px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, var(--brass-soft), var(--brass-dim));
          color: #201a0c;
          font-weight: 700;
          font-size: 13.5px;
          letter-spacing: 0.02em;
          cursor: pointer;
          box-shadow: 0 6px 20px rgba(201,162,75,0.25);
          transition: all 0.2s ease;
        }
        .btn-pay:hover:not(:disabled) {
          box-shadow: 0 8px 25px rgba(201,162,75,0.38);
          transform: translateY(-1px);
        }
        .btn-pay:active:not(:disabled) { transform: translateY(0) scale(0.98); }
        .btn-pay:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

        /* ---------- MODALS ---------- */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: var(--overlay);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          backdrop-filter: blur(4px);
        }
        .modal-card {
          width: 360px;
          max-width: 90%;
          background: var(--panel);
          border: 1px solid var(--hairline);
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.4);
          animation: modalIn 0.2s ease-out;
        }
        @keyframes kb-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .modal-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        .modal-head h3 {
          font-family: 'Fraunces', serif;
          font-style: italic;
          font-size: 19px;
          font-weight: 500;
          color: var(--text-heading);
          margin: 0;
        }
        .modal-close {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: 1px solid var(--hairline);
          background: var(--panel-2);
          color: var(--muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.15s ease;
        }
        .modal-close:hover { background: var(--card-hover); color: var(--text-heading); }
        .modal-sub {
          font-size: 12px;
          color: var(--muted-2);
          margin-bottom: 20px;
        }
        .variant-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .variant-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-radius: 10px;
          border: 1px solid var(--hairline);
          background: var(--card);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .variant-row:hover {
          border-color: var(--brass-dim);
          background: var(--card-hover);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .variant-row .size {
          font-family: 'Fraunces', serif;
          font-size: 14px;
          color: var(--text-heading);
        }
        .variant-row .price {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 14px;
          color: var(--brass-soft);
          font-weight: 600;
        }

        /* ---------- MODIFIER PICKER MODAL ---------- */
        .modifier-modal-body {
          max-height: 380px;
          overflow-y: auto;
          margin: 0 -4px;
          padding: 0 4px;
        }
        .modifier-group-block { margin-bottom: 18px; }
        .modifier-group-block:last-child { margin-bottom: 0; }
        .modifier-group-title {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .modifier-group-title h4 {
          font-family: 'Fraunces', serif;
          font-size: 13.5px;
          font-weight: 600;
          color: var(--text-heading);
          margin: 0;
        }
        .modifier-group-rule {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--muted-2);
        }
        .modifier-option-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 9px;
          border: 1px solid var(--hairline);
          background: var(--card);
          cursor: pointer;
          transition: all 0.15s ease;
          margin-bottom: 6px;
        }
        .modifier-option-row:last-child { margin-bottom: 0; }
        .modifier-option-row:hover { border-color: var(--brass-dim); }
        .modifier-option-row.selected {
          border-color: var(--brass);
          background: var(--card-hover);
        }
        .modifier-option-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .modifier-check {
          width: 17px;
          height: 17px;
          border-radius: 5px;
          border: 1.5px solid var(--hairline);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #201a0c;
          transition: all 0.15s ease;
        }
        .modifier-option-row.selected .modifier-check {
          background: var(--brass);
          border-color: var(--brass);
        }
        .modifier-option-name {
          font-size: 13px;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .modifier-option-price {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          color: var(--brass-soft);
          flex-shrink: 0;
          margin-left: 10px;
        }
        .modifier-empty-msg {
          font-size: 12.5px;
          color: var(--muted-2);
          font-style: italic;
          text-align: center;
          padding: 24px 0;
        }
        .modifier-modal-footer {
          display: flex;
          gap: 10px;
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px dashed var(--hairline);
        }
        .btn-modifier-cancel {
          flex: 1;
          padding: 11px;
          border-radius: 9px;
          border: 1px solid var(--hairline);
          background: transparent;
          color: var(--muted);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-modifier-cancel:hover { background: var(--panel-2); color: var(--text-heading); }
        .btn-modifier-save {
          flex: 2;
          padding: 11px;
          border-radius: 9px;
          border: none;
          background: linear-gradient(135deg, var(--brass-soft), var(--brass-dim));
          color: #201a0c;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(201,162,75,0.25);
          transition: all 0.2s ease;
        }
        .btn-modifier-save:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(201,162,75,0.35);
        }

        /* ---------- QTY KEYPAD MODAL ---------- */
        .qty-modal { width: 300px; }
        .qty-display {
          text-align: center;
          font-size: 40px;
          font-weight: 700;
          color: var(--text-heading);
          margin: 6px 0 18px;
          letter-spacing: 0.02em;
        }
        .keypad-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .keypad-btn {
          padding: 16px 0;
          border-radius: 10px;
          border: 1px solid var(--hairline);
          background: var(--card);
          color: var(--text-primary);
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .keypad-btn:hover { background: var(--card-hover); border-color: var(--brass-dim); }
        .keypad-btn:active { transform: scale(0.95); }
        .keypad-clear { color: var(--rust); }
        .keypad-back { color: var(--muted); }
        .qty-confirm { width: 100%; margin-top: 16px; }

        .comp-qty-picker {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin: 4px 0 20px;
          padding: 10px;
          background: var(--panel-2);
          border-radius: 10px;
          border: 1px solid var(--hairline);
        }
        .comp-qty-btn {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: 1px solid var(--hairline);
          background: var(--card);
          color: var(--text-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .comp-qty-btn:hover { background: var(--card-hover); border-color: var(--brass-dim); }
        .comp-qty-value {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-heading);
          min-width: 80px;
          text-align: center;
        }

        /* ---------- PRINT PREVIEW RECEIPT ---------- */
        .receipt-modal { width: 340px; padding: 0; overflow: hidden; }
        .receipt-modal-head { padding: 20px 20px 0; }
        .receipt-paper {
          background: #fdfaf2;
          color: #241f14;
          font-family: 'IBM Plex Mono', monospace;
          padding: 18px 20px;
          font-size: 11.5px;
          line-height: 1.6;
          max-height: 360px;
          overflow-y: auto;
        }
        .receipt-center { text-align: center; }
        .receipt-title { font-size: 17px; margin-bottom: 2px; }
        .receipt-sub {
          font-size: 9.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #8a7d5c;
          margin-bottom: 12px;
        }
        .receipt-divider { border-top: 1px dashed #c9bd9a; margin: 10px 0; }
        .receipt-line { display: flex; justify-content: space-between; gap: 8px; }
        .receipt-line.indent { padding-left: 10px; font-size: 10.5px; color: #6b6047; }
        .receipt-line.comp { color: #a0672f; }
        .receipt-total-row {
          display: flex;
          justify-content: space-between;
          font-weight: 700;
          font-size: 13px;
          margin-top: 6px;
        }
        .receipt-footer-note {
          text-align: center;
          font-size: 9px;
          color: #8a7d5c;
          margin-top: 16px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .receipt-actions {
          display: flex;
          gap: 10px;
          padding: 16px 20px 20px;
          background: var(--panel);
        }

        /* ---------- CUSTOMER PICKER ---------- */
        .customer-modal { width: 400px; }
        .customer-search-wrap {
          position: relative;
          margin-bottom: 14px;
        }
        .customer-search-wrap svg {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--muted-2);
        }
        .customer-search-wrap input {
          width: 100%;
          background: var(--panel-2);
          border: 1px solid var(--hairline);
          border-radius: 9px;
          padding: 10px 12px 10px 36px;
          font-size: 13px;
          font-family: 'Inter', sans-serif;
          color: var(--text-primary);
        }
        .customer-search-wrap input:focus {
          outline: none;
          border-color: var(--brass-dim);
        }
        .customer-list {
          max-height: 220px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 14px;
        }
        .customer-row-phone { font-size: 11px; color: var(--muted-2); margin-top: 2px; }
        .btn-add-customer {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 11px;
          border-radius: 9px;
          border: 1px dashed var(--hairline);
          background: transparent;
          color: var(--brass);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-add-customer:hover { background: var(--panel-2); border-color: var(--brass-dim); }
        .new-customer-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .new-customer-form input {
          background: var(--panel-2);
          border: 1px solid var(--hairline);
          border-radius: 9px;
          padding: 10px 12px;
          font-size: 13px;
          font-family: 'Inter', sans-serif;
          color: var(--text-primary);
        }
        .new-customer-form input:focus {
          outline: none;
          border-color: var(--brass-dim);
        }
        .btn-modifier-save:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--hairline); border-radius: 6px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--brass-dim); }



        /* ---------- CUSTOMER PICKER - UPDATED ---------- */
.customer-modal { 
  width: 440px; 
  max-height: 90vh;
}

.customer-search-wrap {
  position: relative;
  margin-bottom: 14px;
}

.customer-search-wrap svg {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted-2);
}

.customer-search-wrap input {
  width: 100%;
  background: var(--panel-2);
  border: 1px solid var(--hairline);
  border-radius: 9px;
  padding: 10px 12px 10px 36px;
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  color: var(--text-primary);
}

.customer-search-wrap input:focus {
  outline: none;
  border-color: var(--brass-dim);
}

/* Customer List - More Height */
.customer-list {
  max-height: 420px; /* ← Increased from 220px */
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
  padding-right: 4px;
}

/* Customer Row Styles */
.customer-row {
  padding: 14px 16px !important;
  min-height: 60px;
}

.customer-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.customer-name {
  font-family: 'Fraunces', serif;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-heading);
}

.customer-details {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.customer-detail-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--muted-2);
  background: var(--panel-2);
  padding: 2px 10px 2px 6px;
  border-radius: 12px;
  border: 1px solid var(--hairline);
}

.customer-detail-item svg {
  flex-shrink: 0;
  color: var(--brass-soft);
}

/* Note - Always on New Line */
.customer-note {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--brass-soft);
  background: var(--panel-2);
  padding: 4px 12px;
  border-radius: 8px;
  border: 1px dashed var(--hairline);
  width: 100%;
  margin-top: 2px;
}

.customer-note svg {
  flex-shrink: 0;
  color: var(--brass-soft);
}

.customer-row-phone { 
  font-size: 11px; 
  color: var(--muted-2); 
  margin-top: 2px; 
}

.btn-add-customer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px;
  border-radius: 9px;
  border: 1px dashed var(--hairline);
  background: transparent;
  color: var(--brass);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-add-customer:hover { 
  background: var(--panel-2); 
  border-color: var(--brass-dim); 
}

.new-customer-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.new-customer-form input {
  background: var(--panel-2);
  border: 1px solid var(--hairline);
  border-radius: 9px;
  padding: 10px 12px;
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  color: var(--text-primary);
}

.new-customer-form input:focus {
  outline: none;
  border-color: var(--brass-dim);
}

.btn-modifier-save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* ---------- CUSTOMER PICKER ---------- */
.customer-modal { 
  width: 480px; 
  max-height: 90vh;
}

.customer-search-wrap {
  position: relative;
  margin-bottom: 16px;
}

.customer-search-wrap svg {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted-2);
}

.customer-search-wrap input {
  width: 100%;
  background: var(--panel-2);
  border: 1px solid var(--hairline);
  border-radius: 9px;
  padding: 10px 12px 10px 36px;
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  color: var(--text-primary);
}

.customer-search-wrap input:focus {
  outline: none;
  border-color: var(--brass-dim);
}

/* Customer List */
.customer-list {
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
  padding-right: 4px;
}

/* Customer Card - Each customer in a nice box */
.customer-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 18px;
  border-radius: 12px;
  border: 1.5px solid var(--hairline);
  background: var(--card);
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.customer-card:hover {
  border-color: var(--brass-dim);
  background: var(--card-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.12);
}

.customer-card:active {
  transform: scale(0.98);
}

/* Card Header - Name + Note Badge */
.customer-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.customer-name {
  font-family: 'Fraunces', serif;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-heading);
}

.customer-note-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--brass-soft);
  background: var(--panel-2);
  padding: 2px 10px 2px 6px;
  border-radius: 12px;
  border: 1px solid var(--hairline);
  flex-shrink: 0;
}

.customer-note-badge svg {
  color: var(--brass-soft);
}

/* Customer Details - Row with icons */
.customer-details {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.customer-detail-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-primary);
  background: var(--panel-2);
  padding: 4px 14px 4px 10px;
  border-radius: 16px;
  border: 1px solid var(--hairline);
  transition: all 0.15s ease;
}

.customer-detail-item:hover {
  border-color: var(--brass-dim);
}

.customer-detail-item svg {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--brass-soft);
}

/* Customer Note - Full width, on new line */
.customer-note {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--brass-soft);
  background: var(--panel-2);
  padding: 6px 14px;
  border-radius: 8px;
  border-left: 3px solid var(--brass);
  width: 100%;
  margin-top: 2px;
}

.customer-note svg {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--brass-soft);
}

/* Add Customer Button */
.btn-add-customer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  border: 2px dashed var(--hairline);
  background: transparent;
  color: var(--brass);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-add-customer:hover { 
  background: var(--panel-2); 
  border-color: var(--brass-dim);
  transform: translateY(-1px);
}

/* New Customer Form */
.new-customer-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.new-customer-form input {
  background: var(--panel-2);
  border: 1px solid var(--hairline);
  border-radius: 9px;
  padding: 10px 12px;
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  color: var(--text-primary);
}

.new-customer-form input:focus {
  outline: none;
  border-color: var(--brass-dim);
}

.btn-modifier-save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Scrollbar */
.customer-list::-webkit-scrollbar {
  width: 5px;
}

.customer-list::-webkit-scrollbar-track {
  background: transparent;
}

.customer-list::-webkit-scrollbar-thumb {
  background: var(--hairline);
  border-radius: 10px;
}

.customer-list::-webkit-scrollbar-thumb:hover {
  background: var(--brass-dim);
}


      `}</style>

      {/* HEADER */}
      <header className="pos-header">
        <div className="brand">
          <div className="brand-mark serif">FL</div>
          <div className="brand-text">
            <h1>Fen &amp; Larder</h1>
            <p>Front of House Terminal</p>
          </div>
        </div>
        <div className="header-right">
          <div className="order-switch">
            {(['Dine-In', 'Takeaway', 'Delivery'] as const).map((type) => (
              <button
                key={type}
                className={orderType === type ? 'active' : ''}
                onClick={() => handleOrderTypeChange(type)}
              >
                {type}
              </button>
            ))}
          </div>
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
            title={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <div className="pos-body">
        {/* CATEGORY RAIL */}
        <aside className="cat-rail">
          <span className="cat-label">Categories</span>

          {isLoadingCategories && <div className="cat-state-msg">Loading categories…</div>}
          {error && <div className="cat-state-msg" style={{ color: 'var(--rust)' }}>{error}</div>}

          {!isLoadingCategories && !error && categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCat === cat.id;
            return (
              <button
                key={cat.id}
                className={`cat-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveCat(cat.id)}
              >
                <span className="cat-no mono">{cat.no}</span>
                <span className="cat-icon-wrap">
                  <Icon
                    className="w-4 h-4"
                    color={isActive ? iconColor : undefined}
                    style={!isActive ? { color: inactiveIconColor } : undefined}
                  />
                </span>
                <span className="label" title={cat.label}>{cat.label}</span>
              </button>
            );
          })}
        </aside>

        {/* MENU */}
        <main className="menu-col">
          <div className="menu-heading">
            <h2>{activeCategory?.label || 'All Items'}</h2>
            <span className="mono">{String(filteredItems.length).padStart(2, '0')} items available</span>
          </div>

          <div className="search-wrap">
            <Search className="w-4 h-4" />
            <input
              type="text"
              placeholder="Search items by name or keywords…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="items-scroll">
            {isLoadingItems ? (
              <div className="items-state-msg">Loading the menu…</div>
            ) : filteredItems.length === 0 ? (
              <div className="items-state-msg">No items found matching your search</div>
            ) : (
              <div className="items-grid">
                {filteredItems.map((item) => (
                  <div key={item.id} className="item-card" onClick={() => handleItemClick(item)}>
                    <div className="item-img-wrap">
                      {item.image ? (
                        <img src={item.image} alt={item.name} loading="lazy" />
                      ) : (
                        <Sparkles className="w-6 h-6 item-placeholder-icon" />
                      )}
                      {item.hasVariants && <span className="variant-badge">Options</span>}
                    </div>
                    <div className="item-content">
                      <div>
                        <div className="item-name">{item.name}</div>
                        {item.description && <div className="item-desc">{item.description}</div>}
                      </div>
                      <div className="item-footer">
                        <span className="item-price">
                          {item.hasVariants && <span className="from">From</span>}
                          ${item.price.toFixed(2)}
                        </span>
                        <span className="item-add">
                          <Plus className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* TICKET */}
        <aside className="ticket-col" style={{ position: 'relative' }}>
          {isLoadingOrder && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 20,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                background: theme === 'dark' ? 'rgba(18,19,22,0.88)' : 'rgba(255,255,255,0.9)',
                backdropFilter: 'blur(2px)',
                borderRadius: 12,
              }}
            >
              <Loader2 className="w-6 h-6" style={{ animation: 'kb-spin 0.8s linear infinite' }} />
              <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.85 }}>
                Loading ticket #{activeOrder?.ticketNo ?? ''}…
              </span>
            </div>
          )}
          <div className="ticket-head">
            <div className="ticket-head-top">
              <h2
                className={orderType !== 'Takeaway' ? 'order-label-editable' : ''}
                onClick={() => {
                  if (orderType === 'Dine-In') setShowTablePicker(true);
                  if (orderType === 'Delivery') setShowCustomerPicker(true);
                }}
                title={orderType !== 'Takeaway' ? 'Tap to change' : undefined}
              >
                {orderLabel}
              </h2>
            </div>
            <div className="ticket-meta">
              <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
            </div>
          </div>

          <div className="ticket-body">
            {basket.length === 0 ? (
              <div className="ticket-empty">
                <ShoppingBag className="w-8 h-8" strokeWidth={1.25} />
                <span>Ticket is empty — select items from menu</span>
              </div>
            ) : (
              basket.map((b) => {
                const hasLinkedGroups = (b.item.modifierGroupIds || []).length > 0;
                const lineTotal = lineUnitPrice(b) * b.quantity;
                const fullPriceTotal = (b.item.price + modifiersTotal(b)) * b.quantity;
                return (
                  <div key={b.cartItemId} className="ticket-line">
                    <div className="ticket-line-details">
                      <div className="ticket-line-name">
                        {b.item.name}
                        {b.variantSize && <span className="size-tag">{b.variantSize}</span>}
                        {(b.modifiers || []).map((m) => (
                          <span key={`${m.groupId}-${m.optionId}`} className="size-tag mod-tag">
                            {m.optionName}
                          </span>
                        ))}
                        {b.comp && (
                          <span className="size-tag comp-badge">🎁 {b.comp.reason}</span>
                        )}
                      </div>
                      <div className="ticket-line-price mono">
                        {b.comp ? (
                          <>
                            <span className="comp-strike">${fullPriceTotal.toFixed(2)}</span>
                            <span className="comp-free">Comp</span>
                          </>
                        ) : (
                          `$${lineTotal.toFixed(2)}`
                        )}
                      </div>
                    </div>

                    <div className="ticket-line-actions">
                      <div className="qty-stepper">
                        <button onClick={() => updateQuantity(b.cartItemId, -1)}>
                          <Minus className="w-3 h-3" />
                        </button>
                        <button className="qty-value" onClick={() => openQtyEditor(b)} title="Type exact quantity">
                          {b.quantity}
                        </button>
                        <button onClick={() => updateQuantity(b.cartItemId, 1)}>
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        className={`btn-modifier-line ${b.comp ? 'has-mods' : ''}`}
                        onClick={() => toggleComp(b)}
                        title={b.comp ? 'Remove comp' : 'Comp this item'}
                      >
                        <Gift className="w-3.5 h-3.5" />
                      </button>

                      {hasLinkedGroups && (
                        <button
                          className={`btn-modifier-line ${b.modifiers.length > 0 ? 'has-mods' : ''}`}
                          onClick={() => openModifierPicker(b)}
                          title="Link modifiers"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          {b.modifiers.length > 0 && (
                            <span className="mod-count">{b.modifiers.length}</span>
                          )}
                        </button>
                      )}

                      <button
                        className="btn-remove-line"
                        onClick={() => removeItem(b.cartItemId)}
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="tear" />

          <div className="ticket-summary">
            <div className="sum-row">
              <span>Subtotal</span>
              <span className="mono">${subtotal.toFixed(2)}</span>
            </div>
            {orderType === 'Delivery' && (
              <div className="sum-row delivery-row">
                <span>Delivery Fee</span>
                <div className="delivery-fee-input-wrap">
                  <span className="dfee-currency mono">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="sum-row">
              <span>Tax (10%)</span>
              <span className="mono">${tax.toFixed(2)}</span>
            </div>
            <div className="sum-total">
              <span className="sum-total-label">Total due</span>
              <span className="sum-total-value">${total.toFixed(2)}</span>
            </div>

            <div className="quick-actions-row">
              <button className="btn-icon-action" onClick={() => setShowPrintPreview(true)} title="Print a copy for the customer">
                <Printer className="w-4 h-4" />
                <span>Print</span>
              </button>
              <button className="btn-icon-action" onClick={handleOpenDrawer} title="Open cash drawer">
                <Archive className="w-4 h-4" />
                <span>Drawer</span>
              </button>
              <button className="btn-icon-action clear" onClick={() => setBasket([])} title="Clear ticket">
                <RotateCcw className="w-4 h-4" />
                <span>Clear</span>
              </button>
              <button className="btn-icon-action" disabled={basket.length === 0 || isSaving} onClick={() => handleSaveOrder(false)}>
  <Receipt className="w-4 h-4" />
  {isSaving ? 'Processing...' : 'Hold'}
</button>
            </div>

           <button className="btn-pay" disabled={basket.length === 0 || isSaving} onClick={() => handleSaveOrder(true)}>
  <CreditCard className="w-4 h-4" />
  {isSaving ? 'Processing...' : `Take Payment · $${total.toFixed(2)}`}
</button>
          </div>
        </aside>
      </div>

      {/* VARIANT SIZE PICKER */}
      {variantModalItem && (
        <div className="modal-overlay" onClick={() => setVariantModalItem(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{variantModalItem.menuName}</h3>
              <button className="modal-close" onClick={() => setVariantModalItem(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="modal-sub">Choose a size for {orderType.toLowerCase()}</p>
            <div className="variant-list">
              {variantModalItem.variantPrices.map((v) => {
                const price = resolveVariantPrice(v, orderType);
                const displayItem: Item = {
                  id: variantModalItem.id,
                  catId: variantModalItem.categoryId,
                  name: variantModalItem.menuName,
                  description: variantModalItem.description ?? undefined,
                  hasVariants: true,
                  variantPrices: variantModalItem.variantPrices,
                  modifierGroupIds: variantModalItem.modifierGroupIds || [],
                  price,
                };
                return (
                  <div
                    key={v.size}
                    className="variant-row"
                    onClick={() => addToBasket(displayItem, v)}
                  >
                    <span className="size">{v.size}</span>
                    <span className="price mono">${price.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODIFIER LINK PICKER */}
      {modifierPickerFor && (
        <div className="modal-overlay" onClick={() => setModifierPickerFor(null)}>
          <div className="modal-card" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{modifierPickerFor.item.name}</h3>
              <button className="modal-close" onClick={() => setModifierPickerFor(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="modal-sub">Link modifiers to this line</p>

            <div className="modifier-modal-body">
              {getGroupsForItem(modifierPickerFor.item).length === 0 ? (
                <div className="modifier-empty-msg">
                  No modifier groups are linked to this item in the menu.
                </div>
              ) : (
                getGroupsForItem(modifierPickerFor.item).map((group) => {
                  const selectedInGroup = pendingModifierSelection.filter(
                    (m) => m.groupId === group.id
                  );
                  return (
                    <div key={group.id} className="modifier-group-block">
                      <div className="modifier-group-title">
                        <h4>{group.name}</h4>
                        <span className="modifier-group-rule">
                          {group.maxSelection === 1 ? 'Choose 1' : `Up to ${group.maxSelection}`}
                          {group.isRequired ? ' · Required' : ''}
                        </span>
                      </div>
                      {group.options.map((opt) => {
                        const isSelected = selectedInGroup.some((m) => m.optionId === opt.id);
                        const price = parseModPrice(opt.price ?? opt.priceAdjustment);
                        return (
                          <div
                            key={opt.id}
                            className={`modifier-option-row ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleModifierOption(group, opt)}
                          >
                            <div className="modifier-option-left">
                              <span className="modifier-check">
                                {isSelected && <Check className="w-3 h-3" strokeWidth={3} />}
                              </span>
                              <span className="modifier-option-name">{opt.name}</span>
                            </div>
                            <span className="modifier-option-price">
                              {price > 0 ? `+$${price.toFixed(2)}` : 'Free'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            <div className="modifier-modal-footer">
              <button className="btn-modifier-cancel" onClick={() => setModifierPickerFor(null)}>
                Cancel
              </button>
              <button className="btn-modifier-save" onClick={confirmModifierSelection}>
                Save Modifiers
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUANTITY KEYPAD */}
      {qtyEditorId && (
        <div className="modal-overlay" onClick={() => setQtyEditorId(null)}>
          <div className="modal-card qty-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Set Quantity</h3>
              <button className="modal-close" onClick={() => setQtyEditorId(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="qty-display mono">{qtyEditorValue || '0'}</div>
            <div className="keypad-grid">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} className="keypad-btn" onClick={() => pressDigit(d)}>
                  {d}
                </button>
              ))}
              <button className="keypad-btn keypad-clear" onClick={pressClearQty}>C</button>
              <button className="keypad-btn" onClick={() => pressDigit('0')}>0</button>
              <button className="keypad-btn keypad-back" onClick={pressBackspace}>⌫</button>
            </div>
            <button className="btn-modifier-save qty-confirm" onClick={confirmQtyEditor}>
              Set Quantity
            </button>
          </div>
        </div>
      )}

      {/* COMP / GIFT REASON PICKER */}
      {compTargetId && compTargetItem && (
        <div className="modal-overlay" onClick={() => setCompTargetId(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Comp {compTargetItem.item.name}</h3>
              <button className="modal-close" onClick={() => setCompTargetId(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {compTargetItem.quantity > 1 ? (
              <>
                <p className="modal-sub">How many of the {compTargetItem.quantity} do you want to comp?</p>
                <div className="comp-qty-picker">
                  <button className="comp-qty-btn" onClick={decCompQty}>
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="comp-qty-value mono">{compQty} of {compTargetItem.quantity}</span>
                  <button className="comp-qty-btn" onClick={incCompQty}>
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <p className="modal-sub">Pick a reason — kept on the ticket for the audit log</p>
            )}

            <div className="variant-list">
              {COMP_REASONS.map((reason) => (
                <div key={reason} className="variant-row" onClick={() => applyComp(reason)}>
                  <span className="size">{reason}</span>
                  <Gift className="w-4 h-4" style={{ color: 'var(--brass-soft)' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PRINT PREVIEW */}
      {showPrintPreview && (
        <div className="modal-overlay" onClick={() => setShowPrintPreview(false)}>
          <div className="modal-card receipt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head receipt-modal-head">
              <h3>Preview Copy</h3>
              <button className="modal-close" onClick={() => setShowPrintPreview(false)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="receipt-paper">
              <div className="receipt-center">
                <div className="receipt-title serif">Fen &amp; Larder</div>
                <div className="receipt-sub">Guest Copy · Not Final</div>
              </div>
              <div className="receipt-divider" />
              <div className="receipt-line"><span>Ticket</span><span>#{ticketNo}</span></div>
              <div className="receipt-line"><span>Type</span><span>{orderType}</span></div>
              <div className="receipt-divider" />

              {basket.length === 0 ? (
                <p className="modifier-empty-msg">Ticket is empty.</p>
              ) : (
                basket.map((b) => (
                  <div key={b.cartItemId}>
                    <div className="receipt-line">
                      <span>{b.quantity}&times; {b.item.name}{b.variantSize ? ` (${b.variantSize})` : ''}</span>
                      <span>{b.comp ? 'COMP' : `$${(lineUnitPrice(b) * b.quantity).toFixed(2)}`}</span>
                    </div>
                    {(b.modifiers || []).map((m) => (
                      <div key={`${m.groupId}-${m.optionId}`} className="receipt-line indent">
                        <span>+ {m.optionName}</span>
                        <span>{m.price > 0 ? `$${m.price.toFixed(2)}` : ''}</span>
                      </div>
                    ))}
                    {b.comp && (
                      <div className="receipt-line indent comp">
                        <span>Comp reason: {b.comp.reason}</span>
                        <span></span>
                      </div>
                    )}
                  </div>
                ))
              )}

              <div className="receipt-divider" />
              <div className="receipt-line"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
              {orderType === 'Delivery' && deliveryFeeNum > 0 && (
                <div className="receipt-line"><span>Delivery Fee</span><span>${deliveryFeeNum.toFixed(2)}</span></div>
              )}
              <div className="receipt-line"><span>Tax (10%)</span><span>${tax.toFixed(2)}</span></div>
              <div className="receipt-total-row"><span>Total</span><span>${total.toFixed(2)}</span></div>
              <div className="receipt-footer-note">This is a courtesy copy — payment not yet taken</div>
            </div>

            <div className="receipt-actions">
              <button className="btn-modifier-cancel" onClick={() => setShowPrintPreview(false)}>
                Close
              </button>
              <button className="btn-modifier-save" onClick={handlePrintCopy}>
                <Printer className="w-3.5 h-3.5" style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                Print Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TABLE PICKER (Dine-In) */}
      {showTablePicker && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[1000] p-4"
          onClick={() => setShowTablePicker(false)}
        >
          <div 
            className="bg-[#121316] border-2 border-zinc-700 rounded-2xl p-8 shadow-2xl w-[850px] max-w-[98vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-zinc-800">
              <div>
                <h2 className="m-0 text-2xl font-extrabold text-white tracking-wide">Select a Table</h2>
                <p className="text-base text-zinc-300 mt-1 font-medium">Tap any open table to seat this order</p>
              </div>
              <button 
                className="bg-zinc-800 border border-zinc-600 text-zinc-200 p-3 rounded-xl hover:text-white hover:bg-zinc-700 transition-colors"
                onClick={() => setShowTablePicker(false)}
                aria-label="Close modal"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* High-Visibility Legend */}
            <div className="flex gap-6 text-sm font-bold text-zinc-200 mb-6 bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-emerald-400/30" /> 
                <span className="text-emerald-400">Available</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-rose-500 ring-2 ring-rose-400/30" /> 
                <span className="text-rose-400">Occupied</span>
              </span>
            </div>

            {/* Grid of Large Cards */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4 max-h-[520px] overflow-y-auto pr-2">
              {tables.map((t) => {
                const isSelected = dineInTable?.id === t.id;
                const isOccupied = t.status === 'occupied';

                return (
                  <div
                    key={t.id}
                    onClick={() => selectTable(t)}
                    className={`
                      flex flex-col justify-between p-5 rounded-xl border-2 transition-all cursor-pointer min-h-[120px]
                      ${isOccupied 
                        ? 'bg-rose-950/30 border-rose-800/80 cursor-not-allowed opacity-80' 
                        : isSelected 
                          ? 'bg-amber-950/40 border-amber-500 shadow-lg shadow-amber-500/20 scale-[1.02]' 
                          : 'bg-zinc-900 border-zinc-700 hover:border-amber-400 hover:bg-zinc-800'
                      }
                    `}
                  >
                    <div className="flex justify-between items-start">
                      <span className={`text-2xl font-black ${isOccupied ? 'text-rose-400' : 'text-white'}`}>
                        T-{t.label}
                      </span>
                      {t.capacity && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {t.capacity} seats
                        </span>
                      )}
                    </div>
                    
                    <div className="mt-4 flex justify-between items-end text-xs font-medium">
                      <span className={isOccupied ? 'text-rose-300 font-bold' : 'text-emerald-400 font-bold'}>
                        {isOccupied ? 'Occupied' : 'Available'}
                      </span>
                      {isOccupied && t.occupiedOrderNo && (
                        <span className="text-zinc-400 font-mono">#{t.occupiedOrderNo}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      
{/* CUSTOMER PICKER (Delivery) */}
{showCustomerPicker && (
  <div className="modal-overlay" onClick={() => setShowCustomerPicker(false)}>
    <div className="modal-card customer-modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-head">
        <h3>Select Delivery Customer</h3>
        <button className="modal-close" onClick={() => setShowCustomerPicker(false)}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {!isAddingCustomer ? (
        <>
          <div className="customer-search-wrap">
            <Search className="w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name, phone, email, address..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
          </div>

          <div className="customer-list">
            {filteredCustomers.length === 0 ? (
              <div className="modifier-empty-msg">No matching customers found.</div>
            ) : (
              filteredCustomers.map((c) => (
                <div
                  key={c.id}
                  className="customer-card"
                  onClick={() => selectCustomer(c)}
                >
                  <div className="customer-card-header">
                    <div className="customer-name">{c.name}</div>
                    
                  </div>
                  <div className="customer-details">
                    {c.phone && (
                      <span className="customer-detail-item">
                        <Phone className="w-3.5 h-3.5" />
                        {c.phone}
                      </span>
                    )}
                    {c.email && (
                      <span className="customer-detail-item">
                        <Mail className="w-3.5 h-3.5" />
                        {c.email}
                      </span>
                    )}
                    {c.address && (
                      <span className="customer-detail-item">
                        <MapPin className="w-3.5 h-3.5" />
                        {c.address}
                      </span>
                    )}
                  </div>
                  {c.notes && (
                    <div className="customer-note">
                      <FileText className="w-3.5 h-3.5" />
                      {c.notes}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <button
            className="btn-add-customer"
            onClick={() => setIsAddingCustomer(true)}
          >
            <UserPlus className="w-4 h-4" />
            Add New Customer
          </button>
        </>
      ) : (
        <div className="new-customer-form">
          <input
            type="text"
            placeholder="Full Name *"
            value={newCustomerName}
            onChange={(e) => setNewCustomerName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Phone Number"
            value={newCustomerPhone}
            onChange={(e) => setNewCustomerPhone(e.target.value)}
          />
          <input
            type="email"
            placeholder="Email Address"
            value={newCustomerEmail}
            onChange={(e) => setNewCustomerEmail(e.target.value)}
          />
          <input
            type="text"
            placeholder="Delivery Address"
            value={newCustomerAddress}
            onChange={(e) => setNewCustomerAddress(e.target.value)}
          />
          <input
            type="text"
            placeholder="Notes (e.g. gate code)"
            value={newCustomerNotes}
            onChange={(e) => setNewCustomerNotes(e.target.value)}
          />

          <div className="modifier-modal-footer" style={{ marginTop: 10 }}>
            <button
              className="btn-modifier-cancel"
              onClick={() => setIsAddingCustomer(false)}
            >
              Back to Search
            </button>
            <button
              className="btn-modifier-save"
              disabled={!newCustomerName.trim()}
              onClick={handleCreateCustomer}
            >
              Save &amp; Select
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
)}
    </div>
  );
}