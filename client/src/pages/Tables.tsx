import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Search, Pencil, Trash2, X } from 'lucide-react';

// --- Types ---
export interface DiningTable {
  id: number;
  restaurantId?: number;
  number: string;
  capacity?: number | string;
  status?: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | string;
  section?: string | null;
  notes?: string | null;
  createdAt?: string;
}

interface TablesProps {
  onLogout?: () => void;
}

const TABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED'];

export default function TablesPage({ onLogout }: TablesProps) {
  // Data & Global states
  const [items, setItems] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<DiningTable | null>(null);

  // Form states
  const [number, setNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [status, setStatus] = useState('AVAILABLE');
  const [section, setSection] = useState('');
  const [notes, setNotes] = useState('');

  // 1. Fetch Items safely handling API paths and error payloads
  const fetchTables = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/tables');
      
      // Handle standard array responses or nested object structures seamlessly
      const data = res.data?.tables || res.data?.data || res.data;
      setItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Fetch tables failed:', err);
      if (err.response?.status === 401) {
        if (onLogout) {
          onLogout();
        } else {
          setError('Session expired. Please log in again.');
        }
      } else {
        setError(
          err.response?.data?.message || 
          'Could not load dining tables. Check server connection.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  // 2. Reset & Open Modal Helpers
  const resetForm = () => {
    setEditingItem(null);
    setNumber('');
    setCapacity('4');
    setStatus('AVAILABLE');
    setSection('');
    setNotes('');
  };

  const handleOpenCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: DiningTable) => {
    setEditingItem(item);
    setNumber(item.number || '');
    setCapacity(String(item.capacity ?? '4'));
    setStatus(item.status || 'AVAILABLE');
    setSection(item.section || '');
    setNotes(item.notes || '');
    setIsModalOpen(true);
  };

  // 3. Save / Update Item
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);

      const payload = {
        number,
        capacity: Number(capacity) || 0,
        status,
        section: section || null,
        notes: notes || null,
      };

      if (editingItem) {
        await api.patch(`/tables/${editingItem.id}`, payload);
      } else {
        await api.post('/tables', payload);
      }

      setIsModalOpen(false);
      resetForm();
      fetchTables();
    } catch (err: any) {
      console.error('Save failed:', err);
      setError(err.response?.data?.message || 'Failed to save table details.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Delete Item
  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this table?')) return;
    try {
      setLoading(true);
      await api.delete(`/tables/${id}`);
      fetchTables();
    } catch (err: any) {
      console.error('Delete failed:', err);
      setError(err.response?.data?.message || 'Failed to delete table.');
    } finally {
      setLoading(false);
    }
  };

  // Helper for status badge styles
  const getStatusBadge = (statusStr: string) => {
    switch (statusStr?.toUpperCase()) {
      case 'AVAILABLE':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'OCCUPIED':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'RESERVED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  // Filtered List with safety checks against null/undefined values
  const filteredItems = items.filter((item) => {
    const tableNumber = item.number ? item.number.toLowerCase() : '';
    const tableSection = item.section ? item.section.toLowerCase() : '';
    const query = search.toLowerCase();

    return tableNumber.includes(query) || tableSection.includes(query);
  });

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
          <h1 className="ticket-font uppercase text-2xl sm:text-3xl leading-none text-[#1c1917]">Dining Tables</h1>
          <p className="text-sm text-gray-500 mt-2">Manage floor layout, table capacity, and real-time status.</p>
        </div>
        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#8a3f16] to-[#c2621f] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-[#8a3f16]/25 transition hover:opacity-95"
        >
          + Add Table
        </button>
      </div>

      {/* Full-width Search Bar & Error Notice */}
      <div className="space-y-2">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by table number or floor section..."
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
              <th className="px-4 py-3">Table No.</th>
              <th className="px-4 py-3">Section</th>
              <th className="px-4 py-3">Capacity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-sm">
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-6 text-gray-500">
                  Loading tables...
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-6 text-gray-500">
                  No dining tables found.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-[#faf3ea] transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900 price-font">{item.number}</td>
                  <td className="px-4 py-3 text-gray-600">{item.section || 'Main Floor'}</td>
                  <td className="px-4 py-3 text-gray-600 price-font">{item.capacity || 0} Seats</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border ${getStatusBadge(
                        item.status || 'AVAILABLE'
                      )}`}
                    >
                      {item.status || 'AVAILABLE'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 truncate max-w-xs">{item.notes || '-'}</td>
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
              ))
            )}
          </tbody>
        </table>
        {!loading && filteredItems.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-500">
            {search ? (
              <>
                Showing <span className="price-font font-semibold text-[#1c1917]">{filteredItems.length}</span> of{' '}
                <span className="price-font font-semibold text-[#1c1917]">{items.length}</span> tables
              </>
            ) : (
              <>
                <span className="price-font font-semibold text-[#1c1917]">{items.length}</span> tables total
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col border border-gray-100">
            {/* Header */}
            <div className="px-6 py-4 bg-[#1c1917] border-b-2 border-[#c2621f] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-8 rounded-full bg-gradient-to-b from-[#c2621f] to-[#8a3f16]"></div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#c2621f] leading-none mb-1">
                    Layout
                  </p>
                  <h2 className="ticket-font uppercase text-xl leading-none text-white">
                    {editingItem ? 'Edit Table' : 'New Table'}
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-1.5">Manage floor setup and capacity bounds</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form id="table-form" onSubmit={handleSave} className="p-5 space-y-3.5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Table Number / Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm price-font bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
                    placeholder="e.g. T-01"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Seating Capacity</label>
                  <input
                    type="number"
                    min="1"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm price-font bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
                    placeholder="4"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Section / Area</label>
                  <input
                    type="text"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
                    placeholder="e.g. Patio, Main Hall"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
                  >
                    {TABLE_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition resize-none"
                  placeholder="Near window, booth seating, etc."
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
                form="table-form"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#8a3f16] to-[#c2621f] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-[#8a3f16]/25 transition hover:opacity-95"
              >
                {editingItem ? 'Update Table' : 'Save Table'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}