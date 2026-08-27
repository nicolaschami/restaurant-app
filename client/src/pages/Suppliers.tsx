import React, { useState, useEffect } from 'react';
import {api} from '../api';
import ConfirmModal from '../components/ConfirmModal';
import {
  Truck,
  Plus,
  Search,
  Filter,
  Phone,
  Mail,
  Edit3,
  Building2,
  DollarSign,
  CheckCircle2,
  XCircle,
  X,
  CreditCard,
  Loader2,Trash2
} from 'lucide-react';

export interface Supplier {
  supplierId?: number;
  restaurantId?: number | string;
  supplierCode?: string;
  supplierName: string;
  contactPerson?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
  taxNumber?: string;
  currencyCode?: string;
  paymentTerms?: string;
  creditLimit?: number | string;
  openingBalance?: number | string;
  notes?: string;
  isActive?: boolean;
}

interface SuppliersPageProps {
  onLogout?: () => void;
}



export default function SuppliersPage({ onLogout }: SuppliersPageProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
const [itemToDelete, setItemToDelete] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [formData, setFormData] = useState<Partial<Supplier>>({
    supplierName: '',
    supplierCode: '',
    contactPerson: '',
    phone: '',
    phone2: '',
    email: '',
    address: '',
    city: '',
    country: 'US',
    taxNumber: '',
    currencyCode: 'USD',
    paymentTerms: 'NET 15',
    creditLimit: 0,
    openingBalance: 0,
    notes: '',
    isActive: true,
  });

  const parseNumericValue = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const cleanStr = String(val).replace(',', '.');
    const parsed = parseFloat(cleanStr);
    return isNaN(parsed) ? 0 : parsed;
  };

