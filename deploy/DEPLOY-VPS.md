# Deploy Resonance to your own VPS (Docker + nginx)

Target: `https://resonanse.app` on `144.91.66.158`
Container exposes **3000** · host binds **127.0.0.1:3019:3000** · nginx terminates TLS.

The app is fully containerized — the repo root `Dockerfile` builds frontend + backend
into one image that serves everything (API + static frontend) on port 3000.
**No design changes are needed or made** — the same source produces the same UI.

---

## 0. Prerequisites on the VPS

```bash
# Docker
curl -fsSL https://get.docker.com | sudo sh
# nginx + certbot
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
```

DNS: point both `resonanse.app` and `www.resonanse.app` A-records at `144.91.66.158`
before running certbot.

## 1. Get the source onto the VPS

Either upload the zip:

```bash
scp resonance-full-source.zip root@144.91.66.158:/opt/
ssh root@144.91.66.158
cd /opt && apt install -y unzip && unzip resonance-full-source.zip && mv resonance resonance-app && cd resonance-app
```

Or push to a private GitHub repo and `git clone` it on the server.

## 2. Configure environment

```bash
cp deploy/.env.production.example .env
nano .env
```

**Minimum required for boot:** `APP_SECRET` (`openssl rand -hex 32`), `DATABASE_URL`.
The file documents every variable and marks which are **[SECRET]**.

> **Keep `.env` out of the Docker build context is not required — the Dockerfile
> never copies `.env` into the image; it's injected at runtime with `--env-file`.**

## 3. Build & run

```bash
docker build -t resonance .
docker run -d \
  --name resonance \
  --restart unless-stopped \
  --env-file .env \
  -p 127.0.0.1:3019:3000 \
  resonance
```

Verify: `curl -i http://127.0.0.1:3019/` → expect `200 OK`.
Logs: `docker logs -f resonance`.

Rebuild after any update: `docker build -t resonance . && docker rm -f resonance && <run command above>`.

## 4. nginx

```bash
sudo cp deploy/nginx-resonanse.conf /etc/nginx/sites-available/resonanse
sudo ln -s /etc/nginx/sites-available/resonanse /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d resonanse.app -d www.resonanse.app
```

Open https://resonanse.app — done.

## 5. Database (Supabase) & migrations

The app runs on **Supabase Postgres**:

1. Create a free project at https://supabase.com (pick the region closest to your VPS).
2. Dashboard → **Project Settings → Database → Connection string** → copy the
   **Transaction pooler** string (port 6543) into `.env` as `DATABASE_URL`.
3. Apply the schema. Either paste `supabase/migrations/00000000000000_init.sql`
   into the Supabase **SQL Editor** and run it, or from the VPS:

```bash
npm ci --ignore-scripts
DATABASE_URL="postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres" \
  npx tsx scripts/apply-migration.mts supabase/migrations/00000000000000_init.sql
```

The script is idempotent (tolerates "already exists"), so re-running is safe.
Optional seed/demo data: `npx tsx db/seed.ts` (only for a fresh dev instance — never on production with real users).

## 6. Optional features

| Feature | How to enable |
|---|---|
| Password-reset + strike emails | Set `RESEND_API_KEY`, verify `resonanse.app` in Resend, set `EMAIL_FROM` |
| Google sign-in | Google Cloud OAuth client, set `GOOGLE_CLIENT_ID/SECRET`, add redirect `https://resonanse.app/api/auth/google/callback` |
| Chat translation + voice notes | `docker compose -f translate/docker-compose.yml up -d`, set the three `*_URL` vars |
| Game voice | LiveKit Cloud free project, set the three `LIVEKIT_*` vars |
| Scam domain feed | Set `URLHAUS_AUTH_KEY` (free from abuse.ch) |
| Wallet deposits | Set real `MERCHANT_XRP_ADDRESS` / `MERCHANT_BTC_ADDRESS` |

## Honest limitations on your own domain

- **Kimi login will not work on resonanse.app** — Kimi OAuth is bound to the Kimi-hosted
  deployment. Email/password (and Google, once configured) are the sign-in methods.
- The Kimi-hosted build at kimi.pro keeps working independently; the two deployments
  share nothing unless you point both at the same `DATABASE_URL`.
