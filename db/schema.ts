// ── Postgres dialect (Supabase) — ported from MySQL/TiDB. ─────────────
// All tables/columns/defaults/indexes/FKs/uniques preserved 1:1; only the
// dialect mapping changed (bigserial PKs, pgEnum, jsonb, real booleans,
// timestamp mode "string"). The 12 MySQL JSON-validity CHECK constraints
// were dropped (jsonb self-validates); MySQL longtext/mediumtext/double
// map to text/text/doublePrecision.
import {
  pgTable,
  pgEnum,
  bigserial,
  bigint,
  integer,
  doublePrecision,
  boolean,
  jsonb,
  varchar,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
  /** Set when moderation removes the account (strike 3, human-confirmed). */
  removedAt: timestamp("removedAt"),
  /** The user_strikes.id whose confirmation removed the account. */
  removalStrikeId: bigint("removalStrikeId", { mode: "number" }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const passwordCredentials = pgTable(
  "passwordCredentials",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" })
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

/**
 * Single-use password reset tokens. Only the sha256 of the token is stored —
 * the raw token lives solely in the emailed link.
 */
export const passwordResetTokens = pgTable(
  "passwordResetTokens",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("passwordResetTokens_tokenHash_unique").on(table.tokenHash),
    index("passwordResetTokens_userId_idx").on(table.userId),
  ],
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

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

export const relationshipGoalEnum = pgEnum("relationship_goal", RELATIONSHIP_GOALS);
export const verificationStatusEnum = pgEnum("verification_status", [
  "unverified",
  "pending",
  "verified",
]);

export const profiles = pgTable(
  "profiles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    displayName: varchar("displayName", { length: 80 }).notNull(),
    age: integer("age").notNull(),
    gender: varchar("gender", { length: 60 }),
    pronouns: varchar("pronouns", { length: 60 }),
    bio: text("bio"),
    city: varchar("city", { length: 120 }),
    /** Chosen events area (registry slug or custom city). Null = all areas. */
    eventArea: varchar("eventArea", { length: 120 }),
    relationshipGoal: relationshipGoalEnum("relationshipGoal")
      .notNull()
      .default("explore"),
    relationshipStatus: varchar("relationshipStatus", { length: 60 }),
    prompts: jsonb("prompts").$type<ProfilePrompt[]>(),
    desires: jsonb("desires").$type<string[]>(),
    lifestyle: jsonb("lifestyle").$type<ProfileLifestyle>(),
    photos: jsonb("photos").$type<string[]>(),
    voiceNoteUrl: text("voiceNoteUrl"),
    heightCm: integer("heightCm"),
    education: varchar("education", { length: 120 }),
    politics: varchar("politics", { length: 60 }),
    familyPlans: varchar("familyPlans", { length: 60 }),
    verified: boolean("verified").notNull().default(false),
    idVerifiedAt: timestamp("idVerifiedAt"),
    idDocType: varchar("idDocType", { length: 32 }),
    verificationStatus: verificationStatusEnum("verificationStatus")
      .notNull()
      .default("unverified"),
    onboardingComplete: boolean("onboardingComplete").notNull().default(false),
    anonymityMode: boolean("anonymityMode").notNull().default(false),
    hiddenWords: jsonb("hiddenWords").$type<string[]>(),
    isSeed: boolean("isSeed").notNull().default(false),
    // Discovery preferences
    showMe: jsonb("showMe").$type<string[]>(),
    openTo: jsonb("openTo").$type<string[]>(),
    showIntent: boolean("showIntent").notNull().default(true),
    /** Consent-gated/kink tags — NEVER exposed in public profile views. */
    privateDesires: jsonb("privateDesires").$type<string[]>(),
    /** Non-monogamy constellation — private, never public. */
    constellation:
      jsonb("constellation").$type<
        Array<{ handle: string; name: string; photo: string; status: string }>
      >(),
    /** Private reflection ratings (1–5) — never public. */
    reflections: jsonb("reflections").$type<number[]>(),
    weeklyGoal: integer("weeklyGoal").notNull().default(1),
    pausedAt: timestamp("pausedAt"),
    ephemeralDefault: boolean("ephemeralDefault").notNull().default(false),
    /** Idempotency marker for one-time lazy like-seeding. */
    likesSeededAt: timestamp("likesSeededAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("profiles_userId_unique").on(table.userId),
    index("profiles_seed_idx").on(table.isSeed),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;

export const likeKindEnum = pgEnum("like_kind", ["like", "pulse", "flower", "wave", "kiss"]);
export const likeTargetTypeEnum = pgEnum("like_target_type", ["profile", "prompt", "photo"]);

export const likes = pgTable(
  "likes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fromUserId: bigint("fromUserId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    toProfileId: bigint("toProfileId", { mode: "number" })
      .notNull()
      .references(() => profiles.id),
    kind: likeKindEnum("kind").notNull().default("like"),
    comment: text("comment"),
    targetType: likeTargetTypeEnum("targetType")
      .notNull()
      .default("profile"),
    targetRef: varchar("targetRef", { length: 255 }),
    /** Set when the recipient passes on the liker — hides the like quietly. */
    dismissedAt: timestamp("dismissedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("likes_from_to_unique").on(table.fromUserId, table.toProfileId),
    index("likes_toProfile_idx").on(table.toProfileId),
  ],
);

export type Like = typeof likes.$inferSelect;
export type InsertLike = typeof likes.$inferInsert;

export const passes = pgTable(
  "passes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fromUserId: bigint("fromUserId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    toProfileId: bigint("toProfileId", { mode: "number" })
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

export const weMetEnum = pgEnum("we_met", ["none", "met", "dated"]);

export const matches = pgTable(
  "matches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userAId: bigint("userAId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    userBId: bigint("userBId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    weMet: weMetEnum("weMet")
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

export const conversations = pgTable(
  "conversations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    matchId: bigint("matchId", { mode: "number" })
      .notNull()
      .references(() => matches.id),
    ephemeral: boolean("ephemeral").notNull().default(false),
    archivedAt: timestamp("archivedAt"),
    mutedAt: timestamp("mutedAt"),
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

export const messageKindEnum = pgEnum("message_kind", [
  "text",
  "ai_starter",
  "date_idea",
  "system",
  "video_note",
  "event_invite",
]);

export const messages = pgTable(
  "messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    conversationId: bigint("conversationId", { mode: "number" })
      .notNull()
      .references(() => conversations.id),
    senderId: bigint("senderId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    kind: messageKindEnum("kind")
      .notNull()
      .default("text"),
    content: text("content").notNull(),
    meta: jsonb("meta").$type<DateIdeaMeta | Record<string, unknown>>(),
    /** Ephemeral conversations stamp this — rows expire 24h after send. */
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("messages_conversation_idx").on(table.conversationId),
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

export const eventCategoryEnum = pgEnum("event_category", EVENT_CATEGORIES);

export const events = pgTable("events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  category: eventCategoryEnum("category").notNull(),
  description: text("description"),
  image: varchar("image", { length: 255 }),
  city: varchar("city", { length: 120 }),
  venue: varchar("venue", { length: 160 }),
  address: varchar("address", { length: 255 }),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  startsAt: timestamp("startsAt").notNull(),
  capacity: integer("capacity").notNull().default(20),
  hostName: varchar("hostName", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;

export const rsvpStatusEnum = pgEnum("rsvp_status", ["going", "interested"]);

export const eventRsvps = pgTable(
  "eventRsvps",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: bigint("eventId", { mode: "number" })
      .notNull()
      .references(() => events.id),
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    status: rsvpStatusEnum("status")
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

export const tierEnum = pgEnum("tier", TIERS);

export const entitlements = pgTable(
  "entitlements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    tier: tierEnum("tier").notNull().default("free"),
    pulses: integer("pulses").notNull().default(3),
    boosts: integer("boosts").notNull().default(0),
    dailyLikeLimit: integer("dailyLikeLimit").notNull().default(5),
    /** One-time free trial window (all features). Null until started. */
    trialStartedAt: timestamp("trialStartedAt"),
    trialEndsAt: timestamp("trialEndsAt"),
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

export const reports = pgTable(
  "reports",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reporterId: bigint("reporterId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    targetUserId: bigint("targetUserId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    reason: varchar("reason", { length: 60 }).notNull(),
    detail: text("detail"),
    /** V93: reports became a real moderation queue ('open' until reviewed). */
    status: varchar("status", { length: 24 }).notNull().default("open"),
    /** Reporter trust weight (§5.5 anti-weaponization); low weight never corroborates alone. */
    weight: doublePrecision("weight").notNull().default(1),
    /** Connected-account collapse key — one dedupGroup counts as one report. */
    dedupGroup: varchar("dedupGroup", { length: 64 }),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("reports_target_idx").on(table.targetUserId)],
);

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

export const blocks = pgTable(
  "blocks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    blockerId: bigint("blockerId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    blockedId: bigint("blockedId", { mode: "number" })
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

export const feedbackKindEnum = pgEnum("feedback_kind", [
  "we_met",
  "match_quality",
  "date_feedback",
  "event",
]);

export const feedback = pgTable(
  "feedback",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    matchId: bigint("matchId", { mode: "number" }).references(
      () => matches.id,
    ),
    kind: feedbackKindEnum("kind")
      .notNull(),
    rating: integer("rating"),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("feedback_match_idx").on(table.matchId)],
);

export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = typeof feedback.$inferInsert;

// ── Triple verification: video notes + live video calls ────────────────

export const videoNotes = pgTable(
  "videoNotes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    conversationId: bigint("conversationId", { mode: "number" })
      .notNull()
      .references(() => conversations.id),
    senderId: bigint("senderId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    data: text("data").notNull(),
    durationSec: integer("durationSec").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("videoNotes_conversation_idx").on(table.conversationId)],
);

export type VideoNote = typeof videoNotes.$inferSelect;
export type InsertVideoNote = typeof videoNotes.$inferInsert;

export const callStatusEnum = pgEnum("call_status", [
  "ringing",
  "active",
  "declined",
  "ended",
  "missed",
]);

export const callSessions = pgTable(
  "callSessions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    conversationId: bigint("conversationId", { mode: "number" })
      .notNull()
      .references(() => conversations.id),
    callerId: bigint("callerId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    calleeId: bigint("calleeId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    status: callStatusEnum("status")
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

export const callSignals = pgTable(
  "callSignals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sessionId: bigint("sessionId", { mode: "number" })
      .notNull()
      .references(() => callSessions.id),
    fromUserId: bigint("fromUserId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    payload: text("payload").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("callSignals_session_id_idx").on(table.sessionId, table.id)],
);

export type CallSignal = typeof callSignals.$inferSelect;
export type InsertCallSignal = typeof callSignals.$inferInsert;


// ── Smart Custody Wallet / Date-Coin ─────────────────────────────────
// Date-Coin is an internal utility token. Real crypto (XRP/RLUSD/BTC) is
// NEVER custodied — it is verified watch-only on-chain. All price math uses
// INTEGER micro-USD units (0.10 USD = 100000, the +0.005 increment = 5000).

export const dcWallets = pgTable(
  "dc_wallets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    walletId: varchar("walletId", { length: 64 }).notNull(),
    /** Smart Custody Switch — ON by default; Marketplace skips OFF wallets. */
    switchOn: boolean("switchOn").notNull().default(true),
    authorityGrantedAt: timestamp("authorityGrantedAt").defaultNow().notNull(),
    /** First 100,000 wallets received the 10,000-coin airdrop. */
    isOriginalHundredK: boolean("isOriginalHundredK").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("dc_wallets_userId_unique").on(table.userId),
    uniqueIndex("dc_wallets_walletId_unique").on(table.walletId),
  ],
);

export type DcWallet = typeof dcWallets.$inferSelect;
export type InsertDcWallet = typeof dcWallets.$inferInsert;

export const dcLedger = pgTable("dc_ledger", {
  walletId: varchar("walletId", { length: 64 }).primaryKey(),
  balance: integer("balance").notNull().default(0),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type DcLedgerRow = typeof dcLedger.$inferSelect;
export type InsertDcLedgerRow = typeof dcLedger.$inferInsert;

/** System-wide up-only price — a single singleton row with id = 1. */
export const dcPriceState = pgTable("dc_price_state", {
  id: integer("id").primaryKey(),
  currentPriceMicro: integer("currentPriceMicro").notNull(),
  totalSalesCount: integer("totalSalesCount").notNull().default(0),
  lastSaleAt: timestamp("lastSaleAt"),
});

export type DcPriceStateRow = typeof dcPriceState.$inferSelect;
export type InsertDcPriceStateRow = typeof dcPriceState.$inferInsert;

export const DC_PAID_WITH = ["XRP", "RLUSD", "BTC", "XLM"] as const;

export const dcPaidWithEnum = pgEnum("dc_paid_with", DC_PAID_WITH);

export const dcSales = pgTable(
  "dc_sales",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    saleId: varchar("saleId", { length: 64 }).notNull(),
    buyerWalletId: varchar("buyerWalletId", { length: 64 }).notNull(),
    /** Supplier walletId, or the literal 'PLATFORM' for platform top-up sales. */
    sellerWalletId: varchar("sellerWalletId", { length: 64 }).notNull(),
    amount: integer("amount").notNull(),
    pricePerCoinMicro: integer("pricePerCoinMicro").notNull(),
    /** Exact fiat/crypto total paid, stored as text to avoid float drift. */
    totalPaidText: varchar("totalPaidText", { length: 64 }).notNull(),
    paidWith: dcPaidWithEnum("paidWith").notNull(),
    cryptoIntentId: varchar("cryptoIntentId", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("dc_sales_saleId_unique").on(table.saleId),
    index("dc_sales_buyer_idx").on(table.buyerWalletId, table.id),
    index("dc_sales_seller_idx").on(table.sellerWalletId, table.id),
  ],
);

export type DcSale = typeof dcSales.$inferSelect;
export type InsertDcSale = typeof dcSales.$inferInsert;

export const DC_REWARD_STATUS = ["pending", "paid"] as const;

export const dcRewardStatusEnum = pgEnum("dc_reward_status", DC_REWARD_STATUS);

/**
 * Supplier reward OBLIGATIONS. The platform pays XRP from its own treasury
 * (6% bonus). Because the platform holds no keys, these are recorded as
 * 'pending' obligations and are NEVER broadcast on-chain by the server.
 */
export const dcRewards = pgTable(
  "dc_rewards",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    supplierWalletId: varchar("supplierWalletId", { length: 64 }).notNull(),
    saleId: varchar("saleId", { length: 64 }).notNull(),
    amountXrpText: varchar("amountXrpText", { length: 64 }).notNull(),
    status: dcRewardStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("dc_rewards_supplier_idx").on(table.supplierWalletId)],
);

export type DcReward = typeof dcRewards.$inferSelect;
export type InsertDcReward = typeof dcRewards.$inferInsert;

/** Append-only audit trail for every wallet action. */
export const dcAudit = pgTable(
  "dc_audit",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actor: varchar("actor", { length: 128 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
);

export type DcAuditRow = typeof dcAudit.$inferSelect;
export type InsertDcAuditRow = typeof dcAudit.$inferInsert;

export const DC_INTENT_PURPOSE = [
  "SUBSCRIPTION_PLUS",
  "SUBSCRIPTION_X",
  "TOP_UP",
] as const;

export const DC_INTENT_STATUS = [
  "pending",
  "confirmed",
  "underpaid",
  "expired",
] as const;

export const dcIntentPurposeEnum = pgEnum("dc_intent_purpose", DC_INTENT_PURPOSE);
export const dcIntentStatusEnum = pgEnum("dc_intent_status", DC_INTENT_STATUS);

/** Watch-only crypto payment intents — server verifies on-chain, never trusts the client. */
export const dcCryptoIntents = pgTable(
  "dc_crypto_intents",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    intentId: varchar("intentId", { length: 64 }).notNull(),
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    purpose: dcIntentPurposeEnum("purpose").notNull(),
    asset: dcPaidWithEnum("asset").notNull(),
    address: varchar("address", { length: 128 }).notNull(),
    /** Destination tag (XRP/RLUSD) or text memo (XLM). NULL for BTC. */
    memoOrTag: varchar("memoOrTag", { length: 64 }),
    /** Exact on-chain amount expected, as a decimal string. */
    expectedAmountText: varchar("expectedAmountText", { length: 64 }).notNull(),
    quotedUsdMicro: integer("quotedUsdMicro").notNull(),
    status: dcIntentStatusEnum("status").notNull().default("pending"),
    txHash: varchar("txHash", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    confirmedAt: timestamp("confirmedAt"),
  },
  (table) => [
    uniqueIndex("dc_crypto_intents_intentId_unique").on(table.intentId),
    index("dc_crypto_intents_user_idx").on(table.userId),
  ],
);

export type DcCryptoIntent = typeof dcCryptoIntents.$inferSelect;
export type InsertDcCryptoIntent = typeof dcCryptoIntents.$inferInsert;

/* ------------------------------------------------------------------------ */
/* Customer-controlled wallet keys (Date-Coin ecosystem)                     */
/*                                                                           */
/* The wallet password IS the customer's secret key: it derives (client-side */
/* only, PBKDF2) the AES-GCM key that seals the XRPL wallet seed. The server */
/* stores ONLY ciphertext + salt + iv + kdf params — it must never receive   */
/* the password or a plaintext seed (enforced in api/walletSecurityRouter).  */
/* ------------------------------------------------------------------------ */

export const walletKeys = pgTable(
  "wallet_keys",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    walletId: varchar("walletId", { length: 64 }).notNull(),
    /** Classic XRPL address (r…) — public, safe to store plaintext. */
    xrplAddress: varchar("xrplAddress", { length: 64 }).notNull(),
    /** Pseudonymous customer number (RC-XXXX-XXXX-XXXX) — HMAC, no PII. */
    customerRef: varchar("customerRef", { length: 32 }),
    /** AES-GCM ciphertext of the XRPL seed, base64. Never plaintext. */
    ciphertext: text("ciphertext").notNull(),
    /** PBKDF2 salt, base64 (16 bytes). */
    salt: varchar("salt", { length: 64 }).notNull(),
    /** AES-GCM iv, base64 (12 bytes). */
    iv: varchar("iv", { length: 32 }).notNull(),
    kdf: varchar("kdf", { length: 32 }).notNull().default("PBKDF2-250000"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("wallet_keys_userId_unique").on(table.userId),
    uniqueIndex("wallet_keys_customerRef_unique").on(table.customerRef),
  ],
);

export type WalletKey = typeof walletKeys.$inferSelect;
export type InsertWalletKey = typeof walletKeys.$inferInsert;

export const WALLET_DELEGATION_STATUS = ["active", "revoked"] as const;

export const walletDelegationStatusEnum = pgEnum("wallet_delegation_status", WALLET_DELEGATION_STATUS);

export const walletDelegations = pgTable(
  "wallet_delegations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    walletId: varchar("walletId", { length: 64 }).notNull(),
    /** Wallets start 'revoked' — non-participating until the customer opts in. */
    status: walletDelegationStatusEnum("status")
      .notNull()
      .default("revoked"),
    delegateKeyId: varchar("delegateKeyId", { length: 64 }),
    grantedAt: timestamp("grantedAt"),
    revokedAt: timestamp("revokedAt"),
    /** On-ledger SetRegularKey tx — populated once the DC issuer exists. */
    grantTxHash: varchar("grantTxHash", { length: 128 }),
    revokeTxHash: varchar("revokeTxHash", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("wallet_delegations_userId_unique").on(table.userId)],
);

export type WalletDelegation = typeof walletDelegations.$inferSelect;
export type InsertWalletDelegation = typeof walletDelegations.$inferInsert;

/* ------------------------------------------------------------------------ */
/* Self-hosted KYC Phase 1 — Encrypted ID Vault                              */
/*                                                                           */
/* Holds the customer's legal identity payload (name/DOB/address/TIN) as a   */
/* single AES-256-GCM envelope (api/lib/identity/vaultCrypto.ts). Linked to  */
/* users ONLY via the pseudonymous customerRef (RC-…) — no userId column,    */
/* no display-name connection. The server key lives in IDENTITY_VAULT_KEY.   */
/* ------------------------------------------------------------------------ */

export const IDENTITY_VAULT_STATUS = ["unverified", "verified", "suspended"] as const;

export const identityVaultStatusEnum = pgEnum("identity_vault_status", IDENTITY_VAULT_STATUS);

export const identityVault = pgTable(
  "identity_vault",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Pseudonymous customer number — the ONLY link to wallet_keys/users. */
    customerRef: varchar("customerRef", { length: 32 }).notNull(),
    /** AES-256-GCM envelope JSON {iv,tag,data} (base64 fields). Never plaintext. */
    payload: text("payload").notNull(),
    status: identityVaultStatusEnum("status")
      .notNull()
      .default("unverified"),
    /** Optional retention deadline (legal-track decision; NULL = keep). */
    retentionUntil: timestamp("retentionUntil"),
    /**
     * KYC Phase 2b: set when the document-photo face matched a live
     * multi-frame selfie (YuNet+SFace, zero-retention). NULL = face not
     * verified. Only the timestamp is stored — never images or embeddings.
     */
    faceVerifiedAt: timestamp("faceVerifiedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("identity_vault_customerRef_unique").on(table.customerRef)],
);

export type IdentityVault = typeof identityVault.$inferSelect;
export type InsertIdentityVault = typeof identityVault.$inferInsert;

export const identityVaultAudit = pgTable(
  "identity_vault_audit",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerRef: varchar("customerRef", { length: 32 }).notNull(),
    /** UPSERT | EXPORT | PURGE | STATUS_CHANGE */
    action: varchar("action", { length: 32 }).notNull(),
    actorUserId: bigint("actorUserId", { mode: "number" }),
    meta: jsonb("meta"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("identity_vault_audit_ref_idx").on(table.customerRef)],
);

export type IdentityVaultAudit = typeof identityVaultAudit.$inferSelect;
export type InsertIdentityVaultAudit = typeof identityVaultAudit.$inferInsert;

/* ------------------------------------------------------------------------ */
/* Self-hosted KYC Phase 3 — Sanctions screening                             */
/*                                                                           */
/* sanctions_entries: cached watchlist rows (OFAC SDN/consolidated first).   */
/* sanctions_results: screening verdicts keyed by customerRef; stores only a  */
/* SHA-256 hash of the normalized query name — never plaintext PII at rest.  */
/* ------------------------------------------------------------------------ */

export const SANCTIONS_SOURCES = ["OFAC_SDN", "OFAC_CONS"] as const;

export const sanctionsSourceEnum = pgEnum("sanctions_source", SANCTIONS_SOURCES);

export const sanctionsEntries = pgTable(
  "sanctions_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: sanctionsSourceEnum("source").notNull(),
    /** Watchlist names are PUBLIC government data — plaintext is fine here. */
    primaryName: varchar("primaryName", { length: 255 }).notNull(),
    altNames: jsonb("altNames"),
    program: varchar("program", { length: 128 }),
    listUpdatedAt: timestamp("listUpdatedAt"),
    fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  },
  (table) => [index("sanctions_entries_name_idx").on(table.primaryName)],
);

export type SanctionsEntry = typeof sanctionsEntries.$inferSelect;
export type InsertSanctionsEntry = typeof sanctionsEntries.$inferInsert;

export const SANCTIONS_VERDICTS = ["CLEAR", "REVIEW", "MATCH"] as const;

export const sanctionsVerdictEnum = pgEnum("sanctions_verdict", SANCTIONS_VERDICTS);

export const sanctionsResults = pgTable(
  "sanctions_results",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerRef: varchar("customerRef", { length: 32 }).notNull(),
    /** SHA-256 hex of the normalized query name — PII-free at rest. */
    queryNameHash: varchar("queryNameHash", { length: 64 }).notNull(),
    matchedEntryId: bigint("matchedEntryId", { mode: "number" }),
    /** 0–100 match score. */
    score: integer("score").notNull().default(0),
    verdict: sanctionsVerdictEnum("verdict").notNull().default("CLEAR"),
    screenedAt: timestamp("screenedAt").defaultNow().notNull(),
  },
  (table) => [index("sanctions_results_ref_idx").on(table.customerRef)],
);

export type SanctionsResult = typeof sanctionsResults.$inferSelect;
export type InsertSanctionsResult = typeof sanctionsResults.$inferInsert;

/* ------------------------------------------------------------------------ */
/* Earn-DC engagement rewards (V70 Layer 2)                                  */
/*                                                                           */
/* Members EARN closed-loop Date-Coin for engagement (check-ins, identity    */
/* verification, …). Airline-miles model: promotional in-app credit issuance */
/* — not a sale (no price ratchet, no dc_sales row) and never redeemable.    */
/* UNIQUE(userId, eventType) makes one-time awards idempotent; repeatable    */
/* events (daily check-in) update lastAwardedAt on the same row.             */
/* ------------------------------------------------------------------------ */

export const walletEarnEvents = pgTable(
  "wallet_earn_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    /** 'daily_checkin' | 'identity_vault' | future event types. */
    eventType: varchar("eventType", { length: 48 }).notNull(),
    /** Coins awarded on the latest grant. */
    amount: integer("amount").notNull(),
    /** Repeatable events: last grant time (cooldown basis). */
    lastAwardedAt: timestamp("lastAwardedAt").defaultNow().notNull(),
    meta: jsonb("meta"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("wallet_earn_events_user_event_unique").on(table.userId, table.eventType),
  ],
);

export type WalletEarnEvent = typeof walletEarnEvents.$inferSelect;
export type InsertWalletEarnEvent = typeof walletEarnEvents.$inferInsert;

/* ------------------------------------------------------------------------ */
/* Bounty program v1 (V71) — referrals + payout ledger                       */
/*                                                                           */
/* Flat, one-time, single-level referral bounties (see                       */
/* resonance-bounty-program-v1.md). Verified conversion = referred member    */
/* subscribed + kept 30 days. Payouts are executed by the OWNER from his     */
/* self-custody wallet — this ledger records obligations + tx hashes; the    */
/* software never moves money.                                               */
/* ------------------------------------------------------------------------ */

export const REFERRAL_STATUSES = ["pending", "qualified", "void"] as const;

export const referralStatusEnum = pgEnum("referral_status", REFERRAL_STATUSES);

export const referralAttributions = pgTable(
  "referral_attributions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    referrerUserId: bigint("referrerUserId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    referredUserId: bigint("referredUserId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    /** 'claim' (new member entered a code) — v1 only source. */
    source: varchar("source", { length: 16 }).notNull().default("claim"),
    status: referralStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    qualifiedAt: timestamp("qualifiedAt"),
  },
  (table) => [
    uniqueIndex("referral_attributions_referred_unique").on(table.referredUserId),
    index("referral_attributions_referrer_idx").on(table.referrerUserId),
  ],
);

export type ReferralAttribution = typeof referralAttributions.$inferSelect;
export type InsertReferralAttribution = typeof referralAttributions.$inferInsert;

export const BOUNTY_STATUSES = [
  "pending",
  "qualified",
  "approved",
  "paid",
  "void",
  "clawedback",
] as const;

export const bountyStatusEnum = pgEnum("bounty_status", BOUNTY_STATUSES);

export const bountyObligations = pgTable(
  "bounty_obligations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** The member who EARNED the bounty. */
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    /** 'referral_conversion' | future types (merchant, event, …). */
    bountyType: varchar("bountyType", { length: 48 }).notNull(),
    amountUsdMicro: integer("amountUsdMicro").notNull(),
    status: bountyStatusEnum("status").notNull().default("pending"),
    /** Loose link to the source record (e.g. referral_attributions.id). */
    refType: varchar("refType", { length: 32 }),
    refId: bigint("refId", { mode: "number" }),
    meta: jsonb("meta"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    qualifiedAt: timestamp("qualifiedAt"),
    paidAt: timestamp("paidAt"),
    /** On-chain tx hash of the owner-executed payout (XRP), when paid. */
    paidTxHash: varchar("paidTxHash", { length: 128 }),
    /** Who recorded the payout (owner email/id). */
    paidBy: varchar("paidBy", { length: 128 }),
  },
  (table) => [index("bounty_obligations_user_idx").on(table.userId)],
);

export type BountyObligation = typeof bountyObligations.$inferSelect;
export type InsertBountyObligation = typeof bountyObligations.$inferInsert;

/**
 * V78 rewarded-ad game passes. One completed, server-verified ad watch grants
 * one community game (e.g. a Spades table). Passes are game ACCESS only —
 * never Date-Coin, never cash value, unrelated to the DC economy.
 */
export const adWatchSessions = pgTable(
  "ad_watch_sessions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    grantedAt: timestamp("grantedAt"),
  },
  (table) => [index("ad_watch_sessions_user_idx").on(table.userId)],
);

export type AdWatchSession = typeof adWatchSessions.$inferSelect;
export type InsertAdWatchSession = typeof adWatchSessions.$inferInsert;

export const gamePasses = pgTable(
  "game_passes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    /** 'ad' (rewarded watch) — v1 only source. */
    source: varchar("source", { length: 16 }).notNull().default("ad"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    consumedAt: timestamp("consumedAt"),
  },
  (table) => [index("game_passes_user_open_idx").on(table.userId, table.consumedAt)],
);

export type GamePass = typeof gamePasses.$inferSelect;
export type InsertGamePass = typeof gamePasses.$inferInsert;

// ── V93 Phase 0 — moderation foundations ──────────────────────────────
/* Tier A hard strikes (scam/fraud, harassment, fake identity) with read-time
   90-day decay, human-reviewed removal with appeal, and a full audit trail.
   Corroboration basis is mandatory on every strike — no single-signal strikes
   (community standards §5.4). varchar (not mysqlEnum) per V93 conventions. */

export const STRIKE_CATEGORIES = ["A1", "A2", "A3"] as const;
export const STRIKE_BASES = [
  "multi_report",
  "detector_human",
  "high_conf_plus",
] as const;

export const userStrikes = pgTable(
  "user_strikes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    /** 'A1' scam/fraud | 'A2' harassment/threats | 'A3' fake identity. */
    category: varchar("category", { length: 8 }).notNull(),
    /** The quoted rule key shown to the member. */
    ruleRef: varchar("ruleRef", { length: 64 }).notNull(),
    /** Corroboration basis — mandatory (§5.4). */
    basis: varchar("basis", { length: 24 }).notNull(),
    /** Comma-joined scam_signals/report IDs backing the strike. */
    signalRefs: varchar("signalRefs", { length: 255 }).notNull().default(""),
    /** The reviewing human (system strikes still store one, per §5.4). */
    issuedBy: bigint("issuedBy", { mode: "number" })
      .notNull()
      .references(() => users.id),
    acknowledgedAt: timestamp("acknowledgedAt"),
    issuedAt: timestamp("issuedAt").defaultNow().notNull(),
    /** issuedAt + 90 days, set by code. Decay is read-time: queries filter expiresAt > now. */
    expiresAt: timestamp("expiresAt").notNull(),
    voidedAt: timestamp("voidedAt"),
    voidReason: varchar("voidReason", { length: 255 }),
  },
  (table) => [
    index("user_strikes_user_active_idx").on(
      table.userId,
      table.voidedAt,
      table.expiresAt,
    ),
  ],
);

export type UserStrike = typeof userStrikes.$inferSelect;
export type InsertUserStrike = typeof userStrikes.$inferInsert;

export const APPEAL_STATUSES = [
  "open",
  "in_review",
  "upheld",
  "denied",
] as const;

export const removalAppeals = pgTable(
  "removal_appeals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    strikeId: bigint("strikeId", { mode: "number" })
      .notNull()
      .references(() => userStrikes.id),
    body: text("body").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("open"),
    reviewedBy: bigint("reviewedBy", { mode: "number" }).references(
      () => users.id,
    ),
    /** SLA: first human response ≤ 72h, decision ≤ 7d (agent alerts on breach). */
    firstResponseAt: timestamp("firstResponseAt"),
    decidedAt: timestamp("decidedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("removal_appeals_status_idx").on(table.status, table.createdAt),
  ],
);

export type RemovalAppeal = typeof removalAppeals.$inferSelect;
export type InsertRemovalAppeal = typeof removalAppeals.$inferInsert;

/** The audit trail for everything a moderator does. */
export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: bigint("actorId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    action: varchar("action", { length: 48 }).notNull(),
    targetUserId: bigint("targetUserId", { mode: "number" }).references(
      () => users.id,
    ),
    refs: varchar("refs", { length: 255 }).notNull().default(""),
    note: varchar("note", { length: 500 }).notNull().default(""),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("moderation_actions_target_idx").on(table.targetUserId, table.createdAt),
  ],
);

export type ModerationAction = typeof moderationActions.$inferSelect;
export type InsertModerationAction = typeof moderationActions.$inferInsert;

/**
 * V93-P1 Scam Shield. The detector stores pattern CLASSES and a score —
 * never message content (content already lives in `messages`; duplicating
 * it would double the privacy surface). Crypto/finance topic talk scores 0;
 * only extraction-ask combinations (P1-P5) produce rows here.
 */
export const SCAM_SIGNAL_DISPOSITIONS = [
  "none",
  "recipient_warning",
  "queued_review",
  "dismissed",
  "confirmed",
] as const;

export const scamSignals = pgTable(
  "scam_signals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Not an FK — conversations may purge; signals must survive for review. */
    conversationId: bigint("conversationId", { mode: "number" }).notNull(),
    senderId: bigint("senderId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    messageId: bigint("messageId", { mode: "number" })
      .notNull()
      .references(() => messages.id),
    /** Comma-joined pattern class IDs ('P1'..'P5') — the pattern, not the content. */
    patterns: varchar("patterns", { length: 64 }).notNull().default(""),
    score: integer("score").notNull().default(0),
    disposition: varchar("disposition", { length: 24 }).notNull().default("none"),
    reviewedBy: bigint("reviewedBy", { mode: "number" }).references(
      () => users.id,
    ),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("scam_signals_sender_idx").on(table.senderId, table.createdAt),
    index("scam_signals_conversation_idx").on(table.conversationId, table.createdAt),
  ],
);

export type ScamSignal = typeof scamSignals.$inferSelect;
export type InsertScamSignal = typeof scamSignals.$inferInsert;

/**
 * Recipient-side only. The sender is never joined to this row in any
 * user-facing query — the warned member sees a banner, the sender sees nothing.
 */
export const VICTIM_WARNING_LEVELS = ["standard", "elevated"] as const;

export const victimWarnings = pgTable(
  "victim_warnings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    signalId: bigint("signalId", { mode: "number" })
      .notNull()
      .references(() => scamSignals.id),
    recipientId: bigint("recipientId", { mode: "number" })
      .notNull()
      .references(() => users.id),
    conversationId: bigint("conversationId", { mode: "number" }).notNull(),
    level: varchar("level", { length: 16 }).notNull().default("standard"),
    shownAt: timestamp("shownAt").defaultNow().notNull(),
    acknowledgedAt: timestamp("acknowledgedAt"),
  },
  (table) => [
    index("victim_warnings_recipient_idx").on(table.recipientId, table.acknowledgedAt),
  ],
);

export type VictimWarning = typeof victimWarnings.$inferSelect;
export type InsertVictimWarning = typeof victimWarnings.$inferInsert;

/** Local mirror of the URLhaus blocklist + manual entries, read via an in-memory cache. */
export const BLOCKED_DOMAIN_SOURCES = ["urlhaus", "safe_browsing", "manual"] as const;

export const blockedDomains = pgTable("blocked_domains", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  source: varchar("source", { length: 24 }).notNull().default("manual"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BlockedDomain = typeof blockedDomains.$inferSelect;
export type InsertBlockedDomain = typeof blockedDomains.$inferInsert;
