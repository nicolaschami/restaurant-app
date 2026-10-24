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
import { COUNTRIES, CURRENCIES, TIME_ZONES, findCountry } from '../lib/countries';
import { loadRestaurantSettings } from '../lib/restaurantSettings';
import { toast } from '../components/Toaster';

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
  tax_rate: string | number | null; // restaurant tax rate in %
  tax_name: string | null; // "VAT", "TVA"…
  prices_include_tax: boolean; // true = menu prices already include the tax
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

type TabType = 'general' | 'location' | 'financial' | 'receipts';

const TABS: { id: TabType; label: string; icon: typeof Store; accent: string }[] = [
  { id: 'general', label: 'General & Brand', icon: Store, accent: '#c9a24b' },
  { id: 'location', label: 'Location', icon: MapPin, accent: '#c9a24b' },
  { id: 'financial', label: 'Financial', icon: CreditCard, accent: '#c9a24b' },
  { id: 'receipts', label: 'Receipt Layout', icon: Printer, accent: '#c9a24b' },
];

export default function EditRestaurantScreen({ restaurantId = 1 }: { restaurantId?: number }) {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0); // +1 = reload the saved values ("Discard changes")

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
    tax_rate: '0',
    tax_name: 'VAT',
    prices_include_tax: false,
    is_active: true,
  });

  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await api.get(`/restaurant/${restaurantId}`);

        const r = res.data.restaurant ?? res.data;
        const c = findCountry(r.country);
        setFormData({
          ...r,
          country: c ? c.code : r.country,
          // the server's names are camelCase for these columns
          logo_url: r.logoUrl ?? r.logo_url ?? '',
          created_at: r.createdAt ?? r.created_at,
          updated_at: r.updatedAt ?? r.updated_at,
        });
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
  }, [restaurantId, reloadKey]);

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

  // Logo: upload a picture (JPG, PNG, WEBP, GIF); it is kept when you click Save.
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('images', file);
      const res = await api.post('/upload', fd);
      const url = res.data?.urls?.[0];
      if (url) {
        setFormData((prev) => ({ ...prev, logo_url: url }));
        toast.success('Logo uploaded', 'Click Save to keep it.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'The logo could not be uploaded.';
      setError(msg);
      toast.error('Logo not uploaded', msg);
    } finally {
      setUploadingLogo(false);
    }
  };

  // Choosing the country fills in its currency and time zone (both can still be changed).
  const handleCountry = (code: string) => {
    const c = COUNTRIES.find((x) => x.code === code);
    setFormData((prev) => ({
      ...prev,
      country: code,
      currency: c ? c.currency : prev.currency,
      timezone: c ? c.timezone : prev.timezone,
    }));
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
        logoUrl: formData.logo_url || null, // the server's name for the logo
        updated_at: new Date().toISOString(),
      });

      await loadRestaurantSettings(); // the whole app uses the new currency / tax
      setSuccess(true);
      toast.success('Restaurant info saved', 'Currency, tax and details are now used everywhere.');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving restaurant information:', err);
      const msg = err?.response?.data?.error || 'Failed to update restaurant information.';
      setError(msg);
      toast.error('Not saved', msg);
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
          <p className="ledger-eyebrow">Settings · Restaurant Info</p>
          <h1 className="ledger-title">{formData.name || 'Untitled Restaurant'}</h1>
          <p className="ledger-subline">
            #{String(formData.id).padStart(4, '0')}
            {formData.city ? ` · ${formData.city}` : ''}
            {findCountry(formData.country) ? ` · ${findCountry(formData.country)!.name}` : ''}
          </p>
        </div>
        {/* The money settings at a glance */}
        <div className="ledger-chips">
          <span className="ledger-chip">{formData.currency || 'USD'}</span>
          <span className="ledger-chip">
            {formData.tax_name || 'VAT'} {Number(formData.tax_rate ?? 0)}%{formData.prices_include_tax ? ' incl.' : ' added'}
          </span>
          <span className="ledger-chip">{formData.timezone || 'UTC'}</span>
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
                <Field label="Logo" span={2}>
                  <div className="ledger-logo-row">
                    <div className="ledger-logo-box">
                      {formData.logo_url ? (
                        <img src={formData.logo_url} alt="Logo" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      ) : (
                        <ImageIcon className="w-6 h-6" />
                      )}
                    </div>
                    <div className="ledger-logo-actions">
                      <label className="ledger-btn-upload">
                        {uploadingLogo ? <Loader2 className="w-4 h-4" style={{ animation: 'ledger-spin 0.8s linear infinite' }} /> : <ImageIcon className="w-4 h-4" />}
                        {uploadingLogo ? 'Uploading…' : formData.logo_url ? 'Change logo' : 'Upload logo'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            uploadLogo(e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {formData.logo_url && (
                        <button type="button" className="ledger-btn-cancel" onClick={() => setFormData((prev) => ({ ...prev, logo_url: '' }))}>
                          Remove
                        </button>
                      )}
                      <span className="ledger-hint">JPG, PNG, WEBP or GIF · square works best · kept when you click Save</span>
                    </div>
                  </div>
                </Field>
                <p className="ledger-audit" style={{ gridColumn: '1 / -1' }}>
                  Restaurant #{formData.id}
                  {formData.created_at ? ` · created ${new Date(formData.created_at).toLocaleDateString('en-GB')}` : ''}
                  {formData.updated_at ? ` · last saved ${new Date(formData.updated_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
                </p>
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
                <Field label="Country">
                  <select
                    name="country"
                    value={findCountry(formData.country)?.code ?? ''}
                    onChange={(e) => handleCountry(e.target.value)}
                    className="ledger-input"
                  >
                    <option value="">Choose the country…</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Timezone">
                  <select name="timezone" value={formData.timezone || 'UTC'} onChange={handleChange} className="ledger-input">
                    {!TIME_ZONES.includes(formData.timezone || 'UTC') && <option value={formData.timezone || 'UTC'}>{formData.timezone || 'UTC'}</option>}
                    {TIME_ZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            {activeTab === 'financial' && (
              <div className="ledger-fields">
                <Field label="Currency">
                  <select name="currency" value={formData.currency || 'USD'} onChange={handleChange} className="ledger-input">
                    {!CURRENCIES.some((c) => c.code === (formData.currency || 'USD')) && (
                      <option value={formData.currency || 'USD'}>{formData.currency}</option>
                    )}
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tax name (on the receipt)">
                  <input
                    type="text"
                    name="tax_name"
                    maxLength={30}
                    placeholder="VAT"
                    value={formData.tax_name ?? ''}
                    onChange={handleChange}
                    className="ledger-input"
                  />
                </Field>
                <Field label="Tax rate (%)">
                  <input
                    type="number"
                    name="tax_rate"
                    min={0}
                    max={100}
                    step="0.01"
                    placeholder="e.g. 11"
                    value={formData.tax_rate ?? ''}
                    onChange={handleChange}
                    className="ledger-input"
                  />
                </Field>
                <Field label="Menu prices">
                  <select
                    name="prices_include_tax"
                    value={formData.prices_include_tax ? 'included' : 'added'}
                    onChange={(e) => setFormData((prev) => ({ ...prev, prices_include_tax: e.target.value === 'included' }))}
                    className="ledger-input"
                  >
                    <option value="added">Tax added on top (price + tax = total)</option>
                    <option value="included">Prices include tax (price = total)</option>
                  </select>
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

            <div className="ledger-tear" style={{ marginTop: 22 }} />

            <div className="ledger-footer">
              <button type="button" className="ledger-btn-cancel" onClick={() => setReloadKey((k) => k + 1)}>
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
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save
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
      /* Same look as the rest of the app (2026-10-25): dark green #131c18, gold #c9a24b,
         white cards on a light grey page, compact. */
      .ledger-root {
        min-height: 100%;
        background: #f8fafc;
        padding: 16px;
        font-family: inherit;
        color: #1e293b;
      }

      @keyframes ledger-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      /* ----- HEADER (one line) ----- */
      .ledger-header {
        max-width: 1040px;
        margin: 0 auto 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        background: #131c18;
        padding: 12px 18px;
        border-radius: 12px;
        border-bottom: 2px solid #c9a24b;
        box-shadow: 0 4px 14px rgba(19,28,24,0.18);
      }
      .ledger-header-left { flex: 1; min-width: 200px; }
      .ledger-eyebrow {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #c9a24b;
        margin: 0 0 2px;
      }
      .ledger-title {
        font-size: 20px;
        font-weight: 800;
        color: #ffffff;
        margin: 0;
        line-height: 1.15;
      }
      .ledger-subline {
        font-size: 12px;
        color: #a7b3ad;
        margin: 2px 0 0;
      }
      .ledger-chips { display: flex; gap: 6px; flex-wrap: wrap; }
      .ledger-chip {
        font-size: 11px;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 999px;
        color: #c9a24b;
        background: rgba(201,162,75,0.12);
        border: 1px solid rgba(201,162,75,0.45);
        white-space: nowrap;
      }
      .ledger-header-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
      .ledger-medallion {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid #c9a24b;
        background: #1f2d26;
      }
      .ledger-medallion-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #c9a24b;
      }

      /* ----- ALERT ----- */
      .ledger-alert {
        max-width: 1040px;
        margin: 0 auto 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #b91c1c;
        font-size: 13px;
        font-weight: 600;
        padding: 10px 14px;
        border-radius: 10px;
      }

      /* ----- LOADING ----- */
      .ledger-loading { display: flex; justify-content: center; padding: 60px 0; color: #131c18; }

      /* ----- BODY (tabs + card) ----- */
      .ledger-body { max-width: 1040px; margin: 0 auto; display: flex; gap: 12px; align-items: flex-start; }

      /* ----- TABS (left) ----- */
      .ledger-index {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 0 0 190px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 6px;
        box-shadow: 0 1px 3px rgba(15,23,42,0.05);
      }
      .ledger-index-tab {
        position: relative;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px 12px;
        border: none;
        background: transparent;
        color: #475569;
        font-size: 13px;
        font-weight: 600;
        text-align: left;
        cursor: pointer;
        border-radius: 8px;
        transition: background 0.15s ease, color 0.15s ease;
        font-family: inherit;
      }
      .ledger-index-tab .ledger-index-flag {
        position: absolute;
        left: 0;
        top: 22%;
        bottom: 22%;
        width: 3px;
        border-radius: 3px;
        background: #c9a24b;
        opacity: 0;
      }
      .ledger-index-tab svg { color: #94a3b8; }
      .ledger-index-tab:hover { background: rgba(201,162,75,0.10); color: #131c18; }
      .ledger-index-tab.active { background: #131c18; color: #ffffff; }
      .ledger-index-tab.active .ledger-index-flag { opacity: 1; }
      .ledger-index-tab.active svg { color: #c9a24b; }

      /* ----- CARD ----- */
      .ledger-card {
        flex: 1;
        background: #ffffff;
        border-radius: 12px;
        padding: 18px 22px;
        border: 1px solid #e2e8f0;
        border-top: 3px solid #c9a24b;
        box-shadow: 0 1px 3px rgba(15,23,42,0.06);
        min-height: 360px;
      }
      .ledger-card-heading { font-size: 16px; font-weight: 800; color: #131c18; margin: 0; }
      .ledger-tear { height: 1px; margin: 12px 0 16px; background: #e2e8f0; }

      /* ----- FIELDS ----- */
      .ledger-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; }
      .ledger-field { display: flex; flex-direction: column; gap: 5px; }
      .ledger-field-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #64748b;
      }
      .ledger-required { color: #dc2626; }
      .ledger-input {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 14px;
        font-family: inherit;
        color: #1e293b;
        width: 100%;
        height: 38px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      select.ledger-input { cursor: pointer; }
      .ledger-input:focus { outline: none; border-color: #c9a24b; box-shadow: 0 0 0 3px rgba(201,162,75,0.18); }
      .ledger-input::placeholder { color: #94a3b8; }
      .ledger-input-disabled { background: #f1f5f9; color: #64748b; border-style: dashed; cursor: not-allowed; }
      .ledger-textarea { resize: vertical; min-height: 80px; height: auto; padding: 10px 12px; }

      /* ----- TOGGLE ----- */
      .ledger-toggle-row { grid-column: 1 / -1; padding-top: 4px; }
      .ledger-toggle { display: flex; align-items: center; gap: 12px; cursor: pointer; user-select: none; }
      .ledger-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
      .ledger-toggle-track { width: 40px; height: 22px; border-radius: 11px; background: #cbd5e1; position: relative; transition: background 0.2s ease; flex-shrink: 0; }
      .ledger-toggle-thumb { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.25); transition: transform 0.2s ease; }
      .ledger-toggle input:checked + .ledger-toggle-track { background: #c9a24b; }
      .ledger-toggle input:checked + .ledger-toggle-track .ledger-toggle-thumb { transform: translateX(18px); }
      .ledger-toggle-label { font-size: 13px; font-weight: 500; color: #334155; }

      /* ----- RECEIPT PREVIEW ----- */
      .ledger-receipt-preview { margin-top: 4px; }
      .ledger-preview-label { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: #64748b; margin-bottom: 6px; }
      .ledger-receipt-paper {
        max-width: 320px;
        margin: 0 auto;
        background: #fffdf7;
        border: 1px dashed #d6c79b;
        border-radius: 10px;
        padding: 16px;
        font-family: ui-monospace, monospace;
        font-size: 12px;
        color: #1e293b;
      }
      .ledger-receipt-line { margin: 0; text-align: center; white-space: pre-line; }
      .ledger-receipt-line.muted { color: #94a3b8; font-style: italic; }
      .ledger-receipt-dashes { height: 1px; margin: 10px 0; background: repeating-linear-gradient(90deg, #d6c79b 0 4px, transparent 4px 9px); }

      /* ----- LOGO ----- */
      .ledger-logo-row { display: flex; align-items: center; gap: 14px; }
      .ledger-logo-box {
        width: 72px; height: 72px; flex-shrink: 0; border-radius: 12px; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        background: #f8fafc; border: 1px dashed #c9a24b; color: #c9a24b;
      }
      .ledger-logo-box img { width: 100%; height: 100%; object-fit: cover; }
      .ledger-logo-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .ledger-btn-upload {
        display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 16px;
        border-radius: 8px; background: #131c18; color: #fff; font-size: 13px; font-weight: 700; cursor: pointer;
      }
      .ledger-btn-upload svg { color: #c9a24b; }
      .ledger-btn-upload:hover { background: #1f2d26; }
      .ledger-hint { font-size: 11px; color: #94a3b8; width: 100%; }
      .ledger-audit { margin: 4px 0 0; font-size: 11px; color: #94a3b8; }

      /* ----- FOOTER ----- */
      .ledger-footer { display: flex; justify-content: flex-end; gap: 10px; }
      .ledger-btn-cancel {
        height: 38px;
        padding: 0 18px;
        border-radius: 8px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #475569;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      .ledger-btn-cancel:hover { background: #f1f5f9; }
      .ledger-btn-save {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 38px;
        padding: 0 22px;
        border-radius: 8px;
        border: none;
        background: #131c18;
        color: #ffffff;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        min-width: 130px;
        font-family: inherit;
      }
      .ledger-btn-save svg { color: #c9a24b; }
      .ledger-btn-save:hover:not(:disabled) { background: #1f2d26; }
      .ledger-btn-save:disabled { opacity: 0.6; cursor: not-allowed; }

      /* ----- NARROW SCREENS ----- */
      @media (max-width: 720px) {
        .ledger-root { padding: 10px; }
        .ledger-body { flex-direction: column; }
        .ledger-index { flex-direction: row; overflow-x: auto; flex: none; width: 100%; }
        .ledger-index-tab { white-space: nowrap; flex-shrink: 0; }
        .ledger-index-tab .ledger-index-flag { display: none; }
        .ledger-fields { grid-template-columns: 1fr; }
        .ledger-footer { flex-wrap: wrap; }
        .ledger-btn-cancel, .ledger-btn-save { flex: 1; min-width: 0; }
      }
    `}</style>
  );
}