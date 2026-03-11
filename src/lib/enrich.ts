export async function enrichEvent(event: {
  title: string;
  city: string | null;
  country: string | null;
  start_date: string;
  end_date: string | null;
}): Promise<{
  airports: string;
  city_description: string;
  travel_tips: string;
} | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a travel assistant for winter sports event attendees. Given this event, provide practical travel information.

Event: ${event.title}
Location: ${event.city}, ${event.country}
Dates: ${event.start_date} to ${event.end_date ?? event.start_date}

Respond ONLY with a JSON object, no markdown, no backticks:
{
  "airports": "2-3 nearest airports with IATA codes and approximate distance/travel time from venue city",
  "city_description": "2-3 sentence description of the host city relevant to a sports traveler - venues, character, what to expect",
  "travel_tips": "2-3 practical tips specific to this destination for a sports event attendee"
}`
        }],
      }),
    });

    const data = await response.json();
    console.log('[enrich] API response status:', response.status);
    console.log('[enrich] API response data:', JSON.stringify(data).slice(0, 500));
    const text = data.content?.[0]?.text;
    console.log('[enrich] Raw text from Claude:', text);
    if (!text) return null;

    return JSON.parse(text);
  } catch (err) {
    console.error('Enrichment failed:', err);
    return null;
  }
}