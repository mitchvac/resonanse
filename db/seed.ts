import { eq } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import {
  entitlements,
  events,
  profiles,
  users,
  type InsertEvent,
  type InsertProfile,
  type InsertUser,
} from "./schema";

type Persona = {
  key: string;
  name: string;
  age: number;
  gender: string;
  pronouns: string;
  bio: string;
  city: string;
  relationshipGoal: InsertProfile["relationshipGoal"];
  relationshipStatus: string;
  prompts: { question: string; answer: string }[];
  desires: string[];
  lifestyle: InsertProfile["lifestyle"];
  photo: string;
  verified: boolean;
  heightCm: number;
  familyPlans: string;
};

const personas: Persona[] = [
  {
    key: "marcus",
    name: "Marcus",
    age: 29,
    gender: "Man",
    pronouns: "he/him",
    bio: "Architect by day, rooftop-garden tender by golden hour. I read menus out loud and mean it.",
    city: "Brooklyn, NY",
    relationshipGoal: "serious",
    relationshipStatus: "Single",
    prompts: [
      {
        question: "The way to my heart is…",
        answer:
          "A farmers-market tomato, good olive oil, and someone who reads the whole menu out loud.",
      },
      {
        question: "Green flags I look for…",
        answer:
          "You text back when you say you will. You have a thing you're nerdy about. You're kind to waiters.",
      },
      {
        question: "Two truths and a lie:",
        answer:
          "I've brewed coffee in 9 countries. I can wiggle my ears. I once DJ'd a wedding by accident.",
      },
    ],
    desires: ["Slow burn", "Night owl", "Traveler"],
    lifestyle: {
      drinking: "Socially",
      smoking: "Never",
      workout: "Climbing",
      pets: "Plant parent",
      zodiac: "Taurus",
    },
    photo: "/avatar-01.jpg",
    verified: true,
    heightCm: 183,
    familyPlans: "Want kids",
  },
  {
    key: "yuki",
    name: "Yuki",
    age: 26,
    gender: "Woman",
    pronouns: "she/her",
    bio: "Illustrator. Professional overcast-window-light enjoyer. Will sketch you on the first date if you sit still.",
    city: "San Francisco, CA",
    relationshipGoal: "explore",
    relationshipStatus: "Single",
    prompts: [
      {
        question: "A perfect Sunday looks like…",
        answer:
          "Late breakfast, a museum with one good painting, and a nap that wasn't planned.",
      },
      {
        question: "I'm unreasonably good at…",
        answer:
          "Guessing the exact episode of a show from one screenshot. Useless. Proud.",
      },
    ],
    desires: ["Homebody", "Curiosity", "Playfulness"],
    lifestyle: {
      drinking: "Rarely",
      smoking: "Never",
      workout: "Yoga",
      pets: "Cat person",
      zodiac: "Pisces",
    },
    photo: "/avatar-02.jpg",
    verified: true,
    heightCm: 162,
    familyPlans: "Open",
  },
  {
    key: "noa",
    name: "Noa",
    age: 31,
    gender: "Nonbinary",
    pronouns: "they/them",
    bio: "ENM, partnered, and honest about it. Urban gardener, karaoke menace, direct communicator.",
    city: "Portland, OR",
    relationshipGoal: "enm",
    relationshipStatus: "Partnered (open)",
    prompts: [
      {
        question: "We'll get along if…",
        answer:
          "You can talk about feelings without making it weird, and you have opinions about houseplants.",
      },
      {
        question: "My most controversial food opinion…",
        answer:
          "Cereal is soup. I will not be taking questions, but I will take you to dumplings.",
      },
      {
        question: "My simple pleasure is…",
        answer:
          "The first warm day of the year when everyone in the city is suspiciously nice.",
      },
    ],
    desires: ["Directness", "Kink-curious", "Curiosity"],
    lifestyle: {
      drinking: "Socially",
      smoking: "420-friendly",
      workout: "Cycling",
      pets: "Pet person",
      zodiac: "Scorpio",
    },
    photo: "/avatar-03.jpg",
    verified: true,
    heightCm: 170,
    familyPlans: "Don't want kids",
  },
  {
    key: "valentina",
    name: "Valentina",
    age: 34,
    gender: "Woman",
    pronouns: "she/her",
    bio: "Chef. I laugh with my whole chest and I will absolutely judge your spice tolerance (lovingly).",
    city: "Austin, TX",
    relationshipGoal: "serious",
    relationshipStatus: "Single",
    prompts: [
      {
        question: "The way to my heart is…",
        answer:
          "Let me cook for you. Then tell me honestly if the salsa needed more lime.",
      },
      {
        question: "Two truths and a lie:",
        answer:
          "I trained in Oaxaca. I hate avocados. I've won a chili cook-off twice.",
      },
    ],
    desires: ["Ambition", "Playfulness", "Vanilla+"],
    lifestyle: {
      drinking: "Socially",
      smoking: "Never",
      workout: "Dance",
      pets: "Dog person",
      zodiac: "Leo",
    },
    photo: "/avatar-04.jpg",
    verified: true,
    heightCm: 168,
    familyPlans: "Want kids",
  },
  {
    key: "rowan",
    name: "Rowan",
    age: 27,
    gender: "Man",
    pronouns: "he/him",
    bio: "Trail runner and amateur mycologist. Mostly here for a hiking buddy; open to wherever that goes.",
    city: "Denver, CO",
    relationshipGoal: "friendship",
    relationshipStatus: "Single",
    prompts: [
      {
        question: "A perfect Sunday looks like…",
        answer:
          "Up a mountain by 7, pancakes by 11, horizontal by 3.",
      },
      {
        question: "Green flags I look for…",
        answer:
          "You bring snacks to share. You admit when you're lost. You like the quiet parts too.",
      },
    ],
    desires: ["Outdoors", "Kindness first", "Independence"],
    lifestyle: {
      drinking: "Rarely",
      smoking: "Never",
      workout: "Running",
      pets: "Dog person",
      zodiac: "Virgo",
    },
    photo: "/avatar-05.jpg",
    verified: false,
    heightCm: 178,
    familyPlans: "Open",
  },
  {
    key: "priya",
    name: "Priya",
    age: 30,
    gender: "Woman",
    pronouns: "she/her",
    bio: "Product manager who moonlights as a jazz-bar regular. Ambitious, warm, chronically on time.",
    city: "Chicago, IL",
    relationshipGoal: "serious",
    relationshipStatus: "Single",
    prompts: [
      {
        question: "We'll get along if…",
        answer:
          "You have a five-year plan AND can abandon it for a last-minute road trip.",
      },
      {
        question: "My simple pleasure is…",
        answer:
          "The first sip of a properly made chai. Non-negotiable morning ritual.",
      },
      {
        question: "I'm unreasonably good at…",
        answer:
          "Remembering the name of your childhood pet after one conversation.",
      },
    ],
    desires: ["Ambition", "Slow burn", "Traveler"],
    lifestyle: {
      drinking: "Socially",
      smoking: "Never",
      workout: "Pilates",
      pets: "Cat person",
      zodiac: "Capricorn",
    },
    photo: "/avatar-06.jpg",
    verified: true,
    heightCm: 165,
    familyPlans: "Want kids",
  },
  {
    key: "david",
    name: "David",
    age: 38,
    gender: "Man",
    pronouns: "he/him",
    bio: "Vinyl collector, divorced, two great kids, zero drama. Looking for fun that respects a calendar.",
    city: "Brooklyn, NY",
    relationshipGoal: "casual",
    relationshipStatus: "Divorced",
    prompts: [
      {
        question: "Two truths and a lie:",
        answer:
          "I own 1,400 records. I met Stevie Wonder in an elevator. I hate jazz.",
      },
      {
        question: "The way to my heart is…",
        answer:
          "Tell me what album changed your life and actually listen to mine.",
      },
    ],
    desires: ["Directness", "Night owl", "Independence"],
    lifestyle: {
      drinking: "Socially",
      smoking: "Socially",
      workout: "Gym",
      pets: "None",
      zodiac: "Libra",
    },
    photo: "/avatar-07.jpg",
    verified: true,
    heightCm: 185,
    familyPlans: "Have kids",
  },
  {
    key: "skye",
    name: "Skye",
    age: 24,
    gender: "Woman",
    pronouns: "she/her",
    bio: "Surf instructor in summer, ceramicist in winter. Golden retriever energy, human body.",
    city: "Los Angeles, CA",
    relationshipGoal: "explore",
    relationshipStatus: "Single",
    prompts: [
      {
        question: "A perfect Sunday looks like…",
        answer:
          "Dawn patrol, breakfast burrito, and a beach nap with SPF 50 and zero guilt.",
      },
      {
        question: "We'll get along if…",
        answer:
          "You're down to be bad at something new together. Pottery? Surfing? Bowling? Yes.",
      },
    ],
    desires: ["Playfulness", "Outdoors", "Curiosity"],
    lifestyle: {
      drinking: "Socially",
      smoking: "420-friendly",
      workout: "Surfing",
      pets: "Dog person",
      zodiac: "Sagittarius",
    },
    photo: "/avatar-08.jpg",
    verified: false,
    heightCm: 170,
    familyPlans: "Open",
  },
  {
    key: "kenji",
    name: "Kenji",
    age: 32,
    gender: "Man",
    pronouns: "he/him",
    bio: "Sound designer. I know every noodle bar open past midnight and exactly which booth has the best acoustics.",
    city: "Seattle, WA",
    relationshipGoal: "explore",
    relationshipStatus: "Single",
    prompts: [
      {
        question: "My simple pleasure is…",
        answer:
          "A perfect bowl of ramen at 1am after a gig, when the city finally goes quiet.",
      },
      {
        question: "Green flags I look for…",
        answer:
          "You listen all the way through a song before talking. You ask follow-up questions.",
      },
      {
        question: "I'm unreasonably good at…",
        answer:
          "Naming a song from a two-second clip. Test me. Please, test me.",
      },
    ],
    desires: ["Night owl", "Slow burn", "Curiosity"],
    lifestyle: {
      drinking: "Socially",
      smoking: "Never",
      workout: "Bouldering",
      pets: "Cat person",
      zodiac: "Aquarius",
    },
    photo: "/avatar-09.jpg",
    verified: true,
    heightCm: 175,
    familyPlans: "Open",
  },
  {
    key: "amara",
    name: "Amara",
    age: 36,
    gender: "Woman",
    pronouns: "she/her",
    bio: "Community organizer and weekend potter. I host the kind of dinners people talk about for months.",
    city: "Atlanta, GA",
    relationshipGoal: "serious",
    relationshipStatus: "Single",
    prompts: [
      {
        question: "The way to my heart is…",
        answer:
          "Show up for your people. Bring something to the table — literally and otherwise.",
      },
      {
        question: "Two truths and a lie:",
        answer:
          "I've read every Octavia Butler novel twice. I can't swim. I once fed 60 people from one pot.",
      },
    ],
    desires: ["Kindness first", "Ambition", "Homebody"],
    lifestyle: {
      drinking: "Rarely",
      smoking: "Never",
      workout: "Walking",
      pets: "Plant parent",
      zodiac: "Cancer",
    },
    photo: "/avatar-10.jpg",
    verified: true,
    heightCm: 172,
    familyPlans: "Want kids",
  },
];

