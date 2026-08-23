import React, { useState, useEffect, type FormEvent } from 'react';
import {
  Plus,
  Search,
  X,
  AlertCircle,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Layers,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

import { api } from '../api';
import ConfirmModal from '../components/ConfirmModal';

interface ModifierOption {
  id?: number;
  name: string;
  price: number | string;
  priceAdjustment?: number | string;
}

interface ModifierGroup {
  id: number;
  name: string;
  minSelection: number;
  maxSelection: number;
  isRequired?: boolean;
  options: ModifierOption[];
}

interface ModifiersProps {
  onLogout: () => void;
}

export default function Modifiers({ onLogout }: ModifiersProps) {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Layout View Mode
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Filtering & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Modal Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Group Form Fields
  const [groupName, setGroupName] = useState('');
  const [minSelection, setMinSelection] = useState<number>(0);
  const [maxSelection, setMaxSelection] = useState<number>(1);
  const [isRequired, setIsRequired] = useState(false);
  const [options, setOptions] = useState<ModifierOption[]>([]);

  // Temp input states for adding a new option
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionPrice, setNewOptionPrice] = useState('0.00');

  // Delete Confirmation State
  const [groupToDelete, setGroupToDelete] = useState<ModifierGroup | null>(null);

  const fetchModifierGroups = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/modifier-groups');
      
      const rawData = res?.data;
      const rawGroups = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.modifierGroups)
        ? rawData.modifierGroups
        : [];

      // Map backend priceAdjustment field to UI price property
      const parsedGroups = rawGroups.map((g: any) => ({
        ...g,
        options: (g.options || []).map((opt: any) => ({
          ...opt,
          price: opt.price ?? opt.priceAdjustment ?? 0,
        })),
      }));

      setGroups(parsedGroups);
    } catch (err: any) {
      if (err.response?.status === 401) {
        onLogout();
      } else {
        setError('Failed to load modifier groups.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModifierGroups();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleOpenModal = (group?: ModifierGroup) => {
    setFormError(null);
    setNewOptionName('');
    setNewOptionPrice('0.00');

    if (group) {
      setEditingGroup(group);
      setGroupName(group.name || '');
      setMinSelection(group.minSelection ?? 0);
      setMaxSelection(group.maxSelection ?? 1);
      setIsRequired(group.isRequired ?? false);
      setOptions(
        group.options
          ? group.options.map((opt: any) => ({
              id: opt.id,
              name: opt.name,
              price: opt.price ?? opt.priceAdjustment ?? 0,
            }))
          : []
      );
    } else {
      setEditingGroup(null);
      setGroupName('');
      setMinSelection(0);
      setMaxSelection(1);
      setIsRequired(false);
      setOptions([]);
    }
    setIsModalOpen(true);
  };

  const handleAddOption = () => {
    if (!newOptionName.trim()) return;
    
    setOptions((prev) => [
      ...prev,
      {
        name: newOptionName.trim(),
        price: parseFloat(newOptionPrice) || 0,
      },
    ]);

    setNewOptionName('');
    setNewOptionPrice('0.00');
  };

  const handleRemoveOption = (index: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setFormError('Modifier Group Name is required.');
      return;
    }

    if (options.length === 0) {
      setFormError('Please add at least one modifier option.');
      return;
    }

    try {
      setFormError(null);

      const payload = {
        name: groupName.trim(),
        minSelection: Number(minSelection),
        maxSelection: Number(maxSelection),
        isRequired: Boolean(isRequired),
        options: options.map((opt) => ({
          ...(opt.id ? { id: opt.id } : {}),
          name: opt.name,
          price: Number(opt.price) || 0,
        })),
      };

      if (editingGroup) {
        await api.put(`/modifier-groups/${editingGroup.id}`, payload);
      } else {
        await api.post('/modifier-groups', payload);
      }

      setIsModalOpen(false);
      fetchModifierGroups();
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Failed to save modifier group.');
    }
  };

  const confirmDelete = async () => {
    if (!groupToDelete) return;
    try {
      await api.delete(`/modifier-groups/${groupToDelete.id}`);
      setGroupToDelete(null);
      fetchModifierGroups();
    } catch (err) {
      alert('Failed to delete modifier group.');
    }
  };

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const totalPages = Math.ceil(filteredGroups.length / itemsPerPage);
  const paginatedGroups = filteredGroups.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Modifier Groups</h2>
          <p className="text-sm text-slate-500 mt-1">
            Configure extra options, add-ons, and choices for your menu items ({filteredGroups.length} total).
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-orange-500/20 transition hover:opacity-95"
                  >
                 
          <Plus size={18} />
          <span>Add Modifier Group</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 w-full">
          <Search size={18} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search modifier groups by name..."
            className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-lg"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 self-start sm:self-auto">
          <button
            onClick={() => setViewMode('cards')}
            title="Card View"
            className={`p-2 rounded-lg transition ${
              viewMode === 'cards'
                ? 'bg-white text-indigo-600 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            title="Table View"
            className={`p-2 rounded-lg transition ${
              viewMode === 'table'
                ? 'bg-white text-indigo-600 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
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

      {/* Main Grid/Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse m-auto">Loading modifiers...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-12 text-center text-slate-500 m-auto">No modifier groups found.</div>
        ) : (
          <>
            {/* CARD VIEW */}
            {viewMode === 'cards' && (
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 bg-slate-50/50">
                {paginatedGroups.map((group) => (
                  <div
                    key={group.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <Layers size={18} />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-800 text-base">{group.name}</h4>
                            <span className="text-xs text-slate-400">
                              Min: {group.minSelection} | Max: {group.maxSelection}
                            </span>
                          </div>
                        </div>

                        {group.isRequired ? (
                          <span className="text-[10px] uppercase tracking-wider font-bold bg-amber-50 text-amber-600 border border-amber-200/60 px-2 py-0.5 rounded-md">
                            Required
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md">
                            Optional
                          </span>
                        )}
                      </div>

                      <div className="mt-4 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {group.options && group.options.length > 0 ? (
                          group.options.map((opt, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-xs py-1.5 px-3 bg-slate-50 rounded-lg border border-slate-100 text-slate-700"
                            >
                              <span className="font-medium">{opt.name}</span>
                              <span className="font-mono text-slate-500">
                                {Number(opt.price) > 0 ? `+$${Number(opt.price).toFixed(2)}` : 'Free'}
                              </span>
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">No items inside this group</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                      <span>{group.options?.length || 0} Options</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenModal(group)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="Edit Group"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => setGroupToDelete(group)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Delete Group"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TABLE VIEW */}
            {viewMode === 'table' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100 text-xs font-semibold uppercase text-slate-400 tracking-wider">
                      <th className="px-6 py-3">Group Name</th>
                      <th className="px-4 py-3">Selection Rules</th>
                      <th className="px-4 py-3">Requirement</th>
                      <th className="px-6 py-3">Options List</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedGroups.map((group) => (
                      <tr key={group.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-4 font-semibold text-slate-800">
                          <div className="flex items-center gap-2">
                            <Layers size={16} className="text-indigo-500" />
                            <span>{group.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-600 font-mono">
                          Min: {group.minSelection} / Max: {group.maxSelection}
                        </td>
                        <td className="px-4 py-4">
                          {group.isRequired ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200/50">
                              <CheckCircle2 size={12} /> Mandatory
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-md">
                              <XCircle size={12} /> Optional
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1 max-w-md">
                            {group.options?.map((opt, i) => (
                              <span
                                key={i}
                                className="inline-block bg-slate-100 text-slate-700 text-[11px] px-2 py-0.5 rounded border border-slate-200"
                              >
                                {opt.name}{' '}
                                <strong className="text-slate-900 font-mono">
                                  {Number(opt.price) > 0 ? `(+$${Number(opt.price).toFixed(2)})` : ''}
                                </strong>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenModal(group)}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => setGroupToDelete(group)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Footer */}
            <div className="mt-auto flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 gap-3 text-sm text-slate-500">
              <div>
                Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredGroups.length)} to{' '}
                {Math.min(currentPage * itemsPerPage, filteredGroups.length)} of {filteredGroups.length} groups
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    className="p-2 border border-slate-200 bg-white rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs font-semibold px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    className="p-2 border border-slate-200 bg-white rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingGroup ? 'Edit Modifier Group' : 'Create Modifier Group'}
            </h3>

            {formError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-600 text-xs font-medium">
                <AlertCircle size={16} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Group Name *</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Choice of Cheese, Pizza Toppings, Cooking Temp"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Min Selection</label>
                  <input
                    type="number"
                    min="0"
                    value={minSelection}
                    onChange={(e) => setMinSelection(parseInt(e.target.value) || 0)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Max Selection</label>
                  <input
                    type="number"
                    min="1"
                    value={maxSelection}
                    onChange={(e) => setMaxSelection(parseInt(e.target.value) || 1)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
<div className="flex items-center gap-2 pt-2">
  <input
    type="checkbox"
    id="isRequired"
    checked={isRequired}
    onChange={(e) => setIsRequired(e.target.checked)}
    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
  />
  <label htmlFor="isRequired" className="text-xs font-semibold text-slate-700 cursor-pointer">
    Required Field (Customer must select at least one option)
  </label>
</div>
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider">
                  Modifier Options / Items
                </label>

                <div className="space-y-2 mb-3 max-h-48 overflow-y-auto pr-1">
                  {options.map((opt, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                    >
                      <span className="font-medium text-slate-800">{opt.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                          +${Number(opt.price).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(idx)}
                          className="text-slate-400 hover:text-rose-600 transition"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Option name (e.g. Extra Cheddar)"
                    value={newOptionName}
                    onChange={(e) => setNewOptionName(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="w-28 relative">
                    <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newOptionPrice}
                      onChange={(e) => setNewOptionPrice(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="bg-slate-900 hover:bg-slate-800 text-white p-2.5 rounded-xl transition"
                    title="Add Item"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
               className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-orange-500/20 transition hover:opacity-95"
          >
                  Save Modifier Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(groupToDelete)}
        title="Delete Modifier Group"
        message={`Are you sure you want to delete "${groupToDelete?.name}"?`}
        confirmLabel="Delete"
        isDanger={true}
        onConfirm={confirmDelete}
        onCancel={() => setGroupToDelete(null)}
      />
    </div>
  );
}