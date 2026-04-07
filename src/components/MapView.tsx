'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps';

// ─── World topology ───────────────────────────────────────────────────────────
const GEO_URL =
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ─── Coordinate tables ────────────────────────────────────────────────────────
// All keys are pre-normalised (lowercased, diacritics stripped).
// Values are [longitude, latitude] — GeoJSON / react-simple-maps convention.

const CITY_COORDS: Record<string, [number, number]> = {
  // ── FIS Alpine ──
  'soelden':                   [10.943,  46.975],
  'solden':                    [10.943,  46.975],
  'levi':                      [24.826,  67.800],
  "val d'isere":               [6.977,   45.448],
  'val disere':                [6.977,   45.448],
  'tignes':                    [6.909,   45.468],
  'beaver creek':              [-106.515, 39.604],
  'lake louise':               [-116.177, 51.442],
  'killington':                [-72.820,  43.673],
  'courchevel':                [6.634,   45.415],
  'val gardena':               [11.717,  46.556],
  'val gardena/groeden':       [11.717,  46.556],
  'groeden':                   [11.717,  46.556],
  'santa caterina valfurva':   [10.502,  46.414],
  'bormio':                    [10.373,  46.467],
  'adelboden':                 [7.557,   46.493],
  'wengen':                    [7.924,   46.608],
  'kitzbuehel':                [12.389,  47.446],
  'kitzbuhel':                 [12.389,  47.446],
  'schladming':                [13.683,  47.393],
  'chamonix':                  [6.869,   45.924],
  'crans-montana':             [7.483,   46.312],
  'meribel':                   [6.567,   45.395],
  'are':                       [13.082,  63.399],
  'åre':                       [13.082,  63.399],
  'kvitfjell':                 [10.250,  61.467],
  'kranjska gora':             [13.785,  46.484],
  'jasna':                     [19.612,  49.034],
  'bansko':                    [23.488,  41.663],
  'soldeu':                    [1.667,   42.578],
  'zermatt':                   [7.749,   46.021],
  "cortina d'ampezzo":         [12.137,  46.536],
  'cortina dampezzo':          [12.137,  46.536],
  'saalbach':                  [12.637,  47.387],
  'saalbach-hinterglemm':      [12.637,  47.387],
  'st. anton':                 [10.267,  47.133],
  'flachau':                   [13.383,  47.333],
  'st. moritz':                [9.837,   46.497],
  'sestriere':                 [6.879,   44.960],

  // ── FIS Cross Country / Ski Jumping / Nordic Combined ──
  'ruka':                      [29.148,  66.163],
  'lillehammer':               [10.467,  61.115],
  'oslo':                      [10.757,  59.913],
  'trondheim':                 [10.404,  63.430],
  'beitostoelen':              [8.917,   61.017],
  'beitostolen':               [8.917,   61.017],
  'davos':                     [9.837,   46.797],
  'lenzerheide':               [9.558,   46.728],
  'dresden':                   [13.738,  51.050],
  'val di fiemme':             [11.483,  46.232],
  'planica':                   [13.721,  46.475],
  'falun':                     [15.633,  60.600],
  'lahti':                     [25.662,  60.983],
  'oberstdorf':                [10.283,  47.407],
  'garmisch-partenkirchen':    [11.096,  47.493],
  'garmisch':                  [11.096,  47.493],
  'innsbruck':                 [11.404,  47.269],
  'bischofshofen':             [13.218,  47.417],
  'wisla':                     [18.861,  49.649],
  'willingen':                 [8.612,   51.289],
  'vikersund':                 [10.017,  59.975],
  'sapporo':                   [141.342, 43.062],
  'hakuba':                    [137.863, 36.698],
  'zakopane':                  [19.948,  49.299],
  'engelberg':                 [8.407,   46.821],
  'klingenthal':               [12.467,  50.367],
  'rasnov':                    [25.458,  45.531],
  'brod na kupi':              [14.835,  45.526],
  'oberhof':                   [10.714,  50.697],
  'toblach':                   [12.238,  46.727],
  'canmore':                   [-115.354, 51.089],
  'minsk':                     [27.566,  53.900],
  'lahtis':                    [25.662,  60.983],
  'lahti/nastola':             [25.662,  60.983],
  'holmenkollen':              [10.662,  59.967],
  'oslo/holmenkollen':         [10.662,  59.967],

  // ── ISU Figure Skating / Speed Skating / Short Track ──
  'milan':                     [9.190,   45.464],
  'milano':                    [9.190,   45.464],
  'turin':                     [7.686,   45.070],
  'montreal':                  [-73.588,  45.508],
  'salt lake city':            [-111.891, 40.761],
  'budapest':                  [19.040,  47.498],
  'beijing':                   [116.407, 39.904],
  'taipei':                    [121.565, 25.033],
  'yokohama':                  [139.638, 35.444],
  'tokyo':                     [139.692, 35.690],
  'osaka':                     [135.502, 34.694],
  'hamar':                     [11.067,  60.800],
  'heerenveen':                [5.918,   52.957],
  'inzell':                    [12.758,  47.763],
  'calgary':                   [-114.066, 51.048],
  'berlin':                    [13.405,  52.520],
  'vienna':                    [16.373,  48.208],
  'almaty':                    [76.946,  43.255],
  'tallinn':                   [24.746,  59.437],
  'shanghai':                  [121.474, 31.230],
  'gangneung':                 [128.876, 37.752],
  'grenoble':                  [5.724,   45.188],
  'dordrecht':                 [4.669,   51.813],
  'warsaw':                    [21.012,  52.230],
  'cape town':                 [18.417, -33.925],
  'seoul':                     [126.978, 37.566],
  'erfurt':                    [11.029,  50.978],
  'toronto':                   [-79.383,  43.653],
  'amsterdam':                 [4.900,   52.379],
  'rotterdam':                 [4.480,   51.924],
  'nagano':                    [138.188, 36.652],
  'harbin':                    [126.642, 45.756],
  'nur-sultan':                [71.450,  51.180],
  'astana':                    [71.450,  51.180],
  'milwaukee':                 [-87.906, 43.038],
  'berlin-hohenschoenhausen':  [13.490,  52.554],
  'stavanger':                 [5.732,   58.970],
  'hamar/oslo':                [11.067,  60.800],

  // ── IBU Biathlon ──
  'ostersund':                 [14.634,  63.176],
  'östersund':                 [14.634,  63.176],
  'hochfilzen':                [12.617,  47.567],
  'le grand-bornand':          [6.428,   45.945],
  'grand bornand':             [6.428,   45.945],
  'ruhpolding':                [12.644,  47.762],
  'kontiolahti':               [29.845,  62.762],
  'nove mesto na morave':      [15.997,  49.561],
  'nove mesto':                [15.997,  49.561],
  'anterselva':                [12.022,  46.774],
  'antholz-anterselva':        [12.022,  46.774],
  'soldier hollow':            [-111.482, 40.465],
  'pokljuka':                  [13.959,  46.345],
  'arber':                     [13.100,  49.117],
  'pyeongchang':               [128.671, 37.369],
  'presque isle':              [-68.016, 46.680],

  // ── IBSF Bobsled / Luge / Skeleton ──
  'altenberg':                 [13.761,  50.763],
  'winterberg':                [8.530,   51.197],
  'sigulda':                   [24.855,  57.153],
  'lake placid':               [-73.981, 44.278],
  'park city':                 [-111.498, 40.651],
  'yanqing':                   [115.969, 40.457],
  'koenigssee':                [12.997,  47.593],
  'la plagne':                 [6.674,   45.511],
  'whistler':                  [-122.956, 50.120],
  'cesana':                    [6.798,   44.957],

  // ── FIS Snowboard / Freestyle ──
  'laax':                      [9.257,   46.808],
  'halfpipe laax':             [9.257,   46.808],
  'seiser alm':                [11.614,  46.545],
  'alpe di siusi':             [11.614,  46.545],
  'stubai':                    [11.194,  47.117],
  'stubai valley':             [11.194,  47.117],
  'snowmass':                  [-107.033, 39.241],
  'aspen':                     [-106.820, 39.191],
  'copper mountain':           [-106.150, 39.502],
  'mammoth mountain':          [-118.956, 37.631],
  'big white':                 [-118.940, 49.729],
  'blue mountain':             [-80.378, 44.503],
  'chiesa in valmalenco':      [9.825,   46.275],
  'krizatli':                  [13.782,  46.483],
  'rogla':                     [15.354,  46.449],
  'sierra nevada':             [-3.399,  37.095],
  'veysonnaz':                 [7.335,   46.161],
  'valmalenco':                [9.825,   46.275],
  'idre':                      [12.722,  62.146],
  'idre fjall':                [12.722,  62.146],
  'kreischberg':               [14.136,  47.170],
  'storlien':                  [12.094,  63.316],

  // ── FIS Freeride ──
  'verbier':                   [7.228,   46.097],
  'andorra':                   [1.601,   42.546],
  'fieberbrunn':               [12.551,  47.476],
  'penken park mayrhofen':     [11.867,  47.167],
};

