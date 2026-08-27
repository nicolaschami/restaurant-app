import React, { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import Select from 'react-select';
import {
  Plus, Search, X, AlertCircle, ImageIcon, Tag, CheckCircle2, XCircle,
  Edit2, Trash2, ChevronLeft, ChevronRight, Upload, LayoutGrid, List,
  Layers, Box, UtensilsCrossed, ChevronDown, Sliders, Check
} from 'lucide-react';
import { api } from '../api';
import ConfirmModal from '../components/ConfirmModal';

export interface VariantPrice {
  name?: string;
  dineIn?: number | string;
  takeaway?: number | string;
  priceDineIn?: number | string;
  priceTakeaway?: number | string;
  [key: string]: any;
}

interface MenuItem {
  id: number;
  menuName: string;
  invoiceName?: string;
  kitchenName?: string;
  categoryId?: number | null;
  stationId?: number | null;
  priceDineIn?: number | string;
  priceTakeaway?: number | string;
  priceDelivery?: number | string;
  priceWaiter?: number | string;
  costPrice?: number | string;
  description?: string;
  images?: string[];
  isAvailable?: boolean;
  modifierGroupIds?: number[];
  hasVariants?: boolean;
  variantPrices?: VariantPrice[];
  rawMaterials?: { materialId: number | string; name: string; cost: number | string; quantity: number | string }[];
}

interface RawMaterialOption {
  id: number | string;
  name: string;
  cost_price?: number | string;
  costPrice?: number | string;
  unitCost?: number | string;
  unit_cost?: number | string;
  cost?: number | string;
  price?: number | string;
  [key: string]: any;
}

interface OptionType {
  id: number;
  name: string;
}

interface ModifierOption {
  id: number;
  name: string;
  price?: number | string;
  price_delta?: number | string;
  additionalPrice?: number | string;
  cost?: number | string;
}

interface ModifierGroup {
  id: number;
  name: string;
  minSelection?: number;
  maxSelection?: number;
  modifiers?: ModifierOption[];
  options?: ModifierOption[];
  items?: ModifierOption[];
}

interface ProductsProps {
  onLogout: () => void;
}

const parseCost = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  const normalized = String(val).replace(',', '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
};

// Common React Select Custom Styles to maintain visual consistency
const customSelectStyles = {
  control: (base: any, state: any) => ({
    ...base,
    borderRadius: '0.5rem',
    borderColor: state.isFocused ? '#c2621f' : '#e2e8f0',
    minHeight: '34px',
    fontSize: '0.75rem',
    boxShadow: state.isFocused ? '0 0 0 1px #c2621f' : 'none',
  }),
  option: (base: any, state: any) => ({
    ...base,
    fontSize: '0.75rem',
    backgroundColor: state.isFocused ? '#c2621f' : state.isSelected ? '#fdece1' : '#ffffff',
    color: state.isFocused ? '#ffffff' : state.isSelected ? '#8a3f16' : '#334155',
    cursor: 'pointer',
  }),
};

// "Spice rack" palette for modifier group accent colors
const GROUP_PALETTES = [
  { bg: 'bg-amber-50', border: 'border-amber-200', activeBorder: 'border-amber-400', ring: 'ring-amber-400/30', dot: 'bg-amber-500', text: 'text-amber-700', pillBg: 'bg-amber-100', pillText: 'text-amber-700', checkBg: 'bg-amber-500' },
  { bg: 'bg-red-50', border: 'border-red-200', activeBorder: 'border-red-400', ring: 'ring-red-400/30', dot: 'bg-red-500', text: 'text-red-700', pillBg: 'bg-red-100', pillText: 'text-red-700', checkBg: 'bg-red-500' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', activeBorder: 'border-emerald-400', ring: 'ring-emerald-400/30', dot: 'bg-emerald-500', text: 'text-emerald-700', pillBg: 'bg-emerald-100', pillText: 'text-emerald-700', checkBg: 'bg-emerald-500' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', activeBorder: 'border-cyan-400', ring: 'ring-cyan-400/30', dot: 'bg-cyan-500', text: 'text-cyan-700', pillBg: 'bg-cyan-100', pillText: 'text-cyan-700', checkBg: 'bg-cyan-500' },
  { bg: 'bg-purple-50', border: 'border-purple-200', activeBorder: 'border-purple-400', ring: 'ring-purple-400/30', dot: 'bg-purple-500', text: 'text-purple-700', pillBg: 'bg-purple-100', pillText: 'text-purple-700', checkBg: 'bg-purple-500' },
  { bg: 'bg-lime-50', border: 'border-lime-200', activeBorder: 'border-lime-400', ring: 'ring-lime-400/30', dot: 'bg-lime-500', text: 'text-lime-700', pillBg: 'bg-lime-100', pillText: 'text-lime-700', checkBg: 'bg-lime-500' },
];

function ModifierGroupCard({
  group,
  palette,
  isChecked,
  onToggle,
}: {
  group: ModifierGroup;
  palette: typeof GROUP_PALETTES[0];
  isChecked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const optionsList = group.options || group.modifiers || group.items || [];
  const visibleOptions = expanded ? optionsList : optionsList.slice(0, 3);
  const hasMore = optionsList.length > 3 && !expanded;

  return (
    <div
      className={`
        relative rounded-xl border-2 transition-all duration-200 cursor-pointer overflow-hidden
        ${isChecked
          ? `${palette.activeBorder} ${palette.bg} ring-2 ${palette.ring} shadow-sm`
          : `border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm`
        }
      `}
      onClick={() => onToggle(!isChecked)}
    >
      <div className={`absolute top-0 left-0 w-1 h-full transition-all duration-200 ${isChecked ? palette.dot : 'bg-transparent'}`} />

      <div className="pl-3 pr-2.5 pt-2.5 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className={`
                shrink-0 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center transition-all duration-200
                ${isChecked ? `${palette.checkBg} border-transparent` : 'border-slate-300 bg-white'}
              `}
              style={{ width: '18px', height: '18px' }}
            >
              {isChecked && <Check size={10} className="text-white" strokeWidth={3} />}
            </div>

            <span className={`text-xs font-bold truncate ${isChecked ? palette.text : 'text-slate-700'}`}>
              {group.name}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {optionsList.length > 0 && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isChecked ? `${palette.pillBg} ${palette.pillText}` : 'bg-slate-100 text-slate-500'}`}>
                {optionsList.length} opt
              </span>
            )}

            {(group.minSelection != null || group.maxSelection != null) && (
              <div className="flex items-center gap-0.5">
                {group.minSelection != null && group.minSelection > 0 && (
                  <span className="text-[9px] font-bold bg-[#fdece1] text-[#8a3f16] px-1 py-0.5 rounded">
                    min {group.minSelection}
                  </span>
                )}
                {group.maxSelection != null && group.maxSelection > 0 && (
                  <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1 py-0.5 rounded">
                    max {group.maxSelection}
                  </span>
                )}
              </div>
            )}

            {optionsList.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                className={`p-0.5 rounded transition-all ${isChecked ? palette.text : 'text-slate-400 hover:text-slate-600'}`}
              >
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>
        </div>

        {optionsList.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {visibleOptions.map((opt) => (
              <span
                key={opt.id}
                className={`
                  inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border transition-all
                  ${isChecked
                    ? `${palette.pillBg} ${palette.pillText} border-transparent`
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                  }
                `}
              >
                {opt.name}
                {(opt.price || opt.price_delta || opt.additionalPrice) && (
                  <span className={`price-font font-bold ${isChecked ? palette.text : 'text-slate-400'}`}>
                    +${parseCost(opt.price ?? opt.price_delta ?? opt.additionalPrice).toFixed(2)}
                  </span>
                )}
              </span>
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border transition-all
                  ${isChecked ? `${palette.pillBg} ${palette.pillText} border-transparent` : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}
                `}
              >
                +{optionsList.length - 3} more
              </button>
            )}
          </div>
        )}

        {optionsList.length === 0 && (
          <p className="mt-1 text-[10px] text-slate-400 italic">No options defined</p>
        )}
      </div>
    </div>
  );
}

export default function Products({ onLogout }: ProductsProps) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<OptionType[]>([]);
  const [stations, setStations] = useState<OptionType[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [masterMaterialsList, setMasterMaterialsList] = useState<RawMaterialOption[]>([]);

  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [modifierSearchQuery, setModifierSearchQuery] = useState(''); // Added active state for search
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [menuName, setMenuName] = useState('');
  const [invoiceName, setInvoiceName] = useState('');
  const [kitchenName, setKitchenName] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [stationId, setStationId] = useState<number | null>(null);
  const [priceDineIn, setPriceDineIn] = useState<string>('0.00');
  const [priceTakeaway, setPriceTakeaway] = useState<string>('0.00');
  const [priceDelivery, setPriceDelivery] = useState<string>('0.00');
  const [priceWaiter, setPriceWaiter] = useState<string>('0.00');
  const [costPrice, setCostPrice] = useState<string>('0.00');
  const [description, setDescription] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [selectedModifierIds, setSelectedModifierIds] = useState<number[]>([]);
  const [countryTax, setCountryTax] = useState<string>('0.00');
  const [isInventoryTracked, setIsInventoryTracked] = useState<boolean>(false);
  const [hasVariants, setHasVariants] = useState<boolean>(false);

  const [variants, setVariants] = useState<
    { size: string; dineIn: string; takeaway: string; delivery: string; waiter: string }[]
  >([
    { size: 'Small', dineIn: '', takeaway: '', delivery: '', waiter: '' },
    { size: 'Medium', dineIn: '', takeaway: '', delivery: '', waiter: '' },
    { size: 'Large', dineIn: '', takeaway: '', delivery: '', waiter: '' },
  ]);

  const handleVariantPriceChange = (
    vIdx: number,
    field: 'dineIn' | 'takeaway' | 'delivery' | 'waiter',
    value: string
  ) => {
    const updated = [...variants];
    const previousDineInValue = updated[vIdx].dineIn;
    updated[vIdx][field] = value;
    if (field === 'dineIn') {
      if (updated[vIdx].takeaway === previousDineInValue || !updated[vIdx].takeaway) updated[vIdx].takeaway = value;
      if (updated[vIdx].delivery === previousDineInValue || !updated[vIdx].delivery) updated[vIdx].delivery = value;
      if (updated[vIdx].waiter === previousDineInValue || !updated[vIdx].waiter) updated[vIdx].waiter = value;
    }
    setVariants(updated);
  };

  const [rawMaterials, setRawMaterials] = useState<
    { materialId: number | string; name: string; unitCost: number | string; quantity: number | string; totalCost: number | string }[]
  >([]);
  const [isManualCost, setIsManualCost] = useState<boolean>(false);

  const calculatedRawCost = rawMaterials.reduce((sum, item) => sum + (parseCost(item.totalCost) || 0), 0);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [activeImageIdx, setActiveImageIdx] = useState<number>(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);

  const openLightbox = (images: string[], initialIndex: number = 0) => {
    if (!images || images.length === 0) return;
    setLightboxImages(images);
    setActiveImageIdx(initialIndex);
    setIsLightboxOpen(true);
  };

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [itemsRes, catRes, stationRes, modRes, rawMatRes] = await Promise.all([
        api.get('/menu-items?restaurant_id=1&limit=2000').catch(() => ({ data: [] })),
        api.get('/categories?restaurant_id=1').catch(() => ({ data: [] })),
        api.get('/kitchen-stations').catch(() => ({ data: [] })),
        api.get('/modifier-groups?restaurant_id=1').catch(() => ({ data: [] })),
        api.get('/raw-materials?restaurant_id=1').catch(() => ({ data: [] })),
      ]);

      const rawItems = itemsRes?.data;
      const itemsArray = Array.isArray(rawItems) ? rawItems : Array.isArray(rawItems?.menuItems) ? rawItems.menuItems : Array.isArray(rawItems?.data) ? rawItems.data : [];
      setItems(itemsArray);

      const rawCats = catRes?.data;
      setCategories(Array.isArray(rawCats) ? rawCats : rawCats?.categories || []);

      const rawStations = stationRes?.data;
      setStations(Array.isArray(rawStations) ? rawStations : rawStations?.stations || []);

      const rawMods = modRes?.data;
      const baseGroups = Array.isArray(rawMods) ? rawMods : rawMods?.modifierGroups || rawMods?.data || [];

      const rawMatData = rawMatRes?.data;
      const rawMatArray = Array.isArray(rawMatData) ? rawMatData : Array.isArray(rawMatData?.rawMaterials) ? rawMatData.rawMaterials : Array.isArray(rawMatData?.data) ? rawMatData.data : [];
      setMasterMaterialsList(rawMatArray);

      const detailedGroups = await Promise.all(
        baseGroups.map(async (group: any) => {
          if ((group.options && group.options.length > 0) || (group.modifiers && group.modifiers.length > 0) || (group.items && group.items.length > 0)) return group;
          try {
            const detailRes = await api.get(`/modifier-groups/${group.id}`);
            return detailRes.data?.modifierGroup || detailRes.data || group;
          } catch { return group; }
        })
      );
      setModifierGroups(detailedGroups);
    } catch (err: any) {
      if (err.response?.status === 401) onLogout();
      else setError('Failed to load menu items or dropdown options.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInitialData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedCategoryFilter]);

  const getItemCostPrice = (item: RawMaterialOption) =>
    parseCost(item.cost_price ?? item.costPrice ?? item.unitCost ?? item.unit_cost ?? item.cost ?? item.price);

  const handleOpenModal = (item?: MenuItem) => {
    setFormError(null);
    setSelectedFiles([]);
    setModifierSearchQuery('');
    if (item) {
      setEditingItem(item);
      setMenuName(item.menuName || '');
      setInvoiceName(item.invoiceName || item.menuName || '');
      setKitchenName(item.kitchenName || item.menuName || '');
      setCategoryId(item.categoryId || null);
      setStationId(item.stationId || null);
      setPriceDineIn(String(item.priceDineIn ?? '0.00'));
      setPriceTakeaway(String(item.priceTakeaway ?? '0.00'));
      setPriceDelivery(String(item.priceDelivery ?? '0.00'));
      setPriceWaiter(String(item.priceWaiter ?? '0.00'));
      setCostPrice(String(item.costPrice ?? '0.00'));
      setDescription(item.description || '');
      setIsAvailable(item.isAvailable ?? true);
      setImagePreviews(item.images || []);
      const itemHasVariants = Boolean(item.hasVariants);
      setHasVariants(itemHasVariants);
      if (Array.isArray(item.variantPrices) && item.variantPrices.length > 0) {
        setVariants(item.variantPrices.map((v) => ({
          size: v.size || v.name || '',
          dineIn: String(v.dineIn ?? v.priceDineIn ?? ''),
          takeaway: String(v.takeaway ?? v.priceTakeaway ?? ''),
          delivery: String(v.delivery ?? v.priceDelivery ?? ''),
          waiter: String(v.waiter ?? v.priceWaiter ?? ''),
        })));
      } else {
        setVariants([
          { size: 'Small', dineIn: '', takeaway: '', delivery: '', waiter: '' },
          { size: 'Medium', dineIn: '', takeaway: '', delivery: '', waiter: '' },
          { size: 'Large', dineIn: '', takeaway: '', delivery: '', waiter: '' },
        ]);
      }
      const existingIds = item.modifierGroupIds || (item as any).modifier_group_ids || (item as any).modifiers?.map((m: any) => m.id ?? m) || [];
      setSelectedModifierIds(existingIds.map((id: any) => Number(id)));
      if (item.rawMaterials && Array.isArray(item.rawMaterials)) {
        const mapped = item.rawMaterials.map((rm: any) => {
          const uCost = parseCost(rm.cost ?? rm.unitCost ?? rm.cost_price);
          const qty = parseCost(rm.quantity) || 1;
          return { materialId: rm.materialId, name: rm.name, unitCost: uCost, quantity: qty, totalCost: uCost * qty };
        });
        setRawMaterials(mapped);
      } else { setRawMaterials([]); }
    } else {
      setEditingItem(null);
      setMenuName(''); setInvoiceName(''); setKitchenName('');
      setCategoryId(categories.length > 0 ? categories[0].id : null);
      setStationId(null);
      setPriceDineIn('0.00'); setPriceTakeaway('0.00'); setPriceDelivery('0.00'); setPriceWaiter('0.00'); setCostPrice('0.00');
      setDescription(''); setIsAvailable(true); setImagePreviews([]); setSelectedModifierIds([]); setRawMaterials([]);
      setHasVariants(false);
      setVariants([
        { size: 'Small', dineIn: '', takeaway: '', delivery: '', waiter: '' },
        { size: 'Medium', dineIn: '', takeaway: '', delivery: '', waiter: '' },
        { size: 'Large', dineIn: '', takeaway: '', delivery: '', waiter: '' },
      ]);
    }
    setIsModalOpen(true);
  };

  const handleMultipleFilesChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const newPreviews = filesArray.map((file) => URL.createObjectURL(file));
      setSelectedFiles((prev) => [...prev, ...filesArray]);
      setImagePreviews((prev) => [...prev, ...newPreviews]);
    }
  };

  const removeImage = (index: number) => {
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFilesToServer = async (files: File[]): Promise<string[]> => {
    if (files.length === 0) return [];
    const formData = new FormData();
    files.forEach((file) => formData.append('images', file));
    const response = await api.post('/upload', formData);
    return response.data.urls;
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!menuName.trim()) { setFormError('Menu Name is required.'); return; }
    try {
      setFormError(null);
      const newlyUploadedUrls = await uploadFilesToServer(selectedFiles);
      const existingPermanentImages = imagePreviews.filter((url) => !url.startsWith('blob:'));
      const finalImages = [...existingPermanentImages, ...newlyUploadedUrls];
      const payload = {
        restaurantId: 1,
        categoryId: categoryId ? Number(categoryId) : null,
        stationId: stationId ? Number(stationId) : null,
        name: menuName.trim(), menuName: menuName.trim(),
        invoiceName: invoiceName.trim() || menuName.trim(),
        kitchenName: kitchenName.trim() || menuName.trim(),
        price: parseCost(priceDineIn), priceDineIn: parseCost(priceDineIn),
        priceTakeaway: parseCost(priceTakeaway), priceDelivery: parseCost(priceDelivery), priceWaiter: parseCost(priceWaiter),
        costPrice: isManualCost ? parseCost(costPrice) : calculatedRawCost,
        description: description.trim(),
        images: finalImages.length > 0 ? finalImages : ['https://placehold.co/600x400/e2e8f0/64748b?text=No+Image'],
        isAvailable: Boolean(isAvailable),
        modifierGroupIds: selectedModifierIds.map((id) => Number(id)),
        rawMaterials: rawMaterials.map((rm) => ({ materialId: rm.materialId, name: rm.name, cost: parseCost(rm.unitCost), quantity: parseCost(rm.quantity), totalCost: parseCost(rm.totalCost) })),
        hasVariants: Boolean(hasVariants),
        variantPrices: hasVariants ? variants.map((v) => ({ size: (v.size ?? '').trim(), dineIn: parseCost(v.dineIn), takeaway: parseCost(v.takeaway), delivery: parseCost(v.delivery), waiter: parseCost(v.waiter) })) : [],
      };
      if (editingItem) await api.patch(`/menu-items/${editingItem.id}`, payload);
      else await api.post('/menu-items', payload);
      setIsModalOpen(false);
      fetchInitialData();
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Failed to save menu item.');
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await api.delete(`/menu-items/${itemToDelete.id}`);
      setItemToDelete(null);
      fetchInitialData();
    } catch { alert('Failed to delete product.'); }
  };

  const safeItems = Array.isArray(items) ? items : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeStations = Array.isArray(stations) ? stations : [];
  const safeModifierGroups = Array.isArray(modifierGroups) ? modifierGroups : [];

  const filteredItems = safeItems.filter((item) => {
    const nameMatch = item?.menuName ? item.menuName.toLowerCase().includes(searchQuery.toLowerCase().trim()) : false;
    const categoryMatch = selectedCategoryFilter === 'all' || item.categoryId === selectedCategoryFilter;
    return nameMatch && categoryMatch;
  });

  const filteredModifierGroups = safeModifierGroups.filter((group) =>
    group.name.toLowerCase().includes(modifierSearchQuery.toLowerCase().trim())
  );

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@500;600;700&display=swap');
        .ticket-font { font-family: 'Bebas Neue', 'Arial Narrow', sans-serif; letter-spacing: 0.05em; }
        .price-font { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .ticket-tear {
          height: 8px;
          background-image: radial-gradient(circle at 6px 0px, transparent 4px, inherit 4.2px);
          background-size: 12px 8px;
          background-repeat: repeat-x;
        }
        .ticket-tear-line {
          background-image: repeating-linear-gradient(90deg, #d6d3d1 0 5px, transparent 5px 11px);
          height: 1px;
        }
      `}</style>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1c1917] text-[#e8ceb8] shadow-sm shrink-0">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div>
            <h1 className="ticket-font uppercase text-2xl sm:text-3xl leading-none text-[#1c1917]">Menu Items</h1>
            <p className="text-xs text-slate-500 mt-1">Manage product listings, pricing tiers, modifiers, and photos &middot; <span className="price-font font-semibold text-[#8a3f16]">{filteredItems.length}</span> total</p>
          </div>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#8a3f16] to-[#c2621f] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-[#8a3f16]/25 transition hover:opacity-95 active:scale-98"
        >
          <Plus className="h-4 w-4" />
          Add Menu Item
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 mt-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full sm:w-auto flex-1">
          <div className="md:col-span-2 relative">
            <Search size={18} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products by menu name..."
              className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#c2621f]/40 focus:border-[#c2621f] shadow-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-lg">
                <X size={16} />
              </button>
            )}
          </div>
          <div>
            <Select
              isSearchable
              placeholder="Filter by Category"
              value={selectedCategoryFilter === 'all' ? { value: 'all', label: 'All Categories' } : { value: selectedCategoryFilter, label: safeCategories.find((c) => c.id === selectedCategoryFilter)?.name || 'Category' }}
              onChange={(option: any) => setSelectedCategoryFilter(option ? option.value : 'all')}
              options={[{ value: 'all', label: 'All Categories' }, ...safeCategories.map((c) => ({ value: c.id, label: c.name }))]}
              styles={{
                ...customSelectStyles,
                control: (base, state) => ({ ...base, borderRadius: '0.75rem', borderColor: state.isFocused ? '#c2621f' : '#e2e8f0', padding: '1px', boxShadow: state.isFocused ? '0 0 0 2px rgba(194,98,31,0.15)' : 'none' }),
              }}
            />
          </div>
        </div>
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 self-start sm:self-auto">
          <button onClick={() => setViewMode('cards')} title="Card View" className={`p-2 rounded-lg transition ${viewMode === 'cards' ? 'bg-white text-[#b5541f] shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-800'}`}>
            <LayoutGrid size={18} />
          </button>
          <button onClick={() => setViewMode('table')} title="Table View" className={`p-2 rounded-lg transition ${viewMode === 'table' ? 'bg-white text-[#b5541f] shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-800'}`}>
            <List size={18} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Product Content */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse m-auto">Loading menu items...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-500 m-auto">No products found.</div>
        ) : (
          <>
            {viewMode === 'table' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-[#1c1917] text-[11px] font-semibold uppercase text-[#d8c6b0] tracking-wider">
                      <th className="px-4 py-3 text-center">Images</th>
                      <th className="px-6 py-3">Menu Name</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Dine-In</th>
                      <th className="px-4 py-3">Takeaway</th>
                      <th className="px-4 py-3">Modifiers</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedItems.map((item) => {
                      const catName = safeCategories.find((c) => c.id === item.categoryId)?.name || 'Unassigned';
                      const hasImages = item.images && item.images.length > 0;
                      const modifierCount = item.modifierGroupIds?.length || 0;
                      return (
                        <tr key={item.id} className="hover:bg-[#faf3ea] transition-colors">
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-center">
                              <div className="relative inline-block">
                                {hasImages ? (
                                  <img src={item.images![0]} alt={item.menuName} onClick={() => openLightbox(item.images!, 0)} className="h-10 w-10 rounded-full object-cover border border-slate-200 cursor-pointer hover:opacity-80 transition" />
                                ) : (
                                  <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center border border-slate-200"><ImageIcon size={18} /></div>
                                )}
                                {hasImages && item.images!.length > 1 && (
                                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#b5541f] text-[10px] font-bold text-white ring-2 ring-white">+{item.images!.length - 1}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-800">
                            <div>{item.menuName}</div>
                            {item.kitchenName && item.kitchenName !== item.menuName && <div className="text-xs text-slate-400 font-normal">K: {item.kitchenName}</div>}
                          </td>
                          <td className="px-4 py-4">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600"><Tag size={12} />{catName}</span>
                          </td>
                          <td className="px-4 py-4 price-font font-semibold text-[#1c1917]">${parseCost(item.priceDineIn).toFixed(2)}</td>
                          <td className="px-4 py-4 price-font font-semibold text-[#1c1917]">${parseCost(item.priceTakeaway).toFixed(2)}</td>
                          <td className="px-4 py-4">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#8a3f16] bg-[#fdece1] border border-[#f0c9a6] px-2 py-0.5 rounded-md">
                              <Layers size={12} className="text-[#b5541f]" />
                              {modifierCount} Group{modifierCount !== 1 ? 's' : ''}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            {item.isAvailable ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md"><CheckCircle2 size={13} /> On Menu</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-md"><XCircle size={13} /> 86'd</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handleOpenModal(item)} className="p-2 text-slate-400 hover:text-[#b5541f] hover:bg-[#fdece1] rounded-lg transition"><Edit2 size={16} /></button>
                              <button onClick={() => setItemToDelete(item)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {viewMode === 'cards' && (
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 bg-[#faf8f4]">
                {paginatedItems.map((item) => {
                  const hasImages = item.images && item.images.length > 0;
                  const catName = safeCategories.find((c) => c.id === item.categoryId)?.name || 'Unassigned';
                  const modifierCount = item.modifierGroupIds?.length || 0;
                  return (
                    <div key={item.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative group overflow-hidden">
                      <div className="h-1 w-full bg-gradient-to-r from-[#8a3f16] to-[#c2621f]" />
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <h4 className="font-bold text-slate-800 text-sm leading-snug line-clamp-2">{item.menuName}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400"><Tag size={10} />{catName}</span>
                              {modifierCount > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#8a3f16] bg-[#fdece1] px-1.5 py-0.5 rounded"><Layers size={10} />{modifierCount}</span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 relative">
                            {hasImages ? (
                              <img src={item.images![0]} alt={item.menuName} onClick={() => openLightbox(item.images!, 0)} className="w-14 h-14 rounded-xl object-cover border border-slate-100 cursor-pointer hover:opacity-80 transition" />
                            ) : (
                              <div className="w-14 h-14 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center border border-slate-100"><ImageIcon size={20} /></div>
                            )}
                            {hasImages && item.images!.length > 1 && (
                              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#b5541f] text-[9px] font-bold text-white ring-2 ring-white">+{item.images!.length - 1}</span>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 space-y-1 text-xs price-font">
                          <div className="flex justify-between">
                            <span className="text-slate-500 font-sans">Dine-In:</span>
                            <span className="font-semibold text-[#1c1917]">${(item.hasVariants && item.variantPrices?.[0] ? Number(item.variantPrices[0].dineIn) : Number(item.priceDineIn ?? 0)).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500 font-sans">Takeaway:</span>
                            <span className="font-semibold text-[#1c1917]">${(item.hasVariants && Array.isArray(item.variantPrices) && item.variantPrices.length > 0 ? Number((item.variantPrices[0] as any)?.priceTakeaway ?? (item.variantPrices[0] as any)?.takeaway ?? 0) : Number(item.priceTakeaway ?? 0)).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="ticket-tear-line mx-4" />
                      <div className="px-4 py-3 flex items-center justify-between">
                        {item.isAvailable ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md"><CheckCircle2 size={12} /> On Menu</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-md"><XCircle size={12} /> 86'd</span>
                        )}
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleOpenModal(item)} className="p-1.5 text-slate-400 hover:text-[#b5541f] hover:bg-[#fdece1] rounded-lg transition" title="Edit"><Edit2 size={14} /></button>
                          <button onClick={() => setItemToDelete(item)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            <div className="mt-auto flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 gap-3 text-sm text-slate-500">
              <div>Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredItems.length)} to {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length} items</div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button disabled={currentPage === 1} onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} className="p-2 border border-slate-200 bg-white rounded-lg text-slate-600 hover:bg-[#fdece1] hover:text-[#b5541f] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-slate-600 transition"><ChevronLeft size={16} /></button>
                  <span className="text-xs font-semibold px-2 price-font">Page {currentPage} of {totalPages}</span>
                  <button disabled={currentPage === totalPages} onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} className="p-2 border border-slate-200 bg-white rounded-lg text-slate-600 hover:bg-[#fdece1] hover:text-[#b5541f] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-slate-600 transition"><ChevronRight size={16} /></button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[88vh] flex flex-col overflow-hidden border border-slate-100">
            <div className="px-6 py-4 bg-[#1c1917] flex items-center justify-between shrink-0 border-b-2 border-[#c2621f]">
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-7 rounded-full bg-gradient-to-b from-[#c2621f] to-[#8a3f16]"></div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#c2621f] leading-none mb-1">Menu Item</p>
                  <h3 className="ticket-font uppercase text-xl leading-none text-white">{editingItem ? 'Edit Item' : 'New Item'}</h3>
                </div>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"><X size={18} /></button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              <div className="p-5 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* LEFT COLUMN */}
                <div className="lg:col-span-5 space-y-3.5">
                  {formError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-600 text-xs font-medium">
                      <AlertCircle size={15} className="shrink-0" /><span>{formError}</span>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Menu Name *</label>
                    <input type="text" value={menuName} onChange={(e) => { setMenuName(e.target.value); if (!editingItem) { setInvoiceName(e.target.value); setKitchenName(e.target.value); } }} placeholder="e.g. Pepperoni Pizza" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] outline-none transition" autoFocus />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Invoice Name</label>
                      <input type="text" value={invoiceName} onChange={(e) => setInvoiceName(e.target.value)} placeholder="Receipt Name" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#c2621f]" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kitchen Name</label>
                      <input type="text" value={kitchenName} onChange={(e) => setKitchenName(e.target.value)} placeholder="Ticket Name" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#c2621f]" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Category</label>
                      <Select isSearchable placeholder="Category..." value={categoryId ? { value: categoryId, label: safeCategories.find((c) => c.id === categoryId)?.name || '' } : null} onChange={(opt: any) => setCategoryId(opt ? opt.value : null)} options={safeCategories.map((c) => ({ value: c.id, label: c.name }))} styles={customSelectStyles} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kitchen Station</label>
                      <Select isClearable isSearchable placeholder="Station..." value={stationId ? { value: stationId, label: safeStations.find((s) => s.id === stationId)?.name || '' } : null} onChange={(opt: any) => setStationId(opt ? opt.value : null)} options={safeStations.map((s) => ({ value: s.id, label: s.name }))} styles={customSelectStyles} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Country Tax (%)</label>
                      <input type="number" step="0.01" value={countryTax} onChange={(e) => setCountryTax(e.target.value)} placeholder="e.g. 15.00" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs price-font outline-none focus:border-[#c2621f]" />
                    </div>
                    <div className="flex flex-col justify-end">
                      <label htmlFor="is_inventory_tracked" className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 py-2">
                        <input type="checkbox" id="is_inventory_tracked" checked={isInventoryTracked} onChange={(e) => setIsInventoryTracked(e.target.checked)} className="w-4 h-4 text-[#c2621f] rounded border-slate-300 focus:ring-[#c2621f] cursor-pointer" />
                        Countable
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Public)</label>
                    <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description shown to customers..." className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] outline-none resize-none transition" />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input type="checkbox" id="is_available" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} className="w-4 h-4 text-[#c2621f] rounded border-slate-300 focus:ring-[#c2621f] cursor-pointer" />
                    <label htmlFor="is_available" className="text-xs font-semibold text-slate-700 cursor-pointer">Available for ordering</label>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Product Images</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {imagePreviews.map((img, idx) => (
                        <div key={idx} className="relative group w-11 h-11">
                          <div onClick={() => openLightbox(imagePreviews, idx)} className="w-full h-full rounded-lg overflow-hidden border border-slate-200 cursor-pointer relative shadow-sm">
                            <img src={img} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white"><Search size={12} /></div>
                          </div>
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeImage(idx); }} className="absolute -top-1 -right-1 z-10 bg-rose-500 text-white rounded-full p-0.5 shadow transition hover:scale-110"><X size={10} /></button>
                        </div>
                      ))}
                      <label className="cursor-pointer flex items-center justify-center w-11 h-11 rounded-lg border border-dashed border-slate-300 hover:border-[#c2621f] hover:bg-[#fdece1]/50 text-slate-400 hover:text-[#b5541f] transition">
                        <Upload size={16} />
                        <input type="file" accept="image/*" multiple onChange={handleMultipleFilesChange} className="hidden" />
                      </label>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="lg:col-span-7 space-y-3.5">
                  {/* Raw Materials */}
                  <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Box size={13} className="text-[#b5541f]" />
                        Raw Materials / Ingredients
                      </span>
                      <button type="button" onClick={() => setRawMaterials([...rawMaterials, { materialId: '', name: '', unitCost: 0, quantity: 1, totalCost: 0 }])} className="text-[11px] font-semibold text-[#b5541f] hover:text-[#8a3f16]">+ Add Material</button>
                    </div>
                    {rawMaterials.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic py-1">No raw materials added yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        <div className="grid grid-cols-12 gap-1.5 px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <span className="col-span-5">Material (Search)</span>
                          <span className="col-span-2 text-center">Unit Cost</span>
                          <span className="col-span-2 text-center">Qty</span>
                          <span className="col-span-2 text-center">Subtotal</span>
                          <span className="col-span-1"></span>
                        </div>
                        {rawMaterials.map((mat, mIdx) => (
                          <div key={mIdx} className="grid grid-cols-12 gap-1.5 items-center bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                            <div className="col-span-5">
                              <Select
                                isSearchable
                                placeholder="Search Material..."
                                value={mat.materialId ? { value: mat.materialId, label: masterMaterialsList.find((m) => String(m.id) === String(mat.materialId))?.name || mat.name || "Select..." } : null}
                                onChange={(option: any) => {
                                  const selectedId = option ? option.value : "";
                                  const selectedItem = masterMaterialsList.find((m) => String(m.id) === String(selectedId));
                                  const unitCost = selectedItem ? getItemCostPrice(selectedItem) : 0;
                                  const qty = parseCost(mat.quantity) || 1;
                                  const updated = [...rawMaterials];
                                  updated[mIdx] = { materialId: selectedId, name: selectedItem ? selectedItem.name : "", unitCost, quantity: qty, totalCost: unitCost * qty };
                                  setRawMaterials(updated);
                                  if (!isManualCost) setCostPrice(updated.reduce((sum, item) => sum + (parseCost(item.totalCost) || 0), 0).toFixed(2));
                                }}
                                options={masterMaterialsList.map((m) => ({ value: m.id, label: `${m.name} ($${getItemCostPrice(m).toFixed(2)})` }))}
                                isClearable
                                menuPlacement="auto"
                                menuPosition="fixed"
                                menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
                                maxMenuHeight={280}
                                styles={{
                                  ...customSelectStyles,
                                  valueContainer: (base) => ({ ...base, padding: "0 6px" }),
                                  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                  menu: (base) => ({ ...base, zIndex: 9999, borderRadius: "0.5rem", overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(0,0,0,0.12)" }),
                                  menuList: (base) => ({ ...base, padding: "4px", maxHeight: "280px" }),
                                }}
                              />
                            </div>
                            <div className="col-span-2 flex items-center justify-center">
                              <div className="relative w-full max-w-[80px]">
                                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 price-font pointer-events-none">$</span>
                                <input type="number" step="0.01" min="0" value={mat.unitCost ?? ''} onChange={(e) => { const newUnitCost = parseFloat(e.target.value) || 0; const qty = parseFloat(String((mat as any).quantity ?? 0)) || 0; mat.unitCost = e.target.value; mat.totalCost = (newUnitCost * qty).toFixed(2); setRawMaterials([...rawMaterials]); }} placeholder="0.00" className="w-full pl-4 pr-1 py-0.5 text-xs price-font font-medium text-slate-700 bg-white border border-slate-200 rounded focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f] outline-none text-right" />
                              </div>
                            </div>
                            <div className="col-span-2">
                              <input type="number" step="0.01" min="0" value={mat.quantity} onChange={(e) => { const qty = parseCost(e.target.value); const unitCost = parseCost(mat.unitCost); const updated = [...rawMaterials]; updated[mIdx].quantity = e.target.value; updated[mIdx].totalCost = unitCost * qty; setRawMaterials(updated); if (!isManualCost) setCostPrice(updated.reduce((sum, item) => sum + (parseCost(item.totalCost) || 0), 0).toFixed(2)); }} placeholder="Qty" className="w-full border border-slate-200 rounded px-1 py-1 text-xs price-font text-center outline-none focus:border-[#c2621f]" />
                            </div>
                            <div className="col-span-2 text-center">
                              <span className="text-xs price-font font-bold text-[#1c1917]">${parseCost(mat.totalCost).toFixed(2)}</span>
                            </div>
                            <div className="col-span-1 text-center">
                              <button type="button" onClick={() => { const updated = rawMaterials.filter((_, i) => i !== mIdx); setRawMaterials(updated); if (!isManualCost) setCostPrice(updated.reduce((sum, item) => sum + (parseCost(item.totalCost) || 0), 0).toFixed(2)); }} className="text-slate-300 hover:text-rose-500 p-1 rounded transition"><X size={14} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-600">Total Material Cost:</span>
                        <span className="text-xs price-font font-bold text-[#1c1917]">${calculatedRawCost.toFixed(2)}</span>
                      </div>
                      <label htmlFor="manual_cost_toggle" className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-500">
                        <input type="checkbox" id="manual_cost_toggle" checked={isManualCost} onChange={(e) => { const checked = e.target.checked; setIsManualCost(checked); if (!checked) setCostPrice(calculatedRawCost.toFixed(2)); }} className="w-3.5 h-3.5 text-[#c2621f] rounded border-slate-300 cursor-pointer" />
                        Manual Cost Override
                      </label>
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pricing &amp; Sizes</span>
                      <label htmlFor="has_variants" className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-[#b5541f]">
                        <input type="checkbox" id="has_variants" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} className="w-3.5 h-3.5 text-[#c2621f] rounded border-slate-300 focus:ring-[#c2621f] cursor-pointer" />
                        Has Sizes (e.g. Pizza Sizes)
                      </label>
                    </div>
                    {hasVariants ? (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-slate-400 font-medium">Set price tiers per size. Typing Dine-In auto-fills empty tiers.</span>
                          <button type="button" onClick={() => setVariants([...variants, { size: '', dineIn: '', takeaway: '', delivery: '', waiter: '' }])} className="text-[11px] font-semibold text-[#b5541f] hover:text-[#8a3f16]">+ Add Size</button>
                        </div>
                        <div className="grid grid-cols-12 gap-1.5 px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <span className="col-span-3">Size</span>
                          <span className="col-span-2">Dine-In</span>
                          <span className="col-span-2">Takeaway</span>
                          <span className="col-span-2">Delivery</span>
                          <span className="col-span-2">Waiter</span>
                          <span className="col-span-1 text-center"></span>
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {variants.map((variant, vIdx) => (
                            <div key={vIdx} className="grid grid-cols-12 gap-1.5 items-center bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                              <div className="col-span-3">
                                <input type="text" value={variant.size} onChange={(e) => { const updated = [...variants]; updated[vIdx].size = e.target.value; setVariants(updated); }} placeholder="e.g. Small" className="w-full border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-slate-800 outline-none focus:border-[#c2621f]" />
                              </div>
                              <div className="col-span-2"><input type="number" step="0.01" value={variant.dineIn} onChange={(e) => handleVariantPriceChange(vIdx, 'dineIn', e.target.value)} placeholder="0.00" className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs price-font font-semibold text-[#5c2a0c] focus:border-[#c2621f] bg-[#fdece1]/40 outline-none text-center" /></div>
                              <div className="col-span-2"><input type="number" step="0.01" value={variant.takeaway} onChange={(e) => handleVariantPriceChange(vIdx, 'takeaway', e.target.value)} placeholder="0.00" className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs price-font text-slate-700 focus:border-[#c2621f] outline-none text-center" /></div>
                              <div className="col-span-2"><input type="number" step="0.01" value={variant.delivery} onChange={(e) => handleVariantPriceChange(vIdx, 'delivery', e.target.value)} placeholder="0.00" className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs price-font text-slate-700 focus:border-[#c2621f] outline-none text-center" /></div>
                              <div className="col-span-2"><input type="number" step="0.01" value={variant.waiter} onChange={(e) => handleVariantPriceChange(vIdx, 'waiter', e.target.value)} placeholder="0.00" className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs price-font text-slate-700 focus:border-[#c2621f] outline-none text-center" /></div>
                              <div className="col-span-1 text-center"><button type="button" onClick={() => setVariants(variants.filter((_, i) => i !== vIdx))} className="text-slate-300 hover:text-rose-500 p-1 rounded transition"><X size={14} /></button></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {[
                          { label: 'Dine-In', value: priceDineIn, setter: setPriceDineIn },
                          { label: 'Takeaway', value: priceTakeaway, setter: setPriceTakeaway },
                          { label: 'Delivery', value: priceDelivery, setter: setPriceDelivery },
                          { label: 'Waiter', value: priceWaiter, setter: setPriceWaiter },
                        ].map(({ label, value, setter }) => (
                          <div key={label}>
                            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">{label}</label>
                            <input type="number" step="0.01" value={value} onChange={(e) => setter(e.target.value)} className="w-full border border-slate-200 rounded-md px-2 py-1 text-xs price-font font-medium focus:border-[#c2621f] bg-white outline-none" />
                          </div>
                        ))}
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Cost Price</label>
                          <input type="number" step="0.01" disabled={!isManualCost} value={isManualCost ? costPrice : calculatedRawCost.toFixed(2)} onChange={(e) => setCostPrice(e.target.value)} className={`w-full border rounded-md px-2 py-1 text-xs price-font outline-none ${isManualCost ? 'border-slate-200 bg-white text-slate-800' : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'}`} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* MODIFIER GROUPS SECTION */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-[#1c1917] to-[#33291f]">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#c2621f]/20 flex items-center justify-center">
                          <Sliders size={13} className="text-[#e8ceb8]" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white">Modifier Groups</span>
                          <p className="text-[10px] text-slate-400 leading-tight">Attach customization options to this item</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedModifierIds.length > 0 && (
                          <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-2.5 py-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                            <span className="text-[11px] font-bold text-white">{selectedModifierIds.length} attached</span>
                          </div>
                        )}
                        {selectedModifierIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedModifierIds([])}
                            className="text-[10px] font-semibold text-slate-400 hover:text-rose-300 transition"
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Functional Search Bar for Modifier Groups */}
                    {safeModifierGroups.length > 4 && (
                      <div className="px-3 pt-2.5 pb-1 bg-slate-50 border-b border-slate-200">
                        <div className="relative">
                          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={modifierSearchQuery}
                            onChange={(e) => setModifierSearchQuery(e.target.value)}
                            placeholder="Search modifier groups..."
                            className="w-full pl-7 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]/20"
                          />
                          {modifierSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setModifierSearchQuery('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {filteredModifierGroups.length === 0 ? (
                      <div className="px-4 py-6 text-center bg-slate-50">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
                          <Layers size={18} className="text-slate-300" />
                        </div>
                        <p className="text-xs text-slate-400 font-medium">No modifier groups found</p>
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50/60 max-h-64 overflow-y-auto">
                        {/* Selected Groups Strip */}
                        {selectedModifierIds.length > 0 && (
                          <div className="mb-2.5 flex flex-wrap gap-1.5">
                            {selectedModifierIds.map((id) => {
                              const grp = safeModifierGroups.find((g) => g.id === id);
                              const pIdx = safeModifierGroups.findIndex((g) => g.id === id) % GROUP_PALETTES.length;
                              const palette = GROUP_PALETTES[pIdx];
                              if (!grp) return null;
                              return (
                                <span
                                  key={id}
                                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border ${palette.pillBg} ${palette.pillText} border-transparent`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${palette.dot}`}></span>
                                  {grp.name}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedModifierIds(selectedModifierIds.filter((mid) => mid !== id))}
                                    className="ml-0.5 hover:opacity-60 transition"
                                  >
                                    <X size={10} />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Filtered Modifier Cards */}
                        <div className="grid grid-cols-1 gap-2">
                          {filteredModifierGroups.map((group, gIdx) => {
                            const palette = GROUP_PALETTES[gIdx % GROUP_PALETTES.length];
                            const isChecked = selectedModifierIds.includes(group.id);
                            return (
                              <ModifierGroupCard
                                key={group.id}
                                group={group}
                                palette={palette}
                                isChecked={isChecked}
                                onToggle={(checked) => {
                                  if (checked) setSelectedModifierIds([...selectedModifierIds, group.id]);
                                  else setSelectedModifierIds(selectedModifierIds.filter((id) => id !== group.id));
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {safeModifierGroups.length > 0 && (
                      <div className="px-3.5 py-2 bg-slate-100/70 border-t border-slate-200 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">
                          {safeModifierGroups.length} group{safeModifierGroups.length !== 1 ? 's' : ''} available
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500">
                          {selectedModifierIds.length === 0 ? 'None selected' : `${selectedModifierIds.length} of ${safeModifierGroups.length} selected`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2.5 px-6 py-3 bg-slate-50 border-t border-slate-100 shrink-0">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition">Cancel</button>
                <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#8a3f16] to-[#c2621f] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-[#8a3f16]/25 transition hover:opacity-95">
                  <Plus className="h-4 w-4" />
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox with Responsive Overlay Navigation */}
      {isLightboxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <button type="button" onClick={() => setIsLightboxOpen(false)} className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition z-10"><X size={24} /></button>
          <div className="relative max-w-4xl max-h-[85vh] w-full flex items-center justify-center">
            <img src={lightboxImages[activeImageIdx]} alt={`View ${activeImageIdx + 1}`} className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
            {lightboxImages.length > 1 && (
              <>
                <button type="button" onClick={() => setActiveImageIdx((prev) => (prev === 0 ? lightboxImages.length - 1 : prev - 1))} className="absolute left-2 sm:left-4 p-2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition"><ChevronLeft size={28} /></button>
                <button type="button" onClick={() => setActiveImageIdx((prev) => (prev === lightboxImages.length - 1 ? 0 : prev + 1))} className="absolute right-2 sm:right-4 p-2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition"><ChevronRight size={28} /></button>
              </>
            )}
          </div>
          {lightboxImages.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/90 text-sm font-medium bg-black/40 px-3 py-1 rounded-full border border-white/10">{activeImageIdx + 1} / {lightboxImages.length}</div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(itemToDelete)}
        title="Delete Menu Item"
        message={`Are you sure you want to delete "${itemToDelete?.menuName}"?`}
        confirmLabel="Delete"
        isDanger={true}
        onConfirm={confirmDelete}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
}