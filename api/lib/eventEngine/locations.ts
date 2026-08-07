/**
 * Area registry for the location-aware Event Engine.
 * Each area is a city the engine curates events for.
 */

export type Venue = {
  name: string;
  address: string;
};

export type Area = {
  slug: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  venues: Venue[];
};

// ── Deterministic PRNG helpers (shared with the engine) ────────────────

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic geo for a venue: offset from the area centre by a
 * hash-seeded jitter (±0.025° lat / ±0.035° lng) so the same venue always
 * lands on the same spot across engine refreshes.
 */
export function venueGeo(area: Area, venueName: string): { lat: number; lng: number } {
  const rand = mulberry32(hashString(`${area.slug}|${venueName}`));
  return {
    lat: Number((area.lat + (rand() * 2 - 1) * 0.025).toFixed(6)),
    lng: Number((area.lng + (rand() * 2 - 1) * 0.035).toFixed(6)),
  };
}

export const AREAS: Area[] = [
  {
    slug: "new-york",
    name: "New York",
    country: "US",
    lat: 40.7128,
    lng: -74.006,
    venues: [
      { name: "The Roof at Public Hotel", address: "215 Chrystie St, New York, NY 10002" },
      { name: "Brooklyn Brewery Taproom", address: "79 N 11th St, Brooklyn, NY 11249" },
      { name: "MoMA PS1 Courtyard", address: "22-25 Jackson Ave, Queens, NY 11101" },
      { name: "Smalls Jazz Club", address: "183 W 10th St, New York, NY 10014" },
      { name: "Chelsea Market Loft", address: "75 9th Ave, New York, NY 10011" },
      { name: "The High Line Lounge", address: "820 Washington St, New York, NY 10014" },
      { name: "SoHo House Reading Room", address: "29-35 9th Ave, New York, NY 10014" },
    ],
  },
  {
    slug: "los-angeles",
    name: "Los Angeles",
    country: "US",
    lat: 34.0522,
    lng: -118.2437,
    venues: [
      { name: "The Grove Rooftop", address: "189 The Grove Dr, Los Angeles, CA 90036" },
      { name: "Griffith Observatory Terrace", address: "2800 E Observatory Rd, Los Angeles, CA 90027" },
      { name: "Silver Lake Wine Bar", address: "2395 Glendale Blvd, Los Angeles, CA 90039" },
      { name: "Venice Beach House", address: "15 30th Ave, Venice, CA 90291" },
      { name: "Arts District Brewing Co.", address: "828 Traction Ave, Los Angeles, CA 90013" },
      { name: "The Getty Center Garden", address: "1200 Getty Center Dr, Los Angeles, CA 90049" },
    ],
  },
  {
    slug: "san-francisco",
    name: "San Francisco",
    country: "US",
    lat: 37.7749,
    lng: -122.4194,
    venues: [
      { name: "Ferry Building Marketplace", address: "1 Ferry Building, San Francisco, CA 94111" },
      { name: "Dolores Park Lawn", address: "19th St & Dolores St, San Francisco, CA 94114" },
      { name: "The Fillmore Lounge", address: "1805 Geary Blvd, San Francisco, CA 94115" },
      { name: "Mission District Mezcaleria", address: "3174 16th St, San Francisco, CA 94103" },
      { name: "Fort Mason Center Gallery", address: "2 Marina Blvd, San Francisco, CA 94123" },
      { name: "Salesforce Park Amphitheater", address: "425 Mission St, San Francisco, CA 94105" },
    ],
  },
  {
    slug: "chicago",
    name: "Chicago",
    country: "US",
    lat: 41.8781,
    lng: -87.6298,
    venues: [
      { name: "The Green Mill Cocktail Lounge", address: "4802 N Broadway, Chicago, IL 60640" },
      { name: "Millennium Park Pavilion", address: "201 E Randolph St, Chicago, IL 60601" },
      { name: "Logan Square Arcade Bar", address: "2410 W Fullerton Ave, Chicago, IL 60647" },
      { name: "Chicago Athletic Association", address: "12 S Michigan Ave, Chicago, IL 60603" },
      { name: "River North Art Loft", address: "740 N Franklin St, Chicago, IL 60654" },
      { name: "The Hideout Backroom", address: "1354 W Wabansia Ave, Chicago, IL 60642" },
    ],
  },
  {
    slug: "miami",
    name: "Miami",
    country: "US",
    lat: 25.7617,
    lng: -80.1918,
    venues: [
      { name: "Wynwood Walls Garden", address: "2520 NW 2nd Ave, Miami, FL 33127" },
      { name: "South Beach Rooftop Pool Club", address: "1437 Collins Ave, Miami Beach, FL 33139" },
      { name: "Little Havana Domino Plaza", address: "1444 SW 8th St, Miami, FL 33135" },
      { name: "The Standard Spa Terrace", address: "40 Island Ave, Miami Beach, FL 33139" },
      { name: "Coconut Grove Sailing Club", address: "2990 S Bayshore Dr, Miami, FL 33133" },
      { name: "Brickell City Centre Lounge", address: "701 S Miami Ave, Miami, FL 33131" },
    ],
  },
  {
    slug: "austin",
    name: "Austin",
    country: "US",
    lat: 30.2672,
    lng: -97.7431,
    venues: [
      { name: "Continental Club Gallery", address: "1315 S Congress Ave, Austin, TX 78704" },
      { name: "Zilker Park Great Lawn", address: "2100 Barton Springs Rd, Austin, TX 78704" },
      { name: "East Sixth Mezcal Bar", address: "2406 E 6th St, Austin, TX 78702" },
      { name: "Barton Springs Poolside", address: "2201 Barton Springs Rd, Austin, TX 78704" },
      { name: "South Congress Hotel Courtyard", address: "1603 S Congress Ave, Austin, TX 78704" },
      { name: "Antone's Nightclub", address: "305 E 5th St, Austin, TX 78701" },
    ],
  },
  {
    slug: "seattle",
    name: "Seattle",
    country: "US",
    lat: 47.6062,
    lng: -122.3321,
    venues: [
      { name: "Pike Place Market Atrium", address: "85 Pike St, Seattle, WA 98101" },
      { name: "Capitol Hill Cider House", address: "818 E Pike St, Seattle, WA 98122" },
      { name: "Chihuly Garden Glasshouse", address: "305 Harrison St, Seattle, WA 98109" },
      { name: "Ballard Locks Boathouse", address: "3015 NW 54th St, Seattle, WA 98107" },
      { name: "Fremont Vintage Mall Loft", address: "3419 Fremont Pl N, Seattle, WA 98103" },
      { name: "The Crocodile Back Bar", address: "2505 1st Ave, Seattle, WA 98121" },
    ],
  },
  {
    slug: "london",
    name: "London",
    country: "UK",
    lat: 51.5074,
    lng: -0.1278,
    venues: [
      { name: "Sketch Gallery Room", address: "9 Conduit St, London W1S 2XG, UK" },
      { name: "Borough Market Kitchen", address: "8 Southwark St, London SE1 1TL, UK" },
      { name: "Shoreditch House Rooftop", address: "Ebor St, London E1 6AW, UK" },
      { name: "Tate Modern Terrace Bar", address: "Bankside, London SE1 9TG, UK" },
      { name: "Camden Jazz Café", address: "5 Parkway, London NW1 7PG, UK" },
      { name: "Kew Gardens Temperate House", address: "Kew, Richmond TW9 3AB, UK" },
    ],
  },
  {
    slug: "paris",
    name: "Paris",
    country: "FR",
    lat: 48.8566,
    lng: 2.3522,
    venues: [
      { name: "Le Marais Wine Cave", address: "51 Rue de Turenne, 75003 Paris, France" },
      { name: "Palais Royal Garden", address: "2 Galerie de Montpensier, 75001 Paris, France" },
      { name: "Canal Saint-Martin Péniche", address: "13 Quai de la Loire, 75019 Paris, France" },
      { name: "Montmartre Artists' Atelier", address: "Place du Tertre, 75018 Paris, France" },
      { name: "Le Comptoir Général", address: "80 Quai de Jemmapes, 75010 Paris, France" },
      { name: "Jardin du Luxembourg Kiosk", address: "Jardin du Luxembourg, 75006 Paris, France" },
    ],
  },
  {
    slug: "berlin",
    name: "Berlin",
    country: "DE",
    lat: 52.52,
    lng: 13.405,
    venues: [
      { name: "Kreuzberg Kulturbrauerei", address: "Schönhauser Allee 36, 10435 Berlin, Germany" },
      { name: "Berghain Kantine", address: "Am Wriezener Bahnhof, 10243 Berlin, Germany" },
      { name: "Tempelhofer Feld Hangar", address: "Platz der Luftbrücke 5, 12101 Berlin, Germany" },
      { name: "Neukölln Rooftop Klunkerkranich", address: "Karl-Marx-Str. 66, 12043 Berlin, Germany" },
      { name: "Museum Island Courtyard", address: "Bodestraße 1-3, 10178 Berlin, Germany" },
      { name: "Markthalle Neun", address: "Eisenbahnstraße 42-43, 10997 Berlin, Germany" },
    ],
  },
  {
    slug: "amsterdam",
    name: "Amsterdam",
    country: "NL",
    lat: 52.3676,
    lng: 4.9041,
    venues: [
      { name: "De School Courtyard", address: "Doctor Jan van Breemenstraat 1, 1056 AB Amsterdam, Netherlands" },
      { name: "Vondelpark Openluchttheater", address: "Vondelpark 5a, 1071 AA Amsterdam, Netherlands" },
      { name: "Jordaan Canal House", address: "Prinsengracht 263, 1016 GV Amsterdam, Netherlands" },
      { name: "NDSM Wharf Warehouse", address: "NDSM-Plein 28, 1033 WB Amsterdam, Netherlands" },
      { name: "Rijksmuseum Garden Pavilion", address: "Museumstraat 1, 1071 XX Amsterdam, Netherlands" },
      { name: "Café de Ceuvel Terrace", address: "Korte Papaverweg 4, 1032 KB Amsterdam, Netherlands" },
    ],
  },
  {
    slug: "tokyo",
    name: "Tokyo",
    country: "JP",
    lat: 35.6762,
    lng: 139.6503,
    venues: [
      { name: "Shibuya Sky Lounge", address: "2-24-12 Shibuya, Shibuya-ku, Tokyo 150-0002, Japan" },
      { name: "Golden Gai Listening Bar", address: "1 Chome-1 Kabukicho, Shinjuku-ku, Tokyo 160-0021, Japan" },
      { name: "teamLab Planets Hall", address: "6-1-16 Toyosu, Koto-ku, Tokyo 135-0061, Japan" },
      { name: "Yoyogi Park Picnic Field", address: "2-1 Yoyogikamizonocho, Shibuya-ku, Tokyo 151-0052, Japan" },
      { name: "Kichijoji Harmonica Yokocho", address: "1 Chome-1 Kichijoji Honcho, Musashino, Tokyo 180-0004, Japan" },
      { name: "Aoyama Flower Market Tea House", address: "5-1-2 Minamiaoyama, Minato-ku, Tokyo 107-0062, Japan" },
    ],
  },
  {
    slug: "sydney",
    name: "Sydney",
    country: "AU",
    lat: -33.8688,
    lng: 151.2093,
    venues: [
      { name: "Opera Bar Harbourfront", address: "Bennelong Point, Sydney NSW 2000, Australia" },
      { name: "Bondi Icebergs Terrace", address: "1 Notts Ave, Bondi Beach NSW 2026, Australia" },
      { name: "The Rocks Argyle Courtyard", address: "18 Argyle St, The Rocks NSW 2000, Australia" },
      { name: "Surry Hills Rooftop Bar", address: "410 Crown St, Surry Hills NSW 2010, Australia" },
      { name: "Barangaroo Reserve Lawn", address: "Hickson Rd, Barangaroo NSW 2000, Australia" },
      { name: "Newtown Enmore Theatre Bar", address: "118-132 Enmore Rd, Newtown NSW 2042, Australia" },
    ],
  },
  {
    slug: "toronto",
    name: "Toronto",
    country: "CA",
    lat: 43.6532,
    lng: -79.3832,
    venues: [
      { name: "Distillery District Loft", address: "55 Mill St, Toronto, ON M5A 3C4, Canada" },
      { name: "Kensington Market Patio", address: "214 Augusta Ave, Toronto, ON M5T 2L4, Canada" },
      { name: "Harbourfront Centre Stage", address: "235 Queens Quay W, Toronto, ON M5J 2G8, Canada" },
      { name: "The Drake Hotel Underground", address: "1150 Queen St W, Toronto, ON M6J 1J3, Canada" },
      { name: "Evergreen Brick Works Pavilion", address: "550 Bayview Ave, Toronto, ON M4W 3X8, Canada" },
      { name: "Trinity Bellwoods Park Lawn", address: "790 Queen St W, Toronto, ON M6J 1G3, Canada" },
    ],
  },
];

