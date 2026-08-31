import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Search, Pencil, Trash2, X, LayoutGrid, List, Users, AlertTriangle, CheckSquare, Square } from 'lucide-react';

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

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  action: () => Promise<void> | void;
}

const TABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED'];

export default function TablesPage({ onLogout }: TablesProps) {
  // Data & Global states
  const [items, setItems] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<DiningTable | null>(null);

  // Custom Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    action: () => {},
  });

  // Form states
  const [number, setNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [status, setStatus] = useState('AVAILABLE');
  const [section, setSection] = useState('');
  const [notes, setNotes] = useState('');

  // 1. Fetch Items
  const fetchTables = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/tables');

      const data = res.data?.tables || res.data?.data || res.data;
      const loadedData = Array.isArray(data) ? data : [];
      setItems(loadedData);
      
      // Clean up selection if items changed
      setSelectedIds((prev) => prev.filter((id) => loadedData.some((item: DiningTable) => item.id === id)));
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

  // Filtered List
  const filteredItems = items.filter((item) => {
    const tableNumber = item.number ? item.number.toLowerCase() : '';
    const tableSection = item.section ? item.section.toLowerCase() : '';
    const query = search.toLowerCase();

    return tableNumber.includes(query) || tableSection.includes(query);
  });

  // Selection Logic
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map((item) => item.id));
    }
  };

  const toggleSelectItem = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  // Modal Helpers
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

  // Save / Update Item
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
        await api.put(`/tables/${editingItem.id}`, payload);
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

  // Delete Handlers with Custom Confirmation
  const confirmDeleteSingle = (item: DiningTable) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Dining Table',
      message: `Are you sure you want to delete Table "${item.number}"? This action cannot be undone.`,
      action: () => executeDeleteSingle(item.id),
    });
  };

  const executeDeleteSingle = async (id: number) => {
    try {
      setLoading(true);
      await api.delete(`/tables/${id}`);
      setSelectedIds((prev) => prev.filter((itemId) => itemId !== id));
      fetchTables();
    } catch (err: any) {
      console.error('Delete failed:', err);
      setError(err.response?.data?.message || 'Failed to delete table.');
    } finally {
      setLoading(false);
      setConfirmModal((prev) => ({ ...prev, isOpen: false }));
    }
  };

  const confirmDeleteBulk = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Multiple Tables',
      message: `Are you sure you want to delete ${selectedIds.length} selected table(s)? This action cannot be undone.`,
      action: executeDeleteBulk,
    });
  };

  const executeDeleteBulk = async () => {
    try {
      setLoading(true);
      await Promise.all(selectedIds.map((id) => api.delete(`/tables/${id}`)));
      setSelectedIds([]);
      fetchTables();
    } catch (err: any) {
      console.error('Bulk delete failed:', err);
      setError(err.response?.data?.message || 'Failed to delete selected tables.');
    } finally {
      setLoading(false);
      setConfirmModal((prev) => ({ ...prev, isOpen: false }));
    }
  };

  // Helpers for Status Styling
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

  const getStatusStripe = (statusStr: string) => {
    switch (statusStr?.toUpperCase()) {
      case 'AVAILABLE':
        return 'from-emerald-500 to-emerald-400';
      case 'OCCUPIED':
        return 'from-amber-500 to-amber-400';
      case 'RESERVED':
        return 'from-blue-500 to-blue-400';
      default:
        return 'from-[#8a3f16] to-[#c2621f]';
    }
  };

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

      {/* Contextual Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-[#1c1917] text-white px-4 py-3 rounded-xl shadow-lg border-l-4 border-[#c2621f]">
          <div className="flex items-center gap-2 text-xs">
            <span className="price-font bg-[#c2621f] px-2 py-0.5 rounded font-bold text-white">
              {selectedIds.length}
            </span>
            <span>table(s) selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs transition"
            >
              Deselect All
            </button>
            <button
              onClick={confirmDeleteBulk}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition shadow-sm"
            >
              <Trash2 size={14} />
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Search Bar + View Toggle & Error Notice */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by table number or floor section..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/40 focus:border-[#c2621f] transition"
            />
          </div>
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 self-start sm:self-auto">
            <button
              onClick={() => setViewMode('cards')}
              title="Card View"
              className={`p-2 rounded-lg transition ${
                viewMode === 'cards' ? 'bg-white text-[#b5541f] shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Table View"
              className={`p-2 rounded-lg transition ${
                viewMode === 'table' ? 'bg-white text-[#b5541f] shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <List size={18} />
            </button>
          </div>
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </div>

      {/* Table / Card List */}
      <div className="bg-white rounded-xl shadow border overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="text-center py-12 text-gray-500">Loading tables...</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No dining tables found.</div>
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#1c1917] text-[11px] font-semibold text-[#d8c6b0] uppercase tracking-wider">
                  <th className="px-4 py-3 w-10 text-center">
                    <button onClick={toggleSelectAll} className="text-[#d8c6b0] hover:text-white">
                      {selectedIds.length > 0 && selectedIds.length === filteredItems.length ? (
                        <CheckSquare size={16} />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3">Table No.</th>
                  <th className="px-4 py-3">Section</th>
                  <th className="px-4 py-3">Capacity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {filteredItems.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-amber-50/60' : 'hover:bg-[#faf3ea]'
                      }`}
                    >
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleSelectItem(item.id)}
                          className="text-slate-400 hover:text-[#c2621f]"
                        >
                          {isSelected ? (
                            <CheckSquare size={16} className="text-[#c2621f]" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </td>
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
                            onClick={() => confirmDeleteSingle(item)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 bg-[#faf8f4]">
            {filteredItems.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border transition-all overflow-hidden flex flex-col relative ${
                    isSelected ? 'ring-2 ring-[#c2621f] border-transparent shadow-md' : 'border-slate-200 shadow-sm hover:shadow-md'
                  }`}
                >
                  <div className={`h-1 w-full bg-gradient-to-r ${getStatusStripe(item.status || 'AVAILABLE')}`} />
                  <div className="p-4 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleSelectItem(item.id)}
                          className="text-slate-400 hover:text-[#c2621f] transition"
                        >
                          {isSelected ? (
                            <CheckSquare size={18} className="text-[#c2621f]" />
                          ) : (
                            <Square size={18} />
                          )}
                        </button>
                        <div>
                          <h4 className="price-font text-lg font-bold text-slate-900 leading-none">T{item.number}</h4>
                          <span className="text-[11px] text-slate-400 mt-1 block">{item.section || 'Main Floor'}</span>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-wider border shrink-0 ${getStatusBadge(
                          item.status || 'AVAILABLE'
                        )}`}
                      >
                        {item.status || 'AVAILABLE'}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                      <Users size={13} className="text-slate-400" />
                      <span className="price-font">{item.capacity || 0}</span> seats
                    </div>

                    {item.notes && (
                      <p className="mt-2 text-[11px] text-slate-400 italic line-clamp-2">{item.notes}</p>
                    )}
                  </div>

                  <div className="ticket-tear-line mx-4" />
                  <div className="px-4 py-2.5 flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleOpenEditModal(item)}
                      className="p-1.5 text-slate-400 hover:text-[#b5541f] hover:bg-[#fdece1] rounded-lg transition"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => confirmDeleteSingle(item)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && filteredItems.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-500 flex items-center justify-between">
            <div>
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
            {selectedIds.length > 0 && (
              <span className="text-slate-600 font-medium">
                {selectedIds.length} item(s) selected
              </span>
            )}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col border border-gray-100">
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

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-100">
            <div className="px-6 py-4 bg-[#1c1917] border-b-2 border-red-500 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="ticket-font uppercase text-lg leading-none text-white">
                    {confirmModal.title}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-600 leading-relaxed">
                {confirmModal.message}
              </p>
            </div>

            <div className="ticket-tear-line mx-5" />

            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 bg-white hover:bg-gray-100 transition shadow-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmModal.action()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-red-600/25 transition hover:bg-red-700"
              >
                <Trash2 size={14} />
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}