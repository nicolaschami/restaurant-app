
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { api } from '../api';
import PurchaseTransactionEditModal from './PurchaseTransactionEditModal';

interface PurchaseTransaction {
  id: number;
  transactionNumber: string;
  supplierCode: string;
  supplierName: string;
  date: string;
  itemCount: number;
  total: number;
  discount: number;
  tax: number;
  net: number;
  status: 'Draft' | 'Posted' | 'Cancelled';
}

interface PurchaseTransactionDetail extends PurchaseTransaction {
  reference: string;
  comment: string;
  attachmentName: string | null;
  items: Array<{
    id: string;
    name: string;
    unit: string;
    qty: number;
    unitCost: number;
    discountPct: number;
    lineTotal: number;
  }>;
}

type SortKey = keyof Pick<
  PurchaseTransaction,
  | 'transactionNumber'
  | 'supplierCode'
  | 'supplierName'
  | 'date'
  | 'itemCount'
  | 'total'
  | 'discount'
  | 'tax'
  | 'net'
>;

type SortDirection = 'asc' | 'desc';

interface PurchaseTransactionsListProps {
  onNewPurchase?: () => void;
  onEditPurchase?: (transactionId: number) => void;
  restaurantId?: number;
}

type ApiTransaction = Record<string, any>;

const formatMoney = (value: number) =>
  `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value: string) => {
  if (!value) return '—';

  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const toISODate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
};

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

const SearchIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const CalendarIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8 2v4M16 2v4" />
    <rect width="18" height="18" x="3" y="4" rx="3" />
    <path d="M3 10h18" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
  </svg>
);

const ChevronIcon = ({
  direction,
}: {
  direction: 'up' | 'down';
}) => (
  <svg
    className={`pt-sort-icon pt-sort-${direction}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const ResetIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const PlusIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12h14M12 5v14" />
  </svg>
);

/* -------------------------------------------------------------------------- */
/* Custom Calendar                                                            */
/* -------------------------------------------------------------------------- */

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  min?: string;
  max?: string;
  align?: 'left' | 'right';
}

