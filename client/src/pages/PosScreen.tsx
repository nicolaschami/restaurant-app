import React, { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface PosScreenProps {
  onLogout: () => void;
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
}

export interface BasketItem {
  cartItemId: string;
  item: Item;
  quantity: number;
  variantSize?: string;
}

interface Category {
  id: number;
  label: string;
  icon: LucideIcon;
  no: string;
}

type OrderType = 'Dine-In' | 'Take Away' | 'Delivery';
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
  'Take Away': 'takeaway',
  'Delivery': 'delivery',
};

const flatKeyByOrderType: Record<OrderType, 'priceDineIn' | 'priceTakeaway' | 'priceDelivery'> = {
  'Dine-In': 'priceDineIn',
  'Take Away': 'takeaway',
  'Delivery': 'delivery',
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

let ticketSeq = 214;

export default function PosScreen({ onLogout }: PosScreenProps) {
  const [theme, setTheme] = useState<Theme>('dark');

  const [categories, setCategories] = useState<Category[]>([]);
  const [rawMenuItems, setRawMenuItems] = useState<ApiMenuItem[]>([]);
  const [activeCat, setActiveCat] = useState<number | null>(null);

  const [isLoadingCategories, setIsLoadingCategories] = useState<boolean>(true);
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [orderType, setOrderType] = useState<OrderType>('Dine-In');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [ticketNo] = useState<number>(() => ticketSeq++);
  const [basket, setBasket] = useState<BasketItem[]>([]);

  const [variantModalItem, setVariantModalItem] = useState<ApiMenuItem | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setIsLoadingCategories(true);
        setIsLoadingItems(true);
        setError(null);

        const [catRes, itemRes] = await Promise.all([
          api.get('/categories', { params: { restaurantId: 1 } }),
          api
            .get('/menu-items', { params: { restaurant_id: 1, limit: 2000 } })
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
        setRawMenuItems(rawItems.filter((i) => i.isAvailable));
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
        (b) => `${b.item.id}-${b.variantSize ?? ''}` === matchKey
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

  const removeItem = (cartItemId: string) => {
    setBasket((prev) => prev.filter((b) => b.cartItemId !== cartItemId));
  };

  const subtotal = basket.reduce((acc, b) => acc + b.item.price * b.quantity, 0);
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  const itemCount = basket.reduce((a, b) => a + b.quantity, 0);

  const iconColor = theme === 'dark' ? '#201a0c' : '#fbf5e8';
  const inactiveIconColor = 'var(--muted)';

  return (
    <div className="pos-root" data-theme={theme}>
      <style>{`
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
          font-size: 20px;
          font-weight: 500;
          color: var(--text-heading);
          margin: 0;
        }
        .ticket-no {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          font-weight: 600;
          color: var(--brass);
          background: rgba(201,162,75,0.12);
          border: 1px solid rgba(201,162,75,0.3);
          padding: 4px 10px;
          border-radius: 6px;
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
          gap: 12px;
          padding: 14px 0;
          border-bottom: 1px dotted var(--hairline);
          transition: background 0.15s ease;
        }
        .ticket-line:last-child { border-bottom: none; }
        .ticket-line-details { flex: 1; }
        .ticket-line-name {
          font-family: 'Fraunces', serif;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          display: flex;
          align-items: center;
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
          margin-left: 8px;
          text-transform: uppercase;
        }
        .ticket-line-price {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          color: var(--brass-soft);
          margin-top: 4px;
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
        .qty-stepper span {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-heading);
          width: 16px;
          text-align: center;
        }
        .btn-remove-line {
          border: none;
          background: transparent;
          color: var(--muted-2);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: color 0.15s ease;
        }
        .btn-remove-line:hover { color: var(--rust); }

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

        .action-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 18px;
        }
        .btn-ghost {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 11px;
          border-radius: 9px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid var(--hairline);
          background: transparent;
          transition: all 0.2s ease;
          color: var(--muted);
        }
        .btn-ghost.clear { color: var(--rust); border-color: rgba(177,87,58,0.35); }
        .btn-ghost.clear:hover { background: rgba(177,87,58,0.12); }
        .btn-ghost.hold:hover { background: var(--panel-2); color: var(--text-heading); }

        .btn-pay {
          grid-column: 1 / -1;
          margin-top: 4px;
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

        /* ---------- VARIANT MODAL ---------- */
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

        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--hairline); border-radius: 6px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--brass-dim); }
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
            {(['Dine-In', 'Take Away', 'Delivery'] as const).map((type) => (
              <button
                key={type}
                className={orderType === type ? 'active' : ''}
                onClick={() => setOrderType(type)}
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
        <aside className="ticket-col">
          <div className="ticket-head">
            <div className="ticket-head-top">
              <h2>Current Order</h2>
              <span className="ticket-no">#{ticketNo}</span>
            </div>
            <div className="ticket-meta">
              <span>{orderType}</span>
              <span>·</span>
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
              basket.map((b) => (
                <div key={b.cartItemId} className="ticket-line">
                  <div className="ticket-line-details">
                    <div className="ticket-line-name">
                      {b.item.name}
                      {b.variantSize && <span className="size-tag">{b.variantSize}</span>}
                    </div>
                    <div className="ticket-line-price mono">
                      ${(b.item.price * b.quantity).toFixed(2)}
                    </div>
                  </div>
                  <div className="qty-stepper">
                    <button onClick={() => updateQuantity(b.cartItemId, -1)}>
                      <Minus className="w-3 h-3" />
                    </button>
                    <span>{b.quantity}</span>
                    <button onClick={() => updateQuantity(b.cartItemId, 1)}>
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    className="btn-remove-line"
                    onClick={() => removeItem(b.cartItemId)}
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="tear" />

          <div className="ticket-summary">
            <div className="sum-row">
              <span>Subtotal</span>
              <span className="mono">${subtotal.toFixed(2)}</span>
            </div>
            <div className="sum-row">
              <span>Tax (10%)</span>
              <span className="mono">${tax.toFixed(2)}</span>
            </div>
            <div className="sum-total">
              <span className="sum-total-label">Total due</span>
              <span className="sum-total-value">${total.toFixed(2)}</span>
            </div>

            <div className="action-row">
              <button className="btn-ghost clear" onClick={() => setBasket([])}>
                <RotateCcw className="w-3.5 h-3.5" />
                Clear
              </button>
              <button className="btn-ghost hold" onClick={() => alert('Ticket held for later')}>
                <Receipt className="w-3.5 h-3.5" />
                Hold
              </button>
              <button
                className="btn-pay"
                disabled={basket.length === 0}
                onClick={() => alert(`Payment processed for $${total.toFixed(2)}`)}
              >
                <CreditCard className="w-4 h-4" />
                Take Payment · ${total.toFixed(2)}
              </button>
            </div>
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
    </div>
  );
}