// IOC 3-letter country codes → approximate centroid [lng, lat]
const COUNTRY_COORDS: Record<string, [number, number]> = {
  AND: [1.601,   42.546],
  ARM: [45.038,  40.069],
  AUS: [133.775,-25.274],
  AUT: [14.550,  47.516],
  AZE: [47.577,  40.143],
  BEL: [4.469,   50.503],
  BIH: [17.679,  44.170],
  BLR: [27.954,  53.708],
  BUL: [25.486,  42.734],
  CAN: [-96.797,  56.130],
  CHI: [-71.543, -35.676],
  CHN: [104.195,  35.861],
  CRO: [15.200,  45.100],
  CZE: [15.473,  49.817],
  EST: [25.014,  58.596],
  FIN: [25.748,  61.924],
  FRA: [2.213,   46.228],
  GBR: [-3.436,  55.378],
  GEO: [43.357,  42.316],
  GER: [10.452,  51.165],
  GRE: [21.824,  39.074],
  HUN: [19.504,  47.163],
  IRL: [-8.243,  53.413],
  ISL: [-18.996,  64.963],
  ITA: [12.567,  41.872],
  JPN: [138.252,  36.204],
  KAZ: [66.924,  48.020],
  KOR: [127.766,  35.908],
  LAT: [24.604,  56.879],
  LIE: [9.555,   47.166],
  LIT: [23.881,  55.170],
  LUX: [6.130,   49.817],
  MDA: [28.370,  47.412],
  MGL: [103.847,  46.863],
  MON: [7.412,   43.731],
  MNE: [19.374,  42.708],
  NED: [5.291,   52.133],
  NOR: [8.469,   60.472],
  NZL: [172.473,-40.901],
  POL: [19.146,  52.069],
  PRK: [127.511,  40.339],
  ROU: [24.966,  45.943],
  RUS: [105.319,  61.524],
  SGP: [103.820,   1.353],
  SLO: [14.995,  46.120],
  SVK: [19.699,  48.669],
  SVN: [14.995,  46.120],
  SRB: [21.006,  44.017],
  SUI: [8.228,   46.818],
  SWE: [18.643,  62.198],
  TPE: [120.960,  23.700],
  TUR: [35.244,  38.964],
  UKR: [31.166,  48.380],
  USA: [-98.580,  39.828],
};

