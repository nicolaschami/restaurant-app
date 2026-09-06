import React, { useState, useEffect } from 'react';
import {
  Loader2,
  CheckCircle2,
  Save,
  Store,
  MapPin,
  CreditCard,
  Printer,
  ShieldAlert,
  Clock,
  Image as ImageIcon,
} from 'lucide-react';
import { api } from '../api';

// Interface matching all 19 database columns
interface Restaurant {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  logo_url: string | null;
  receipt_header: string | null;
  receipt_footer: string | null;
  tax_number: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

type TabType = 'general' | 'location' | 'financial' | 'receipts' | 'system';

const TABS: { id: TabType; label: string; icon: typeof Store; accent: string }[] = [
  { id: 'general', label: 'General & Brand', icon: Store, accent: '#4C7A5E' },
  { id: 'location', label: 'Location', icon: MapPin, accent: '#5B7C99' },
  { id: 'financial', label: 'Financial', icon: CreditCard, accent: '#B8863B' },
  { id: 'receipts', label: 'Receipt Layout', icon: Printer, accent: '#8A6F34' },
  { id: 'system', label: 'System & Audit', icon: Clock, accent: '#6B6560' },
];

export default function EditRestaurantScreen({ restaurantId = 1 }: { restaurantId?: number }) {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Restaurant>({
    id: restaurantId,
    name: '',
    phone: '',
    email: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state_province: '',
    postal_code: '',
    country: 'US',
    currency: 'USD',
    timezone: 'UTC',
    logo_url: '',
    receipt_header: '',
    receipt_footer: '',
    tax_number: '',
    is_active: true,
  });

  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await api.get(`/restaurant/${restaurantId}`);

        if (res.data.restaurant) {
          setFormData(res.data.restaurant);
        } else {
          setFormData(res.data);
        }
      } catch (err: any) {
        if (err.response?.status === 401) {
          setError('Unauthorized. Please log in again.');
        } else if (err.response?.status === 404) {
          setError('Restaurant record not found.');
        } else {
          setError('Could not load restaurant details. Check server connection.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (restaurantId) {
      fetchRestaurantData();
    }
  }, [restaurantId]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError(null);

    try {
      console.log(formData);
      await api.put(`/restaurant/${formData.id}`, {
        ...formData,
        updated_at: new Date().toISOString(),
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving restaurant information:', err);
      setError('Failed to update restaurant information.');
    } finally {
      setSaving(false);
    }
  };

  const activeMeta = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="ledger-root">
      <LedgerStyles />

      <div className="ledger-header">
        <div className="ledger-header-left">
          <p className="ledger-eyebrow">RESTAURANT LEDGER</p>
          <h1 className="ledger-title">{formData.name || 'Untitled Restaurant'}</h1>
          <p className="ledger-subline">
            REG #{String(formData.id).padStart(4, '0')}
            {formData.city ? ` · ${formData.city}` : ''}
            {formData.country ? `, ${formData.country}` : ''}
          </p>
        </div>
        <div className="ledger-header-right">
          
          {formData.logo_url ? (
            <img
              src={formData.logo_url}
              alt="Logo"
              className="ledger-medallion"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          ) : (
            <div className="ledger-medallion ledger-medallion-empty">
              <ImageIcon className="w-5 h-5" />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="ledger-alert">
          <ShieldAlert className="w-4 h-4" style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="ledger-loading">
          <Loader2 className="w-7 h-7" style={{ animation: 'ledger-spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="ledger-body">
          {/* INDEX TABS */}
          <div className="ledger-index">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`ledger-index-tab ${isActive ? 'active' : ''}`}
                  style={{ ['--tab-accent' as any]: tab.accent }}
                >
                  <span className="ledger-index-flag" />
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* RECORD CARD */}
          <div className="ledger-card" style={{ ['--tab-accent' as any]: activeMeta.accent }}>
            <p className="ledger-card-heading">{activeMeta.label}</p>
            <div className="ledger-tear" />

            {activeTab === 'general' && (
              <div className="ledger-fields">
                <Field label="Restaurant Name" required span={2}>
                  <input
                    type="text"
                    name="name"
                    maxLength={100}
                    required
                    value={formData.name || ''}
                    onChange={handleChange}
                    className="ledger-input"
                  />
                </Field>
                <Field label="Phone Number">
                  <input
                    type="text"
                    name="phone"
                    maxLength={20}
                    value={formData.phone || ''}
                    onChange={handleChange}
                    className="ledger-input"
                  />
                </Field>
                <Field label="Email Address">
                  <input
                    type="email"
                    name="email"
                    maxLength={255}
                    value={formData.email || ''}
                    onChange={handleChange}
                    className="ledger-input"
                  />
                </Field>
                <Field label="Logo URL" span={2}>
                  <input
                    type="text"
                    name="logo_url"
                    placeholder="https://example.com/logo.png"
                    value={formData.logo_url || ''}
                    onChange={handleChange}
                    className="ledger-input"
                  />
                </Field>
                <div className="ledger-toggle-row">
                  <label className="ledger-toggle">
                    <input
                      type="checkbox"
                      id="is_active"
                      name="is_active"
                      checked={formData.is_active ?? true}
                      onChange={handleChange}
                    />
                    <span className="ledger-toggle-track">
                      <span className="ledger-toggle-thumb" />
                    </span>
                    <span className="ledger-toggle-label">Restaurant is active and taking orders</span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'location' && (
              <div className="ledger-fields">
                <Field label="Address Line 1" span={2}>
                  <input
                    type="text"
                    name="address_line1"
                    maxLength={255}
                    value={formData.address_line1 || ''}
                    onChange={handleChange}
                    className="ledger-input"
                  />
                </Field>
                <Field label="Address Line 2">
                  <input
                    type="text"
                    name="address_line2"
                    maxLength={255}
                    value={formData.address_line2 || ''}
                    onChange={handleChange}
                    className="ledger-input"
                  />
                </Field>
                <Field label="City">
                  <input
                    type="text"
                    name="city"
                    maxLength={100}
                    value={formData.city || ''}
                    onChange={handleChange}
                    className="ledger-input"
                  />
                </Field>
                <Field label="State / Province">
                  <input
                    type="text"
                    name="state_province"
                    maxLength={100}
                    value={formData.state_province || ''}
                    onChange={handleChange}
                    className="ledger-input"
                  />
                </Field>
                <Field label="Postal / ZIP Code">
                  <input
                    type="text"
                    name="postal_code"
                    maxLength={20}
                    value={formData.postal_code || ''}
                    onChange={handleChange}
                    className="ledger-input"
                  />
                </Field>
                <Field label="Country Code">
                  <input
                    type="text"
                    name="country"
                    maxLength={100}
                    value={formData.country || 'US'}
                    onChange={handleChange}
                    className="ledger-input"
                  />
                </Field>
              </div>
            )}

            {activeTab === 'financial' && (
              <div className="ledger-fields">
                <Field label="Currency">
                  <input
                    type="text"
                    name="currency"
                    maxLength={3}
                    placeholder="USD"
                    value={formData.currency || ''}
                    onChange={handleChange}
                    className="ledger-input"
                    style={{ textTransform: 'uppercase' }}
                  />
                </Field>
                <Field label="Timezone">
                  <input
                    type="text"
                    name="timezone"
                    maxLength={50}
                    placeholder="UTC"
                    value={formData.timezone || 'UTC'}
                    onChange={handleChange}
                    className="ledger-input"
                  />
                </Field>
                <Field label="Tax / VAT Number">
                  <input
                    type="text"
                    name="tax_number"
                    maxLength={50}
                    value={formData.tax_number || ''}
                    onChange={handleChange}
                    className="ledger-input"
                  />
                </Field>
              </div>
            )}

            {activeTab === 'receipts' && (
              <div className="ledger-fields">
                <Field label="Receipt Header" span={2}>
                  <textarea
                    name="receipt_header"
                    rows={4}
                    placeholder="e.g. Welcome to Our Restaurant!"
                    value={formData.receipt_header || ''}
                    onChange={handleChange}
                    className="ledger-input ledger-textarea"
                  />
                </Field>
                <Field label="Receipt Footer" span={2}>
                  <textarea
                    name="receipt_footer"
                    rows={4}
                    placeholder="e.g. Thank you for dining with us!"
                    value={formData.receipt_footer || ''}
                    onChange={handleChange}
                    className="ledger-input ledger-textarea"
                  />
                </Field>
                <div className="ledger-receipt-preview" style={{ gridColumn: '1 / -1' }}>
                  <p className="ledger-preview-label">RECEIPT PREVIEW</p>
                  <div className="ledger-receipt-paper">
                    {formData.receipt_header && <p className="ledger-receipt-line">{formData.receipt_header}</p>}
                    <div className="ledger-receipt-dashes" />
                    <p className="ledger-receipt-line muted">…order items…</p>
                    <div className="ledger-receipt-dashes" />
                    {formData.receipt_footer && <p className="ledger-receipt-line">{formData.receipt_footer}</p>}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'system' && (
              <div className="ledger-fields">
                <Field label="Record ID">
                  <input type="text" disabled value={formData.id} className="ledger-input ledger-input-disabled" />
                </Field>
                <Field label="Created At">
                  <input
                    type="text"
                    disabled
                    value={formData.created_at ? new Date(formData.created_at).toLocaleString() : 'N/A'}
                    className="ledger-input ledger-input-disabled"
                  />
                </Field>
                <Field label="Updated At">
                  <input
                    type="text"
                    disabled
                    value={formData.updated_at ? new Date(formData.updated_at).toLocaleString() : 'N/A'}
                    className="ledger-input ledger-input-disabled"
                  />
                </Field>
              </div>
            )}

            <div className="ledger-tear" style={{ marginTop: 22 }} />

            <div className="ledger-footer">
              <button type="button" className="ledger-btn-cancel">
                Discard changes
              </button>
              <button type="submit" disabled={saving} className="ledger-btn-save">
                {success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Saved
                  </>
                ) : saving ? (
                  <>
                    <Loader2 className="w-4 h-4" style={{ animation: 'ledger-spin 0.8s linear infinite' }} />
                    Stamping…
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Record
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  span,
  children,
}: {
  label: string;
  required?: boolean;
  span?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="ledger-field" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <label className="ledger-field-label">
        {label}
        {required && <span className="ledger-required"> *</span>}
      </label>
      {children}
    </div>
  );
}

function LedgerStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

      .ledger-root {
        min-height: 100vh;
        background: #f4f1eb;
        padding: 32px;
        font-family: 'Inter', -apple-system, sans-serif;
      }

      @keyframes ledger-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      /* ----- HEADER ----- */
      .ledger-header {
        max-width: 980px;
        margin: 0 auto 28px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        flex-wrap: wrap;
        background: linear-gradient(135deg, #1e2a3a, #0f1722);
        padding: 24px 32px;
        border-radius: 16px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      }
      .ledger-header-left {
        flex: 1;
      }
      .ledger-eyebrow {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #94a3b8;
        margin: 0 0 4px;
      }
      .ledger-title {
        font-size: 36px;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: #ffffff;
        margin: 0;
        line-height: 1.1;
      }
      .ledger-subline {
        font-size: 13px;
        color: #b9c7da;
        margin: 6px 0 0;
        font-weight: 400;
      }

      .ledger-header-right {
        display: flex;
        align-items: center;
        gap: 16px;
        flex-shrink: 0;
      }
      .ledger-stamp {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        padding: 6px 16px;
        border-radius: 100px;
        border: 2px solid;
        background: rgba(255,255,255,0.05);
        backdrop-filter: blur(2px);
        text-transform: uppercase;
      }
      .ledger-stamp.active {
        color: #7bcfa6;
        border-color: #7bcfa6;
      }
      .ledger-stamp.inactive {
        color: #f28b82;
        border-color: #f28b82;
      }

      .ledger-medallion {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid rgba(255,255,255,0.25);
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        background: #2d3748;
      }
      .ledger-medallion-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        background: #2d3748;
        color: #94a3b8;
        border: 2px solid #4a5568;
      }

      /* ----- ALERT ----- */
      .ledger-alert {
        max-width: 980px;
        margin: 0 auto 20px;
        display: flex;
        align-items: center;
        gap: 10px;
        background: #fde8e5;
        border: 1px solid #f5c6c0;
        color: #a13b2e;
        font-size: 13px;
        font-weight: 600;
        padding: 14px 20px;
        border-radius: 12px;
        box-shadow: 0 2px 6px rgba(161,59,46,0.08);
      }

      /* ----- LOADING ----- */
      .ledger-loading {
        display: flex;
        justify-content: center;
        padding: 80px 0;
        color: #1e2a3a;
      }

      /* ----- BODY (tabs + card) ----- */
      .ledger-body {
        max-width: 980px;
        margin: 0 auto;
        display: flex;
        gap: 0;
        align-items: stretch;
      }

      /* ----- INDEX TABS (vertical) ----- */
      .ledger-index {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 0 0 200px;
        padding-top: 12px;
      }
      .ledger-index-tab {
        position: relative;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 18px;
        border: none;
        background: transparent;
        color: #5f6a7a;
        font-size: 13px;
        font-weight: 600;
        text-align: left;
        cursor: pointer;
        border-radius: 10px 0 0 10px;
        transition: all 0.15s ease;
        font-family: 'Inter', sans-serif;
      }
      .ledger-index-tab .ledger-index-flag {
        position: absolute;
        left: 0;
        top: 20%;
        bottom: 20%;
        width: 4px;
        border-radius: 4px;
        background: var(--tab-accent);
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .ledger-index-tab:hover {
        background: rgba(255,255,255,0.4);
        color: #1e2a3a;
      }
      .ledger-index-tab.active {
        background: #ffffff;
        color: #1e2a3a;
        box-shadow: -4px 4px 16px rgba(0,0,0,0.06);
        transform: translateX(4px);
        border-radius: 10px 0 0 10px;
      }
      .ledger-index-tab.active .ledger-index-flag {
        opacity: 1;
      }
      .ledger-index-tab.active svg {
        color: var(--tab-accent);
      }

      /* ----- RECORD CARD ----- */
      .ledger-card {
        flex: 1;
        background: #ffffff;
        border-radius: 16px;
        padding: 28px 32px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.06);
        min-height: 420px;
        position: relative;
        border: 1px solid #eae7e0;
        border-left: none;
      }
      .ledger-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: var(--tab-accent);
        border-radius: 16px 16px 0 0;
      }
      .ledger-card-heading {
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: #1e2a3a;
        margin: 0 0 4px;
      }
      .ledger-tear {
        height: 1px;
        margin: 16px 0 20px;
        background: repeating-linear-gradient(90deg, #d1cdc4 0 6px, transparent 6px 12px);
      }

      /* ----- FIELDS ----- */
      .ledger-fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 22px 28px;
      }
      .ledger-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ledger-field-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #6b7a8a;
      }
      .ledger-required {
        color: #d45c4c;
      }

      .ledger-input {
        background: #faf9f6;
        border: 1px solid #e2ddd4;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 14px;
        font-family: 'Inter', sans-serif;
        color: #1e2a3a;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
        width: 100%;
      }
      .ledger-input:focus {
        outline: none;
        border-color: #1e2a3a;
        box-shadow: 0 0 0 3px rgba(30,42,58,0.08);
      }
      .ledger-input::placeholder {
        color: #b3ad9e;
      }
      .ledger-input-disabled {
        background: #f1efe9;
        color: #7d8796;
        border-style: dashed;
        cursor: not-allowed;
      }
      .ledger-textarea {
        resize: vertical;
        min-height: 80px;
        border-radius: 8px;
        padding: 12px 14px;
      }

      /* ----- TOGGLE ----- */
      .ledger-toggle-row {
        grid-column: 1 / -1;
        padding-top: 4px;
      }
      .ledger-toggle {
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        user-select: none;
      }
      .ledger-toggle input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }
      .ledger-toggle-track {
        width: 42px;
        height: 24px;
        border-radius: 12px;
        background: #d1cdc4;
        position: relative;
        transition: background 0.2s ease;
        flex-shrink: 0;
      }
      .ledger-toggle-thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        transition: transform 0.2s ease;
      }
      .ledger-toggle input:checked + .ledger-toggle-track {
        background: #2d7a5a;
      }
      .ledger-toggle input:checked + .ledger-toggle-track .ledger-toggle-thumb {
        transform: translateX(18px);
      }
      .ledger-toggle-label {
        font-size: 13px;
        font-weight: 500;
        color: #2d3748;
      }

      /* ----- RECEIPT PREVIEW ----- */
      .ledger-receipt-preview {
        margin-top: 8px;
      }
      .ledger-preview-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: #6b7a8a;
        margin-bottom: 8px;
      }
      .ledger-receipt-paper {
        background: #fcfaf5;
        border: 1px dashed #ccc6b8;
        border-radius: 12px;
        padding: 20px;
        font-family: 'Inter', monospace;
        font-size: 13px;
        color: #1e2a3a;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
      }
      .ledger-receipt-line {
        margin: 0;
        text-align: center;
      }
      .ledger-receipt-line.muted {
        color: #a69f8e;
        font-style: italic;
      }
      .ledger-receipt-dashes {
        height: 1px;
        margin: 12px 0;
        background: repeating-linear-gradient(90deg, #ccc6b8 0 4px, transparent 4px 10px);
      }

      /* ----- FOOTER ----- */
      .ledger-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 8px;
      }
      .ledger-btn-cancel {
        padding: 12px 24px;
        border-radius: 10px;
        border: 1px solid #e2ddd4;
        background: transparent;
        color: #5f6a7a;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        font-family: 'Inter', sans-serif;
      }
      .ledger-btn-cancel:hover {
        background: #f4f1eb;
        border-color: #cbc6b9;
      }
      .ledger-btn-save {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 28px;
        border-radius: 10px;
        border: none;
        background: #1e2a3a;
        color: #ffffff;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: all 0.15s ease;
        min-width: 160px;
        font-family: 'Inter', sans-serif;
        box-shadow: 0 2px 8px rgba(30,42,58,0.15);
      }
      .ledger-btn-save:hover:not(:disabled) {
        background: #2c3e52;
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(30,42,58,0.2);
      }
      .ledger-btn-save:disabled {
        opacity: 0.65;
        cursor: not-allowed;
        transform: none;
      }
      .ledger-btn-save:active:not(:disabled) {
        transform: translateY(0);
      }

      /* ----- RESPONSIVE ----- */
      @media (max-width: 720px) {
        .ledger-root {
          padding: 16px;
        }
        .ledger-header {
          flex-direction: column;
          align-items: stretch;
          padding: 20px;
        }
        .ledger-header-right {
          justify-content: flex-start;
        }
        .ledger-body {
          flex-direction: column;
        }
        .ledger-index {
          flex-direction: row;
          overflow-x: auto;
          flex: none;
          width: 100%;
          padding-top: 0;
          gap: 6px;
          margin-bottom: 12px;
        }
        .ledger-index-tab {
          border-radius: 10px;
          padding: 10px 16px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .ledger-index-tab.active {
          transform: none;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .ledger-index-tab .ledger-index-flag {
          display: none;
        }
        .ledger-card {
          border-radius: 16px;
          border: 1px solid #eae7e0;
          padding: 20px;
        }
        .ledger-fields {
          grid-template-columns: 1fr;
        }
        .ledger-footer {
          flex-wrap: wrap;
          justify-content: stretch;
        }
        .ledger-btn-cancel,
        .ledger-btn-save {
          flex: 1;
          min-width: 0;
        }
      }
    `}</style>
  );
}