const DatePicker: FC<DatePickerProps> = ({
  id,
  value,
  onChange,
  placeholder = 'Select date',
  ariaLabel,
  min,
  max,
  align = 'left',
}) => {
  const [open, setOpen] = useState(false);

  const [viewMonth, setViewMonth] = useState<Date>(() =>
    value ? new Date(`${value}T00:00:00`) : new Date()
  );

  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (value) {
      setViewMonth(new Date(`${value}T00:00:00`));
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;

    const handle = (e: MouseEvent) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handle);

    return () => {
      document.removeEventListener('mousedown', handle);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handle);

    return () => {
      document.removeEventListener('keydown', handle);
    };
  }, [open]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { date: Date; muted: boolean }[] = [];

  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    cells.push({
      date: new Date(year, month - 1, daysInPrevMonth - i),
      muted: true,
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: new Date(year, month, d),
      muted: false,
    });
  }

  const remaining = 42 - cells.length;

  for (let d = 1; d <= remaining; d++) {
    cells.push({
      date: new Date(year, month + 1, d),
      muted: true,
    });
  }

  const selectedISO = value || '';
  const todayISO = toISODate(new Date());

  const isDisabled = (iso: string) =>
    Boolean((min && iso < min) || (max && iso > max));

  const handleSelect = (date: Date) => {
    const iso = toISODate(date);

    if (isDisabled(iso)) return;

    onChange(iso);
    setOpen(false);
  };

  const monthLabel = viewMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="pt-date-wrap" ref={wrapRef}>
      <span className="pt-date-icon">
        <CalendarIcon />
      </span>

      <button
        id={id}
        type="button"
        className={`pt-date${open ? ' pt-date-open' : ''}${
          !value ? ' pt-date-placeholder' : ''
        }`}
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {value ? formatDate(value) : placeholder}
      </button>

      {open && (
        <div
          className="pt-cal-popover"
          role="dialog"
          aria-label="Choose date"
          style={
            align === 'right'
              ? {
                  left: 'auto',
                  right: 0,
                }
              : undefined
          }
        >
          <div className="pt-cal-header">
            <button
              type="button"
              className="pt-cal-nav-btn"
              onClick={() =>
                setViewMonth(new Date(year, month - 1, 1))
              }
              aria-label="Previous month"
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>

            <span className="pt-cal-title">
              {monthLabel}
            </span>

            <div className="pt-cal-nav">
              <button
                type="button"
                className="pt-cal-nav-btn"
                onClick={() =>
                  setViewMonth(new Date(year, month + 1, 1))
                }
                aria-label="Next month"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="15"
                  height="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>

          <div className="pt-cal-grid">
            {WEEK_DAYS.map((day) => (
              <div
                className="pt-cal-day-label"
                key={day}
              >
                {day}
              </div>
            ))}

            {cells.map(({ date, muted }, idx) => {
              const iso = toISODate(date);
              const isSelected = iso === selectedISO;
              const isToday = iso === todayISO;
              const disabled = isDisabled(iso);

              return (
                <button
                  key={idx}
                  type="button"
                  className={[
                    'pt-cal-day',
                    muted ? 'pt-cal-day-muted' : '',
                    isSelected
                      ? 'pt-cal-day-selected'
                      : '',
                    isToday && !isSelected
                      ? 'pt-cal-day-today'
                      : '',
                    disabled
                      ? 'pt-cal-day-disabled'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handleSelect(date)}
                  disabled={disabled}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="pt-cal-footer">
            <button
              type="button"
              className="pt-cal-action"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Clear
            </button>

            <button
              type="button"
              className="pt-cal-action pt-cal-action-primary"
              onClick={() => {
                onChange(toISODate(new Date()));
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Main Component                                                             */
/* -------------------------------------------------------------------------- */

const PurchaseTransactionsList: FC<
  PurchaseTransactionsListProps
> = ({
  onNewPurchase,
  onEditPurchase,
  restaurantId = 1,
}) => {
  const [transactions, setTransactions] = useState<
    PurchaseTransaction[]
  >([]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<
    'All' | PurchaseTransaction['status']
  >('All');

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [sortKey, setSortKey] =
    useState<SortKey>('date');

  const [sortDirection, setSortDirection] =
    useState<SortDirection>('desc');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selected, setSelected] =
    useState<PurchaseTransaction | null>(null);

  const [selectedDetail, setSelectedDetail] =
    useState<PurchaseTransactionDetail | null>(null);

  const [isDetailLoading, setIsDetailLoading] =
    useState(false);

  const [detailError, setDetailError] = useState('');

  const [editingTransactionId, setEditingTransactionId] =
    useState<number | null>(null);

  /* ---------------------------------------------------------------------- */
  /* Load transactions                                                      */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const loadTransactions = async () => {
      try {
        setIsLoading(true);
        setLoadError('');

        const res = await api.get('/stock-transactions', {
          params: {
            restaurantId,
          },
        });

        const rawData =
          res.data?.transactions || res.data;

        const rows: ApiTransaction[] =
          Array.isArray(rawData) ? rawData : [];

        const mapped = rows.map(
          (row, index): PurchaseTransaction => {
            const rawSupplier = String(
              row.SupplierName ??
                row.supplierName ??
                ''
            );

            const supplierParts =
              rawSupplier.split(' - ');

            const explicitSupplierCode =
              row.SupplierCode ??
              row.supplierCode;

            const explicitSupplierName =
              row.supplierName;

            const supplierCode = String(
              explicitSupplierCode ??
                (supplierParts.length > 1
                  ? supplierParts[0]
                  : '')
            );

            const supplierName = String(
              explicitSupplierName ??
                (supplierParts.length > 1
                  ? supplierParts
                      .slice(1)
                      .join(' - ')
                  : rawSupplier)
            );

            const rawDate =
              row.TransactionDate ??
              row.transactionDate ??
              row.date ??
              '';

            const parsedStatus = String(
              row.Status ??
                row.status ??
                'Draft'
            ).toLowerCase();

            const status: PurchaseTransaction['status'] =
              parsedStatus === 'posted'
                ? 'Posted'
                : parsedStatus === 'cancelled' ||
                    parsedStatus === 'canceled'
                  ? 'Cancelled'
                  : 'Draft';

            const details = Array.isArray(
              row.details
            )
              ? row.details
              : Array.isArray(row.Details)
                ? row.Details
                : [];

            return {
              id: Number(
                row.TransactionID ??
                  row.transactionId ??
                  row.id ??
                  index
              ),

              transactionNumber: String(
                row.TransactionNumber ??
                  row.transactionNumber ??
                  row.GRNNumber ??
                  row.grnNumber ??
                  '—'
              ),

              supplierCode,

              supplierName,

              date: rawDate
                ? new Date(rawDate)
                    .toISOString()
                    .slice(0, 10)
                : '',

              itemCount: Number(
                row.itemCount ??
                  row.ItemCount ??
                  details.length
              ),

              total: Number(
                row.Subtotal ??
                  row.subtotal ??
                  row.Total ??
                  row.total ??
                  0
              ),

              discount: Number(
                row.DiscountAmount ??
                  row.discountAmount ??
                  row.discount ??
                  0
              ),

              tax: Number(
                row.TaxAmount ??
                  row.taxAmount ??
                  row.tax ??
                  0
              ),

              net: Number(
                row.NetTotal ??
                  row.netTotal ??
                  row.net ??
                  0
              ),

              status,
            };
          }
        );

        setTransactions(mapped);
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Failed to load transactions'
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadTransactions();
  }, [restaurantId]);

  /* ---------------------------------------------------------------------- */
  /* Filtering and sorting                                                  */
  /* ---------------------------------------------------------------------- */

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return transactions
      .filter((transaction) => {
        const matchesSearch =
          !query ||
          [
            transaction.transactionNumber,
            transaction.supplierCode,
            transaction.supplierName,
            transaction.date,
            formatDate(transaction.date),
            transaction.status,
            transaction.itemCount,
            transaction.total,
            transaction.discount,
            transaction.tax,
            transaction.net,
          ].some((value) =>
            String(value)
              .toLowerCase()
              .includes(query)
          );

        const matchesStatus =
          status === 'All' ||
          transaction.status === status;

        const matchesFrom =
          !fromDate ||
          transaction.date >= fromDate;

        const matchesTo =
          !toDate ||
          transaction.date <= toDate;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesFrom &&
          matchesTo
        );
      })
      .sort((a, b) => {
        const first = a[sortKey];
        const second = b[sortKey];

        const result =
          typeof first === 'number' &&
          typeof second === 'number'
            ? first - second
            : String(first).localeCompare(
                String(second)
              );

        return sortDirection === 'asc'
          ? result
          : -result;
      });
  }, [
    fromDate,
    search,
    sortDirection,
    sortKey,
    status,
    toDate,
    transactions,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredTransactions.length / pageSize
    )
  );

  const currentPage = Math.min(
    page,
    totalPages
  );

  const visibleTransactions =
    filteredTransactions.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );

  const postedTotal = filteredTransactions
    .filter((transaction) =>
      transaction.status === 'Posted'
    )
    .reduce(
      (sum, transaction) =>
        sum + transaction.net,
      0
    );

  const updateSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('All');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  /* ---------------------------------------------------------------------- */
  /* Open transaction detail modal                                          */
  /* ---------------------------------------------------------------------- */

  const openTransaction = async (
    transaction: PurchaseTransaction
  ) => {
    setSelected(transaction);
    setSelectedDetail(null);
    setDetailError('');
    setIsDetailLoading(true);

    try {
      const [
        response,
        materialsResponse,
      ] = await Promise.all([
        api.get(
          `/stock-transactions/${transaction.id}`,
          {
            params: {
              restaurantId,
            },
          }
        ),

        api.get('/raw-materials', {
          params: {
            restaurantId,
          },
        }),
      ]);

      const row: ApiTransaction =
        response.data?.transaction ||
        response.data;

      const rawMaterials = Array.isArray(
        materialsResponse.data
      )
        ? materialsResponse.data
        : materialsResponse.data
            ?.rawMaterials ||
          materialsResponse.data?.data ||
          [];

      const materialNames =
        new Map<string, string>();

      rawMaterials.forEach(
        (material: ApiTransaction) => {
          const id =
            material.id ??
            material.raw_material_id ??
            material.rawMaterialId ??
            material.RawMaterialID;

          const name =
            material.name ??
            material.materialName ??
            material.rawMaterialName ??
            material.RawMaterialName ??
            material.ProductName;

          if (id != null && name) {
            materialNames.set(
              String(id),
              String(name)
            );
          }
        }
      );

      const rawItems = Array.isArray(
        row.details
      )
        ? row.details
        : Array.isArray(row.Details)
          ? row.Details
          : [];

      const items = rawItems.map(
        (
          item: ApiTransaction,
          index: number
        ) => {
          const rawMaterialId =
            item.raw_material_id ??
            item.rawMaterialId ??
            item.RawMaterialID ??
            item.productId ??
            item.ProductID;

          const nestedMaterial =
            item.rawMaterial ??
            item.raw_material ??
            item.material ??
            item.product ??
            item.Product ??
            item.RawMaterial;

          const nestedName =
            nestedMaterial?.name ??
            nestedMaterial?.materialName ??
            nestedMaterial?.rawMaterialName ??
            nestedMaterial?.RawMaterialName ??
            nestedMaterial?.ProductName;

          const itemName =
            item.name ??
            item.itemname ??
            item.materialName ??
            item.rawMaterialName ??
            item.RawMaterialName ??
            item.ProductName ??
            item.description ??
            nestedName ??
            materialNames.get(
              String(rawMaterialId)
            );

          const qty = Number(
            item.qty ??
              item.quantity ??
              item.Qty ??
              item.Quantity ??
              0
          );

          const unitCost = Number(
            item.unitCost ??
              item.unit_cost ??
              item.Cost ??
              item.cost ??
              0
          );

          const discountPct = Number(
            item.discountPct ??
              item.discount_percent ??
              item.DiscountPct ??
              0
          );

          return {
            id: String(
              item.id ??
                item.detailId ??
                item.DetailID ??
                index
            ),

            name: String(
              itemName ?? 'Unnamed item'
            ),

            unit: String(
              item.unit ??
                item.Unit ??
                '—'
            ),

            qty,

            unitCost,

            discountPct,

            lineTotal:
              qty *
              unitCost *
              (1 - discountPct / 100),
          };
        }
      );

      setSelectedDetail({
        ...transaction,

        reference: String(
          row.reference ??
            row.Reference ??
            row.invoiceNumber ??
            row.InvoiceNumber ??
            ''
        ),

        comment: String(
          row.comment ??
            row.Comment ??
            row.remark ??
            row.Remark ??
            ''
        ),

        attachmentName:
          row.attachmentName ??
          row.AttachmentName ??
          row.attachment ??
          null,

        items,
      });
    } catch (error) {
      setDetailError(
        error instanceof Error
          ? error.message
          : 'Could not load full transaction details'
      );
    } finally {
      setIsDetailLoading(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Edit transaction                                                        */
  /* ---------------------------------------------------------------------- */

  const editTransaction = (
    transaction: PurchaseTransaction
  ) => {
    setSelected(null);
    setSelectedDetail(null);

    if (onEditPurchase) {
      onEditPurchase(transaction.id);
    } else {
      setEditingTransactionId(transaction.id);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Sorting                                                                 */
  /* ---------------------------------------------------------------------- */

  const changeSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((direction) =>
        direction === 'asc' ? 'desc' : 'asc'
      );
    } else {
      setSortKey(key);
      setSortDirection(
        key === 'date' ? 'desc' : 'asc'
      );
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (
      <ChevronIcon
        direction={
          sortDirection === 'asc'
            ? 'up'
            : 'down'
        }
      />
    ) : (
      <span className="pt-sort-idle">↕</span>
    );

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <main className="pt-page">
      <style>{`
        .pt-page,
        .pt-page * {
          box-sizing: border-box;
        }

        .pt-page {
          min-height: 100vh;
          padding: 1rem 2rem 1.5rem;
          color: #3d2d27;
          background-color: #faf7f2;
          background-image:
            radial-gradient(
              at 0% 0%,
              rgba(139, 90, 43, 0.035) 0px,
              transparent 50%
            );
          font-family:
            Inter,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            sans-serif;
          -webkit-font-smoothing: antialiased;
          display: flex;
          flex-direction: column;
        }

        .pt-shell {
          max-width: 1440px;
          width: 100%;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
        }

        .pt-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.75rem;
          flex-shrink: 0;
        }

        .pt-title {
          margin: 0;
          color: #2b1f1a;
          font-size: 1.35rem;
          font-weight: 800;
          letter-spacing: -0.025em;
          line-height: 1.2;
        }

        .pt-new-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          height: 36px;
          border: 1px solid #5a351b;
          border-radius: 8px;
          padding: 0 1rem;
          background: #6e4223;
          color: #ffffff;
          font-size: 0.78125rem;
          font-weight: 600;
          cursor: pointer;
          box-shadow:
            0 3px 10px rgba(110, 66, 35, 0.25);
          transition: all 0.18s ease;
        }

        .pt-new-btn svg {
          width: 15px;
          height: 15px;
        }

        .pt-new-btn:hover {
          background: #5a351b;
          box-shadow:
            0 6px 16px rgba(110, 66, 35, 0.35);
          transform: translateY(-1px);
        }

        .pt-card {
          border: 1px solid #e8decb;
          border-radius: 12px;
          background: #ffffff;
          box-shadow:
            0 6px 18px -4px rgba(61, 45, 39, 0.08);
          overflow: visible;
          display: flex;
          flex-direction: column;
        }

        .pt-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 0.75rem;
          padding: 0.9rem 1.5rem;
          border-bottom: 1px solid #f2ebe1;
          background: #ffffff;
          flex-shrink: 0;
          border-radius: 12px 12px 0 0;
          position: relative;
          z-index: 5;
        }

        .pt-search-wrap {
          position: relative;
          flex: 1 1 240px;
          min-width: 180px;
        }

        .pt-filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          flex: 0 1 150px;
        }

        .pt-filter-label {
          color: #7a685d;
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.02em;
        }

        .pt-filter-group-status {
          flex-basis: 125px;
        }

        .pt-search-wrap svg {
          position: absolute;
          top: 50%;
          left: 12px;
          width: 16px;
          height: 16px;
          color: #a39285;
          transform: translateY(-50%);
          pointer-events: none;
        }

        .pt-date-wrap {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
        }

        .pt-date-icon {
          position: absolute;
          left: 11px;
          width: 15px;
          height: 15px;
          color: #8b5a2b;
          pointer-events: none;
          opacity: 0.75;
          z-index: 1;
        }

        .pt-date {
          width: 100%;
          height: 38px;
          border: 1px solid #e3d7c5;
          border-radius: 8px;
          padding: 0 0.75rem 0 2.35rem;
          background: #fcfaf7;
          color: #2b1f1a;
          font-size: 0.8125rem;
          font-weight: 500;
          text-align: left;
          cursor: pointer;
          transition: all 0.18s ease;
          display: flex;
          align-items: center;
        }

        .pt-date.pt-date-placeholder {
          color: #b7a99c;
        }

        .pt-date:hover {
          border-color: #d9cbba;
          background: #ffffff;
        }

        .pt-date.pt-date-open,
        .pt-date:focus {
          outline: none;
          border-color: #8b5a2b;
          background: #ffffff;
          box-shadow:
            0 0 0 4px rgba(139, 90, 43, 0.10);
        }

        .pt-search,
        .pt-select {
          height: 38px;
          border: 1px solid #e3d7c5;
          border-radius: 8px;
          background: #fcfaf7;
          color: #2b1f1a;
          font-size: 0.8125rem;
          font-weight: 500;
          transition: all 0.18s ease;
        }

        .pt-search {
          width: 100%;
          padding: 0 0.875rem 0 2.5rem;
        }

        .pt-search::placeholder {
          color: #b7a99c;
          font-weight: 400;
        }

        .pt-select {
          width: 100%;
          padding: 0 0.75rem;
          cursor: pointer;
        }

        .pt-search:focus,
        .pt-select:focus {
          outline: none;
          border-color: #8b5a2b;
          background: #ffffff;
          box-shadow:
            0 0 0 4px rgba(139, 90, 43, 0.10);
        }

        .pt-reset-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          height: 38px;
          border: 1px solid #d9cbba;
          border-radius: 8px;
          padding: 0 1rem;
          background: #fcfaf7;
          color: #6e4223;
          font-size: 0.78125rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s ease;
          white-space: nowrap;
        }

        .pt-reset-btn svg {
          width: 14px;
          height: 14px;
        }

        .pt-reset-btn:hover {
          border-color: #8b5a2b;
          background: #6e4223;
          color: #ffffff;
          box-shadow:
            0 3px 10px rgba(110, 66, 35, 0.20);
        }

        .pt-summary {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          margin-left: auto;
          color: #7a685d;
          font-size: 0.78125rem;
          white-space: nowrap;
          font-weight: 500;
        }

        .pt-summary-item {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }

        .pt-summary strong {
          color: #2b1f1a;
          font-weight: 700;
        }

        .pt-table-wrap {
          max-height: 80vh;
          overflow-y: auto;
          overflow-x: auto;
        }

        .pt-table {
          width: 100%;
          min-width: 950px;
          border-collapse: collapse;
          text-align: left;
        }

        .pt-th {
          position: sticky;
          top: 0;
          z-index: 2;
          padding: 0.7rem 1rem;
          border-bottom: 1px solid #e8decb;
          background: #f7f2ea;
          color: #5c473c;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .pt-th-button {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          border: 0;
          padding: 0;
          background: transparent;
          color: inherit;
          font: inherit;
          letter-spacing: inherit;
          text-transform: inherit;
          cursor: pointer;
          transition: color 0.15s;
        }

        .pt-th-button:hover {
          color: #2b1f1a;
        }

        .pt-sort-icon {
          width: 13px;
          height: 13px;
          color: #8b5a2b;
        }

        .pt-sort-up {
          transform: rotate(180deg);
        }

        .pt-sort-idle {
          color: #c9b9a6;
          font-size: 0.8125rem;
          margin-left: 2px;
          opacity: 0.7;
        }

        .pt-td {
          padding: 0.7rem 1rem;
          border-bottom: 1px solid #f5efeb;
          color: #4a3a33;
          font-size: 0.8125rem;
          white-space: nowrap;
        }

        .pt-row {
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .pt-row:hover {
          background: #faf5ee;
        }

        .pt-transaction {
          display: inline-flex;
          border: 0;
          padding: 0;
          background: transparent;
          color: #7c4a27;
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            Monaco,
            Consolas,
            monospace;
          font-size: 0.78125rem;
          font-weight: 700;
          cursor: pointer;
          text-decoration: underline;
          text-decoration-color: #d9b99a;
          text-underline-offset: 3px;
        }

        .pt-transaction:hover {
          color: #5a351b;
          text-decoration-color: #7c4a27;
        }

        .pt-supplier-code {
          color: #7a685d;
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            Monaco,
            Consolas,
            monospace;
          font-size: 0.78125rem;
          font-weight: 600;
        }

        .pt-supplier-name {
          color: #2b1f1a;
          font-weight: 600;
        }

        .pt-date-text {
          color: #7a685d;
          font-size: 0.78125rem;
        }

        .pt-number {
          color: #4a3a33;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .pt-net {
          color: #2b1f1a;
          font-weight: 700;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .pt-status {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          border-radius: 9999px;
          padding: 0.25rem 0.65rem;
          font-size: 0.7rem;
          font-weight: 600;
          line-height: 1;
        }

        .pt-status::before {
          content: '';
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: currentColor;
        }

        .pt-status-posted {
          color: #2e6633;
          background: #edf7ee;
        }

        .pt-status-draft {
          color: #8b5a2b;
          background: #fbf3eb;
        }

        .pt-status-cancelled {
          color: #992323;
          background: #fdf0f0;
        }

        .pt-empty {
          padding: 3rem 1rem;
          color: #7a685d;
          text-align: center;
        }

        .pt-empty strong {
          display: block;
          color: #2b1f1a;
          font-size: 0.9375rem;
          font-weight: 600;
        }

        .pt-empty span {
          display: block;
          margin-top: 0.2rem;
          font-size: 0.8125rem;
        }

        .pt-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3.5rem 1rem;
          gap: 0.85rem;
        }

        .pt-spinner {
          width: 38px;
          height: 38px;
          border: 3px solid #f0e6d8;
          border-top-color: #6e4223;
          border-radius: 50%;
          animation: pt-spin 0.7s linear infinite;
        }

        @keyframes pt-spin {
          to {
            transform: rotate(360deg);
          }
        }

        .pt-loading-text {
          color: #7a685d;
          font-size: 0.8125rem;
          font-weight: 600;
        }

        .pt-loading-sub {
          color: #a39285;
          font-size: 0.75rem;
          margin-top: -0.3rem;
        }

        .pt-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.7rem 1.5rem;
          border-top: 1px solid #f2ebe1;
          background: #ffffff;
          color: #7a685d;
          font-size: 0.78125rem;
          flex-shrink: 0;
          font-weight: 500;
          border-radius: 0 0 12px 12px;
        }

        .pt-pages {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }

        .pt-page-btn {
          display: grid;
          place-items: center;
          min-width: 30px;
          height: 30px;
          border: 1px solid #e3d7c5;
          border-radius: 6px;
          padding: 0 0.35rem;
          background: #ffffff;
          color: #4a3a33;
          font-size: 0.78125rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .pt-page-btn:hover:not(:disabled) {
          border-color: #c9b9a6;
          background: #faf7f2;
          color: #2b1f1a;
          transform: translateY(-1px);
        }

        .pt-page-btn-active {
          border-color: #6e4223 !important;
          background: #6e4223 !important;
          color: #ffffff !important;
          box-shadow:
            0 2px 8px rgba(110, 66, 35, 0.25);
        }

        .pt-page-btn:disabled {
          cursor: not-allowed;
          opacity: 0.35;
        }

        .pt-footer .pt-select {
          height: 30px;
          padding: 0 0.5rem;
          font-size: 0.75rem;
          width: auto;
          min-width: 85px;
        }

        /* ---------------------------------------------------------------- */
        /* Detail Modal                                                      */
        /* ---------------------------------------------------------------- */

        .pt-detail-backdrop {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: grid;
          place-items: center;
          padding: 1rem;
          background: rgba(43, 31, 26, 0.45);
          backdrop-filter: blur(4px);
          animation: ptBackdropIn 0.18s ease;
        }

        @keyframes ptBackdropIn {
          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }
        }

        .pt-detail {
          width: min(100%, 480px);
          border: 1px solid #e8decb;
          border-radius: 12px;
          padding: 1.75rem;
          background: #ffffff;
          box-shadow:
            0 16px 32px -8px rgba(43, 31, 26, 0.18);
          animation: ptModalIn 0.22s ease;
        }

        .pt-detail.pt-detail-wide {
          width: min(100%, 920px);
          max-height: min(90vh, 820px);
          overflow-y: auto;
        }

        @keyframes ptModalIn {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .pt-detail-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding-bottom: 0.5rem;
          margin-bottom: 0.25rem;
          border-bottom: 1px solid #f2ebe1;
        }

        .pt-detail-kicker {
          margin: 0 0 0.05rem 0;
          color: #8b5a2b;
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            Monaco,
            Consolas,
            monospace;
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        .pt-detail-kicker::before {
          content: '';
          display: inline-block;
          width: 5px;
          height: 5px;
          margin-right: 5px;
          border-radius: 50%;
          background: #a9521b;
          box-shadow:
            0 0 0 2px rgba(169, 82, 27, 0.14);
          vertical-align: middle;
        }

        .pt-detail-title {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 800;
          letter-spacing: -0.015em;
          line-height: 1.15;
          background:
            linear-gradient(
              135deg,
              #2b1f1a 0%,
              #6e4223 100%
            );
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .pt-detail-close {
          display: grid;
          place-items: center;
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 6px;
          background: #faf7f2;
          color: #7a685d;
          cursor: pointer;
          transition: all 0.15s;
        }

        .pt-detail-close:hover {
          background: #f2ebe1;
          color: #2b1f1a;
        }

        .pt-detail-close svg {
          width: 14px;
          height: 14px;
        }

        .pt-detail-meta {
          display: grid;
          grid-template-columns:
            1.2fr 0.7fr 1fr 1fr;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }

        .pt-detail-meta-item {
          min-width: 0;
          padding: 0.5rem 0.65rem;
          border: 1px solid #f2ebe1;
          border-radius: 8px;
          background: #fffdfb;
        }

        .pt-detail-meta-label {
          display: block;
          margin-bottom: 0.15rem;
          color: #9a8375;
          font-size: 0.6rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .pt-detail-meta-value {
          display: block;
          overflow: hidden;
          color: #2b1f1a;
          font-size: 0.75rem;
          font-weight: 600;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pt-detail-section-title {
          margin: 0.8rem 0 0.35rem;
          color: #6e4223;
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .pt-detail-items {
          overflow-x: auto;
          border: 1px solid #eee4d7;
          border-radius: 9px;
        }

        .pt-detail-items table {
          width: 100%;
          min-width: 620px;
          border-collapse: collapse;
        }

        .pt-detail-items th {
          padding: 0.45rem 0.65rem;
          background: #faf5ee;
          color: #8b7567;
          font-size: 0.62rem;
          text-align: left;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .pt-detail-items td {
          padding: 0.5rem 0.65rem;
          border-top: 1px solid #f2ebe1;
          color: #4a3a33;
          font-size: 0.73rem;
        }

        .pt-detail-items th:not(:first-child),
        .pt-detail-items td:not(:first-child) {
          text-align: right;
        }

        .pt-detail-notes {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.45rem;
          margin-top: 0.55rem;
        }

        .pt-detail-note {
          min-height: 34px;
          padding: 0.45rem 0.65rem;
          border-radius: 7px;
          background: #faf7f2;
          color: #5f5149;
          font-size: 0.72rem;
          line-height: 1.35;
        }

        .pt-detail-note strong {
          display: block;
          margin-bottom: 0.1rem;
          color: #8b7567;
          font-size: 0.6rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        /* ---------------------------------------------------------------- */
        /* Summary                                                           */
        /* ---------------------------------------------------------------- */

        .pt-detail-summary {
          margin-top: 0.65rem;
          padding-top: 0.55rem;
          border-top: 2px dashed #efe2d2;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .pt-summary-line {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.05rem 0;
          line-height: 1.2;
        }

        .pt-summary-line span {
          color: #8b7567;
          font-size: 0.76rem;
          font-weight: 600;
        }

        .pt-summary-line strong {
          color: #2b1f1a;
          font-size: 0.82rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            Monaco,
            Consolas,
            monospace;
        }

        .pt-summary-line-discount strong {
          color: #2e6633;
        }

        .pt-summary-line-total {
          margin-top: 0.3rem;
          padding-top: 0.4rem;
          border-top: 1px solid #f2ebe1;
        }

        .pt-summary-line-total span {
          color: #6e4223;
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .pt-summary-line-total strong {
          color: #a9521b;
          font-size: 1.35rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          font-family:
            Inter,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            sans-serif;
        }

        /* ---------------------------------------------------------------- */
        /* Modal Footer                                                      */
        /* ---------------------------------------------------------------- */

        .pt-detail-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-top: 1rem;
          padding-top: 0.85rem;
          border-top: 1px solid #f2ebe1;
        }

        .pt-detail-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          height: 44px;
          border-radius: 999px;
          padding: 0 1.4rem;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          cursor: pointer;
          border: 0;
          transition:
            all 0.18s
              cubic-bezier(0.23, 1, 0.32, 1);
          font-family: inherit;
        }

        .pt-detail-btn svg {
          width: 15px;
          height: 15px;
          flex-shrink: 0;
        }

        .pt-detail-btn-secondary {
          flex: 0 0 auto;
          background: #f5efe6;
          color: #6e4223;
          box-shadow:
            inset 0 0 0 1px
              rgba(110, 66, 35, 0.08);
        }

        .pt-detail-btn-secondary:hover {
          background: #ece1cf;
          color: #5a351b;
          transform: translateY(-1px);
          box-shadow:
            inset 0 0 0 1px
              rgba(110, 66, 35, 0.12),
            0 4px 10px -3px
              rgba(110, 66, 35, 0.2);
        }

        .pt-detail-btn-secondary:active {
          transform: translateY(0);
          background: #e3d6c0;
        }

        .pt-detail-btn-primary {
          flex: 1 1 auto;
          background:
            linear-gradient(
              135deg,
              #8b5a2b 0%,
              #6e4223 100%
            );
          color: #ffffff;
          box-shadow:
            0 8px 18px -6px
              rgba(110, 66, 35, 0.5),
            inset 0 1px 0
              rgba(255, 255, 255, 0.15);
        }

        .pt-detail-btn-primary:hover {
          background:
            linear-gradient(
              135deg,
              #a06529 0%,
              #5a351b 100%
            );
          box-shadow:
            0 10px 22px -6px
              rgba(110, 66, 35, 0.6),
            inset 0 1px 0
              rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        .pt-detail-btn-primary:active {
          transform: translateY(0);
          box-shadow:
            0 4px 10px -4px
              rgba(110, 66, 35, 0.5);
        }

        .pt-detail-btn:focus-visible {
          outline: 3px solid
            rgba(169, 82, 27, 0.35);
          outline-offset: 2px;
        }

        /* ---------------------------------------------------------------- */
        /* Calendar                                                          */
        /* ---------------------------------------------------------------- */

        .pt-cal-popover {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          z-index: 100;
          width: 300px;
          padding: 1.25rem;
          border: 1px solid #e8decb;
          border-radius: 12px;
          background: #ffffff;
          box-shadow:
            0 16px 32px -8px
              rgba(61, 45, 39, 0.18);
          font-family: inherit;
          animation: ptCalIn 0.18s ease;
        }

        @keyframes ptCalIn {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .pt-cal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.9rem;
          font-weight: 700;
          color: #2b1f1a;
        }

        .pt-cal-title {
          font-size: 0.9rem;
          letter-spacing: -0.01em;
          text-transform: capitalize;
        }

        .pt-cal-nav {
          display: flex;
          gap: 0.35rem;
        }

        .pt-cal-nav-btn {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          border: 1px solid #e3d7c5;
          border-radius: 6px;
          background: #fcfaf7;
          color: #6e4223;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .pt-cal-nav-btn:hover {
          background: #6e4223;
          color: #ffffff;
          border-color: #6e4223;
          box-shadow:
            0 3px 10px
              rgba(110, 66, 35, 0.20);
        }

        .pt-cal-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 3px;
          text-align: center;
        }

        .pt-cal-day-label {
          padding: 0.35rem 0;
          font-size: 0.68rem;
          font-weight: 700;
          color: #7a685d;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .pt-cal-day {
          display: grid;
          place-items: center;
          height: 36px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #3d2d27;
          font-size: 0.8125rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .pt-cal-day:hover:not(:disabled):not(
            .pt-cal-day-selected
          ) {
          background: #faf5ee;
          color: #6e4223;
          transform: scale(1.06);
        }

        .pt-cal-day-selected {
          background: #6e4223 !important;
          color: #ffffff !important;
          font-weight: 700;
          box-shadow:
            0 4px 12px
              rgba(110, 66, 35, 0.30);
        }

        .pt-cal-day-today {
          border: 1.5px solid #8b5a2b;
          color: #6e4223;
          font-weight: 700;
        }

        .pt-cal-day-muted {
          color: #c9b9a6;
          font-weight: 400;
        }

        .pt-cal-day-disabled {
          color: #ddd2c2;
          cursor: not-allowed;
        }

        .pt-cal-footer {
          display: flex;
          justify-content: space-between;
          margin-top: 0.9rem;
          padding-top: 0.7rem;
          border-top: 1px solid #f2ebe1;
        }

        .pt-cal-action {
          border: 0;
          background: transparent;
          color: #6e4223;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          padding: 0.35rem 0.7rem;
          border-radius: 6px;
          transition: all 0.15s;
        }

        .pt-cal-action:hover {
          background: #faf5ee;
        }

        .pt-cal-action-primary {
          background: #6e4223;
          color: #ffffff;
        }

        .pt-cal-action-primary:hover {
          background: #5a351b;
          color: #ffffff;
        }

        /* ---------------------------------------------------------------- */
        /* Responsive                                                        */
        /* ---------------------------------------------------------------- */

        @media (max-width: 768px) {
          .pt-page {
            padding: 1rem;
          }

          .pt-head {
            flex-direction: row;
            align-items: center;
          }

          .pt-new-btn {
            flex-shrink: 0;
          }

          .pt-summary {
            width: 100%;
            margin-left: 0;
            justify-content: space-between;
            flex-wrap: wrap;
          }

          .pt-detail-meta {
            grid-template-columns: 1fr 1fr;
          }

          .pt-detail-notes {
            grid-template-columns: 1fr;
          }

          .pt-table-wrap {
            max-height: none;
          }
        }

        @media (max-width: 560px) {
          .pt-detail-backdrop {
            padding: 0.5rem;
          }

          .pt-detail {
            padding: 1rem;
            border-radius: 10px;
          }

          .pt-detail.pt-detail-wide {
            max-height: 94vh;
          }

          .pt-detail-meta {
            grid-template-columns: 1fr;
          }

          .pt-detail-actions {
            gap: 0.5rem;
          }

          .pt-detail-btn {
            padding: 0 1rem;
          }
        }
      `}</style>

      <div className="pt-shell">
        <header className="pt-head">
          <h1 className="pt-title">
            Purchase Transactions
          </h1>

          <button
            type="button"
            className="pt-new-btn"
            onClick={onNewPurchase}
          >
            <PlusIcon />
            New purchase
          </button>
        </header>

        <section
          className="pt-card"
          aria-label="Purchase transactions"
        >
          <div className="pt-toolbar">
            <div className="pt-search-wrap">
              <SearchIcon />

              <input
                className="pt-search"
                value={search}
                onChange={(event) =>
                  updateSearch(event.target.value)
                }
                placeholder="Search transaction, supplier, date, amount…"
                aria-label="Search purchase transactions"
              />
            </div>

            <div className="pt-filter-group">
              <label
                className="pt-filter-label"
                htmlFor="pt-from-date"
              >
                From date
              </label>

              <DatePicker
                id="pt-from-date"
                value={fromDate}
                onChange={(value) => {
                  setFromDate(value);
                  setPage(1);
                }}
                placeholder="Any date"
                ariaLabel="From date"
                max={toDate || undefined}
              />
            </div>

            <div className="pt-filter-group">
              <label
                className="pt-filter-label"
                htmlFor="pt-to-date"
              >
                To date
              </label>

              <DatePicker
                id="pt-to-date"
                value={toDate}
                onChange={(value) => {
                  setToDate(value);
                  setPage(1);
                }}
                placeholder="Any date"
                ariaLabel="To date"
                min={fromDate || undefined}
                align="right"
              />
            </div>

            <div className="pt-filter-group pt-filter-group-status">
              <label
                className="pt-filter-label"
                htmlFor="pt-status"
              >
                Status
              </label>

              <select
                id="pt-status"
                className="pt-select"
                value={status}
                onChange={(event) => {
                  setStatus(
                    event.target.value as typeof status
                  );
                  setPage(1);
                }}
                aria-label="Filter by status"
              >
                <option value="All">
                  All statuses
                </option>
                <option value="Posted">
                  Posted
                </option>
                <option value="Draft">
                  Draft
                </option>
                <option value="Cancelled">
                  Cancelled
                </option>
              </select>
            </div>

            <button
              type="button"
              className="pt-reset-btn"
              onClick={clearFilters}
              title="Reset all filters"
            >
              <ResetIcon />
              Reset
            </button>

            <div className="pt-summary">
              <div className="pt-summary-item">
                Showing{' '}
                <strong>
                  {filteredTransactions.length}
                </strong>
              </div>

              <div className="pt-summary-item">
                Posted net{' '}
                <strong>
                  {formatMoney(postedTotal)}
                </strong>
              </div>
            </div>
          </div>

          <div className="pt-table-wrap">
            {isLoading ? (
              <div className="pt-loading">
                <div
                  className="pt-spinner"
                  aria-hidden="true"
                />

                <span className="pt-loading-text">
                  Loading transactions…
                </span>

                <span className="pt-loading-sub">
                  Fetching purchase receipts from the
                  server.
                </span>
              </div>
            ) : loadError ? (
              <div className="pt-empty">
                <strong>
                  Could not load transactions
                </strong>

                <span>{loadError}</span>
              </div>
            ) : visibleTransactions.length === 0 ? (
              <div className="pt-empty">
                <strong>
                  No transactions found
                </strong>

                <span>
                  Try changing your search or filters.
                </span>
              </div>
            ) : (
              <table className="pt-table">
                <thead>
                  <tr>
                    {(
                      [
                        [
                          'transactionNumber',
                          '#',
                        ],
                        [
                          'supplierCode',
                          'Supplier code',
                        ],
                        [
                          'supplierName',
                          'Supplier name',
                        ],
                        ['date', 'Date'],
                        [
                          'itemCount',
                          '# /items',
                        ],
                        ['total', 'Total'],
                        ['discount', 'Discount'],
                        ['tax', 'Tax'],
                        ['net', 'Net'],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <th
                        className="pt-th"
                        key={key}
                      >
                        <button
                          type="button"
                          className="pt-th-button"
                          onClick={() =>
                            changeSort(key)
                          }
                        >
                          {label}
                          {sortIndicator(key)}
                        </button>
                      </th>
                    ))}

                    <th className="pt-th">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {visibleTransactions.map(
                    (transaction) => (
                      <tr
                        className="pt-row"
                        key={transaction.id}
                        onClick={() =>
                          openTransaction(transaction)
                        }
                      >
                        <td className="pt-td">
                          <button
                            type="button"
                            className="pt-transaction"
                            onClick={(event) => {
                              event.stopPropagation();
                              openTransaction(
                                transaction
                              );
                            }}
                            title={
                              onEditPurchase
                                ? 'Edit transaction'
                                : 'View transaction details'
                            }
                          >
                            {
                              transaction.transactionNumber
                            }
                          </button>
                        </td>

                        <td className="pt-td">
                          <span className="pt-supplier-code">
                            {
                              transaction.supplierCode
                            }
                          </span>
                        </td>

                        <td className="pt-td">
                          <span className="pt-supplier-name">
                            {
                              transaction.supplierName
                            }
                          </span>
                        </td>

                        <td className="pt-td">
                          <span className="pt-date-text">
                            {formatDate(
                              transaction.date
                            )}
                          </span>
                        </td>

                        <td className="pt-td pt-number">
                          {transaction.itemCount}
                        </td>

                        <td className="pt-td pt-number">
                          {formatMoney(
                            transaction.total
                          )}
                        </td>

                        <td className="pt-td pt-number">
                          {formatMoney(
                            transaction.discount
                          )}
                        </td>

                        <td className="pt-td pt-number">
                          {formatMoney(
                            transaction.tax
                          )}
                        </td>

                        <td className="pt-td pt-net">
                          {formatMoney(
                            transaction.net
                          )}
                        </td>

                        <td className="pt-td">
                          <span
                            className={`pt-status pt-status-${transaction.status.toLowerCase()}`}
                          >
                            {transaction.status}
                          </span>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>

          <footer className="pt-footer">
            <span>
              {filteredTransactions.length === 0
                ? 'No results'
                : `Showing ${
                    (currentPage - 1) *
                      pageSize +
                    1
                  }–${Math.min(
                    currentPage * pageSize,
                    filteredTransactions.length
                  )} of ${
                    filteredTransactions.length
                  }`}
            </span>

            <div className="pt-pages">
              <button
                type="button"
                className="pt-page-btn"
                disabled={currentPage === 1}
                onClick={() =>
                  setPage((value) =>
                    Math.max(1, value - 1)
                  )
                }
              >
                ‹
              </button>

              {Array.from(
                { length: totalPages },
                (_, index) => index + 1
              ).map((pageNumber) => (
                <button
                  type="button"
                  key={pageNumber}
                  className={`pt-page-btn${
                    pageNumber === currentPage
                      ? ' pt-page-btn-active'
                      : ''
                  }`}
                  onClick={() =>
                    setPage(pageNumber)
                  }
                >
                  {pageNumber}
                </button>
              ))}

              <button
                type="button"
                className="pt-page-btn"
                disabled={
                  currentPage === totalPages
                }
                onClick={() =>
                  setPage((value) =>
                    Math.min(
                      totalPages,
                      value + 1
                    )
                  )
                }
              >
                ›
              </button>

              <select
                className="pt-select"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(
                    Number(event.target.value)
                  );
                  setPage(1);
                }}
                aria-label="Rows per page"
              >
                <option value={10}>
                  10 / page
                </option>

                <option value={20}>
                  20 / page
                </option>
              </select>
            </div>
          </footer>
        </section>
      </div>

      {/* ================================================================== */}
      {/* TRANSACTION DETAIL MODAL                                           */}
      {/* ================================================================== */}

      {selected && (
        <div
          className="pt-detail-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setSelected(null);
            }
          }}
        >
          <section
            className="pt-detail pt-detail-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-detail-title"
          >
            <div className="pt-detail-head">
              <div>
                <p className="pt-detail-kicker">
                  Transaction detail
                </p>

                <h2
                  id="transaction-detail-title"
                  className="pt-detail-title"
                >
                  {selected.transactionNumber}
                </h2>
              </div>

              <button
                type="button"
                className="pt-detail-close"
                onClick={() =>
                  setSelected(null)
                }
                aria-label="Close details"
              >
                <CloseIcon />
              </button>
            </div>

            {isDetailLoading ? (
              <div className="pt-loading">
                <div
                  className="pt-spinner"
                  aria-hidden="true"
                />

                <span className="pt-loading-text">
                  Loading transaction details…
                </span>

                <span className="pt-loading-sub">
                  Fetching supplier, line items, and
                  totals.
                </span>
              </div>
            ) : detailError ? (
              <div className="pt-empty">
                <strong>
                  Could not load full details
                </strong>

                <span>{detailError}</span>
              </div>
            ) : selectedDetail ? (
              <>
                <div className="pt-detail-meta">
                  <div className="pt-detail-meta-item">
                    <span className="pt-detail-meta-label">
                      Supplier
                    </span>

                    <span className="pt-detail-meta-value">
                      {selectedDetail.supplierName ||
                        '—'}
                    </span>
                  </div>

                  <div className="pt-detail-meta-item">
                    <span className="pt-detail-meta-label">
                      Supplier code
                    </span>

                    <span className="pt-detail-meta-value">
                      {selectedDetail.supplierCode ||
                        '—'}
                    </span>
                  </div>

                  <div className="pt-detail-meta-item">
                    <span className="pt-detail-meta-label">
                      Received on
                    </span>

                    <span className="pt-detail-meta-value">
                      {formatDate(
                        selectedDetail.date
                      )}
                    </span>
                  </div>

                  <div className="pt-detail-meta-item">
                    <span className="pt-detail-meta-label">
                      Status
                    </span>

                    <span className="pt-detail-meta-value">
                      {selectedDetail.status}
                    </span>
                  </div>
                </div>

                <p className="pt-detail-section-title">
                  Items received ·{' '}
                  {selectedDetail.items.length}
                </p>

                <div className="pt-detail-items">
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th>Unit cost</th>
                        <th>Disc. %</th>
                        <th>Line total</th>
                      </tr>
                    </thead>

                    <tbody>
                      {selectedDetail.items.length ===
                      0 ? (
                        <tr>
                          <td colSpan={6}>
                            No line items were
                            returned for this
                            transaction.
                          </td>
                        </tr>
                      ) : (
                        selectedDetail.items.map(
                          (item) => (
                            <tr key={item.id}>
                              <td>
                                {item.name ||
                                  'Unnamed item'}
                              </td>

                              <td>
                                {item.qty}
                              </td>

                              <td>
                                {item.unit}
                              </td>

                              <td>
                                {formatMoney(
                                  item.unitCost
                                )}
                              </td>

                              <td>
                                {item.discountPct.toFixed(
                                  2
                                )}
                                %
                              </td>

                              <td>
                                {formatMoney(
                                  item.lineTotal
                                )}
                              </td>
                            </tr>
                          )
                        )
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="pt-detail-notes">
                  <div className="pt-detail-note">
                    <strong>
                      Reference
                    </strong>

                    {selectedDetail.reference ||
                      'No reference added'}
                  </div>

                  <div className="pt-detail-note">
                    <strong>
                      Comment
                    </strong>

                    {selectedDetail.comment ||
                      'No comment added'}
                  </div>

                  <div className="pt-detail-note">
                    <strong>
                      Supplier document
                    </strong>

                    {selectedDetail.attachmentName ||
                      'No attachment'}
                  </div>
                </div>

                <div className="pt-detail-summary">
                  <div className="pt-summary-line">
                    <span>Subtotal</span>

                    <strong>
                      {formatMoney(
                        selectedDetail.total
                      )}
                    </strong>
                  </div>

                  <div className="pt-summary-line pt-summary-line-discount">
                    <span>Discount</span>

                    <strong>
                      −
                      {formatMoney(
                        selectedDetail.discount
                      )}
                    </strong>
                  </div>

                  <div className="pt-summary-line">
                    <span>Tax</span>

                    <strong>
                      {formatMoney(
                        selectedDetail.tax
                      )}
                    </strong>
                  </div>

                  <div className="pt-summary-line pt-summary-line-total">
                    <span>Net total</span>

                    <strong>
                      {formatMoney(
                        selectedDetail.net
                      )}
                    </strong>
                  </div>
                </div>
              </>
            ) : null}

            {/* ============================================================ */}
            {/* MODAL ACTION BUTTONS                                         */}
            {/* ============================================================ */}

            <div className="pt-detail-actions">
              <button
                type="button"
                className="pt-detail-btn pt-detail-btn-secondary"
                onClick={() =>
                  setSelected(null)
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>

                Close
              </button>

              {selected.status !==
                'Cancelled' &&
                !isDetailLoading && (
                  <button
                    type="button"
                    className="pt-detail-btn pt-detail-btn-primary"
                    onClick={() =>
                      editTransaction(selected)
                    }
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>

                    Update transaction
                  </button>
                )}
            </div>
          </section>
        </div>
      )}

      {/* ================================================================== */}
      {/* EDIT TRANSACTION MODAL                                            */}
      {/* ================================================================== */}

      {editingTransactionId !== null && (
        <PurchaseTransactionEditModal
          transactionId={editingTransactionId}
          restaurantId={restaurantId}
          onClose={() =>
            setEditingTransactionId(null)
          }
        />
      )}
    </main>
  );
};

export default PurchaseTransactionsList;