/** Generic venues used for dynamic (non-registry) custom cities. */
const GENERIC_VENUES = [
  "Downtown Rooftop Lounge",
  "Old Town Wine Bar",
  "Riverside Park Pavilion",
  "The Local Arts Hall",
  "Central Market Food Hall",
  "Uptown Jazz Club",
];

export function findArea(slug: string): Area | undefined {
  const needle = slug.trim().toLowerCase();
  return AREAS.find((a) => a.slug === needle);
}

/**
 * Match registry areas by slug OR city name (case-insensitive).
 * Returns null for 'all'/empty input (meaning: all locations).
 * Unknown non-empty input does NOT match — use resolveArea for dynamic cities.
 */
export function normaliseArea(input: string | null | undefined): Area | null {
  const needle = input?.trim().toLowerCase();
  if (!needle || needle === "all") return null;
  return (
    AREAS.find(
      (a) => a.slug === needle || a.name.toLowerCase() === needle,
    ) ?? null
  );
}

/**
 * Resolve any user input to an Area: registry match first, otherwise a
 * dynamic area with generic venues so custom cities get curated lazily.
 * Returns null for 'all'/empty (no area filter).
 */
export function resolveArea(input: string | null | undefined): Area | null {
  const matched = normaliseArea(input);
  if (matched) return matched;
  const raw = input?.trim();
  if (!raw) return null;
  return {
    slug: raw.toLowerCase(),
    name: raw,
    country: "",
    lat: 0,
    lng: 0,
    venues: GENERIC_VENUES.map((name) => ({
      name,
      address: `${name}, ${raw}`,
    })),
  };
}
