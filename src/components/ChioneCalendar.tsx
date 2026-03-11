'use client';

import { useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import { downloadICS, googleCalendarUrl, outlookWebUrl } from '@/lib/ics';

const NGB_SPORTS: Record<string, string[]> = {
  'ISU': ['Figure Skating', 'Speed Skating', 'Short Track Speed Skating', 'Synchronized Skating'],
  'FIS': ['Alpine Skiing', 'Cross-Country', 'Ski Jumping', 'Freestyle/Freeski', 'Snowboard', 'Nordic Combined'],
  'IBU': ['Biathlon'],
  'IBSF': ['Bobsled', 'Luge', 'Skeleton'],
};

const SPORT_COLORS: Record<string, string> = {
  'Figure Skating':            '#3b82f6', // blue
  'Speed Skating':             '#f59e0b', // amber
  'Short Track Speed Skating': '#10b981', // emerald
  'Synchronized Skating':      '#8b5cf6', // violet
  'Other':                     '#64748b', // slate
};

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
}

export default function ChioneCalendar({ events }: { events: Event[] }) {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [sportFilter, setSportFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [countryFilter, setCountryFilter] = useState<string>('All');
  const [expandedNGB, setExpandedNGB] = useState<string[]>(['ISU']); // ISU expanded by default

  // Derive unique filter options from data
  const sports = ['All', ...Array.from(new Set(events.map(e => e.sport).filter(Boolean)))].sort();
  const types = ['All', ...Array.from(new Set(events.map(e => e.event_type).filter(Boolean)))].sort();
  const countries = ['All', ...Array.from(new Set(events.map(e => e.country).filter(Boolean)))].sort();

  const filtered = useMemo(() => events.filter(e => {
    if (sportFilter !== 'All' && e.sport !== sportFilter) return false;
    if (typeFilter !== 'All' && e.event_type !== typeFilter) return false;
    if (countryFilter !== 'All' && e.country !== countryFilter) return false;
    return true;
  }), [events, sportFilter, typeFilter, countryFilter]);

  const calendarEvents = filtered.map(e => ({
    id: e.id,
    title: e.title,
    start: e.start_date,
    end: e.end_date ?? e.start_date,
    backgroundColor: SPORT_COLORS[e.sport] ?? SPORT_COLORS['Other'],
    borderColor: 'transparent',
    extendedProps: e,
  }));

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0f1e', color: '#e2e8f0', fontFamily: "'DM Sans', sans-serif" }}>
      
      {/* Sidebar panel */}
      <aside style={{
        width: '280px', flexShrink: 0, background: '#0f172a',
        borderRight: '1px solid #1e293b', padding: '32px 24px',
        display: 'flex', flexDirection: 'column', gap: '32px'
      }}>
        
        {/* Logo */}
        <div>
          <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '0.15em', color: '#e2e8f0' }}>
            CHIONE
          </div>
          <div style={{ fontSize: '12px', color: '#334155', marginTop: '12px', lineHeight: 1.6 }}>
            Named for Χιόνη, Greek nymph of snow and daughter of Boreas, god of the north wind.
          </div>
          <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: '#64748b', marginTop: '4px' }}>
            WINTER OLYMPIC EVENTS
          </div>
        </div>

        {/* NGB / Sport legend */}
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: '#64748b', marginBottom: '12px' }}>SPORTS</div>
          {Object.entries(NGB_SPORTS).map(([ngb, sports]) => {
            const isExpanded = expandedNGB.includes(ngb);
            const hasData = events.some(e => sports.includes(e.sport));
            return (
              <div key={ngb} style={{ marginBottom: '8px' }}>
                {/* NGB header */}
                <div
                  onClick={() => setExpandedNGB(prev =>
                    prev.includes(ngb) ? prev.filter(n => n !== ngb) : [...prev, ngb]
                  )}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', padding: '4px 0', opacity: hasData ? 1 : 0.35
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.05em' }}>
                    {ngb}
                  </span>
                  <span style={{ fontSize: '10px', color: '#475569' }}>{isExpanded ? '▾' : '▸'}</span>
                </div>

                {/* Sports under this NGB */}
                {isExpanded && (
                  <div style={{ paddingLeft: '12px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {sports.map(sport => {
                      const sportHasData = events.some(e => e.sport === sport);
                      const color = SPORT_COLORS[sport] ?? SPORT_COLORS['Other'];
                      const isActive = sportFilter === sport;
                      return (
                        <div
                          key={sport}
                          onClick={() => sportHasData && setSportFilter(isActive ? 'All' : sport)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            cursor: sportHasData ? 'pointer' : 'default',
                            opacity: sportHasData ? (sportFilter === 'All' || isActive ? 1 : 0.4) : 0.2
                          }}
                        >
                          <div style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: sportHasData ? color : '#334155', flexShrink: 0
                          }} />
                          <span style={{ fontSize: '12px', color: isActive ? '#e2e8f0' : '#94a3b8' }}>
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

        {/* Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: '#64748b', marginBottom: '4px' }}>FILTERS</div>

          <div>
            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '6px' }}>EVENT TYPE</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{
              width: '100%', background: '#1e293b', border: '1px solid #334155',
              color: '#e2e8f0', borderRadius: '6px', padding: '8px 10px', fontSize: '13px'
            }}>
              {types.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '6px' }}>COUNTRY</label>
            <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} style={{
              width: '100%', background: '#1e293b', border: '1px solid #334155',
              color: '#e2e8f0', borderRadius: '6px', padding: '8px 10px', fontSize: '13px'
            }}>
              {countries.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {(sportFilter !== 'All' || typeFilter !== 'All' || countryFilter !== 'All') && (
            <button onClick={() => { setSportFilter('All'); setTypeFilter('All'); setCountryFilter('All'); }}
              style={{ background: 'none', border: '1px solid #334155', color: '#64748b', borderRadius: '6px', padding: '7px', fontSize: '12px', cursor: 'pointer' }}>
              Clear filters
            </button>
          )}
        </div>

        <div style={{ marginTop: 'auto', fontSize: '12px', color: '#334155' }}>
          {filtered.length} events
        </div>

        {/* Subscribe form */}
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: '#64748b', marginBottom: '12px' }}>STAY UPDATED</div>
          <SubscribeForm />
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: '32px', overflow: 'auto' }}>
        <style>{`
          .fc { font-family: 'DM Sans', sans-serif; }
          .fc-theme-standard td, .fc-theme-standard th { border-color: #1e293b; }
          .fc-theme-standard .fc-scrollgrid { border-color: #1e293b; }
          .fc .fc-daygrid-day.fc-day-today { background: #0f172a; }
          .fc .fc-col-header-cell-cushion { color: #64748b; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; text-decoration: none; }
          .fc .fc-daygrid-day-number { color: #475569; font-size: 13px; text-decoration: none; }
          .fc .fc-daygrid-day:hover { background: #0f172a; }
          .fc-event { border-radius: 4px !important; padding: 2px 6px !important; font-size: 11px !important; cursor: pointer !important; }
          .fc-event:hover { opacity: 0.85; }
          .fc .fc-button { background: #1e293b !important; border-color: #334155 !important; color: #94a3b8 !important; font-size: 13px !important; }
          .fc .fc-button:hover { background: #334155 !important; }
          .fc .fc-button-primary:not(:disabled).fc-button-active { background: #3b82f6 !important; border-color: #3b82f6 !important; color: white !important; }
          .fc .fc-toolbar-title { color: #e2e8f0 !important; font-size: 18px !important; font-weight: 600 !important; letter-spacing: 0.05em; }
          .fc-day-sat, .fc-day-sun { background: #0d1424 !important; }
          .fc-daygrid-more-link { color: #64748b !important; font-size: 11px !important; }
          .fc-list-day-cushion { background: #0f172a !important; }
          .fc-list-day-text, .fc-list-day-side-text { color: #94a3b8 !important; }
          .fc-list-event-title a { color: #e2e8f0 !important; }
          .fc-list-event:hover td { background: #1e293b !important; }
          .fc .fc-list-empty { background: #0a0f1e !important; color: #475569 !important; }
          .fc-list-table td { border-color: #1e293b !important; }
        `}</style>

        <FullCalendar
          plugins={[dayGridPlugin, listPlugin]}
          initialView="dayGridMonth"
          initialDate={new Date().toISOString().split('T')[0]}
          events={calendarEvents}
          eventClick={(info) => {
            console.log('[click] extendedProps:', JSON.stringify(info.event.extendedProps));
            const sourceUrl = info.event.extendedProps.source_url;
            const original = events.find(e => e.source_url === sourceUrl) ?? null;
            console.log('[click] original event:', JSON.stringify(original));
            setSelectedEvent(original);
          }}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,listMonth'
          }}
          height="auto"
          dayMaxEvents={3}
          eventTimeFormat={{ hour: undefined }}
          displayEventTime={false}
        />
      </main>

      {/* Side panel */}
      {selectedEvent && (
        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: '380px',
          background: '#0f172a', borderLeft: '1px solid #1e293b',
          padding: '32px', overflowY: 'auto', zIndex: 100,
          boxShadow: '-20px 0 60px rgba(0,0,0,0.5)'
        }}>
          <button onClick={() => setSelectedEvent(null)} style={{
            background: 'none', border: 'none', color: '#64748b',
            cursor: 'pointer', fontSize: '20px', marginBottom: '24px',
            display: 'block', marginLeft: 'auto'
          }}>✕</button>

          {/* Sport badge */}
          <div style={{
            display: 'inline-block', padding: '4px 12px', borderRadius: '20px', fontSize: '11px',
            letterSpacing: '0.1em', marginBottom: '16px',
            background: `${SPORT_COLORS[selectedEvent.sport] ?? SPORT_COLORS['Other']}22`,
            color: SPORT_COLORS[selectedEvent.sport] ?? SPORT_COLORS['Other'],
            border: `1px solid ${SPORT_COLORS[selectedEvent.sport] ?? SPORT_COLORS['Other']}44`,
          }}>
            {selectedEvent.sport?.toUpperCase()}
          </div>

          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#e2e8f0', lineHeight: 1.4, marginBottom: '24px' }}>
            {selectedEvent.title}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <DetailRow label="DATES" value={formatDates(selectedEvent.start_date, selectedEvent.end_date)} />
            <DetailRow label="LOCATION" value={[selectedEvent.city, selectedEvent.country].filter(Boolean).join(', ')} />
            <DetailRow label="EVENT TYPE" value={selectedEvent.event_type} />
            {selectedEvent.city_description && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: '#475569', marginBottom: '6px' }}>ABOUT THE CITY</div>
                  <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.7, margin: 0 }}>
                    {selectedEvent.city_description}
                  </p>
                </div>
              )}

              {selectedEvent.airports && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: '#475569', marginBottom: '6px' }}>NEAREST AIRPORTS</div>
                  <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.7, margin: 0 }}>
                    {selectedEvent.airports}
                  </p>
                </div>
              )}

              {selectedEvent.travel_tips && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: '#475569', marginBottom: '6px' }}>TRAVEL TIPS</div>
                  <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.7, margin: 0 }}>
                    {selectedEvent.travel_tips}
                  </p>
                </div>
              )}

            {selectedEvent.flag_image_url && (
              <img src={selectedEvent.flag_image_url} alt={selectedEvent.country ?? ''} style={{ width: '40px', marginTop: '4px' }} />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '32px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: '#475569', marginBottom: '4px' }}>
            ADD TO CALENDAR
          </div>

          <button onClick={() => downloadICS(selectedEvent)} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '11px 14px', background: '#1e293b',
            border: '1px solid #334155', borderRadius: '8px',
            color: '#94a3b8', fontSize: '13px', cursor: 'pointer',
            textAlign: 'left', width: '100%'
          }}>
            📅 Download .ics
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#475569' }}>Apple / Outlook / Any</span>
          </button>

        <a href={googleCalendarUrl(selectedEvent)} target="_blank" rel="noopener noreferrer" style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '11px 14px', background: '#1e293b',
            border: '1px solid #334155', borderRadius: '8px',
            color: '#94a3b8', fontSize: '13px', textDecoration: 'none'
        }}>
            📅 Add to Google Calendar
        </a>

        <a href={outlookWebUrl(selectedEvent)} target="_blank" rel="noopener noreferrer" style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '11px 14px', background: '#1e293b',
            border: '1px solid #334155', borderRadius: '8px',
            color: '#94a3b8', fontSize: '13px', textDecoration: 'none'
        }}>
            📅 Add to Outlook Web
        </a>

        <a href={selectedEvent.source_url} target="_blank" rel="noopener noreferrer" style={{
            display: 'block', marginTop: '6px', padding: '11px 14px', textAlign: 'center',
            background: 'none', border: '1px solid #1e293b', borderRadius: '8px',
            color: '#475569', fontSize: '12px', textDecoration: 'none', letterSpacing: '0.05em'
        }}>
            VIEW ON ISU.ORG →
        </a>
        </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: '#475569', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '14px', color: '#94a3b8' }}>{value}</div>
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

function SubscribeForm() {
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
          background: '#1e293b', border: '1px solid #334155', borderRadius: '6px',
          padding: '8px 10px', fontSize: '12px', color: '#e2e8f0', width: '100%',
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
          background: '#1e293b', border: '1px solid #334155', borderRadius: '6px',
          padding: '8px 10px', fontSize: '12px', color: '#e2e8f0', width: '100%',
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