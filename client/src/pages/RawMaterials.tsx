import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Search, Pencil, Trash2, X } from 'lucide-react';
// --- Types ---
export interface RawMaterial {
  id: number;
  restaurantId: number;
  code?: string | null;
  barCode?: string | null;
  name: string;
  categoryId?: number | null;
  supplierId?: number | null;
  brand?: string | null;
  unit: string;
  costPrice: string;
  lastPurchasePrice?: string | null;
  currencyCode?: string;
  currentStock: string;
  minQty: string;
  maxQty: string;
  hasTva?: boolean;
  warehouse?: string | null;
  notes?: string | null;
  createdAt?: string;
}

interface RawMaterialsProps {
  onLogout?: () => void;
}

const COMMON_UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'can', 'pack'];

export default function RawMaterialsPage({ onLogout = () => {} }: RawMaterialsProps) {
  // Data & Global states
  const [items, setItems] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<RawMaterial | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [barCode, setBarCode] = useState('');
  const [brand, setBrand] = useState('');
  const [unit, setUnit] = useState('kg');
  const [costPrice, setCostPrice] = useState('0.0000');
  const [currentStock, setCurrentStock] = useState('0.000');
  const [minQty, setMinQty] = useState('0.000');
  const [maxQty, setMaxQty] = useState('0.000');
  const [warehouse, setWarehouse] = useState('');
  const [notes, setNotes] = useState('');

  // 1. Fetch Items
  const fetchRawMaterials = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/raw-materials');
      setItems(res.data.rawMaterials || res.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        onLogout?.();
      } else {
        setError('Could not load raw materials. Check server connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRawMaterials();
  }, []);

  // 2. Reset & Open Modal Helpers
  const resetForm = () => {
    setEditingItem(null);
    setName('');
    setCode('');
    setBarCode('');
    setBrand('');
    setUnit('kg');
    setCostPrice('0.0000');
    setCurrentStock('0.000');
    setMinQty('0.000');
    setMaxQty('0.000');
    setWarehouse('');
    setNotes('');
  };

  const handleOpenCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: RawMaterial) => {
    setEditingItem(item);
    setName(item.name || '');
    setCode(item.code || '');
    setBarCode(item.barCode || '');
    setBrand(item.brand || '');
    setUnit(item.unit || 'kg');
    setCostPrice(item.costPrice || '0.0000');
    setCurrentStock(item.currentStock || '0.000');
    setMinQty(item.minQty || '0.000');
    setMaxQty(item.maxQty || '0.000');
    setWarehouse(item.warehouse || '');
    setNotes(item.notes || '');
    setIsModalOpen(true);
  };

  // 3. Save / Update Item
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);

      const cleanNumber = (val: string) => (val ? val.replace(',', '.') : '0');

      const payload = {
        name,
        code: code || null,
        barCode: barCode || null,
        brand: brand || null,
        unit,
        costPrice: cleanNumber(costPrice),
        currentStock: cleanNumber(currentStock),
        minQty: cleanNumber(minQty),
        maxQty: cleanNumber(maxQty),
        warehouse: warehouse || null,
        notes: notes || null,
      };

      if (editingItem) {
        await api.put(`/raw-materials/${editingItem.id}`, payload);
      } else {
        await api.post('/raw-materials', payload);
      }

      setIsModalOpen(false);
      resetForm();
      fetchRawMaterials();
    } catch (err: any) {
      console.error('Save failed:', err);
      setError('Failed to save raw material.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Delete Item
  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this raw material?')) return;
    try {
      setLoading(true);
      await api.delete(`/raw-materials/${id}`);
      fetchRawMaterials();
    } catch (err: any) {
      console.error('Delete failed:', err);
      setError('Failed to delete raw material.');
    } finally {
      setLoading(false);
    }
  };

  // Filtered List
  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.code && item.code.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@500;600;700&display=swap');
        .ticket-font { font-family: 'Bebas Neue', 'Arial Narrow', sans-serif; letter-spacing: 0.05em; }
        .price-font { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .ticket-tear-line {
          background-image: repeating-linear-gradient(90deg, #d6d3d1 0 5px, transparent 5px 11px);
          height: 1px;
        }
      `}</style>

      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="ticket-font uppercase text-2xl sm:text-3xl leading-none text-[#1c1917]">Raw Materials</h1>
          <p className="text-sm text-gray-500 mt-2">Manage ingredients, stock levels, and costs.</p>
        </div>
        <button
          onClick={handleOpenCreateModal}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#8a3f16] to-[#c2621f] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-[#8a3f16]/25 transition hover:opacity-95"
          >
          + Add Material
        </button>
      </div>

 {/* Full-width Search Bar & Error Notice */}
<div className="space-y-2">
  <div className="relative w-full">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
    <input
      type="text"
      placeholder="Search materials or codes..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/40 focus:border-[#c2621f] transition"
    />
  </div>
  {error && <p className="text-sm font-medium text-red-600">{error}</p>}
</div>

      {/* Table List */}
      <div className="bg-white rounded-xl shadow border overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#1c1917] text-[11px] font-semibold text-[#d8c6b0] uppercase tracking-wider">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Cost Price</th>
              <th className="px-4 py-3">Current Stock</th>
              <th className="px-4 py-3">Min / Max Qty</th>
              <th className="px-4 py-3">Warehouse</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-sm">
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-6 text-gray-500">
                  Loading materials...
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-6 text-gray-500">
                  No raw materials found.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const stockNum = Number(item.currentStock);
                const minNum = Number(item.minQty);
                const isLow = !isNaN(stockNum) && !isNaN(minNum) && minNum > 0 && stockNum <= minNum;
                return (
                <tr key={item.id} className="hover:bg-[#faf3ea] transition-colors">
                  <td className="px-4 py-3 text-gray-600 price-font">{item.code || '-'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-gray-600">{item.unit}</td>
                  <td className="px-4 py-3 text-[#1c1917] price-font font-semibold">${item.costPrice}</td>
                  <td className="px-4 py-3 price-font font-semibold">
                    <span className={isLow ? 'text-red-600' : 'text-gray-900'}>{item.currentStock}</span>
                    {isLow && (
                      <span className="ml-2 inline-flex items-center text-[9px] font-bold uppercase tracking-wide text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                        Low
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 price-font">
                    {item.minQty} / {item.maxQty}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.warehouse || '-'}</td>
                  <td className="px-4 py-3 text-right">
  <div className="flex items-center justify-end gap-2">
    <button
      onClick={() => handleOpenEditModal(item)}
      className="p-1.5 text-gray-500 hover:text-[#b5541f] hover:bg-[#fdece1] rounded-lg transition"
      title="Edit"
    >
      <Pencil className="w-4 h-4" />
    </button>
    <button
      onClick={() => handleDelete(item.id)}
      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
      title="Delete"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
</td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
        {!loading && filteredItems.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-500">
            {search ? (
              <>Showing <span className="price-font font-semibold text-[#1c1917]">{filteredItems.length}</span> of{' '}
              <span className="price-font font-semibold text-[#1c1917]">{items.length}</span> materials</>
            ) : (
              <><span className="price-font font-semibold text-[#1c1917]">{items.length}</span> materials total</>
            )}
          </div>
        )}
      </div>
{/* Modern Modal Overlay */}
{/* Compact Modal Overlay */}
{isModalOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col border border-gray-100">
      
      {/* Header */}
      <div className="px-6 py-4 bg-[#1c1917] border-b-2 border-[#c2621f] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-8 rounded-full bg-gradient-to-b from-[#c2621f] to-[#8a3f16]"></div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#c2621f] leading-none mb-1">Inventory</p>
            <h2 className="ticket-font uppercase text-xl leading-none text-white">
              {editingItem ? 'Edit Material' : 'New Material'}
            </h2>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Configure inventory items, recipe units, and stock limits
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsModalOpen(false)}
          className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Form Body - Compact Grid */}
      <form id="raw-material-form" onSubmit={handleSave} className="p-5 space-y-3.5 overflow-y-auto">
        
        {/* Row 1: Name (Spans 2 cols) & Recipe Unit */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Ingredient Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
              placeholder="e.g. Mozzarella Cheese"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Recipe Unit <span className="text-red-500">*</span>
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
            >
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Code, Barcode, Brand */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Code / SKU</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm price-font bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
              placeholder="RM-001"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Barcode</label>
            <input
              type="text"
              value={barCode}
              onChange={(e) => setBarCode(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm price-font bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
              placeholder="123456789"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Brand</label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
              placeholder="Brand Name"
            />
          </div>
        </div>

        {/* Row 3: Cost Price, Current Stock, Warehouse */}
        <div className="grid grid-cols-3 gap-3">
          <div>
    <label className="block text-xs font-semibold text-gray-700 mb-1">Cost Price ($)</label>
    <input
      type="number"
      step="any"
      min="0"
      value={costPrice}
      onChange={(e) => setCostPrice(e.target.value)}
      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm price-font bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
      placeholder="0.00"
    />
  </div>

        <div>
    <label className="block text-xs font-semibold text-gray-700 mb-1">Current Stock</label>
    <input
      type="number"
      step="any"
      min="0"
      value={currentStock}
      onChange={(e) => setCurrentStock(e.target.value)}
      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm price-font bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
      placeholder="0.00"
    />
  </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Storage Location</label>
            <input
              type="text"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
              placeholder="Main Pantry"
            />
          </div>
        </div>

        {/* Row 4: Min Qty & Max Qty */}
        <div className="grid grid-cols-2 gap-3">
         <div>
    <label className="block text-xs font-semibold text-gray-700 mb-1">Min Qty (Low Alert)</label>
    <input
      type="number"
      step="any"
      min="0"
      value={minQty}
      onChange={(e) => setMinQty(e.target.value)}
      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm price-font bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
      placeholder="0.00"
    />
  </div>

        <div>
    <label className="block text-xs font-semibold text-gray-700 mb-1">Max Qty (Capacity)</label>
    <input
      type="number"
      step="any"
      min="0"
      value={maxQty}
      onChange={(e) => setMaxQty(e.target.value)}
      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm price-font bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
      placeholder="0.00"
    />
  </div>
        </div>

        {/* Row 5: Notes */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition resize-none"
            placeholder="Add optional notes or instructions..."
          />
        </div>

      </form>

      <div className="ticket-tear-line mx-5" />

      {/* Footer */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => setIsModalOpen(false)}
          className="px-4 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 bg-white hover:bg-gray-100 transition shadow-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          form="raw-material-form"
         className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#8a3f16] to-[#c2621f] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-[#8a3f16]/25 transition hover:opacity-95"
          >
          {editingItem ? 'Update Material' : 'Save Material'}
        </button>
      </div>

    </div>
  </div>
)}
    
    </div>
  );
}
