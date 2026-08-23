import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { ArrowUp, ArrowDown, Edit2, Trash2, Plus, AlertCircle, Search, X, Printer, RefreshCw } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import Select from 'react-select';

interface Category {
  id: number;
  name: string;
  printername?: string | null;
  position?: number;
}

interface CategoriesProps {
  onLogout: () => void;
}

export default function Categories({ onLogout }: CategoriesProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Category Edit/Create State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [printerSearch, setPrinterSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Confirmation State
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  // Fetch Categories from Database
  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/categories');
      setCategories(res.data.categories || res.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        onLogout();
      } else {
        setError('Could not load categories. Check server connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch OS Printers via Fastify Route
  const fetchSystemPrinters = async () => {
    try {
      setLoadingPrinters(true);
      const res = await api.get('/printers');
      setAvailablePrinters(res.data.printers || []);
    } catch (err) {
      console.error('Failed to query local OS printers:', err);
    } finally {
      setLoadingPrinters(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchSystemPrinters();
  }, []);

  const handleOpenModal = (category?: Category) => {
    setFormError(null);
    setPrinterSearch('');
    fetchSystemPrinters();

    if (category) {
      setEditingCategory(category);
      setCategoryName(category.name);
      setSelectedPrinter(category.printername || '');
    } else {
      setEditingCategory(null);
      setCategoryName('');
      setSelectedPrinter('');
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = categoryName.trim();
    if (!trimmedName) return;

    const exists = categories.some(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase() && c.id !== editingCategory?.id
    );

    if (exists) {
      setFormError(`A category named "${trimmedName}" already exists.`);
      return;
    }

    try {
      setFormError(null);
      const payload = {
        name: trimmedName,
        printerName: selectedPrinter || null,
      };

      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, payload);
      } else {
        await api.post('/categories', payload);
      }
      setIsModalOpen(false);
      fetchCategories();
    } catch (err: any) {
      const serverMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to save category.';
      setFormError(serverMsg);
    }
  };

  const confirmDelete = async () => {
    if (!categoryToDelete) return;
    try {
      await api.delete(`/categories/${categoryToDelete.id}`);
      setCategoryToDelete(null);
      fetchCategories();
    } catch (err) {
      alert('Failed to delete category.');
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (searchQuery.trim()) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const updated = [...categories];
    const [movedItem] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, movedItem);

    setCategories(updated);

    try {
      const categoryIds = updated.map((c) => c.id);
      await api.put('/categories/reorder', { categoryIds });
    } catch (err) {
      fetchCategories();
    }
  };

  // Filter Categories
  const filteredCategories = categories.filter((category) =>
    category.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  // Filter Available System Printers
  const filteredPrinters = availablePrinters.filter((printer) =>
    printer.toLowerCase().includes(printerSearch.toLowerCase().trim())
  );

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Categories</h2>
          <p className="text-sm text-slate-500 mt-1">
            Organize menu categories and assign target route printers from your local machine.
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-orange-500/20 transition hover:opacity-95"
          >
          <Plus size={18} />
          <span>Add Category</span>
        </button>
      </div>

      {/* Category Search Input */}
      <div className="mb-6 relative">
        <Search size={18} className="absolute left-3.5 top-3 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search categories..."
          className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition"
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

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Category List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading categories...</div>
        ) : filteredCategories.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500 mb-2">
              {searchQuery ? `No categories matching "${searchQuery}"` : 'No categories created yet.'}
            </p>
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="text-indigo-600 font-semibold text-sm hover:underline"
              >
                Clear search filter
              </button>
            ) : (
              <button
                onClick={() => handleOpenModal()}
                className="text-indigo-600 font-semibold hover:underline text-sm"
              >
                Create your first category
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <div className="bg-slate-50/50 px-6 py-3 grid grid-cols-12 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <span className="col-span-2 text-center">Order</span>
              <span className="col-span-4">Category Name</span>
              <span className="col-span-4">Assigned Printer</span>
              <span className="col-span-2 text-right">Actions</span>
            </div>

            {filteredCategories.map((category) => {
              const originalIndex = categories.findIndex((c) => c.id === category.id);
              const isFiltered = Boolean(searchQuery.trim());

              return (
                <div
                  key={category.id}
                  className="px-6 py-4 grid grid-cols-12 items-center hover:bg-slate-50/80 transition-colors"
                >
                  <div className="col-span-2 flex items-center justify-center gap-1">
                    <button
                      disabled={isFiltered || originalIndex === 0}
                      onClick={() => handleMove(originalIndex, 'up')}
                      title={isFiltered ? 'Clear filter to reorder' : 'Move Up'}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-20 transition"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      disabled={isFiltered || originalIndex === categories.length - 1}
                      onClick={() => handleMove(originalIndex, 'down')}
                      title={isFiltered ? 'Clear filter to reorder' : 'Move Down'}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-20 transition"
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>

                  <div className="col-span-4 font-semibold text-slate-800">{category.name}</div>

                  <div className="col-span-4">
                    {category.printername ? (
                      <span className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-mono">
                        <Printer size={13} className="text-indigo-600" />
                        {category.printername}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs italic">Unassigned</span>
                    )}
                  </div>

                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenModal(category)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => setCategoryToDelete(category)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit / Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingCategory ? 'Edit Category' : 'Create Category'}
            </h3>

            {formError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-600 text-xs font-medium">
                <AlertCircle size={16} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Category Name *
                </label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => {
                    setCategoryName(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="e.g. Beverages & Drinks"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>

              {/* Searchable Printer Selector */}
            <div className="space-y-1.5">
  <div className="flex items-center justify-between">
    <label className="block text-xs font-semibold text-slate-700">Assigned Printer</label>
    <button
      type="button"
      onClick={fetchSystemPrinters}
      disabled={loadingPrinters}
      className="flex items-center gap-1 text-[11px] text-indigo-600 hover:underline disabled:opacity-50"
    >
      <RefreshCw size={11} className={loadingPrinters ? 'animate-spin' : ''} />
      <span>Refresh</span>
    </button>
  </div>

  <Select
    isClearable
    isSearchable
    isLoading={loadingPrinters}
    placeholder="Type to search or select printer..."
    value={
      selectedPrinter
        ? { value: selectedPrinter, label: selectedPrinter }
        : null
    }
    onChange={(selectedOption) => {
      setSelectedPrinter(selectedOption ? selectedOption.value : '');
    }}
    options={availablePrinters.map((printer) => ({
      value: printer,
      label: printer,
    }))}
    styles={{
      control: (base, state) => ({
        ...base,
        borderRadius: '0.75rem',
        borderColor: state.isFocused ? '#6366f1' : '#e2e8f0',
        padding: '2px',
        boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
        '&:hover': {
          borderColor: state.isFocused ? '#6366f1' : '#cbd5e1',
        },
      }),
      menu: (base) => ({
        ...base,
        borderRadius: '0.75rem',
        overflow: 'hidden',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        zIndex: 60,
      }),
    }}
  />
</div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                 className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-orange-500/20 transition hover:opacity-95"
          >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(categoryToDelete)}
        title="Delete Category"
        message={`Are you sure you want to delete "${categoryToDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isDanger={true}
        onConfirm={confirmDelete}
        onCancel={() => setCategoryToDelete(null)}
      />
    </div>
  );
}