import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_events',
    description:
      'Search winter Olympic events in the database. Use this to answer questions about upcoming events, schedules, locations, or specific sports. Call this before answering any question about events.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sport: {
          type: 'string',
          description:
            'Filter by sport name, e.g. "Figure Skating", "Alpine Skiing", "Biathlon". Leave empty for all sports.',
        },
        event_type: {
          type: 'string',
          description:
            'Filter by event type, e.g. "World Cup", "World Championships", "Olympics". Leave empty for all types.',
        },
        country: {
          type: 'string',
          description: 'Filter by country code or name, e.g. "USA", "FRA". Leave empty for all countries.',
        },
        date_from: {
          type: 'string',
          description: 'Start of date range in YYYY-MM-DD format. Leave empty for no lower bound.',
        },
        date_to: {
          type: 'string',
          description: 'End of date range in YYYY-MM-DD format. Leave empty for no upper bound.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to return. Defaults to 20.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_event_detail',
    description: 'Get full details for a specific event including travel information, airports, and tips.',
    input_schema: {
      type: 'object' as const,
      properties: {
        event_id: {
          type: 'string',
          description: 'The UUID of the event.',
        },
      },
      required: ['event_id'],
    },
  },
];

async function searchEvents(input: {
  sport?: string;
  event_type?: string;
  country?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}) {
  const rows = await sql`
    SELECT id, title, sport, event_type, start_date, end_date, city, country, source_name
    FROM events
    ORDER BY start_date ASC
  `;

  const sport = input.sport?.toLowerCase();
  const eventType = input.event_type?.toLowerCase();
  const country = input.country?.toLowerCase();

  return rows.filter(e => {
    if (sport && !e.sport?.toLowerCase().includes(sport)) return false;
    if (eventType && !e.event_type?.toLowerCase().includes(eventType)) return false;
    if (country && !e.country?.toLowerCase().includes(country) && !e.source_name?.toLowerCase().includes(country)) return false;
    if (input.date_from && String(e.start_date) < input.date_from) return false;
    if (input.date_to && String(e.start_date) > input.date_to) return false;
    return true;
  }).slice(0, input.limit ?? 20);
}

async function getEventDetail(input: { event_id: string }) {
  const rows = await sql`
    SELECT id, title, sport, event_type, start_date, end_date, city, country,
           venue, discipline, event_level, source_name, source_url, metadata
    FROM events
    WHERE id = ${input.event_id}
  `;
  return rows[0] ?? null;
}

const SYSTEM_PROMPT = `You are Chione, an intelligent assistant for a winter Olympic sports event calendar platform. Your job is to help OCOG and UOLF staff discover events, plan travel, and answer logistics questions.

You have access to a live database of winter Olympic events covering sports like Figure Skating, Speed Skating, Alpine Skiing, Biathlon, Bobsled, and more — sourced from ISU, FIS, IBU, and IBSF.

When a user asks about events, schedules, or locations, always call search_events first to get current data. Do not guess or make up event details.

Be concise and practical. Users are planning travel and logistics — give them the information they need to make decisions. Format event lists clearly. When relevant, mention nearby airports, travel tips, or logistical considerations from event metadata.

Today's date is ${new Date().toISOString().split('T')[0]}.`;

export async function POST(request: Request) {
  try {
    const { messages } = await request.json() as {
      messages: Anthropic.MessageParam[];
    };

    // Agentic loop: run until we get a final text response
    let currentMessages: Anthropic.MessageParam[] = messages;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const response = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 2048,
              system: SYSTEM_PROMPT,
              tools: TOOLS,
              messages: currentMessages,
            });

            if (response.stop_reason === 'tool_use') {
              // Execute all tool calls
              const toolResults: Anthropic.ToolResultBlockParam[] = [];

              for (const block of response.content) {
                if (block.type !== 'tool_use') continue;

                let result: unknown;
                try {
                  if (block.name === 'search_events') {
                    result = await searchEvents(block.input as Parameters<typeof searchEvents>[0]);
                  } else if (block.name === 'get_event_detail') {
                    result = await getEventDetail(block.input as Parameters<typeof getEventDetail>[0]);
                  } else {
                    result = { error: 'Unknown tool' };
                  }
                } catch (err) {
                  result = { error: String(err) };
                }

                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: JSON.stringify(result),
                });
              }

              // Append assistant turn + tool results and loop
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: response.content },
                { role: 'user', content: toolResults },
              ];
              continue;
            }

            // Final response — stream text to client
            for (const block of response.content) {
              if (block.type === 'text') {
                // Stream in chunks to simulate streaming feel
                const words = block.text.split(' ');
                for (let i = 0; i < words.length; i++) {
                  const chunk = (i === 0 ? '' : ' ') + words[i];
                  controller.enqueue(encoder.encode(chunk));
                }
              }
            }
            break;
          }
        } catch (err) {
          console.error('[chat] Error:', err);
          controller.enqueue(encoder.encode('Sorry, something went wrong. Please try again.'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('[chat] Request error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
