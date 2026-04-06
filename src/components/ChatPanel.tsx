'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Theme {
  bg: string;
  sidebar: string;
  border: string;
  borderMid: string;
  textPrimary: string;
  textMuted: string;
  textFaint: string;
  textDim: string;
  input: string;
  button: string;
}

interface ContextEvent {
  title: string;
  city: string | null;
  country: string | null;
  start_date: string;
  end_date: string | null;
  sport: string;
}

const SUGGESTED_PROMPTS = [
  'What Figure Skating events are coming up this season?',
  'Which World Cup events are in Europe in the next 3 months?',
  'Where should I fly into for events in Norway?',
  'What are the biggest events happening in January?',
];

export default function ChatPanel({
  t,
  onClose,
  contextEvent,
}: {
  t: Theme;
  onClose: () => void;
  contextEvent?: ContextEvent | null;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (contextEvent && messages.length === 0) {
      const prefill = `Tell me more about ${contextEvent.title} in ${[contextEvent.city, contextEvent.country].filter(Boolean).join(', ')}.`;
      sendMessage(prefill);
    }
  }, [contextEvent]);

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: text.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);

    // Append placeholder for assistant response
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' };
          return updated;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const final = accumulated;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: final };
          return updated;
        });
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '480px',
      background: t.sidebar, borderLeft: `1px solid ${t.border}`,
      display: 'flex', flexDirection: 'column', zIndex: 100,
      boxShadow: '-20px 0 60px rgba(0,0,0,0.3)',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px', borderBottom: `1px solid ${t.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.15em', color: t.textPrimary }}>
            ASK CHIONE
          </div>
          <div style={{ fontSize: '11px', color: t.textDim, marginTop: '2px' }}>
            Powered by Claude
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: t.textFaint,
          cursor: 'pointer', fontSize: '18px', lineHeight: 1,
        }}>✕</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            <div style={{ fontSize: '12px', color: t.textDim, marginBottom: '4px' }}>Try asking...</div>
            {SUGGESTED_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                style={{
                  background: t.button, border: `1px solid ${t.borderMid}`,
                  borderRadius: '8px', padding: '10px 14px', textAlign: 'left',
                  color: t.textMuted, fontSize: '12px', cursor: 'pointer', lineHeight: 1.5,
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: msg.role === 'user' ? '80%' : '100%',
              width: msg.role === 'assistant' ? '100%' : undefined,
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '10px',
              background: msg.role === 'user' ? '#3b82f6' : t.button,
              border: msg.role === 'user' ? 'none' : `1px solid ${t.borderMid}`,
              color: msg.role === 'user' ? '#fff' : t.textMuted,
              fontSize: '13px',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.content || (msg.role === 'assistant' && isLoading ? (
                <span style={{ color: t.textDim }}>Searching events...</span>
              ) : '')}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '16px 24px', borderTop: `1px solid ${t.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about events, travel, logistics..."
            rows={1}
            style={{
              flex: 1, background: t.input, border: `1px solid ${t.borderMid}`,
              borderRadius: '8px', padding: '10px 12px', fontSize: '13px',
              color: t.textPrimary, resize: 'none', outline: 'none', lineHeight: 1.5,
              fontFamily: 'inherit', maxHeight: '120px', overflowY: 'auto',
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={isLoading || !input.trim()}
            style={{
              background: '#3b82f6', border: 'none', borderRadius: '8px',
              padding: '10px 14px', color: '#fff', fontSize: '13px',
              cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: isLoading || !input.trim() ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            ↑
          </button>
        </div>
        <div style={{ fontSize: '10px', color: t.textDim, marginTop: '6px' }}>
          Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
