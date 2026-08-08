import { sql } from "drizzle-orm";
import {
  mysqlTable,
  mysqlEnum,
  serial,
  bigint,
  int,
  double,
  boolean,
  json,
  longtext,
  mediumtext,
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

/**
 * Single-use password reset tokens. Only the sha256 of the token is stored —
 * the raw token lives solely in the emailed link.
 */
export const passwordResetTokens = mysqlTable(
  "passwordResetTokens",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
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
    /** Chosen events area (registry slug or custom city). Null = all areas. */
    eventArea: varchar("eventArea", { length: 120 }),
    relationshipGoal: mysqlEnum("relationshipGoal", RELATIONSHIP_GOALS)
      .notNull()
      .default("explore"),
    relationshipStatus: varchar("relationshipStatus", { length: 60 }),
    prompts: json("prompts").$type<ProfilePrompt[]>(),
    desires: json("desires").$type<string[]>(),
    lifestyle: json("lifestyle").$type<ProfileLifestyle>(),
    photos: json("photos").$type<string[]>(),
    voiceNoteUrl: mediumtext("voiceNoteUrl"),
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
    // Discovery preferences
    showMe: json("showMe").$type<string[]>(),
    openTo: json("openTo").$type<string[]>(),
    showIntent: boolean("showIntent").notNull().default(true),
    /** Consent-gated/kink tags — NEVER exposed in public profile views. */
    privateDesires: json("privateDesires").$type<string[]>(),
    /** Non-monogamy constellation — private, never public. */
    constellation:
      json("constellation").$type<
        Array<{ handle: string; name: string; photo: string; status: string }>
      >(),
    /** Private reflection ratings (1–5) — never public. */
    reflections: json("reflections").$type<number[]>(),
    weeklyGoal: int("weeklyGoal").notNull().default(1),
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
    check("prompts", sql`json_valid(\`prompts\`)`),
    check("desires", sql`json_valid(\`desires\`)`),
    check("lifestyle", sql`json_valid(\`lifestyle\`)`),
    check("photos", sql`json_valid(\`photos\`)`),
    check("hiddenWords", sql`json_valid(\`hiddenWords\`)`),
    check("showMe", sql`json_valid(\`showMe\`)`),
    check("openTo", sql`json_valid(\`openTo\`)`),
    check("privateDesires", sql`json_valid(\`privateDesires\`)`),
    check("constellation", sql`json_valid(\`constellation\`)`),
    check("reflections", sql`json_valid(\`reflections\`)`),
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
    kind: mysqlEnum("kind", ["like", "pulse", "flower"]).notNull().default("like"),
    comment: text("comment"),
    targetType: mysqlEnum("targetType", ["profile", "prompt", "photo"])
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
      "event_invite",
    ])
      .notNull()
      .default("text"),
    content: text("content").notNull(),
    meta: json("meta").$type<DateIdeaMeta | Record<string, unknown>>(),
    /** Ephemeral conversations stamp this — rows expire 24h after send. */
    expiresAt: timestamp("expiresAt"),
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
  address: varchar("address", { length: 255 }),
  lat: double("lat"),
  lng: double("lng"),
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
    kind: mysqlEnum("kind", ["we_met", "match_quality", "date_feedback", "event"])
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


// ── Smart Custody Wallet / Date-Coin ─────────────────────────────────
// Date-Coin is an internal utility token. Real crypto (XRP/RLUSD/BTC) is
// NEVER custodied — it is verified watch-only on-chain. All price math uses
// INTEGER micro-USD units (0.10 USD = 100000, the +0.005 increment = 5000).