const dayMs = 24 * 60 * 60 * 1000;

const seedEvents: (Omit<InsertEvent, "startsAt"> & { daysFromNow: number })[] = [
  {
    title: "Rooftop Golden-Hour Mixer",
    category: "mixer",
    description:
      "String lights, natural wine, and a skyline doing its violet-dusk thing. Name tags optional, eye contact encouraged.",
    image: "/event-01.jpg",
    city: "Brooklyn, NY",
    venue: "The Ides Rooftop",
    daysFromNow: 3,
    capacity: 40,
    hostName: "Resonance",
  },
  {
    title: "Pottery & Pinot",
    category: "creative",
    description:
      "Two hours at the wheel with a glass in hand. You'll leave with a lopsided bowl and at least one good story.",
    image: "/event-02.jpg",
    city: "Portland, OR",
    venue: "Clay Studio Northwest",
    daysFromNow: 5,
    capacity: 16,
    hostName: "Noa",
  },
  {
    title: "Sunrise Run Club",
    category: "active",
    description:
      "A gentle 5k through morning mist, then coffee and pastries. Pace is conversational — literally.",
    image: "/event-03.jpg",
    city: "Denver, CO",
    venue: "Prospect Park Loop",
    daysFromNow: 8,
    capacity: 30,
    hostName: "Rowan",
  },
  {
    title: "Vinyl Listening Night",
    category: "nightlife",
    description:
      "Bring a record that means something. Full-album playback, dim amber light, no talking over the bridges.",
    image: "/event-04.jpg",
    city: "Brooklyn, NY",
    venue: "Honeycomb Hi-Fi",
    daysFromNow: 10,
    capacity: 25,
    hostName: "David",
  },
  {
    title: "Communal Cooking Class",
    category: "food",
    description:
      "Hand-rolled pasta at a long wooden table. Cook together, eat together, exchange numbers over tiramisu.",
    image: "/event-05.jpg",
    city: "Austin, TX",
    venue: "Nonna's Table",
    daysFromNow: 14,
    capacity: 12,
    hostName: "Valentina",
  },
  {
    title: "Gallery Night: Violet Hour",
    category: "culture",
    description:
      "After-hours abstract show with a violet-lit centerpiece. Slow looking, soft conversation, wine in the courtyard.",
    image: "/event-06.jpg",
    city: "Atlanta, GA",
    venue: "Meridian Gallery",
    daysFromNow: 17,
    capacity: 50,
    hostName: "Amara",
  },
];

