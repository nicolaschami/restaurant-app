import React, { useState, useEffect } from 'react';
import { api } from '../api';
import {
  Search,
  Pencil,
  Trash2,
  X,
  LayoutGrid,
  List,
  Users,
  AlertTriangle,
  CheckSquare,
  Square,
  CheckCircle2,
  Clock,
  UserCheck,
  Filter,
  MoreVertical,
  Layers,
  Sparkles
} from 'lucide-react';

// --- Types ---
export interface DiningTable {
  id: number;
  restaurantId?: number;
  number: string;
  capacity?: number | string;
  status?: 'FREE' | 'OCCUPIED' | 'RESERVED' | string;
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

const TABLE_STATUSES = ['FREE', 'OCCUPIED', 'RESERVED'] as const;

export default function TablesPage({ onLogout }: TablesProps) {
  // Data & Global states
  const [items, setItems] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [quickStatusMenuId, setQuickStatusMenuId] = useState<number | null>(null);

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
  const [status, setStatus] = useState('FREE');
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

  // Filtered List based on Search & Status Filter
 
  // Updated Filtered List logic
const filteredItems = items.filter((item) => {
  const rawNumber = item.number ? item.number.toLowerCase() : '';
  // Construct the full formatted string as shown in the UI (e.g., "t-01" or "t-1")
  const formattedNumber = `t-${rawNumber}`; 
  const tableSection = item.section ? item.section.toLowerCase() : '';
  
  // Clean user query by trimming whitespace
  const query = search.toLowerCase().trim();

  // Match against raw number ("1"), formatted number ("t-1"), or section ("main floor")
  const matchesSearch =
    rawNumber.includes(query) ||
    formattedNumber.includes(query) ||
    tableSection.includes(query);

  const matchesStatus =
    statusFilter === 'ALL' ||
    (item.status || 'AVAILABLE').toUpperCase() === statusFilter;

  return matchesSearch && matchesStatus;
});

  // Counts for Header Status Pills
  const statusCounts = {
    ALL: items.length,
    FREE: items.filter((i) => (i.status || 'FREE').toUpperCase() === 'FREE').length,
    OCCUPIED: items.filter((i) => (i.status || '').toUpperCase() === 'OCCUPIED').length,
    RESERVED: items.filter((i) => (i.status || '').toUpperCase() === 'RESERVED').length,
  };

  // Quick Inline Status Update
  const handleQuickStatusChange = async (tableId: number, newStatus: string) => {
    try {
      const targetItem = items.find((i) => i.id === tableId);
      if (!targetItem) return;

      const payload = {
        ...targetItem,
        status: newStatus,
      };

      // Optimistic state update
      setItems((prev) => prev.map((item) => (item.id === tableId ? { ...item, status: newStatus } : item)));
      setQuickStatusMenuId(null);

      await api.put(`/tables/${tableId}`, payload);
    } catch (err: any) {
      console.error('Quick status change failed:', err);
      setError('Could not update table status.');
      fetchTables(); // Revert on failure
    }
  };

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
    setStatus('FREE');
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
    setStatus(item.status || 'FREE');
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

  // Delete Handlers
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

  // Status Styling Configuration
  const getStatusConfig = (statusStr?: string) => {
    switch (statusStr?.toUpperCase()) {
      case 'FREE':
        return {
          badge: 'bg-emerald-50 text-emerald-700 border-emerald-300/60 ring-1 ring-emerald-500/10',
          stripe: 'from-emerald-500 to-teal-400',
          cardBg: 'bg-gradient-to-b from-emerald-50/30 to-white',
          borderHighlight: 'border-emerald-300 hover:border-emerald-500',
          indicator: 'bg-emerald-500',
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
          label: 'FREE',
        };
      case 'OCCUPIED':
        return {
          badge: 'bg-rose-50 text-rose-700 border-rose-300/60 ring-1 ring-rose-500/10',
          stripe: 'from-rose-500 to-amber-500',
          cardBg: 'bg-gradient-to-b from-rose-50/30 to-white',
          borderHighlight: 'border-rose-300 hover:border-rose-500',
          indicator: 'bg-rose-500 animate-pulse',
          icon: <UserCheck className="w-3.5 h-3.5 text-rose-600" />,
          label: 'OCCUPIED',
        };
      case 'RESERVED':
        return {
          badge: 'bg-amber-50 text-amber-700 border-amber-300/60 ring-1 ring-amber-500/10',
          stripe: 'from-amber-500 to-orange-400',
          cardBg: 'bg-gradient-to-b from-amber-50/30 to-white',
          borderHighlight: 'border-amber-300 hover:border-amber-500',
          indicator: 'bg-amber-500',
          icon: <Clock className="w-3.5 h-3.5 text-amber-600" />,
          label: 'RESERVED',
        };
      default:
        return {
          badge: 'bg-slate-50 text-slate-700 border-slate-200',
          stripe: 'from-slate-400 to-slate-500',
          cardBg: 'bg-white',
          borderHighlight: 'border-slate-200',
          indicator: 'bg-slate-400',
          icon: null,
          label: statusStr || 'UNKNOWN',
        };
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
          <div className="flex items-center gap-2">
            <h1 className="ticket-font uppercase text-2xl sm:text-3xl leading-none text-[#1c1917]">
              Dining Floor Layout
            </h1>
            <span className="bg-amber-100 text-[#8a3f16] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-amber-300/60">
              <Sparkles size={11} /> Live Floor
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Monitor real-time table availability, customer seating, and floor sections.
          </p>
        </div>
        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#8a3f16] to-[#c2621f] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-[#8a3f16]/25 transition hover:opacity-95"
        >
          + Add New Table
        </button>
      </div>

      {/* Live Operational Status Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'ALL', label: 'All Tables', count: statusCounts.ALL, activeClass: 'border-[#c2621f] bg-stone-900 text-white shadow-md' },
          { key: 'FREE', label: 'FREE', count: statusCounts.FREE, activeClass: 'border-emerald-500 bg-emerald-600 text-white shadow-md shadow-emerald-500/20' },
          { key: 'OCCUPIED', label: 'Occupied', count: statusCounts.OCCUPIED, activeClass: 'border-rose-500 bg-rose-600 text-white shadow-md shadow-rose-500/20' },
          { key: 'RESERVED', label: 'Reserved', count: statusCounts.RESERVED, activeClass: 'border-amber-500 bg-amber-600 text-white shadow-md shadow-amber-500/20' },
        ].map((btn) => {
          const isActive = statusFilter === btn.key;
          return (
            <button
              key={btn.key}
              onClick={() => setStatusFilter(btn.key)}
              className={`p-3 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between ${
                isActive
                  ? btn.activeClass
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50/80 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                  {btn.label}
                </span>
                {btn.key !== 'ALL' && (
                  <span
                    className={`w-2 h-2 rounded-full ${
                      btn.key === 'FREE'
                        ? 'bg-emerald-400'
                        : btn.key === 'OCCUPIED'
                        ? 'bg-rose-400'
                        : 'bg-amber-400'
                    }`}
                  />
                )}
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="price-font text-2xl font-black">{btn.count}</span>
                <span className="text-[10px] opacity-75 font-medium">
                  {Math.round((btn.count / (items.length || 1)) * 100)}%
                </span>
              </div>
            </button>
          );
        })}
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
              placeholder="Search by table number (e.g. T-01) or floor section..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/40 focus:border-[#c2621f] transition"
            />
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 self-start sm:self-auto">
            <button
              onClick={() => setViewMode('cards')}
              title="Card Floor View"
              className={`p-2 rounded-lg transition flex items-center gap-1.5 text-xs font-medium ${
                viewMode === 'cards'
                  ? 'bg-white text-[#b5541f] shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutGrid size={16} /> Grid
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Data Table View"
              className={`p-2 rounded-lg transition flex items-center gap-1.5 text-xs font-medium ${
                viewMode === 'table'
                  ? 'bg-white text-[#b5541f] shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <List size={16} /> List
            </button>
          </div>
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </div>

      {/* Table / Card Container */}
      <div className="bg-white rounded-xl shadow border border-slate-200/80 overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-amber-600 border-r-transparent mb-3"></div>
            <p className="text-sm font-medium">Syncing dining floor tables...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Filter className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-base font-semibold text-slate-700">No tables found</p>
            <p className="text-xs text-slate-400 mt-1">
              Try modifying your search or switching status filters above.
            </p>
          </div>
        ) : viewMode === 'table' ? (
          /* LIST VIEW */
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
                  <th className="px-4 py-3">Floor Section</th>
                  <th className="px-4 py-3">Capacity</th>
                  <th className="px-4 py-3">Live Status</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {filteredItems.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  const statusCfg = getStatusConfig(item.status);
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
                      <td className="px-4 py-3 font-bold text-gray-900 price-font text-base">
                        T-{item.number}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-medium">
                        {item.section || 'Main Floor'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 price-font">
                        <span className="inline-flex items-center gap-1.5">
                          <Users size={14} className="text-slate-400" />
                          {item.capacity || 0} Seats
                        </span>
                      </td>
                      <td className="px-4 py-3 relative">
                        <div className="inline-block">
                          <button
                            onClick={() =>
                              setQuickStatusMenuId(quickStatusMenuId === item.id ? null : item.id)
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wider border cursor-pointer hover:opacity-80 transition ${statusCfg.badge}`}
                          >
                            {statusCfg.icon}
                            {statusCfg.label}
                          </button>

                          {/* Quick Status Toggle Dropdown */}
                          {quickStatusMenuId === item.id && (
                            <div className="absolute left-0 mt-1 z-30 w-36 bg-white rounded-xl shadow-xl border border-slate-200 py-1">
                              {TABLE_STATUSES.map((st) => (
                                <button
                                  key={st}
                                  onClick={() => handleQuickStatusChange(item.id, st)}
                                  className="w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      st === 'FREE'
                                        ? 'bg-emerald-500'
                                        : st === 'OCCUPIED'
                                        ? 'bg-rose-500'
                                        : 'bg-amber-500'
                                    }`}
                                  />
                                  {st}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 truncate max-w-xs">{item.notes || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 text-gray-500 hover:text-[#b5541f] hover:bg-[#fdece1] rounded-lg transition"
                            title="Edit Table"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => confirmDeleteSingle(item)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            title="Delete Table"
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
          /* GRID CARD VIEW */
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 bg-[#faf8f4]">
            {filteredItems.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              const statusCfg = getStatusConfig(item.status);

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col relative shadow-sm hover:shadow-md ${
                    statusCfg.cardBg
                  } ${statusCfg.borderHighlight} ${
                    isSelected ? 'ring-2 ring-[#c2621f] border-transparent shadow-md' : ''
                  }`}
                >
                  {/* Top Status Gradient Bar */}
                  <div className={`h-1.5 w-full bg-gradient-to-r ${statusCfg.stripe}`} />

                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      {/* Header row inside card */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
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
                            <h4 className="price-font text-xl font-black text-slate-900 leading-none">
                              T-{item.number}
                            </h4>
                            <span className="text-[11px] font-medium text-slate-500 mt-1 flex items-center gap-1">
                              <Layers size={11} className="text-slate-400" />
                              {item.section || 'Main Floor'}
                            </span>
                          </div>
                        </div>

                        {/* Interactive Status Badge Button */}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setQuickStatusMenuId(
                                quickStatusMenuId === item.id ? null : item.id
                              )
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-extrabold tracking-wider border shrink-0 transition ${statusCfg.badge}`}
                            title="Click to change status"
                          >
                            {statusCfg.icon}
                            {statusCfg.label}
                          </button>

                          {/* Inline Dropdown for Quick Status Shift */}
                          {quickStatusMenuId === item.id && (
                            <div className="absolute right-0 mt-1 z-30 w-36 bg-white rounded-xl shadow-2xl border border-slate-200 py-1">
                              <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                Set Status
                              </div>
                              {TABLE_STATUSES.map((st) => (
                                <button
                                  key={st}
                                  onClick={() => handleQuickStatusChange(item.id, st)}
                                  className="w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      st === 'FREE'
                                        ? 'bg-emerald-500'
                                        : st === 'OCCUPIED'
                                        ? 'bg-rose-500'
                                        : 'bg-amber-500'
                                    }`}
                                  />
                                  {st}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Seating Capacity */}
                      <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100/70 px-2.5 py-1.5 rounded-lg w-fit">
                        <Users size={14} className="text-slate-500" />
                        <span className="price-font font-bold">{item.capacity || 0}</span> Seats
                      </div>

                      {/* Notes Section */}
                      {item.notes && (
                        <p className="mt-2.5 text-[11px] text-slate-500 italic line-clamp-2 bg-white/60 p-2 rounded-lg border border-slate-100">
                          "{item.notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom Tear Line */}
                  <div className="ticket-tear-line mx-4" />

                  {/* Actions Footer */}
                  <div className="px-4 py-2.5 bg-white/40 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-mono">
                      ID: #{item.id}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditModal(item)}
                        className="p-1.5 text-slate-400 hover:text-[#b5541f] hover:bg-[#fdece1] rounded-lg transition"
                        title="Edit Table"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => confirmDeleteSingle(item)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="Delete Table"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer Summary Bar */}
        {!loading && filteredItems.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-500 flex items-center justify-between">
            <div>
              Showing <span className="price-font font-semibold text-[#1c1917]">{filteredItems.length}</span> of{' '}
              <span className="price-font font-semibold text-[#1c1917]">{items.length}</span> total dining tables
            </div>
            {selectedIds.length > 0 && (
              <span className="text-slate-600 font-medium">
                {selectedIds.length} item(s) selected
              </span>
            )}
          </div>
        )}
      </div>

      {/* Form Modal (Create / Edit) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col border border-gray-100">
            <div className="px-6 py-4 bg-[#1c1917] border-b-2 border-[#c2621f] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-8 rounded-full bg-gradient-to-b from-[#c2621f] to-[#8a3f16]"></div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#c2621f] leading-none mb-1">
                    Floor Setup
                  </p>
                  <h2 className="ticket-font uppercase text-xl leading-none text-white">
                    {editingItem ? 'Edit Dining Table' : 'Add New Table'}
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
                    placeholder="e.g. 01 or T-12"
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
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Floor Section / Area</label>
                  <input
                    type="text"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition"
                    placeholder="e.g. Main Hall, Patio, VIP"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Initial Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition font-medium"
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
                <label className="block text-xs font-semibold text-gray-700 mb-1">Notes / Preferences</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/20 focus:border-[#c2621f] transition resize-none"
                  placeholder="e.g. Near window, high chair accessible, booth"
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