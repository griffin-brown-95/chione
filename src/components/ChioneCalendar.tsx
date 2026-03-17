'use client';

import { useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import { downloadICS, googleCalendarUrl, outlookWebUrl } from '@/lib/ics';

const NGB_SPORTS: Record<string, string[]> = {
  'ISU': ['Figure Skating', 'Speed Skating', 'Short Track Speed Skating', 'Synchronized Skating'],
  'FIS': ['Alpine Skiing', 'Cross Country', 'Ski Jumping', 'Freeride', 'Freestyle', 'Freeski Park and Pipe', 'Snowboard', 'Nordic Combined', 'Para Alpine', 'Para Cross Country', 'Para Snowboard'],
  'IBU': ['Biathlon'],
  'IBSF': ['Bobsled', 'Luge', 'Skeleton'],
};

const THEMES = {
  dark: {
    bg:          '#0a0f1e',
    sidebar:     '#0f172a',
    border:      '#1e293b',
    borderMid:   '#334155',
    textPrimary: '#e2e8f0',
    textMuted:   '#94a3b8',
    textFaint:   '#64748b',
    textDim:     '#475569',
    input:       '#1e293b',
    button:      '#1e293b',
    weekendBg:   '#0d1424',
  },
  light: {
    bg:          '#f1f5f9',
    sidebar:     '#ffffff',
    border:      '#e2e8f0',
    borderMid:   '#cbd5e1',
    textPrimary: '#0f172a',
    textMuted:   '#334155',
    textFaint:   '#64748b',
    textDim:     '#94a3b8',
    input:       '#f8fafc',
    button:      '#f1f5f9',
    weekendBg:   '#e9eef5',
  },
};

const SOURCE_COLORS: Record<string, string> = {
  'ISU':  '#3b82f6',
  'FIS':  '#10b981',
  'IBU':  '#f59e0b',
  'IBSF': '#8b5cf6',
};

const SPORT_COLORS: Record<string, string> = {
  'Figure Skating':             '#3b82f6',
  'Speed Skating':              '#f59e0b',
  'Short Track Speed Skating':  '#10b981',
  'Synchronized Skating':       '#8b5cf6',
  'Alpine Skiing':              '#10b981',
  'Cross Country':              '#06b6d4',
  'Ski Jumping':                '#f97316',
  'Freeride':                   '#ec4899',
  'Freestyle':                  '#ec4899',
  'Freeski Park and Pipe':      '#ec4899',
  'Snowboard':                  '#a3e635',
  'Nordic Combined':            '#14b8a6',
  'Biathlon':                   '#f59e0b',
  'Bobsled':                    '#8b5cf6',
  'Luge':                       '#c084fc',
  'Skeleton':                   '#e879f9',
  'Other':                      '#64748b',
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  'Olympics':                   '#f59e0b',
  'World Championships':        '#3b82f6',
  'Junior World Championships': '#60a5fa',
  'World Cup':                  '#10b981',
  'Grand Prix Final':           '#f97316',
  'Grand Prix':                 '#fb923c',
  'Junior Grand Prix':          '#fbbf24',
  'European Championships':     '#8b5cf6',
  'European Cup':               '#8b5cf6',
  'Four Continents':            '#06b6d4',
  'Challenger Series':          '#14b8a6',
  'Continental Cup':            '#a3e635',
  'Junior World Cup':           '#ec4899',
  'FIS':                        '#64748b',
  'Other':                      '#64748b',
};

function getSource(sport: string): string {
  for (const [ngb, sports] of Object.entries(NGB_SPORTS)) {
    if (sports.includes(sport)) return ngb;
  }
  return 'Other';
}

interface Event {
  id: string;
  title: string;
  sport: string;
  event_type: string;
  start_date: string;
  end_date: string | null;
  city: string | null;
  country: string | null;
  source_url: string;
  flag_image_url: string | null;
  airports: string | null;
  city_description: string | null;
  travel_tips: string | null;
  source_name?: string | null;
}

type Theme = typeof THEMES.dark;

export default function ChioneCalendar({ events }: { events: Event[] }) {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [sportFilters, setSportFilters] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [countryFilter, setCountryFilter] = useState<string>('All');
  const [expandedNGB, setExpandedNGB] = useState<string[]>(['ISU']);
  const [darkMode, setDarkMode] = useState(true);
  const t = darkMode ? THEMES.dark : THEMES.light;

  const types = ['All', ...Array.from(new Set(events.map(e => e.event_type).filter(Boolean)))].sort();
  const countries = ['All', ...Array.from(new Set(events.map(e => e.country).filter(Boolean)))].sort();

  const selectedSources = useMemo(() => {
    if (sportFilters.size === 0) return new Set<string>();
    const sources = new Set<string>();
    sportFilters.forEach(sport => sources.add(getSource(sport)));
    return sources;
  }, [sportFilters]);

  const colorMode: 'source' | 'sport' | 'event_type' =
    sportFilters.size === 1 ? 'event_type'
    : sportFilters.size >= 2 || selectedSources.size >= 2 ? 'sport'
    : selectedSources.size === 1 ? 'sport'
    : 'source';

  function getEventColor(e: Event): string {
    if (colorMode === 'event_type') return EVENT_TYPE_COLORS[e.event_type] ?? EVENT_TYPE_COLORS['Other'];
    if (colorMode === 'sport') return SPORT_COLORS[e.sport] ?? SPORT_COLORS['Other'];
    const src = e.source_name ?? getSource(e.sport);
    return SOURCE_COLORS[src] ?? '#64748b';
  }

  const filtered = useMemo(() => events.filter(e => {
    if (sportFilters.size > 0 && !sportFilters.has(e.sport)) return false;
    if (typeFilter !== 'All' && e.event_type !== typeFilter) return false;
    if (countryFilter !== 'All' && e.country !== countryFilter) return false;
    return true;
  }), [events, sportFilters, typeFilter, countryFilter]);

  const calendarEvents = filtered.map(e => ({
    id: e.id,
    title: e.title,
    start: e.start_date,
    end: e.end_date ?? e.start_date,
    backgroundColor: getEventColor(e),
    borderColor: 'transparent',
    extendedProps: e,
  }));

  const hasFilters = sportFilters.size > 0 || typeFilter !== 'All' || countryFilter !== 'All';

  function toggleSport(sport: string) {
    setSportFilters(prev => {
      const next = new Set(prev);
      if (next.has(sport)) next.delete(sport);
      else next.add(sport);
      return next;
    });
  }

  const legendEntries = useMemo(() => {
    if (colorMode === 'event_type') {
      const eventTypes = new Set(filtered.map(e => e.event_type).filter(Boolean));
      return Array.from(eventTypes).map(et => ({ label: et, color: EVENT_TYPE_COLORS[et] ?? EVENT_TYPE_COLORS['Other'] }));
    }
    if (colorMode === 'sport') {
      const sports = new Set(filtered.map(e => e.sport).filter(Boolean));
      return Array.from(sports).map(s => ({ label: s, color: SPORT_COLORS[s] ?? SPORT_COLORS['Other'] }));
    }
    return Object.entries(SOURCE_COLORS).map(([src, color]) => ({ label: src, color }));
  }, [colorMode, filtered]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: t.bg, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>

      {/* Sidebar */}
      <aside style={{
        width: '280px', flexShrink: 0, background: t.sidebar,
        borderRight: `1px solid ${t.border}`, padding: '32px 24px',
        display: 'flex', flexDirection: 'column', gap: '32px'
      }}>

        {/* Logo + theme toggle */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '0.15em', color: t.textPrimary }}>
              CHIONE
            </div>
            <button onClick={() => setDarkMode(d => !d)} style={{
              background: 'none', border: `1px solid ${t.borderMid}`,
              color: t.textFaint, borderRadius: '6px', padding: '4px 8px',
              fontSize: '12px', cursor: 'pointer'
            }}>
              {darkMode ? '☀' : '☾'}
            </button>
          </div>
          <div style={{ fontSize: '12px', color: t.borderMid, marginTop: '12px', lineHeight: 1.6 }}>
            Named for Χιόνη, Greek nymph of snow and daughter of Boreas, god of the north wind.
          </div>
          <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: t.textFaint, marginTop: '4px' }}>
            WINTER OLYMPIC EVENTS
          </div>
        </div>

        {/* NGB / Sport selector */}
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: t.textFaint, marginBottom: '12px' }}>SPORTS</div>
          {Object.entries(NGB_SPORTS).map(([ngb, sports]) => {
            const isExpanded = expandedNGB.includes(ngb);
            const hasData = events.some(e => sports.includes(e.sport));
            return (
              <div key={ngb} style={{ marginBottom: '8px' }}>
                <div
                  onClick={() => setExpandedNGB(prev =>
                    prev.includes(ngb) ? prev.filter(n => n !== ngb) : [...prev, ngb]
                  )}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', padding: '4px 0', opacity: hasData ? 1 : 0.35
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 600, color: t.textMuted, letterSpacing: '0.05em' }}>
                    {ngb}
                  </span>
                  <span style={{ fontSize: '10px', color: t.textDim }}>{isExpanded ? '▾' : '▸'}</span>
                </div>

                {isExpanded && (
                  <div style={{ paddingLeft: '12px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {sports.map(sport => {
                      const sportHasData = events.some(e => e.sport === sport);
                      const isActive = sportFilters.has(sport);
                      const dotColor = SPORT_COLORS[sport] ?? SPORT_COLORS['Other'];
                      return (
                        <div
                          key={sport}
                          onClick={() => sportHasData && toggleSport(sport)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            cursor: sportHasData ? 'pointer' : 'default',
                            opacity: sportHasData ? (sportFilters.size === 0 || isActive ? 1 : 0.4) : 0.2
                          }}
                        >
                          <div style={{
                            width: '12px', height: '12px', borderRadius: '3px', flexShrink: 0,
                            background: isActive ? dotColor : 'transparent',
                            border: `2px solid ${sportHasData ? dotColor : t.borderMid}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isActive && <span style={{ fontSize: '8px', color: '#fff', lineHeight: 1 }}>✓</span>}
                          </div>
                          <span style={{ fontSize: '12px', color: isActive ? t.textPrimary : t.textMuted }}>
                            {sport}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Color legend */}
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: t.textFaint, marginBottom: '10px' }}>
            COLOR KEY — {colorMode === 'source' ? 'BY SOURCE' : colorMode === 'sport' ? 'BY SPORT' : 'BY EVENT TYPE'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {legendEntries.map(({ label, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: t.textMuted }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: t.textFaint, marginBottom: '4px' }}>FILTERS</div>

          <div>
            <label style={{ fontSize: '11px', color: t.textFaint, display: 'block', marginBottom: '6px' }}>EVENT TYPE</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{
              width: '100%', background: t.input, border: `1px solid ${t.borderMid}`,
              color: t.textPrimary, borderRadius: '6px', padding: '8px 10px', fontSize: '13px'
            }}>
              {types.map(type => <option key={type}>{type}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: t.textFaint, display: 'block', marginBottom: '6px' }}>COUNTRY</label>
            <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} style={{
              width: '100%', background: t.input, border: `1px solid ${t.borderMid}`,
              color: t.textPrimary, borderRadius: '6px', padding: '8px 10px', fontSize: '13px'
            }}>
              {countries.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {hasFilters && (
            <button onClick={() => { setSportFilters(new Set()); setTypeFilter('All'); setCountryFilter('All'); }}
              style={{ background: 'none', border: `1px solid ${t.borderMid}`, color: t.textFaint, borderRadius: '6px', padding: '7px', fontSize: '12px', cursor: 'pointer' }}>
              Clear filters
            </button>
          )}
        </div>

        <div style={{ marginTop: 'auto', fontSize: '12px', color: t.textDim }}>
          {filtered.length} events
        </div>

        {/* Subscribe form */}
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: t.textFaint, marginBottom: '12px' }}>STAY UPDATED</div>
          <SubscribeForm t={t} />
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: '32px', overflow: 'auto', background: t.bg }}>
        <style>{`
          .fc { font-family: 'DM Sans', sans-serif; }
          .fc-theme-standard td, .fc-theme-standard th { border-color: ${t.border}; }
          .fc-theme-standard .fc-scrollgrid { border-color: ${t.border}; }
          .fc .fc-daygrid-day.fc-day-today { background: ${t.sidebar}; }
          .fc .fc-col-header-cell-cushion { color: ${t.textFaint}; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; text-decoration: none; }
          .fc .fc-daygrid-day-number { color: ${t.textDim}; font-size: 13px; text-decoration: none; }
          .fc .fc-daygrid-day:hover { background: ${t.sidebar}; }
          .fc-event { border-radius: 4px !important; padding: 2px 6px !important; font-size: 11px !important; cursor: pointer !important; }
          .fc-event:hover { opacity: 0.85; }
          .fc .fc-button { background: ${t.button} !important; border-color: ${t.borderMid} !important; color: ${t.textMuted} !important; font-size: 13px !important; }
          .fc .fc-button:hover { background: ${t.borderMid} !important; }
          .fc .fc-button-primary:not(:disabled).fc-button-active { background: #3b82f6 !important; border-color: #3b82f6 !important; color: white !important; }
          .fc .fc-toolbar-title { color: ${t.textPrimary} !important; font-size: 18px !important; font-weight: 600 !important; letter-spacing: 0.05em; }
          .fc-day-sat, .fc-day-sun { background: ${t.weekendBg} !important; }
          .fc-daygrid-more-link { color: ${t.textFaint} !important; font-size: 11px !important; }
          .fc-list-day-cushion { background: ${t.sidebar} !important; }
          .fc-list-day-text, .fc-list-day-side-text { color: ${t.textMuted} !important; }
          .fc-list-event-title a { color: ${t.textPrimary} !important; }
          .fc-list-event:hover td { background: ${t.border} !important; }
          .fc .fc-list-empty { background: ${t.bg} !important; color: ${t.textDim} !important; }
          .fc-list-table td { border-color: ${t.border} !important; }
          .fc-theme-standard .fc-list { border-color: ${t.border}; }
        `}</style>

        <FullCalendar
          plugins={[dayGridPlugin, listPlugin]}
          initialView="dayGridMonth"
          initialDate={new Date().toISOString().split('T')[0]}
          events={calendarEvents}
          eventClick={(info) => {
            const sourceUrl = info.event.extendedProps.source_url;
            const original = events.find(e => e.source_url === sourceUrl) ?? null;
            setSelectedEvent(original);
          }}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,listMonth'
          }}
          height="auto"
          dayMaxEvents={3}
          displayEventTime={false}
        />
      </main>

      {/* Event detail panel */}
      {selectedEvent && (
        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: '380px',
          background: t.sidebar, borderLeft: `1px solid ${t.border}`,
          padding: '32px', overflowY: 'auto', zIndex: 100,
          boxShadow: '-20px 0 60px rgba(0,0,0,0.3)'
        }}>
          <button onClick={() => setSelectedEvent(null)} style={{
            background: 'none', border: 'none', color: t.textFaint,
            cursor: 'pointer', fontSize: '20px', marginBottom: '24px',
            display: 'block', marginLeft: 'auto'
          }}>✕</button>

          <div style={{
            display: 'inline-block', padding: '4px 12px', borderRadius: '20px', fontSize: '11px',
            letterSpacing: '0.1em', marginBottom: '16px',
            background: `${getEventColor(selectedEvent)}22`,
            color: getEventColor(selectedEvent),
            border: `1px solid ${getEventColor(selectedEvent)}44`,
          }}>
            {selectedEvent.sport?.toUpperCase()}
          </div>

          <h2 style={{ fontSize: '18px', fontWeight: 600, color: t.textPrimary, lineHeight: 1.4, marginBottom: '24px' }}>
            {selectedEvent.title}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <DetailRow label="DATES" value={formatDates(selectedEvent.start_date, selectedEvent.end_date)} t={t} />
            <DetailRow label="LOCATION" value={[selectedEvent.city, selectedEvent.country].filter(Boolean).join(', ')} t={t} />
            <DetailRow label="EVENT TYPE" value={selectedEvent.event_type} t={t} />

            {selectedEvent.city_description && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: t.textDim, marginBottom: '6px' }}>ABOUT THE CITY</div>
                <p style={{ fontSize: '13px', color: t.textFaint, lineHeight: 1.7, margin: 0 }}>{selectedEvent.city_description}</p>
              </div>
            )}
            {selectedEvent.airports && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: t.textDim, marginBottom: '6px' }}>NEAREST AIRPORTS</div>
                <p style={{ fontSize: '13px', color: t.textFaint, lineHeight: 1.7, margin: 0 }}>{selectedEvent.airports}</p>
              </div>
            )}
            {selectedEvent.travel_tips && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: t.textDim, marginBottom: '6px' }}>TRAVEL TIPS</div>
                <p style={{ fontSize: '13px', color: t.textFaint, lineHeight: 1.7, margin: 0 }}>{selectedEvent.travel_tips}</p>
              </div>
            )}
            {selectedEvent.flag_image_url && (
              <img src={selectedEvent.flag_image_url} alt={selectedEvent.country ?? ''} style={{ width: '40px', marginTop: '4px' }} />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '32px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: t.textDim, marginBottom: '4px' }}>ADD TO CALENDAR</div>

            <button onClick={() => downloadICS(selectedEvent)} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '11px 14px', background: t.button,
              border: `1px solid ${t.borderMid}`, borderRadius: '8px',
              color: t.textMuted, fontSize: '13px', cursor: 'pointer',
              textAlign: 'left', width: '100%'
            }}>
              📅 Download .ics
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: t.textDim }}>Apple / Outlook / Any</span>
            </button>

            <a href={googleCalendarUrl(selectedEvent)} target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '11px 14px', background: t.button,
              border: `1px solid ${t.borderMid}`, borderRadius: '8px',
              color: t.textMuted, fontSize: '13px', textDecoration: 'none'
            }}>
              <img src="/icons/google-calendar.png" width="16" height="16" alt="Google Calendar" />
              Add to Google Calendar
            </a>

            <a href={outlookWebUrl(selectedEvent)} target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '11px 14px', background: t.button,
              border: `1px solid ${t.borderMid}`, borderRadius: '8px',
              color: t.textMuted, fontSize: '13px', textDecoration: 'none'
            }}>
              <img src="/icons/outlook-calendar.png" width="16" height="16" alt="Outlook" />
              Add to Outlook Web
            </a>

            <a href={selectedEvent.source_url} target="_blank" rel="noopener noreferrer" style={{
              display: 'block', marginTop: '6px', padding: '11px 14px', textAlign: 'center',
              background: 'none', border: `1px solid ${t.border}`, borderRadius: '8px',
              color: t.textDim, fontSize: '12px', textDecoration: 'none', letterSpacing: '0.05em'
            }}>
              VIEW SOURCE →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, t }: { label: string; value: string | null | undefined; t: Theme }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: t.textDim, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '14px', color: t.textMuted }}>{value}</div>
    </div>
  );
}

function formatDates(start: string, end: string | null): string {
  const s = new Date(start);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (!end || end === start) return s.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  const e = new Date(end);
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

function SubscribeForm({ t }: { t: Theme }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  async function handleSubmit() {
    if (!email) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      if (res.ok) setStatus('success');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') return (
    <p style={{ fontSize: '12px', color: '#10b981', lineHeight: 1.6, margin: 0 }}>
      Check your inbox to confirm your subscription.
    </p>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input
        type="text"
        placeholder="Name (optional)"
        value={name}
        onChange={e => setName(e.target.value)}
        style={{
          background: t.input, border: `1px solid ${t.borderMid}`, borderRadius: '6px',
          padding: '8px 10px', fontSize: '12px', color: t.textPrimary, width: '100%',
          boxSizing: 'border-box' as const, outline: 'none'
        }}
      />
      <input
        type="email"
        placeholder="Email address"
        value={email}
        onChange={e => setEmail(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        style={{
          background: t.input, border: `1px solid ${t.borderMid}`, borderRadius: '6px',
          padding: '8px 10px', fontSize: '12px', color: t.textPrimary, width: '100%',
          boxSizing: 'border-box' as const, outline: 'none'
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={status === 'loading'}
        style={{
          background: '#3b82f6', border: 'none', borderRadius: '6px',
          padding: '8px', fontSize: '12px', color: 'white',
          cursor: status === 'loading' ? 'not-allowed' : 'pointer',
          opacity: status === 'loading' ? 0.7 : 1
        }}
      >
        {status === 'loading' ? 'Subscribing...' : 'Subscribe to digest'}
      </button>
      {status === 'error' && (
        <p style={{ fontSize: '11px', color: '#ef4444', margin: 0 }}>
          Something went wrong. Try again.
        </p>
      )}
    </div>
  );
}