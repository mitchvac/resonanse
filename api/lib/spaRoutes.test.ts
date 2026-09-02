import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { SPA_ROUTES, isSpaRoute } from "@contracts/spaRoutes";

describe("SPA route allowlist", () => {
  it("mirrors every <Route path> in src/App.tsx (drift guard, both directions)", () => {
    const app = readFileSync(path.resolve(import.meta.dirname, "../../src/App.tsx"), "utf8");
    const inApp = [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((p) => p !== "*");
    expect(inApp.length).toBeGreaterThan(10);
    expect([...inApp].sort()).toEqual([...SPA_ROUTES].sort());
  });

  it("matches exact routes, param routes, and tolerates a trailing slash", () => {
    expect(isSpaRoute("/")).toBe(true);
    expect(isSpaRoute("/premium")).toBe(true);
    expect(isSpaRoute("/premium/")).toBe(true);
    expect(isSpaRoute("/chat/123")).toBe(true);
    expect(isSpaRoute("/community/chess")).toBe(true);
  });

  it("rejects removed, misspelled, nested, and empty-param paths", () => {
    expect(isSpaRoute("/premiun")).toBe(false);
    expect(isSpaRoute("/premium/extra")).toBe(false);
    expect(isSpaRoute("/chat")).toBe(false);
    expect(isSpaRoute("/chat/")).toBe(false);
    expect(isSpaRoute("/chat/1/2")).toBe(false);
    expect(isSpaRoute("/some-path")).toBe(false);
    expect(isSpaRoute("/api/anything")).toBe(false);
    expect(isSpaRoute("/%E0%A4%A")).toBe(false);
  });
});
