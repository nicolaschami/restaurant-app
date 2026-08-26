import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  isDanger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');
        .ticket-font { font-family: 'Bebas Neue', 'Arial Narrow', sans-serif; letter-spacing: 0.05em; }
        .ticket-tear-line {
          background-image: repeating-linear-gradient(90deg, #d6d3d1 0 5px, transparent 5px 11px);
          height: 1px;
        }
      `}</style>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-100">
        <div className={`h-1 w-full ${isDanger ? 'bg-red-500' : 'bg-gradient-to-r from-[#8a3f16] to-[#c2621f]'}`} />
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className={`p-3 rounded-xl ${isDanger ? 'bg-red-50 text-red-600' : 'bg-[#fdece1] text-[#b5541f]'}`}>
              <AlertTriangle size={24} />
            </div>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-4">
            <h3 className="ticket-font uppercase text-xl leading-none text-[#1c1917]">{title}</h3>
            <p className="text-sm text-slate-500 mt-2">{message}</p>
          </div>

          <div className="ticket-tear-line mt-5" />

          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wide text-white shadow-sm transition ${
                isDanger
                  ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                  : 'bg-gradient-to-r from-[#8a3f16] to-[#c2621f] hover:opacity-95 shadow-[#8a3f16]/25'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