// ─── Types ────────────────────────────────────────────────────────────────────

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
  source_name?: string | null;
  flag_image_url: string | null;
  metadata: Record<string, unknown> | null;
}

interface Theme {
  bg: string;
  bgGradient: string;
  surface: string;
  border: string;
  borderMid: string;
  textPrimary: string;
  textMuted: string;
  textFaint: string;
  textDim: string;
  input: string;
  button: string;
  accent: string;
  accentDim: string;
  accentBorder: string;
}

interface LocationGroup {
  key: string;
  label: string;
  coords: [number, number];
  events: Event[];
  pinColor: string;
  radius: number;
}

interface TooltipState {
  x: number;
  y: number;
  label: string;
  count: number;
  isCountry?: boolean;
}

interface PopoverState {
  x: number;
  y: number;
  events: Event[];
}

interface MapViewProps {
  events: Event[];
  t: Theme;
  darkMode: boolean;
  onEventSelect: (event: Event) => void;
  getEventColor: (e: Event) => string;
}

// ─── Country name + ISO numeric lookups ──────────────────────────────────────

// IOC 3-letter → full display name
const COUNTRY_NAMES: Record<string, string> = {
  AND: 'Andorra',       ARM: 'Armenia',        AUS: 'Australia',
  AUT: 'Austria',       AZE: 'Azerbaijan',     BEL: 'Belgium',
  BIH: 'Bosnia',        BLR: 'Belarus',        BUL: 'Bulgaria',
  CAN: 'Canada',        CHI: 'Chile',          CHN: 'China',
  CRO: 'Croatia',       CZE: 'Czechia',        EST: 'Estonia',
  FIN: 'Finland',       FRA: 'France',         GBR: 'Great Britain',
  GEO: 'Georgia',       GER: 'Germany',        GRE: 'Greece',
  HUN: 'Hungary',       IRL: 'Ireland',        ISL: 'Iceland',
  ITA: 'Italy',         JPN: 'Japan',          KAZ: 'Kazakhstan',
  KOR: 'South Korea',   LAT: 'Latvia',         LIE: 'Liechtenstein',
  LIT: 'Lithuania',     LUX: 'Luxembourg',     MDA: 'Moldova',
  MGL: 'Mongolia',      MNE: 'Montenegro',     MON: 'Monaco',
  NED: 'Netherlands',   NOR: 'Norway',         NZL: 'New Zealand',
  POL: 'Poland',        PRK: 'North Korea',    ROU: 'Romania',
  RUS: 'Russia',        SGP: 'Singapore',      SLO: 'Slovenia',
  SRB: 'Serbia',        SUI: 'Switzerland',    SVK: 'Slovakia',
  SVN: 'Slovenia',      SWE: 'Sweden',         TPE: 'Chinese Taipei',
  TUR: 'Turkey',        UKR: 'Ukraine',        USA: 'United States',
};

