import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { 
  Plus, Edit, Trash2, Search, Flame, Salad, Utensils, AlertTriangle, X, RefreshCw 
} from 'lucide-react';

// --- Types ---
export interface KitchenStation {
  id: number;
  name: string;
  description?: string;
  restaurantId: number;
}

interface StationManagerProps {
  onLogout?: () => void;
  restaurantId?: number; // Pass as prop or auto-detect below
}

export default function KitchenStationPage({ onLogout, restaurantId: propRestaurantId }: StationManagerProps) {
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Get active restaurant ID (from prop, localStorage, or default to 1)
  const currentRestaurantId = propRestaurantId 
    || Number(localStorage.getItem('restaurantId')) 
    || 1;

  // Form & Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingStation, setEditingStation] = useState<KitchenStation | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  // Delete Confirmation State
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Fetch Stations
  const fetchStations = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/kitchenStation', {
        params: { restaurantId: currentRestaurantId }
      });
      const data = res.data?.stations || res.data?.data || res.data;
      setStations(Array.isArray(data) ? data : []);
    } catch (err: any) {
      if (err.response?.status === 401 && onLogout) {
        onLogout();
      } else {
        setError(err.response?.data?.message || 'Could not load kitchen stations.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, [currentRestaurantId]);

  // Open Modal (Create or Edit)
  const handleOpenModal = (station?: KitchenStation) => {
    if (station) {
      setEditingStation(station);
      setFormData({
        name: station.name,
        description: station.description || '',
      });
    } else {
      setEditingStation(null);
      setFormData({ name: '', description: '' });
    }
    setIsModalOpen(true);
  };

  // Save Station (Create/Update)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingStation) {
        await api.put(`/kitchenStation/${editingStation.id}`, {
          restaurantId: currentRestaurantId,
          name: formData.name,
          description: formData.description,
        });
      } else {
        // Includes required restaurantId field
        await api.post('/kitchenStation', {
          restaurantId: currentRestaurantId,
          name: formData.name,
          description: formData.description,
        });
      }

      setIsModalOpen(false);
      fetchStations();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save kitchen station.');
    }
  };

  // Delete Station
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/kitchenStation/${deleteId}`);
      setDeleteId(null);
      fetchStations();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete station.');
    }
  };

  const filteredStations = stations.filter((st) =>
    st.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
        .station-title { font-family: 'Bebas Neue', 'Arial Narrow', sans-serif; letter-spacing: 0.05em; }
      `}</style>

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="station-title uppercase text-3xl leading-none text-[#1c1917]">
            Kitchen Stations Setup
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Define preparation stations (Grill, Salad, Fried) to route items on KDS displays.
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#8a3f16] to-[#c2621f] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-[#8a3f16]/25 transition hover:opacity-95"
        >
          <Plus size={16} />
          Add Station
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search station by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#c2621f]/40 focus:border-[#c2621f] transition"
          />
        </div>
        <button
          onClick={fetchStations}
          className="p-2.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 transition"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      {/* Station Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {filteredStations.map((station) => (
          <div
            key={station.id}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between overflow-hidden"
          >
            <div className="p-5 space-y-3">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                {station.name.toLowerCase().includes('fry') && <Flame size={18} className="text-amber-600" />}
                {station.name.toLowerCase().includes('salad') && <Salad size={18} className="text-emerald-600" />}
                {station.name.toLowerCase().includes('grill') && <Utensils size={18} className="text-red-600" />}
                {station.name}
              </h3>

              <p className="text-xs text-slate-500 line-clamp-2">
                {station.description || 'No description provided.'}
              </p>
            </div>

            {/* Actions */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => handleOpenModal(station)}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition"
              >
                <Edit size={14} />
              </button>
              <button
                onClick={() => setDeleteId(station.id)}
                className="p-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 transition"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Station Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
            <div className="px-6 py-4 bg-[#1c1917] flex items-center justify-between border-b-2 border-[#c2621f]">
              <h3 className="station-title uppercase text-xl text-white">
                {editingStation ? 'Edit Station' : 'Create New Station'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Station Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fried, Salad, Grill"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#c2621f]/40 focus:border-[#c2621f]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Optional notes or station responsibilities"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#c2621f]/40 focus:border-[#c2621f]"
                />
              </div>

              <div className="pt-4 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#c2621f] hover:bg-[#8a3f16] text-white rounded-lg text-xs font-bold uppercase tracking-wider transition"
                >
                  Save Station
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-100">
            <div className="p-5 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <AlertTriangle size={20} />
              </div>
              <h3 className="font-bold text-slate-900">Delete Station?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to delete this station? Items assigned to it will need to be re-assigned.
              </p>
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t flex justify-end gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="px-3 py-1.5 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-white"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}