async function seed() {
  const db = getDb();
  console.log("Seeding database...");

  // 1. Seed users (idempotent via unique unionId)
  for (const persona of personas) {
    const user: InsertUser = {
      unionId: `seed-${persona.key}`,
      name: persona.name,
      avatar: persona.photo,
    };
    await db
      .insert(users)
      .values(user)
      .onConflictDoUpdate({
        target: users.unionId,
        set: { name: persona.name, avatar: persona.photo },
      });
  }

  const seedUsers = await db.select().from(users);
  const userByUnionId = new Map(seedUsers.map((u) => [u.unionId, u]));

  // 2. Profiles (idempotent via unique userId)
  let profileCount = 0;
  for (const persona of personas) {
    const user = userByUnionId.get(`seed-${persona.key}`);
    if (!user) throw new Error(`Seed user missing: ${persona.key}`);

    const profile: InsertProfile = {
      userId: user.id,
      displayName: persona.name,
      age: persona.age,
      gender: persona.gender,
      pronouns: persona.pronouns,
      bio: persona.bio,
      city: persona.city,
      relationshipGoal: persona.relationshipGoal,
      relationshipStatus: persona.relationshipStatus,
      prompts: persona.prompts,
      desires: persona.desires,
      lifestyle: persona.lifestyle,
      photos: [persona.photo],
      heightCm: persona.heightCm,
      familyPlans: persona.familyPlans,
      verified: persona.verified,
      verificationStatus: persona.verified ? "verified" : "unverified",
      onboardingComplete: true,
      isSeed: true,
    };

    await db
      .insert(profiles)
      .values(profile)
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          displayName: persona.name,
          bio: persona.bio,
          prompts: persona.prompts,
          desires: persona.desires,
          isSeed: true,
        },
      });
    profileCount += 1;
  }

  // 3. Entitlements for seed users
  for (const persona of personas) {
    const user = userByUnionId.get(`seed-${persona.key}`);
    if (!user) continue;
    await db
      .insert(entitlements)
      .values({ userId: user.id })
      .onConflictDoUpdate({ target: entitlements.userId, set: { userId: user.id } });
  }

  // 4. Events (idempotent via title check)
  const existingEvents = await db.select().from(events);
  const existingTitles = new Set(existingEvents.map((e) => e.title));
  let eventCount = 0;
  const now = Date.now();
  for (const event of seedEvents) {
    if (existingTitles.has(event.title)) continue;
    const { daysFromNow, ...rest } = event;
    await db.insert(events).values({
      ...rest,
      startsAt: new Date(now + daysFromNow * dayMs),
    });
    eventCount += 1;
  }

  console.log(
    `Done. ${personas.length} users, ${profileCount} profiles, ${eventCount} new events (${existingTitles.size} already existed).`,
  );
  process.exit(0); // close Postgres connection pool
}

seed();
