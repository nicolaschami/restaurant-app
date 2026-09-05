import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Volume2,
  VolumeX,
  Flame,
  ChefHat,
  Check,
  Sparkles,
  Layers,
  LayoutGrid,
} from 'lucide-react';

export interface KDSItem {
  id: string;
  name: string;
  quantity: number;
  // Was a fixed 4-value union — now dynamic, driven by real kitchen
  // stations from the DB (via KDSContainer's `stations` prop) rather than
  // a hardcoded list.
  station: string;
  // Modifiers arrive as { groupId, groupName, optionId, optionName, price }
  // objects from the order pipeline, not plain strings — kept loose here
  // and normalized for display via modifierLabel().
  modifiers?: any[];
  variantSize?: string;
  completed?: boolean;
}

export interface KDSTicket {
  id: string;
  orderNumber: string;
  tableNumber?: string;
  orderType: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  createdAt: number;
  items: KDSItem[];
  status: 'PENDING' | 'IN_PROGRESS' | 'READY';
  notes?: string;
}

interface KDSProps {
  initialTickets?: KDSTicket[];
  onUpdateTicketStatus?: (ticketId: string, newStatus: KDSTicket['status']) => void;
  // NEW: called whenever a cook taps a single line item, so it can be
  // persisted to the backend instead of only living in local state.
  onCompleteItem?: (ticketId: string, itemId: string, completed: boolean) => void;
  // NEW: real kitchen stations from the DB (via KDSContainer). Falls back
  // to DEFAULT_STATIONS below if not provided or empty — e.g. during
  // standalone/mock-data use, or if the stations fetch fails.
  stations?: string[];
}

const MOCK_TICKETS: KDSTicket[] = [
  {
    id: 'tk-101',
    orderNumber: '101',
    tableNumber: 'T-04',
    orderType: 'DINE_IN',
    createdAt: Date.now() - 1000 * 60 * 3,
    status: 'IN_PROGRESS',
    items: [
      { id: 'i1', name: 'Smash Burger Double', quantity: 2, station: 'GRILL', modifiers: ['No Onions', 'Extra Cheese'] },
      { id: 'i2', name: 'Truffle Fries', quantity: 1, station: 'FRYER' },
      { id: 'i3', name: 'Coke Zero', quantity: 2, station: 'ASSEMBLY' },
    ],
    notes: 'Customer has gluten allergy - sanitize grill surface.',
  },
  {
    id: 'tk-102',
    orderNumber: '102',
    tableNumber: 'T-12',
    orderType: 'DINE_IN',
    createdAt: Date.now() - 1000 * 60 * 12,
    status: 'IN_PROGRESS',
    items: [
      { id: 'i4', name: 'Ribeye Steak Medium', quantity: 1, station: 'GRILL' },
      { id: 'i5', name: 'Caesar Salad', quantity: 1, station: 'SALAD', modifiers: ['Dressing on side'] },
      { id: 'i6', name: 'Onion Rings', quantity: 2, station: 'FRYER' },
    ],
  },
  {
    id: 'tk-103',
    orderNumber: '103',
    orderType: 'TAKEAWAY',
    createdAt: Date.now() - 1000 * 60 * 22,
    status: 'PENDING',
    items: [
      { id: 'i7', name: 'Crispy Chicken Sandwich', quantity: 3, station: 'FRYER', modifiers: ['Extra Spicy'] },
      { id: 'i8', name: 'Loaded Nachos', quantity: 1, station: 'ASSEMBLY' },
    ],
  },
];

const DEFAULT_STATIONS = ['GRILL', 'FRYER', 'SALAD', 'ASSEMBLY'] as const;

// Modifiers arrive from the order pipeline as objects like
// { groupId, groupName, optionId, optionName, price } — not plain strings.
// This extracts a readable label regardless of shape, instead of letting
// `.join()` silently render "[object Object]".
function modifierLabel(m: any): string {
  if (typeof m === 'string') return m;
  return m?.optionName ?? m?.name ?? String(m);
}

// Formats elapsed minutes as a compact, human-friendly duration:
// under 1h -> "42m", under 24h -> "5h 18m" (or just "5h" on the hour),
// 24h+ -> "1d 3h" (or just "2d" on the day). Same formatter used on the
// Dashboard — keeps a ticket readable instead of showing raw "318m".
function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

