import { sql } from "drizzle-orm";
import {
  mysqlTable,
  mysqlEnum,
  serial,
  bigint,
  int,
  boolean,
  json,
  longtext,
  varchar,
  text,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const passwordCredentials = mysqlTable(
  "passwordCredentials",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    email: varchar("email", { length: 320 }).notNull(),
    // Format: scrypt:N:r:p:saltB64:hashB64
    passwordHash: varchar("passwordHash", { length: 512 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("passwordCredentials_userId_unique").on(table.userId),
    uniqueIndex("passwordCredentials_email_unique").on(table.email),
  ],
);

export type PasswordCredential = typeof passwordCredentials.$inferSelect;
export type InsertPasswordCredential = typeof passwordCredentials.$inferInsert;

// ── Resonance data model ───────────────────────────────────────────────

export type ProfilePrompt = { question: string; answer: string };
export type ProfileLifestyle = {
  drinking?: string;
  smoking?: string;
  workout?: string;
  pets?: string;
  zodiac?: string;
};

export const RELATIONSHIP_GOALS = [
  "serious",
  "casual",
  "explore",
  "enm",
  "friendship",
] as const;

export const profiles = mysqlTable(
  "profiles",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    displayName: varchar("displayName", { length: 80 }).notNull(),
    age: int("age").notNull(),
    gender: varchar("gender", { length: 60 }),
    pronouns: varchar("pronouns", { length: 60 }),
    bio: text("bio"),
    city: varchar("city", { length: 120 }),
    relationshipGoal: mysqlEnum("relationshipGoal", RELATIONSHIP_GOALS)
      .notNull()
      .default("explore"),
    relationshipStatus: varchar("relationshipStatus", { length: 60 }),
    prompts: json("prompts").$type<ProfilePrompt[]>(),
    desires: json("desires").$type<string[]>(),
    lifestyle: json("lifestyle").$type<ProfileLifestyle>(),
    photos: json("photos").$type<string[]>(),
    voiceNoteUrl: varchar("voiceNoteUrl", { length: 512 }),
    heightCm: int("heightCm"),
    education: varchar("education", { length: 120 }),
    politics: varchar("politics", { length: 60 }),
    familyPlans: varchar("familyPlans", { length: 60 }),
    verified: boolean("verified").notNull().default(false),
    idVerifiedAt: timestamp("idVerifiedAt"),
    idDocType: varchar("idDocType", { length: 32 }),
    verificationStatus: mysqlEnum("verificationStatus", [
      "unverified",
      "pending",
      "verified",
    ])
      .notNull()
      .default("unverified"),
    onboardingComplete: boolean("onboardingComplete").notNull().default(false),
    anonymityMode: boolean("anonymityMode").notNull().default(false),
    hiddenWords: json("hiddenWords").$type<string[]>(),
    isSeed: boolean("isSeed").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("profiles_userId_unique").on(table.userId),
    index("profiles_seed_idx").on(table.isSeed),
    check("prompts", sql`json_valid(\`prompts\`)`),
    check("desires", sql`json_valid(\`desires\`)`),
    check("lifestyle", sql`json_valid(\`lifestyle\`)`),
    check("photos", sql`json_valid(\`photos\`)`),
    check("hiddenWords", sql`json_valid(\`hiddenWords\`)`),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;

export const likes = mysqlTable(
  "likes",
  {
    id: serial("id").primaryKey(),
    fromUserId: bigint("fromUserId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    toProfileId: bigint("toProfileId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => profiles.id),
    kind: mysqlEnum("kind", ["like", "pulse"]).notNull().default("like"),
    comment: text("comment"),
    targetType: mysqlEnum("targetType", ["profile", "prompt", "photo"])
      .notNull()
      .default("profile"),
    targetRef: varchar("targetRef", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("likes_from_to_unique").on(table.fromUserId, table.toProfileId),
    index("likes_toProfile_idx").on(table.toProfileId),
  ],
);

export type Like = typeof likes.$inferSelect;
export type InsertLike = typeof likes.$inferInsert;

export const passes = mysqlTable(
  "passes",
  {
    id: serial("id").primaryKey(),
    fromUserId: bigint("fromUserId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    toProfileId: bigint("toProfileId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("passes_from_to_unique").on(table.fromUserId, table.toProfileId),
  ],
);

export type Pass = typeof passes.$inferSelect;
export type InsertPass = typeof passes.$inferInsert;

export const matches = mysqlTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    userAId: bigint("userAId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    userBId: bigint("userBId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    weMet: mysqlEnum("weMet", ["none", "met", "dated"])
      .notNull()
      .default("none"),
    videoVerifiedAt: timestamp("videoVerifiedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("matches_pair_unique").on(table.userAId, table.userBId),
    index("matches_userB_idx").on(table.userBId),
  ],
);

export type Match = typeof matches.$inferSelect;
export type InsertMatch = typeof matches.$inferInsert;

export const conversations = mysqlTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    matchId: bigint("matchId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => matches.id),
    ephemeral: boolean("ephemeral").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("conversations_match_unique").on(table.matchId)],
);

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

export type DateIdeaMeta = {
  title: string;
  emoji?: string;
  description?: string;
  location?: string;
  time?: string;
  status?: "proposed" | "accepted" | "declined";
};

export const messages = mysqlTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: bigint("conversationId", {
      mode: "number",
      unsigned: true,
    })
      .notNull()
      .references(() => conversations.id),
    senderId: bigint("senderId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    kind: mysqlEnum("kind", [
      "text",
      "ai_starter",
      "date_idea",
      "system",
      "video_note",
    ])
      .notNull()
      .default("text"),
    content: text("content").notNull(),
    meta: json("meta").$type<DateIdeaMeta | Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("messages_conversation_idx").on(table.conversationId),
    check("meta", sql`json_valid(\`meta\`)`),
  ],
);

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

export const EVENT_CATEGORIES = [
  "mixer",
  "active",
  "creative",
  "food",
  "culture",
  "nightlife",
] as const;

export const events = mysqlTable("events", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  category: mysqlEnum("category", EVENT_CATEGORIES).notNull(),
  description: text("description"),
  image: varchar("image", { length: 255 }),
  city: varchar("city", { length: 120 }),
  venue: varchar("venue", { length: 160 }),
  startsAt: timestamp("startsAt").notNull(),
  capacity: int("capacity").notNull().default(20),
  hostName: varchar("hostName", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;

export const eventRsvps = mysqlTable(
  "eventRsvps",
  {
    id: serial("id").primaryKey(),
    eventId: bigint("eventId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => events.id),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    status: mysqlEnum("status", ["going", "interested"])
      .notNull()
      .default("going"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("eventRsvps_event_user_unique").on(table.eventId, table.userId),
    index("eventRsvps_user_idx").on(table.userId),
  ],
);

export type EventRsvp = typeof eventRsvps.$inferSelect;
export type InsertEventRsvp = typeof eventRsvps.$inferInsert;

export const TIERS = ["free", "plus", "x"] as const;

export const entitlements = mysqlTable(
  "entitlements",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    tier: mysqlEnum("tier", TIERS).notNull().default("free"),
    pulses: int("pulses").notNull().default(3),
    boosts: int("boosts").notNull().default(0),
    dailyLikeLimit: int("dailyLikeLimit").notNull().default(5),
    renewedAt: timestamp("renewedAt"),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("entitlements_user_unique").on(table.userId)],
);

export type Entitlement = typeof entitlements.$inferSelect;
export type InsertEntitlement = typeof entitlements.$inferInsert;

export const reports = mysqlTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    reporterId: bigint("reporterId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    targetUserId: bigint("targetUserId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    reason: varchar("reason", { length: 60 }).notNull(),
    detail: text("detail"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("reports_target_idx").on(table.targetUserId)],
);

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

export const blocks = mysqlTable(
  "blocks",
  {
    id: serial("id").primaryKey(),
    blockerId: bigint("blockerId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    blockedId: bigint("blockedId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("blocks_pair_unique").on(table.blockerId, table.blockedId),
    index("blocks_blocked_idx").on(table.blockedId),
  ],
);

export type Block = typeof blocks.$inferSelect;
export type InsertBlock = typeof blocks.$inferInsert;

export const feedback = mysqlTable(
  "feedback",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    matchId: bigint("matchId", { mode: "number", unsigned: true }).references(
      () => matches.id,
    ),
    kind: mysqlEnum("kind", ["we_met", "match_quality", "date_feedback"])
      .notNull(),
    rating: int("rating"),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("feedback_match_idx").on(table.matchId)],
);

export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = typeof feedback.$inferInsert;

// ── Triple verification: video notes + live video calls ────────────────

export const videoNotes = mysqlTable(
  "videoNotes",
  {
    id: serial("id").primaryKey(),
    conversationId: bigint("conversationId", {
      mode: "number",
      unsigned: true,
    })
      .notNull()
      .references(() => conversations.id),
    senderId: bigint("senderId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    data: longtext("data").notNull(),
    durationSec: int("durationSec").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("videoNotes_conversation_idx").on(table.conversationId)],
);

export type VideoNote = typeof videoNotes.$inferSelect;
export type InsertVideoNote = typeof videoNotes.$inferInsert;

export const callSessions = mysqlTable(
  "callSessions",
  {
    id: serial("id").primaryKey(),
    conversationId: bigint("conversationId", {
      mode: "number",
      unsigned: true,
    })
      .notNull()
      .references(() => conversations.id),
    callerId: bigint("callerId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    calleeId: bigint("calleeId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    status: mysqlEnum("status", [
      "ringing",
      "active",
      "declined",
      "ended",
      "missed",
    ])
      .notNull()
      .default("ringing"),
    answeredAt: timestamp("answeredAt"),
    endedAt: timestamp("endedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("callSessions_callee_status_idx").on(table.calleeId, table.status),
    index("callSessions_conversation_idx").on(table.conversationId),
  ],
);

export type CallSession = typeof callSessions.$inferSelect;
export type InsertCallSession = typeof callSessions.$inferInsert;

export const callSignals = mysqlTable(
  "callSignals",
  {
    id: serial("id").primaryKey(),
    sessionId: bigint("sessionId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => callSessions.id),
    fromUserId: bigint("fromUserId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    payload: text("payload").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("callSignals_session_id_idx").on(table.sessionId, table.id)],
);

export type CallSignal = typeof callSignals.$inferSelect;
export type InsertCallSignal = typeof callSignals.$inferInsert;