const confirmDelete = async () => {
  if (!itemToDelete) return;
  try {
    await api.delete(`/suppliers/${itemToDelete.supplierId}`);
    setItemToDelete(null);
    fetchSuppliers();
  } catch (err: any) {
    const errorDetail = err.response?.data?.error || err.response?.data?.message || 'Failed to delete supplier.';
    setErrorMessage(errorDetail);
  }
};



  const fetchSuppliers = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await api.get('/suppliers');
      const rawData = res.data.suppliers || res.data;

      // Safely map both camelCase and snake_case API responses into camelCase
      const normalizedData = (Array.isArray(rawData) ? rawData : []).map((item: any) => ({
        supplierId: item.supplierId ?? item.supplier_id,
        restaurantId: item.restaurantId ?? item.restaurant_id,
        supplierCode: item.supplierCode ?? item.supplier_code ?? '',
        supplierName: item.supplierName ?? item.supplier_name ?? '',
        contactPerson: item.contactPerson ?? item.contact_person ?? '',
        phone: item.phone ?? '',
        phone2: item.phone2 ?? '',
        email: item.email ?? '',
        address: item.address ?? '',
        city: item.city ?? '',
        country: item.country ?? 'US',
        taxNumber: item.taxNumber ?? item.tax_number ?? '',
        currencyCode: item.currencyCode ?? item.currency_code ?? 'USD',
        paymentTerms: item.paymentTerms ?? item.payment_terms ?? 'NET 15',
        creditLimit: item.creditLimit ?? item.credit_limit ?? 0,
        openingBalance: item.openingBalance ?? item.opening_balance ?? 0,
        notes: item.notes ?? '',
        isActive: item.isActive ?? item.is_active ?? true,
      }));

      setSuppliers(normalizedData);
    } catch (err: any) {
      if (err.response?.status === 401 && onLogout) {
        onLogout();
      } else {
        setErrorMessage('Could not load suppliers. Check server connection.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const payload = {
      restaurantId: 1,
      supplierCode: formData.supplierCode || `SUP-${Math.floor(100 + Math.random() * 900)}`,
      supplierName: formData.supplierName,
      contactPerson: formData.contactPerson || '',
      phone: formData.phone || '',
      phone2: formData.phone2 || '',
      email: formData.email || '',
      address: formData.address || '',
      city: formData.city || '',
      country: formData.country || 'US',
      taxNumber: formData.taxNumber || '',
      currencyCode: formData.currencyCode || 'USD',
      paymentTerms: formData.paymentTerms || 'NET 15',
      creditLimit: parseNumericValue(formData.creditLimit),
      openingBalance: parseNumericValue(formData.openingBalance),
      notes: formData.notes || '',
      isActive: Boolean(formData.isActive),
    };

    try {
      if (editingSupplier && editingSupplier.supplierId) {
        const res = await api.put(`/suppliers/${editingSupplier.supplierId}`, payload);
        const updated = res.data.supplier || res.data;
        
        const normalizedUpdated: Supplier = {
          ...updated,
          supplierId: updated.supplierId ?? updated.supplier_id,
          supplierName: updated.supplierName ?? updated.supplier_name,
          supplierCode: updated.supplierCode ?? updated.supplier_code,
          contactPerson: updated.contactPerson ?? updated.contact_person,
          paymentTerms: updated.paymentTerms ?? updated.payment_terms,
          creditLimit: updated.creditLimit ?? updated.credit_limit,
          openingBalance: updated.openingBalance ?? updated.opening_balance,
          isActive: updated.isActive ?? updated.is_active ?? true,
        };

        setSuppliers((prev) =>
          prev.map((s) => (s.supplierId === editingSupplier.supplierId ? normalizedUpdated : s))
        );
      } else {
        const res = await api.post('/suppliers', payload);
        const created = res.data.supplier || res.data;

        const normalizedCreated: Supplier = {
          ...created,
          supplierId: created.supplierId ?? created.supplier_id,
          supplierName: created.supplierName ?? created.supplier_name,
          supplierCode: created.supplierCode ?? created.supplier_code,
          contactPerson: created.contactPerson ?? created.contact_person,
          paymentTerms: created.paymentTerms ?? created.payment_terms,
          creditLimit: created.creditLimit ?? created.credit_limit,
          openingBalance: created.openingBalance ?? created.opening_balance,
          isActive: created.isActive ?? created.is_active ?? true,
        };

        setSuppliers((prev) => [normalizedCreated, ...prev]);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      if (err.response?.status === 401 && onLogout) {
        onLogout();
      } else {
        const errorDetail = err.response?.data?.message || err.response?.data?.error || 'Failed to save supplier.';
        setErrorMessage(errorDetail);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenModal = (supplier?: Supplier) => {
    setErrorMessage(null);
    if (supplier) {
      setEditingSupplier(supplier);
      setFormData(supplier);
    } else {
      setEditingSupplier(null);
      setFormData({
        supplierName: '',
        supplierCode: `SUP-${Math.floor(100 + Math.random() * 900)}`,
        contactPerson: '',
        phone: '',
        phone2: '',
        email: '',
        address: '',
        city: '',
        country: 'US',
        taxNumber: '',
        currencyCode: 'USD',
        paymentTerms: 'NET 15',
        creditLimit: 0,
        openingBalance: 0,
        notes: '',
        isActive: true,
      });
    }
    setIsModalOpen(true);
  };
//const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter((s) => s.isActive).length;
  const totalOutstanding = suppliers.reduce((acc, s) => acc + parseNumericValue(s.openingBalance), 0);

  const filteredSuppliers = suppliers.filter((supplier) => {
    const name = supplier.supplierName || '';
    const code = supplier.supplierCode || '';
    const contact = supplier.contactPerson || '';

    const matchesSearch =
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? supplier.isActive
        : !supplier.isActive;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-full bg-slate-50/60 p-4 sm:p-6 lg:p-8">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@500;600;700&display=swap');
        .ticket-font { font-family: 'Bebas Neue', 'Arial Narrow', sans-serif; letter-spacing: 0.05em; }
        .price-font { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .ticket-tear-line {
          background-image: repeating-linear-gradient(90deg, #d6d3d1 0 5px, transparent 5px 11px);
          height: 1px;
        }
      `}</style>
      <div className="mx-auto max-w-7xl space-y-6">
        
        {/* HEADER */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1c1917] text-[#e8ceb8] shadow-sm shrink-0">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="ticket-font uppercase text-2xl sm:text-3xl leading-none text-[#1c1917]">Suppliers &amp; Vendors</h1>
              <p className="text-xs text-slate-500 mt-1">Manage vendor accounts and commercial terms.</p>
            </div>
          </div>

          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#8a3f16] to-[#c2621f] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-[#8a3f16]/25 transition hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Add New Supplier
          </button>
        </div>

        {/* ERROR BANNER */}
        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-600">
            {errorMessage}
          </div>
        )}

        {/* STAT METRICS */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-[#8a3f16] to-[#c2621f]" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total Partners</span>
              <Building2 className="h-4 w-4 text-slate-400" />
            </div>
            <p className="mt-2 text-2xl price-font font-bold text-[#1c1917]">{totalSuppliers}</p>
            <span className="mt-1 inline-block text-[11px] font-medium text-emerald-600">
              {activeSuppliers} Active Vendors
            </span>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-[#8a3f16] to-[#c2621f]" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total Outstanding</span>
              <DollarSign className="h-4 w-4 text-[#b5541f]" />
            </div>
            <p className="mt-2 text-2xl price-font font-bold text-[#1c1917]">
              ${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <span className="mt-1 inline-block text-[11px] font-medium text-[#b5541f]">
              Accounts Payable Balance
            </span>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-[#8a3f16] to-[#c2621f]" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Compliance Rate</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="mt-2 text-2xl price-font font-bold text-[#1c1917]">
              {Math.round((activeSuppliers / (totalSuppliers || 1)) * 100)}%
            </p>
            <span className="mt-1 inline-block text-[11px] font-medium text-slate-400">
              Operational Status
            </span>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by vendor, code or contact..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2 text-xs font-medium text-slate-800 outline-none focus:border-[#c2621f] focus:bg-white focus:ring-1 focus:ring-[#c2621f]/30"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            {(['all', 'active', 'inactive'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  statusFilter === status
                    ? 'bg-[#1c1917] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#1c1917] text-[11px] font-bold uppercase tracking-wider text-[#d8c6b0]">
                <tr>
                  <th className="px-5 py-3.5">Vendor</th>
                  <th className="px-5 py-3.5">Contact Person</th>
                  <th className="px-5 py-3.5">Terms &amp; Credit</th>
                  <th className="px-5 py-3.5">Outstanding Balance</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#c2621f]" />
                      <p className="mt-2 text-xs">Loading suppliers from server...</p>
                    </td>
                  </tr>
                ) : filteredSuppliers.length > 0 ? (
                  filteredSuppliers.map((supplier) => (
                    <tr key={supplier.supplierId} className="group hover:bg-[#faf3ea] transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-700 group-hover:bg-[#c2621f] group-hover:text-white transition">
                            {supplier.supplierName?.charAt(0) || 'V'}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{supplier.supplierName}</p>
                            <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] price-font text-slate-500">
                              {supplier.supplierCode || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800">{supplier.contactPerson || '—'}</p>
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                          {supplier.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{supplier.phone}</span>}
                          {supplier.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{supplier.email}</span>}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-[#fdece1] border border-[#f0c9a6] px-2 py-1 text-[11px] font-semibold text-[#8a3f16]">
                          <CreditCard className="h-3 w-3 text-[#b5541f]" />
                          {supplier.paymentTerms || 'N/A'}
                        </span>
                        <p className="mt-1 text-[11px] price-font text-slate-400">
                          Limit: ${parseNumericValue(supplier.creditLimit).toLocaleString()}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className={`price-font font-bold ${parseNumericValue(supplier.openingBalance) > 0 ? 'text-[#b5541f]' : 'text-slate-900'}`}>
                          ${parseNumericValue(supplier.openingBalance).toFixed(2)}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        {supplier.isActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600 ring-1 ring-inset ring-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-inset ring-slate-400/20">
                            <XCircle className="h-3 w-3" /> Inactive
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenModal(supplier)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#fdece1] hover:text-[#b5541f] transition"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setItemToDelete(supplier)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <Truck className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-2 text-xs font-semibold">No suppliers found</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!isLoading && (
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
              {searchQuery || statusFilter !== 'all' ? (
                <>Showing <span className="price-font font-semibold text-[#1c1917]">{filteredSuppliers.length}</span> of{' '}
                <span className="price-font font-semibold text-[#1c1917]">{totalSuppliers}</span> suppliers</>
              ) : (
                <><span className="price-font font-semibold text-[#1c1917]">{totalSuppliers}</span> suppliers total</>
              )}
            </div>
          )}
        </div>
      </div>

      {/* DRAWER / MODAL */}
    {/* FIXED DRAWER / MODAL */}
{/* EXPANDED SIDE DRAWER */}
{isModalOpen && (
  <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity">
    {/* Changed max-w-md to max-w-2xl for a roomier, wider panel */}
    <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl transition-all">
      
      {/* 1. FIXED HEADER */}
      <div className="flex items-center justify-between bg-[#1c1917] border-b-2 border-[#c2621f] px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-8 rounded-full bg-gradient-to-b from-[#c2621f] to-[#8a3f16]"></div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#c2621f] leading-none mb-1">Vendor Account</p>
            <h2 className="ticket-font uppercase text-xl leading-none text-white">
              {editingSupplier ? 'Edit Supplier' : 'New Supplier'}
            </h2>
            <p className="text-[11px] text-slate-400 mt-1.5">Update vendor details and payment arrangements.</p>
          </div>
        </div>
        <button
          onClick={() => setIsModalOpen(false)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition shrink-0"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* 2. SCROLLABLE FORM BODY (Wider Grid Layout) */}
      <form id="supplier-form" onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-4 space-y-3.5 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Supplier Name *</label>
          <input
            type="text"
            required
            value={formData.supplierName || ''}
            onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Supplier Code</label>
            <input
              type="text"
              value={formData.supplierCode || ''}
              onChange={(e) => setFormData({ ...formData, supplierCode: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 price-font outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Contact Person</label>
            <input
              type="text"
              value={formData.contactPerson || ''}
              onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Phone</label>
            <input
              type="text"
              value={formData.phone || ''}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Secondary Phone</label>
            <input
              type="text"
              value={formData.phone2 || ''}
              onChange={(e) => setFormData({ ...formData, phone2: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={formData.email || ''}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tax Number</label>
            <input
              type="text"
              value={formData.taxNumber || ''}
              onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 price-font outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">City</label>
            <input
              type="text"
              value={formData.city || ''}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Country</label>
            <input
              type="text"
              value={formData.country || 'US'}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">Address</label>
          <input
            type="text"
            value={formData.address || ''}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Payment Terms</label>
            <select
              value={formData.paymentTerms || 'NET 15'}
              onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
            >
              <option value="COD">COD</option>
              <option value="NET 15">NET 15</option>
              <option value="NET 30">NET 30</option>
              <option value="NET 60">NET 60</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Currency Code</label>
            <input
              type="text"
              value={formData.currencyCode || 'USD'}
              onChange={(e) => setFormData({ ...formData, currencyCode: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 price-font outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Credit Limit ($)</label>
            <input
              type="text"
              value={formData.creditLimit ?? ''}
              onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 price-font outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Opening Balance ($)</label>
            <input
              type="text"
              value={formData.openingBalance ?? ''}
              onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 price-font outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">Notes</label>
          <textarea
            rows={2}
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#c2621f] focus:ring-1 focus:ring-[#c2621f]"
          />
        </div>

        <div className="ticket-tear-line" />

        <div className="flex items-center gap-2 pt-2 pb-1">
          <input
            type="checkbox"
            id="isActiveToggle"
            checked={Boolean(formData.isActive)}
            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-[#c2621f] focus:ring-[#c2621f]"
          />
          <label htmlFor="isActiveToggle" className="font-semibold text-slate-700 cursor-pointer">
            Mark as Active Supplier
          </label>
        </div>
      </form>

      {/* 3. FIXED FOOTER */}
      <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
        <button
          type="button"
          onClick={() => setIsModalOpen(false)}
          className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-600 shadow-xs transition hover:bg-slate-100 hover:text-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          form="supplier-form"
          disabled={isSubmitting}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#8a3f16] to-[#c2621f] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-[#8a3f16]/25 transition hover:opacity-95 active:scale-98 disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Supplier
        </button>
      </div>

    </div>
  </div>
)}
{/* Delete Supplier Confirmation */}
<ConfirmModal
  isOpen={Boolean(itemToDelete)}
  title="Delete Supplier"
  message={`Are you sure you want to delete "${itemToDelete?.supplierName}"?`}
  confirmLabel="Delete"
  isDanger={true}
  onConfirm={confirmDelete}
  onCancel={() => setItemToDelete(null)}
/>

    </div>
  );
}