// ==========================================
// SOUND: synthesized two-tone chime, no audio file needed
// ==========================================
function useChime() {
  const ctxRef = useRef<AudioContext | null>(null);

  return () => {
    try {
      if (!ctxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        ctxRef.current = new AudioCtx();
      }
      const ctx = ctxRef.current;
      const now = ctx.currentTime;

      [880, 1175].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = now + i * 0.11;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    } catch {
      // Web Audio unsupported/blocked — fail silently, sound is a nicety not a requirement.
    }
  };
}

export default function KitchenDisplayScreen({
  initialTickets = MOCK_TICKETS,
  onUpdateTicketStatus,
  onCompleteItem,
  stations: stationsProp,
}: KDSProps) {
  // Use the real stations passed in if we got any; otherwise fall back to
  // the built-in default list (mock/dev use, or if the fetch failed).
  const stations = stationsProp && stationsProp.length > 0 ? stationsProp : [...DEFAULT_STATIONS];

  const [tickets, setTickets] = useState<KDSTicket[]>(initialTickets);
  const [stationFilter, setStationFilter] = useState<string>('ALL');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [showSummaryBar, setShowSummaryBar] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'tickets' | 'lanes'>('tickets');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

  const playChime = useChime();
  const knownIds = useRef<Set<string>>(new Set(initialTickets.map((t) => t.id)));
  const isFirstRun = useRef(true);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setTickets(initialTickets);

    const incomingIds = new Set(initialTickets.map((t) => t.id));
    if (!isFirstRun.current) {
      const newlyArrived = initialTickets.filter((t) => !knownIds.current.has(t.id));
      if (newlyArrived.length > 0) {
        setFlashIds((prev) => {
          const next = new Set(prev);
          newlyArrived.forEach((t) => next.add(t.id));
          return next;
        });
        if (soundEnabled) playChime();
        newlyArrived.forEach((t) => {
          setTimeout(() => {
            setFlashIds((prev) => {
              const next = new Set(prev);
              next.delete(t.id);
              return next;
            });
          }, 3200);
        });
      }
    }
    knownIds.current = incomingIds;
    isFirstRun.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTickets]);

  const toggleItemCompletion = (ticketId: string, itemId: string) => {
    const ticket = tickets.find((tk) => tk.id === ticketId);
    const item = ticket?.items.find((i) => i.id === itemId);
    const newCompleted = !(item?.completed ?? false);

    setTickets((prev) =>
      prev.map((tk) => {
        if (tk.id !== ticketId) return tk;
        const updatedItems = tk.items.map((it) =>
          it.id === itemId ? { ...it, completed: newCompleted } : it
        );
        return { ...tk, items: updatedItems };
      })
    );

    onCompleteItem?.(ticketId, itemId, newCompleted);
  };

  const handleBumpTicket = (ticketId: string) => {
    setTickets((prev) => prev.filter((tk) => tk.id !== ticketId));
    if (onUpdateTicketStatus) {
      onUpdateTicketStatus(ticketId, 'READY');
    }
  };

  const prepSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    tickets.forEach((tk) => {
      tk.items.forEach((item) => {
        if (!item.completed) {
          if (stationFilter === 'ALL' || item.station === stationFilter) {
            summary[item.name] = (summary[item.name] || 0) + item.quantity;
          }
        }
      });
    });
    return summary;
  }, [tickets, stationFilter]);

  const { laneMap, laneOrder } = useMemo(() => {
    const map: Record<string, { ticket: KDSTicket; item: KDSItem }[]> = {};
    stations.forEach((s) => {
      map[s] = [];
    });

    let hasOther = false;
    tickets.forEach((tk) => {
      tk.items.forEach((item) => {
        if (item.completed) return;
        const known = stations.includes(item.station);
        const key = known ? item.station : 'OTHER';
        if (!known) hasOther = true;
        if (!map[key]) map[key] = [];
        map[key].push({ ticket: tk, item });
      });
    });

    // "OTHER" only appears if something genuinely didn't match a known
    // station — e.g. a stale station name on an item, or a station that
    // was renamed/deleted in the DB after the order was fired. Surfacing
    // it (rather than silently dropping those items) makes that mismatch
    // visible instead of quietly losing track of a ticket.
    const order = hasOther ? [...stations, 'OTHER'] : stations;
    return { laneMap: map, laneOrder: order };
  }, [tickets, stations]);

  const getAging = (createdAtMs: number) => {
    const elapsedMins = Math.floor((currentTime - createdAtMs) / (1000 * 60));

    if (elapsedMins >= 20) {
      return {
        headerGrad: 'linear-gradient(135deg, #EF4444, #DC2626)', ring: '#DC2626',
        badgeBg: '#FEE2E2', badgeText: '#B91C1C', label: 'FIRE NOW', elapsed: elapsedMins, critical: true,
        cardBorder: '#FCA5A5',
      };
    }
    if (elapsedMins >= 10) {
      return {
        headerGrad: 'linear-gradient(135deg, #FBBF24, #F59E0B)', ring: '#F59E0B',
        badgeBg: '#FEF3C7', badgeText: '#B45309', label: 'AGING', elapsed: elapsedMins, critical: false,
        cardBorder: '#FCD34D',
      };
    }
    return {
      headerGrad: 'linear-gradient(135deg, #34D399, #10B981)', ring: '#10B981',
      badgeBg: '#D1FAE5', badgeText: '#047857', label: 'FRESH', elapsed: elapsedMins, critical: false,
      cardBorder: '#A7F3D0',
    };
  };

  return (
    <div className="kds-root">
      <KDSStyles />

      <header className="kds-header">
        <div className="kds-header-left">
          <div className="kds-brand">
            <Sparkles className="w-5 h-5" />
            <span>EXPO LINE</span>
          </div>

          <div className="kds-view-toggle">
            <button
              className={viewMode === 'tickets' ? 'active' : ''}
              onClick={() => setViewMode('tickets')}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Tickets
            </button>
            <button
              className={viewMode === 'lanes' ? 'active' : ''}
              onClick={() => setViewMode('lanes')}
            >
              <Layers className="w-3.5 h-3.5" /> By Station
            </button>
          </div>

          {viewMode === 'tickets' && (
            <div className="kds-station-filter">
              {['ALL', ...stations].map((st) => (
                <button
                  key={st}
                  onClick={() => setStationFilter(st)}
                  className={stationFilter === st ? 'active' : ''}
                >
                  {st}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="kds-header-right">
          <button
            onClick={() => setShowSummaryBar((v) => !v)}
            className={`kds-toggle-btn ${showSummaryBar ? 'active' : ''}`}
          >
            <ChefHat className="w-4 h-4" /> Prep Summary
          </button>

          <button
            onClick={() => setSoundEnabled((v) => !v)}
            className="kds-icon-btn"
            title={soundEnabled ? 'Sound on — click to mute new-ticket chime' : 'Sound off — click to enable chime'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" style={{ opacity: 0.4 }} />}
          </button>

          <div className="kds-count">
            <span className="kds-count-label">ACTIVE</span>
            <span className="kds-count-num">{tickets.length}</span>
          </div>
        </div>
      </header>

      {showSummaryBar && Object.keys(prepSummary).length > 0 && (
        <div className="kds-prep-bar">
          <span className="kds-prep-label">TO PREPARE</span>
          {Object.entries(prepSummary).map(([name, count]) => (
            <div key={name} className="kds-prep-chip">
              <span className="qty">{count}×</span>
              <span>{name}</span>
            </div>
          ))}
        </div>
      )}

      <main className="kds-main">
        {tickets.length === 0 ? (
          <div className="kds-empty">
            <CheckCircle2 className="w-16 h-16" style={{ color: '#10B981' }} strokeWidth={1.5} />
            <h2>All Orders Bumped!</h2>
            <p>Waiting for the next ticket…</p>
          </div>
        ) : viewMode === 'lanes' ? (
          <div className="kds-lanes">
            {laneOrder.map((station) => (
              <div key={station} className="kds-lane">
                <div className="kds-lane-head">
                  <span>{station}</span>
                  <span className="kds-lane-count">{laneMap[station]?.length ?? 0}</span>
                </div>
                <div className="kds-lane-body">
                  {!laneMap[station] || laneMap[station].length === 0 ? (
                    <div className="kds-lane-empty">Nothing pending</div>
                  ) : (
                    laneMap[station].map(({ ticket, item }) => {
                      const aging = getAging(ticket.createdAt);
                      return (
                        <div
                          key={item.id}
                          className="kds-lane-item"
                          style={{ borderLeftColor: aging.ring }}
                          onClick={() => toggleItemCompletion(ticket.id, item.id)}
                        >
                          <div className="kds-lane-item-top">
                            <span className="kds-lane-ticket-no">#{ticket.orderNumber}</span>
                            <span className="kds-lane-time" style={{ color: aging.badgeText }}>{formatDuration(aging.elapsed)}</span>
                          </div>
                          <div className="kds-lane-item-name">
                            <span className="qty">{item.quantity}×</span> {item.name}
                            {item.variantSize && <span className="kds-size-badge">{item.variantSize}</span>}
                          </div>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="kds-lane-mods">
                              {item.modifiers.map(modifierLabel).join(' · ')}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="kds-grid">
            {tickets.map((ticket) => {
              const aging = getAging(ticket.createdAt);
              const isAllDone = ticket.items.every((i) => i.completed);
              const isFlashing = flashIds.has(ticket.id);

              return (
                <div
                  key={ticket.id}
                  className={`kds-ticket ${isFlashing ? 'flashing' : ''}`}
                  style={{ borderColor: aging.cardBorder }}
                >
                  {isFlashing && <span className="kds-new-ribbon">NEW</span>}

                  <div className="kds-ticket-head" style={{ background: aging.headerGrad }}>
                    <div className="kds-ticket-no-wrap">
                      <span className="kds-ticket-no">#{ticket.orderNumber}</span>
                      {ticket.tableNumber && <span className="kds-table-tag">{ticket.tableNumber}</span>}
                    </div>
                    <div className="kds-timer">
                      {aging.critical && <Flame className="w-4 h-4" />}
                      <Clock className="w-4 h-4" />
                      <span>{formatDuration(aging.elapsed)}</span>
                    </div>
                  </div>

                  <div className="kds-ticket-meta">
                    <span>{ticket.orderType.replace('_', ' ')}</span>
                    <span className="kds-status-badge" style={{ background: aging.badgeBg, color: aging.badgeText }}>
                      {aging.label}
                    </span>
                  </div>

                  {ticket.notes && (
                    <div className="kds-notes">
                      <AlertCircle className="w-4 h-4" style={{ flexShrink: 0 }} />
                      <span>{ticket.notes}</span>
                    </div>
                  )}

                  <div className="kds-items">
                    {ticket.items.map((item) => {
                      if (stationFilter !== 'ALL' && item.station !== stationFilter) return null;
                      return (
                        <div
                          key={item.id}
                          className={`kds-item ${item.completed ? 'done' : ''}`}
                          onClick={() => toggleItemCompletion(ticket.id, item.id)}
                        >
                          <div>
                            <div className="kds-item-name">
                              <span className="qty">{item.quantity}×</span> {item.name}
                              {item.variantSize && <span className="kds-size-badge">{item.variantSize}</span>}
                            </div>
                            {item.modifiers && item.modifiers.length > 0 && (
                              <div className="kds-item-mods">
                                {item.modifiers.map((m, i) => (
                                  <span key={i}>+ {modifierLabel(m)}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="kds-check">{item.completed && <Check className="w-4 h-4" />}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="kds-ticket-footer">
                    <button
                      className={`kds-bump-btn ${isAllDone ? 'ready' : ''}`}
                      onClick={() => handleBumpTicket(ticket.id)}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {isAllDone ? 'DONE — BUMP' : 'BUMP TICKET'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function KDSStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@500;600;700;800&display=swap');

      .kds-root { min-height: 100vh; background: #F1F5F3; color: #1E293B;
        font-family: 'JetBrains Mono', monospace; display: flex; flex-direction: column;
        user-select: none; overflow: hidden; }

      .kds-header { background: #FFFFFF; border-bottom: 1px solid #E2E8E4; padding: 14px 22px;
        display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
        box-shadow: 0 2px 8px rgba(16,24,20,0.04); }
      .kds-header-left { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
      .kds-brand { display: flex; align-items: center; gap: 7px; font-family: 'Bebas Neue', sans-serif;
        font-size: 20px; letter-spacing: 0.06em; color: #0F9D62; }

      .kds-view-toggle, .kds-station-filter { display: flex; gap: 3px; background: #F1F5F3;
        border: 1px solid #E2E8E4; border-radius: 10px; padding: 3px; }
      .kds-view-toggle button, .kds-station-filter button { display: flex; align-items: center; gap: 5px;
        padding: 7px 13px; border-radius: 7px; border: none; background: transparent; color: #64748B;
        font-size: 11.5px; font-weight: 800; letter-spacing: 0.03em; cursor: pointer; transition: all 0.15s; }
      .kds-view-toggle button.active, .kds-station-filter button.active {
        background: #10B981; color: #FFFFFF; box-shadow: 0 2px 8px rgba(16,185,129,0.35); }
      .kds-view-toggle button:hover:not(.active), .kds-station-filter button:hover:not(.active) { color: #1E293B; }

      .kds-header-right { display: flex; align-items: center; gap: 10px; }
      .kds-toggle-btn { display: flex; align-items: center; gap: 6px; padding: 8px 13px; border-radius: 9px;
        border: 1px solid #E2E8E4; background: #FFFFFF; color: #64748B; font-size: 11.5px; font-weight: 800;
        cursor: pointer; transition: all 0.15s; }
      .kds-toggle-btn.active { background: #D1FAE5; border-color: #10B981; color: #047857; }
      .kds-icon-btn { width: 36px; height: 36px; border-radius: 9px; border: 1px solid #E2E8E4;
        background: #FFFFFF; color: #F59E0B; display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: all 0.15s; }
      .kds-icon-btn:hover { background: #FEF3C7; }

      .kds-count { display: flex; flex-direction: column; align-items: flex-end;
        border-left: 1px solid #E2E8E4; padding-left: 14px; }
      .kds-count-label { font-size: 9px; letter-spacing: 0.1em; color: #94A3B8; font-weight: 800; }
      .kds-count-num { font-family: 'Bebas Neue', sans-serif; font-size: 28px; color: #1E293B; line-height: 1; }

      .kds-prep-bar { background: #ECFDF5; border-bottom: 1px solid #A7F3D0; padding: 10px 22px;
        display: flex; align-items: center; gap: 10px; overflow-x: auto; flex-shrink: 0; }
      .kds-prep-label { font-size: 10px; font-weight: 800; letter-spacing: 0.1em; color: #047857; flex-shrink: 0; }
      .kds-prep-chip { display: flex; align-items: center; gap: 6px; background: #FFFFFF;
        border: 1px solid #A7F3D0; padding: 5px 10px; border-radius: 8px; font-size: 12px; flex-shrink: 0;
        box-shadow: 0 1px 3px rgba(16,24,20,0.04); }
      .kds-prep-chip .qty { color: #0F9D62; font-weight: 800; }

      .kds-main { flex: 1; overflow: auto; padding: 20px; }
      .kds-empty { height: 100%; display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 10px; color: #94A3B8; padding: 80px 0; }
      .kds-empty h2 { font-family: 'Bebas Neue', sans-serif; font-size: 28px; letter-spacing: 0.05em;
        color: #334155; margin: 0; }
      .kds-empty p { font-size: 12px; margin: 0; }

      .kds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 18px; }

      .kds-ticket { background: #FFFFFF; border: 2px solid; border-radius: 14px; overflow: hidden;
        display: flex; flex-direction: column; position: relative;
        box-shadow: 0 3px 14px rgba(16,24,20,0.06); transition: box-shadow 250ms ease, transform 250ms ease; }
      .kds-ticket.flashing { animation: kds-pop 0.5s ease-in-out 3; box-shadow: 0 8px 28px rgba(16,185,129,0.35); }
      @keyframes kds-pop { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.02); } }

      .kds-new-ribbon { position: absolute; top: 10px; right: -30px; background: #10B981; color: #fff;
        font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; letter-spacing: 0.08em;
        padding: 4px 32px; transform: rotate(38deg); z-index: 5; box-shadow: 0 2px 6px rgba(16,185,129,0.4);
        animation: kds-ribbon-pulse 1s ease-in-out infinite; }
      @keyframes kds-ribbon-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

      .kds-ticket-head { padding: 13px 16px; display: flex; align-items: center; justify-content: space-between; }
      .kds-ticket-no-wrap { display: flex; align-items: center; gap: 8px; }
      .kds-ticket-no { font-family: 'Bebas Neue', sans-serif; font-size: 32px; letter-spacing: 0.03em;
        color: #FFFFFF; line-height: 1; text-shadow: 0 1px 3px rgba(0,0,0,0.15); }
      .kds-table-tag { background: rgba(255,255,255,0.28); padding: 3px 8px; border-radius: 6px;
        font-size: 11px; font-weight: 800; color: #FFFFFF; }
      .kds-timer { display: flex; align-items: center; gap: 5px; font-weight: 800; font-size: 15px; color: #FFFFFF; }

      .kds-ticket-meta { padding: 8px 16px; background: #F8FAF9; display: flex;
        align-items: center; justify-content: space-between; font-size: 10px; font-weight: 800;
        letter-spacing: 0.08em; color: #64748B; border-bottom: 1px solid #EEF2F0; }
      .kds-status-badge { padding: 3px 10px; border-radius: 6px; font-size: 10px; font-weight: 800; }

      .kds-notes { margin: 10px 14px 0; padding: 8px 10px; border-radius: 9px; background: #FEF2F2;
        border: 1px solid #FECACA; color: #B91C1C; font-size: 11px; font-weight: 700; display: flex;
        align-items: flex-start; gap: 6px; }

      .kds-items { padding: 12px; display: flex; flex-direction: column; gap: 8px; flex: 1;
        overflow-y: auto; max-height: 360px; }
      .kds-item { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
        background: #F8FAF9; border: 1px solid #E2E8E4; border-radius: 10px; padding: 10px 12px;
        cursor: pointer; transition: all 0.15s; }
      .kds-item:hover { border-color: #10B981; background: #F0FDF7; }
      .kds-item.done { opacity: 0.45; }
      .kds-item.done .kds-item-name { text-decoration: line-through; }
      .kds-item-name { font-size: 14px; font-weight: 700; color: #1E293B; }
      .kds-item-name .qty { color: #0F9D62; font-weight: 800; margin-right: 2px; }
      .kds-size-badge { display: inline-block; margin-left: 6px; font-size: 10px; font-weight: 800;
        text-transform: uppercase; letter-spacing: 0.03em; background: #E0E7FF; color: #4338CA;
        padding: 2px 7px; border-radius: 5px; vertical-align: middle; }
      .kds-item-mods { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
      .kds-item-mods span { font-size: 10px; font-weight: 700; background: #FEF3C7; color: #B45309;
        padding: 2px 7px; border-radius: 5px; }
      .kds-check { width: 22px; height: 22px; border-radius: 6px; border: 1.5px solid #CBD5C9;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #10B981;
        background: #FFFFFF; }
      .kds-item.done .kds-check { background: #10B981; border-color: #10B981; color: #FFFFFF; }

      .kds-ticket-footer { padding: 12px; border-top: 1px solid #EEF2F0; }
      .kds-bump-btn { width: 100%; padding: 12px; border-radius: 10px; border: none; background: #1E293B;
        color: #FFFFFF; font-weight: 800; font-size: 12px; letter-spacing: 0.05em; cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.15s; }
      .kds-bump-btn:hover { background: #334155; }
      .kds-bump-btn.ready { background: linear-gradient(135deg, #34D399, #10B981); box-shadow: 0 4px 14px rgba(16,185,129,0.35); }
      .kds-bump-btn.ready:hover { box-shadow: 0 6px 18px rgba(16,185,129,0.45); }
      .kds-bump-btn:active { transform: scale(0.98); }

      .kds-lanes { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
      .kds-lane { background: #FFFFFF; border: 1px solid #E2E8E4; border-radius: 14px; overflow: hidden;
        display: flex; flex-direction: column; max-height: calc(100vh - 210px);
        box-shadow: 0 3px 14px rgba(16,24,20,0.05); }
      .kds-lane-head { padding: 12px 16px; background: #F0FDF7; display: flex; align-items: center;
        justify-content: space-between; font-family: 'Bebas Neue', sans-serif; font-size: 19px;
        letter-spacing: 0.05em; color: #0F9D62; border-bottom: 1px solid #D1FAE5; }
      .kds-lane-count { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 800;
        background: #FFFFFF; padding: 2px 10px; border-radius: 10px; color: #1E293B;
        border: 1px solid #D1FAE5; }
      .kds-lane-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
      .kds-lane-empty { text-align: center; color: #A9B4AE; font-size: 11px; padding: 24px 0; font-style: italic; }
      .kds-lane-item { background: #F8FAF9; border: 1px solid #E2E8E4; border-left-width: 4px;
        border-radius: 8px; padding: 9px 11px; cursor: pointer; transition: all 0.15s; }
      .kds-lane-item:hover { background: #F0FDF7; box-shadow: 0 2px 8px rgba(16,24,20,0.06); }
      .kds-lane-item-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px; }
      .kds-lane-ticket-no { font-size: 11px; font-weight: 800; color: #64748B; }
      .kds-lane-time { font-size: 10px; font-weight: 800; }
      .kds-lane-item-name { font-size: 13px; font-weight: 700; color: #1E293B; }
      .kds-lane-item-name .qty { color: #0F9D62; font-weight: 800; }
      .kds-lane-mods { font-size: 10px; color: #B45309; margin-top: 3px; font-weight: 600; }

      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #CBD5C9; border-radius: 6px; }
    `}</style>
  );
}