export const dcWallets = mysqlTable(
  "dc_wallets",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
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

export const dcLedger = mysqlTable("dc_ledger", {
  walletId: varchar("walletId", { length: 64 }).primaryKey(),
  balance: int("balance").notNull().default(0),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type DcLedgerRow = typeof dcLedger.$inferSelect;
export type InsertDcLedgerRow = typeof dcLedger.$inferInsert;

/** System-wide up-only price — a single singleton row with id = 1. */
export const dcPriceState = mysqlTable("dc_price_state", {
  id: int("id").primaryKey(),
  currentPriceMicro: int("currentPriceMicro").notNull(),
  totalSalesCount: int("totalSalesCount").notNull().default(0),
  lastSaleAt: timestamp("lastSaleAt"),
});

export type DcPriceStateRow = typeof dcPriceState.$inferSelect;
export type InsertDcPriceStateRow = typeof dcPriceState.$inferInsert;

export const DC_PAID_WITH = ["XRP", "RLUSD", "BTC"] as const;

export const dcSales = mysqlTable(
  "dc_sales",
  {
    id: serial("id").primaryKey(),
    saleId: varchar("saleId", { length: 64 }).notNull(),
    buyerWalletId: varchar("buyerWalletId", { length: 64 }).notNull(),
    /** Supplier walletId, or the literal 'PLATFORM' for platform top-up sales. */
    sellerWalletId: varchar("sellerWalletId", { length: 64 }).notNull(),
    amount: int("amount").notNull(),
    pricePerCoinMicro: int("pricePerCoinMicro").notNull(),
    /** Exact fiat/crypto total paid, stored as text to avoid float drift. */
    totalPaidText: varchar("totalPaidText", { length: 64 }).notNull(),
    paidWith: mysqlEnum("paidWith", DC_PAID_WITH).notNull(),
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

/**
 * Supplier reward OBLIGATIONS. The platform pays XRP from its own treasury
 * (6% bonus). Because the platform holds no keys, these are recorded as
 * 'pending' obligations and are NEVER broadcast on-chain by the server.
 */
export const dcRewards = mysqlTable(
  "dc_rewards",
  {
    id: serial("id").primaryKey(),
    supplierWalletId: varchar("supplierWalletId", { length: 64 }).notNull(),
    saleId: varchar("saleId", { length: 64 }).notNull(),
    amountXrpText: varchar("amountXrpText", { length: 64 }).notNull(),
    status: mysqlEnum("status", DC_REWARD_STATUS).notNull().default("pending"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("dc_rewards_supplier_idx").on(table.supplierWalletId)],
);

export type DcReward = typeof dcRewards.$inferSelect;
export type InsertDcReward = typeof dcRewards.$inferInsert;

/** Append-only audit trail for every wallet action. */
export const dcAudit = mysqlTable(
  "dc_audit",
  {
    id: serial("id").primaryKey(),
    actor: varchar("actor", { length: 128 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    detail: json("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  () => [check("detail", sql`json_valid(\`detail\`)`)],
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

/** Watch-only crypto payment intents — server verifies on-chain, never trusts the client. */
export const dcCryptoIntents = mysqlTable(
  "dc_crypto_intents",
  {
    id: serial("id").primaryKey(),
    intentId: varchar("intentId", { length: 64 }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    purpose: mysqlEnum("purpose", DC_INTENT_PURPOSE).notNull(),
    asset: mysqlEnum("asset", DC_PAID_WITH).notNull(),
    address: varchar("address", { length: 128 }).notNull(),
    /** Destination tag (XRP/RLUSD). NULL for BTC (matched by exact amount). */
    memoOrTag: varchar("memoOrTag", { length: 64 }),
    /** Exact on-chain amount expected, as a decimal string. */
    expectedAmountText: varchar("expectedAmountText", { length: 64 }).notNull(),
    quotedUsdMicro: int("quotedUsdMicro").notNull(),
    status: mysqlEnum("status", DC_INTENT_STATUS).notNull().default("pending"),
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

export const walletKeys = mysqlTable(
  "wallet_keys",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    walletId: varchar("walletId", { length: 64 }).notNull(),
    /** Classic XRPL address (r…) — public, safe to store plaintext. */
    xrplAddress: varchar("xrplAddress", { length: 64 }).notNull(),
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
  (table) => [uniqueIndex("wallet_keys_userId_unique").on(table.userId)],
);

export type WalletKey = typeof walletKeys.$inferSelect;
export type InsertWalletKey = typeof walletKeys.$inferInsert;

export const WALLET_DELEGATION_STATUS = ["active", "revoked"] as const;

export const walletDelegations = mysqlTable(
  "wallet_delegations",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    walletId: varchar("walletId", { length: 64 }).notNull(),
    /** Wallets start 'revoked' — non-participating until the customer opts in. */
    status: mysqlEnum("status", WALLET_DELEGATION_STATUS)
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
