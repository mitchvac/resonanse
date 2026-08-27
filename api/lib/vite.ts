import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";

type App = Hono<{ Bindings: HttpBindings }>;

export function serveStaticFiles(app: App) {
  // boot.js lives in dist/. Vite writes the SPA + public/ files to dist/public.
  const distPath = path.resolve(import.meta.dirname, "public");
  const cwdPublic = path.resolve(process.cwd(), "dist/public");
  const root = fs.existsSync(path.join(distPath, "index.html"))
    ? distPath
    : cwdPublic;

  const sendPlain = (file: string, type: string) => {
    const full = path.join(root, file);
    return async (c: { req: { raw: Request }; body: (b: unknown, s?: number, h?: HeadersInit) => Response }) => {
      if (!fs.existsSync(full)) return c.body("Not Found", 404, { "content-type": "text/plain" });
      const body = fs.readFileSync(full);
      return c.body(body, 200, {
        "content-type": type,
        "cache-control": "public, max-age=300",
      });
    };
  };

  app.get("/llms.txt", sendPlain("llms.txt", "text/plain; charset=utf-8"));
  app.get("/robots.txt", sendPlain("robots.txt", "text/plain; charset=utf-8"));
  app.get("/sitemap.xml", sendPlain("sitemap.xml", "application/xml; charset=utf-8"));

  app.use("*", serveStatic({ root: path.relative(process.cwd(), root) || "." }));

  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    const indexPath = path.resolve(root, "index.html");
    const content = fs.readFileSync(indexPath, "utf-8");
    return c.html(content);
  });
}