// ISO 3166-1 numeric (unpadded string, as stored in world-atlas topology) → IOC code
const ISO_TO_IOC: Record<string, string> = {
  '20':  'AND', '51':  'ARM', '36':  'AUS', '40':  'AUT', '31':  'AZE',
  '56':  'BEL', '70':  'BIH', '112': 'BLR', '100': 'BUL', '124': 'CAN',
  '152': 'CHI', '156': 'CHN', '191': 'CRO', '203': 'CZE', '233': 'EST',
  '246': 'FIN', '250': 'FRA', '268': 'GEO', '276': 'GER', '300': 'GRE',
  '826': 'GBR', '348': 'HUN', '372': 'IRL', '352': 'ISL', '380': 'ITA',
  '392': 'JPN', '398': 'KAZ', '410': 'KOR', '428': 'LAT', '438': 'LIE',
  '440': 'LIT', '442': 'LUX', '498': 'MDA', '496': 'MGL', '499': 'MNE',
  '492': 'MON', '528': 'NED', '578': 'NOR', '554': 'NZL', '616': 'POL',
  '408': 'PRK', '642': 'ROU', '643': 'RUS', '702': 'SGP', '688': 'SRB',
  '703': 'SVK', '705': 'SVN', '752': 'SWE', '756': 'SUI', '158': 'TPE',
  '792': 'TUR', '804': 'UKR', '840': 'USA',
};

// ─── Country label set ───────────────────────────────────────────────────────
// Curated IOC codes to show as map labels (uses COUNTRY_COORDS for positions)
const COUNTRY_LABEL_KEYS: string[] = [
  'NOR','SWE','FIN','AUT','SUI','GER','FRA','ITA','CZE','SVK',
  'POL','SVN','NED','GBR','BEL','HUN','ROU','BUL','BLR','UKR',
  'LAT','EST','GEO','TUR','KAZ','RUS','CHN','JPN','KOR','AUS',
  'NZL','USA','CAN','SRB','CRO','AND',
];

// ─── Country fit helper ────────────────────────────────────────────────────────

interface GeoFeatureWithGeometry {
  geometry?: { coordinates: unknown };
}

