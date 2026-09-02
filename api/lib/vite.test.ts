import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serveStaticFiles } from "./vite";

const HTML = { accept: "text/html,application/xhtml+xml" };
const JSON_ACCEPT = { accept: "application/json" };

describe("production static server", () => {
  let app: Hono<{ Bindings: HttpBindings }>;
  const cwd = process.cwd();

  beforeAll(() => {
    const root = mkdtempSync(path.join(tmpdir(), "resonanse-static-"));
    writeFileSync(path.join(root, "index.html"), "<!doctype html><title>shell</title>");
    writeFileSync(path.join(root, "robots.txt"), "User-agent: *\nAllow: /\n");
    mkdirSync(path.join(root, ".well-known"));
    writeFileSync(path.join(root, ".well-known/botcentral.txt"), "botcentral-verify=abc\n");
    process.chdir(root); // serveStatic resolves its root relative to cwd
    app = new Hono<{ Bindings: HttpBindings }>();
    app.get("/api/ping", (c) => c.json({ ok: true }));
    serveStaticFiles(app, { root });
  });
  afterAll(() => process.chdir(cwd));

  it("serves the shell with 200 for routes the SPA renders", async () => {
    for (const p of ["/", "/premium", "/chat/42", "/community/spades"]) {
      const res = await app.request(p, { headers: HTML });
      expect(res.status, p).toBe(200);
      expect(await res.text()).toContain("<title>shell</title>");
    }
  });

  it("returns a real 404 (still the shell) for removed or unknown pages", async () => {
    for (const p of ["/premiun", "/old-landing", "/premium/extra", "/chat"]) {
      const res = await app.request(p, { headers: HTML });
      expect(res.status, p).toBe(404);
      expect(await res.text()).toContain("<title>shell</title>");
    }
  });

  it("returns JSON 404 for non-HTML clients on unknown paths and SPA routes alike", async () => {
    const unknown = await app.request("/old-landing", { headers: JSON_ACCEPT });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "Not Found" });
    const spa = await app.request("/premium", { headers: JSON_ACCEPT });
    expect(spa.status).toBe(404);
  });

  it("keeps static files and API routes untouched", async () => {
    const robots = await app.request("/robots.txt", { headers: HTML });
    expect(robots.status).toBe(200);
    expect(await robots.text()).toContain("User-agent");
    const wk = await app.request("/.well-known/botcentral.txt", { headers: HTML });
    expect(wk.status).toBe(200);
    expect(await wk.text()).toContain("botcentral-verify=");
    const api = await app.request("/api/ping", { headers: JSON_ACCEPT });
    expect(api.status).toBe(200);
  });
});
