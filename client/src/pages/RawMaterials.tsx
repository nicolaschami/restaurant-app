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
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Raw Materials</h1>
          <p className="text-sm text-gray-500">Manage ingredients, stock levels, and costs.</p>
        </div>
        <button
          onClick={handleOpenCreateModal}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-orange-500/20 transition hover:opacity-95"
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
      className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
    />
  </div>
  {error && <p className="text-sm font-medium text-red-600">{error}</p>}
</div>

      {/* Table List */}
      <div className="bg-white rounded-xl shadow border overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wider">
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
              filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{item.code || '-'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-gray-600">{item.unit}</td>
                  <td className="px-4 py-3 text-gray-900">${item.costPrice}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{item.currentStock}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {item.minQty} / {item.maxQty}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.warehouse || '-'}</td>
                  <td className="px-4 py-3 text-right">
  <div className="flex items-center justify-end gap-2">
    <button
      onClick={() => handleOpenEditModal(item)}
      className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-lg transition"
      title="Edit"
    >
      <Pencil className="w-4 h-4" />
    </button>
    <button
      onClick={() => handleDelete(item.id)}
      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded-lg transition"
      title="Delete"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
{/* Modern Modal Overlay */}
{/* Compact Modal Overlay */}
{isModalOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col border border-gray-100">
      
      {/* Header */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-bold">
            📦
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {editingItem ? 'Edit Raw Material' : 'Add New Material'}
            </h2>
            <p className="text-xs text-gray-500">
              Configure inventory items, recipe units, and stock limits
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsModalOpen(false)}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Form Body - Compact Grid */}
      <form id="raw-material-form" onSubmit={handleSave} className="p-5 space-y-3.5">
        
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
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
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
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
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
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              placeholder="RM-001"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Barcode</label>
            <input
              type="text"
              value={barCode}
              onChange={(e) => setBarCode(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              placeholder="123456789"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Brand</label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
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
      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
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
      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
      placeholder="0.00"
    />
  </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Storage Location</label>
            <input
              type="text"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
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
      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
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
      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
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
            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none"
            placeholder="Add optional notes or instructions..."
          />
        </div>

      </form>

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
         className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-orange-500/20 transition hover:opacity-95"
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