// Walk the GeoJSON coordinate tree and return the geographic bounding box
function computeCountryFit(
  geo: GeoFeatureWithGeometry,
): { center: [number, number]; zoom: number } | null {
  if (!geo.geometry?.coordinates) return null;

  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;

  function walk(x: unknown): void {
    if (!Array.isArray(x)) return;
    if (typeof x[0] === 'number') {
      if ((x[0] as number) < minLng) minLng = x[0] as number;
      if ((x[0] as number) > maxLng) maxLng = x[0] as number;
      if ((x[1] as number) < minLat) minLat = x[1] as number;
      if ((x[1] as number) > maxLat) maxLat = x[1] as number;
    } else {
      (x as unknown[]).forEach(walk);
    }
  }

  walk(geo.geometry.coordinates);
  if (!isFinite(minLng)) return null;

  const spanLng = maxLng - minLng;
  const spanLat = maxLat - minLat;

  // Fit country to ~72% of the viewport. Natural earth projection:
  // full 360° fits the width at zoom 1, full 180° fits the height.
  const zoomLng = (0.72 * 360) / Math.max(spanLng, 1);
  const zoomLat = (0.72 * 180) / Math.max(spanLat, 0.5);

  return {
    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
    zoom: Math.min(Math.max(Math.min(zoomLng, zoomLat), 1.5), 10),
  };
}

// ─── Coordinate resolution ────────────────────────────────────────────────────

function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // strip diacritics
}

function resolveCoords(event: Event): [number, number] | null {
  if (event.city) {
    const norm = normalizeCity(event.city);
    if (CITY_COORDS[norm]) return CITY_COORDS[norm];
    // try first segment of compound names ("Antholz-Anterselva" → "antholz")
    const firstWord = norm.split(/[-/\s,]/)[0].trim();
    if (firstWord && CITY_COORDS[firstWord]) return CITY_COORDS[firstWord];
  }
  if (event.country && COUNTRY_COORDS[event.country]) {
    return COUNTRY_COORDS[event.country];
  }
  return null;
}

// ─── Cluster builder ──────────────────────────────────────────────────────────

