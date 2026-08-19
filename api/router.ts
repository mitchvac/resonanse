import { authRouter } from "./auth-router";
import { adsRouter } from "./adsRouter";
import { bountyRouter } from "./bountyRouter";
import { chatRouter } from "./chatRouter";
import { discoverRouter } from "./discoverRouter";
import { eventsRouter } from "./eventsRouter";
import { identityVaultRouter } from "./identityVaultRouter";
import { kalshiRouter } from "./kalshiRouter";
import { kycRouter } from "./kycRouter";
import { likesRouter } from "./likesRouter";
import { matchesRouter } from "./matchesRouter";
import { passwordAuthRouter } from "./passwordAuthRouter";
import { premiumRouter } from "./premiumRouter";
import { profileRouter } from "./profileRouter";
import { safetyRouter } from "./safetyRouter";
import { moderationRouter } from "./moderationRouter";
import { sanctionsRouter } from "./sanctionsRouter";
import { translateRouter } from "./translateRouter";
import { videoCallRouter } from "./videoCallRouter";
import { voiceRouter } from "./voiceRouter";
import { scamShieldRouter } from "./scamShieldRouter";
import { walletRouter } from "./walletRouter";
import { walletEarnRouter } from "./walletEarnRouter";
import { walletSecurityRouter } from "./walletSecurityRouter";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  passwordAuth: passwordAuthRouter,
  ads: adsRouter,
  bounty: bountyRouter,

  profile: profileRouter,
  discover: discoverRouter,
  likes: likesRouter,
  matches: matchesRouter,
  chat: chatRouter,
  events: eventsRouter,
  premium: premiumRouter,
  safety: safetyRouter,
  moderation: moderationRouter,
  translate: translateRouter,
  videoCall: videoCallRouter,
  voice: voiceRouter,
  scamShield: scamShieldRouter,
  wallet: walletRouter,
  walletEarn: walletEarnRouter,
  walletSecurity: walletSecurityRouter,
  identityVault: identityVaultRouter,
  kalshi: kalshiRouter,
  kyc: kycRouter,
  sanctions: sanctionsRouter,
});

export type AppRouter = typeof appRouter;
