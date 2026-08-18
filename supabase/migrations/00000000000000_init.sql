CREATE TYPE "public"."bounty_status" AS ENUM('pending', 'qualified', 'approved', 'paid', 'void', 'clawedback');--> statement-breakpoint
CREATE TYPE "public"."call_status" AS ENUM('ringing', 'active', 'declined', 'ended', 'missed');--> statement-breakpoint
CREATE TYPE "public"."dc_intent_purpose" AS ENUM('SUBSCRIPTION_PLUS', 'SUBSCRIPTION_X', 'TOP_UP');--> statement-breakpoint
CREATE TYPE "public"."dc_intent_status" AS ENUM('pending', 'confirmed', 'underpaid', 'expired');--> statement-breakpoint
CREATE TYPE "public"."dc_paid_with" AS ENUM('XRP', 'RLUSD', 'BTC', 'XLM');--> statement-breakpoint
CREATE TYPE "public"."dc_reward_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TYPE "public"."event_category" AS ENUM('mixer', 'active', 'creative', 'food', 'culture', 'nightlife');--> statement-breakpoint
CREATE TYPE "public"."feedback_kind" AS ENUM('we_met', 'match_quality', 'date_feedback', 'event');--> statement-breakpoint
CREATE TYPE "public"."identity_vault_status" AS ENUM('unverified', 'verified', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."like_kind" AS ENUM('like', 'pulse', 'flower', 'wave', 'kiss');--> statement-breakpoint
CREATE TYPE "public"."like_target_type" AS ENUM('profile', 'prompt', 'photo');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('text', 'ai_starter', 'date_idea', 'system', 'video_note', 'event_invite');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('pending', 'qualified', 'void');--> statement-breakpoint
CREATE TYPE "public"."relationship_goal" AS ENUM('serious', 'casual', 'explore', 'enm', 'friendship');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('going', 'interested');--> statement-breakpoint
CREATE TYPE "public"."sanctions_source" AS ENUM('OFAC_SDN', 'OFAC_CONS');--> statement-breakpoint
CREATE TYPE "public"."sanctions_verdict" AS ENUM('CLEAR', 'REVIEW', 'MATCH');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('free', 'plus', 'x');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'pending', 'verified');--> statement-breakpoint
CREATE TYPE "public"."wallet_delegation_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."we_met" AS ENUM('none', 'met', 'dated');--> statement-breakpoint
CREATE TABLE "ad_watch_sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"grantedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "blocked_domains" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"domain" varchar(255) NOT NULL,
	"source" varchar(24) DEFAULT 'manual' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"blockerId" bigint NOT NULL,
	"blockedId" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bounty_obligations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"bountyType" varchar(48) NOT NULL,
	"amountUsdMicro" integer NOT NULL,
	"status" "bounty_status" DEFAULT 'pending' NOT NULL,
	"refType" varchar(32),
	"refId" bigint,
	"meta" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"qualifiedAt" timestamp,
	"paidAt" timestamp,
	"paidTxHash" varchar(128),
	"paidBy" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "callSessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversationId" bigint NOT NULL,
	"callerId" bigint NOT NULL,
	"calleeId" bigint NOT NULL,
	"status" "call_status" DEFAULT 'ringing' NOT NULL,
	"answeredAt" timestamp,
	"endedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "callSignals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sessionId" bigint NOT NULL,
	"fromUserId" bigint NOT NULL,
	"payload" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"matchId" bigint NOT NULL,
	"ephemeral" boolean DEFAULT false NOT NULL,
	"archivedAt" timestamp,
	"mutedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dc_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor" varchar(128) NOT NULL,
	"action" varchar(64) NOT NULL,
	"detail" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dc_crypto_intents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"intentId" varchar(64) NOT NULL,
	"userId" bigint NOT NULL,
	"purpose" "dc_intent_purpose" NOT NULL,
	"asset" "dc_paid_with" NOT NULL,
	"address" varchar(128) NOT NULL,
	"memoOrTag" varchar(64),
	"expectedAmountText" varchar(64) NOT NULL,
	"quotedUsdMicro" integer NOT NULL,
	"status" "dc_intent_status" DEFAULT 'pending' NOT NULL,
	"txHash" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"confirmedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "dc_ledger" (
	"walletId" varchar(64) PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dc_price_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"currentPriceMicro" integer NOT NULL,
	"totalSalesCount" integer DEFAULT 0 NOT NULL,
	"lastSaleAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "dc_rewards" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"supplierWalletId" varchar(64) NOT NULL,
	"saleId" varchar(64) NOT NULL,
	"amountXrpText" varchar(64) NOT NULL,
	"status" "dc_reward_status" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dc_sales" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"saleId" varchar(64) NOT NULL,
	"buyerWalletId" varchar(64) NOT NULL,
	"sellerWalletId" varchar(64) NOT NULL,
	"amount" integer NOT NULL,
	"pricePerCoinMicro" integer NOT NULL,
	"totalPaidText" varchar(64) NOT NULL,
	"paidWith" "dc_paid_with" NOT NULL,
	"cryptoIntentId" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dc_wallets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"walletId" varchar(64) NOT NULL,
	"switchOn" boolean DEFAULT true NOT NULL,
	"authorityGrantedAt" timestamp DEFAULT now() NOT NULL,
	"isOriginalHundredK" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"tier" "tier" DEFAULT 'free' NOT NULL,
	"pulses" integer DEFAULT 3 NOT NULL,
	"boosts" integer DEFAULT 0 NOT NULL,
	"dailyLikeLimit" integer DEFAULT 5 NOT NULL,
	"trialStartedAt" timestamp,
	"trialEndsAt" timestamp,
	"renewedAt" timestamp,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventRsvps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"eventId" bigint NOT NULL,
	"userId" bigint NOT NULL,
	"status" "rsvp_status" DEFAULT 'going' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"title" varchar(160) NOT NULL,
	"category" "event_category" NOT NULL,
	"description" text,
	"image" varchar(255),
	"city" varchar(120),
	"venue" varchar(160),
	"address" varchar(255),
	"lat" double precision,
	"lng" double precision,
	"startsAt" timestamp NOT NULL,
	"capacity" integer DEFAULT 20 NOT NULL,
	"hostName" varchar(120),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"matchId" bigint,
	"kind" "feedback_kind" NOT NULL,
	"rating" integer,
	"note" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_passes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"source" varchar(16) DEFAULT 'ad' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"consumedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "identity_vault" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"customerRef" varchar(32) NOT NULL,
	"payload" text NOT NULL,
	"status" "identity_vault_status" DEFAULT 'unverified' NOT NULL,
	"retentionUntil" timestamp,
	"faceVerifiedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_vault_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"customerRef" varchar(32) NOT NULL,
	"action" varchar(32) NOT NULL,
	"actorUserId" bigint,
	"meta" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fromUserId" bigint NOT NULL,
	"toProfileId" bigint NOT NULL,
	"kind" "like_kind" DEFAULT 'like' NOT NULL,
	"comment" text,
	"targetType" "like_target_type" DEFAULT 'profile' NOT NULL,
	"targetRef" varchar(255),
	"dismissedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userAId" bigint NOT NULL,
	"userBId" bigint NOT NULL,
	"weMet" "we_met" DEFAULT 'none' NOT NULL,
	"videoVerifiedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversationId" bigint NOT NULL,
	"senderId" bigint NOT NULL,
	"kind" "message_kind" DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"meta" jsonb,
	"expiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actorId" bigint NOT NULL,
	"action" varchar(48) NOT NULL,
	"targetUserId" bigint,
	"refs" varchar(255) DEFAULT '' NOT NULL,
	"note" varchar(500) DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fromUserId" bigint NOT NULL,
	"toProfileId" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passwordCredentials" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"email" varchar(320) NOT NULL,
	"passwordHash" varchar(512) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passwordResetTokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"tokenHash" varchar(128) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"usedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"displayName" varchar(80) NOT NULL,
	"age" integer NOT NULL,
	"gender" varchar(60),
	"pronouns" varchar(60),
	"bio" text,
	"city" varchar(120),
	"eventArea" varchar(120),
	"relationshipGoal" "relationship_goal" DEFAULT 'explore' NOT NULL,
	"relationshipStatus" varchar(60),
	"prompts" jsonb,
	"desires" jsonb,
	"lifestyle" jsonb,
	"photos" jsonb,
	"voiceNoteUrl" text,
	"heightCm" integer,
	"education" varchar(120),
	"politics" varchar(60),
	"familyPlans" varchar(60),
	"verified" boolean DEFAULT false NOT NULL,
	"idVerifiedAt" timestamp,
	"idDocType" varchar(32),
	"verificationStatus" "verification_status" DEFAULT 'unverified' NOT NULL,
	"onboardingComplete" boolean DEFAULT false NOT NULL,
	"anonymityMode" boolean DEFAULT false NOT NULL,
	"hiddenWords" jsonb,
	"isSeed" boolean DEFAULT false NOT NULL,
	"showMe" jsonb,
	"openTo" jsonb,
	"showIntent" boolean DEFAULT true NOT NULL,
	"privateDesires" jsonb,
	"constellation" jsonb,
	"reflections" jsonb,
	"weeklyGoal" integer DEFAULT 1 NOT NULL,
	"pausedAt" timestamp,
	"ephemeralDefault" boolean DEFAULT false NOT NULL,
	"likesSeededAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_attributions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"referrerUserId" bigint NOT NULL,
	"referredUserId" bigint NOT NULL,
	"source" varchar(16) DEFAULT 'claim' NOT NULL,
	"status" "referral_status" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"qualifiedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "removal_appeals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"strikeId" bigint NOT NULL,
	"body" text NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"reviewedBy" bigint,
	"firstResponseAt" timestamp,
	"decidedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"reporterId" bigint NOT NULL,
	"targetUserId" bigint NOT NULL,
	"reason" varchar(60) NOT NULL,
	"detail" text,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"dedupGroup" varchar(64),
	"reviewedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanctions_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" "sanctions_source" NOT NULL,
	"primaryName" varchar(255) NOT NULL,
	"altNames" jsonb,
	"program" varchar(128),
	"listUpdatedAt" timestamp,
	"fetchedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanctions_results" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"customerRef" varchar(32) NOT NULL,
	"queryNameHash" varchar(64) NOT NULL,
	"matchedEntryId" bigint,
	"score" integer DEFAULT 0 NOT NULL,
	"verdict" "sanctions_verdict" DEFAULT 'CLEAR' NOT NULL,
	"screenedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scam_signals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversationId" bigint NOT NULL,
	"senderId" bigint NOT NULL,
	"messageId" bigint NOT NULL,
	"patterns" varchar(64) DEFAULT '' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"disposition" varchar(24) DEFAULT 'none' NOT NULL,
	"reviewedBy" bigint,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_strikes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"category" varchar(8) NOT NULL,
	"ruleRef" varchar(64) NOT NULL,
	"basis" varchar(24) NOT NULL,
	"signalRefs" varchar(255) DEFAULT '' NOT NULL,
	"issuedBy" bigint NOT NULL,
	"acknowledgedAt" timestamp,
	"issuedAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"voidedAt" timestamp,
	"voidReason" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"unionId" varchar(255) NOT NULL,
	"name" varchar(255),
	"email" varchar(320),
	"avatar" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignInAt" timestamp DEFAULT now() NOT NULL,
	"removedAt" timestamp,
	"removalStrikeId" bigint,
	CONSTRAINT "users_unionId_unique" UNIQUE("unionId")
);
--> statement-breakpoint
CREATE TABLE "victim_warnings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"signalId" bigint NOT NULL,
	"recipientId" bigint NOT NULL,
	"conversationId" bigint NOT NULL,
	"level" varchar(16) DEFAULT 'standard' NOT NULL,
	"shownAt" timestamp DEFAULT now() NOT NULL,
	"acknowledgedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "videoNotes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversationId" bigint NOT NULL,
	"senderId" bigint NOT NULL,
	"data" text NOT NULL,
	"durationSec" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_delegations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"walletId" varchar(64) NOT NULL,
	"status" "wallet_delegation_status" DEFAULT 'revoked' NOT NULL,
	"delegateKeyId" varchar(64),
	"grantedAt" timestamp,
	"revokedAt" timestamp,
	"grantTxHash" varchar(128),
	"revokeTxHash" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_earn_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"eventType" varchar(48) NOT NULL,
	"amount" integer NOT NULL,
	"lastAwardedAt" timestamp DEFAULT now() NOT NULL,
	"meta" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_keys" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint NOT NULL,
	"walletId" varchar(64) NOT NULL,
	"xrplAddress" varchar(64) NOT NULL,
	"customerRef" varchar(32),
	"ciphertext" text NOT NULL,
	"salt" varchar(64) NOT NULL,
	"iv" varchar(32) NOT NULL,
	"kdf" varchar(32) DEFAULT 'PBKDF2-250000' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_watch_sessions" ADD CONSTRAINT "ad_watch_sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockerId_users_id_fk" FOREIGN KEY ("blockerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockedId_users_id_fk" FOREIGN KEY ("blockedId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounty_obligations" ADD CONSTRAINT "bounty_obligations_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callSessions" ADD CONSTRAINT "callSessions_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callSessions" ADD CONSTRAINT "callSessions_callerId_users_id_fk" FOREIGN KEY ("callerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callSessions" ADD CONSTRAINT "callSessions_calleeId_users_id_fk" FOREIGN KEY ("calleeId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callSignals" ADD CONSTRAINT "callSignals_sessionId_callSessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."callSessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callSignals" ADD CONSTRAINT "callSignals_fromUserId_users_id_fk" FOREIGN KEY ("fromUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_matchId_matches_id_fk" FOREIGN KEY ("matchId") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dc_crypto_intents" ADD CONSTRAINT "dc_crypto_intents_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dc_wallets" ADD CONSTRAINT "dc_wallets_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventRsvps" ADD CONSTRAINT "eventRsvps_eventId_events_id_fk" FOREIGN KEY ("eventId") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventRsvps" ADD CONSTRAINT "eventRsvps_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_matchId_matches_id_fk" FOREIGN KEY ("matchId") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_passes" ADD CONSTRAINT "game_passes_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_fromUserId_users_id_fk" FOREIGN KEY ("fromUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_toProfileId_profiles_id_fk" FOREIGN KEY ("toProfileId") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_userAId_users_id_fk" FOREIGN KEY ("userAId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_userBId_users_id_fk" FOREIGN KEY ("userBId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_users_id_fk" FOREIGN KEY ("senderId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_targetUserId_users_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_fromUserId_users_id_fk" FOREIGN KEY ("fromUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_toProfileId_profiles_id_fk" FOREIGN KEY ("toProfileId") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passwordCredentials" ADD CONSTRAINT "passwordCredentials_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passwordResetTokens" ADD CONSTRAINT "passwordResetTokens_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referrerUserId_users_id_fk" FOREIGN KEY ("referrerUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referredUserId_users_id_fk" FOREIGN KEY ("referredUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "removal_appeals" ADD CONSTRAINT "removal_appeals_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "removal_appeals" ADD CONSTRAINT "removal_appeals_strikeId_user_strikes_id_fk" FOREIGN KEY ("strikeId") REFERENCES "public"."user_strikes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "removal_appeals" ADD CONSTRAINT "removal_appeals_reviewedBy_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_users_id_fk" FOREIGN KEY ("reporterId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_targetUserId_users_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scam_signals" ADD CONSTRAINT "scam_signals_senderId_users_id_fk" FOREIGN KEY ("senderId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scam_signals" ADD CONSTRAINT "scam_signals_messageId_messages_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scam_signals" ADD CONSTRAINT "scam_signals_reviewedBy_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_strikes" ADD CONSTRAINT "user_strikes_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_strikes" ADD CONSTRAINT "user_strikes_issuedBy_users_id_fk" FOREIGN KEY ("issuedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "victim_warnings" ADD CONSTRAINT "victim_warnings_signalId_scam_signals_id_fk" FOREIGN KEY ("signalId") REFERENCES "public"."scam_signals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "victim_warnings" ADD CONSTRAINT "victim_warnings_recipientId_users_id_fk" FOREIGN KEY ("recipientId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videoNotes" ADD CONSTRAINT "videoNotes_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videoNotes" ADD CONSTRAINT "videoNotes_senderId_users_id_fk" FOREIGN KEY ("senderId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_delegations" ADD CONSTRAINT "wallet_delegations_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_earn_events" ADD CONSTRAINT "wallet_earn_events_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_keys" ADD CONSTRAINT "wallet_keys_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_watch_sessions_user_idx" ON "ad_watch_sessions" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "blocks_pair_unique" ON "blocks" USING btree ("blockerId","blockedId");--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" USING btree ("blockedId");--> statement-breakpoint
CREATE INDEX "bounty_obligations_user_idx" ON "bounty_obligations" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "callSessions_callee_status_idx" ON "callSessions" USING btree ("calleeId","status");--> statement-breakpoint
CREATE INDEX "callSessions_conversation_idx" ON "callSessions" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "callSignals_session_id_idx" ON "callSignals" USING btree ("sessionId","id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_match_unique" ON "conversations" USING btree ("matchId");--> statement-breakpoint
CREATE UNIQUE INDEX "dc_crypto_intents_intentId_unique" ON "dc_crypto_intents" USING btree ("intentId");--> statement-breakpoint
CREATE INDEX "dc_crypto_intents_user_idx" ON "dc_crypto_intents" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "dc_rewards_supplier_idx" ON "dc_rewards" USING btree ("supplierWalletId");--> statement-breakpoint
CREATE UNIQUE INDEX "dc_sales_saleId_unique" ON "dc_sales" USING btree ("saleId");--> statement-breakpoint
CREATE INDEX "dc_sales_buyer_idx" ON "dc_sales" USING btree ("buyerWalletId","id");--> statement-breakpoint
CREATE INDEX "dc_sales_seller_idx" ON "dc_sales" USING btree ("sellerWalletId","id");--> statement-breakpoint
CREATE UNIQUE INDEX "dc_wallets_userId_unique" ON "dc_wallets" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "dc_wallets_walletId_unique" ON "dc_wallets" USING btree ("walletId");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_user_unique" ON "entitlements" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "eventRsvps_event_user_unique" ON "eventRsvps" USING btree ("eventId","userId");--> statement-breakpoint
CREATE INDEX "eventRsvps_user_idx" ON "eventRsvps" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "feedback_match_idx" ON "feedback" USING btree ("matchId");--> statement-breakpoint
CREATE INDEX "game_passes_user_open_idx" ON "game_passes" USING btree ("userId","consumedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_vault_customerRef_unique" ON "identity_vault" USING btree ("customerRef");--> statement-breakpoint
CREATE INDEX "identity_vault_audit_ref_idx" ON "identity_vault_audit" USING btree ("customerRef");--> statement-breakpoint
CREATE UNIQUE INDEX "likes_from_to_unique" ON "likes" USING btree ("fromUserId","toProfileId");--> statement-breakpoint
CREATE INDEX "likes_toProfile_idx" ON "likes" USING btree ("toProfileId");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_pair_unique" ON "matches" USING btree ("userAId","userBId");--> statement-breakpoint
CREATE INDEX "matches_userB_idx" ON "matches" USING btree ("userBId");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "moderation_actions_target_idx" ON "moderation_actions" USING btree ("targetUserId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "passes_from_to_unique" ON "passes" USING btree ("fromUserId","toProfileId");--> statement-breakpoint
CREATE UNIQUE INDEX "passwordCredentials_userId_unique" ON "passwordCredentials" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "passwordCredentials_email_unique" ON "passwordCredentials" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "passwordResetTokens_tokenHash_unique" ON "passwordResetTokens" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX "passwordResetTokens_userId_idx" ON "passwordResetTokens" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_userId_unique" ON "profiles" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "profiles_seed_idx" ON "profiles" USING btree ("isSeed");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_attributions_referred_unique" ON "referral_attributions" USING btree ("referredUserId");--> statement-breakpoint
CREATE INDEX "referral_attributions_referrer_idx" ON "referral_attributions" USING btree ("referrerUserId");--> statement-breakpoint
CREATE INDEX "removal_appeals_status_idx" ON "removal_appeals" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("targetUserId");--> statement-breakpoint
CREATE INDEX "sanctions_entries_name_idx" ON "sanctions_entries" USING btree ("primaryName");--> statement-breakpoint
CREATE INDEX "sanctions_results_ref_idx" ON "sanctions_results" USING btree ("customerRef");--> statement-breakpoint
CREATE INDEX "scam_signals_sender_idx" ON "scam_signals" USING btree ("senderId","createdAt");--> statement-breakpoint
CREATE INDEX "scam_signals_conversation_idx" ON "scam_signals" USING btree ("conversationId","createdAt");--> statement-breakpoint
CREATE INDEX "user_strikes_user_active_idx" ON "user_strikes" USING btree ("userId","voidedAt","expiresAt");--> statement-breakpoint
CREATE INDEX "victim_warnings_recipient_idx" ON "victim_warnings" USING btree ("recipientId","acknowledgedAt");--> statement-breakpoint
CREATE INDEX "videoNotes_conversation_idx" ON "videoNotes" USING btree ("conversationId");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_delegations_userId_unique" ON "wallet_delegations" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_earn_events_user_event_unique" ON "wallet_earn_events" USING btree ("userId","eventType");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_keys_userId_unique" ON "wallet_keys" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_keys_customerRef_unique" ON "wallet_keys" USING btree ("customerRef");