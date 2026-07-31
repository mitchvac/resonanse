import { authRouter } from "./auth-router";
import { chatRouter } from "./chatRouter";
import { discoverRouter } from "./discoverRouter";
import { eventsRouter } from "./eventsRouter";
import { likesRouter } from "./likesRouter";
import { matchesRouter } from "./matchesRouter";
import { premiumRouter } from "./premiumRouter";
import { profileRouter } from "./profileRouter";
import { safetyRouter } from "./safetyRouter";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,

  profile: profileRouter,
  discover: discoverRouter,
  likes: likesRouter,
  matches: matchesRouter,
  chat: chatRouter,
  events: eventsRouter,
  premium: premiumRouter,
  safety: safetyRouter,
});

export type AppRouter = typeof appRouter;
