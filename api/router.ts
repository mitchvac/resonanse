import { authRouter } from "./auth-router";
import { chatRouter } from "./chatRouter";
import { discoverRouter } from "./discoverRouter";
import { eventsRouter } from "./eventsRouter";
import { likesRouter } from "./likesRouter";
import { matchesRouter } from "./matchesRouter";
import { passwordAuthRouter } from "./passwordAuthRouter";
import { premiumRouter } from "./premiumRouter";
import { profileRouter } from "./profileRouter";
import { safetyRouter } from "./safetyRouter";
import { videoCallRouter } from "./videoCallRouter";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  passwordAuth: passwordAuthRouter,

  profile: profileRouter,
  discover: discoverRouter,
  likes: likesRouter,
  matches: matchesRouter,
  chat: chatRouter,
  events: eventsRouter,
  premium: premiumRouter,
  safety: safetyRouter,
  videoCall: videoCallRouter,
});

export type AppRouter = typeof appRouter;