function buildLocationGroups(
  events: Event[],
  getColor: (e: Event) => string,
): LocationGroup[] {
  const map = new Map<string, { label: string; coords: [number, number]; events: Event[] }>();

  for (const e of events) {
    const coords = resolveCoords(e);
    if (!coords) continue;
    const key = `${coords[0]},${coords[1]}`;
    if (!map.has(key)) {
      map.set(key, { label: e.city ?? e.country ?? 'Unknown', coords, events: [] });
    }
    map.get(key)!.events.push(e);
  }

  return Array.from(map.values()).map(({ label, coords, events: locationEvents }) => {
    const count = locationEvents.length;
    // Dominant color = most frequent sport color in this cluster
    const freq = new Map<string, number>();
    locationEvents.forEach(e => {
      const c = getColor(e);
      freq.set(c, (freq.get(c) ?? 0) + 1);
    });
    const pinColor = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const radius = count === 1 ? 5 : count <= 3 ? 7 : count <= 8 ? 9 : 11;
    return { key: `${coords[0]},${coords[1]}`, label, coords, events: locationEvents, pinColor, radius };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MapView({
  events,
  t,
  darkMode,
  onEventSelect,
  getEventColor,
}: MapViewProps) {
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([10, 20]);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Build location clusters from filtered events.
  // Same-venue events always merge into one pin; the popover lists them on click.
  const groups = useMemo(
    () => buildLocationGroups(events, getEventColor),
    [events, getEventColor],
  );

  // Close popover on outside click
  useEffect(() => {
    if (!popover) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPopover(null);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [popover]);

  function handlePinEnter(e: React.MouseEvent, group: LocationGroup) {
    setTooltip({ x: e.clientX, y: e.clientY, label: group.label, count: group.events.length });
  }

  function handlePinLeave() {
    setTooltip(null);
  }

  function handleGeoClick(geo: GeoFeatureWithGeometry, e: React.MouseEvent) {
    e.stopPropagation();
    const fit = computeCountryFit(geo);
    if (!fit) return;
    setTooltip(null);
    setPopover(null);
    setCenter(fit.center);
    setZoom(fit.zoom);
  }

  function handleGeoEnter(geo: { rsmKey: string; id?: unknown; [key: string]: unknown }, e: React.MouseEvent) {
    const ioc = ISO_TO_IOC[String((geo as { id?: unknown }).id ?? '')];
    if (!ioc) return;
    const name = COUNTRY_NAMES[ioc] ?? ioc;
    const count = events.filter(ev => ev.country === ioc).length;
    setTooltip({ x: e.clientX, y: e.clientY, label: name, count, isCountry: true });
  }

  function handleGeoLeave() {
    setTooltip(null);
  }

  function handlePinClick(e: React.MouseEvent, group: LocationGroup) {
    setTooltip(null);
    if (group.events.length === 1) {
      onEventSelect(group.events[0]);
    } else {
      // Show popover with event list
      setPopover({ x: e.clientX, y: e.clientY, events: group.events });
    }
  }

  const geoFill     = darkMode ? '#1a2a4a' : '#dde8f8';
  const geoStroke   = darkMode ? '#2d4a7a' : '#afc5e4';
  const geoHover    = darkMode ? '#1e3560' : '#c0d4f0';
  const oceanBg     = darkMode ? t.bg      : '#eef4ff';

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: oceanBg }}>
      {/* Map canvas */}
      <ComposableMap
        projection="geoNaturalEarth1"
        projectionConfig={{ scale: 155, center: [10, 10] }}
        width={800}
        height={420}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup
          zoom={zoom}
          center={center}
          onMoveEnd={({ zoom: z, coordinates: c }) => { setZoom(z); setCenter(c); }}
          onMoveStart={() => { setTooltip(null); setPopover(null); }}
          minZoom={1}
          maxZoom={12}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onMouseEnter={(e: React.MouseEvent) => handleGeoEnter(geo, e)}
                  onMouseLeave={handleGeoLeave}
                  onClick={(e: React.MouseEvent) => handleGeoClick(geo as GeoFeatureWithGeometry, e)}
                  style={{
                    default: { fill: geoFill,  stroke: geoStroke, strokeWidth: 0.5, outline: 'none', cursor: 'pointer' },
                    hover:   { fill: geoHover,  stroke: geoStroke, strokeWidth: 0.5, outline: 'none', cursor: 'pointer' },
                    pressed: { fill: geoHover,  stroke: geoStroke, strokeWidth: 0.8, outline: 'none', cursor: 'pointer' },
                  }}
                />
              ))
            }
          </Geographies>

          {/* Country abbreviation labels — rendered before pins so pins sit on top */}
          {COUNTRY_LABEL_KEYS.map(code => {
            const coords = COUNTRY_COORDS[code];
            if (!coords) return null;
            return (
              <Marker key={`label-${code}`} coordinates={coords}>
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fontSize: `${6 / zoom}px`,
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    fill: darkMode ? '#93c5fd' : '#1d4ed8',
                    opacity: darkMode ? 0.38 : 0.45,
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                >
                  {code}
                </text>
              </Marker>
            );
          })}

          {groups.map(group => (
            <Marker
              key={group.key}
              coordinates={group.coords}
              onMouseEnter={e => handlePinEnter(e, group)}
              onMouseLeave={handlePinLeave}
              onClick={e => handlePinClick(e, group)}
              style={{ cursor: 'pointer' }}
            >
              {/* Outer glow ring — divided by zoom to stay constant screen size */}
              <circle
                r={(group.radius + 4) / zoom}
                fill={group.pinColor}
                fillOpacity={0.15}
                stroke="none"
              />
              {/* Main pin */}
              <circle
                r={group.radius / zoom}
                fill={group.pinColor}
                stroke={darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)'}
                strokeWidth={1.5 / zoom}
              />
              {/* Count badge for clusters */}
              {group.events.length > 1 && (
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fontSize: `${(group.radius < 8 ? 6 : 7) / zoom}px`,
                    fontWeight: 700,
                    fontFamily: "'DM Sans', sans-serif",
                    fill: '#ffffff',
                    pointerEvents: 'none',
                  }}
                >
                  {group.events.length}
                </text>
              )}
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {/* Zoom controls */}
      <div style={{
        position: 'absolute', bottom: '20px', right: '20px',
        display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 10,
      }}>
        <button
          onClick={() => setZoom(z => Math.min(z * 1.6, 12))}
          style={zoomBtnStyle(t, darkMode)}
          title="Zoom in"
        >+</button>
        <button
          onClick={() => setZoom(z => Math.max(z / 1.6, 1))}
          style={zoomBtnStyle(t, darkMode)}
          title="Zoom out"
        >−</button>
        <button
          onClick={() => { setZoom(1); setCenter([10, 20]); }}
          style={{ ...zoomBtnStyle(t, darkMode), fontSize: '10px', letterSpacing: '0.04em' }}
          title="Reset view"
        >⌂</button>
      </div>

      {/* Ctrl+scroll hint */}
      <div style={{
        position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
        fontSize: '11px', color: t.textDim, pointerEvents: 'none', letterSpacing: '0.06em',
      }}>
        Ctrl + scroll to zoom · drag to pan
      </div>

      {/* Unmapped events count */}
      {(() => {
        const unmapped = events.filter(e => !resolveCoords(e)).length;
        if (unmapped === 0) return null;
        return (
          <div style={{
            position: 'absolute', top: '16px', right: '16px',
            fontSize: '11px', color: t.textDim,
            background: t.surface, border: `1px solid ${t.border}`,
            borderRadius: '6px', padding: '4px 10px',
          }}>
            {unmapped} event{unmapped > 1 ? 's' : ''} without location data
          </div>
        );
      })()}

      {/* Hover tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 10,
          background: t.surface, border: `1px solid ${t.borderMid}`,
          borderRadius: '8px', padding: '8px 12px',
          pointerEvents: 'none', zIndex: 200,
          boxShadow: darkMode ? '0 8px 32px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.12)',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: t.textPrimary }}>
            {tooltip.label}
          </div>
          <div style={{ fontSize: '11px', color: t.textFaint, marginTop: '2px' }}>
            {tooltip.count === 0
              ? 'No events'
              : `${tooltip.count} event${tooltip.count > 1 ? 's' : ''}`}
          </div>
          {tooltip.isCountry && (
            <div style={{ fontSize: '10px', color: t.textDim, marginTop: '4px', letterSpacing: '0.04em' }}>
              Click to zoom
            </div>
          )}
        </div>
      )}

      {/* Multi-event popover */}
      {popover && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            left: Math.min(popover.x + 8, window.innerWidth - 280),
            top: Math.min(popover.y - 8, window.innerHeight - 320),
            width: '268px',
            background: t.surface,
            border: `1px solid ${t.borderMid}`,
            borderRadius: '12px',
            boxShadow: darkMode ? '0 16px 48px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.15)',
            zIndex: 200,
            overflow: 'hidden',
          }}
        >
          {/* Popover header */}
          <div style={{
            padding: '12px 14px 10px',
            borderBottom: `1px solid ${t.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: t.textPrimary }}>
              {popover.events[0]?.city ?? popover.events[0]?.country ?? 'Events'}
            </span>
            <button
              onClick={() => setPopover(null)}
              style={{ background: 'none', border: 'none', color: t.textFaint, cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>

          {/* Popover event list */}
          <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
            {popover.events
              .sort((a, b) => a.start_date.localeCompare(b.start_date))
              .map(event => {
                const color = getEventColor(event);
                return (
                  <button
                    key={event.id}
                    onClick={() => { setPopover(null); onEventSelect(event); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'flex-start', gap: '10px',
                      padding: '10px 14px', background: 'none', border: 'none',
                      borderBottom: `1px solid ${t.border}`, cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = t.button; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                  >
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: color, flexShrink: 0, marginTop: '4px',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', color: t.textPrimary, lineHeight: 1.4, fontWeight: 500 }}>
                        {event.title}
                      </div>
                      <div style={{ fontSize: '11px', color: t.textFaint, marginTop: '2px' }}>
                        {new Date(event.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' · '}{event.sport}
                      </div>
                    </div>
                  </button>
                );
              })
            }
          </div>
        </div>
      )}
    </div>
  );
}

function zoomBtnStyle(t: Theme, darkMode: boolean): React.CSSProperties {
  return {
    width: '32px', height: '32px',
    background: t.surface,
    border: `1px solid ${t.borderMid}`,
    borderRadius: '8px',
    color: t.textMuted,
    fontSize: '18px',
    lineHeight: '30px',
    textAlign: 'center',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: darkMode ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.1)',
  };
}
