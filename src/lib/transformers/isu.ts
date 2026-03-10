function classifySport(name: string): string {
    const n = name.toUpperCase();
    if (n.includes('SYNCHRONIZED SKATING')) return 'Synchronized Skating';
    if (n.includes('SHORT TRACK')) return 'Short Track Speed Skating';
    if (n.includes('SPEED SKATING')) return 'Speed Skating';
    if (n.includes('FIGURE SKATING')) return 'Figure Skating';
    return 'Other';
  }
  
  function classifyEventType(name: string): string {
    const n = name.toUpperCase();
    if (n.includes('GRAND PRIX FINAL')) return 'Grand Prix Final';
    if (n.includes('JUNIOR GRAND PRIX') || n.includes('JGP')) return 'Junior Grand Prix';
    if (n.includes('GRAND PRIX') || n.includes(' GP ')) return 'Grand Prix';
    if (n.includes('WORLD JUNIOR CHAMPIONSHIPS') || n.includes('JUNIOR WORLD CHAMPIONSHIPS')) return 'Junior World Championships';
    if (n.includes('WORLD CHAMPIONSHIPS') || n.includes('WORLD CHAMPIONSHIP')) return 'World Championships';
    if (n.includes('EUROPEAN CHAMPIONSHIPS')) return 'European Championships';
    if (n.includes('FOUR CONTINENTS')) return 'Four Continents';
    if (n.includes('CHALLENGER SERIES')) return 'Challenger Series';
    if (n.includes('JUNIOR WORLD CUP')) return 'Junior World Cup';
    if (n.includes('WORLD CUP')) return 'World Cup';
    if (n.includes('OLYMPIC')) return 'Olympics';
    return 'Other';
  }
  
  function parseDates(dateStr: string): { start_date: string; end_date: string | null } {
    try {
      // Format: "7 Aug - 10 Aug, 2025" or "31 Oct - 2 Nov, 2025"
      const year = dateStr.split(', ')[1].trim();
      const [startRaw, endRaw] = dateStr.split(' - ');
      const endClean = endRaw.replace(',', '').trim();
  
      const start = new Date(`${startRaw.trim()} ${year}`);
      const end = new Date(`${endClean} ${year}`);
  
      return {
        start_date: start.toISOString().split('T')[0],
        end_date: end.toISOString().split('T')[0],
      };
    } catch {
      return { start_date: new Date().toISOString().split('T')[0], end_date: null };
    }
  }
  
  export function transformISUEvents(payload: any): any[] {
    const raw: any[] = 
      payload?.task?.capturedLists?.['ISU Events'] ?? 
      payload?.result?.capturedLists?.['ISU Events'] ?? 
      [];
  
    const seen = new Set<string>();
    const events: any[] = [];
  
    for (const item of raw) {
      const sourceUrl = item['Event Link'];
      if (!sourceUrl || seen.has(sourceUrl)) continue;
      seen.add(sourceUrl);
  
      const { start_date, end_date } = parseDates(item['Event Date'] ?? '');
      const locationParts = (item['Location'] ?? '').split(' / ');
  
      events.push({
        title: item['Event Name'] ?? 'Unknown Event',
        start_date,
        end_date,
        source_url: sourceUrl,
        source_name: 'ISU',
        sport: classifySport(item['Event Name'] ?? ''),
        event_type: classifyEventType(item['Event Name'] ?? ''),
        city: locationParts[0]?.trim() ?? null,
        country: item['Country Code'] ?? null,
        flag_image_url: item['Flag Image'] ?? null,
      });
    }
  
    return events;
  }

// export function transformISUEvents(payload: any): any[] {
//     return [];
//   }