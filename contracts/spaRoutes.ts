/**
 * Client routes the SPA actually renders (mirror of the <Route path> list in
 * src/App.tsx — api/lib/spaRoutes.test.ts fails if the two drift).
 *
 * The production server serves index.html with 200 ONLY for these paths. Any
 * other path is a real 404 (still with the app shell for browsers, so the
 * client-side NotFound page renders), so removed or misspelled URLs stop
 * answering 200 to crawlers.
 */
export const SPA_ROUTES: readonly string[] = [
  "/",
  "/login",
  "/signin",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/cookies",
  "/guidelines",
  "/report",
  "/data",
  "/onboarding",
  "/profile-setup",
  "/discover",
  "/likes",
  "/matches",
  "/chat/:id",
  "/events",
  "/markets",
  "/community",
  "/community/concentration",
  "/community/spades",
  "/community/chess",
  "/community/liars-dice",
  "/premium",
  "/wallet",
  "/profile",
  "/settings",
];

function segments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function matches(pattern: string, pathname: string): boolean {
  const want = segments(pattern);
  const have = segments(pathname);
  if (want.length !== have.length) return false;
  return want.every((seg, i) =>
    seg.startsWith(":") ? have[i].length > 0 : seg === have[i],
  );
}

/** True when `pathname` (no query string) is a route the SPA renders. */
export function isSpaRoute(pathname: string): boolean {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  return SPA_ROUTES.some((pattern) => matches(pattern, path));
}
