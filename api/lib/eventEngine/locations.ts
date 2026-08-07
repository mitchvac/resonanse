/**
 * Area registry for the location-aware Event Engine.
 * Each area is a city the engine curates events for.
 */

export type Area = {
  slug: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  venues: string[];
};

export const AREAS: Area[] = [
  {
    slug: "new-york",
    name: "New York",
    country: "US",
    lat: 40.7128,
    lng: -74.006,
    venues: [
      "The Roof at Public Hotel",
      "Brooklyn Brewery Taproom",
      "MoMA PS1 Courtyard",
      "Smalls Jazz Club",
      "Chelsea Market Loft",
      "The High Line Lounge",
      "SoHo House Reading Room",
    ],
  },
  {
    slug: "los-angeles",
    name: "Los Angeles",
    country: "US",
    lat: 34.0522,
    lng: -118.2437,
    venues: [
      "The Grove Rooftop",
      "Griffith Observatory Terrace",
      "Silver Lake Wine Bar",
      "Venice Beach House",
      "Arts District Brewing Co.",
      "The Getty Center Garden",
    ],
  },
  {
    slug: "san-francisco",
    name: "San Francisco",
    country: "US",
    lat: 37.7749,
    lng: -122.4194,
    venues: [
      "Ferry Building Marketplace",
      "Dolores Park Lawn",
      "The Fillmore Lounge",
      "Mission District Mezcaleria",
      "Fort Mason Center Gallery",
      "Salesforce Park Amphitheater",
    ],
  },
  {
    slug: "chicago",
    name: "Chicago",
    country: "US",
    lat: 41.8781,
    lng: -87.6298,
    venues: [
      "The Green Mill Cocktail Lounge",
      "Millennium Park Pavilion",
      "Logan Square Arcade Bar",
      "Chicago Athletic Association",
      "River North Art Loft",
      "The Hideout Backroom",
    ],
  },
  {
    slug: "miami",
    name: "Miami",
    country: "US",
    lat: 25.7617,
    lng: -80.1918,
    venues: [
      "Wynwood Walls Garden",
      "South Beach Rooftop Pool Club",
      "Little Havana Domino Plaza",
      "The Standard Spa Terrace",
      "Coconut Grove Sailing Club",
      "Brickell City Centre Lounge",
    ],
  },
  {
    slug: "austin",
    name: "Austin",
    country: "US",
    lat: 30.2672,
    lng: -97.7431,
    venues: [
      "Continental Club Gallery",
      "Zilker Park Great Lawn",
      "East Sixth Mezcal Bar",
      "Barton Springs Poolside",
      "South Congress Hotel Courtyard",
      "Antone's Nightclub",
    ],
  },
  {
    slug: "seattle",
    name: "Seattle",
    country: "US",
    lat: 47.6062,
    lng: -122.3321,
    venues: [
      "Pike Place Market Atrium",
      "Capitol Hill Cider House",
      "Chihuly Garden Glasshouse",
      "Ballard Locks Boathouse",
      "Fremont Vintage Mall Loft",
      "The Crocodile Back Bar",
    ],
  },
  {
    slug: "london",
    name: "London",
    country: "UK",
    lat: 51.5074,
    lng: -0.1278,
    venues: [
      "Sketch Gallery Room",
      "Borough Market Kitchen",
      "Shoreditch House Rooftop",
      "Tate Modern Terrace Bar",
      "Camden Jazz Café",
      "Kew Gardens Temperate House",
    ],
  },
  {
    slug: "paris",
    name: "Paris",
    country: "FR",
    lat: 48.8566,
    lng: 2.3522,
    venues: [
      "Le Marais Wine Cave",
      "Palais Royal Garden",
      "Canal Saint-Martin Péniche",
      "Montmartre Artists' Atelier",
      "Le Comptoir Général",
      "Jardin du Luxembourg Kiosk",
    ],
  },
  {
    slug: "berlin",
    name: "Berlin",
    country: "DE",
    lat: 52.52,
    lng: 13.405,
    venues: [
      "Kreuzberg Kulturbrauerei",
      "Berghain Kantine",
      "Tempelhofer Feld Hangar",
      "Neukölln Rooftop Klunkerkranich",
      "Museum Island Courtyard",
      "Markthalle Neun",
    ],
  },
  {
    slug: "amsterdam",
    name: "Amsterdam",
    country: "NL",
    lat: 52.3676,
    lng: 4.9041,
    venues: [
      "De School Courtyard",
      "Vondelpark Openluchttheater",
      "Jordaan Canal House",
      "NDSM Wharf Warehouse",
      "Rijksmuseum Garden Pavilion",
      "Café de Ceuvel Terrace",
    ],
  },
  {
    slug: "tokyo",
    name: "Tokyo",
    country: "JP",
    lat: 35.6762,
    lng: 139.6503,
    venues: [
      "Shibuya Sky Lounge",
      "Golden Gai Listening Bar",
      "teamLab Planets Hall",
      "Yoyogi Park Picnic Field",
      "Kichijoji Harmonica Yokocho",
      "Aoyama Flower Market Tea House",
    ],
  },
  {
    slug: "sydney",
    name: "Sydney",
    country: "AU",
    lat: -33.8688,
    lng: 151.2093,
    venues: [
      "Opera Bar Harbourfront",
      "Bondi Icebergs Terrace",
      "The Rocks Argyle Courtyard",
      "Surry Hills Rooftop Bar",
      "Barangaroo Reserve Lawn",
      "Newtown Enmore Theatre Bar",
    ],
  },
  {
    slug: "toronto",
    name: "Toronto",
    country: "CA",
    lat: 43.6532,
    lng: -79.3832,
    venues: [
      "Distillery District Loft",
      "Kensington Market Patio",
      "Harbourfront Centre Stage",
      "The Drake Hotel Underground",
      "Evergreen Brick Works Pavilion",
      "Trinity Bellwoods Park Lawn",
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
    venues: GENERIC_VENUES,
  };
}
