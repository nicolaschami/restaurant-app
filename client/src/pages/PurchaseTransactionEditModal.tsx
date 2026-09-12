import type { FC } from 'react';
import PurchaseTransactionScreen from './Purchasetransactionscreen'

interface PurchaseTransactionEditModalProps {
  transactionId: number;
  restaurantId?: number;
  onClose: () => void;
}

const PurchaseTransactionEditModal: FC<PurchaseTransactionEditModalProps> = ({ transactionId, restaurantId = 1, onClose }) => (
  <div className="pt-edit-modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit purchase transaction">
    <div className="pt-edit-modal-shell">
      <PurchaseTransactionScreen
        mode="edit"
        transactionId={transactionId}
        restaurantId={restaurantId}
        onCancel={onClose}
      />
    </div>
    <style>{`
      .pt-edit-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
        overflow: auto;
        padding: 16px;
        background: rgba(43, 31, 26, .42);
        backdrop-filter: blur(5px);
      }
      .pt-edit-modal-shell {
        width: min(100%, 1500px);
        min-height: calc(100vh - 32px);
        margin: 0 auto;
        border-radius: 18px;
        overflow: hidden;
        background: #f8f9fb;
        box-shadow: 0 24px 80px rgba(43, 31, 26, .24);
      }
      .pt-edit-modal-shell .pr-page {
        min-height: calc(100vh - 32px);
        padding: 18px;
      }
      .pt-edit-modal-shell .pr-topbar { display: none; }
      .pt-edit-modal-shell .pr-card { border-radius: 14px; }
      @media (max-width: 720px) {
        .pt-edit-modal-backdrop { padding: 0; }
        .pt-edit-modal-shell { min-height: 100vh; border-radius: 0; }
        .pt-edit-modal-shell .pr-page { min-height: 100vh; padding: 10px; }
      }
    `}</style>
  </div>
);

export default PurchaseTransactionEditModal;
