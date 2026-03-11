export function generateICS(event: {
  title: string;
  start_date: string;
  end_date: string | null;
  city: string | null;
  country: string | null;
  source_url: string;
}): string {
  const formatDate = (d: string) => d.replace(/-/g, '');
  
  // ICS end date is exclusive, so add 1 day
  const endDate = event.end_date ?? event.start_date;
  const end = new Date(endDate);
  end.setDate(end.getDate() + 1);
  const endStr = end.toISOString().split('T')[0].replace(/-/g, '');

  const location = [event.city, event.country].filter(Boolean).join(', ');
  const uid = `${event.source_url.replace(/[^a-z0-9]/gi, '')}@chione`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chione//Winter Olympic Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${formatDate(event.start_date)}`,
    `DTEND;VALUE=DATE:${endStr}`,
    `SUMMARY:${event.title}`,
    `LOCATION:${location}`,
    `URL:${event.source_url}`,
    `DESCRIPTION:More info: ${event.source_url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadICS(event: Parameters<typeof generateICS>[0]) {
  const ics = generateICS(event);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function googleCalendarUrl(event: Parameters<typeof generateICS>[0]): string {
  const fmt = (d: string) => d.replace(/-/g, '');
  const end = event.end_date ?? event.start_date;
  const endNext = new Date(end);
  endNext.setDate(endNext.getDate() + 1);
  const endStr = endNext.toISOString().split('T')[0].replace(/-/g, '');
  const location = [event.city, event.country].filter(Boolean).join(', ');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${fmt(event.start_date)}/${endStr}`,
    location,
    details: `More info: ${event.source_url}`,
  });

  return `https://calendar.google.com/calendar/render?${params}`;
}

export function outlookWebUrl(event: Parameters<typeof generateICS>[0]): string {
  const location = [event.city, event.country].filter(Boolean).join(', ');

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: event.start_date,
    enddt: event.end_date ?? event.start_date,
    location,
    body: `More info: ${event.source_url}`,
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}