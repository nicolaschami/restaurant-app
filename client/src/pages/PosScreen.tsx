import React, { useState, useEffect, useMemo } from 'react';
import { useRef } from 'react';
import { api } from '../api';
import PaymentModal, { type PaymentMethod, type PaymentResult } from '../components/PaymentModal';
import OpeningCashPrompt from '../components/OpeningCashPrompt';
import { basketTotals, money, taxLabel } from '../lib/restaurantSettings';
import { autoPrintEnabled } from '../lib/printReceipt';
import { toast } from '../components/Toaster';
import { askConfirm } from '../components/ConfirmHost';

// Kitchen tickets (2026-10-26): the server prints them when an order is saved and
// tells us how it went. The order is saved anyway — a failed ticket only shows a
// toast so the cashier can tell the kitchen by voice.
function warnKitchen(results: { station: string; kind: string; ok: boolean; error?: string }[] | undefined) {
  const failed = (results || []).filter((r) => !r.ok);
  if (!failed.length) return;
  const stations = [...new Set(failed.map((r) => r.station))].join(', ');
  toast.error(`Kitchen ticket not printed (${stations})`, failed[0].error || 'Tell the kitchen.');
}
import ReceiptPreviewModal from '../components/ReceiptPreviewModal';
import SwitchUserModal from '../components/SwitchUserModal';
import { ROLE_LABEL, me, setMe } from '../lib/session';
import OnlineDot from '../components/OnlineDot';
import { ticketLabel } from '../lib/ticketLabel';
import {
  Coffee,
  Wine,
  Utensils,
  Pizza,
  Cake,
  Search,
  Plus,
  Minus,
  RotateCcw,
  ShoppingBag,
  Sun,
  Moon,
  UtensilsCrossed,
  X,
  Trash2,
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
  Loader2,
  AlertTriangle,
  LayoutGrid,
  Armchair,
  User,
  Pause, Eye, ChevronUp, ChevronLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface PosScreenProps {
  onLogout: () => void;
  // Minimal shape needed from the dashboard ticket — just enough to know which
  // order to fetch. Full line items/table/customer come from GET /orders/:id.
  activeOrder?: { orderId: number; ticketNo?: number } | null;
  onResetOrder?: () => void;
  onClose?: () => void; // 👈 Accept onClose
  onSwitchUser?: (token: string, user: any) => void; // "Switch user" with a PIN
  // Reservations (2026-10-31): "Seat" → a new dine-in order on the guest's table
  seatAt?: { reservationId: number; tableId: number; tableLabel: string; guestName: string; partySize: number } | null;
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
  countryTax?: string | null; // own tax rate in %; null = restaurant rate
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
  // the table's next booking (Reservations, 2026-10-31); reservedNow = from 15 min before
  booking?: { id: number; guestName: string; partySize: number; time: string; reservedNow: boolean; lateMinutes: number } | null;
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

// Category colors: `dot` for the category list, `dark` / `light` for dish cards
// without a photo, in each theme.
const CATEGORY_PALETTE = [
  { dot: '#d9895b', dark: '#4a3326', light: '#f6dccb' },
  { dot: '#8fb56d', dark: '#33402c', light: '#e2edd5' },
  { dot: '#d2b56a', dark: '#473b25', light: '#f4e8c7' },
  { dot: '#e3876f', dark: '#4a2c27', light: '#f7d9d1' },
  { dot: '#6fb8a6', dark: '#2a403a', light: '#d6ece6' },
  { dot: '#6f98c2', dark: '#2a3a47', light: '#d9e5f1' },
  { dot: '#9a8ad0', dark: '#342f46', light: '#e4dff4' },
  { dot: '#cf86aa', dark: '#462f40', light: '#f4dbe7' },
];

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

export default function PosScreen({ onClose, onLogout, activeOrder, onResetOrder, onSwitchUser, seatAt }: PosScreenProps) {
  // Who works on the POS now, and the "Switch user" PIN pad.
  const [cashierName, setCashierName] = useState(me?.name || '');
  const [showSwitchUser, setShowSwitchUser] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<number | null>(null);
  // Light/dark choice is remembered on this device (each terminal can differ).
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem('posTheme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('posTheme', theme);
    } catch {
      /* storage unavailable — theme just won't be remembered */
    }
  }, [theme]);

  // Header: restaurant name (saved by the login page) and a live clock.
  const restaurantName = localStorage.getItem('restaurantName') || 'My Restaurant';
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  useEffect(() => {
    const timer = setInterval(
      () => setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      15000
    );
    return () => clearInterval(timer);
  }, []);
  const [silentPrintText, setSilentPrintText] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  // Payment window (opened by the Pay button).
  const [showPayment, setShowPayment] = useState(false);
  // Phone layout (2026-10-26): the order slides up over the dishes (bottom bar → order).
  const [mobileOrderOpen, setMobileOrderOpen] = useState(false);

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
  // Receipt preview from the server (exactly as printed): which order, copy or paid.
  const [receiptPreview, setReceiptPreview] = useState<{ orderId: number; copy: boolean } | null>(null);
  const [lastPaidOrderId, setLastPaidOrderId] = useState<number | null>(null);
  const [deliveryFee, setDeliveryFee] = useState<string>('0.00');

  /* ---------- ORDER TYPE DETAIL: table (Dine-In) / customer (Delivery) ---------- */
  const [tables, setTables] = useState<RestaurantTable[]>([]);

  // Server rows → the POS table shape (used at start-up and by refreshTables).
  const toPosTables = (rows: any[]): RestaurantTable[] =>
    rows.map((t: any) => ({
      id: t.id,
      label: String(t.label ?? t.number ?? t.name ?? t.id),
      capacity: t.capacity,
      status: t.status === 'occupied' ? 'occupied' : 'free',
      occupiedOrderNo: t.occupiedOrderNo ?? t.orderNo,
      zone: t.zone,
      notes: t.notes,
      booking: t.booking ?? null,
    }));

  // Reload the real table status from the server (the server frees a table when its
  // order is paid or deleted, and takes it when an order is opened on it). Called after
  // a save, after a payment, and every time the table picker opens.
  const refreshTables = async () => {
    try {
      const res = await api.get('/tables');
      const rows = Array.isArray(res.data) ? res.data : res.data?.tables || [];
      if (rows.length) setTables(toPosTables(rows));
    } catch {
      /* keep the current list */
    }
  };
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
          api.get('/categories'),
          api
            .get('/menu-items', { params: { restaurant_id: 1, limit: 2000 } })
            .catch(() => ({ data: [] })),
          api
            .get('/modifier-groups')
            .catch(() => ({ data: [] })),
          api
            .get('/tables')
            .catch(() => ({ data: generateMockTables() })),
          api
            .get('/customers')
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
            booking: t.booking ?? null,
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
        setOrderNotes(order.notes || '');
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

  // Typing in search looks through the WHOLE menu; otherwise show the chosen category.
  const query = searchQuery.trim().toLowerCase();
  const filteredItems = displayItems.filter((i) =>
    query ? i.name.toLowerCase().includes(query) : activeCat === null || i.catId === activeCat
  );

  // Number of dishes per category (shown in the category list).
  const itemsPerCategory = useMemo(() => {
    const counts: Record<number, number> = {};
    displayItems.forEach((i) => (counts[i.catId] = (counts[i.catId] || 0) + 1));
    return counts;
  }, [displayItems]);

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
    setSelectedLineId((cur) => (cur === cartItemId ? null : cur));
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

  // Opens the cash drawer through the print helper (Settings → Printers).
  const handleOpenDrawer = async () => {
    try {
      await api.post('/printing/drawer');
      toast.success('Drawer opened');
    } catch (err: any) {
      toast.error('Drawer not opened', err.response?.data?.error || 'Check the print helper.');
    }
  };

  const handleDeleteOrder = async () => {
    if (!currentOrderId) return;
    setIsDeleting(true);
    setError(null);
    try {
      const del = await api.delete(`/orders/${currentOrderId}`);
      warnKitchen(del.data?.kitchen);
      setBasket([]);
      setDineInTable(null);
      setDeliveryCustomer(null);
      setDeliveryFee('0.00');
      setCurrentOrderId(null);
      setShowDeleteConfirm(false);
      onClose?.(); // back to dashboard, same as a successful Hold/Pay
    } catch (err: any) {
      console.error('Failed to delete order:', err);
      setError(err.response?.data?.error || 'Failed to delete the order. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // "Preview": the current ticket exactly as it will print (saved first: the server
  // builds the receipt from the saved order).
  const handlePreviewReceipt = async () => {
    if (basket.length === 0) return;
    try {
      const saved = await persistOrder();
      setReceiptPreview({ orderId: saved.id, copy: true });
    } catch (err: any) {
      toast.error('No preview', err.response?.data?.error || err.message || 'The order could not be saved.');
    }
  };

  // "Print Copy": the customer's copy BEFORE payment, printed by the print helper
  // (directly on the receipt printer). The order is saved first: the receipt is
  // built by the server from the saved order.
  const handlePrintCopy = async () => {
    if (basket.length === 0) return;
    setIsPrinting(true);
    try {
      const saved = await persistOrder();
      await api.post('/printing/receipt', { orderId: saved.id, copy: true });
      toast.success('Copy printed');
    } catch (err: any) {
      toast.error('Copy not printed', err.response?.data?.error || err.message || 'Check the print helper.');
    } finally {
      setIsPrinting(false);
    }
  };

  const deliveryFeeNum = orderType === 'Delivery' ? parseFloat(deliveryFee) || 0 : 0;

  // Totals with the restaurant's tax settings (Settings → Restaurant Info), computed the
  // same way as the server, so the POS shows exactly what the customer will pay.
  const ownRate = (menuItemId: number) => {
    const raw = rawMenuItems.find((r) => r.id === menuItemId)?.countryTax;
    return raw === null || raw === undefined || raw === '' ? null : Number(raw);
  };
  const { subtotal, tax, total } = basketTotals(
    basket.map((b) => ({ amount: lineUnitPrice(b) * b.quantity, ownRate: ownRate(b.item.id) })),
    deliveryFeeNum
  );
  const itemCount = basket.reduce((a, b) => a + b.quantity, 0);

  // Phone layout: an empty order (new ticket, after paying) goes back to the dishes.
  useEffect(() => {
    if (basket.length === 0) setMobileOrderOpen(false);
  }, [basket.length]);

  /* ---------- SAVE ORDER ---------- */

  const savingRef = useRef(false);

  // Top-right "Dashboard" button: an empty ticket goes straight back; a ticket with
  // items is saved first as an OPEN order (like Hold — its table stays taken), then
  // back to the dashboard. Dine-In without a table / Delivery without a customer:
  // the picker opens first (an open order needs it).
  const handleBackToDashboard = async () => {
    if (basket.length === 0) {
      onClose?.();
      return;
    }
    if (savingRef.current || !readyToSave()) return;
    savingRef.current = true;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await persistOrder();
      toast.success(`Order ${ticketLabel(ticketNo)} saved`, 'It stays open on the dashboard.');
      finishTicket(saved.wasNew); // clears the screen and goes back to the dashboard
    } catch (err: any) {
      toast.error('Order not saved', err.response?.data?.error || err.response?.data?.message || 'Please try again.');
    } finally {
      setIsSaving(false);
      savingRef.current = false;
    }
  };

  const handleSaveOrder = async (isPayment: boolean) => {
    // Hard, synchronous guard — impossible to double-fire even on a fast double-click,
    // unlike isSaving (state), which can lag a render behind the actual click.
    if (savingRef.current) {
      console.log('[SAVE] blocked — already saving');
      return;
    }
    if (!readyToSave()) return;

    // Pay → open the payment window. The order is saved (and paid) only when the
    // cashier completes the payment there — see handleConfirmPayment.
    if (isPayment) {
      setShowPayment(true);
      return;
    }

    // Hold → save the order as open and go back to the dashboard.
    savingRef.current = true;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await persistOrder();
      finishTicket(saved.wasNew);
    } catch (err: any) {
      console.error('[SAVE] failed:', err);
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to save order. Please try again.');
    } finally {
      setIsSaving(false);
      savingRef.current = false;
    }
  };

  // Checks before saving: something in the basket, and a table (dine-in) or a
  // customer (delivery). Opens the right picker when one is missing.
  const readyToSave = (): boolean => {
    if (basket.length === 0) return false;
    if (orderType === 'Dine-In' && !dineInTable) {
      setShowTablePicker(true);
      return false;
    }
    if (orderType === 'Delivery' && !deliveryCustomer) {
      setShowCustomerPicker(true);
      return false;
    }
    return true;
  };

  // Clears the screen for the next order.
  //   - After Hold: goes back to the dashboard (same as before).
  //   - After a payment ("New order"): stays in the POS with a fresh, empty order.
  const finishTicket = (wasNew: boolean, stayInPos = false) => {
    setBasket([]);
    setDineInTable(null);
    setDeliveryCustomer(null);
    setDeliveryFee('0.00');
    setOrderNotes('');
    setSelectedLineId(null);
    if (wasNew) setTicketNo((prev) => prev + 1);
    setCurrentOrderId(null);
    if (stayInPos) {
      // The new order starts like a fresh POS: first category, empty search.
      setActiveCat(categories[0]?.id ?? null);
      setSearchQuery('');
      onResetOrder?.(); // forget the order that was opened from the dashboard, if any
    } else {
      onClose?.();
    }
  };

  // Payment window: 1) save the order as open (so nothing is lost if the payment
  // fails), 2) the server takes the payment and closes the order in one step,
  // 3) cash → open the drawer. Errors are thrown with a readable message, which
  // the window shows.
  const handleConfirmPayment = async (method: PaymentMethod, amountReceived: number): Promise<PaymentResult> => {
    if (savingRef.current) throw new Error('Already saving — please wait.');
    savingRef.current = true;
    setIsSaving(true);
    try {
      const saved = await persistOrder();
      const res = await api.post(`/orders/${saved.id}/pay`, { method, amountReceived });
      const payment = res.data?.payment || {};

      // Receipt through the print helper (directly on the receipt printer); for cash it
      // also opens the drawer. Not awaited: the cashier never waits for the printer —
      // a problem shows as a red notification.
      setLastPaidOrderId(saved.id);
      refreshTables(); // the paid order's table is free again
      if (autoPrintEnabled()) {
        const ticket = res.data?.order?.ticketNo ?? ticketNo;
        api
          .post('/printing/receipt', { orderId: saved.id })
          .then(() => toast.success('Receipt sent to the printer', `Ticket ${ticketLabel(ticket)}`))
          .catch((err) => toast.error('Receipt not printed', err.response?.data?.error || 'Check the print helper.'));
      } else if (method === 'CASH') {
        api
          .post('/printing/drawer')
          .catch((err) => toast.error('Drawer not opened', err.response?.data?.error || 'Check the print helper.'));
      }

      // The drawer opens with the receipt (above); a problem shows as a notification.
      const drawerFailed = false;

      return {
        method,
        amountDue: String(payment.amountDue ?? total.toFixed(2)),
        amountReceived: String(payment.amountReceived ?? amountReceived.toFixed(2)),
        changeGiven: String(payment.changeGiven ?? '0.00'),
        message: res.data?.message || 'Payment complete.',
        drawerFailed,
      };
    } catch (err: any) {
      throw new Error(err.response?.data?.error || err.response?.data?.message || err.message || 'The payment could not be saved.');
    } finally {
      setIsSaving(false);
      savingRef.current = false;
    }
  };

  // Saves the current ticket as an OPEN order (new → create, existing → update)
  // and returns its id. It does not clear the screen. Used by Hold and by Pay.
  const persistOrder = async (): Promise<{ id: number; wasNew: boolean }> => {
    {
      const orderPayload = {
        ticketNo,
        orderStatus: 'open',
        tableStatus: 'occupied',
        orderType,
        tableId: orderType === 'Dine-In' ? dineInTable?.id : null,
        tableLabel: orderType === 'Dine-In' ? dineInTable?.label : null,
        customerId: orderType === 'Delivery' ? deliveryCustomer?.id : null,
        customerName: orderType === 'Delivery' ? deliveryCustomer?.name : null,
        customerPhone: orderType === 'Delivery' ? deliveryCustomer?.phone : null,
        customerAddress: orderType === 'Delivery' ? deliveryCustomer?.address : null,
        // a guest seated from Reservations (only on the first save, on that table)
        reservationId:
          !currentOrderId && orderType === 'Dine-In' && seatAt && dineInTable?.id === seatAt.tableId ? seatReservationRef.current : null,
        deliveryFee: deliveryFeeNum,
        subtotal,
        tax,
        total,
        notes: orderNotes,
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

      const wasNew = !currentOrderId;
      let savedOrderId = currentOrderId;
      let res;
      if (currentOrderId) {
        res = await api.put(`/orders/${currentOrderId}`, orderPayload);
      } else {
        res = await api.post('/orders', orderPayload);
        savedOrderId = res.data?.order?.id ?? null;
        seatReservationRef.current = null; // the booking now knows its order
        // the number the order really got: the server's, or OFF-0007 from RES Local offline
        if (res.data?.order?.ticketNo) setTicketNo(res.data.order.ticketNo);
      }
      if (!savedOrderId) throw new Error('The order could not be saved.');
      warnKitchen(res.data?.kitchen);

      // Remember the id: if the payment then fails, trying again updates this
      // order instead of creating a second one.
      setCurrentOrderId(savedOrderId);

      await refreshTables();

      return { id: savedOrderId, wasNew };
    }
  };

  // The table picker always shows the real situation (also tables freed / taken
  // from another device).
  useEffect(() => {
    if (showTablePicker) refreshTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTablePicker]);

  /* ---------- ORDER TYPE SWITCHING ---------- */

  const handleOrderTypeChange = (type: OrderType) => {
    setOrderType(type);
    if (type === 'Dine-In') setShowTablePicker(true);
    if (type === 'Delivery') setShowCustomerPicker(true);
  };

  const selectTable = async (table: RestaurantTable) => {
    if (table.status === 'occupied') return;
    // Reservations: a table reserved for another guest (from 15 min before) — ask first
    const b = table.booking;
    if (b?.reservedNow && b.id !== seatReservationRef.current) {
      const ok = await askConfirm({
        title: 'Reserved table',
        message: `${table.label} is reserved for ${b.guestName} ×${b.partySize} at ${b.time}. Use it for this order anyway?`,
        confirmLabel: 'Use it',
        isDanger: false,
      });
      if (!ok) return;
    }
    setDineInTable(table);
    setShowTablePicker(false);
  };

  // Reservations (2026-10-31): "Seat" on the Reservations screen opens the POS here with
  // the guest's table already chosen (dine-in). The first save of the order tells the
  // server which booking it belongs to (reservationId), so the booking remembers it.
  const seatReservationRef = useRef<number | null>(null);
  const seatHandledRef = useRef<number | null>(null);
  useEffect(() => {
    if (!seatAt || activeOrder?.orderId || isLoadingItems) return;
    if (seatHandledRef.current === seatAt.reservationId) return;
    seatHandledRef.current = seatAt.reservationId;
    seatReservationRef.current = seatAt.reservationId;
    setOrderType('Dine-In');
    const t = tables.find((x) => x.id === seatAt.tableId);
    setDineInTable(t ?? { id: seatAt.tableId, label: seatAt.tableLabel, status: 'free' });
    toast.success(`${seatAt.guestName} ×${seatAt.partySize} · Table ${seatAt.tableLabel}`, 'Add the order.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatAt, isLoadingItems, tables]);

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


  // Header chip: which table (dine-in) or customer (delivery) this order is for.
  const contextLabel =
    orderType === 'Dine-In'
      ? dineInTable
        ? `Table ${dineInTable.label}`
        : 'Choose a table'
      : deliveryCustomer
        ? deliveryCustomer.name
        : 'Choose a customer';

  // How many of each dish are already in the order (badge on the dish card).
  const qtyInTicket: Record<number, number> = {};
  basket.forEach((b) => (qtyInTicket[b.item.id] = (qtyInTicket[b.item.id] || 0) + b.quantity));

  // Each category gets a color: a dot in the category list, and the background of
  // its dishes that have no photo yet. Picked by the category's position in the list.
  const paletteForCategory = (catId: number) => {
    const index = Math.max(0, categories.findIndex((c) => c.id === catId));
    return CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
  };

  return (
    <div className={`pos-root ${mobileOrderOpen ? 'm-order-open' : ''}`} data-theme={theme}>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

        /* =====================================================================
           POS LAYOUT — redesign 2026-10 (design proposal "POS Screen Redesign")
           Order/invoice LEFT · dishes MIDDLE · categories RIGHT, left-to-right.
           Token names are unchanged so the modals below keep working.
           ===================================================================== */
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
          background: var(--bg);
          color: var(--text-primary);
        }

        /* ---------- DARK TOKENS (lifted a few shades, brighter small text) ---------- */
        .pos-root[data-theme='dark'] {
          --bg: #1a2520;
          --bg-deep: #131c18;
          --panel: #22302a;
          --panel-2: #2b3b33;
          --card: #2b3b33;
          --card-hover: #34473d;
          --hairline: #3f5247;
          --brass: #c9a24b;
          --brass-soft: #e6cf8f;
          --brass-dim: #9a7d3c;
          --rust: #c96a4c;
          --text-primary: #f6f0e2;
          --text-heading: #f6f0e2;
          --muted: #b3bfb3;
          --muted-2: #93a094;
          --toggle-icon: #e6cf8f;
          --overlay: rgba(6, 10, 8, 0.65);
          /* new tokens used by the redesigned layout */
          --gold-text: #e6cf8f;
          --pay-bg: #c9a24b;
          --on-pay: #201a0c;
          --step-bg: #131c18;
          --danger-text: #f0a68c;
          --danger-line: #7a3e2c;
          --badge-bg: rgba(19, 28, 24, 0.78);
        }

        /* ---------- LIGHT TOKENS (warm cream, same family as the login page) ---------- */
        .pos-root[data-theme='light'] {
          --bg: #f6efdf;
          --bg-deep: #efe5cf;
          --panel: #fffaf0;
          --panel-2: #f3ead6;
          --card: #ffffff;
          --card-hover: #fbf3e0;
          --hairline: #e2d6bb;
          --brass: #916b28;
          --brass-soft: #74551e;
          --brass-dim: #bd9142;
          --rust: #a3412a;
          --text-primary: #221f1c;
          --text-heading: #221f1c;
          --muted: #5f584b;
          --muted-2: #7a7262;
          --toggle-icon: #916b28;
          --overlay: rgba(43, 33, 21, 0.4);
          --gold-text: #8a6420;
          --pay-bg: #c9a24b;
          --on-pay: #201a0c;
          --step-bg: #f3ead6;
          --danger-text: #a3412a;
          --danger-line: #e3b4a3;
          --badge-bg: rgba(34, 31, 28, 0.72);
        }
        .pos-root[data-theme='light'] .btn-modifier-save { color: #fbf5e8; }

        .serif { font-family: 'Fraunces', serif; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .pos-root button { font-family: inherit; }

        /* ---------- HEADER ---------- */
        .pos-header {
          height: 68px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 0 20px;
          background: var(--bg-deep);
          border-bottom: 1px solid var(--hairline);
        }
        .hdr-dash-btn {
          height: 44px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 16px;
          border-radius: 12px;
          border: 1px solid var(--brass-dim);
          background: var(--panel);
          color: var(--brass-soft);
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .hdr-dash-btn:hover:not(:disabled) { background: var(--card-hover); }
        .hdr-dash-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .hdr-icon-btn {
          width: 44px;
          height: 44px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 1px solid var(--hairline);
          background: var(--panel);
          color: var(--toggle-icon);
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .hdr-icon-btn:hover { background: var(--card-hover); }
        .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .brand-mark {
          width: 40px;
          height: 40px;
          flex-shrink: 0;
          border-radius: 10px;
          background: var(--pay-bg);
          color: var(--on-pay);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 15px;
        }
        .brand-text h1 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          line-height: 1;
          color: var(--text-heading);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 260px;
        }
        .brand-text p {
          margin: 4px 0 0;
          font-size: 12px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .order-switch {
          display: flex;
          gap: 4px;
          padding: 4px;
          margin-left: auto;
          border-radius: 14px;
          background: var(--panel);
          border: 1px solid var(--hairline);
        }
        .order-switch button {
          height: 40px;
          padding: 0 20px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: var(--muted);
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .order-switch button:not(.active):hover { color: var(--text-heading); }
        .order-switch button.active { background: var(--pay-bg); color: var(--on-pay); }
        .context-chip {
          height: 44px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 16px;
          border-radius: 12px;
          border: 1px dashed var(--brass-dim);
          background: var(--panel);
          color: var(--gold-text);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          max-width: 280px;
        }
        .context-chip span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .context-chip:hover { background: var(--card-hover); }
        .header-right { margin-left: auto; display: flex; align-items: center; gap: 14px; }
        .hdr-clock { font-size: 20px; font-weight: 600; color: var(--gold-text); }

        /* ---------- BODY: order (left) · dishes (middle) · categories (right) ---------- */
        .pos-body {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: 420px minmax(0, 1fr) 220px;
        }

        /* ---------- ORDER / INVOICE ---------- */
        .ticket-col {
          display: flex;
          flex-direction: column;
          min-height: 0;
          background: var(--panel);
          border-right: 1px solid var(--hairline);
        }
        .ticket-head {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px 12px;
          border-bottom: 1px solid var(--hairline);
        }
        .ticket-head h2 { margin: 0; font-size: 22px; font-weight: 600; color: var(--text-heading); }
        .ticket-sub { margin: 3px 0 0; font-size: 13px; color: var(--muted); }
        .ticket-status {
          margin-left: auto;
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid var(--hairline);
          background: var(--card);
          color: var(--gold-text);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
        }
        .ticket-body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px; }
        .ticket-empty {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          text-align: center;
          color: var(--muted);
          font-size: 14px;
        }
        .ticket-empty strong { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; color: var(--text-heading); }
        .ticket-line { border-radius: 12px; }
        .ticket-line + .ticket-line { margin-top: 2px; }
        .ticket-line.is-open { background: var(--card); box-shadow: inset 0 0 0 1.5px var(--brass-dim); }
        /* Compact lines so more dishes fit before the list scrolls */
        .tl-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; min-height: 44px; }
        .tl-main {
          all: unset;
          flex: 1;
          min-width: 0;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .tl-name-text {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-heading);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ticket-line.is-comp .tl-name-text { text-decoration: line-through; opacity: 0.7; }
        .size-tag {
          margin-left: 6px;
          padding: 1px 6px;
          border-radius: 6px;
          background: var(--panel-2);
          color: var(--gold-text);
          font-size: 11px;
          font-weight: 700;
          text-decoration: none;
          display: inline-block;
        }
        .tl-meta { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tl-meta em { font-style: normal; color: var(--gold-text); }
        .tl-unit { font-size: 13px; color: var(--muted-2); }
        .tl-comp-reason { color: var(--gold-text); }
        .qty-stepper {
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 3px;
          border-radius: 12px;
          background: var(--step-bg);
          border: 1px solid var(--hairline);
        }
        .qty-stepper button {
          width: 32px;
          height: 32px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: var(--gold-text);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .qty-stepper button:hover { background: var(--card-hover); }
        .qty-stepper .qty-value {
          width: auto;
          min-width: 28px;
          padding: 0 4px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 15px;
          font-weight: 600;
          color: var(--text-heading);
        }
        .tl-price { width: 78px; text-align: right; font-size: 15px; font-weight: 600; color: var(--text-heading); }
        .comp-strike { display: block; font-size: 12px; color: var(--muted-2); text-decoration: line-through; }
        .comp-free { font-size: 13px; font-weight: 700; color: var(--gold-text); }
        .tl-actions { display: flex; align-items: center; gap: 8px; padding: 0 8px 8px; }
        .tl-actions .tl-unit { margin-right: auto; }
        .line-chip {
          height: 36px;
          padding: 0 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          border-radius: 9px;
          border: 1px solid var(--hairline);
          background: var(--panel-2);
          color: var(--text-heading);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .line-chip:hover { background: var(--card-hover); }
        .line-chip .mod-count {
          min-width: 18px;
          height: 18px;
          border-radius: 999px;
          background: var(--pay-bg);
          color: var(--on-pay);
          font-size: 11px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .line-chip.danger { margin-left: auto; background: transparent; border-color: var(--danger-line); color: var(--danger-text); }

        /* Remarks: one line normally, grows only while typing in it */
        .remarks { display: block; padding: 10px 20px 0; border-top: 1px solid var(--hairline); }
        .remarks-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
        .order-notes-input-summary {
          width: 100%;
          height: 40px;
          box-sizing: border-box;
          resize: none;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          transition: height 0.15s ease;
          padding: 9px 12px;
          border-radius: 12px;
          border: 1px solid var(--hairline);
          background: var(--card);
          color: var(--text-primary);
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          line-height: 1.4;
        }
        .order-notes-input-summary:focus { outline: none; border-color: var(--brass); height: 84px; overflow: auto; white-space: pre-wrap; }
        .order-notes-input-summary::placeholder { color: var(--muted-2); }

        .ticket-summary { padding: 10px 20px; display: flex; flex-direction: column; gap: 5px; font-size: 14px; }
        .sum-row { display: flex; align-items: center; justify-content: space-between; color: var(--muted); }
        .sum-row .mono { color: var(--text-primary); }
        .sum-total {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-top: 4px;
          padding-top: 10px;
          border-top: 1px dashed var(--hairline);
        }
        .sum-total-label { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; color: var(--text-heading); }
        .sum-total-value { font-family: 'IBM Plex Mono', monospace; font-size: 24px; font-weight: 600; color: var(--gold-text); }
        .delivery-fee-input-wrap {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 8px;
          border: 1px solid var(--hairline);
          background: var(--card);
        }
        .delivery-fee-input-wrap .dfee-currency { font-size: 13px; color: var(--muted-2); }
        .delivery-fee-input-wrap input {
          width: 64px;
          background: transparent;
          border: none;
          outline: none;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 14px;
          color: var(--text-primary);
          text-align: right;
        }
        .delivery-fee-input-wrap:focus-within { border-color: var(--brass); }

        .quick-actions-row {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          padding: 0 20px 12px;
        }
        .btn-icon-action {
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-radius: 12px;
          border: 1px solid var(--hairline);
          background: var(--card);
          color: var(--text-heading);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .btn-icon-action:hover:not(:disabled) { background: var(--card-hover); }
        .btn-icon-action:disabled { opacity: 0.45; cursor: not-allowed; }
        .btn-icon-action.danger { background: transparent; border-color: var(--danger-line); color: var(--danger-text); }

        .bottom-actions-row { display: flex; gap: 10px; padding: 0 20px 20px; }
        .btn-hold {
          width: 132px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 14px;
          border: 1px solid var(--brass-dim);
          background: transparent;
          color: var(--gold-text);
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
        }
        .btn-hold:hover:not(:disabled) { background: var(--card-hover); }
        .btn-pay {
          flex: 1;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px; /* never "Pay$13.20" when the button is narrow */
          padding: 0 22px;
          border-radius: 14px;
          border: none;
          background: var(--pay-bg);
          color: var(--on-pay);
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          transition: filter 0.15s ease, transform 0.1s ease;
        }
        .btn-pay .mono { font-size: 20px; }
        .btn-pay:hover:not(:disabled) { filter: brightness(1.06); }
        .btn-pay:active:not(:disabled) { transform: scale(0.99); }
        .btn-pay:disabled, .btn-hold:disabled { opacity: 0.45; cursor: not-allowed; }
        /* Delete sits between Hold and Pay (2nd row): same height, red outline */
        .btn-delete {
          width: 104px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-radius: 14px;
          border: 1px solid var(--danger-line);
          background: transparent;
          color: var(--danger-text);
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
        }
        .btn-delete:hover:not(:disabled) { background: var(--card-hover); }
        .btn-delete:disabled { opacity: 0.45; cursor: not-allowed; }

        /* ---------- DISHES ---------- */
        .menu-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; min-height: 0; padding: 20px 24px; }
        .menu-heading { display: flex; align-items: center; gap: 16px; }
        .menu-heading h2 { margin: 0; font-size: 30px; font-weight: 600; line-height: 1.1; color: var(--text-heading); }
        .menu-heading p { margin: 4px 0 0; font-size: 14px; color: var(--muted); }
        .search-wrap {
          width: 340px;
          height: 48px;
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 16px;
          border-radius: 12px;
          border: 1px solid var(--hairline);
          background: var(--panel);
          color: var(--muted);
        }
        .search-wrap:focus-within { border-color: var(--brass); }
        .search-wrap input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: 0;
          outline: none;
          color: var(--text-primary);
          font-size: 15px;
          font-family: inherit;
        }
        .search-wrap input::placeholder { color: var(--muted-2); }
        .items-scroll { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 8px; }
        /* Cards are placed starting from the RIGHT (next to the categories), as in the
           original POS; the text inside each card stays left-to-right. */
        .items-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; direction: rtl; }
        .items-grid > .item-card { direction: ltr; }
        .item-card {
          height: 176px;
          padding: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          text-align: left;
          border-radius: 16px;
          border: 1px solid var(--hairline);
          background: var(--card);
          color: var(--text-heading);
          cursor: pointer;
          transition: background 0.15s ease, transform 0.1s ease;
        }
        .item-card:hover { background: var(--card-hover); }
        .item-card:active { transform: scale(0.98); }
        .item-img-wrap {
          position: relative;
          height: 96px;
          width: 100%;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .item-img-wrap img { width: 100%; height: 100%; object-fit: cover; }
        .item-initial { font-family: 'Fraunces', serif; font-size: 44px; font-weight: 600; }
        .variant-badge {
          position: absolute;
          top: 10px;
          right: 10px;
          padding: 3px 8px;
          border-radius: 999px;
          background: var(--badge-bg);
          color: #e6cf8f;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .in-ticket-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          min-width: 26px;
          height: 26px;
          padding: 0 6px;
          box-sizing: border-box;
          border-radius: 999px;
          background: var(--pay-bg);
          color: var(--on-pay);
          font-size: 13px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .item-content {
          flex: 1;
          width: 100%;
          box-sizing: border-box;
          padding: 10px 14px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .item-name { font-size: 15px; font-weight: 600; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .item-footer { display: flex; align-items: center; justify-content: space-between; }
        .item-price { font-family: 'IBM Plex Mono', monospace; font-size: 16px; font-weight: 600; color: var(--gold-text); }
        .item-price .from { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-2); margin-right: 4px; }
        .item-add {
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          border: 1px solid var(--brass-dim);
          color: var(--gold-text);
        }
        .items-state-msg { padding: 40px 0; text-align: center; color: var(--muted); font-size: 15px; }

        /* ---------- CATEGORIES ---------- */
        .cat-rail {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: 0;
          overflow-y: auto;
          padding: 16px 12px;
          background: var(--bg-deep);
          border-left: 1px solid var(--hairline);
        }
        .cat-label { padding: 0 10px 6px; font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted-2); }
        .cat-btn {
          min-height: 48px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 12px;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: var(--muted);
          font-size: 14px;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .cat-btn:hover { background: var(--card); color: var(--text-heading); }
        .cat-btn.active { background: var(--card); color: var(--text-heading); box-shadow: inset 0 0 0 1.5px var(--pay-bg); }
        .cat-dot { width: 10px; height: 10px; flex-shrink: 0; border-radius: 999px; }
        .cat-btn .label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cat-count { font-size: 13px; color: var(--muted); }
        .cat-state-msg { padding: 8px 10px; font-size: 13px; color: var(--muted); }

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
          width: 36px;
          height: 36px;
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
          min-height: 48px;
          padding: 12px 14px;
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
          min-height: 46px;
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
          min-height: 46px;
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
        .btn-modifier-save:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
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
          padding: 20px 0;
          border-radius: 10px;
          border: 1px solid var(--hairline);
          background: var(--card);
          color: var(--text-primary);
          font-size: 20px;
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
          width: 44px;
          height: 44px;
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

        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--hairline); border-radius: 6px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--brass-dim); }

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

        .customer-list {
          max-height: 400px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
          padding-right: 4px;
        }

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

        /* Backdrop Overlay with Blur */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background-color: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.15s ease-out;
        }

        /* Card Container & Entry Animation */
        .modal-card-danger {
          position: relative;
          width: 100%;
          max-width: 400px;
          background: #ffffff;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          animation: scaleUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
          text-align: center;
        }

        /* Top Warning Icon Badge */
        .modal-alert-icon {
          width: 48px;
          height: 48px;
          background-color: #fee2e2;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px auto;
        }

        /* Typography Hierarchy */
        .modal-body-content h3 {
          margin: 0 0 8px 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #0f172a;
        }

        .modal-sub {
          margin: 0 0 24px 0;
          font-size: 0.875rem;
          line-height: 1.5;
          color: #64748b;
        }

        .modal-sub strong {
          color: #dc2626;
          font-weight: 600;
        }

        /* Button Layout */
        .modal-action-footer {
          display: flex;
          gap: 12px;
        }

        .btn-modal-secondary,
        .btn-modal-danger {
          flex: 1;
          height: 44px;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
          border: none;
        }

        .btn-modal-secondary {
          background-color: #f1f5f9;
          color: #334155;
        }

        .btn-modal-secondary:hover:not(:disabled) {
          background-color: #e2e8f0;
        }

        .btn-modal-danger {
          background-color: #dc2626;
          color: #ffffff;
          box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);
        }

        .btn-modal-danger:hover:not(:disabled) {
          background-color: #b91c1c;
        }

        .btn-modal-danger:disabled,
        .btn-modal-secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Close Button (Top-Right) */
        .modal-close-corner {
          position: absolute;
          top: 16px;
          right: 16px;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          border-radius: 6px;
          padding: 4px;
        }

        .modal-close-corner:hover:not(:disabled) {
          color: #334155;
          background-color: #f1f5f9;
        }

        /* Animations */
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scaleUp {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        .btn-modifier-danger {
          background: var(--rust);
          color: #fff;
          box-shadow: none;
        }
        .btn-modifier-danger:hover {
          background: var(--rust);
          filter: brightness(1.1);
        }

        /* =================== SMALLER SCREENS (2026-10-26) ===================
           PC: unchanged. Tablet: the same 3 columns, narrower.
           Phone (waiter at the table): categories = a swipeable row on top, dishes fill
           the screen, a bottom bar shows the order; tapping it slides the order up. */
        .m-only, .m-orderbar { display: none; }

        @media (max-width: 1100px) {
          .pos-body { grid-template-columns: 330px minmax(0, 1fr) 170px; }
          .hdr-clock { display: none; }
          .search-wrap { width: 240px; }
          .items-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
        }

        @media (max-width: 760px) {
          .pos-root { height: 100dvh; }

          /* header: two compact lines */
          .pos-header { height: auto; flex-wrap: wrap; gap: 8px; padding: 8px 10px; }
          .brand-text { display: none; }
          .order-switch { order: 3; width: 100%; }
          .order-switch button { flex: 1; }
          .context-chip { max-width: 150px; padding: 6px 10px; font-size: 13px; }
          .header-right { gap: 6px; }
          .hdr-dash-btn span { display: none; }

          /* body: categories row on top, dishes below */
          .pos-body { display: flex; flex-direction: column; }
          .cat-rail {
            order: -1;
            flex-shrink: 0;
            flex-direction: row;
            overflow-x: auto;
            overflow-y: hidden;
            gap: 6px;
            padding: 8px 10px;
            border-left: 0;
            border-bottom: 1px solid var(--hairline);
            scrollbar-width: none;
          }
          .cat-label { display: none; }
          .cat-btn { flex: 0 0 auto; min-height: 40px; background: var(--card); }
          .cat-btn .label { flex: none; max-width: 150px; }

          .menu-col { flex: 1; padding: 10px; gap: 10px; }
          .menu-heading { flex-wrap: wrap; gap: 8px; }
          .menu-heading h2 { font-size: 20px; }
          .menu-heading p { display: none; }
          .search-wrap { width: 100%; height: 42px; margin-left: 0; }
          .items-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
          .item-card { height: 148px; }
          .item-img-wrap { height: 74px; }

          /* the order: a full-screen sheet that slides up */
          .ticket-col {
            position: fixed !important;
            inset: 0;
            z-index: 40;
            border-right: 0;
            transform: translateY(100%);
            transition: transform 0.25s ease;
          }
          .m-order-open .ticket-col { transform: none; }
          .ticket-head { padding: 10px 12px; }
          .btn-pay { gap: 8px; padding: 0 14px; }

          .m-only { display: inline-flex; }
          .m-back {
            align-items: center;
            justify-content: center;
            width: 38px;
            height: 38px;
            flex-shrink: 0;
            border-radius: 10px;
            border: 1px solid var(--hairline);
            background: var(--card);
            color: var(--text-heading);
            cursor: pointer;
          }

          /* the bottom bar */
          .m-orderbar {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-shrink: 0;
            height: 58px;
            padding: 0 16px;
            border: 0;
            background: var(--pay-bg);
            color: var(--on-pay);
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
          }
          .m-orderbar strong { margin-left: auto; font-size: 17px; }
          .m-orderbar-open { display: inline-flex; align-items: center; gap: 2px; padding-left: 12px; border-left: 1px solid currentColor; }
        }
      `}</style>

      {/* HEADER */}
      <header className="pos-header">
        <div className="brand">
          <div className="brand-mark serif">RES</div>
          <div className="brand-text">
            <h1 className="serif">{restaurantName}</h1>
            <p>POS Terminal</p>
          </div>
        </div>

        <div className="order-switch" role="group" aria-label="Order type">
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

        {/* Table (dine-in) or customer (delivery) — opens the existing pickers */}
        {orderType !== 'Takeaway' && (
          <button
            className="context-chip"
            onClick={() => (orderType === 'Dine-In' ? setShowTablePicker(true) : setShowCustomerPicker(true))}
          >
            {orderType === 'Dine-In' ? <Armchair className="w-4 h-4" /> : <User className="w-4 h-4" />}
            <span>{contextLabel}</span>
          </button>
        )}

        <div className="header-right">
          {/* green = online, red = offline (only when opened through RES Local) */}
          <OnlineDot />
          <span className="hdr-clock mono">{clock}</span>
          <button
            className="hdr-icon-btn theme-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button className="hdr-dash-btn" onClick={() => setShowSwitchUser(true)} title="Switch user with a PIN">
            <User className="w-4 h-4" />
            <span>{cashierName || 'Switch user'}</span>
          </button>
          {onClose && (
            <button
              className="hdr-dash-btn"
              onClick={handleBackToDashboard}
              disabled={isSaving}
              title={basket.length ? 'Save this order and go back to the dashboard' : 'Back to the dashboard'}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>{isSaving ? 'Saving…' : basket.length ? 'Save & Dashboard' : 'Dashboard'}</span>
            </button>
          )}
        </div>
      </header>

      {/* pos-body: ORDER (left) → DISHES (middle) → CATEGORIES (right) */}
      <div className="pos-body">

        {/* ---------- ORDER / INVOICE (left) ---------- */}
        <aside className="ticket-col" aria-label="Current order" style={{ position: 'relative' }}>
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
                background: 'var(--overlay)',
                backdropFilter: 'blur(2px)',
              }}
            >
              <Loader2 className="w-6 h-6" style={{ animation: 'kb-spin 0.8s linear infinite' }} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                Loading ticket {activeOrder?.ticketNo ? ticketLabel(activeOrder.ticketNo) : ''}…
              </span>
            </div>
          )}

          <div className="ticket-head">
            {/* phone only: back to the dishes */}
            <button className="m-only m-back" onClick={() => setMobileOrderOpen(false)} aria-label="Back to the dishes">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div style={{ minWidth: 0 }}>
              <h2 className="serif">Order {ticketLabel(ticketNo)}</h2>
              <p className="ticket-sub">
                {orderType}
                {orderType === 'Dine-In' && dineInTable ? ` · Table ${dineInTable.label}` : ''}
                {orderType === 'Delivery' && deliveryCustomer ? ` · ${deliveryCustomer.name}` : ''}
                {` · ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
              </p>
            </div>
            <span className="ticket-status">{currentOrderId ? 'HELD' : 'NEW'}</span>
          </div>

          <div className="ticket-body">
            {basket.length === 0 ? (
              <div className="ticket-empty">
                <ShoppingBag className="w-8 h-8" strokeWidth={1.25} />
                <strong>No items yet</strong>
                <span>Tap a dish to add it.</span>
              </div>
            ) : (
              basket.map((b) => {
                const hasLinkedGroups = (b.item.modifierGroupIds || []).length > 0;
                const unitPrice = lineUnitPrice(b);
                const lineTotal = unitPrice * b.quantity;
                const fullPriceTotal = (b.item.price + modifiersTotal(b)) * b.quantity;
                const mods = b.modifiers || [];
                const isOpen = selectedLineId === b.cartItemId;

                return (
                  <div key={b.cartItemId} className={`ticket-line ${b.comp ? 'is-comp' : ''} ${isOpen ? 'is-open' : ''}`}>
                    <div className="tl-row">
                      {/* Tap the name to show this line's actions */}
                      <button className="tl-main" onClick={() => setSelectedLineId(isOpen ? null : b.cartItemId)}>
                        <span className="tl-name-text">
                          {b.item.name}
                          {b.variantSize && <span className="size-tag">{b.variantSize}</span>}
                        </span>
                        {(mods.length > 0 || b.comp) && (
                          <span className="tl-meta">
                            {mods.map((m, i) => (
                              <span key={`${m.groupId}-${m.optionId}`}>
                                {i > 0 ? ' · ' : ''}
                                {m.optionName}
                                {m.price > 0 && <em> +{money(m.price)}</em>}
                              </span>
                            ))}
                            {b.comp && <span className="tl-comp-reason">{mods.length > 0 ? ' · ' : ''}Free: {b.comp.reason}</span>}
                          </span>
                        )}
                      </button>

                      {/* Quantity is always one tap away */}
                      <div className="qty-stepper">
                        <button onClick={() => updateQuantity(b.cartItemId, -1)} aria-label="Remove one">
                          <Minus className="w-4 h-4" />
                        </button>
                        <button className="qty-value" onClick={() => openQtyEditor(b)} title="Type exact quantity">
                          {b.quantity}
                        </button>
                        <button onClick={() => updateQuantity(b.cartItemId, 1)} aria-label="Add one">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="tl-price mono">
                        {b.comp ? (
                          <>
                            <span className="comp-strike">{money(fullPriceTotal)}</span>
                            <span className="comp-free">Free</span>
                          </>
                        ) : (
                          money(lineTotal)
                        )}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="tl-actions">
                        {/* Unit price only for the tapped line, to keep the list compact */}
                        <span className="tl-unit mono">{money(unitPrice)} each</span>
                        {hasLinkedGroups && (
                          <button className="line-chip" onClick={() => openModifierPicker(b)}>
                            <SlidersHorizontal className="w-4 h-4" />
                            Options
                            {mods.length > 0 && <span className="mod-count">{mods.length}</span>}
                          </button>
                        )}
                        <button className="line-chip" onClick={() => toggleComp(b)}>
                          <Gift className="w-4 h-4" />
                          {b.comp ? 'Remove free' : 'Make free'}
                        </button>
                        <button className="line-chip danger" style={{ marginLeft: 0 }} onClick={() => removeItem(b.cartItemId)}>
                          <Trash2 className="w-4 h-4" />
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Remarks for the whole order (saved as the order's notes) */}
          <label className="remarks">
            <span className="remarks-label">Order remarks</span>
            <textarea
              className="order-notes-input-summary"
              placeholder="Order remarks: allergies, requests, delivery instructions…"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              rows={1}
            />
          </label>

          <div className="ticket-summary">
            <div className="sum-row">
              <span>Subtotal</span>
              <span className="mono">{money(subtotal)}</span>
            </div>
            {orderType === 'Delivery' && (
              <div className="sum-row">
                <span>Delivery fee</span>
                <div className="delivery-fee-input-wrap">
                  <span className="dfee-currency mono">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    aria-label="Delivery fee"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="sum-row">
              <span>{taxLabel()}</span>
              <span className="mono">{money(tax)}</span>
            </div>
            <div className="sum-total">
              <span className="sum-total-label">Total</span>
              <span className="sum-total-value">{money(total)}</span>
            </div>
          </div>

          <div className="quick-actions-row">
            <button className="btn-icon-action" onClick={handlePrintCopy} disabled={isPrinting}>
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? 'Printing…' : 'Print'}</span>
            </button>
            <button className="btn-icon-action" onClick={handlePreviewReceipt} disabled={basket.length === 0 || isSaving} title="See the receipt as it will be printed">
              <Eye className="w-4 h-4" />
              <span>Preview</span>
            </button>
            <button className="btn-icon-action" onClick={handleOpenDrawer} title="Open cash drawer">
              <Archive className="w-4 h-4" />
              <span>Drawer</span>
            </button>
            <button className="btn-icon-action" onClick={() => setShowClearConfirm(true)} title="Clear ticket" disabled={basket.length === 0}>
              <RotateCcw className="w-4 h-4" />
              <span>Clear</span>
            </button>
          </div>

          {/* Hold / Pay — always visible at the bottom */}
          <div className="bottom-actions-row">
            <button className="btn-hold" disabled={basket.length === 0 || isSaving} onClick={() => handleSaveOrder(false)}>
              <Pause className="w-4 h-4" />
              <span>{isSaving ? 'Saving…' : 'Hold'}</span>
            </button>
            <button
              className="btn-delete"
              onClick={() => setShowDeleteConfirm(true)}
              title="Delete order"
              disabled={!currentOrderId || isSaving || isDeleting}
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
            <button className="btn-pay" disabled={basket.length === 0 || isSaving} onClick={() => handleSaveOrder(true)}>
              <span>{isSaving ? 'Processing…' : 'Pay'}</span>
              <span className="mono">{money(total)}</span>
            </button>
          </div>
        </aside>

        {/* ---------- DISHES (middle) ---------- */}
        <main className="menu-col">
          <div className="menu-heading">
            <div style={{ minWidth: 0 }}>
              <h2 className="serif">{searchQuery.trim() ? 'Search results' : activeCategory?.label || 'All items'}</h2>
              <p>
                {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
                {searchQuery.trim() ? ` matching “${searchQuery.trim()}”` : ' · tap to add, tap again for more'}
              </p>
            </div>
            <label className="search-wrap">
              <Search className="w-4 h-4" />
              <input
                type="text"
                aria-label="Search the whole menu"
                placeholder="Search the whole menu…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
          </div>

          <div className="items-scroll">
            {isLoadingItems ? (
              <div className="items-state-msg">Loading the menu…</div>
            ) : filteredItems.length === 0 ? (
              <div className="items-state-msg">No dishes found.</div>
            ) : (
              <div className="items-grid">
                {filteredItems.map((item) => {
                  const palette = paletteForCategory(item.catId);
                  const inTicket = qtyInTicket[item.id] || 0;
                  return (
                    <button key={item.id} className="item-card" onClick={() => handleItemClick(item)}>
                      <div
                        className="item-img-wrap"
                        style={{ background: theme === 'dark' ? palette.dark : palette.light }}
                      >
                        {item.image ? (
                          <img src={item.image} alt="" loading="lazy" />
                        ) : (
                          // No photo yet: first letter on the category's color
                          <span className="item-initial" style={{ color: theme === 'dark' ? '#e6cf8f' : '#6b4a14' }}>
                            {item.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        {item.hasVariants && <span className="variant-badge">Options</span>}
                        {inTicket > 0 && <span className="in-ticket-badge">{inTicket}</span>}
                      </div>
                      <div className="item-content">
                        <div className="item-name">{item.name}</div>
                        <div className="item-footer">
                          <span className="item-price">
                            {item.hasVariants && <span className="from">From</span>}
                            {money(item.price)}
                          </span>
                          <span className="item-add" aria-hidden="true">
                            <Plus className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        {/* ---------- CATEGORIES (right) ---------- */}
        <nav className="cat-rail" aria-label="Categories">
          <span className="cat-label">Categories</span>

          {isLoadingCategories && <div className="cat-state-msg">Loading categories…</div>}
          {error && <div className="cat-state-msg" style={{ color: 'var(--rust)' }}>{error}</div>}

          {!isLoadingCategories && !error && categories.map((cat) => {
            const isActive = activeCat === cat.id && !searchQuery.trim();
            return (
              <button
                key={cat.id}
                className={`cat-btn ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setActiveCat(cat.id);
                  setSearchQuery('');
                }}
              >
                <span className="cat-dot" style={{ background: paletteForCategory(cat.id).dot }} />
                <span className="label" title={cat.label}>{cat.label}</span>
                <span className="cat-count mono">{itemsPerCategory[cat.id] || 0}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* phone only: the order bar at the bottom — tap to open the order and pay */}
      <button className="m-orderbar" onClick={() => setMobileOrderOpen(true)}>
        <ShoppingBag className="w-5 h-5" />
        <span>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
        <strong className="mono">{money(total)}</strong>
        <span className="m-orderbar-open">
          Order <ChevronUp className="w-4 h-4" />
        </span>
      </button>

      {/* PAYMENT WINDOW */}
      {/* Start of a new day: confirm the opening cash in the drawer (never blocks selling) */}
      <OpeningCashPrompt />

      {showPayment && (
        <PaymentModal
          orderLabel={`Order ${ticketLabel(ticketNo)} · ${orderType}${orderType === 'Dine-In' && dineInTable ? ` · Table ${dineInTable.label}` : ''}`}
          total={total}
          onCancel={() => setShowPayment(false)}
          onConfirm={handleConfirmPayment}
          onPreview={lastPaidOrderId ? () => setReceiptPreview({ orderId: lastPaidOrderId, copy: false }) : undefined}
          onDone={() => {
            setShowPayment(false);
            // Stay in the POS with a fresh order (always the next ticket number).
            finishTicket(true, true);
          }}
          onDashboard={
            onClose
              ? () => {
                  setShowPayment(false);
                  // Paid and printed: clear the ticket and go back to the dashboard.
                  finishTicket(true, false);
                }
              : undefined
          }
        />
      )}

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
                    <span className="price mono">{money(price)}</span>
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
                              {price > 0 ? `+${money(price)}` : 'Free'}
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

      {/* SWITCH USER (4-digit PIN) — the ticket on screen stays as it is */}
      {showSwitchUser && (
        <SwitchUserModal
          currentName={cashierName || '—'}
          onClose={() => setShowSwitchUser(false)}
          onSwitched={(token, user) => {
            setShowSwitchUser(false);
            if (onSwitchUser) onSwitchUser(token, user);
            else {
              localStorage.setItem('token', token);
              setMe(user);
            }
            setCashierName(user?.name || '');
            toast.success(`Now: ${user?.name}`, ROLE_LABEL[(user?.role as keyof typeof ROLE_LABEL) ?? 'cashier']);
          }}
        />
      )}

      {/* RECEIPT PREVIEW (exactly as printed, from the server) */}
      {receiptPreview && (
        <ReceiptPreviewModal orderId={receiptPreview.orderId} copy={receiptPreview.copy} onClose={() => setReceiptPreview(null)} />
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
              <div className="receipt-line"><span>Ticket</span><span>{ticketLabel(ticketNo)}</span></div>
              <div className="receipt-line"><span>Type</span><span>{orderType}</span></div>
              <div className="receipt-divider" />

              {basket.length === 0 ? (
                <p className="modifier-empty-msg">Ticket is empty.</p>
              ) : (
                basket.map((b) => (
                  <div key={b.cartItemId}>
                    <div className="receipt-line">
                      <span>{b.quantity}&times; {b.item.name}{b.variantSize ? ` (${b.variantSize})` : ''}</span>
                      <span>{b.comp ? 'COMP' : money((lineUnitPrice(b) * b.quantity))}</span>
                    </div>
                    {(b.modifiers || []).map((m) => (
                      <div key={`${m.groupId}-${m.optionId}`} className="receipt-line indent">
                        <span>+ {m.optionName}</span>
                        <span>{m.price > 0 ? money(m.price) : ''}</span>
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
              <div className="receipt-line"><span>Subtotal</span><span>{money(subtotal)}</span></div>
              {orderType === 'Delivery' && deliveryFeeNum > 0 && (
                <div className="receipt-line"><span>Delivery Fee</span><span>{money(deliveryFeeNum)}</span></div>
              )}
              <div className="receipt-line"><span>{taxLabel()}</span><span>{money(tax)}</span></div>
              <div className="receipt-total-row"><span>Total</span><span>{money(total)}</span></div>
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

      {/* CLEAR TICKET CONFIRMATION */}
      {showClearConfirm && (
        <div className="modal-overlay" onClick={() => setShowClearConfirm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Clear this ticket?</h3>
              <button className="modal-close" onClick={() => setShowClearConfirm(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="modal-sub">
              All {itemCount} {itemCount === 1 ? 'item' : 'items'} will be removed from the basket. Nothing is saved
              until you press Hold or Pay.
            </p>
            <div className="modifier-modal-footer" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
              <button className="btn-modifier-cancel" onClick={() => setShowClearConfirm(false)}>
                Keep items
              </button>
              <button
                className="btn-modifier-save btn-modifier-danger"
                onClick={() => {
                  setBasket([]);
                  setSelectedLineId(null);
                  setShowClearConfirm(false);
                }}
              >
                Clear ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE ORDER CONFIRMATION */}
      {showDeleteConfirm && (
        <div
          className="modal-overlay backdrop-blur-sm"
          onClick={() => !isDeleting && setShowDeleteConfirm(false)}
        >
          <div className="modal-card modal-card-danger" onClick={(e) => e.stopPropagation()}>

            {/* Visual Alert Icon Header */}
            <div className="modal-alert-icon">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>

            <div className="modal-body-content">
              <h3>Delete Order {ticketLabel(ticketNo)}?</h3>
              <p className="modal-sub">
                This action will permanently cancel the ticket and release the assigned table. This step <strong>cannot be undone</strong>.
              </p>
            </div>

            <div className="modal-action-footer">
              <button
                className="btn-modal-secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Keep Order
              </button>

              <button
                className="btn-modal-danger"
                onClick={handleDeleteOrder}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <span className="flex items-center gap-2">
                    <span className="spinner-sm" /> Deleting…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    Delete Order
                  </span>
                )}
              </button>
            </div>

            <button
              className="modal-close-corner"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
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
                        {/* "T-5" for a number, the name itself otherwise (no "T-T3") */}
                        {/^\d+$/.test(String(t.label)) ? `T-${t.label}` : t.label}
                      </span>
                      {t.capacity && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {t.capacity} seats
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex justify-between items-end text-xs font-medium">
                      <span className={isOccupied ? 'text-rose-300 font-bold' : t.booking?.reservedNow ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                        {isOccupied ? 'Occupied' : t.booking?.reservedNow ? (t.booking.lateMinutes > 0 ? `Reserved · late ${t.booking.lateMinutes} min` : 'Reserved') : 'Available'}
                      </span>
                      {isOccupied && t.occupiedOrderNo && (
                        <span className="text-zinc-400 font-mono">#{t.occupiedOrderNo}</span>
                      )}
                    </div>
                    {/* Reservations: the table's next booking; ⚠ when it is still busy close to it */}
                    {t.booking && (
                      <div className={`mt-2 truncate rounded-md border px-2 py-0.5 text-[11px] font-semibold ${t.booking.reservedNow ? 'border-amber-500/70 text-amber-300' : 'border-zinc-700 text-zinc-400'}`}>
                        {isOccupied && t.booking.reservedNow ? '⚠ ' : '🕘 '}{t.booking.time} {t.booking.guestName} ×{t.booking.partySize}
                      </div>
                    )}
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
