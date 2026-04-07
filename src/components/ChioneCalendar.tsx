'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import { downloadICS, googleCalendarUrl, outlookWebUrl } from '@/lib/ics';
import ChatPanel from '@/components/ChatPanel';

// Loaded client-side only — react-simple-maps accesses browser APIs at import time
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: '13px', color: '#4a6b88', letterSpacing: '0.1em' }}>Loading map…</div>
    </div>
  ),
});

// ─── Constants ────────────────────────────────────────────────────────────────

const NGB_SPORTS: Record<string, string[]> = {
  ISU:  ['Figure Skating', 'Speed Skating', 'Short Track Speed Skating', 'Synchronized Skating'],
  FIS:  ['Alpine Skiing', 'Cross Country', 'Ski Jumping', 'Freeride', 'Freestyle', 'Freeski Park and Pipe', 'Snowboard', 'Nordic Combined', 'Para Alpine', 'Para Cross Country', 'Para Snowboard'],
  IBU:  ['Biathlon'],
  IBSF: ['Bobsled', 'Luge', 'Skeleton'],
};

const THEMES = {
  dark: {
    bg:          '#06091a',
    bgGradient:  'radial-gradient(ellipse at 18% 45%, rgba(59,130,246,0.08) 0%, transparent 55%), radial-gradient(ellipse at 82% 55%, rgba(99,102,241,0.05) 0%, transparent 55%), #06091a',
    surface:     '#0b1527',
    sidebar:     '#0b1527',
    border:      '#141f35',
    borderMid:   '#1c3052',
    textPrimary: '#dde9ff',
    textMuted:   '#9dbdda',   // ↑ from #6d90b8 — better body-text contrast
    textFaint:   '#6b93b5',   // ↑ from #3b5578 — passes AA on dark bg
    textDim:     '#4a6b88',   // ↑ from #253848 — passes AA Large on dark bg
    input:       '#0e1c30',
    button:      '#0e1c30',
    weekendBg:   '#070b18',
    accent:      '#3b82f6',
    accentDim:   'rgba(59,130,246,0.12)',
    accentBorder:'rgba(59,130,246,0.25)',
  },
  light: {
    bg:          '#f0f5ff',
    bgGradient:  'radial-gradient(ellipse at 18% 45%, rgba(59,130,246,0.06) 0%, transparent 55%), #f0f5ff',
    surface:     '#ffffff',
    sidebar:     '#ffffff',
    border:      '#dde8f8',
    borderMid:   '#c0d4f0',
    textPrimary: '#0c1d36',
    textMuted:   '#2e4f72',
    textFaint:   '#5577a0',
    textDim:     '#8aabcc',
    input:       '#f4f8ff',
    button:      '#edf2fc',
    weekendBg:   '#e8effe',
    accent:      '#2563eb',
    accentDim:   'rgba(37,99,235,0.08)',
    accentBorder:'rgba(37,99,235,0.2)',
  },
};

// NGB base colours — used for fallback and the 4-dot legend
const SOURCE_COLORS: Record<string, string> = {
  FIS:  '#2563eb',
  ISU:  '#7c3aed',
  IBU:  '#b45309',
  IBSF: '#059669',
};

// Per-sport colours, grouped by NGB family:
//   FIS  → blue shades (deep navy → sky)
//   ISU  → violet/purple shades
//   IBU  → amber
//   IBSF → emerald/teal shades
const NGB_SPORT_COLORS: Record<string, string> = {
  // FIS — blues
  'Alpine Skiing':          '#1e3a8a',
  'Nordic Combined':        '#1e40af',
  'Cross Country':          '#1d4ed8',
  'Ski Jumping':            '#2563eb',
  'Snowboard':              '#3b82f6',
  'Freestyle':              '#60a5fa',
  'Freeski Park and Pipe':  '#38bdf8',
  'Freeride':               '#0ea5e9',
  'Para Alpine':            '#1e3a8a',
  'Para Cross Country':     '#1d4ed8',
  'Para Snowboard':         '#3b82f6',
  // ISU — violets
  'Figure Skating':             '#5b21b6',
  'Speed Skating':              '#7c3aed',
  'Short Track Speed Skating':  '#8b5cf6',
  'Synchronized Skating':       '#a78bfa',
  // IBU — amber
  'Biathlon':               '#b45309',
  // IBSF — emerald
  'Bobsled':                '#065f46',
  'Luge':                   '#047857',
  'Skeleton':               '#059669',
};

const SUGGESTED_PROMPTS = [
  { icon: '⛸', text: 'What Figure Skating events are coming up this season?' },
  { icon: '🎿', text: 'Which World Cup races are in Europe in the next 3 months?' },
  { icon: '✈️', text: 'Where should I fly into for events in Norway?' },
  { icon: '🏆', text: "What's the biggest event happening in the next 30 days?" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventMetadata {
  airports?: string;
  city_description?: string;
  travel_tips?: string;
  [key: string]: unknown;
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
  metadata: EventMetadata | null;
  source_name?: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

type Theme = typeof THEMES.dark;
type Tab = 'chat' | 'calendar' | 'map';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSource(sport: string): string {
  for (const [ngb, sports] of Object.entries(NGB_SPORTS)) {
    if (sports.includes(sport)) return ngb;
  }
  return 'Other';
}

// Map a hex color → a stable CSS class name, e.g. "#10b981" → "chione-evt-10b981"
function colorToClass(hex: string): string {
  return 'chione-evt-' + hex.replace(/[^a-fA-F0-9]/g, '');
}

// Pre-build one CSS rule per unique event color so we can use !important to
// win the specificity war against Tailwind v4's preflight reset.
const _ALL_EVENT_COLORS = new Set([
  ...Object.values(NGB_SPORT_COLORS),
  ...Object.values(SOURCE_COLORS),
]);
const EVENT_COLOR_CSS = Array.from(_ALL_EVENT_COLORS).map(color => {
  const cls = colorToClass(color);
  return [
    `.fc-event.${cls} { background-color: ${color} !important; border-color: transparent !important; color: #fff !important; }`,
    `.fc-list-event.${cls} .fc-list-event-dot { border-color: ${color} !important; }`,
  ].join('\n');
}).join('\n');

// Look up NGB-family colour for an event sport; fall back to NGB base colour.
function getEventColor(e: Event): string {
  if (NGB_SPORT_COLORS[e.sport]) return NGB_SPORT_COLORS[e.sport];
  const src = e.source_name ?? getSource(e.sport);
  return SOURCE_COLORS[src] ?? '#64748b';
}

function formatDates(start: string, end: string | null): string {
  const s = new Date(start);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (!end || end === start) return s.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  const e = new Date(end);
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChioneCalendar({ events }: { events: Event[] }) {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [chatContextEvent, setChatContextEvent] = useState<Event | null>(null);

  // Calendar filters
  const [sportFilters, setSportFilters] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [countryFilter, setCountryFilter] = useState<string>('All');
  const [expandedNGB, setExpandedNGB] = useState<string[]>(['ISU']);

  // Embedded chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const [darkMode, setDarkMode] = useState(true);
  const t = darkMode ? THEMES.dark : THEMES.light;

  const types = ['All', ...Array.from(new Set(events.map(e => e.event_type).filter(Boolean)))].sort();
  const countries = ['All', ...Array.from(new Set(events.map(e => e.country).filter(Boolean)))].sort();


  const filtered = useMemo(() => events.filter(e => {
    if (sportFilters.size > 0 && !sportFilters.has(e.sport)) return false;
    if (typeFilter !== 'All' && e.event_type !== typeFilter) return false;
    if (countryFilter !== 'All' && e.country !== countryFilter) return false;
    return true;
  }), [events, sportFilters, typeFilter, countryFilter]);

  const calendarEvents = useMemo(() => filtered.map(e => ({
    id: e.id,
    title: e.title,
    start: e.start_date,
    end: e.end_date ?? e.start_date,
    backgroundColor: getEventColor(e),
    borderColor: 'transparent',
    textColor: '#ffffff',
    extendedProps: e,
  })), [filtered]);

  function toggleSport(sport: string) {
    setSportFilters(prev => {
      const next = new Set(prev);
      if (next.has(sport)) next.delete(sport);
      else next.add(sport);
      return next;
    });
  }

  // ── Embedded chat send ──────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  async function sendChatMessage(text: string) {
    if (!text.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    const next = [...chatMessages, userMsg];
    setChatMessages(next);
    setChatInput('');
    setChatLoading(true);
    setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      });
      if (!res.ok || !res.body) {
        setChatMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' }; return u; });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const final = acc;
        setChatMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: final }; return u; });
      }
    } catch {
      setChatMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' }; return u; });
    } finally {
      setChatLoading(false);
    }
  }

  function handleChatKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(chatInput); }
  }

  function openChatWithContext(event: Event) {
    const msg = `Tell me more about ${event.title} in ${[event.city, event.country].filter(Boolean).join(', ')}.`;
    setActiveTab('chat');
    setSelectedEvent(null);
    setTimeout(() => sendChatMessage(msg), 50);
  }

  const hasFilters = sportFilters.size > 0 || typeFilter !== 'All' || countryFilter !== 'All';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: t.bgGradient, color: t.textPrimary, fontFamily: "'DM Sans', sans-serif", overflow: 'hidden' }}>

      {/* ── Header ── */}
      <header style={{
        height: '56px', flexShrink: 0,
        background: t.surface,
        borderBottom: `1px solid ${t.border}`,
        display: 'flex', alignItems: 'center',
        padding: '0 28px', gap: '24px', zIndex: 50,
      }}>
        {/* Brand */}
        <div style={{
          fontSize: '15px', fontWeight: 800, letterSpacing: '0.22em',
          backgroundImage: darkMode
            ? 'linear-gradient(110deg, #93c5fd 0%, #818cf8 60%, #a78bfa 100%)'
            : 'linear-gradient(110deg, #1d4ed8 0%, #4f46e5 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          flexShrink: 0,
        }}>
          CHIONE
        </div>

        {/* Tabs — centred */}
        <div style={{ display: 'flex', gap: '4px', margin: '0 auto', background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)', borderRadius: '10px', padding: '4px' }}>
          {([
            { id: 'chat',     label: 'Ask Chione' },
            { id: 'calendar', label: 'Calendar' },
            { id: 'map',      label: 'Map' },
          ] as { id: Tab; label: string }[]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                padding: '5px 20px',
                borderRadius: '7px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '0.03em',
                cursor: 'pointer',
                transition: 'background 0.2s ease, color 0.2s ease',
                background: activeTab === id
                  ? (darkMode ? '#1e3a6e' : '#2563eb')
                  : 'transparent',
                color: activeTab === id
                  ? (darkMode ? '#93c5fd' : '#ffffff')
                  : t.textFaint,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', color: t.textDim, letterSpacing: '0.15em' }}>
            {events.length} EVENTS
          </div>
          <button onClick={() => setDarkMode(d => !d)} style={{
            background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
            border: `1px solid ${t.border}`,
            color: t.textFaint, borderRadius: '7px',
            padding: '5px 10px', fontSize: '13px', cursor: 'pointer',
          }}>
            {darkMode ? '☀' : '☾'}
          </button>
        </div>
      </header>

      {/* ── Content area ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Chat tab */}
        <div style={{
          position: 'absolute', inset: 0,
          opacity: activeTab === 'chat' ? 1 : 0,
          transform: activeTab === 'chat' ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.28s ease, transform 0.28s ease',
          pointerEvents: activeTab === 'chat' ? 'auto' : 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          overflowY: 'auto',
        }}>
          <div style={{ width: '100%', maxWidth: '720px', display: 'flex', flexDirection: 'column', flex: 1, padding: '0 24px' }}>

            {/* Hero — shown only when no messages */}
            {chatMessages.length === 0 && (
              <div style={{ paddingTop: '72px', paddingBottom: '48px', textAlign: 'center' }}>
                <div style={{
                  fontSize: '11px', letterSpacing: '0.3em', color: t.textFaint,
                  marginBottom: '20px', fontWeight: 600,
                }}>
                  WINTER OLYMPIC EVENTS
                </div>
                <h1 style={{
                  fontSize: '42px', fontWeight: 800, lineHeight: 1.15,
                  letterSpacing: '-0.02em', marginBottom: '16px',
                  backgroundImage: darkMode
                    ? 'linear-gradient(135deg, #e2ecff 0%, #93c5fd 45%, #a5b4fc 100%)'
                    : 'linear-gradient(135deg, #0c1d36 0%, #1d4ed8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                  Explore the Season
                </h1>
                <p style={{ fontSize: '16px', color: t.textMuted, lineHeight: 1.7, maxWidth: '480px', margin: '0 auto 48px' }}>
                  Ask about schedules, travel logistics, venues, or anything else across all Winter Olympic sports.
                </p>

                {/* Suggested prompts */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', textAlign: 'left' }}>
                  {SUGGESTED_PROMPTS.map(({ icon, text }) => (
                    <button
                      key={text}
                      onClick={() => sendChatMessage(text)}
                      style={{
                        background: t.surface,
                        border: `1px solid ${t.border}`,
                        borderRadius: '12px',
                        padding: '16px 18px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'border-color 0.2s ease, background 0.2s ease',
                        display: 'flex', alignItems: 'flex-start', gap: '12px',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = t.accentBorder;
                        (e.currentTarget as HTMLButtonElement).style.background = t.accentDim;
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = t.border;
                        (e.currentTarget as HTMLButtonElement).style.background = t.surface;
                      }}
                    >
                      <span style={{ fontSize: '20px', lineHeight: 1, flexShrink: 0, marginTop: '1px' }}>{icon}</span>
                      <span style={{ fontSize: '13px', color: t.textMuted, lineHeight: 1.55 }}>{text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {chatMessages.length > 0 && (
              <div style={{ paddingTop: '32px', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '24px' }}>
                {chatMessages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {msg.role === 'assistant' && (
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, #3b82f6, #818cf8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: 700, color: '#fff',
                        marginRight: '12px', marginTop: '2px',
                      }}>
                        C
                      </div>
                    )}
                    <div style={{
                      maxWidth: msg.role === 'user' ? '72%' : '100%',
                      padding: msg.role === 'user' ? '10px 16px' : '12px 16px',
                      borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                      background: msg.role === 'user'
                        ? (darkMode ? '#1e3a6e' : '#2563eb')
                        : t.surface,
                      border: msg.role === 'user' ? 'none' : `1px solid ${t.border}`,
                      color: msg.role === 'user' ? '#dde9ff' : t.textMuted,
                      fontSize: '14px', lineHeight: 1.7,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {msg.content || (msg.role === 'assistant' && chatLoading
                        ? <span style={{ color: t.textFaint, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <LoadingDots color={t.textFaint} /> Searching events...
                          </span>
                        : null
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Pinned input bar */}
          <div style={{
            width: '100%', maxWidth: '720px', padding: '16px 24px 24px',
            flexShrink: 0, position: 'sticky', bottom: 0,
            background: `linear-gradient(to top, ${darkMode ? '#06091a' : '#f0f5ff'} 70%, transparent)`,
          }}>
            <div style={{
              display: 'flex', gap: '10px', alignItems: 'flex-end',
              background: t.surface,
              border: `1px solid ${t.borderMid}`,
              borderRadius: '16px',
              padding: '10px 10px 10px 16px',
              boxShadow: darkMode ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(0,0,0,0.08)',
            }}>
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Ask about events, travel, logistics…"
                rows={1}
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  fontSize: '14px', color: t.textPrimary, resize: 'none',
                  lineHeight: 1.5, fontFamily: 'inherit',
                  maxHeight: '120px', overflowY: 'auto',
                }}
              />
              <button
                onClick={() => sendChatMessage(chatInput)}
                disabled={chatLoading || !chatInput.trim()}
                style={{
                  width: '36px', height: '36px', borderRadius: '10px', border: 'none',
                  background: chatLoading || !chatInput.trim() ? t.borderMid : t.accent,
                  color: '#fff', fontSize: '16px', cursor: chatLoading || !chatInput.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'background 0.15s ease',
                }}
              >
                ↑
              </button>
            </div>
            <div style={{ fontSize: '11px', color: t.textDim, textAlign: 'center', marginTop: '8px' }}>
              Enter to send · Shift+Enter for new line
            </div>
          </div>
        </div>

        {/* Calendar tab */}
        <div style={{
          position: 'absolute', inset: 0,
          opacity: activeTab === 'calendar' ? 1 : 0,
          transform: activeTab === 'calendar' ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.28s ease, transform 0.28s ease',
          pointerEvents: activeTab === 'calendar' ? 'auto' : 'none',
          display: 'flex', overflow: 'hidden',
        }}>
          {/* Sidebar */}
          <aside style={{
            width: '268px', flexShrink: 0, background: t.surface,
            borderRight: `1px solid ${t.border}`, padding: '28px 22px',
            display: 'flex', flexDirection: 'column', gap: '28px',
            overflowY: 'auto',
          }}>
            <div style={{ fontSize: '10px', color: t.textDim, letterSpacing: '0.2em' }}>NAMED FOR ΧΙΌΝΗ, GREEK NYMPH OF SNOW</div>

            {/* Sports */}
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: t.textFaint, marginBottom: '12px', fontWeight: 600 }}>SPORTS</div>
              {Object.entries(NGB_SPORTS).map(([ngb, sports]) => {
                const isExpanded = expandedNGB.includes(ngb);
                const hasData = events.some(e => sports.includes(e.sport));
                return (
                  <div key={ngb} style={{ marginBottom: '6px' }}>
                    <div
                      onClick={() => setExpandedNGB(prev => prev.includes(ngb) ? prev.filter(n => n !== ngb) : [...prev, ngb])}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '4px 0', opacity: hasData ? 1 : 0.3 }}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 700, color: t.textMuted, letterSpacing: '0.08em' }}>{ngb}</span>
                      <span style={{ fontSize: '9px', color: t.textDim }}>{isExpanded ? '▾' : '▸'}</span>
                    </div>
                    {isExpanded && (
                      <div style={{ paddingLeft: '10px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {sports.map(sport => {
                          const sportHasData = events.some(e => e.sport === sport);
                          const isActive = sportFilters.has(sport);
                          const dotColor = NGB_SPORT_COLORS[sport] ?? SOURCE_COLORS[getSource(sport)] ?? '#64748b';
                          return (
                            <div key={sport} onClick={() => sportHasData && toggleSport(sport)} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: sportHasData ? 'pointer' : 'default', opacity: sportHasData ? (sportFilters.size === 0 || isActive ? 1 : 0.35) : 0.15 }}>
                              <div style={{ width: '11px', height: '11px', borderRadius: '3px', flexShrink: 0, background: isActive ? dotColor : 'transparent', border: `2px solid ${sportHasData ? dotColor : t.borderMid}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {isActive && <span style={{ fontSize: '7px', color: '#fff', lineHeight: 1 }}>✓</span>}
                              </div>
                              <span style={{ fontSize: '11px', color: isActive ? t.textPrimary : t.textMuted }}>{sport}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* NGB Legend */}
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: t.textFaint, marginBottom: '10px', fontWeight: 600 }}>COLOUR KEY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {(Object.entries(SOURCE_COLORS) as [string, string][]).map(([ngb, color]) => (
                  <div key={ngb} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: t.textMuted }}>{ngb}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: t.textFaint, fontWeight: 600 }}>FILTERS</div>
              <div>
                <label style={{ fontSize: '10px', color: t.textFaint, display: 'block', marginBottom: '6px' }}>EVENT TYPE</label>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: '100%', background: t.input, border: `1px solid ${t.borderMid}`, color: t.textPrimary, borderRadius: '7px', padding: '7px 10px', fontSize: '12px' }}>
                  {types.map(type => <option key={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '10px', color: t.textFaint, display: 'block', marginBottom: '6px' }}>COUNTRY</label>
                <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} style={{ width: '100%', background: t.input, border: `1px solid ${t.borderMid}`, color: t.textPrimary, borderRadius: '7px', padding: '7px 10px', fontSize: '12px' }}>
                  {countries.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {hasFilters && (
                <button onClick={() => { setSportFilters(new Set()); setTypeFilter('All'); setCountryFilter('All'); }} style={{ background: 'none', border: `1px solid ${t.borderMid}`, color: t.textFaint, borderRadius: '7px', padding: '7px', fontSize: '11px', cursor: 'pointer' }}>
                  Clear filters
                </button>
              )}
            </div>

            <div style={{ marginTop: 'auto', fontSize: '11px', color: t.textDim }}>{filtered.length} events</div>

            {/* Subscribe */}
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: t.textFaint, marginBottom: '12px', fontWeight: 600 }}>STAY UPDATED</div>
              <SubscribeForm t={t} />
            </div>
          </aside>

          {/* Calendar main */}
          <main style={{ flex: 1, padding: '28px 28px 28px', overflow: 'auto', background: t.bgGradient }}>
            <style>{`
              .fc { font-family: 'DM Sans', sans-serif; }
              .fc-theme-standard td, .fc-theme-standard th { border-color: ${t.border}; }
              .fc-theme-standard .fc-scrollgrid { border-color: ${t.border}; }
              .fc .fc-daygrid-day.fc-day-today { background: ${t.surface}; }
              .fc .fc-col-header-cell-cushion { color: ${t.textMuted}; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; text-decoration: none; }
              .fc .fc-daygrid-day-number { color: ${t.textFaint}; font-size: 12px; text-decoration: none; }
              .fc .fc-daygrid-day:hover { background: ${t.surface}; }
              .fc-event { border-radius: 5px !important; padding: 2px 6px !important; font-size: 11px !important; cursor: pointer !important; font-weight: 500 !important; }
              .fc-event:hover { opacity: 0.82; }
              .fc .fc-button { background: ${t.button} !important; border-color: ${t.borderMid} !important; color: ${t.textMuted} !important; font-size: 12px !important; border-radius: 7px !important; }
              .fc .fc-button:hover { background: ${t.borderMid} !important; }
              .fc .fc-button-primary:not(:disabled).fc-button-active { background: #3b82f6 !important; border-color: #3b82f6 !important; color: white !important; }
              .fc .fc-toolbar-title { color: ${t.textPrimary} !important; font-size: 17px !important; font-weight: 700 !important; letter-spacing: 0.03em; }
              .fc-day-sat, .fc-day-sun { background: ${t.weekendBg} !important; }
              .fc-daygrid-more-link { color: ${t.textFaint} !important; font-size: 11px !important; }
              .fc-list-day-cushion { background: ${t.surface} !important; }
              .fc-list-day-text, .fc-list-day-side-text { color: ${t.textMuted} !important; }
              .fc-list-event-title a { color: ${t.textPrimary} !important; }
              .fc-list-event:hover td { background: ${t.border} !important; }
              .fc .fc-list-empty { background: ${t.bgGradient} !important; color: ${t.textFaint} !important; }
              .fc-list-table td { border-color: ${t.border} !important; }
              .fc-theme-standard .fc-list { border-color: ${t.border}; }
              ${EVENT_COLOR_CSS}
            `}</style>
            <FullCalendar
              plugins={[dayGridPlugin, listPlugin]}
              initialView="dayGridMonth"
              initialDate={new Date().toISOString().split('T')[0]}
              events={calendarEvents}
              eventClassNames={(arg) => {
                const e = arg.event.extendedProps as Event;
                return [colorToClass(getEventColor(e))];
              }}
              eventClick={(info) => {
                const sourceUrl = info.event.extendedProps.source_url;
                const original = events.find(e => e.source_url === sourceUrl) ?? null;
                setSelectedEvent(original);
                setChatPanelOpen(false);
              }}
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' }}
              height="auto"
              dayMaxEvents={3}
              displayEventTime={false}
            />
          </main>

        </div>

        {/* ── Map tab ── */}
        <div style={{
          position: 'absolute', inset: 0,
          opacity: activeTab === 'map' ? 1 : 0,
          transform: activeTab === 'map' ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.28s ease, transform 0.28s ease',
          pointerEvents: activeTab === 'map' ? 'auto' : 'none',
          display: 'flex', overflow: 'hidden',
        }}>
          {/* Sidebar — identical filter state as calendar tab */}
          <aside style={{
            width: '268px', flexShrink: 0, background: t.surface,
            borderRight: `1px solid ${t.border}`, padding: '28px 22px',
            display: 'flex', flexDirection: 'column', gap: '28px',
            overflowY: 'auto',
          }}>
            <div style={{ fontSize: '10px', color: t.textDim, letterSpacing: '0.2em' }}>NAMED FOR ΧΙΌΝΗ, GREEK NYMPH OF SNOW</div>

            {/* Sports */}
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: t.textFaint, marginBottom: '12px', fontWeight: 600 }}>SPORTS</div>
              {Object.entries(NGB_SPORTS).map(([ngb, sports]) => {
                const isExpanded = expandedNGB.includes(ngb);
                const hasData = events.some(e => sports.includes(e.sport));
                return (
                  <div key={ngb} style={{ marginBottom: '6px' }}>
                    <div
                      onClick={() => setExpandedNGB(prev => prev.includes(ngb) ? prev.filter(n => n !== ngb) : [...prev, ngb])}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '4px 0', opacity: hasData ? 1 : 0.3 }}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 700, color: t.textMuted, letterSpacing: '0.08em' }}>{ngb}</span>
                      <span style={{ fontSize: '9px', color: t.textDim }}>{isExpanded ? '▾' : '▸'}</span>
                    </div>
                    {isExpanded && (
                      <div style={{ paddingLeft: '10px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {sports.map(sport => {
                          const sportHasData = events.some(e => e.sport === sport);
                          const isActive = sportFilters.has(sport);
                          const dotColor = NGB_SPORT_COLORS[sport] ?? SOURCE_COLORS[getSource(sport)] ?? '#64748b';
                          return (
                            <div key={sport} onClick={() => sportHasData && toggleSport(sport)} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: sportHasData ? 'pointer' : 'default', opacity: sportHasData ? (sportFilters.size === 0 || isActive ? 1 : 0.35) : 0.15 }}>
                              <div style={{ width: '11px', height: '11px', borderRadius: '3px', flexShrink: 0, background: isActive ? dotColor : 'transparent', border: `2px solid ${sportHasData ? dotColor : t.borderMid}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {isActive && <span style={{ fontSize: '7px', color: '#fff', lineHeight: 1 }}>✓</span>}
                              </div>
                              <span style={{ fontSize: '11px', color: isActive ? t.textPrimary : t.textMuted }}>{sport}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* NGB Legend */}
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: t.textFaint, marginBottom: '10px', fontWeight: 600 }}>COLOUR KEY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {(Object.entries(SOURCE_COLORS) as [string, string][]).map(([ngb, color]) => (
                  <div key={ngb} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: t.textMuted }}>{ngb}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: t.textFaint, fontWeight: 600 }}>FILTERS</div>
              <div>
                <label style={{ fontSize: '10px', color: t.textFaint, display: 'block', marginBottom: '6px' }}>EVENT TYPE</label>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: '100%', background: t.input, border: `1px solid ${t.borderMid}`, color: t.textPrimary, borderRadius: '7px', padding: '7px 10px', fontSize: '12px' }}>
                  {types.map(type => <option key={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '10px', color: t.textFaint, display: 'block', marginBottom: '6px' }}>COUNTRY</label>
                <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} style={{ width: '100%', background: t.input, border: `1px solid ${t.borderMid}`, color: t.textPrimary, borderRadius: '7px', padding: '7px 10px', fontSize: '12px' }}>
                  {countries.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {hasFilters && (
                <button onClick={() => { setSportFilters(new Set()); setTypeFilter('All'); setCountryFilter('All'); }} style={{ background: 'none', border: `1px solid ${t.borderMid}`, color: t.textFaint, borderRadius: '7px', padding: '7px', fontSize: '11px', cursor: 'pointer' }}>
                  Clear filters
                </button>
              )}
            </div>

            <div style={{ marginTop: 'auto', fontSize: '11px', color: t.textDim }}>{filtered.length} events</div>

            {/* Subscribe */}
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.18em', color: t.textFaint, marginBottom: '12px', fontWeight: 600 }}>STAY UPDATED</div>
              <SubscribeForm t={t} />
            </div>
          </aside>

          {/* Map canvas */}
          <MapView
            events={filtered}
            t={t}
            darkMode={darkMode}
            onEventSelect={(event) => { setSelectedEvent(event); setChatPanelOpen(false); }}
            getEventColor={getEventColor}
          />
        </div>

        {/* ── Shared slide-out event detail panel ──
             Sits above all tabs at zIndex 150 so it works from both Calendar and Map */}
        {selectedEvent && (
          <div style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: '360px',
            background: t.surface, borderLeft: `1px solid ${t.border}`,
            padding: '28px', overflowY: 'auto', zIndex: 150,
            boxShadow: '-16px 0 48px rgba(0,0,0,0.35)',
          }}>
            <button onClick={() => setSelectedEvent(null)} style={{ background: 'none', border: 'none', color: t.textFaint, cursor: 'pointer', fontSize: '18px', marginBottom: '20px', display: 'block', marginLeft: 'auto' }}>✕</button>

            <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '20px', fontSize: '10px', letterSpacing: '0.12em', marginBottom: '14px', background: `${getEventColor(selectedEvent)}18`, color: getEventColor(selectedEvent), border: `1px solid ${getEventColor(selectedEvent)}35` }}>
              {selectedEvent.sport?.toUpperCase()}
            </div>

            <h2 style={{ fontSize: '17px', fontWeight: 700, color: t.textPrimary, lineHeight: 1.4, marginBottom: '22px' }}>
              {selectedEvent.title}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <DetailRow label="DATES" value={formatDates(selectedEvent.start_date, selectedEvent.end_date)} t={t} />
              <DetailRow label="LOCATION" value={[selectedEvent.city, selectedEvent.country].filter(Boolean).join(', ')} t={t} />
              <DetailRow label="EVENT TYPE" value={selectedEvent.event_type} t={t} />
              {selectedEvent.metadata?.city_description && (
                <div><div style={{ fontSize: '10px', letterSpacing: '0.15em', color: t.textDim, marginBottom: '5px' }}>ABOUT THE CITY</div>
                  <p style={{ fontSize: '13px', color: t.textFaint, lineHeight: 1.7, margin: 0 }}>{selectedEvent.metadata.city_description as string}</p></div>
              )}
              {selectedEvent.metadata?.airports && (
                <div><div style={{ fontSize: '10px', letterSpacing: '0.15em', color: t.textDim, marginBottom: '5px' }}>NEAREST AIRPORTS</div>
                  <p style={{ fontSize: '13px', color: t.textFaint, lineHeight: 1.7, margin: 0 }}>{selectedEvent.metadata.airports as string}</p></div>
              )}
              {selectedEvent.metadata?.travel_tips && (
                <div><div style={{ fontSize: '10px', letterSpacing: '0.15em', color: t.textDim, marginBottom: '5px' }}>TRAVEL TIPS</div>
                  <p style={{ fontSize: '13px', color: t.textFaint, lineHeight: 1.7, margin: 0 }}>{selectedEvent.metadata.travel_tips as string}</p></div>
              )}
              {selectedEvent.flag_image_url && (
                <img src={selectedEvent.flag_image_url} alt={selectedEvent.country ?? ''} style={{ width: '36px', marginTop: '2px' }} />
              )}
            </div>

            {/* Ask about this event */}
            <button
              onClick={() => openChatWithContext(selectedEvent)}
              style={{
                width: '100%', marginTop: '24px', background: t.accentDim,
                border: `1px solid ${t.accentBorder}`, borderRadius: '9px',
                padding: '10px 14px', color: t.accent, fontSize: '12px',
                cursor: 'pointer', letterSpacing: '0.04em', fontWeight: 600,
              }}
            >
              Ask Chione about this event ↗
            </button>

            {/* Calendar add */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: t.textDim, marginBottom: '2px' }}>ADD TO CALENDAR</div>
              <button onClick={() => downloadICS(selectedEvent)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 13px', background: t.button, border: `1px solid ${t.borderMid}`, borderRadius: '8px', color: t.textMuted, fontSize: '12px', cursor: 'pointer', width: '100%' }}>
                📅 Download .ics
                <span style={{ marginLeft: 'auto', fontSize: '10px', color: t.textDim }}>Apple / Outlook / Any</span>
              </button>
              <a href={googleCalendarUrl(selectedEvent)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 13px', background: t.button, border: `1px solid ${t.borderMid}`, borderRadius: '8px', color: t.textMuted, fontSize: '12px', textDecoration: 'none' }}>
                <img src="/icons/google-calendar.png" width="15" height="15" alt="Google Calendar" /> Add to Google Calendar
              </a>
              <a href={outlookWebUrl(selectedEvent)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 13px', background: t.button, border: `1px solid ${t.borderMid}`, borderRadius: '8px', color: t.textMuted, fontSize: '12px', textDecoration: 'none' }}>
                <img src="/icons/outlook-calendar.png" width="15" height="15" alt="Outlook" /> Add to Outlook Web
              </a>
              <a href={selectedEvent.source_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: '4px', padding: '10px 13px', textAlign: 'center', background: 'none', border: `1px solid ${t.border}`, borderRadius: '8px', color: t.textDim, fontSize: '11px', textDecoration: 'none', letterSpacing: '0.06em' }}>
                VIEW SOURCE →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function LoadingDots({ color }: { color: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: '4px', height: '4px', borderRadius: '50%',
          background: color,
          animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{`@keyframes pulse { 0%,80%,100%{opacity:0.2} 40%{opacity:1} }`}</style>
    </span>
  );
}

function DetailRow({ label, value, t }: { label: string; value: string | null | undefined; t: Theme }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: t.textDim, marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: t.textMuted }}>{value}</div>
    </div>
  );
}

function SubscribeForm({ t }: { t: Theme }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  async function handleSubmit() {
    if (!email) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name }) });
      setStatus(res.ok ? 'success' : 'error');
    } catch { setStatus('error'); }
  }

  if (status === 'success') return <p style={{ fontSize: '12px', color: '#10b981', lineHeight: 1.6, margin: 0 }}>Check your inbox to confirm.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      <input type="text" placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} style={{ background: t.input, border: `1px solid ${t.borderMid}`, borderRadius: '7px', padding: '7px 10px', fontSize: '12px', color: t.textPrimary, width: '100%', boxSizing: 'border-box', outline: 'none' }} />
      <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} style={{ background: t.input, border: `1px solid ${t.borderMid}`, borderRadius: '7px', padding: '7px 10px', fontSize: '12px', color: t.textPrimary, width: '100%', boxSizing: 'border-box', outline: 'none' }} />
      <button onClick={handleSubmit} disabled={status === 'loading'} style={{ background: t.accent, border: 'none', borderRadius: '7px', padding: '8px', fontSize: '12px', color: 'white', cursor: status === 'loading' ? 'not-allowed' : 'pointer', opacity: status === 'loading' ? 0.7 : 1 }}>
        {status === 'loading' ? 'Subscribing…' : 'Subscribe to digest'}
      </button>
      {status === 'error' && <p style={{ fontSize: '11px', color: '#ef4444', margin: 0 }}>Something went wrong.</p>}
    </div>
  );
}
